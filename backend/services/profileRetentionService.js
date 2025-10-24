const { getProfileRetentionCount } = require('./appSettingsService');

/**
 * Profile Retention Service
 * Manages automatic cleanup of old transformation profile data
 */

/**
 * Clean up old transformation profiles, keeping only the last N per mapping
 * @param {Object} pool - Database pool
 * @param {number} retentionCount - Number of profiles to retain per mapping (optional, reads from settings if not provided)
 * @returns {Object} - Cleanup results
 */
async function cleanupOldProfiles(pool, retentionCount = null) {
  try {
    // Get retention count from settings if not provided
    if (retentionCount === null) {
      retentionCount = await getProfileRetentionCount(pool);
    }
    
    console.log(`Starting profile cleanup with retention count: ${retentionCount}`);
    
    // Get all transformation files grouped by mapping_id
    // We need to identify files created by transformations and group them by their mapping
    const query = `
      WITH transformation_files AS (
        SELECT 
          f.id,
          f.file_id,
          f.created_at,
          fad.mapping_name,
          fad.transformation_job_id,
          ROW_NUMBER() OVER (
            PARTITION BY fad.mapping_name 
            ORDER BY f.created_at DESC
          ) as row_num
        FROM files f
        INNER JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE fad.load_type = 'etl_transformation'
          AND fad.file_role = 'target'
      )
      SELECT id, file_id, mapping_name, created_at
      FROM transformation_files
      WHERE row_num > $1
      ORDER BY mapping_name, created_at DESC
    `;
    
    const result = await pool.query(query, [retentionCount]);
    const filesToDelete = result.rows;
    
    if (filesToDelete.length === 0) {
      console.log('No old profiles to clean up');
      return {
        success: true,
        deletedCount: 0,
        message: 'No old profiles to clean up'
      };
    }
    
    console.log(`Found ${filesToDelete.length} profiles to delete`);
    
    // Delete files and their related data
    let deletedCount = 0;
    const deletedByMapping = {};
    
    for (const file of filesToDelete) {
      try {
        // Begin transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // Delete from file_columns
          await client.query('DELETE FROM file_columns WHERE file_id = $1', [file.file_id]);
          
          // Delete from file_audit_details
          await client.query('DELETE FROM file_audit_details WHERE file_id = $1', [file.file_id]);
          
          // Delete from files
          await client.query('DELETE FROM files WHERE file_id = $1', [file.file_id]);
          
          await client.query('COMMIT');
          
          deletedCount++;
          if (!deletedByMapping[file.mapping_name]) {
            deletedByMapping[file.mapping_name] = 0;
          }
          deletedByMapping[file.mapping_name]++;
          
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`Failed to delete file ${file.file_id}:`, err);
        } finally {
          client.release();
        }
      } catch (err) {
        console.error(`Failed to get client for file ${file.file_id}:`, err);
      }
    }
    
    console.log(`Cleanup complete. Deleted ${deletedCount} profiles`);
    console.log('Deleted by mapping:', deletedByMapping);
    
    return {
      success: true,
      deletedCount,
      deletedByMapping,
      message: `Successfully deleted ${deletedCount} old profiles`
    };
    
  } catch (error) {
    console.error('Profile cleanup failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get profile count statistics per mapping
 */
async function getProfileStats(pool) {
  try {
    const query = `
      SELECT 
        fad.mapping_name,
        COUNT(*) as total_profiles,
        MIN(f.created_at) as oldest_profile,
        MAX(f.created_at) as newest_profile
      FROM files f
      INNER JOIN file_audit_details fad ON f.file_id = fad.file_id
      WHERE fad.load_type = 'etl_transformation'
        AND fad.file_role = 'target'
      GROUP BY fad.mapping_name
      ORDER BY total_profiles DESC
    `;
    
    const result = await pool.query(query);
    
    return {
      success: true,
      stats: result.rows
    };
  } catch (error) {
    console.error('Failed to get profile stats:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  cleanupOldProfiles,
  getProfileStats
};
