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
const { profileETLOutputFile, profileETLFile } = require('./etlProfilingService');
const { profileFileBuffer, downloadAndProfileFile } = require('./transformationProfilingService');
const crypto = require('crypto');

/**
 * Replace dynamic placeholders in file name with actual values
 * @param {string} fileName - File name with placeholders
 * @returns {string} - File name with replaced values
 */
function replacePlaceholders(fileName) {
  if (!fileName) return fileName;
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const timestampStr = Math.floor(now.getTime() / 1000).toString(); // Unix timestamp
  
  return fileName
    .replace(/<current_date>/g, dateStr)
    .replace(/<current_timestamp>/g, timestampStr);
}

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
 * @param {number} options.workflowExecutionId - Workflow execution ID if part of a workflow
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
    const correlationId = uuidv4(); // Generate correlation ID for source/target file linking
    
    const result = await pool.query(`
      INSERT INTO transformation_jobs (
        job_id, mapping_id, mapping_name, executed_by, status, 
        mapping_group_execution_id, schedule_id, workflow_execution_id, project_id, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      jobId, 
      mappingId, 
      mapping.mapping_name, 
      userId, 
      'running',
      options.mappingGroupExecutionId || null,
      options.scheduleId || null,
      options.workflowExecutionId || null,
      mapping.project_id,
      correlationId
    ]);
    
    const transformationJobDbId = result.rows[0].id; // Get database ID for linking to audit
    
    systemLogger.info('Transformation job created', { 
      jobId, 
      mappingId, 
      mappingGroupExecutionId: options.mappingGroupExecutionId,
      scheduleId: options.scheduleId,
      workflowExecutionId: options.workflowExecutionId
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
    scheduleId = null,
    workflowExecutionId = null
  } = options;
  
  let job = existingJob;
  
  try {
    // Create job only if not provided
    if (!job) {
      job = await createJob(pool, mappingId, userId, {
        mappingGroupExecutionId,
        scheduleId,
        workflowExecutionId
      });
    }
    const jobId = job.job_id;
    const transformationJobDbId = job.id; // Database ID for linking to audit
    
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
  
  const mapping = result.rows[0];
  
  // If using vendor agreement, fetch the connection ID from the agreement
  if (mapping.vendor_agreement_id) {
    const agreementResult = await pool.query(
      'SELECT vendor_connection_id FROM vendor_agreements WHERE id = $1',
      [mapping.vendor_agreement_id]
    );
    
    if (agreementResult.rows.length === 0) {
      throw new Error(`Vendor agreement not found: ${mapping.vendor_agreement_id}`);
    }
    
    // Set the source_connection_id to the vendor's connection ID for job execution
    mapping.source_connection_id = agreementResult.rows[0].vendor_connection_id;
  }
  
  return mapping;
}

/**
 * Calculate column statistics from transformed rows
 * @param {Array} rows - Array of transformed data rows
 * @param {Array} schema - Schema definition with column names and types
 * @returns {Object} - Column statistics object keyed by column name
 */
function calculateColumnStatistics(rows, schema) {
  const stats = {};
  
  if (!rows || rows.length === 0 || !schema) {
    return stats;
  }

  // Initialize stats for each column
  schema.forEach(col => {
    stats[col.name] = {
      total_count: rows.length,
      null_count: 0,
      unique_values: new Set(),
      numeric_sum: 0,
      numeric_min: null,
      numeric_max: null,
      string_lengths: [],
      string_values: []  // Track all string values to find shortest/longest
    };
  });

  // Process each row to collect statistics
  rows.forEach(row => {
    schema.forEach(col => {
      const value = row[col.name];
      const colStats = stats[col.name];

      // Count nulls
      if (value === null || value === undefined || value === '') {
        colStats.null_count++;
        return;
      }

      // Track unique values
      colStats.unique_values.add(String(value));

      // Numeric statistics
      if (col.type && (col.type.includes('integer') || col.type.includes('float') || 
          col.type.includes('number') || col.type.includes('decimal'))) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          colStats.numeric_sum += numValue;
          colStats.numeric_min = colStats.numeric_min === null ? numValue : Math.min(colStats.numeric_min, numValue);
          colStats.numeric_max = colStats.numeric_max === null ? numValue : Math.max(colStats.numeric_max, numValue);
        }
      }

      // String statistics
      if (typeof value === 'string') {
        colStats.string_lengths.push(value.length);
        colStats.string_values.push(value);
      }
    });
  });

  // Finalize statistics
  schema.forEach(col => {
    const colStats = stats[col.name];
    
    // Calculate averages
    const nonNullCount = colStats.total_count - colStats.null_count;
    if (nonNullCount > 0 && colStats.numeric_sum !== 0) {
      colStats.numeric_avg = colStats.numeric_sum / nonNullCount;
    }

    // Calculate string length stats and find shortest/longest strings
    if (colStats.string_lengths.length > 0 && colStats.string_values.length > 0) {
      colStats.string_min_length = Math.min(...colStats.string_lengths);
      colStats.string_max_length = Math.max(...colStats.string_lengths);
      
      // Find shortest and longest strings by length
      const minLengthIdx = colStats.string_lengths.indexOf(colStats.string_min_length);
      const maxLengthIdx = colStats.string_lengths.indexOf(colStats.string_max_length);
      colStats.string_min_value = colStats.string_values[minLengthIdx];
      colStats.string_max_value = colStats.string_values[maxLengthIdx];
    }

    // Convert unique values set to count
    colStats.unique_count = colStats.unique_values.size;
    
    // Remove temporary data
    delete colStats.unique_values;
    delete colStats.string_lengths;
    delete colStats.string_values;

    // Clean up null values in numeric fields
    if (colStats.numeric_min === null) delete colStats.numeric_min;
    if (colStats.numeric_max === null) delete colStats.numeric_max;
    if (!colStats.numeric_avg) delete colStats.numeric_avg;
    if (colStats.numeric_sum === 0) delete colStats.numeric_sum;
    
    // Clean up empty string fields
    if (!colStats.string_min_length) delete colStats.string_min_length;
    if (!colStats.string_max_length) delete colStats.string_max_length;
    if (!colStats.string_min_value) delete colStats.string_min_value;
    if (!colStats.string_max_value) delete colStats.string_max_value;
  });

  return stats;
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
  
  // Get correlation_id from job record for source/target file linking
  const jobResult = await pool.query('SELECT correlation_id FROM transformation_jobs WHERE job_id = $1', [jobId]);
  const correlationId = jobResult.rows[0]?.correlation_id;
  
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
        mapping.variables,
        jobId, 
        pool
      );
    } else if (fileExtension === 'json') {
      parseResult = await parseAndTransformJSON(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool
      );
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      parseResult = await parseAndTransformXLSX(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool
      );
    } else if (fileExtension === 'parquet') {
      parseResult = await parseAndTransformParquet(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool
      );
    } else if (fileExtension === 'xml') {
      parseResult = await parseAndTransformXML(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
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
    
    // Create execution timestamp for profiling correlation (used for both source and target)
    const executionTimestamp = new Date();
    
    // Step 3.5: Profile SOURCE file using Python profilers (same as file upload)
    // This downloads and profiles the actual S3 file instead of in-memory data
    // IMPORTANT: Use the same file_id that will be used in audit records for proper joining
    if (!dryRun && fileBuffer && fileBuffer.length > 0) {
      const sourceFileId = file.file_id || `source_${file.filename}`;
      
      try {
        await logJobExecution(pool, jobId, 'info', 
          `Profiling SOURCE file using Python profilers (matching file upload flow)`, {
          filename: file.filename,
          fileSize: fileBuffer.length,
          sourceFileId
        });
        
        // Profile source file buffer using Python scripts (same as file upload)
        const sourceProfilingResult = await profileFileBuffer({
          fileBuffer,
          filename: file.filename,
          fileType: fileExtension,
          pool,
          fileId: sourceFileId,
          fileRole: 'source',
          mappingId: mapping.mapping_id,
          jobId,
          userId,
          projectId: mapping.project_id
        });
        
        if (sourceProfilingResult.success) {
          await logJobExecution(pool, jobId, 'info', 
            `SOURCE file profiling completed`, {
            fileId: sourceFileId,
            fileRole: 'source',
            rowCount: sourceProfilingResult.rowCount,
            columnCount: sourceProfilingResult.columnCount,
            qualityScore: sourceProfilingResult.qualityScore
          });
        } else {
          await logJobExecution(pool, jobId, 'warn', 
            `SOURCE file profiling failed: ${sourceProfilingResult.error}`, {
            fileId: sourceFileId,
            fileRole: 'source'
          });
        }
      } catch (sourceProfilingError) {
        // Log but don't fail the job if source profiling fails
        await logJobExecution(pool, jobId, 'warn', 
          `SOURCE file profiling failed: ${sourceProfilingError.message}`, {
          error: sourceProfilingError.stack
        });
      }
    }
    
    // Step 4: Upload transformed data to target (if not dry run)
    if (!dryRun && transformedRows.length > 0 && mapping.target_connection_id) {
      // Determine output format (use target_file_format from mapping, default to csv)
      const outputFormat = (mapping.target_file_format || mapping.output_format || 'csv').toLowerCase().trim();
      
      await logJobExecution(pool, jobId, 'info', 
        `Uploading transformed data to target`, {
        target_connection_id: mapping.target_connection_id,
        rows: transformedRows.length,
        output_format: outputFormat
      });
      
      // Generate output filename with correct extension
      let outputFilename;
      if (mapping.target_file_name) {
        // Use custom target file name with placeholder replacement
        outputFilename = replacePlaceholders(mapping.target_file_name);
        // Ensure it has the correct extension
        if (!outputFilename.endsWith(`.${outputFormat}`)) {
          outputFilename = `${outputFilename.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
        }
      } else {
        // Generate default filename
        outputFilename = generateOutputFilename(file.filename, mapping.mapping_name, outputFormat);
      }
      
      // Prepend target file path if specified (for directory/folder structure in cloud storage)
      if (mapping.target_file_path) {
        const normalizedPath = mapping.target_file_path.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
        outputFilename = normalizedPath ? `${normalizedPath}/${outputFilename}` : outputFilename;
      }
      
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
        // Use correlation_id from job record (retrieved at start of function)
        // This links source and target files together
        
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
          mappingName: mapping.mapping_name,
          userId: userId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: userId,
          fileRole: 'source'
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
          loadStep1: 'upload',
          loadStep1Path: uploadResult.location,
          loadStep1RecCnt: rowsWritten,
          loadType: 'etl_transformation',
          parentAuditId: sourceAuditId,
          correlationId,
          transformationJobId: transformationJobDbId,
          mappingName: mapping.mapping_name,
          userId: userId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: null,
          fileRole: 'target'
        });
        
        await logJobExecution(pool, jobId, 'info', 
          `File audit captured for transformation`, {
          correlationId,
          sourceFile: file.filename,
          targetFile: outputFilename
        });
        
        // Create transformation lineage record (only if schema changed)
        try {
          const { generateSchemaFingerprint } = require('../utils/schemaFingerprint');
          
          // Build source schema from field mappings
          const sourceFields = new Set();
          if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
            mapping.field_mappings.forEach(fieldMapping => {
              if (fieldMapping.sourceFields && Array.isArray(fieldMapping.sourceFields)) {
                fieldMapping.sourceFields.forEach(sf => sourceFields.add(sf));
              }
            });
          }
          
          const sourceSchema = Array.from(sourceFields).map(name => ({
            name,
            type: 'string' // Type will be inferred from actual data
          }));
          
          // Generate schema fingerprints
          const sourceFingerprint = generateSchemaFingerprint(sourceSchema);
          const targetFingerprint = generateSchemaFingerprint(outputSchema);
          const combinedFingerprint = crypto.createHash('sha256')
            .update(sourceFingerprint + '_to_' + targetFingerprint)
            .digest('hex');
          
          // Check if lineage with same schema already exists for this mapping
          const existingLineageCheck = await pool.query(`
            SELECT id, schema_fingerprint 
            FROM transformation_lineage 
            WHERE mapping_id = $1 
              AND lineage_type = 'file-specific'
              AND schema_fingerprint = $2
            ORDER BY created_at DESC 
            LIMIT 1
          `, [mapping.mapping_id, combinedFingerprint]);
          
          if (existingLineageCheck.rows.length > 0) {
            // Schema unchanged - skip creating duplicate lineage
            await logJobExecution(pool, jobId, 'info', 
              `Lineage skipped - schema unchanged`, {
              mappingId: mapping.mapping_id,
              existingLineageId: existingLineageCheck.rows[0].id,
              schemaFingerprint: combinedFingerprint
            });
          } else {
            // Schema changed or first time - create lineage record
            const lineageQuery = `
              INSERT INTO transformation_lineage (
                transformation_id, 
                mapping_id,
                input_file_id, 
                output_file_id, 
                execution_id,
                schema_fingerprint,
                lineage_type,
                source_schema,
                target_schema,
                created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
              RETURNING id
            `;
            
            const lineageResult = await pool.query(lineageQuery, [
              mapping.transformation_id || `transform_${mapping.mapping_id}`,
              mapping.mapping_id,
              file.file_id || `source_${file.filename}`,
              `transformed_${jobId}_${file.filename}`,
              transformationJobDbId,
              combinedFingerprint,
              'file-specific',
              JSON.stringify(sourceSchema),
              JSON.stringify(outputSchema)
            ]);
            
            await logJobExecution(pool, jobId, 'info', 
              `Transformation lineage created`, {
              lineageId: lineageResult.rows[0]?.id,
              mappingId: mapping.mapping_id,
              inputFile: file.filename,
              outputFile: outputFilename,
              schemaFingerprint: combinedFingerprint,
              sourceFieldsCount: sourceSchema.length,
              targetFieldsCount: outputSchema.length
            });
          }
        } catch (lineageError) {
          // Log but don't fail the job if lineage creation fails
          await logJobExecution(pool, jobId, 'warn', 
            `Transformation lineage creation failed: ${lineageError.message}`, {
            error: lineageError.stack
          });
        }

        // Step 6: Profile the TARGET file using Python profilers (same as file upload)
        // Profile in-memory buffer to avoid redundant S3 download (performance optimization)
        try {
          await logJobExecution(pool, jobId, 'info', 
            `Profiling TARGET file from in-memory buffer using Python profilers`, {
            filename: outputFilename,
            fileRole: 'target',
            bufferSize: outputBuffer.length
          });

          // Profile the in-memory outputBuffer directly (avoids redundant S3 download)
          const targetProfilingResult = await profileFileBuffer({
            pool,
            fileBuffer: outputBuffer,
            filename: outputFilename,
            fileType: outputFormat,
            fileId: `transformed_${jobId}_${file.filename}`,
            fileRole: 'target',
            mappingId: mapping.mapping_id,
            jobId,
            userId,
            projectId: mapping.project_id
          });

          if (targetProfilingResult.success) {
            await logJobExecution(pool, jobId, 'info', 
              `TARGET file profiling completed`, {
              fileId: targetProfilingResult.fileId,
              fileRole: 'target',
              rowCount: targetProfilingResult.rowCount,
              columnCount: targetProfilingResult.columnCount,
              qualityScore: targetProfilingResult.qualityScore
            });
          } else {
            await logJobExecution(pool, jobId, 'warn', 
              `TARGET file profiling failed: ${targetProfilingResult.error}`, {
              fileRole: 'target'
            });
          }
        } catch (profilingError) {
          // Log but don't fail the job if profiling fails
          await logJobExecution(pool, jobId, 'warn', 
            `TARGET file profiling failed: ${profilingError.message}`, {
            error: profilingError.stack
          });
        }
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
  
  const { parseExpressionToTransformation, evaluateTransformationConfig } = require('./expressionParser');
  
  return dbFieldMappings.map(mapping => {
    const converted = {
      targetField: mapping.target_field,
      sourceFields: [],
      transformations: []
    };
    
    // NEW FORMAT: expression field (from visual builder)
    if (mapping.expression) {
      try {
        const transformConfig = parseExpressionToTransformation(mapping.expression);
        
        if (transformConfig) {
          const { sourceFields, transformations } = evaluateTransformationConfig(transformConfig);
          converted.sourceFields = sourceFields;
          converted.transformations = transformations;
        }
      } catch (error) {
        systemLogger.error('Expression parsing failed for mapping:', {
          target_field: mapping.target_field,
          expression: mapping.expression,
          error: error.message
        });
        // Fall through to legacy format or empty
      }
    } 
    // LEGACY FORMAT: transformation + transformation_params
    else if (mapping.transformation && mapping.transformation !== 'none') {
      // Handle source_field - it can be a string, array, or null from JSONB storage
      if (mapping.source_field) {
        if (Array.isArray(mapping.source_field)) {
          converted.sourceFields = mapping.source_field;
        } else {
          converted.sourceFields = [mapping.source_field];
        }
      }
      
      // Normalize transformation name (handle hyphenated and uppercase variants)
      let transformationType = mapping.transformation.toLowerCase().replace(/-/g, '_');
      
      // Map common UI names to engine names
      const legacyTypeMap = {
        'cast_string': 'cast',
        'cast_integer': 'cast',
        'cast_float': 'cast',
        'cast_boolean': 'cast',
        'null_to_value': 'null_to_value',
        'trim': 'trim',
        'round': 'round',
        'ceil': 'ceil',
        'floor': 'floor',
        'upper': 'upper',
        'lower': 'lower'
      };
      
      transformationType = legacyTypeMap[transformationType] || transformationType;
      
      // Adjust params based on type
      let params = { ...(mapping.transformation_params || {}) };
      if (transformationType === 'cast') {
        // Infer target type from original transformation name
        const originalName = mapping.transformation.toLowerCase().replace(/-/g, '_');
        if (originalName.includes('string')) params.targetType = 'string';
        else if (originalName.includes('integer')) params.targetType = 'integer';
        else if (originalName.includes('float')) params.targetType = 'float';
        else if (originalName.includes('boolean')) params.targetType = 'boolean';
        else if (!params.targetType) params.targetType = 'string';
      } else if (transformationType === 'null_to_value' && params.value && !params.defaultValue) {
        // Map 'value' param to 'defaultValue'
        params.defaultValue = params.value;
        delete params.value;
      }
      
      converted.transformations.push({
        type: transformationType,
        params
      });
    }
    // SIMPLE PASS-THROUGH: just source to target
    else if (mapping.source_field) {
      if (Array.isArray(mapping.source_field)) {
        converted.sourceFields = mapping.source_field;
      } else {
        converted.sourceFields = [mapping.source_field];
      }
    }
    
    return converted;
  });
}

