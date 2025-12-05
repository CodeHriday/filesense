const crypto = require('crypto');
const { systemLogger } = require('../utils/logger');
const { Readable } = require('stream');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { XMLParser } = require('fast-xml-parser');
const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const { decryptCredentials } = require('../utils/encryption');
const { normalizeFilename, createLogicalFileId, extractFilePattern } = require('../utils/filenameNormalizer');

/**
 * Schema Extraction and Validation Service
 * Handles schema extraction, comparison, and validation for files
 */

/**
 * Flatten a nested object into a single-level object with dot-notation keys
 * Handles arrays of objects by flattening the first element to extract schema
 * Example: { user: { name: 'John', address: { city: 'NYC' } } }
 * becomes: { 'user.name': 'John', 'user.address.city': 'NYC' }
 * Example: { items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}] }
 * becomes: { 'items.id': 1, 'items.name': 'A' }
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Prefix for keys (used in recursion)
 * @returns {Object} - Flattened object
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        // Null or undefined values
        flattened[newKey] = value;
      } else if (Array.isArray(value)) {
        // Handle arrays
        if (value.length === 0) {
          // Empty array
          flattened[newKey] = '';
        } else if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
          // Array of objects - flatten the first object to extract schema
          const firstElement = value[0];
          Object.assign(flattened, flattenObject(firstElement, newKey));
        } else {
          // Array of primitives - convert to comma-separated string
          flattened[newKey] = value.join(', ');
        }
      } else if (typeof value === 'object') {
        // Nested object - recursively flatten
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        // Primitive value
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

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
  // IMPORTANT: We normalize types before hashing to ensure equivalent types
  // (e.g., 'object' and 'string') produce the same hash.
  // We also use array index as fallback if col.index is undefined.
  const canonicalSchema = schema.columns
    .map((col, arrayIndex) => ({ ...col, sortIndex: col.index ?? arrayIndex }))
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map(col => `${col.name}:${normalizeType(col.type)}`)
    .join('|');
  
  return crypto.createHash('sha256').update(canonicalSchema).digest('hex');
}

/**
 * Normalize pandas/numpy types to standard DB types.
 * This handles both display normalization and type equivalence.
 * @param {string} type - Column type (pandas, numpy, or DB type)
 * @returns {string} - Normalized type
 */
function normalizeType(type) {
  const t = (type || 'string').toLowerCase().trim();
  
  // String types (pandas uses 'object' for strings)
  if (t === 'object' || t === 'str' || t === 'string' || t === 'text' || t === 'varchar') {
    return 'string';
  }
  
  // Integer types (pandas uses int64, numpy uses various int sizes)
  if (t === 'int64' || t === 'int32' || t === 'int16' || t === 'int8' || 
      t === 'integer' || t === 'int' || t === 'bigint' || t === 'smallint') {
    return 'int';
  }
  
  // Float types (pandas uses float64)
  if (t === 'float64' || t === 'float32' || t === 'float16' || 
      t === 'float' || t === 'double' || t === 'decimal' || t === 'numeric' || t === 'real') {
    return 'float';
  }
  
  // Boolean types
  if (t === 'bool' || t === 'boolean') {
    return 'boolean';
  }
  
  // Date/time types
  if (t === 'datetime64[ns]' || t === 'datetime64' || t === 'datetime' || 
      t === 'timestamp' || t === 'timestamptz') {
    return 'datetime';
  }
  if (t === 'date') {
    return 'date';
  }
  if (t === 'time' || t === 'timedelta64[ns]' || t === 'timedelta64' || t === 'timedelta') {
    return 'time';
  }
  
  return t;
}

/**
 * Check if two column types are considered equivalent
 * @param {string} type1 - First type
 * @param {string} type2 - Second type
 * @returns {boolean} - True if types are equivalent
 */
