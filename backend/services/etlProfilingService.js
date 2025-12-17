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
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Profiling ETL output file', { 
      fileId: fileData.fileId, 
      filename: fileData.filename 
    });

    // Step 1: Register file in the files table
    const fileId = fileData.fileId;
    const qualityScore = 100; // Will be updated after profiling
    
    await client.query(`
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
        
        await client.query(`
          INSERT INTO file_columns (
            file_id, column_name, column_type, column_index,
            null_count, unique_count, 
            min_value, max_value,
            min_value_decimal, max_value_decimal,
            file_name, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (file_id, column_name)
          DO UPDATE SET
            column_type = EXCLUDED.column_type,
            column_index = EXCLUDED.column_index,
            null_count = EXCLUDED.null_count,
            unique_count = EXCLUDED.unique_count,
            min_value = EXCLUDED.min_value,
            max_value = EXCLUDED.max_value,
            min_value_decimal = EXCLUDED.min_value_decimal,
            max_value_decimal = EXCLUDED.max_value_decimal
        `, [
          fileId,
          columnName,
          columnType,
          fileData.schema.indexOf(column),
          stats.null_count ?? 0,
          stats.unique_count ?? null,
          stats.string_min_value ?? null,
          stats.string_max_value ?? null,
          stats.numeric_min ?? null,
          stats.numeric_max ?? null,
          fileData.filename
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

    await client.query('COMMIT');

    return {
      success: true,
      fileId,
      anomaliesDetected: profilingResult.anomaliesDetected,
      anomalies: profilingResult.anomalies,
      checks: profilingResult.checks
    };

  } catch (error) {
    await client.query('ROLLBACK');
    
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
  } finally {
    client.release();
  }
}

/**
 * Extract file pattern from filename
 * Replaces date-like patterns and timestamps with wildcards
 * Uses length-limited regex patterns to prevent ReDoS attacks
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
  // Use more specific patterns to avoid ReDoS vulnerabilities
  let pattern = baseName
    // YYYY-MM-DD or YYYYMMDD (specific lengths)
    .replace(/\d{4}-\d{2}-\d{2}/g, '*')
    .replace(/\d{8}/g, '*')
    // Timestamps (unix or similar) - limit to reasonable lengths
    .replace(/\d{10,20}/g, '*')
    // Sequential numbers at the end - limit length to prevent ReDoS
    .replace(/_\d{1,10}$/g, '_*')
    .replace(/\d{1,10}$/g, '*');

  // If no wildcards were added and there are numbers, add wildcard after the base name
  // Limit digit sequences to prevent ReDoS
  if (!pattern.includes('*') && /\d/.test(baseName)) {
    pattern = baseName.replace(/\d{1,10}/g, '*');
  }

  // If still no wildcards (simple filename), just use it as-is with wildcard
  if (!pattern.includes('*')) {
    pattern = pattern + '*';
  }

  return pattern + extension;
}

/**
 * Profile a file during ETL execution with historical tracking
 * Captures profile with file_role (source/target) and execution timestamp
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
 * @param {Object} fileData.columnStats - Column statistics
 * @param {string} fileData.checksum - File hash/checksum
 * @param {string} fileData.mappingId - Transformation mapping ID
 * @param {string} fileData.jobId - Transformation job ID
 * @param {string} fileData.userId - User who triggered the transformation
 * @param {string} fileData.fileRole - File role: 'source' or 'target' (defaults to 'target' for backwards compatibility)
 * @param {Date} fileData.executionTimestamp - Execution timestamp (defaults to NOW())
 * @param {string} fileData.projectId - Project ID for access control
 * @returns {Promise<Object>} - Profiling result
 */
async function profileETLFile(pool, fileData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const fileRole = fileData.fileRole || 'target';
    const executionTimestamp = fileData.executionTimestamp || new Date();
    
    systemLogger.info('Profiling ETL file with historical tracking', { 
      fileId: fileData.fileId, 
      filename: fileData.filename,
      fileRole,
      executionTimestamp
    });

    // Step 1: Register or update file in the files table (for both source and target files)
    const fileId = fileData.fileId;
    const qualityScore = 100; // Will be updated after profiling
    
    await client.query(`
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
      fileData.checksum,
      fileData.projectId || null
    ]);

    systemLogger.info('File registered in files table', { fileId, fileRole });

    // Step 2: Populate file_columns table with historical tracking
    if (fileData.schema && fileData.schema.length > 0) {
      for (const column of fileData.schema) {
        const columnName = column.name;
        const columnType = column.type || 'string';
        const stats = fileData.columnStats?.[columnName] || {};
        
        await client.query(`
          INSERT INTO file_columns (
            file_id, column_name, column_type, column_index,
            null_count, unique_count, 
            min_value, max_value,
            min_value_decimal, max_value_decimal,
            file_name, file_role, profile_timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        `, [
          fileId,
          columnName,
          columnType,
          fileData.schema.indexOf(column),
          stats.null_count ?? 0,
          stats.unique_count ?? null,
          stats.string_min_value ?? null,
          stats.string_max_value ?? null,
          stats.numeric_min ?? null,
          stats.numeric_max ?? null,
          fileData.filename,
          fileRole,
          executionTimestamp
        ]);
      }
      
      systemLogger.info('Column statistics saved to file_columns with historical tracking', { 
        fileId, 
        columnCount: fileData.schema.length,
        fileRole,
        executionTimestamp
      });
    }

    // Step 3: Save profiling metrics with historical tracking
    await client.query(`
      INSERT INTO profiling_metrics (
        file_id, file_name, mapping_id, job_id,
        row_count, column_count,
        file_role, profile_timestamp,
        profiled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      fileId,
      fileData.filename,
      fileData.mappingId,
      fileData.jobId,
      fileData.rowCount,
      fileData.columnCount,
      fileRole,
      executionTimestamp
    ]);

    systemLogger.info('Profiling metrics saved with historical tracking', {
      fileId,
      fileRole,
      executionTimestamp
    });

    // Step 4: Run profiling checks (for target files only)
    let profilingResult = { anomaliesDetected: 0, anomalies: [], checks: {} };
    
    if (fileRole === 'target') {
      const filePattern = extractFilePattern(fileData.filename);
      
      profilingResult = await profileFile(pool, {
        fileId,
        filename: fileData.filename,
        filePattern,
        mappingId: fileData.mappingId,
        jobId: fileData.jobId,
        runNumericDeviation: true,
        runRowCountCheck: true,
        runNullSpikeCheck: true,
        runTypeMismatchCheck: false
      });

      systemLogger.info('ETL file profiling completed', {
        fileId,
        filename: fileData.filename,
        fileRole,
        anomaliesDetected: profilingResult.anomaliesDetected,
        checks: profilingResult.checks
      });
    }

    await client.query('COMMIT');

    return {
      success: true,
      fileId,
      fileRole,
      executionTimestamp,
      anomaliesDetected: profilingResult.anomaliesDetected,
      anomalies: profilingResult.anomalies,
      checks: profilingResult.checks
    };

  } catch (error) {
    await client.query('ROLLBACK');
    
    systemLogger.error('Error profiling ETL file', {
      fileId: fileData.fileId,
      filename: fileData.filename,
      fileRole: fileData.fileRole,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      fileId: fileData.fileId,
      fileRole: fileData.fileRole,
      error: error.message
    };
  } finally {
    client.release();
  }
}

module.exports = {
  profileETLOutputFile,
  profileETLFile,
  extractFilePattern
};
