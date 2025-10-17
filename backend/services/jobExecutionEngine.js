const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { XMLParser } = require('fast-xml-parser');
const { systemLogger } = require('../utils/logger');
const { validateSchemaConsistency, saveSchemaSnapshot, inferDataType } = require('./schemaService');
const { transformRow } = require('./transformationEngine');
const { executeAnomalyDetection } = require('./anomalyRulesEngine');
const { 
  downloadFileFromConnection, 
  uploadFileToConnection,
  listAndFilterFiles
} = require('../utils/cloudStorageFileList');
const { captureFileAudit, captureFileSchema } = require('./fileAuditService');
const crypto = require('crypto');

/**
 * Job Execution Engine
 * Handles execution of transformation mappings with comprehensive tracking and error handling
 */

/**
 * Create a new transformation job
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @param {Object} options - Optional metadata
 * @param {number} options.mappingGroupExecutionId - Mapping group execution ID if part of a group
 * @param {number} options.scheduleId - Schedule ID if triggered by a schedule
 * @returns {Promise<Object>} - Created job record
 */
async function createJob(pool, mappingId, userId, options = {}) {
  try {
    // Get mapping details
    const mappingResult = await pool.query(
      'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
      [mappingId]
    );
    
    if (mappingResult.rows.length === 0) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }
    
    const mapping = mappingResult.rows[0];
    const jobId = `JOB-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    const result = await pool.query(`
      INSERT INTO transformation_jobs (
        job_id, mapping_id, mapping_name, executed_by, status, 
        mapping_group_execution_id, schedule_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      jobId, 
      mappingId, 
      mapping.mapping_name, 
      userId, 
      'running',
      options.mappingGroupExecutionId || null,
      options.scheduleId || null
    ]);
    
    const transformationJobDbId = result.rows[0].id; // Get database ID for linking to audit
    
    systemLogger.info('Transformation job created', { 
      jobId, 
      mappingId, 
      mappingGroupExecutionId: options.mappingGroupExecutionId,
      scheduleId: options.scheduleId 
    });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error creating job:', error);
    throw error;
  }
}

/**
 * Log job execution details
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} details - Additional details
 */
async function logJobExecution(pool, jobId, level, message, details = {}) {
  try {
    await pool.query(`
      INSERT INTO transformation_logs (
        job_id, log_level, message, log_details
      ) VALUES ($1, $2, $3, $4)
    `, [jobId, level, message, JSON.stringify(details)]);
    
  } catch (error) {
    systemLogger.error('Error logging job execution:', error);
  }
}

/**
 * Update job status and statistics
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated job record
 */
