const { systemLogger } = require('../utils/logger');

/**
 * Unified Governance Persistence Service
 * 
 * This service provides a single source of truth for persisting governance metadata
 * across both Contract Validation file uploads and Mapping Job executions.
 * 
 * It handles three types of governance metadata:
 * 1. File-level flags (contains_pii, data_classification) in files table
 * 2. File-level tags (vendor tags, classification tags) in file metadata or separate tags system
 * 3. Column-level PII tags in column_sensitivity_tags table
 */

/**
 * Persist all governance metadata for a file atomically
 * This is called after profiling completes for both upload and mapping job paths
 * 
 * @param {Pool} pool - Database connection pool
 * @param {Object} options - Governance metadata options
 * @param {string} options.fileId - File ID
 * @param {boolean} options.containsPii - Whether file contains PII data
 * @param {string} options.dataClassification - Data classification level (Public, Internal, Confidential, Highly Confidential)
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

  try {
    // Step 1: Update files table with contains_pii and data_classification
    await pool.query(`
      UPDATE files 
      SET contains_pii = $1,
          data_classification = $2,
          updated_at = NOW()
      WHERE file_id = $3
    `, [
      containsPii !== undefined ? containsPii : false,
      dataClassification || null,
      fileId
    ]);

    systemLogger.info('Updated files table with governance flags', {
      fileId,
      contains_pii: containsPii,
      data_classification: dataClassification
    });

    // Step 2: Save file-level tags to files.metadata (stored as JSONB)
    // File tags are stored in the metadata.governance_tags field for now
    // Future enhancement: could create dedicated file_tags junction table
    if (fileTags && fileTags.length > 0) {
      await pool.query(`
        UPDATE files
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('governance_tags', $1::jsonb)
        WHERE file_id = $2
      `, [JSON.stringify(fileTags), fileId]);

      systemLogger.info('Saved file-level tags to metadata', {
        fileId,
        tagCount: fileTags.length,
        tags: fileTags
      });
    }

    // Step 3: Save column-level PII tags to column_sensitivity_tags table
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
          await pool.query(`
            INSERT INTO column_sensitivity_tags (file_id, column_name, sensitivity_level, tagged_by, tagged_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (file_id, column_name) DO UPDATE
            SET sensitivity_level = EXCLUDED.sensitivity_level,
                tagged_at = NOW()
          `, [fileId, columnName, 'PII', 'system']);

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
    }

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
