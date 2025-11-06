/**
 * Audit Retention Service
 * Handles archiving and cleanup of audit records across all audit tables
 */

const { systemLogger } = require('../utils/logger');

const AUDIT_TABLES = [
  {
    name: 'audit_log',
    archive: 'audit_log_archive',
    idColumn: 'audit_id',
    timestampColumn: 'timestamp'
  },
  {
    name: 'execution_audit',
    archive: 'execution_audit_archive',
    idColumn: 'audit_id',
    timestampColumn: 'timestamp'
  },
  {
    name: 'data_access_log',
    archive: 'data_access_log_archive',
    idColumn: 'access_id',
    timestampColumn: 'timestamp'
  },
  {
    name: 'config_change_history',
    archive: 'config_change_history_archive',
    idColumn: 'change_id',
    timestampColumn: 'timestamp'
  },
  {
    name: 'security_audit_log',
    archive: 'security_audit_log_archive',
    idColumn: 'security_audit_id',
    timestampColumn: 'timestamp'
  },
  {
    name: 'frontend_audit_log',
    archive: null,
    idColumn: 'audit_id',
    timestampColumn: 'timestamp'
  }
];

/**
 * Get current retention settings
 */
async function getRetentionSettings(pool) {
  try {
    const result = await pool.query(`
      SELECT * FROM audit_retention_settings
      ORDER BY id DESC
      LIMIT 1
    `);
    
    return result.rows[0] || {
      retention_days: 30,
      auto_archive_enabled: true,
      auto_delete_enabled: false
    };
  } catch (error) {
    systemLogger.error('Failed to get retention settings', { error: error.message });
    throw error;
  }
}

/**
 * Update retention settings
 */
async function updateRetentionSettings(pool, settings) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await client.query(`
      UPDATE audit_retention_settings
      SET 
        retention_days = $1,
        auto_archive_enabled = $2,
        auto_delete_enabled = $3,
        updated_at = NOW()
      WHERE id = (SELECT id FROM audit_retention_settings ORDER BY id DESC LIMIT 1)
      RETURNING *
    `, [
      settings.retention_days,
      settings.auto_archive_enabled,
      settings.auto_delete_enabled
    ]);
    
    await client.query('COMMIT');
    
    systemLogger.info('Retention settings updated', { settings: result.rows[0] });
    
    return result.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Failed to update retention settings', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get audit statistics for all tables
 */