async function updateJob(pool, jobId, updates) {
  try {
    // If end_time is being set, calculate duration_ms
    if (updates.end_time) {
      const jobResult = await pool.query(
        'SELECT start_time FROM transformation_jobs WHERE job_id = $1',
        [jobId]
      );
      
      if (jobResult.rows.length > 0) {
        const startTime = new Date(jobResult.rows[0].start_time);
        const endTime = new Date(updates.end_time);
        updates.duration_ms = endTime.getTime() - startTime.getTime();
      }
    }
    
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    values.push(jobId);
    
    const query = `
      UPDATE transformation_jobs
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error updating job:', error);
    throw error;
  }
}

/**
 * Execute a transformation mapping
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Job execution result
 */
async function executeTransformationJob(pool, mappingId, userId, options = {}) {
  const {
    runSchemaValidation = true,
    runProfilingChecks = true,
    dryRun = false,
    existingJob = null,
    mappingGroupExecutionId = null,
    scheduleId = null
  } = options;
  
  let job = existingJob;
  
  try {
    // Create job only if not provided
    if (!job) {
      job = await createJob(pool, mappingId, userId, {
        mappingGroupExecutionId,
        scheduleId
      });
    }
    const jobId = job.job_id;
    
    await logJobExecution(pool, jobId, 'info', 'Job execution started', { mappingId, userId });
    
    // Get mapping configuration
    const mapping = await getMappingConfig(pool, mappingId);
    
    // Step 1: Build full file path and find matching files from cloud storage
    const filePath = mapping.file_path || '';
    const fileNamePattern = mapping.file_name_pattern || mapping.source_file_pattern;
    
    // Build full pattern: file_path + file_name_pattern
    // Ensure exactly one separator between path and pattern
    let fullPattern;
    if (filePath) {
      const normalizedPath = filePath.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
      fullPattern = normalizedPath ? `${normalizedPath}/${fileNamePattern}` : fileNamePattern;
    } else {
      fullPattern = fileNamePattern;
    }
    
    // Check if this is a single file (no wildcards) or a pattern
    const isSingleFile = !fileNamePattern.includes('*') && !fileNamePattern.includes('?');
    
    await logJobExecution(pool, jobId, 'info', 'Finding matching files from cloud storage', { 
      file_path: filePath,
      file_name_pattern: fileNamePattern,
      full_pattern: fullPattern,
      is_single_file: isSingleFile,
      connection_id: mapping.source_connection_id
    });
    
    const cloudFiles = await listAndFilterFiles(
      pool, 
      mapping.source_connection_id, 
      fullPattern
    );
    
    if (cloudFiles.length === 0) {
      const errorMessage = isSingleFile 
        ? `File not found: ${fullPattern}. Please verify the file path and name are correct.`
        : `No files matched the pattern '${fullPattern}' in cloud storage`;
      
      await updateJob(pool, jobId, { 
        status: 'failed', 
        error_message: errorMessage,
        end_time: new Date()
      });
      
      await logJobExecution(pool, jobId, 'error', errorMessage, { 
        full_pattern: fullPattern,
        file_path: filePath,
        file_name_pattern: fileNamePattern
      });
      
      return { 
        jobId, 
        status: 'failed', 
        filesProcessed: 0,
        message: errorMessage
      };
    }
    
    await logJobExecution(pool, jobId, 'info', `Found ${cloudFiles.length} matching files in cloud storage`);
    
    // Convert cloud file objects to format expected by processFile
    const matchingFiles = cloudFiles.map(file => ({
      filename: file.filename,
      file_id: null, // Cloud files don't have DB file_id
      file_size: file.size,
      row_count: 0 // Will be determined during processing
    }));
    
    // Step 2: Schema validation for file patterns (multiple files)
    if (runSchemaValidation && !isSingleFile && cloudFiles.length > 1) {
      await logJobExecution(pool, jobId, 'info', 'Validating schema consistency across matched files');
      
      try {
        // Download first few bytes of each file to extract schema
        const schemas = [];
        for (const file of cloudFiles) {
          try {
            const { extractSchemaFromBuffer } = require('./schemaService');
            const fileBuffer = await downloadFileFromConnection(pool, mapping.source_connection_id, file.filename, { partial: true, maxBytes: 1024 * 1024 });
            const schema = await extractSchemaFromBuffer(fileBuffer, file.filename);
            schemas.push({ filename: file.filename, schema });
          } catch (err) {
            await logJobExecution(pool, jobId, 'warn', `Could not extract schema from ${file.filename}: ${err.message}`);
          }
        }
        
        // Check for schema mismatches
        if (schemas.length > 1) {
          const baseSchema = schemas[0].schema;
          const mismatches = [];
          
          for (let i = 1; i < schemas.length; i++) {
            const currentSchema = schemas[i].schema;
            const baseFields = baseSchema.map(f => f.name).sort().join(',');
            const currentFields = currentSchema.map(f => f.name).sort().join(',');
            
            if (baseFields !== currentFields) {
              mismatches.push({
                file: schemas[i].filename,
                baseFile: schemas[0].filename,
                baseFields: baseSchema.map(f => f.name),
                currentFields: currentSchema.map(f => f.name)
              });
            }
          }
          
          if (mismatches.length > 0) {
            const errorMessage = `Schema mismatch detected across ${mismatches.length} file(s). All files matching a pattern must have identical schemas.`;
            
            await updateJob(pool, jobId, { 
              status: 'failed', 
              error_message: errorMessage,
              end_time: new Date()
            });
            
            await logJobExecution(pool, jobId, 'error', errorMessage, { 
              mismatches,
              totalFilesChecked: schemas.length
            });
            
            return { 
              jobId, 
              status: 'failed', 
              filesProcessed: 0,
              message: errorMessage,
              details: mismatches
            };
          }
          
          await logJobExecution(pool, jobId, 'info', `Schema validation passed: All ${schemas.length} files have consistent schemas`);
        }
      } catch (schemaError) {
        await logJobExecution(pool, jobId, 'warn', `Schema validation error: ${schemaError.message}. Continuing with file processing.`);
      }
    }
    
    // Step 3: Process each file
    let totalRowsRead = 0;
    let totalRowsWritten = 0;
    let totalRowsFailed = 0;
    let filesProcessedSoFar = 0;
    
    for (const file of matchingFiles) {
      await logJobExecution(pool, jobId, 'info', `Processing file: ${file.filename}`, {
        fileId: file.file_id
      });
      
      try {
        const fileResult = await processFile(pool, file, mapping, jobId, { 
          dryRun, 
          transformationJobDbId, 
          userId 
        });
        
        totalRowsRead += fileResult.rowsRead;
        totalRowsWritten += fileResult.rowsWritten;
        totalRowsFailed += fileResult.rowsFailed;
        filesProcessedSoFar++;
        
        // Update job progress immediately after each file for real-time tracking
        await updateJob(pool, jobId, {
          files_processed: filesProcessedSoFar,
          rows_read: totalRowsRead,
          rows_written: totalRowsWritten,
          rows_failed: totalRowsFailed
        });
        
        await logJobExecution(pool, jobId, 'info', `File processed: ${file.filename}`, {
          fileId: file.file_id,
          rowsRead: fileResult.rowsRead,
          rowsWritten: fileResult.rowsWritten,
          rowsFailed: fileResult.rowsFailed,
          progressMessage: `Completed ${filesProcessedSoFar} of ${matchingFiles.length} files`
        });
        
        // Step 4: Run profiling and anomaly detection (if enabled)
        // Note: Skipped for cloud files without DB record, can be added in future
        if (runProfilingChecks && !dryRun && file.file_id) {
          await logJobExecution(pool, jobId, 'info', `Running profiling checks on: ${file.filename}`);
          
          const anomalyResults = await executeAnomalyDetection(pool, {
            fileId: file.file_id,
            filename: file.filename,
            filePattern: mapping.source_file_pattern,
            mappingId,
            jobId,
            runSchemaValidation
          });
          
          if (anomalyResults.totalAnomalies > 0) {
            await logJobExecution(pool, jobId, 'warn', 
              `Detected ${anomalyResults.totalAnomalies} anomalies in ${file.filename}`,
              anomalyResults.anomaliesByType
            );
          }
        }
        
      } catch (fileError) {
        totalRowsFailed += file.row_count || 0;
        
        await logJobExecution(pool, jobId, 'error', `File processing failed: ${file.filename}`, {
          fileId: file.file_id,
          error: fileError.message,
          stack: fileError.stack
        });
      }
    }
    
    // Update job with final statistics
    await updateJob(pool, jobId, {
      status: 'completed',
      files_processed: matchingFiles.length,
      rows_read: totalRowsRead,
      rows_written: totalRowsWritten,
      rows_failed: totalRowsFailed,
      end_time: new Date()
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job execution completed', {
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    });
    
    return {
      jobId,
      status: 'completed',
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    };
    
  } catch (error) {
    systemLogger.error('Job execution error:', error);
    
    if (job) {
      await updateJob(pool, job.job_id, {
        status: 'failed',
        error_message: error.message,
        end_time: new Date()
      });
      
      await logJobExecution(pool, job.job_id, 'error', 'Job execution failed', {
        error: error.message,
        stack: error.stack
      });
    }
    
    throw error;
  }
}

/**
 * Get mapping configuration
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} - Mapping configuration
 */
async function getMappingConfig(pool, mappingId) {
  const result = await pool.query(
    'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
    [mappingId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Mapping not found: ${mappingId}`);
  }
  
  return result.rows[0];
}