function typesAreEquivalent(type1, type2) {
  return normalizeType(type1) === normalizeType(type2);
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
  
  // Safety check: ensure both schemas have columns property
  if (!schema1 || !schema1.columns || !schema2 || !schema2.columns) {
    console.error('Invalid schema structure:', { 
      schema1HasColumns: schema1?.columns !== undefined,
      schema2HasColumns: schema2?.columns !== undefined 
    });
    return differences;
  }
  
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
      differences.addedColumns.push({
        name: col.name,
        currentType: col.type,
        index: col.index
      });
    }
  });
  
  // Find removed columns (in schema1 but not in schema2)
  schema1.columns.forEach(col => {
    if (!schema2Map.has(col.name)) {
      differences.isIdentical = false;
      differences.removedColumns.push({
        name: col.name,
        previousType: col.type,
        index: col.index
      });
    }
  });
  
  // Find modified columns (same name, different type)
  // Note: 'object' and 'string' types are treated as equivalent (pandas uses 'object' for strings)
  schema1.columns.forEach(col1 => {
    const col2 = schema2Map.get(col1.name);
    if (col2) {
      // Only flag as type mismatch if types are NOT equivalent
      if (!typesAreEquivalent(col1.type, col2.type)) {
        differences.isIdentical = false;
        differences.modifiedColumns.push({
          name: col1.name,
          previousType: col1.type,
          currentType: col2.type,
          changeType: 'type_change'
        });
      }
      // Note: We no longer compare stored index values as they can differ
      // between contract schemas (0-based) and file schemas (1-based or undefined).
      // Column order is preserved by array position, so matching column names
      // and equivalent types is sufficient for contract validation.
    }
  });
  
  // Detect actual column reordering by comparing array positions (not stored index values)
  // Only flag if columns exist in different positions in both arrays
  if (!differences.columnCountMismatch && 
      differences.addedColumns.length === 0 && 
      differences.removedColumns.length === 0) {
    const schema1Names = schema1.columns.map(c => c.name);
    const schema2Names = schema2.columns.map(c => c.name);
    
    for (let i = 0; i < schema1Names.length; i++) {
      const posInSchema2 = schema2Names.indexOf(schema1Names[i]);
      if (posInSchema2 !== -1 && posInSchema2 !== i) {
        differences.reorderedColumns = true;
        // Column reordering is informational only - doesn't affect schema validity
        break;
      }
    }
  }
  
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
 * Resolve or create a logical file group for cross-upload schema tracking
 * @param {Pool} pool - Database connection pool
 * @param {string} filename - Filename
 * @param {number} projectId - Project ID
 * @param {string} filePattern - Optional file pattern
 * @returns {Promise<string>} - Logical file ID
 */
async function resolveLogicalFileGroup(pool, filename, projectId, filePattern = null) {
  try {
    // Normalize filename to create canonical name
    const canonicalName = normalizeFilename(filename, filePattern);
    const logicalFileId = createLogicalFileId(projectId || 0, canonicalName);
    
    // Auto-detect file pattern if not provided
    const detectedPattern = filePattern || extractFilePattern(filename);
    
    // Try to find existing logical file group
    const existingResult = await pool.query(`
      SELECT logical_file_id FROM logical_file_groups
      WHERE project_id = $1 AND canonical_name = $2
    `, [projectId, canonicalName]);
    
    if (existingResult.rows.length > 0) {
      // Update existing group
      await pool.query(`
        UPDATE logical_file_groups
        SET last_upload_at = CURRENT_TIMESTAMP,
            upload_count = upload_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE logical_file_id = $1
      `, [existingResult.rows[0].logical_file_id]);
      
      return existingResult.rows[0].logical_file_id;
    }
    
    // Create new logical file group
    await pool.query(`
      INSERT INTO logical_file_groups (
        logical_file_id, project_id, canonical_name, file_pattern,
        upload_count
      ) VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT (project_id, canonical_name) DO UPDATE
      SET last_upload_at = CURRENT_TIMESTAMP,
          upload_count = logical_file_groups.upload_count + 1,
          updated_at = CURRENT_TIMESTAMP
    `, [logicalFileId, projectId, canonicalName, detectedPattern]);
    
    systemLogger.info('Logical file group resolved', { logicalFileId, canonicalName, projectId });
    
    return logicalFileId;
    
  } catch (error) {
    systemLogger.error('Error resolving logical file group:', error);
    throw error;
  }
}

