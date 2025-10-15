const { v4: uuidv4 } = require('uuid');
const { systemLogger } = require('../utils/logger');
const { findMatchingFiles } = require('../utils/filePatternMatcher');
const { validateSchemaConsistency, saveSchemaSnapshot } = require('./schemaService');
const { transformRow } = require('./transformationEngine');
const { executeAnomalyDetection } = require('./anomalyRulesEngine');

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
    dryRun = false
  } = options;
  
  let job = null;
  
  try {
    // Create job
    job = await createJob(pool, mappingId, userId);
    const jobId = job.job_id;
    
    await logJobExecution(pool, jobId, 'info', 'Job execution started', { mappingId, userId });
    
    // Get mapping configuration
    const mapping = await getMappingConfig(pool, mappingId);
    
    // Step 1: Find matching files
    await logJobExecution(pool, jobId, 'info', 'Finding matching files', { 
      pattern: mapping.source_file_pattern 
    });
    
    const matchingFiles = await findMatchingFiles(pool, mapping.source_file_pattern, {
      connectionId: mapping.source_connection_id
    });
    
    if (matchingFiles.length === 0) {
      await updateJob(pool, jobId, { 
        status: 'completed', 
        error_message: 'No files matched the pattern',
        end_time: new Date()
      });
      
      await logJobExecution(pool, jobId, 'warn', 'No files matched pattern', { 
        pattern: mapping.source_file_pattern 
      });
      
      return { 
        jobId, 
        status: 'completed', 
        filesProcessed: 0,
        message: 'No files matched the pattern' 
      };
    }
    
    await logJobExecution(pool, jobId, 'info', `Found ${matchingFiles.length} matching files`);
    
    // Step 2: Validate schema consistency (if enabled)
    if (runSchemaValidation) {
      await logJobExecution(pool, jobId, 'info', 'Validating schema consistency');
      
      const fileIds = matchingFiles.map(f => f.file_id);
      const schemaValidation = await validateSchemaConsistency(pool, fileIds);
      
      if (!schemaValidation.isConsistent) {
        await updateJob(pool, jobId, { 
          status: 'failed', 
          error_message: schemaValidation.message,
          end_time: new Date()
        });
        
        await logJobExecution(pool, jobId, 'error', 'Schema validation failed', {
          error: schemaValidation.error,
          inconsistencies: schemaValidation.inconsistencies
        });
        
        return { 
          jobId, 
          status: 'failed', 
          error: schemaValidation.message,
          inconsistencies: schemaValidation.inconsistencies
        };
      }
      
      await logJobExecution(pool, jobId, 'info', 'Schema validation passed');
    }
    
    // Step 3: Process each file
    let totalRowsRead = 0;
    let totalRowsWritten = 0;
    let totalRowsFailed = 0;
    
    for (const file of matchingFiles) {
      await logJobExecution(pool, jobId, 'info', `Processing file: ${file.filename}`, {
        fileId: file.file_id
      });
      
      try {
        const fileResult = await processFile(pool, file, mapping, jobId, { dryRun });
        
        totalRowsRead += fileResult.rowsRead;
        totalRowsWritten += fileResult.rowsWritten;
        totalRowsFailed += fileResult.rowsFailed;
        
        await logJobExecution(pool, jobId, 'info', `File processed: ${file.filename}`, {
          fileId: file.file_id,
          rowsRead: fileResult.rowsRead,
          rowsWritten: fileResult.rowsWritten,
          rowsFailed: fileResult.rowsFailed
        });
        
        // Step 4: Run profiling and anomaly detection (if enabled)
        if (runProfilingChecks && !dryRun) {
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
  
  // This is a placeholder for actual file processing
  // In a real implementation, this would:
  // 1. Read the source file from storage
  // 2. Apply transformations row by row
  // 3. Write to target connection
  // 4. Return processing statistics
  
  const result = {
    rowsRead: file.row_count || 0,
    rowsWritten: 0,
    rowsFailed: 0
  };
  
  if (!dryRun && mapping.field_mappings && mapping.field_mappings.length > 0) {
    // Simulate transformation application
    // In real implementation, read rows and apply transformRow() function
    result.rowsWritten = result.rowsRead;
  }
  
  return result;
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
      'SELECT * FROM transformation_logs WHERE job_id = $1 ORDER BY created_at ASC',
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
    const result = await updateJob(pool, jobId, {
      status: 'cancelled',
      end_time: new Date()
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job cancelled by user');
    
    systemLogger.info('Job cancelled', { jobId });
    
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