/**
 * Process a single file with transformations
 * @param {Pool} pool - Database connection pool
 * @param {Object} file - File record
 * @param {Object} mapping - Mapping configuration
 * @param {string} jobId - Job ID
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing result
 */
async function processFile(pool, file, mapping, jobId, options = {}) {
  const { dryRun = false, transformationJobDbId = null, userId = null } = options;
  
  let rowsRead = 0;
  let rowsWritten = 0;
  let rowsFailed = 0;
  const transformedRows = [];
  
  try {
    // Step 1: Download file from source cloud storage
    await logJobExecution(pool, jobId, 'info', `Downloading file: ${file.filename}`, {
      source_connection_id: mapping.source_connection_id
    });
    
    const fileBuffer = await downloadFileFromConnection(
      pool, 
      mapping.source_connection_id, 
      file.filename
    );
    
    await logJobExecution(pool, jobId, 'info', `File downloaded: ${file.filename}`, {
      size: fileBuffer.length
    });
    
    // Step 2: Determine file type from filename
    const fileExtension = file.filename.split('.').pop().toLowerCase();
    
    // Step 3: Parse file and apply transformations
    await logJobExecution(pool, jobId, 'info', `Parsing and transforming ${fileExtension.toUpperCase()} file`, {
      filename: file.filename,
      field_mappings_count: mapping.field_mappings?.length || 0
    });
    
    let parseResult;
    
    if (fileExtension === 'csv') {
      parseResult = await parseAndTransformCSV(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
    } else if (fileExtension === 'json') {
      parseResult = await parseAndTransformJSON(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      parseResult = await parseAndTransformXLSX(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
    } else if (fileExtension === 'parquet') {
      parseResult = await parseAndTransformParquet(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
    } else if (fileExtension === 'xml') {
      parseResult = await parseAndTransformXML(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}. Supported types: CSV, JSON, XLSX, XLS, Parquet, XML`);
    }
    
    // Extract results from parseResult
    rowsRead = parseResult.rowsRead;
    rowsWritten = parseResult.rowsWritten;
    rowsFailed = parseResult.rowsFailed;
    transformedRows.push(...parseResult.transformedRows);
    
    await logJobExecution(pool, jobId, 'info', `Transformation complete`, {
      rows_read: rowsRead,
      rows_transformed: transformedRows.length,
      rows_failed: rowsFailed
    });
    
    // Step 4: Upload transformed data to target (if not dry run)
    if (!dryRun && transformedRows.length > 0 && mapping.target_connection_id) {
      // Determine output format (default to csv if not specified)
      // Normalize to lowercase to handle UI dropdown values like "CSV", "JSON", etc.
      const outputFormat = (mapping.output_format || 'csv').toLowerCase().trim();
      
      await logJobExecution(pool, jobId, 'info', 
        `Uploading transformed data to target`, {
        target_connection_id: mapping.target_connection_id,
        rows: transformedRows.length,
        output_format: outputFormat
      });
      
      // Generate output filename with correct extension
      const outputFilename = generateOutputFilename(file.filename, mapping.mapping_name, outputFormat);
      
      // Convert transformed rows to specified output format
      const outputBuffer = await convertToFormat(transformedRows, outputFormat);
      
      await logJobExecution(pool, jobId, 'info', 
        `Converted data to ${outputFormat.toUpperCase()} format`, {
        buffer_size: outputBuffer.length
      });
      
      // Upload to target connection
      const uploadResult = await uploadFileToConnection(
        pool,
        mapping.target_connection_id,
        outputFilename,
        outputBuffer
      );
      
      await logJobExecution(pool, jobId, 'info', 
        `Data uploaded to target: ${uploadResult.location}`
      );
      
      // Step 5: Capture file audit for transformation job
      try {
        const correlationId = uuidv4();
        
        // Calculate source file hash
        const sourceFileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        // Extract schema from transformed rows (if we have any)
        const outputSchema = transformedRows.length > 0 
          ? Object.keys(transformedRows[0]).map(key => ({
              name: key,
              type: inferDataType(transformedRows[0][key])
            }))
          : [];
        
        // Capture schema for output file
        const schemaResult = await captureFileSchema(pool, {
          fileId: `transformed_${jobId}_${file.filename}`,
          fileName: outputFilename,
          fileSchema: {
            columns: outputSchema,
            encoding: 'utf-8',
            delimiter: outputFormat === 'csv' ? ',' : null
          },
          correlationId,
          createdBy: null // System-generated transformation
        });
        
        // Capture source file audit
        const sourceAuditId = await captureFileAudit(pool, {
          fileId: file.file_id || `source_${file.filename}`,
          fileName: file.filename,
          fileSchemaId: null, // Source schema not tracked here
          fileHash: sourceFileHash,
          filePattern: mapping.source_file_pattern || mapping.file_name_pattern,
          fileType: fileExtension,
          fileDelimiter: fileExtension === 'csv' ? ',' : null,
          encoding: 'utf-8',
          numberOfColumns: null,
          fileSizeBytes: fileBuffer.length,
          source: 'transformation',
          sourcePath: file.filename,
          noOfRecordsInSource: rowsRead,
          loadStep1: 'download',
          loadStep1Path: file.filename,
          loadStep1RecCnt: rowsRead,
          loadType: 'etl_transformation',
          correlationId,
          transformationJobId: transformationJobDbId,
          userId: userId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: userId
        });
        
        // Capture target file audit (output file)
        await captureFileAudit(pool, {
          fileId: `transformed_${jobId}_${file.filename}`,
          fileName: outputFilename,
          fileSchemaId: schemaResult.schemaId,
          fileHash: crypto.createHash('sha256').update(outputBuffer).digest('hex'),
          filePattern: null,
          fileType: outputFormat,
          fileDelimiter: outputFormat === 'csv' ? ',' : null,
          encoding: 'utf-8',
          numberOfColumns: outputSchema.length,
          fileSizeBytes: outputBuffer.length,
          source: 'transformation',
          sourcePath: file.filename,
          noOfRecordsInSource: rowsRead,
          loadStep1: 'transformation',
          loadStep1Path: outputFilename,
          loadStep1RecCnt: rowsWritten,
          loadStep2: 'upload',
          loadStep2Path: uploadResult.location,
          loadStep2RecCnt: rowsWritten,
          loadType: 'etl_transformation',
          parentAuditId: sourceAuditId,
          correlationId,
          transformationJobId: transformationJobDbId,
          userId: userId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: null
        });
        
        await logJobExecution(pool, jobId, 'info', 
          `File audit captured for transformation`, {
          correlationId,
          sourceFile: file.filename,
          targetFile: outputFilename
        });
      } catch (auditError) {
        // Log but don't fail the job if audit fails
        await logJobExecution(pool, jobId, 'warn', 
          `File audit capture failed: ${auditError.message}`, {
          error: auditError.stack
        });
      }
    }
    
    return {
      rowsRead,
      rowsWritten,
      rowsFailed
    };
    
  } catch (error) {
    await logJobExecution(pool, jobId, 'error', 
      `File processing error: ${file.filename}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Convert database field mapping format to transformRow expected format
 * @param {Array} dbFieldMappings - Field mappings from database
 * @returns {Array} - Converted field mappings for transformRow
 */
function convertFieldMappings(dbFieldMappings) {
  if (!dbFieldMappings || dbFieldMappings.length === 0) {
    return [];
  }
  
  return dbFieldMappings.map(mapping => {
    // Handle source_field - it can be a string, array, or null from JSONB storage
    let sourceFields = [];
    if (mapping.source_field) {
      if (Array.isArray(mapping.source_field)) {
        sourceFields = mapping.source_field;
      } else {
        sourceFields = [mapping.source_field];
      }
    }
    
    const converted = {
      targetField: mapping.target_field,
      sourceFields: sourceFields,
      transformations: []
    };
    
    // Convert transformation if present
    if (mapping.transformation && mapping.transformation !== 'none') {
      converted.transformations.push({
        type: mapping.transformation,
        params: mapping.transformation_params || {}
      });
    }
    
    return converted;
  });
}

/**
 * Parse CSV and apply transformations
 */
async function parseAndTransformCSV(buffer, fieldMappings, jobId, pool) {
  return new Promise((resolve, reject) => {
    const transformedRows = [];
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    let firstRow = null;
    
    // Convert field mappings to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    
    const stream = Readable.from(buffer);
    
    stream
      .pipe(csv())
      .on('data', (row) => {
        rowsRead++;
        
        // Log first row for debugging (only column names, not data)
        if (rowsRead === 1) {
          firstRow = row;
          systemLogger.info('CSV first row columns:', { 
            columns: Object.keys(row),
            fieldMappingsCount: convertedMappings?.length || 0
          });
          systemLogger.info('Converted field mappings sample:', {
            sample: convertedMappings.slice(0, 3)
          });
        }
        
        try {
          const transformedRow = transformRow(row, convertedMappings);
          
          // Debug first transformed row
          if (rowsRead === 1) {
            systemLogger.info('First transformed row structure:', {
              keys: Object.keys(transformedRow),
              valueTypes: Object.keys(transformedRow).reduce((acc, key) => {
                acc[key] = typeof transformedRow[key];
                return acc;
              }, {})
            });
          }
          
          // Check if transformedRow has any data
          if (Object.keys(transformedRow).length === 0) {
            systemLogger.warn('Transformed row is empty', {
              rowNumber: rowsRead,
              columnCount: Object.keys(row).length
            });
          }
          
          transformedRows.push(transformedRow);
          rowsWritten++;
        } catch (error) {
          rowsFailed++;
          systemLogger.error('Row transformation error', { 
            row: rowsRead, 
            error: error.message
          });
        }
      })
      .on('end', () => {
        systemLogger.info('CSV parsing complete', {
          rowsRead,
          rowsWritten,
          rowsFailed,
          transformedRowsCount: transformedRows.length,
          hasData: transformedRows.length > 0
        });
        
        resolve({ 
          transformedRows, 
          rowsRead, 
          rowsWritten, 
          rowsFailed 
        });
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
  });
}

/**
 * Parse JSON and apply transformations
 */
async function parseAndTransformJSON(buffer, fieldMappings, jobId, pool) {
  try {
    const jsonData = JSON.parse(buffer.toString());
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    
    const transformedRows = [];
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    
    for (const row of dataArray) {
      rowsRead++;
      try {
        const transformedRow = transformRow(row, convertedMappings);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows, 
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`JSON parsing error: ${error.message}`);
  }
}

/**
 * Parse XLSX (Excel) and apply transformations
 */
async function parseAndTransformXLSX(buffer, fieldMappings, jobId, pool) {
  try {
    // Parse XLSX file
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    
    const transformedRows = [];
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    
    for (const row of jsonData) {
      rowsRead++;
      try {
        const transformedRow = transformRow(row, convertedMappings);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows, 
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`XLSX parsing error: ${error.message}`);
  }
}

/**
 * Parse Parquet and apply transformations
 */
async function parseAndTransformParquet(buffer, fieldMappings, jobId, pool) {
  try {
    // Dynamic import for hyparquet (ES module)
    const { parquetReadObjects } = await import('hyparquet');
    
    // Convert Node.js Buffer to ArrayBuffer for hyparquet
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset, 
      buffer.byteOffset + buffer.byteLength
    );
    
    // Convert field mappings to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    
    const transformedRows = [];
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    systemLogger.info('Parquet parsing started');
    
    // Read parquet file as async iterator
    const parquetIterator = await parquetReadObjects({ file: arrayBuffer });
    
    // Consume async iterator properly
    for await (const row of parquetIterator) {
      rowsRead++;
      try {
        // Log first row for debugging
        if (rowsRead === 1) {
          systemLogger.info('Parquet first row columns:', { 
            columns: Object.keys(row),
            sample: Object.keys(row).slice(0, 5)
          });
        }
        
        const transformedRow = transformRow(row, convertedMappings);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    systemLogger.info('Parquet parsing complete', {
      rowsRead,
      rowsWritten,
      rowsFailed
    });
    
    return { 
      transformedRows, 
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    systemLogger.error('Parquet parsing error:', error);
    throw new Error(`Parquet parsing error: ${error.message}`);
  }
}

/**
 * Flatten nested object into dot notation
 * Example: { user: { name: 'John', address: { city: 'NYC' } } }
 * becomes: { 'user.name': 'John', 'user.address.city': 'NYC' }
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        // Convert arrays to comma-separated strings
        flattened[newKey] = value.join(', ');
      } else {
        // Primitive value or null
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

/**
 * Parse XML and apply transformations
 * Supports hierarchical XML with recursive flattening
 */
async function parseAndTransformXML(buffer, fieldMappings, jobId, pool) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    const xmlData = parser.parse(buffer.toString());
    
    // Extract records - assume root element contains array of records
    // Handle common XML structures
    let records = [];
    const rootKeys = Object.keys(xmlData);
    if (rootKeys.length > 0) {
      const rootElement = xmlData[rootKeys[0]];
      if (Array.isArray(rootElement)) {
        records = rootElement;
      } else if (typeof rootElement === 'object') {
        // Find first array property in root
        const arrayKey = Object.keys(rootElement).find(key => Array.isArray(rootElement[key]));
        if (arrayKey) {
          records = rootElement[arrayKey];
        } else {
          records = [rootElement]; // Single record
        }
      }
    }
    
    const transformedRows = [];
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    
    for (const row of records) {
      rowsRead++;
      try {
        // Flatten nested XML structure before transformation
        const flattenedRow = flattenObject(row);
        
        // Log first flattened row for debugging
        if (rowsRead === 1) {
          systemLogger.info('XML first row (flattened):', { 
            keys: Object.keys(flattenedRow),
            sample: Object.keys(flattenedRow).slice(0, 5)
          });
        }
        
        const transformedRow = transformRow(flattenedRow, convertedMappings);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows, 
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`XML parsing error: ${error.message}`);
  }
}

/**
 * Generate output filename with correct extension based on output format
 */
function generateOutputFilename(inputFilename, mappingName, outputFormat = 'csv') {
  // Remove original extension
  const nameWithoutExt = inputFilename.replace(/\.[^/.]+$/, '');
  
  // Add new extension based on output format
  const extension = outputFormat.toLowerCase();
  return `${nameWithoutExt}.${extension}`;
}

/**
 * Convert transformed rows to specified format
 */
async function convertToFormat(rows, format = 'csv') {
  if (rows.length === 0) return Buffer.from('');
  
  const formatLower = format.toLowerCase();
  
  switch (formatLower) {
    case 'csv':
      return convertToCSV(rows);
    case 'json':
      return convertToJSON(rows);
    case 'xlsx':
      return convertToXLSX(rows);
    case 'parquet':
      return convertToParquet(rows);
    default:
      systemLogger.warn(`Unsupported output format: ${format}, defaulting to CSV`);
      return convertToCSV(rows);
  }
}

/**
 * Convert transformed rows to CSV format
 */
function convertToCSV(rows) {
  if (rows.length === 0) return Buffer.from('');
  
  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Build CSV string
  let csv = headers.join(',') + '\n';
  
  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Escape values containing commas or quotes
      if (value.toString().includes(',') || value.toString().includes('"')) {
        return `"${value.toString().replace(/"/g, '""')}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  }
  
  return Buffer.from(csv);
}

/**
 * Convert transformed rows to JSON format
 */
function convertToJSON(rows) {
  if (rows.length === 0) return Buffer.from('[]');
  
  const jsonString = JSON.stringify(rows, null, 2);
  return Buffer.from(jsonString);
}

/**
 * Convert transformed rows to XLSX (Excel) format
 */
function convertToXLSX(rows) {
  if (rows.length === 0) {
    // Create empty workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([]);
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
  
  // Convert rows to worksheet
  const ws = xlsx.utils.json_to_sheet(rows);
  
  // Create workbook and add worksheet
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  
  // Write to buffer
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

/**
 * Convert transformed rows to Parquet format
 * Note: Parquet writing requires hyparquet-writer which may not be available
 */
async function convertToParquet(rows) {
  try {
    // Try to use hyparquet-writer if available
    const { writeParquet } = await import('hyparquet-writer');
    
    // Write parquet file
    const buffer = await writeParquet(rows);
    return Buffer.from(buffer);
    
  } catch (error) {
    systemLogger.warn('Parquet writing not available, falling back to JSON', {
      error: error.message
    });
    // Fallback to JSON if parquet writer not available
    return convertToJSON(rows);
  }
}

/**
 * Get job status
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status with logs
 */
async function getJobStatus(pool, jobId) {
  try {
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const logsResult = await pool.query(
      'SELECT * FROM transformation_logs WHERE job_id = $1 ORDER BY timestamp ASC',
      [jobId]
    );
    
    return {
      job: jobResult.rows[0],
      logs: logsResult.rows
    };
    
  } catch (error) {
    systemLogger.error('Error getting job status:', error);
    throw error;
  }
}

/**
 * Cancel a running job
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Updated job record
 */
async function cancelJob(pool, jobId) {
  try {
    // Check current job status
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const currentStatus = jobResult.rows[0].status;
    
    // Check if job is in a terminal state
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      const error = new Error(`Cannot cancel job: Job is already ${currentStatus}`);
      error.statusCode = 409; // Conflict
      throw error;
    }
    
    // Only cancel if job is in a cancellable state (pending, running)
    const result = await updateJob(pool, jobId, {
      status: 'cancelled',
      end_time: new Date()
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job cancelled by user');
    
    systemLogger.info('Job cancelled', { jobId, previousStatus: currentStatus });
    
    return result;
    
  } catch (error) {
    systemLogger.error('Error cancelling job:', error);
    throw error;
  }
}

module.exports = {
  createJob,
  executeTransformationJob,
  getJobStatus,
  updateJob,
  cancelJob,
  logJobExecution,
  getMappingConfig,
  processFile
};