/**
 * Convert database variable definitions to transformRow expected format
 * @param {Array} dbVariables - Variables from database
 * @returns {Array} - Converted variables for transformRow
 */
function convertVariables(dbVariables) {
  if (!dbVariables || dbVariables.length === 0) {
    return [];
  }
  
  const { parseExpressionToTransformation, evaluateTransformationConfig } = require('./expressionParser');
  
  // Sort by sequence to ensure correct evaluation order
  const sortedVariables = [...dbVariables].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  
  return sortedVariables.map(variable => {
    const converted = {
      name: variable.name,
      sourceFields: [],
      transformations: []
    };
    
    // NEW FORMAT: expression field
    if (variable.expression) {
      try {
        const transformConfig = parseExpressionToTransformation(variable.expression);
        
        if (transformConfig) {
          const { sourceFields, transformations } = evaluateTransformationConfig(transformConfig);
          converted.sourceFields = sourceFields;
          converted.transformations = transformations;
        }
      } catch (error) {
        systemLogger.error('Expression parsing failed for variable:', {
          name: variable.name,
          expression: variable.expression,
          error: error.message
        });
      }
    }
    // LEGACY FORMAT: transformation + params
    else if (variable.transformation) {
      if (variable.source_field) {
        converted.sourceFields = Array.isArray(variable.source_field) 
          ? variable.source_field 
          : [variable.source_field];
      }
      
      if (variable.transformation !== 'none') {
        converted.transformations.push({
          type: variable.transformation,
          params: variable.params || {}
        });
      }
    }
    
    return converted;
  });
}

