const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const csv = require('csv-parser');
const { systemLogger } = require('../utils/logger');
const { validateSchemaConsistency, saveSchemaSnapshot } = require('./schemaService');
const { transformRow } = require('./transformationEngine');
const { executeAnomalyDetection } = require('./anomalyRulesEngine');
const { 
  downloadFileFromConnection, 
  uploadFileToConnection,
  listAndFilterFiles
} = require('../utils/cloudStorageFileList');

/**
 * Job Execution Engine
 * Handles execution of transformation mappings with comprehensive tracking and error handling
 */

/**
 * Create a new transformation job
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @returns {Promise<Object>} - Created job record
 */
async function createJob(pool, mappingId, userId) {
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
        job_id, mapping_id, mapping_name, executed_by, status
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [jobId, mappingId, mapping.mapping_name, userId, 'running']);
    
    systemLogger.info('Transformation job created', { jobId, mappingId });
    
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
    existingJob = null
  } = options;
  
  let job = existingJob;
  
  try {
    // Create job only if not provided
    if (!job) {
      job = await createJob(pool, mappingId, userId);
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
        const fileResult = await processFile(pool, file, mapping, jobId, { dryRun });
        
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
  const { dryRun = false } = options;
  
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
    if (fileExtension === 'csv') {
      const parseResult = await parseAndTransformCSV(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
      rowsRead = parseResult.rowsRead;
      rowsWritten = parseResult.rowsWritten;
      rowsFailed = parseResult.rowsFailed;
      transformedRows.push(...parseResult.transformedRows);
      
    } else if (fileExtension === 'json') {
      const parseResult = await parseAndTransformJSON(
        fileBuffer, 
        mapping.field_mappings, 
        jobId, 
        pool
      );
      rowsRead = parseResult.rowsRead;
      rowsWritten = parseResult.rowsWritten;
      rowsFailed = parseResult.rowsFailed;
      transformedRows.push(...parseResult.transformedRows);
      
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }
    
    // Step 4: Upload transformed data to target (if not dry run)
    if (!dryRun && transformedRows.length > 0 && mapping.target_connection_id) {
      await logJobExecution(pool, jobId, 'info', 
        `Uploading transformed data to target`, {
        target_connection_id: mapping.target_connection_id,
        rows: transformedRows.length
      });
      
      // Generate output filename
      const outputFilename = generateOutputFilename(file.filename, mapping.mapping_name);
      
      // Convert transformed rows to CSV format for output
      const outputBuffer = convertToCSV(transformedRows);
      
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
 * Parse CSV and apply transformations
 */
async function parseAndTransformCSV(buffer, fieldMappings, jobId, pool) {
  return new Promise((resolve, reject) => {
    const transformedRows = [];
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    const stream = Readable.from(buffer);
    
    stream
      .pipe(csv())
      .on('data', (row) => {
        rowsRead++;
        try {
          const transformedRow = transformRow(row, fieldMappings);
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
    
    for (const row of dataArray) {
      rowsRead++;
      try {
        const transformedRow = transformRow(row, fieldMappings);
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
 * Generate output filename - preserve original filename
 */
function generateOutputFilename(inputFilename, mappingName) {
  return inputFilename;
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
