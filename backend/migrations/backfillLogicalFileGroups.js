const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { normalizeFilename } = require('../utils/filenameNormalizer');
const { systemLogger } = require('../utils/logger');

/**
 * Migration script to backfill existing files into logical file groups
 * 
 * This script:
 * 1. Finds all files without a logical_file_id
 * 2. Normalizes their filenames to create canonical names
 * 3. Groups them by project_id + canonical_name
 * 4. Creates logical_file_groups entries
 * 5. Updates files with the logical_file_id
 * 6. Updates file_schemas with the logical_file_id
 */

async function backfillLogicalFileGroups() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const client = await pool.connect();

  try {
    console.log('Starting logical file groups backfill migration...');

    // Start transaction
    await client.query('BEGIN');

    // Step 1: Get all files that don't have a logical_file_id
    const filesResult = await client.query(`
      SELECT file_id, filename, project_id, created_at
      FROM files
      WHERE logical_file_id IS NULL
      ORDER BY project_id, filename, created_at
    `);

    console.log(`Found ${filesResult.rows.length} files to process`);

    if (filesResult.rows.length === 0) {
      console.log('No files to backfill. Migration complete.');
      await client.query('COMMIT');
      return;
    }

    // Step 2: Group files by project_id + canonical_name
    const fileGroups = new Map();
    
    for (const file of filesResult.rows) {
      const canonicalName = normalizeFilename(file.filename);
      const projectId = file.project_id || 'default';
      const groupKey = `${projectId}_${canonicalName}`;
      
      if (!fileGroups.has(groupKey)) {
        fileGroups.set(groupKey, {
          projectId: file.project_id,
          canonicalName,
          files: []
        });
      }
      
      fileGroups.get(groupKey).files.push(file);
    }

    console.log(`Created ${fileGroups.size} logical file groups`);

    let processedGroups = 0;
    let updatedFiles = 0;
    let updatedSchemas = 0;

    // Step 3: Process each group
    for (const [, group] of fileGroups) {
      // Create or get logical_file_group
      const logicalFileId = uuidv4();
      
      const groupResult = await client.query(`
        INSERT INTO logical_file_groups (
          logical_file_id,
          project_id,
          canonical_name,
          has_schema_changes,
          upload_count,
          first_upload_at,
          last_upload_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (project_id, canonical_name) 
        DO UPDATE SET
          upload_count = logical_file_groups.upload_count + $5,
          last_upload_at = $7
        RETURNING logical_file_id
      `, [
        logicalFileId,
        group.projectId,
        group.canonicalName,
        false, // Will be updated when we detect schema changes
        group.files.length,
        group.files[0].created_at, // First upload (oldest - first element since ORDER BY created_at ASC)
        group.files[group.files.length - 1].created_at // Last upload (newest - last element)
      ]);

      const returnedLogicalFileId = groupResult.rows[0].logical_file_id;

      // Step 4: Update all files in this group
      for (const file of group.files) {
        await client.query(`
          UPDATE files 
          SET logical_file_id = $1, updated_at = NOW()
          WHERE file_id = $2
        `, [returnedLogicalFileId, file.file_id]);
        
        updatedFiles++;
      }

      // Step 5: Update file_schemas for all files in this group
      const schemaUpdateResult = await client.query(`
        UPDATE file_schemas
        SET logical_file_id = $1
        WHERE file_id = ANY($2)
      `, [returnedLogicalFileId, group.files.map(f => f.file_id)]);

      updatedSchemas += schemaUpdateResult.rowCount;

      processedGroups++;

      if (processedGroups % 100 === 0) {
        console.log(`Progress: ${processedGroups}/${fileGroups.size} groups processed`);
      }
    }

    // Step 6: Detect schema changes for each logical file group
    console.log('Detecting schema changes across file groups...');
    
    const schemaChangeResult = await client.query(`
      WITH schema_comparison AS (
        SELECT 
          logical_file_id,
          COUNT(DISTINCT schema_hash) as unique_schemas,
          MAX(captured_at) as latest_change
        FROM file_schemas
        WHERE logical_file_id IS NOT NULL
        GROUP BY logical_file_id
      )
      UPDATE logical_file_groups lfg
      SET 
        has_schema_changes = (sc.unique_schemas > 1),
        last_schema_change_at = CASE 
          WHEN sc.unique_schemas > 1 THEN sc.latest_change 
          ELSE NULL 
        END,
        updated_at = NOW()
      FROM schema_comparison sc
      WHERE lfg.logical_file_id = sc.logical_file_id
      RETURNING lfg.logical_file_id, lfg.has_schema_changes
    `);

    const groupsWithChanges = schemaChangeResult.rows.filter(r => r.has_schema_changes).length;
    console.log(`Found ${groupsWithChanges} logical file groups with schema changes`);

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n=== Migration Summary ===');
    console.log(`Total logical file groups created: ${fileGroups.size}`);
    console.log(`Total files updated: ${updatedFiles}`);
    console.log(`Total schema records updated: ${updatedSchemas}`);
    console.log(`Groups with schema changes detected: ${groupsWithChanges}`);
    console.log('Migration completed successfully!');

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    systemLogger.error('Logical file groups backfill migration failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  backfillLogicalFileGroups()
    .then(() => {
      console.log('Migration script finished');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { backfillLogicalFileGroups };
