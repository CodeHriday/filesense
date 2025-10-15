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

/**
 * Extract schema from cloud storage files
 * @param {Pool} pool - Database connection pool
 * @param {number} connectionId - Cloud storage connection ID
 * @param {string} filePattern - File pattern to match
 * @returns {Promise<Array>} - Schema fields array
 */
async function extractSchemaFromCloud(pool, connectionId, filePattern) {
  try {
    const { listAndFilterFiles } = require('../utils/cloudStorageFileList');
    const AWS = require('aws-sdk');
    const { Storage } = require('@google-cloud/storage');
    const { BlobServiceClient } = require('@azure/storage-blob');
    const { decryptCredentials } = require('../utils/encryption');
    const csv = require('csv-parser');
    const { Readable } = require('stream');
    
    // Get matching files from cloud storage
    const files = await listAndFilterFiles(pool, connectionId, filePattern);
    
    if (files.length === 0) {
      throw new Error('No files match the pattern');
    }
    
    // Get the first file to extract schema
    const sampleFile = files[0];
    
    // Get connection details
    const connResult = await pool.query(
      'SELECT * FROM transform_connections WHERE id = $1',
      [connectionId]
    );
    
    if (connResult.rows.length === 0) {
      throw new Error('Connection not found');
    }
    
    const connection = connResult.rows[0];
    const config = decryptCredentials(connection.type, connection.config || {});
    
    // Download file content based on connection type
    let fileContent;
    let fileExtension = sampleFile.filename.split('.').pop().toLowerCase();
    
    switch (connection.type.toLowerCase()) {
      case 'aws':
      case 's3':
        const s3 = new AWS.S3({
          accessKeyId: config.access_key,
          secretAccessKey: config.secret_key,
          region: config.region
        });
        const s3Data = await s3.getObject({
          Bucket: config.bucket_name,
          Key: sampleFile.filename
        }).promise();
        fileContent = s3Data.Body;
        break;
        
      case 'gcs':
      case 'google':
        const storage = new Storage({
          projectId: config.project_id,
          credentials: {
            client_email: config.client_email,
            private_key: config.private_key
          }
        });
        const file = storage.bucket(config.bucket_name).file(sampleFile.filename);
        const [gcsData] = await file.download();
        fileContent = gcsData;
        break;
        
      case 'azure':
      case 'blob':
        const blobServiceClient = BlobServiceClient.fromConnectionString(
          `DefaultEndpointsProtocol=https;AccountName=${config.account_name};AccountKey=${config.account_key};EndpointSuffix=core.windows.net`
        );
        const containerClient = blobServiceClient.getContainerClient(config.container_name);
        const blobClient = containerClient.getBlobClient(sampleFile.filename);
        const downloadResponse = await blobClient.download();
        fileContent = await streamToBuffer(downloadResponse.readableStreamBody);
        break;
        
      default:
        throw new Error(`Unsupported connection type: ${connection.type}`);
    }
    
    // Parse file content based on extension
    const schema = await parseFileSchema(fileContent, fileExtension);
    
    return schema;
    
  } catch (error) {
    systemLogger.error('Error extracting schema from cloud:', error);
    throw error;
  }
}

/**
 * Parse file content to extract schema
 * @param {Buffer} fileContent - File content buffer
 * @param {string} fileExtension - File extension (csv, json, parquet)
 * @returns {Promise<Array>} - Schema fields
 */
async function parseFileSchema(fileContent, fileExtension) {
  const schema = [];
  
  switch (fileExtension) {
    case 'csv':
      return new Promise((resolve, reject) => {
        const columns = [];
        const stream = Readable.from(fileContent.toString());
        
        stream
          .pipe(csv())
          .on('headers', (headers) => {
            headers.forEach((header, index) => {
              columns.push({
                name: header,
                type: 'string',
                index: index
              });
            });
          })
          .on('data', (row) => {
            // Infer types from first row
            if (columns.length > 0 && columns[0].type === 'string') {
              Object.keys(row).forEach((key, index) => {
                const value = row[key];
                if (value) {
                  columns[index].type = inferDataType(value);
                }
              });
            }
          })
          .on('end', () => {
            resolve(columns);
          })
          .on('error', reject);
      });
      
    case 'json':
      try {
        const jsonData = JSON.parse(fileContent.toString());
        const firstRecord = Array.isArray(jsonData) ? jsonData[0] : jsonData;
        
        if (firstRecord) {
          Object.keys(firstRecord).forEach((key, index) => {
            schema.push({
              name: key,
              type: inferDataType(firstRecord[key]),
              index: index
            });
          });
        }
        return schema;
      } catch (error) {
        throw new Error(`Failed to parse JSON: ${error.message}`);
      }
      
    default:
      throw new Error(`Unsupported file type: ${fileExtension}`);
  }
}

/**
 * Infer data type from value
 * @param {*} value - Value to infer type from
 * @returns {string} - Inferred type
 */
function inferDataType(value) {
  if (value === null || value === undefined || value === '') return 'string';
  
  if (!isNaN(value) && !isNaN(parseFloat(value))) {
    return value.includes('.') ? 'float' : 'integer';
  }
  
  if (value === 'true' || value === 'false') return 'boolean';
  
  // Check if it's a date
  const datePattern = /^\d{4}-\d{2}-\d{2}/;
  if (datePattern.test(value)) return 'date';
  
  return 'string';
}

/**
 * Convert stream to buffer
 * @param {Stream} stream - Readable stream
 * @returns {Promise<Buffer>} - Buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

module.exports = {
  extractSchemaFromColumns,
  generateSchemaHash,
  compareSchemas,
  validateSchemaConsistency,
  getFileSchema,
  saveSchemaSnapshot,
  detectSchemaDrift,
  extractSchemaFromCloud
};