/**
 * Save schema snapshot to file_schemas table with logical file grouping
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {Object} schema - Schema definition
 * @param {string} filePattern - Optional file pattern
 * @param {number} rowCount - Row count
 * @param {number} projectId - Project ID for logical grouping
 * @returns {Promise<Object>} - Saved schema record with drift detection
 */
async function saveSchemaSnapshot(pool, fileId, filename, schema, filePattern = null, rowCount = null, projectId = null) {
  try {
    const schemaHash = generateSchemaHash(schema);
    const columnCount = schema.columns.length;
    
    // Resolve logical file group
    const logicalFileId = await resolveLogicalFileGroup(pool, filename, projectId, filePattern);
    
    // Check for schema changes in this logical file group
    const previousSchemaResult = await pool.query(`
      SELECT schema_definition, schema_hash, captured_at
      FROM file_schemas
      WHERE logical_file_id = $1
      ORDER BY captured_at DESC
      LIMIT 1
    `, [logicalFileId]);
    
    let hasSchemaChange = false;
    let schemaDifferences = null;
    
    if (previousSchemaResult.rows.length > 0) {
      const previousHash = previousSchemaResult.rows[0].schema_hash;
      const previousSchema = previousSchemaResult.rows[0].schema_definition;
      const previousColumnCount = previousSchema?.columns?.length || 0;
      
      // Only flag as schema change if:
      // 1. Hashes differ, AND
      // 2. Previous schema was not empty (empty = historical extraction failure)
      if (previousHash !== schemaHash && previousColumnCount > 0) {
        hasSchemaChange = true;
        // Compare schemas to get detailed differences
        schemaDifferences = compareSchemas(
          previousSchema,
          schema
        );
      }
    }
    
    // Save schema snapshot with logical file group linkage
    const result = await pool.query(`
      INSERT INTO file_schemas (
        file_id, file_name, file_pattern, schema_definition, 
        schema_hash, row_count, column_count, logical_file_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (file_id, schema_hash) DO UPDATE
      SET captured_at = CURRENT_TIMESTAMP,
          logical_file_id = EXCLUDED.logical_file_id
      RETURNING *
    `, [fileId, filename, filePattern, JSON.stringify(schema), schemaHash, rowCount, columnCount, logicalFileId]);
    
    // Update logical file group if schema has changed
    if (hasSchemaChange) {
      await pool.query(`
        UPDATE logical_file_groups
        SET has_schema_changes = true,
            last_schema_change_at = CURRENT_TIMESTAMP
        WHERE logical_file_id = $1
      `, [logicalFileId]);
      
      systemLogger.info('Schema change detected in logical file group', {
        logicalFileId,
        fileId,
        differences: schemaDifferences
      });
    }
    
    // Update files table with logical file ID and schema
    await pool.query(`
      UPDATE files 
      SET schema_definition = $1,
          logical_file_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE file_id = $3
    `, [JSON.stringify(schema), logicalFileId, fileId]);
    
    systemLogger.info('Schema snapshot saved', { 
      fileId, 
      schemaHash, 
      logicalFileId,
      hasSchemaChange 
    });
    
    return {
      ...result.rows[0],
      has_schema_change: hasSchemaChange,
      schema_differences: schemaDifferences
    };
    
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
    
    // Get matching files from cloud storage
    const files = await listAndFilterFiles(pool, connectionId, filePattern);
    
    if (files.length === 0) {
      throw new Error('No files match the pattern');
    }
    
    // Get the first file to extract schema
    const sampleFile = files[0];
    
    // Get connection details - try both tables
    let connection = null;
    
    // Try transform_connections first (regular connections with integer IDs)
    const transformResult = await pool.query(
      'SELECT * FROM transform_connections WHERE id::text = $1',
      [String(connectionId)]
    );
    
    if (transformResult.rows.length > 0) {
      connection = transformResult.rows[0];
    } else {
      // Try storage_connections (vendor connections with UUID IDs)
      const storageResult = await pool.query(
        'SELECT * FROM storage_connections WHERE connection_id = $1',
        [connectionId]
      );
      
      if (storageResult.rows.length > 0) {
        connection = storageResult.rows[0];
      }
    }
    
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    const rawConfig = connection.config || {};
    
    // Determine the actual storage type
    let storageType = connection.type.toLowerCase();
    
    // For vendor connections, get the storage type from config
    if (storageType === 'vendor') {
      storageType = (rawConfig.storage_type || rawConfig.provider || '').toLowerCase();
    }
    
    const config = decryptCredentials(storageType, rawConfig);
    
    // Normalize field names for vendor connections
    if (connection.type.toLowerCase() === 'vendor') {
      if (rawConfig.bucket && !config.bucket_name) {
        config.bucket_name = rawConfig.bucket;
      }
      if (config.access_key_id && !config.access_key) {
        config.access_key = config.access_key_id;
      }
      if (config.secret_access_key && !config.secret_key) {
        config.secret_key = config.secret_access_key;
      }
      if (rawConfig.region) config.region = rawConfig.region;
    }
    
    // Download file content based on storage type
    let fileContent;
    let fileExtension = sampleFile.filename.split('.').pop().toLowerCase();
    
    switch (storageType) {
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
        throw new Error(`Unsupported storage type: ${storageType} (connection type: ${connection.type})`);
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
    
    case 'xlsx':
    case 'xls':
      try {
        const workbook = xlsx.read(fileContent, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);
        
        if (jsonData.length > 0) {
          const firstRecord = jsonData[0];
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
        throw new Error(`Failed to parse XLSX: ${error.message}`);
      }
    
    case 'parquet':
      try {
        const { parquetMetadata, parquetSchema } = await import('hyparquet');
        
        const arrayBuffer = fileContent.buffer.slice(
          fileContent.byteOffset,
          fileContent.byteOffset + fileContent.byteLength
        );
        
        systemLogger.info('Parquet schema extraction - reading metadata');
        
        const metadata = parquetMetadata(arrayBuffer);
        const parquetSchemaTree = parquetSchema(metadata);
        
        systemLogger.info('Parquet schema tree extracted', {
          hasChildren: !!parquetSchemaTree.children,
          childCount: parquetSchemaTree.children?.length
        });
        
        if (parquetSchemaTree.children && parquetSchemaTree.children.length > 0) {
          parquetSchemaTree.children.forEach((child, index) => {
            if (child.element && child.element.name) {
              schema.push({
                name: child.element.name,
                type: inferParquetType(child.element.type),
                index: index
              });
            }
          });
        }
        
        return schema;
      } catch (error) {
        systemLogger.error('Parquet schema extraction error:', error);
        throw new Error(`Failed to parse Parquet: ${error.message}`);
      }
    
    case 'xml':
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          parseTagValue: true,
          parseAttributeValue: true,
          trimValues: true
        });
        
        const xmlData = parser.parse(fileContent.toString());
        
        systemLogger.info('XML schema extraction - parsed structure', {
          rootKeys: Object.keys(xmlData)
        });
        
        // Extract first record to infer schema - handle various XML structures
        let firstRecord = null;
        let records = [];
        
        // Strategy 1: Check if entire parsed data is already an array
        if (Array.isArray(xmlData)) {
          records = xmlData;
        } 
        // Strategy 2: Navigate through root element
        else if (typeof xmlData === 'object' && xmlData !== null) {
          const rootKeys = Object.keys(xmlData).filter(key => key !== '?xml');
          
          if (rootKeys.length > 0) {
            const rootElement = xmlData[rootKeys[0]];
            
            // Strategy 2a: Root element is directly an array
            if (Array.isArray(rootElement)) {
              records = rootElement;
            }
            // Strategy 2b: Root element is object - find arrays within it
            else if (typeof rootElement === 'object' && rootElement !== null) {
              // Look for array properties
              const arrayKeys = Object.keys(rootElement).filter(key => Array.isArray(rootElement[key]));
              
              if (arrayKeys.length > 0) {
                // Use the first array found (or the largest one)
                let selectedKey = arrayKeys[0];
                if (arrayKeys.length > 1) {
                  selectedKey = arrayKeys.reduce((largest, key) => {
                    return rootElement[key].length > rootElement[largest].length ? key : largest;
                  }, arrayKeys[0]);
                }
                records = rootElement[selectedKey];
              }
              // Strategy 2c: Root element is a single object (single record XML)
              else {
                records = [rootElement];
              }
            }
          }
        }
        
        // Get first record
        if (records.length > 0) {
          firstRecord = records[0];
        }
        
        if (firstRecord) {
          // Flatten the first record to get all nested fields
          const flattenedRecord = flattenObject(firstRecord);
          
          systemLogger.info('XML schema extraction - flattened first record', {
            originalKeys: Object.keys(firstRecord),
            flattenedKeys: Object.keys(flattenedRecord),
            sampleKeys: Object.keys(flattenedRecord).slice(0, 10)
          });
          
          // Extract schema from flattened record
          Object.keys(flattenedRecord).forEach((key, index) => {
            schema.push({
              name: key,
              type: inferDataType(flattenedRecord[key]),
              index: index
            });
          });
        }
        
        systemLogger.info('XML schema extraction complete', {
          fieldCount: schema.length,
          fields: schema.map(f => f.name)
        });
        
        return schema;
      } catch (error) {
        systemLogger.error('XML schema extraction failed', {
          error: error.message,
          stack: error.stack
        });
        throw new Error(`Failed to parse XML: ${error.message}`);
      }
      
    default:
      throw new Error(`Unsupported file type: ${fileExtension}. Supported types: CSV, JSON, XLSX, XLS, Parquet, XML`);
  }
}