async function getAuditStatistics(pool) {
  try {
    const stats = {};
    
    for (const table of AUDIT_TABLES) {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_records,
          MIN(${table.timestampColumn}) as oldest_record,
          MAX(${table.timestampColumn}) as newest_record
        FROM ${table.name}
      `);
      
      stats[table.name] = result.rows[0];
      
      if (table.archive) {
        const archiveResult = await pool.query(`
          SELECT 
            COUNT(*) as total_records,
            MIN(timestamp) as oldest_record,
            MAX(archived_at) as last_archived
          FROM ${table.archive}
        `);
        
        stats[table.archive] = archiveResult.rows[0];
      }
    }
    
    const settings = await getRetentionSettings(pool);
    stats.retention_settings = settings;
    
    return stats;
    
  } catch (error) {
    systemLogger.error('Failed to get audit statistics', { error: error.message });
    throw error;
  }
}

/**
 * Archive old records from a specific table
 */
async function archiveTableRecords(client, table, cutoffDate) {
  if (!table.archive) {
    systemLogger.info(`Skipping ${table.name} - no archive table defined`);
    return { archived: 0 };
  }
  
  const result = await client.query(`
    WITH records_to_archive AS (
      SELECT * FROM ${table.name}
      WHERE ${table.timestampColumn} < $1
    )
    INSERT INTO ${table.archive}
    SELECT *, NOW() as archived_at
    FROM records_to_archive
    RETURNING ${table.idColumn}
  `, [cutoffDate]);
  
  const archivedCount = result.rowCount;
  
  if (archivedCount > 0) {
    await client.query(`
      DELETE FROM ${table.name}
      WHERE ${table.timestampColumn} < $1
    `, [cutoffDate]);
  }
  
  return { archived: archivedCount };
}

/**
 * Archive old audit records based on retention period
 */
async function archiveOldRecords(pool, retentionDays = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const settings = retentionDays 
      ? { retention_days: retentionDays }
      : await getRetentionSettings(pool);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.retention_days);
    
    systemLogger.info('Starting audit archival', {
      retentionDays: settings.retention_days,
      cutoffDate: cutoffDate.toISOString()
    });
    
    const results = {};
    
    for (const table of AUDIT_TABLES) {
      try {
        const tableResult = await archiveTableRecords(client, table, cutoffDate);
        results[table.name] = tableResult;
        
        systemLogger.info(`Archived ${table.name}`, { 
          archived: tableResult.archived 
        });
      } catch (error) {
        systemLogger.error(`Failed to archive ${table.name}`, { 
          error: error.message 
        });
        results[table.name] = { error: error.message };
      }
    }
    
    await client.query(`
      UPDATE audit_retention_settings
      SET last_archive_run = NOW()
      WHERE id = (SELECT id FROM audit_retention_settings ORDER BY id DESC LIMIT 1)
    `);
    
    await client.query('COMMIT');
    
    const totalArchived = Object.values(results)
      .reduce((sum, r) => sum + (r.archived || 0), 0);
    
    systemLogger.info('Audit archival completed', { 
      totalArchived,
      cutoffDate: cutoffDate.toISOString(),
      details: results
    });
    
    return {
      success: true,
      totalArchived,
      cutoffDate: cutoffDate.toISOString(),
      details: results
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Audit archival failed', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete old archived records
 */
async function deleteArchivedRecords(pool, archiveCutoffDays = 90) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - archiveCutoffDays);
    
    systemLogger.info('Starting archived records deletion', {
      archiveCutoffDays,
      cutoffDate: cutoffDate.toISOString()
    });
    
    const results = {};
    
    for (const table of AUDIT_TABLES) {
      if (!table.archive) continue;
      
      try {
        const result = await client.query(`
          DELETE FROM ${table.archive}
          WHERE archived_at < $1
          RETURNING ${table.idColumn}
        `, [cutoffDate]);
        
        results[table.archive] = { deleted: result.rowCount };
        
        systemLogger.info(`Deleted from ${table.archive}`, { 
          deleted: result.rowCount 
        });
      } catch (error) {
        systemLogger.error(`Failed to delete from ${table.archive}`, { 
          error: error.message 
        });
        results[table.archive] = { error: error.message };
      }
    }
    
    await client.query('COMMIT');
    
    const totalDeleted = Object.values(results)
      .reduce((sum, r) => sum + (r.deleted || 0), 0);
    
    systemLogger.info('Archived records deletion completed', { 
      totalDeleted,
      cutoffDate: cutoffDate.toISOString(),
      details: results
    });
    
    return {
      success: true,
      totalDeleted,
      cutoffDate: cutoffDate.toISOString(),
      details: results
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Archived records deletion failed', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete old records permanently (without archiving)
 */
async function deleteOldRecords(pool, retentionDays = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const settings = retentionDays 
      ? { retention_days: retentionDays }
      : await getRetentionSettings(pool);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.retention_days);
    
    systemLogger.warn('Starting direct audit deletion', {
      retentionDays: settings.retention_days,
      cutoffDate: cutoffDate.toISOString()
    });
    
    const results = {};
    
    for (const table of AUDIT_TABLES) {
      try {
        const result = await client.query(`
          DELETE FROM ${table.name}
          WHERE ${table.timestampColumn} < $1
          RETURNING ${table.idColumn}
        `, [cutoffDate]);
        
        results[table.name] = { deleted: result.rowCount };
        
        systemLogger.info(`Deleted from ${table.name}`, { 
          deleted: result.rowCount 
        });
      } catch (error) {
        systemLogger.error(`Failed to delete from ${table.name}`, { 
          error: error.message 
        });
        results[table.name] = { error: error.message };
      }
    }
    
    await client.query(`
      UPDATE audit_retention_settings
      SET last_cleanup_run = NOW()
      WHERE id = (SELECT id FROM audit_retention_settings ORDER BY id DESC LIMIT 1)
    `);
    
    await client.query('COMMIT');
    
    const totalDeleted = Object.values(results)
      .reduce((sum, r) => sum + (r.deleted || 0), 0);
    
    systemLogger.warn('Direct audit deletion completed', { 
      totalDeleted,
      cutoffDate: cutoffDate.toISOString(),
      details: results
    });
    
    return {
      success: true,
      totalDeleted,
      cutoffDate: cutoffDate.toISOString(),
      details: results
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Direct audit deletion failed', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getRetentionSettings,
  updateRetentionSettings,
  getAuditStatistics,
  archiveOldRecords,
  deleteArchivedRecords,
  deleteOldRecords,
  AUDIT_TABLES
};
