const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { systemLogger } = require('../utils/logger');
const crypto = require('crypto');
const os = require('os');
const axios = require('axios');
const { downloadFileFromConnection } = require('../utils/cloudStorageFileList');

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
    
    const python = spawn('python3', [pythonScript, filePath, fileType], { env });
    
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
    
    const python = spawn('python3', [pythonScript, filePath, fileType], { env });
    
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
    fileId,
    fileRole,
    mappingId,
    jobId,
    userId,
    projectId
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

    // Step 2: Call comprehensive profiling API (same as vendor uploads)
    const PROFILE_API_PORT = process.env.PROFILE_API_PORT || 8000;
    const profileResponse = await axios.post(`http://localhost:${PROFILE_API_PORT}/api/vendor-profile`, {
      file_id: fileId,
      local_file_path: tempFilePath,
      filename: filename
    });

    const profileResult = profileResponse.data;
    systemLogger.info('Comprehensive profiling completed', {
      fileId,
      fileRole,
      qualityScore: profileResult.quality_score?.overall_score,
      issuesCount: profileResult.issues?.length || 0
    });

    // Step 3: Get basic file info for schema
    const fileInfo = await callPythonProcessor(tempFilePath, fileType);
    
    // Step 4: Get detailed column profiling
    const profilingData = await callProfilingScript(tempFilePath, fileType);
    
    // Step 5: Merge comprehensive profiling data with schema
    if (fileInfo.schema && profilingData.columns) {
      fileInfo.schema = fileInfo.schema.map(col => {
        const profiling = profilingData.columns.find(p => p.name === col.name);
        if (profiling) {
          const { type, ...profilingFields } = profiling;
          return { ...col, ...profilingFields };
        }
        return col;
      });
    }

    // Step 6: Calculate file hash
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Step 7: Use quality score from comprehensive profiling
    const qualityScore = profileResult.quality_score?.overall_score || calculateQualityScore(fileInfo);

    // Step 8: Save to files table
    await pool.query(`
      INSERT INTO files (
        file_id, filename, file_type, file_size, row_count, column_count,
        quality_score, checksum, created_at, updated_at, project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        filename = EXCLUDED.filename,
        file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size,
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        quality_score = EXCLUDED.quality_score,
        checksum = EXCLUDED.checksum,
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
      projectId || null
    ]);

    systemLogger.info('File registered in files table', { fileId, fileRole, qualityScore });

    // Step 9: Save comprehensive column information including patterns
    if (fileInfo.schema && fileInfo.schema.length > 0) {
      await saveColumnInfoComprehensive(pool, fileId, filename, fileInfo.schema, fileRole, profileResult);
      systemLogger.info('Comprehensive column statistics saved', {
        fileId,
        fileRole,
        columnCount: fileInfo.schema.length
      });
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
      schema: fileInfo.schema,
      profileResult: profileResult
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
    projectId
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
      projectId
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
 * @param {Array} schema - Column schema with profiling data
 * @param {string} fileRole - 'source' or 'target'
 * @param {Object} profileResult - Comprehensive profiling result from vendor-profile API
 */
async function saveColumnInfoComprehensive(pool, fileId, filename, schema, fileRole, profileResult) {
  for (let i = 0; i < schema.length; i++) {
    const column = schema[i];
    
    // Extract patterns if available (from profiling data)
    let patterns = null;
    if (column.patterns && Array.isArray(column.patterns) && column.patterns.length > 0) {
      patterns = JSON.stringify(column.patterns);
    }
    
    // Extract frequency data if available
    let mostFrequent = null;
    let leastFrequent = null;
    if (column.value_counts) {
      const counts = column.value_counts;
      if (counts.length > 0) {
        mostFrequent = counts[0].value;
        leastFrequent = counts[counts.length - 1].value;
      }
    }
    
    await pool.query(`
      INSERT INTO file_columns (
        file_id, column_name, column_type, column_index,
        null_count, null_percentage, unique_count,
        min_value, max_value,
        min_value_decimal, max_value_decimal,
        most_frequent_value, least_frequent_value,
        patterns,
        file_name, file_role, profile_timestamp, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
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
        patterns = EXCLUDED.patterns,
        profile_timestamp = NOW()
    `, [
      fileId,
      column.name,
      column.type || 'string',
      i,
      column.null_count || 0,
      column.null_percentage || null,
      column.unique_count || null,
      column.min_value || null,
      column.max_value || null,
      column.min_value_decimal || null,
      column.max_value_decimal || null,
      mostFrequent,
      leastFrequent,
      patterns,
      filename,
      fileRole
    ]);
  }
}

module.exports = {
  profileFileBuffer,
  downloadAndProfileFile,
  callPythonProcessor,
  callProfilingScript
};
