/**
 * Audit Cleanup Service
 * Automatically removes old audit records based on retention policy
 */

const { systemLogger } = require('../utils/logger');

/**
 * Default retention period (90 days)
 */
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Clean up old audit records beyond retention period
 * @param {Pool} pool - Database connection pool
 * @param {number} retentionDays - Number of days to retain audit records
 * @returns {Promise<Object>} - Cleanup results
 */
async function cleanupOldAuditRecords(pool, retentionDays = DEFAULT_RETENTION_DAYS) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    systemLogger.info('Starting audit cleanup', {
      retentionDays,
      cutoffDate: cutoffDate.toISOString()
    });
    
    // Clean up old file audit records
    const fileAuditResult = await client.query(`
      DELETE FROM file_audit_details
      WHERE created_dt < $1
      RETURNING audit_id
    `, [cutoffDate]);
    
    // Clean up orphaned schema records (no active flags and no references)
    const schemaCleanupResult = await client.query(`
      DELETE FROM file_schema_details
      WHERE active_flag = false
        AND created_dt < $1
        AND schema_id NOT IN (
          SELECT DISTINCT file_schema_id 
          FROM file_audit_details 
          WHERE file_schema_id IS NOT NULL
        )
      RETURNING schema_id
    `, [cutoffDate]);
    
    await client.query('COMMIT');
    
    const result = {
      auditRecordsDeleted: fileAuditResult.rowCount,
      schemaRecordsDeleted: schemaCleanupResult.rowCount,
      cutoffDate: cutoffDate.toISOString()
    };
    
    systemLogger.info('Audit cleanup completed', result);
    
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Audit cleanup failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up audit records for a specific file
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID to clean up
 * @returns {Promise<Object>} - Cleanup results
 */
async function cleanupFileAuditRecords(pool, fileId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Cleaning up audit records for file', { fileId });
    
    // Get schema IDs used by this file
    const schemaResult = await client.query(`
      SELECT DISTINCT file_schema_id
      FROM file_audit_details
      WHERE file_id = $1 AND file_schema_id IS NOT NULL
    `, [fileId]);
    
    const schemaIds = schemaResult.rows.map(row => row.file_schema_id);
    
    // Delete file audit records
    const auditResult = await client.query(`
      DELETE FROM file_audit_details
      WHERE file_id = $1
      RETURNING audit_id
    `, [fileId]);
    
    // Delete orphaned schema records (if not used by other files)
    let schemaDeleted = 0;
    for (const schemaId of schemaIds) {
      const usageCheck = await client.query(`
        SELECT COUNT(*) as count
        FROM file_audit_details
        WHERE file_schema_id = $1
      `, [schemaId]);
      
      if (parseInt(usageCheck.rows[0].count) === 0) {
        await client.query(`
          DELETE FROM file_schema_details
          WHERE schema_id = $1
        `, [schemaId]);
        schemaDeleted++;
      }
    }
    
    await client.query('COMMIT');
    
    const result = {
      fileId,
      auditRecordsDeleted: auditResult.rowCount,
      schemaRecordsDeleted: schemaDeleted
    };
    
    systemLogger.info('File audit cleanup completed', result);
    
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('File audit cleanup failed', { 
      fileId, 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get audit statistics
 * @param {Pool} pool - Database connection pool
 * @returns {Promise<Object>} - Audit statistics
 */
async function getAuditStats(pool) {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_audits,
        COUNT(DISTINCT file_id) as unique_files,
        COUNT(DISTINCT correlation_id) as unique_correlations,
        MIN(created_dt) as oldest_audit,
        MAX(created_dt) as newest_audit
      FROM file_audit_details
    `);
    
    const schemaStats = await pool.query(`
      SELECT 
        COUNT(*) as total_schemas,
        SUM(CASE WHEN active_flag = true THEN 1 ELSE 0 END) as active_schemas,
        SUM(CASE WHEN active_flag = false THEN 1 ELSE 0 END) as inactive_schemas
      FROM file_schema_details
    `);
    
    return {
      audits: stats.rows[0],
      schemas: schemaStats.rows[0]
    };
    
  } catch (error) {
    systemLogger.error('Failed to get audit stats', { error: error.message });
    throw error;
  }
}

module.exports = {
  cleanupOldAuditRecords,
  cleanupFileAuditRecords,
  getAuditStats,
  DEFAULT_RETENTION_DAYS
};
