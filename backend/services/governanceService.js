const { systemLogger } = require('../utils/logger');

/**
 * Unified Governance Persistence Service
 * 
 * This service provides a single source of truth for persisting governance metadata
 * across both Contract Validation file uploads and Mapping Job executions.
 * 
 * It handles three types of governance metadata:
 * 1. File-level flags (contains_pii, data_classification) in files table
 * 2. File-level tags (vendor tags, classification tags) in governance_tags + file_tag_assignments junction tables
 * 3. Column-level PII tags in column_sensitivity_tags table (uses classification_level column)
 */

/**
 * Persist all governance metadata for a file atomically in a transaction
 * This is called after profiling completes for both upload and mapping job paths
 * 
 * @param {Pool} pool - Database connection pool
 * @param {Object} options - Governance metadata options
 * @param {string} options.fileId - File ID
 * @param {boolean} options.containsPii - Whether file contains PII data (optional - only updates if provided)
 * @param {string} options.dataClassification - Data classification level (optional - only updates if provided)
 * @param {Array<string>} options.fileTags - Array of file-level tag strings (optional)
 * @param {Array} options.piiColumns - Array of PII column data (flexible format)
 * @param {Array} options.profiledSchema - Profiled file schema for column name validation (optional)
 * @returns {Promise<Object>} - Result object with success status
 */