/**
 * Parse CSV and apply transformations
 */
async function parseAndTransformCSV(buffer, fieldMappings, variables, jobId, pool) {
  return new Promise((resolve, reject) => {
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    let firstRow = null;
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000; // Limit memory usage
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    const stream = Readable.from(buffer);
    
    stream
      .pipe(csv())
      .on('data', (row) => {
        rowsRead++;
        
        // Capture source row for profiling (limit to first 1000 rows)
        if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...row}); // Clone the row
        }
        
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
          const transformedRow = transformRow(row, convertedMappings, convertedVariables);
          
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
          sourceRowsCount: sourceRows.length,
          hasData: transformedRows.length > 0
        });
        
        resolve({ 
          transformedRows,
          sourceRows, // Include source rows for profiling
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
async function parseAndTransformJSON(buffer, fieldMappings, variables, jobId, pool) {
  try {
    const jsonData = JSON.parse(buffer.toString());
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of dataArray) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        const transformedRow = transformRow(row, convertedMappings, convertedVariables);
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
      sourceRows,
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
async function parseAndTransformXLSX(buffer, fieldMappings, variables, jobId, pool) {
  try {
    // Parse XLSX file
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of jsonData) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        const transformedRow = transformRow(row, convertedMappings, convertedVariables);
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
      sourceRows,
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
async function parseAndTransformParquet(buffer, fieldMappings, variables, jobId, pool) {
  try {
    // Dynamic import for hyparquet (ES module)
    const { parquetReadObjects } = await import('hyparquet');
    
    // Convert Node.js Buffer to ArrayBuffer for hyparquet
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset, 
      buffer.byteOffset + buffer.byteLength
    );
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    systemLogger.info('Parquet parsing started');
    
    // Read parquet file as async iterator
    const parquetIterator = await parquetReadObjects({ file: arrayBuffer });
    
    // Consume async iterator properly
    for await (const row of parquetIterator) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        // Log first row for debugging
        if (rowsRead === 1) {
          systemLogger.info('Parquet first row columns:', { 
            columns: Object.keys(row),
            sample: Object.keys(row).slice(0, 5)
          });
        }
        
        const transformedRow = transformRow(row, convertedMappings, convertedVariables);
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
      rowsFailed,
      sourceRowsCount: sourceRows.length
    });
    
    return { 
      transformedRows,
      sourceRows,
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
 * Handles arrays of objects by flattening the first element to extract schema
 * Example: { user: { name: 'John', address: { city: 'NYC' } } }
 * becomes: { 'user.name': 'John', 'user.address.city': 'NYC' }
 * Example: { items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}] }
 * becomes: { 'items.id': 1, 'items.name': 'A' }
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        // Null or undefined values
        flattened[newKey] = value;
      } else if (Array.isArray(value)) {
        // Handle arrays
        if (value.length === 0) {
          // Empty array
          flattened[newKey] = '';
        } else if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
          // Array of objects - flatten the first object to extract schema
          const firstElement = value[0];
          Object.assign(flattened, flattenObject(firstElement, newKey));
        } else {
          // Array of primitives - convert to comma-separated string
          flattened[newKey] = value.join(', ');
        }
      } else if (typeof value === 'object') {
        // Nested object - recursively flatten
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        // Primitive value
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

/**
 * Parse XML and apply transformations
 * Enhanced to handle multiple XML structures similar to file upload feature
 */
async function parseAndTransformXML(buffer, fieldMappings, variables, jobId, pool) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true
    });
    
    const xmlData = parser.parse(buffer.toString());
    
    systemLogger.info('XML structure parsed', { 
      rootKeys: Object.keys(xmlData),
      jobId 
    });
    
    // Extract records - handle various XML structures
    let records = [];
    
    // Strategy 1: Check if entire parsed data is already an array
    if (Array.isArray(xmlData)) {
      records = xmlData;
      systemLogger.info('XML: Root is array', { count: records.length, jobId });
    } 
    // Strategy 2: Navigate through root element
    else if (typeof xmlData === 'object' && xmlData !== null) {
      const rootKeys = Object.keys(xmlData).filter(key => key !== '?xml');
      
      if (rootKeys.length === 0) {
        throw new Error('XML file appears to be empty');
      }
      
      // Get the root element (usually there's only one)
      const rootElement = xmlData[rootKeys[0]];
      
      systemLogger.info('XML: Examining root element', { 
        rootKey: rootKeys[0], 
        isArray: Array.isArray(rootElement),
        isObject: typeof rootElement === 'object',
        jobId 
      });
      
      // Strategy 2a: Root element is directly an array
      if (Array.isArray(rootElement)) {
        records = rootElement;
        systemLogger.info('XML: Root element is array', { count: records.length, jobId });
      }
      // Strategy 2b: Root element is object - find arrays within it
      else if (typeof rootElement === 'object' && rootElement !== null) {
        // Look for array properties (common pattern: <root><records><record>...</record></records></root>)
        const arrayKeys = Object.keys(rootElement).filter(key => Array.isArray(rootElement[key]));
        
        if (arrayKeys.length > 0) {
          // Use the first array found (or the largest one)
          let selectedKey = arrayKeys[0];
          if (arrayKeys.length > 1) {
            // Choose the array with the most elements
            selectedKey = arrayKeys.reduce((largest, key) => {
              return rootElement[key].length > rootElement[largest].length ? key : largest;
            }, arrayKeys[0]);
          }
          
          records = rootElement[selectedKey];
          systemLogger.info('XML: Found array in root element', { 
            key: selectedKey, 
            count: records.length,
            availableKeys: arrayKeys,
            jobId 
          });
        }
        // Strategy 2c: Root element is a single object (single record XML)
        else {
          records = [rootElement];
          systemLogger.info('XML: Single record XML', { jobId });
        }
      }
      // Strategy 2d: Root element is primitive (unusual but handle it)
      else {
        records = [{ value: rootElement }];
        systemLogger.warn('XML: Root element is primitive value', { jobId });
      }
    }
    
    if (records.length === 0) {
      systemLogger.warn('XML: No records extracted from file', { 
        xmlStructure: JSON.stringify(xmlData).substring(0, 200),
        jobId 
      });
      throw new Error('No records found in XML file. Please check the XML structure.');
    }
    
    systemLogger.info('XML: Starting transformation', { 
      recordCount: records.length,
      jobId 
    });
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of records) {
      rowsRead++;
      try {
        // Flatten nested XML structure before transformation
        const flattenedRow = flattenObject(row);
        
        // Capture source row for profiling (limit to first 1000 rows)
        if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...flattenedRow});
        }
        
        // Log first flattened row for debugging
        if (rowsRead === 1) {
          systemLogger.info('XML first row (flattened):', { 
            keys: Object.keys(flattenedRow),
            sampleKeys: Object.keys(flattenedRow).slice(0, 10),
            jobId
          });
        }
        
        const transformedRow = transformRow(flattenedRow, convertedMappings, convertedVariables);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message,
          stack: error.stack,
          jobId
        });
      }
    }
    
    systemLogger.info('XML transformation complete', {
      rowsRead,
      rowsWritten,
      rowsFailed,
      sourceRowsCount: sourceRows.length,
      jobId
    });
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    systemLogger.error('XML parsing failed', {
      error: error.message,
      stack: error.stack,
      jobId
    });
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
    case 'xml':
      return convertToXML(rows);
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
    if (rows.length === 0) {
      return Buffer.from('');
    }
    
    // Import hyparquet-writer
    const { parquetWriteBuffer } = await import('hyparquet-writer');
    
    // Text encoder for converting strings to Uint8Array
    const encoder = new TextEncoder();
    
    // Convert row-based data to column-based format
    const columnData = [];
    const columnNames = Object.keys(rows[0]);
    
    for (const columnName of columnNames) {
      const rawValues = rows.map(row => row[columnName]);
      
      // Infer column type from first non-null value
      let type = 'STRING'; // default type
      let processedValues = rawValues;
      
      for (const value of rawValues) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'INT32' : 'DOUBLE';
          } else if (typeof value === 'boolean') {
            type = 'BOOLEAN';
          } else if (value instanceof Date) {
            type = 'INT64'; // timestamp in milliseconds
            processedValues = rawValues.map(v => v instanceof Date ? v.getTime() : v);
          }
          break;
        }
      }
      
      // For STRING type, encode values as Uint8Array
      if (type === 'STRING') {
        processedValues = rawValues.map(value => {
          if (value === null || value === undefined) {
            return null;
          }
          const strValue = String(value);
          return encoder.encode(strValue);
        });
      }
      
      columnData.push({
        name: columnName,
        data: processedValues,
        type: type
      });
    }
    
    // Write parquet file to buffer
    const arrayBuffer = parquetWriteBuffer({ columnData });
    return Buffer.from(arrayBuffer);
    
  } catch (error) {
    systemLogger.warn('Parquet writing not available, falling back to JSON', {
      error: error.message
    });
    // Fallback to JSON if parquet writer not available
    return convertToJSON(rows);
  }
}

