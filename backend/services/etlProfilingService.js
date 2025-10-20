const { systemLogger } = require('../utils/logger');
const { profileFile } = require('./profilingService');

/**
 * ETL Profiling Service
 * Automatically profiles files created by ETL transformations
 * Populates files, file_columns, and profiling_metrics tables
 */

/**
 * Profile an ETL output file and register it in the database
 * @param {Pool} pool - Database connection pool
 * @param {Object} fileData - File information
 * @param {string} fileData.fileId - Unique file ID
 * @param {string} fileData.filename - File name
 * @param {string} fileData.filepath - Path to the file (cloud storage path)
 * @param {string} fileData.fileType - File type (csv, json, xlsx, parquet)
 * @param {number} fileData.fileSize - File size in bytes
 * @param {number} fileData.rowCount - Number of records
 * @param {number} fileData.columnCount - Number of columns
 * @param {Array} fileData.schema - Array of column definitions {name, type, nullable}
 * @param {Object} fileData.columnStats - Column statistics {column_name: {null_count, unique_count, numeric_sum, etc.}}
 * @param {string} fileData.checksum - File hash/checksum
 * @param {string} fileData.mappingId - Transformation mapping ID
 * @param {string} fileData.jobId - Transformation job ID
 * @param {string} fileData.userId - User who triggered the transformation
 * @returns {Promise<Object>} - Profiling result with quality score and anomaly counts
 */
async function profileETLOutputFile(pool, fileData) {
  try {
    systemLogger.info('Profiling ETL output file', { 
      fileId: fileData.fileId, 
      filename: fileData.filename 
    });

    // Step 1: Register file in the files table
    const fileId = fileData.fileId;
    const qualityScore = 100; // Will be updated after profiling
    
    await pool.query(`
      INSERT INTO files (
        file_id, filename, file_type, file_size, row_count, column_count,
        quality_score, checksum, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (file_id) 
      DO UPDATE SET
        filename = EXCLUDED.filename,
        file_type = EXCLUDED.file_type,
        file_size = EXCLUDED.file_size,
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        checksum = EXCLUDED.checksum,
        updated_at = NOW()
    `, [
      fileId,
      fileData.filename,
      fileData.fileType,
      fileData.fileSize,
      fileData.rowCount,
      fileData.columnCount,
      qualityScore,
      fileData.checksum
    ]);

    systemLogger.info('File registered in files table', { fileId });

    // Step 2: Populate file_columns table with column statistics
    if (fileData.schema && fileData.schema.length > 0) {
      for (const column of fileData.schema) {
        const columnName = column.name;
        const columnType = column.type || 'string';
        const stats = fileData.columnStats?.[columnName] || {};
        
        await pool.query(`
          INSERT INTO file_columns (
            file_id, column_name, column_type, nullable, total_count,
            null_count, unique_count, numeric_sum, numeric_avg,
            numeric_min, numeric_max, string_min_length, string_max_length
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (file_id, column_name)
          DO UPDATE SET
            column_type = EXCLUDED.column_type,
            nullable = EXCLUDED.nullable,
            total_count = EXCLUDED.total_count,
            null_count = EXCLUDED.null_count,
            unique_count = EXCLUDED.unique_count,
            numeric_sum = EXCLUDED.numeric_sum,
            numeric_avg = EXCLUDED.numeric_avg,
            numeric_min = EXCLUDED.numeric_min,
            numeric_max = EXCLUDED.numeric_max,
            string_min_length = EXCLUDED.string_min_length,
            string_max_length = EXCLUDED.string_max_length
        `, [
          fileId,
          columnName,
          columnType,
          column.nullable !== false,
          stats.total_count || fileData.rowCount,
          stats.null_count || 0,
          stats.unique_count || null,
          stats.numeric_sum || null,
          stats.numeric_avg || null,
          stats.numeric_min || null,
          stats.numeric_max || null,
          stats.string_min_length || null,
          stats.string_max_length || null
        ]);
      }
      
      systemLogger.info('Column statistics saved to file_columns', { 
        fileId, 
        columnCount: fileData.schema.length 
      });
    }

    // Step 3: Run profiling checks (anomaly detection)
    // Extract file pattern from filename (e.g., orders_2024-01-15.csv -> orders*.csv)
    const filePattern = extractFilePattern(fileData.filename);
    
    const profilingResult = await profileFile(pool, {
      fileId,
      filename: fileData.filename,
      filePattern,
      mappingId: fileData.mappingId,
      jobId: fileData.jobId,
      runNumericDeviation: true,
      runRowCountCheck: true,
      runNullSpikeCheck: true,
      runTypeMismatchCheck: false // Schema is already validated in ETL
    });

    systemLogger.info('ETL file profiling completed', {
      fileId,
      filename: fileData.filename,
      anomaliesDetected: profilingResult.anomaliesDetected,
      checks: profilingResult.checks
    });

    return {
      success: true,
      fileId,
      anomaliesDetected: profilingResult.anomaliesDetected,
      anomalies: profilingResult.anomalies,
      checks: profilingResult.checks
    };

  } catch (error) {
    systemLogger.error('Error profiling ETL output file', {
      fileId: fileData.fileId,
      filename: fileData.filename,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      fileId: fileData.fileId,
      error: error.message
    };
  }
}

/**
 * Extract file pattern from filename
 * Replaces date-like patterns and timestamps with wildcards
 * @param {string} filename - Original filename
 * @returns {string} - File pattern with wildcards
 */
function extractFilePattern(filename) {
  if (!filename) return filename;

  // Remove extension
  const lastDotIndex = filename.lastIndexOf('.');
  const baseName = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
  const extension = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

  // Replace common date/timestamp patterns with wildcards
  let pattern = baseName
    // YYYY-MM-DD or YYYYMMDD
    .replace(/\d{4}-\d{2}-\d{2}/g, '*')
    .replace(/\d{8}/g, '*')
    // Timestamps (unix or similar)
    .replace(/\d{10,}/g, '*')
    // Sequential numbers at the end
    .replace(/_\d+$/g, '_*')
    .replace(/\d+$/g, '*');

  // If no wildcards were added and there are numbers, add wildcard after the base name
  if (!pattern.includes('*') && /\d/.test(baseName)) {
    pattern = baseName.replace(/\d+/g, '*');
  }

  // If still no wildcards (simple filename), just use it as-is with wildcard
  if (!pattern.includes('*')) {
    pattern = pattern + '*';
  }

  return pattern + extension;
}

module.exports = {
  profileETLOutputFile,
  extractFilePattern
};
