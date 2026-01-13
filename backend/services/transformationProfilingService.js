const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { systemLogger } = require('../utils/logger');
const crypto = require('crypto');
const os = require('os');
const axios = require('axios');
const { downloadFileFromConnection } = require('../utils/cloudStorageFileList');
const { saveSchemaSnapshot } = require('./schemaService');

/**
 * Transformation Profiling Service
 * Profiles transformation files using the same Python logic as file upload
 * Downloads actual S3 files and profiles them from disk for consistency
 */

/**
 * Call Python file processor (same as file upload)
 * @param {string} filePath - Path to file on disk
 * @param {string} fileType - File type (csv, json, xlsx, etc.)
 * @returns {Promise<Object>} - File info with schema and row count
 */
async function callPythonProcessor(filePath, fileType) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../../utils/process_file.py');
    
    const workspaceRoot = path.join(__dirname, '../..');
    const env = {
      ...process.env,
      PYTHONPATH: workspaceRoot
    };
    
    // Use virtual environment wrapper script to ensure dependencies are available
    const venvScript = path.join(__dirname, '../../run_python_with_venv.sh');
    const python = spawn(venvScript, [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
    
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        systemLogger.error('Python processor failed', {
          exitCode: code,
          stderr,
          filePath,
          fileType
        });
        reject(new Error(`Python processor failed with exit code ${code}. Error: ${stderr || 'No error output'}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          
          if (result.error) {
            reject(new Error(`Python processing error: ${result.error}`));
          } else {
            resolve(result);
          }
        } catch (error) {
          systemLogger.error('Failed to parse Python output', {
            stdout: stdout.substring(0, 500),
            parseError: error.message
          });
          reject(new Error(`Failed to parse Python output: ${error.message}`));
        }
      }
    });

    python.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Call Python profiling script (same as file upload)
 * @param {string} filePath - Path to file on disk
 * @param {string} fileType - File type (csv, json, xlsx, etc.)
 * @returns {Promise<Object>} - Column profiling data
 */
async function callProfilingScript(filePath, fileType) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../../utils/profile_columns.py');
    
    const workspaceRoot = path.join(__dirname, '../..');
    const env = {
      ...process.env,
      PYTHONPATH: workspaceRoot
    };
    
    // Use virtual environment wrapper script to ensure dependencies are available
    const venvScript = path.join(__dirname, '../../run_python_with_venv.sh');
    const python = spawn(venvScript, [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
    
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        systemLogger.error('Profiling script error', {
          code,
          stderr,
          filePath
        });
        resolve({ columns: [] }); // Return empty on error (don't fail job)
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          systemLogger.error('Failed to parse profiling output', {
            parseError: error.message
          });
          resolve({ columns: [] });
        }
      }
    });

    python.on('error', (error) => {
      systemLogger.error('Failed to spawn profiling script', { error: error.message });
      resolve({ columns: [] });
    });
  });
}

/**
 * Profile a file buffer using comprehensive vendor profiling API
 * This ensures transformation outputs get the same detailed metrics as vendor uploads
 * @param {Object} options - Profiling options
 * @param {Buffer} options.fileBuffer - File data buffer
 * @param {string} options.filename - Original filename
 * @param {string} options.fileType - File type extension
 * @param {Pool} options.pool - Database connection pool
 * @param {string} options.fileId - Unique file ID for database
 * @param {string} options.fileRole - 'source' or 'target'
 * @param {string} options.mappingId - Transformation mapping ID
 * @param {string} options.jobId - Job ID
 * @param {string} options.userId - User ID
 * @param {string} options.projectId - Project ID
 * @returns {Promise<Object>} - Profiling result
 */
async function profileFileBuffer(options) {
  const {
    fileBuffer,
    filename,
    fileType,
    pool,
    fileId: providedFileId,
    fileRole,
    mappingId,
    jobId,
    userId,
    projectId,
    metadata,
    containsPii,
    dataClassification,
    piiColumns
  } = options;

  const tempFilePath = path.join(os.tmpdir(), `etl_profile_${Date.now()}_${path.basename(filename)}`);
  
  try {
    // Step 1: Write buffer to temp file
    await fs.writeFile(tempFilePath, fileBuffer);
    systemLogger.info('Wrote file buffer to temp for profiling', {
      tempFilePath,
      fileSize: fileBuffer.length,
      fileRole
    });

    // Step 2: Get basic file info for row/column counts
    const fileInfo = await callPythonProcessor(tempFilePath, fileType);
    
    // Step 3: Get detailed column profiling with patterns and frequencies
    const profilingData = await callProfilingScript(tempFilePath, fileType);
    
    // Step 4: Merge all profiling data into schema
    if (fileInfo.schema && profilingData.columns) {
      fileInfo.schema = fileInfo.schema.map(col => {
        const profiling = profilingData.columns.find(p => p.name === col.name);
        if (profiling) {
          // Merge all profiling fields including patterns, top_values, frequencies
          const { type, ...profilingFields } = profiling;
          return { ...col, ...profilingFields };
        }
        return col;
      });
    }

    // Step 5: Calculate file hash
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileId = providedFileId || fileHash;

    // Step 6: Calculate quality score from file info
    const qualityScore = calculateQualityScore(fileInfo);

    // Step 8: Save to files table with correlation_id, file_role, metadata, governance fields, and processing_step
    await pool.query(`
      INSERT INTO files (
        file_id, filename, file_type, file_size, row_count, column_count,
        quality_score, checksum, correlation_id, file_role, metadata, created_at, updated_at, project_id,
        contains_pii, data_classification, processing_step
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12, $13, $14, 'complete')
      ON CONFLICT (file_id) 
      DO UPDATE SET
        filename = EXCLUDED.filename,
        file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size,
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        quality_score = EXCLUDED.quality_score,
        checksum = EXCLUDED.checksum,
        correlation_id = EXCLUDED.correlation_id,
        file_role = EXCLUDED.file_role,
        metadata = EXCLUDED.metadata,
        contains_pii = EXCLUDED.contains_pii,
        data_classification = EXCLUDED.data_classification,
        processing_step = 'complete',
        updated_at = NOW()
    `, [
      fileId,
      filename,
      fileType,
      fileBuffer.length,
      fileInfo.row_count || 0,
      fileInfo.column_count || 0,
      qualityScore,
      fileHash,
      jobId, // correlation_id to link all files from same job
      fileRole, // 'source' or 'target' for profiling endpoint
      metadata || null, // Store metadata including data_classification and pii_columns (pg handles jsonb conversion)
      projectId || null,
      containsPii !== undefined ? containsPii : false, // Governance: PII flag
      dataClassification || null // Governance: data classification level
    ]);

    systemLogger.info('File registered in files table', { fileId, fileRole, qualityScore });

    // Step 9: Save comprehensive column information including patterns
    if (fileInfo.schema && fileInfo.schema.length > 0) {
      await saveColumnInfoComprehensive(pool, fileId, filename, fileInfo.schema, fileRole, fileInfo.row_count);
      systemLogger.info('Comprehensive column statistics saved', {
        fileId,
        fileRole,
        columnCount: fileInfo.schema.length
      });
      
      // Step 9.5: Save schema snapshot for schema history tracking with logical file grouping
      try {
        const schemaDefinition = {
          columns: fileInfo.schema.map(col => ({
            name: col.name,
            type: col.type || col.data_type || 'string',
            nullable: col.nullable !== false,
            index: col.column_index
          }))
        };
        const snapshotResult = await saveSchemaSnapshot(pool, fileId, filename, schemaDefinition, null, fileInfo.row_count, projectId);
        systemLogger.info('Schema snapshot saved for history tracking', {
          fileId,
          fileRole,
          logicalFileId: snapshotResult.logical_file_id,
          hasSchemaChange: snapshotResult.has_schema_change,
          columnCount: schemaDefinition.columns.length
        });
      } catch (schemaError) {
        systemLogger.error('Error saving schema snapshot', {
          fileId,
          fileRole,
          error: schemaError.message
        });
        // Don't fail the whole profiling if schema snapshot fails
      }
      
      // Step 10: Save value distributions to profiling_metrics for Distribution tab
      const valueDistributions = buildValueDistributions(fileInfo.schema);
      if (Object.keys(valueDistributions).length > 0) {
        await saveValueDistributions(pool, fileId, filename, valueDistributions, mappingId, jobId, fileRole);
        systemLogger.info('Value distributions saved to profiling_metrics', {
          fileId,
          fileRole,
          columnsWithDistributions: Object.keys(valueDistributions).length
        });
      }
      
      // NOTE: PII column tags are now persisted by the unified governanceService.persistGovernanceMetadata()
      // which is called by the parent code (jobExecutionEngine, fileProcessingWorker) after profiling completes.
      // This ensures all governance metadata (file flags, file tags, column tags) is saved atomically.
    }

    // Clean up temp file
    await fs.unlink(tempFilePath);

    return {
      success: true,
      fileId,
      fileRole,
      rowCount: fileInfo.row_count,
      columnCount: fileInfo.column_count,
      qualityScore,
      schema: fileInfo.schema
    };

  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempFilePath);
    } catch (unlinkError) {
      // Ignore cleanup errors
    }

    systemLogger.error('Error profiling file buffer', {
      fileId,
      fileRole,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      fileId,
      fileRole,
      error: error.message
    };
  }
}

/**
 * Download and profile a file from cloud storage
 * @param {Object} options - Options
 * @param {Pool} options.pool - Database connection pool
 * @param {number} options.connectionId - Cloud storage connection ID
 * @param {string} options.filePath - File path in cloud storage
 * @param {string} options.filename - Original filename
 * @param {string} options.fileType - File type extension
 * @param {string} options.fileId - Unique file ID
 * @param {string} options.fileRole - 'source' or 'target'
 * @param {string} options.mappingId - Mapping ID
 * @param {string} options.jobId - Job ID
 * @param {string} options.userId - User ID
 * @param {string} options.projectId - Project ID
 * @returns {Promise<Object>} - Profiling result
 */
async function downloadAndProfileFile(options) {
  const {
    pool,
    connectionId,
    filePath,
    filename,
    fileType,
    fileId,
    fileRole,
    mappingId,
    jobId,
    userId,
    projectId,
    metadata,
    containsPii,
    dataClassification,
    piiColumns
  } = options;

  try {
    systemLogger.info('Downloading file from cloud storage for profiling', {
      connectionId,
      filePath,
      fileRole
    });

    // Download file from cloud storage
    const fileBuffer = await downloadFileFromConnection(pool, connectionId, filePath);

    systemLogger.info('File downloaded, starting profiling', {
      fileSize: fileBuffer.length,
      fileRole
    });

    // Profile the downloaded file buffer
    return await profileFileBuffer({
      fileBuffer,
      filename,
      fileType,
      pool,
      fileId,
      fileRole,
      mappingId,
      jobId,
      userId,
      projectId,
      metadata,
      containsPii,
      dataClassification,
      piiColumns
    });

  } catch (error) {
    systemLogger.error('Error downloading and profiling file', {
      connectionId,
      filePath,
      fileRole,
      error: error.message
    });

    return {
      success: false,
      fileId,
      fileRole,
      error: error.message
    };
  }
}

/**
 * Calculate quality score from file info
 * @param {Object} fileInfo - File information from Python processor
 * @returns {number} - Quality score 0-100
 */
function calculateQualityScore(fileInfo) {
  // Start with perfect score
  let score = 100;

  // Deduct for low row count (< 10 rows)
  if (fileInfo.row_count && fileInfo.row_count < 10) {
    score -= 10;
  }

  // Deduct for low column count (< 2 columns)
  if (fileInfo.column_count && fileInfo.column_count < 2) {
    score -= 10;
  }

  // Deduct for schema issues
  if (!fileInfo.schema || fileInfo.schema.length === 0) {
    score -= 20;
  }

  // Deduct for missing/null values in schema
  if (fileInfo.schema) {
    const columnsWithNulls = fileInfo.schema.filter(col => 
      col.null_count && col.null_count > 0
    ).length;
    
    if (columnsWithNulls > 0) {
      const nullPercentage = (columnsWithNulls / fileInfo.schema.length) * 100;
      score -= Math.min(20, nullPercentage / 2);
    }
  }

  return Math.max(0, Math.round(score));
}

/**
 * Save column information to database (legacy - simple version)
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {Array} schema - Column schema with profiling data
 * @param {string} fileRole - 'source' or 'target'
 */
async function saveColumnInfo(pool, fileId, filename, schema, fileRole) {
  for (let i = 0; i < schema.length; i++) {
    const column = schema[i];
    
    await pool.query(`
      INSERT INTO file_columns (
        file_id, column_name, column_type, column_index,
        null_count, unique_count,
        min_value, max_value,
        min_value_decimal, max_value_decimal,
        file_name, file_role, profile_timestamp, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    `, [
      fileId,
      column.name,
      column.type || 'string',
      i,
      column.null_count || 0,
      column.unique_count || null,
      column.min_value || null,
      column.max_value || null,
      column.min_value_decimal || null,
      column.max_value_decimal || null,
      filename,
      fileRole,
    ]);
  }
}

/**
 * Save comprehensive column information including patterns and frequencies
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {Array} schema - Column schema with profiling data (already merged with patterns, frequencies, etc.)
 * @param {string} fileRole - 'source' or 'target'
 * @param {number} totalRows - Total number of rows in the file for null percentage calculation
 */
async function saveColumnInfoComprehensive(pool, fileId, filename, schema, fileRole, totalRows) {
  for (let i = 0; i < schema.length; i++) {
    const column = schema[i];
    
    // Extract patterns if available (already in schema from profile_columns.py)
    let patterns = null;
    if (column.patterns && Array.isArray(column.patterns) && column.patterns.length > 0) {
      patterns = JSON.stringify(column.patterns);
    }
    
    // Extract frequency data (from profile_columns.py output)
    const mostFrequent = column.most_frequent_value || null;
    const leastFrequent = column.least_frequent_value || null;
    const mostFrequentCount = column.most_frequent_count || null;
    const leastFrequentCount = column.least_frequent_count || null;
    
    // Extract min/max frequency data for numeric columns
    const minFrequency = column.min_frequency || null;
    const maxFrequency = column.max_frequency || null;
    const minIsFrequent = column.min_is_frequent || null;
    const maxIsFrequent = column.max_is_frequent || null;
    
    // Calculate null percentage (always calculate if we have totalRows)
    let nullPercentage = null;
    if (totalRows && totalRows > 0) {
      const nullCount = column.null_count || 0;
      nullPercentage = (nullCount / totalRows) * 100;
    }
    
    // Store top_values as JSON if available
    let topValuesJson = null;
    if (column.top_values && Array.isArray(column.top_values) && column.top_values.length > 0) {
      topValuesJson = JSON.stringify(column.top_values);
    }
    
    await pool.query(`
      INSERT INTO file_columns (
        file_id, column_name, column_type, column_index,
        null_count, null_percentage, unique_count,
        min_value, max_value,
        min_value_decimal, max_value_decimal,
        most_frequent_value, least_frequent_value,
        most_frequent_count, least_frequent_count,
        min_frequency, max_frequency,
        min_is_frequent, max_is_frequent,
        patterns,
        file_name, file_role, profile_timestamp, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
      ON CONFLICT (file_id, column_name, file_role) 
      DO UPDATE SET
        column_type = EXCLUDED.column_type,
        column_index = EXCLUDED.column_index,
        null_count = EXCLUDED.null_count,
        null_percentage = EXCLUDED.null_percentage,
        unique_count = EXCLUDED.unique_count,
        min_value = EXCLUDED.min_value,
        max_value = EXCLUDED.max_value,
        min_value_decimal = EXCLUDED.min_value_decimal,
        max_value_decimal = EXCLUDED.max_value_decimal,
        most_frequent_value = EXCLUDED.most_frequent_value,
        least_frequent_value = EXCLUDED.least_frequent_value,
        most_frequent_count = EXCLUDED.most_frequent_count,
        least_frequent_count = EXCLUDED.least_frequent_count,
        min_frequency = EXCLUDED.min_frequency,
        max_frequency = EXCLUDED.max_frequency,
        min_is_frequent = EXCLUDED.min_is_frequent,
        max_is_frequent = EXCLUDED.max_is_frequent,
        patterns = EXCLUDED.patterns,
        profile_timestamp = NOW()
    `, [
      fileId,
      column.name,
      column.type || 'string',
      i,
      column.null_count || 0,
      nullPercentage,
      column.unique_count || null,
      column.min_value || null,
      column.max_value || null,
      column.min_value_decimal || null,
      column.max_value_decimal || null,
      mostFrequent,
      leastFrequent,
      mostFrequentCount,
      leastFrequentCount,
      minFrequency,
      maxFrequency,
      minIsFrequent,
      maxIsFrequent,
      patterns,
      filename,
      fileRole
    ]);
  }
}

/**
 * Build value distributions object from schema for profiling_metrics
 * @param {Array} schema - Column schema with profiling data
 * @returns {Object} - Value distributions keyed by column name
 */
function buildValueDistributions(schema) {
  const distributions = {};
  
  for (const column of schema) {
    if (column.top_values && Array.isArray(column.top_values) && column.top_values.length > 0) {
      distributions[column.name] = column.top_values;
    }
  }
  
  return distributions;
}

/**
 * Save value distributions to profiling_metrics table
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {Object} valueDistributions - Value distributions by column
 * @param {string} mappingId - Mapping ID
 * @param {string} jobId - Job ID
 * @param {string} fileRole - File role ('source' or 'target')
 */
async function saveValueDistributions(pool, fileId, filename, valueDistributions, mappingId, jobId, fileRole) {
  await pool.query(`
    INSERT INTO profiling_metrics (
      file_id, file_name, mapping_id, job_id,
      value_distributions,
      file_role, profile_timestamp, profiled_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (file_id, file_role)
    DO UPDATE SET
      file_name = EXCLUDED.file_name,
      mapping_id = EXCLUDED.mapping_id,
      job_id = EXCLUDED.job_id,
      value_distributions = EXCLUDED.value_distributions,
      profile_timestamp = NOW(),
      profiled_at = NOW()
  `, [
    fileId,
    filename,
    mappingId || null,
    jobId || null,
    JSON.stringify(valueDistributions),
    fileRole
  ]);
}

/**
 * Save PII column sensitivity tags
 * Mirrors the behavior of fileProcessingWorker's applyAgreementGovernance
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {Array<string>} piiColumns - Array of column names that contain PII
 */
async function savePIIColumnTags(pool, fileId, piiColumns) {
  for (const columnName of piiColumns) {
    try {
      await pool.query(`
        INSERT INTO column_sensitivity_tags (file_id, column_name, sensitivity_level, tagged_by, tagged_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (file_id, column_name) DO UPDATE
        SET sensitivity_level = EXCLUDED.sensitivity_level,
            tagged_at = NOW()
      `, [fileId, columnName, 'PII', 'system']);
      
      systemLogger.info('PII tag saved for column', { 
        fileId, 
        columnName
      });
    } catch (error) {
      systemLogger.error('Failed to save PII tag for column', {
        fileId,
        columnName,
        error: error.message
      });
      // Don't fail entire profiling if one tag fails
    }
  }
}

module.exports = {
  profileFileBuffer,
  downloadAndProfileFile,
  callPythonProcessor,
  callProfilingScript
};
