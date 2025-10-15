const crypto = require('crypto');
const { systemLogger } = require('../utils/logger');

/**
 * Schema Extraction and Validation Service
 * Handles schema extraction, comparison, and validation for files
 */

/**
 * Extract schema from file columns data
 * @param {Array} fileColumns - Array of file column objects from file_columns table
 * @returns {Object} - Schema definition with columns
 */
function extractSchemaFromColumns(fileColumns) {
  const schema = {
    columns: fileColumns.map(col => ({
      name: col.column_name,
      type: col.column_type,
      index: col.column_index,
      nullable: col.null_count > 0,
      unique_count: col.unique_count
    })).sort((a, b) => a.index - b.index)
  };
  
  return schema;
}

/**
 * Generate a hash for a schema definition
 * @param {Object} schema - Schema object
 * @returns {string} - SHA-256 hash of the schema
 */
function generateSchemaHash(schema) {
  // Create a canonical representation of the schema
  const canonicalSchema = schema.columns
    .sort((a, b) => a.index - b.index)
    .map(col => `${col.name}:${col.type}`)
    .join('|');
  
  return crypto.createHash('sha256').update(canonicalSchema).digest('hex');
}

/**
 * Compare two schemas and return differences
 * @param {Object} schema1 - First schema
 * @param {Object} schema2 - Second schema
 * @returns {Object} - Comparison result with differences
 */
function compareSchemas(schema1, schema2) {
  const differences = {
    isIdentical: true,
    columnCountMismatch: false,
    addedColumns: [],
    removedColumns: [],
    modifiedColumns: [],
    reorderedColumns: false
  };
  
  // Check column count
  if (schema1.columns.length !== schema2.columns.length) {
    differences.isIdentical = false;
    differences.columnCountMismatch = true;
  }
  
  // Create maps for easier comparison
  const schema1Map = new Map(schema1.columns.map(col => [col.name, col]));
  const schema2Map = new Map(schema2.columns.map(col => [col.name, col]));
  
  // Find added columns (in schema2 but not in schema1)
  schema2.columns.forEach(col => {
    if (!schema1Map.has(col.name)) {
      differences.isIdentical = false;
      differences.addedColumns.push(col);
    }
  });
  
  // Find removed columns (in schema1 but not in schema2)
  schema1.columns.forEach(col => {
    if (!schema2Map.has(col.name)) {
      differences.isIdentical = false;
      differences.removedColumns.push(col);
    }
  });
  
  // Find modified columns (same name, different type or index)
  schema1.columns.forEach(col1 => {
    const col2 = schema2Map.get(col1.name);
    if (col2) {
      if (col1.type !== col2.type) {
        differences.isIdentical = false;
        differences.modifiedColumns.push({
          column: col1.name,
          oldType: col1.type,
          newType: col2.type,
          changeType: 'type_change'
        });
      }
      if (col1.index !== col2.index) {
        differences.isIdentical = false;
        differences.reorderedColumns = true;
      }
    }
  });
  
  return differences;
}

/**
 * Validate schema consistency across multiple files
 * @param {Pool} pool - Database connection pool
 * @param {Array<string>} fileIds - Array of file IDs to validate
 * @returns {Promise<Object>} - Validation result
 */
async function validateSchemaConsistency(pool, fileIds) {
  try {
    if (fileIds.length === 0) {
      return {
        isConsistent: true,
        message: 'No files to validate'
      };
    }
    
    if (fileIds.length === 1) {
      return {
        isConsistent: true,
        message: 'Single file, no consistency check needed'
      };
    }
    
    // Get schemas for all files
    const schemas = [];
    for (const fileId of fileIds) {
      const schemaResult = await getFileSchema(pool, fileId);
      if (schemaResult) {
        schemas.push({
          fileId,
          ...schemaResult
        });
      }
    }
    
    if (schemas.length === 0) {
      return {
        isConsistent: false,
        message: 'No schemas found for the provided files',
        error: 'MISSING_SCHEMAS'
      };
    }
    
    // Compare all schemas against the first one (reference schema)
    const referenceSchema = schemas[0].schema;
    const inconsistencies = [];
    
    for (let i = 1; i < schemas.length; i++) {
      const comparison = compareSchemas(referenceSchema, schemas[i].schema);
      
      if (!comparison.isIdentical) {
        inconsistencies.push({
          fileId: schemas[i].fileId,
          filename: schemas[i].filename,
          differences: comparison
        });
      }
    }
    
    if (inconsistencies.length > 0) {
      return {
        isConsistent: false,
        message: `Schema inconsistency detected in ${inconsistencies.length} file(s)`,
        referenceFile: {
          fileId: schemas[0].fileId,
          filename: schemas[0].filename
        },
        inconsistencies,
        error: 'SCHEMA_MISMATCH'
      };
    }
    
    return {
      isConsistent: true,
      message: `All ${schemas.length} files have consistent schemas`,
      commonSchema: referenceSchema
    };
    
  } catch (error) {
    systemLogger.error('Error validating schema consistency:', error);
    throw error;
  }
}