/**
 * Infer Parquet data type from schema type
 * @param {string} parquetType - Parquet type from metadata
 * @returns {string} - Simplified type
 */
function inferParquetType(parquetType) {
  if (!parquetType) return 'string';
  
  const typeStr = parquetType.toString().toLowerCase();
  
  if (typeStr.includes('int')) return 'integer';
  if (typeStr.includes('float') || typeStr.includes('double')) return 'float';
  if (typeStr.includes('bool')) return 'boolean';
  if (typeStr.includes('date') || typeStr.includes('time')) return 'date';
  if (typeStr.includes('string') || typeStr.includes('byte_array')) return 'string';
  
  return 'string';
}

/**
 * Infer data type from value
 * @param {*} value - Value to infer type from
 * @returns {string} - Inferred type
 */
function inferDataType(value) {
  // Check for null/undefined first
  if (value === null || value === undefined) return 'string';
  
  // Check for objects and arrays - convert to string type
  if (typeof value === 'object') {
    return 'string';
  }
  
  // Empty string
  if (value === '') return 'string';
  
  // Check for numbers (but ensure it's not a string that happens to be numeric)
  if (typeof value === 'number') {
    return String(value).includes('.') ? 'float' : 'integer';
  }
  
  // Check for numeric strings
  if (!isNaN(value) && !isNaN(parseFloat(value)) && typeof value === 'string' && value.trim() !== '') {
    return String(value).includes('.') ? 'float' : 'integer';
  }
  
  // Check for booleans
  if (typeof value === 'boolean') return 'boolean';
  if (value === 'true' || value === 'false') return 'boolean';
  
  // Check if it's a date
  const datePattern = /^\d{4}-\d{2}-\d{2}/;
  if (typeof value === 'string' && value.match(datePattern)) return 'date';
  
  // Default to string for any other type
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

/**
 * Extract schema from file buffer
 * @param {Buffer} fileBuffer - File content buffer
 * @param {string} filename - Filename to determine file type
 * @returns {Promise<Array>} - Schema fields
 */
async function extractSchemaFromBuffer(fileBuffer, filename) {
  const fileExtension = filename.split('.').pop().toLowerCase();
  return parseFileSchema(fileBuffer, fileExtension);
}

module.exports = {
  extractSchemaFromColumns,
  generateSchemaHash,
  compareSchemas,
  validateSchemaConsistency,
  getFileSchema,
  saveSchemaSnapshot,
  detectSchemaDrift,
  extractSchemaFromCloud,
  extractSchemaFromBuffer,
  inferDataType
};