async function persistGovernanceMetadata(pool, options) {
  const {
    fileId,
    containsPii,
    dataClassification,
    fileTags = [],
    piiColumns = [],
    profiledSchema = []
  } = options;

  systemLogger.info('Persisting governance metadata', {
    fileId,
    containsPii,
    dataClassification,
    fileTagCount: fileTags.length,
    piiColumnCount: piiColumns.length
  });

  const client = await pool.connect();
  try {
    // Start transaction for atomic governance updates
    await client.query('BEGIN');

    // Step 1: Conditionally update files table with contains_pii and data_classification
    // Only update fields that are explicitly provided to avoid overwriting existing values
    const updateParts = [];
    const updateParams = [];
    let paramIndex = 1;

    if (containsPii !== undefined) {
      updateParts.push(`contains_pii = $${paramIndex++}`);
      updateParams.push(containsPii);
    }

    if (dataClassification !== undefined && dataClassification !== null) {
      updateParts.push(`data_classification = $${paramIndex++}`);
      updateParams.push(dataClassification);
    }

    if (updateParts.length > 0) {
      updateParts.push('updated_at = NOW()');
      updateParams.push(fileId);
      
      const updateQuery = `
        UPDATE files 
        SET ${updateParts.join(', ')}
        WHERE file_id = $${paramIndex}
      `;
      
      await client.query(updateQuery, updateParams);

      systemLogger.info('Updated files table with governance flags', {
        fileId,
        contains_pii: containsPii,
        data_classification: dataClassification,
        fieldsUpdated: updateParts.length - 1
      });
    }

    // Step 2: Save file-level tags using governance_tags + file_tag_assignments junction tables
    // Always delete existing assignments first (even if fileTags is empty) to allow tag removal
    await client.query(`
      DELETE FROM file_tag_assignments 
      WHERE file_id = $1
    `, [fileId]);
    
    if (fileTags && fileTags.length > 0) {
      const tagIds = [];
      
      for (const tagName of fileTags) {
        // Generate deterministic tag_id from tag_name
        const tagId = `tag_${tagName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
        
        // Ensure tag exists in governance_tags table and retrieve the real tag_id
        // Use DO UPDATE to force RETURNING even when tag exists
        const tagResult = await client.query(`
          INSERT INTO governance_tags (tag_id, tag_name, description, color, badge_style)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tag_name) DO UPDATE 
          SET description = EXCLUDED.description
          RETURNING tag_id
        `, [tagId, tagName, `Auto-generated tag for ${tagName}`, '#3B82F6', 'default']);
        
        // Use the returned tag_id (handles both new inserts and existing records)
        const realTagId = tagResult.rows[0].tag_id;
        tagIds.push(realTagId);
      }
      
      // Bulk insert new tag assignments using real tag_ids
      for (const tagId of tagIds) {
        await client.query(`
          INSERT INTO file_tag_assignments (file_id, tag_id, assigned_by)
          VALUES ($1, $2, NULL)
          ON CONFLICT (file_id, tag_id) DO NOTHING
        `, [fileId, tagId]);
      }

      systemLogger.info('Saved file-level tags to junction tables', {
        fileId,
        tagCount: fileTags.length,
        tags: fileTags,
        tagIds: tagIds
      });
    } else {
      systemLogger.info('Removed all file-level tags', {
        fileId
      });
    }

    // Step 3: Save column-level PII tags to column_sensitivity_tags table
    // CRITICAL: Use sensitivity_level column (verified from database schema)
    // Always delete existing column tags first to remove stale entries
    await client.query(`
      DELETE FROM column_sensitivity_tags 
      WHERE file_id = $1
    `, [fileId]);
    
    if (piiColumns && piiColumns.length > 0) {
      const normalizedPiiColumns = normalizePiiColumns(piiColumns, profiledSchema);
      
      systemLogger.info('Normalized PII columns for tagging', {
        fileId,
        inputCount: piiColumns.length,
        normalizedCount: normalizedPiiColumns.length,
        columnNames: normalizedPiiColumns
      });

      for (const columnName of normalizedPiiColumns) {
        try {
          await client.query(`
            INSERT INTO column_sensitivity_tags (file_id, column_name, sensitivity_level, data_type)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (file_id, column_name) DO UPDATE
            SET sensitivity_level = EXCLUDED.sensitivity_level,
                updated_at = NOW()
          `, [fileId, columnName, 'PII', 'string']);

          systemLogger.info('PII tag saved for column', {
            fileId,
            columnName
          });
        } catch (tagError) {
          systemLogger.error('Failed to save PII tag for column', {
            fileId,
            columnName,
            error: tagError.message
          });
          // Don't fail entire governance persistence if one tag fails
        }
      }

      systemLogger.info('All column PII tags persisted', {
        fileId,
        successfulTags: normalizedPiiColumns.length
      });
    } else {
      systemLogger.info('Removed all column PII tags', {
        fileId
      });
    }

    // Step 4: Sync column_governance_tag_assignments for this file.
    // This is the table that lineageGraphService reads to show PII badges in the drawer.
    // Always delete ALL existing tag assignments for this file first (clean slate) so
    // that columns removed or de-PII'd in a subsequent VM run don't linger as ghost badges.
    await client.query(`
      DELETE FROM column_governance_tag_assignments
      WHERE file_id = $1
    `, [fileId]);

    if (piiColumns && piiColumns.length > 0) {
      const normalizedForGovernance = normalizePiiColumns(piiColumns, profiledSchema);

      if (normalizedForGovernance.length > 0) {
        // Resolve (or create) the PII governance tag row — same approach as fileProcessingWorker.
        const piiTagResult = await client.query(`
          INSERT INTO governance_tags (tag_id, tag_name, description, color, badge_style)
          VALUES ('tag_pii', 'PII', 'Personally Identifiable Information', '#EF4444', 'destructive')
          ON CONFLICT (tag_name) DO UPDATE SET description = EXCLUDED.description
          RETURNING tag_id
        `);
        const piiTagId = piiTagResult.rows[0].tag_id;

        for (const columnName of normalizedForGovernance) {
          await client.query(`
            INSERT INTO column_governance_tag_assignments (file_id, column_name, tag_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (file_id, column_name, tag_id) DO NOTHING
          `, [fileId, columnName, piiTagId]);
        }

        systemLogger.info('Synced column_governance_tag_assignments for PII columns', {
          fileId,
          piiTagId,
          columnCount: normalizedForGovernance.length,
          columns: normalizedForGovernance
        });
      }
    } else {
      systemLogger.info('Cleared column_governance_tag_assignments (no current PII columns)', {
        fileId
      });
    }

    // Commit transaction
    await client.query('COMMIT');

    return {
      success: true,
      fileId,
      governanceApplied: {
        containsPii,
        dataClassification,
        fileTagCount: fileTags.length,
        piiColumnCount: piiColumns.length
      }
    };

  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    
    systemLogger.error('Error persisting governance metadata', {
      fileId,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      fileId,
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * Normalize PII columns array to consistent format
 * Handles multiple input formats:
 * - Array of strings: ['column1', 'column2']
 * - Array of objects with column_name: [{column_name: 'col1'}, {column_name: 'col2'}]
 * - Array of objects with name: [{name: 'col1'}, {name: 'col2'}]
 * - Array of objects with pii_tags: [{name: 'col1', pii_tags: ['PII']}]
 * 
 * @param {Array} piiColumns - Raw PII columns data
 * @param {Array} profiledSchema - Profiled schema for validation (optional)
 * @returns {Array<string>} - Normalized array of column names
 */
function normalizePiiColumns(piiColumns, profiledSchema = []) {
  if (!piiColumns || !Array.isArray(piiColumns)) {
    return [];
  }

  const normalized = [];
  const profiledColumnNamesLower = profiledSchema.map(c => c.name.toLowerCase());

  for (const col of piiColumns) {
    let columnName = null;

    // Handle different formats
    if (typeof col === 'string') {
      // Format: 'column_name'
      columnName = col;
    } else if (typeof col === 'object' && col !== null) {
      // Format: {column_name: 'name'} or {name: 'name'} or {name: 'name', pii_tags: [...]}
      columnName = col.column_name || col.name;
    }

    if (columnName) {
      // Validate against profiled schema if available
      if (profiledSchema.length > 0) {
        const columnNameLower = columnName.toLowerCase();
        if (!profiledColumnNamesLower.includes(columnNameLower)) {
          systemLogger.warn('PII column not found in profiled schema, skipping', {
            columnName,
            profiledColumns: profiledColumnNamesLower
          });
          continue;
        }
      }

      normalized.push(columnName);
    }
  }

  return normalized;
}

module.exports = {
  persistGovernanceMetadata,
  normalizePiiColumns
};