/**
 * Get file schema from database
 * @param {Pool} pool - Database connection pool  
 * @param {string} fileId - File ID
 * @returns {Promise<Object>} - Schema data
 */
async function getFileSchema(pool, fileId) {
  try {
    // First check if schema is stored in files table
    const fileResult = await pool.query(
      'SELECT filename, schema_definition FROM files WHERE file_id = $1',
      [fileId]
    );
    
    if (fileResult.rows.length === 0) {
      return null;
    }
    
    const file = fileResult.rows[0];
    
    // If schema is already stored, return it
    if (file.schema_definition) {
      return {
        filename: file.filename,
        schema: file.schema_definition,
        source: 'files_table'
      };
    }
    
    // Otherwise, extract from file_columns table
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index',
      [fileId]
    );
    
    if (columnsResult.rows.length === 0) {
      return null;
    }
    
    const schema = extractSchemaFromColumns(columnsResult.rows);
    
    return {
      filename: file.filename,
      schema,
      source: 'file_columns_table'
    };
    
  } catch (error) {
    systemLogger.error('Error getting file schema:', error);
    throw error;
  }
}

/**
 * Save schema snapshot to file_schemas table
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {Object} schema - Schema definition
 * @param {string} filePattern - Optional file pattern
 * @param {number} rowCount - Row count
 * @returns {Promise<Object>} - Saved schema record
 */
async function saveSchemaSnapshot(pool, fileId, filename, schema, filePattern = null, rowCount = null) {
  try {
    const schemaHash = generateSchemaHash(schema);
    const columnCount = schema.columns.length;
    
    const result = await pool.query(`
      INSERT INTO file_schemas (
        file_id, file_name, file_pattern, schema_definition, 
        schema_hash, row_count, column_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (file_id, schema_hash) DO UPDATE
      SET captured_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [fileId, filename, filePattern, JSON.stringify(schema), schemaHash, rowCount, columnCount]);
    
    // Also update the files table with schema
    await pool.query(`
      UPDATE files 
      SET schema_definition = $1, updated_at = CURRENT_TIMESTAMP
      WHERE file_id = $2
    `, [JSON.stringify(schema), fileId]);
    
    systemLogger.info('Schema snapshot saved', { fileId, schemaHash });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error saving schema snapshot:', error);
    throw error;
  }
}

/**
 * Detect schema drift by comparing current schema with historical schema
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {Object} currentSchema - Current file schema
 * @returns {Promise<Object>} - Drift detection result
 */
async function detectSchemaDrift(pool, fileId, currentSchema) {
  try {
    // Get the most recent schema snapshot for this file
    const result = await pool.query(`
      SELECT * FROM file_schemas 
      WHERE file_id = $1 
      ORDER BY captured_at DESC 
      LIMIT 1
    `, [fileId]);
    
    if (result.rows.length === 0) {
      return {
        hasDrift: false,
        message: 'No previous schema found, this is the first snapshot'
      };
    }
    
    const previousSchema = result.rows[0].schema_definition;
    const currentHash = generateSchemaHash(currentSchema);
    const previousHash = result.rows[0].schema_hash;
    
    if (currentHash === previousHash) {
      return {
        hasDrift: false,
        message: 'Schema is consistent with previous snapshot'
      };
    }
    
    // Schema has changed - compare to find differences
    const comparison = compareSchemas(previousSchema, currentSchema);
    
    return {
      hasDrift: true,
      message: 'Schema drift detected',
      previousSchema,
      currentSchema,
      differences: comparison,
      previousCapturedAt: result.rows[0].captured_at
    };
    
  } catch (error) {
    systemLogger.error('Error detecting schema drift:', error);
    throw error;
  }
}

module.exports = {
  extractSchemaFromColumns,
  generateSchemaHash,
  compareSchemas,
  validateSchemaConsistency,
  getFileSchema,
  saveSchemaSnapshot,
  detectSchemaDrift
};
