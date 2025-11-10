/**
 * Migration: Seed Default Governance Tags
 * 
 * Creates default governance tags for the column-level access control system.
 * These tags map to the legacy sensitivity_level system for backward compatibility.
 */

async function seedGovernanceTags(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🏷️  Seeding default governance tags...');
    
    // Define default governance tags with their properties
    // tag_id is generated from tag_name: 'tag_' + lowercase_with_underscores
    const defaultTags = [
      {
        tag_id: 'tag_pii',
        tag_name: 'PII',
        description: 'Personally Identifiable Information - requires special handling and masking',
        color: '#ef4444',
        badge_style: 'solid',
        sensitivity_level: 'restricted',
        permission_required: 'pii',
        requires_view_permission: true,
        requires_edit_permission: true
      },
      {
        tag_id: 'tag_confidential',
        tag_name: 'Confidential',
        description: 'Confidential business information - restricted access',
        color: '#f59e0b',
        badge_style: 'solid',
        sensitivity_level: 'restricted',
        permission_required: 'confidential',
        requires_view_permission: true,
        requires_edit_permission: true
      },
      {
        tag_id: 'tag_internal',
        tag_name: 'Internal',
        description: 'Internal use only - not for external sharing',
        color: '#3b82f6',
        badge_style: 'outline',
        sensitivity_level: 'private',
        permission_required: 'internal',
        requires_view_permission: false,
        requires_edit_permission: true
      },
      {
        tag_id: 'tag_public',
        tag_name: 'Public',
        description: 'Public information - no access restrictions',
        color: '#10b981',
        badge_style: 'outline',
        sensitivity_level: 'public',
        permission_required: null,
        requires_view_permission: false,
        requires_edit_permission: false
      },
      {
        tag_id: 'tag_restricted',
        tag_name: 'Restricted',
        description: 'Highly restricted information - admin access only',
        color: '#dc2626',
        badge_style: 'solid',
        sensitivity_level: 'restricted',
        permission_required: 'restricted',
        requires_view_permission: true,
        requires_edit_permission: true
      }
    ];
    
    let insertedCount = 0;
    let skippedCount = 0;
    
    for (const tag of defaultTags) {
      // Check if tag already exists
      const existingTag = await client.query(
        'SELECT tag_id FROM governance_tags WHERE tag_name = $1',
        [tag.tag_name]
      );
      
      if (existingTag.rows.length > 0) {
        console.log(`   ⏭️  Tag '${tag.tag_name}' already exists, skipping`);
        skippedCount++;
        continue;
      }
      
      // Insert new tag
      await client.query(
        `INSERT INTO governance_tags 
         (tag_id, tag_name, description, color, badge_style, sensitivity_level, 
          permission_required, requires_view_permission, requires_edit_permission, 
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          tag.tag_id,
          tag.tag_name,
          tag.description,
          tag.color,
          tag.badge_style,
          tag.sensitivity_level,
          tag.permission_required,
          tag.requires_view_permission,
          tag.requires_edit_permission
        ]
      );
      
      console.log(`   ✅ Created governance tag: ${tag.tag_name}`);
      insertedCount++;
    }
    
    await client.query('COMMIT');
    
    console.log(`\n🎉 Governance tags seeded successfully!`);
    console.log(`   Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding governance tags:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = seedGovernanceTags;