/**
 * Convert transformed rows to XML format
 * Creates a well-formed XML document with nested structure
 */
function convertToXML(rows) {
  if (rows.length === 0) {
    return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<root></root>');
  }
  
  const { XMLBuilder } = require('fast-xml-parser');
  
  // Configure XML builder
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: false
  });
  
  // Reconstruct nested objects from dot-notation keys
  const reconstructedRows = rows.map(row => {
    const reconstructed = {};
    
    for (const key in row) {
      // Prevent prototype pollution by checking hasOwnProperty and dangerous keys
      if (!row.hasOwnProperty(key)) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`Skipping dangerous key in XML conversion: ${key}`);
        continue;
      }
      
      const value = row[key];
      const parts = key.split('.');
      
      // If it's a simple key (no dots), just assign it
      if (parts.length === 1) {
        reconstructed[key] = value;
      } else {
        // Reconstruct nested structure with prototype pollution protection
        let current = reconstructed;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          // Check for dangerous property names at each level
          if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
            console.warn(`Skipping dangerous nested key in XML conversion: ${part}`);
            break;
          }
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        if (lastPart !== '__proto__' && lastPart !== 'constructor' && lastPart !== 'prototype') {
          current[lastPart] = value;
        }
      }
    }
    
    return reconstructed;
  });
  
  // Build XML structure
  const xmlStructure = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8'
    },
    root: {
      record: reconstructedRows
    }
  };
  
  // Convert to XML string
  const xmlString = builder.build(xmlStructure);
  
  return Buffer.from(xmlString);
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
