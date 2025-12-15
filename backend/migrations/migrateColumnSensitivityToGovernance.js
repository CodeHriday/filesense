/**
 * Migration: Migrate Column Sensitivity Tags to Governance System
 * 
 * Migrates existing column_sensitivity_tags data to column_governance_tag_assignments
 * by mapping legacy sensitivity levels to governance tag IDs.
 */

async function migrateColumnSensitivityToGovernance(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Migrating column_sensitivity_tags to governance system...');
    
    // Create mapping from sensitivity_level to governance tag names
    const levelToTagMapping = {
      'PII': 'PII',
      'Confidential': 'Confidential',
      'Internal': 'Internal',
      'Public': 'Public',
      'Restricted': 'Restricted'
    };
    
    // Get all governance tags for mapping
    const tagsResult = await client.query(
      'SELECT tag_id, tag_name FROM governance_tags WHERE tag_name = ANY($1)',
      [Object.values(levelToTagMapping)]
    );
    
    const tagNameToId = {};
    tagsResult.rows.forEach(row => {
      tagNameToId[row.tag_name] = row.tag_id;
    });
    
    console.log(`   Found ${tagsResult.rows.length} governance tags for mapping`);
    
    // Get all existing sensitivity tags
    const sensitivityTagsResult = await client.query(
      'SELECT file_id, column_name, sensitivity_level, tagged_by, tagged_at FROM column_sensitivity_tags'
    );
    
    const sensitivityTags = sensitivityTagsResult.rows;
    console.log(`   Found ${sensitivityTags.length} existing sensitivity tags to migrate`);
    
    if (sensitivityTags.length === 0) {
      console.log('   ✅ No sensitivity tags to migrate');
      await client.query('COMMIT');
      return;
    }
    
    let migratedCount = 0;
    let skippedCount = 0;
    let unmappedCount = 0;
    
    for (const tag of sensitivityTags) {
      const { file_id, column_name, sensitivity_level, _, tagged_at } = tag;
      
      // Map sensitivity level to governance tag name
      const governanceTagName = levelToTagMapping[sensitivity_level];
      
      if (!governanceTagName) {
        console.log(`   ⚠️  Unknown sensitivity level '${sensitivity_level}' for ${file_id}:${column_name}, skipping`);
        unmappedCount++;
        continue;
      }
      
      const governanceTagId = tagNameToId[governanceTagName];
      
      if (!governanceTagId) {
        console.log(`   ⚠️  No governance tag found for '${governanceTagName}', skipping`);
        unmappedCount++;
        continue;
      }
      
      // Check if governance tag assignment already exists
      const existingAssignment = await client.query(
        'SELECT assignment_id FROM column_governance_tag_assignments WHERE file_id = $1 AND column_name = $2 AND tag_id = $3',
        [file_id, column_name, governanceTagId]
      );
      
      if (existingAssignment.rows.length > 0) {
        skippedCount++;
        continue;
      }
      
      // Insert governance tag assignment
      await client.query(
        `INSERT INTO column_governance_tag_assignments 
         (file_id, column_name, tag_id, assigned_at)
         VALUES ($1, $2, $3, $4)`,
        [file_id, column_name, governanceTagId, tagged_at]
      );
      
      migratedCount++;
    }
    
    await client.query('COMMIT');
    
    console.log(`\n🎉 Migration completed successfully!`);
    console.log(`   Migrated: ${migratedCount}`);
    console.log(`   Skipped (already exist): ${skippedCount}`);
    console.log(`   Unmapped (unknown levels): ${unmappedCount}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error migrating sensitivity tags:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = migrateColumnSensitivityToGovernance;
