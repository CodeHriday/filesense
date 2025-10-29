const { systemLogger } = require('../utils/logger');
const pool = require('../db');
const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { decryptCredentials } = require('../utils/encryption');

/**
 * Validate file schema against vendor agreement schema
 * @param {string} vendorAgreementId - Vendor agreement ID
 * @param {string} vendorConnectionId - Vendor connection ID (UUID)
 * @param {string} filePath - File path (without bucket name)
 * @param {string} fileName - File name
 * @returns {Promise<{valid: boolean, schemaDrift: boolean, message: string, actualSchema: array, expectedSchema: array}>}
 */
async function validateFileSchema(vendorAgreementId, vendorConnectionId, filePath, fileName) {
  try {
    // Fetch vendor agreement schema
    const agreementResult = await pool.query(
      'SELECT schema, file_name FROM vendor_agreements WHERE id = $1',
      [vendorAgreementId]
    );
    
    if (agreementResult.rows.length === 0) {
      return {
        valid: false,
        schemaDrift: false,
        message: 'Vendor agreement not found',
        actualSchema: [],
        expectedSchema: []
      };
    }
    
    const expectedSchema = agreementResult.rows[0].schema;
    
    if (!expectedSchema || expectedSchema.length === 0) {
      systemLogger.warn('No schema defined in vendor agreement', { vendorAgreementId });
      return {
        valid: true,
        schemaDrift: false,
        message: 'No schema validation required (schema not defined in agreement)',
        actualSchema: [],
        expectedSchema: []
      };
    }
    
    // Fetch vendor connection details
    const connectionResult = await pool.query(
      'SELECT type, config, auth_config, authentication_method FROM storage_connections WHERE connection_id = $1',
      [vendorConnectionId]
    );
    
    if (connectionResult.rows.length === 0) {
      return {
        valid: false,
        schemaDrift: false,
        message: 'Vendor connection not found',
        actualSchema: [],
        expectedSchema: []
      };
    }
    
    const connection = connectionResult.rows[0];
    const rawConfig = connection.config || {};
    
    // Determine the actual storage type
    let storageType = connection.type.toLowerCase();
    if (storageType === 'vendor') {
      storageType = (rawConfig.storage_type || rawConfig.provider || '').toLowerCase();
    }
    
    // Decrypt credentials from auth_config
    const decryptedConfig = decryptCredentials(storageType, rawConfig);
    
    // Normalize field names for vendor connections
    if (connection.type.toLowerCase() === 'vendor') {
      if (rawConfig.bucket && !decryptedConfig.bucket_name) {
        decryptedConfig.bucket_name = rawConfig.bucket;
      }
      if (decryptedConfig.access_key_id && !decryptedConfig.access_key) {
        decryptedConfig.access_key = decryptedConfig.access_key_id;
      }
      if (decryptedConfig.secret_access_key && !decryptedConfig.secret_key) {
        decryptedConfig.secret_key = decryptedConfig.secret_access_key;
      }
      if (rawConfig.region) decryptedConfig.region = rawConfig.region;
    }
    
    // Create connection object with decrypted config
    const connectionWithDecryptedConfig = {
      ...connection,
      config: decryptedConfig
    };
    
    const fullPath = path.join(filePath, fileName).replace(/\\/g, '/');
    
    // Extract schema from actual file
    let actualSchema;
    try {
      actualSchema = await extractSchemaFromFile(connectionWithDecryptedConfig, fullPath, fileName);
    } catch (error) {
      systemLogger.error('Failed to extract schema from file', { error: error.message, filePath: fullPath });
      // Treat file read failures as schema drift - file doesn't exist or can't be read
      return {
        valid: false,
        schemaDrift: true,
        message: `Failed to read file: ${error.message}`,
        actualSchema: [],
        expectedSchema,
        differences: [`File could not be read or does not exist: ${error.message}`]
      };
    }
    
    // Compare schemas
    const comparison = compareSchemas(expectedSchema, actualSchema);
    
    if (comparison.drift) {
      systemLogger.warn('Schema drift detected', { 
        vendorAgreementId, 
        filePath: fullPath,
        differences: comparison.differences 
      });
      
      return {
        valid: false,
        schemaDrift: true,
        message: `Schema drift detected: ${comparison.differences.join(', ')}`,
        actualSchema,
        expectedSchema,
        differences: comparison.differences
      };
    }
    
    return {
      valid: true,
      schemaDrift: false,
      message: 'Schema validation passed',
      actualSchema,
      expectedSchema
    };
    
  } catch (error) {
    systemLogger.error('Schema validation error', { error: error.message, vendorAgreementId });
    return {
      valid: false,
      schemaDrift: false,
      message: `Validation error: ${error.message}`,
      actualSchema: [],
      expectedSchema: []
    };
  }
}

/**
 * Extract schema from file in cloud storage
 */
async function extractSchemaFromFile(connection, filePath, fileName) {
  const fileType = path.extname(fileName).toLowerCase().substring(1);
  let fileStream;
  
  // Determine actual storage type (handle vendor connections)
  let storageType = connection.type;
  if (connection.type === 'vendor' && connection.config && connection.config.storage_type) {
    storageType = connection.config.storage_type;
    systemLogger.info('Resolved vendor connection storage type', { 
      connectionType: connection.type, 
      storageType 
    });
  }
  
  // Get file stream based on storage type
  if (storageType === 'aws' || storageType === 's3') {
    fileStream = await getS3FileStream(connection, filePath);
  } else if (storageType === 'gcs' || storageType === 'google') {
    fileStream = await getGCSFileStream(connection, filePath);
  } else if (storageType === 'azure') {
    fileStream = await getAzureFileStream(connection, filePath);
  } else {
    throw new Error(`Unsupported storage type: ${storageType} (connection type: ${connection.type})`);
  }
  
  // Parse file and extract schema
  if (fileType === 'csv') {
    return await extractCSVSchema(fileStream);
  } else if (fileType === 'xlsx' || fileType === 'xls') {
    return await extractExcelSchema(fileStream);
  } else if (fileType === 'json') {
    return await extractJSONSchema(fileStream);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Get S3 file stream
 */
async function getS3FileStream(connection, filePath) {
  const config = connection.config || {};
  
  // Handle both regular AWS connections and vendor connections
  const accessKey = config.access_key_id || config.access_key;
  const secretKey = config.secret_access_key || config.secret_key;
  const bucketName = config.bucket || config.bucket_name;
  
  const s3 = new AWS.S3({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    region: config.region || 'us-east-1'
  });
  
  const params = {
    Bucket: bucketName,
    Key: filePath.startsWith('/') ? filePath.substring(1) : filePath
  };
  
  systemLogger.info('Fetching S3 file for schema validation', { 
    bucket: bucketName, 
    key: params.Key,
    region: config.region 
  });
  
  try {
    // Use promise() to properly handle AWS SDK errors
    const data = await s3.getObject(params).promise();
    const { Readable } = require('stream');
    return Readable.from(data.Body);
  } catch (error) {
    systemLogger.error('S3 file fetch failed', { 
      bucket: bucketName, 
      key: params.Key,
      error: error.message,
      code: error.code
    });
    throw new Error(`Failed to fetch file from S3: ${error.message}`);
  }
}

/**
 * Get GCS file stream
 */
async function getGCSFileStream(connection, filePath) {
  const config = connection.config || {};
  const storage = new Storage({
    projectId: config.project_id,
    credentials: config.credentials ? JSON.parse(config.credentials) : undefined
  });
  
  const bucket = storage.bucket(config.bucket_name);
  const file = bucket.file(filePath.startsWith('/') ? filePath.substring(1) : filePath);
  
  return file.createReadStream();
}

/**
 * Get Azure Blob file stream
 */
async function getAzureFileStream(connection, filePath) {
  const config = connection.config || {};
  const blobServiceClient = BlobServiceClient.fromConnectionString(config.connection_string);
  const containerClient = blobServiceClient.getContainerClient(config.container_name);
  const blobClient = containerClient.getBlobClient(filePath.startsWith('/') ? filePath.substring(1) : filePath);
  
  const downloadResponse = await blobClient.download();
  return downloadResponse.readableStreamBody;
}

/**
 * Extract schema from CSV file
 */
function extractCSVSchema(stream) {
  return new Promise((resolve, reject) => {
    const headers = [];
    let headersParsed = false;
    
    stream
      .pipe(csv())
      .on('headers', (headerList) => {
        headerList.forEach(header => {
          headers.push({
            name: header,
            type: 'string' // CSV doesn't have type info, default to string
          });
        });
        headersParsed = true;
      })
      .on('data', () => {
        // We only need headers, stop after first row
        if (headersParsed) {
          stream.destroy();
        }
      })
      .on('end', () => {
        resolve(headers);
      })
      .on('error', reject);
  });
}

/**
 * Extract schema from Excel file
 */
async function extractExcelSchema(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (jsonData.length === 0) {
          return resolve([]);
        }
        
        const headers = jsonData[0];
        const schema = headers.map(header => ({
          name: header,
          type: 'string' // Excel doesn't provide type info reliably
        }));
        
        resolve(schema);
      } catch (error) {
        reject(error);
      }
    });
    stream.on('error', reject);
  });
}

/**
 * Extract schema from JSON file
 */
async function extractJSONSchema(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const data = JSON.parse(buffer.toString());
        
        if (!Array.isArray(data) || data.length === 0) {
          return resolve([]);
        }
        
        const firstRecord = data[0];
        const schema = Object.keys(firstRecord).map(key => ({
          name: key,
          type: typeof firstRecord[key]
        }));
        
        resolve(schema);
      } catch (error) {
        reject(error);
      }
    });
    stream.on('error', reject);
  });
}

/**
 * Compare two schemas
 */
function compareSchemas(expectedSchema, actualSchema) {
  const differences = [];
  let drift = false;
  
  // Normalize schema formats
  const expected = normalizeSchema(expectedSchema);
  const actual = normalizeSchema(actualSchema);
  
  // Check for missing columns
  const expectedNames = expected.map(col => col.name.toLowerCase());
  const actualNames = actual.map(col => col.name.toLowerCase());
  
  expectedNames.forEach(name => {
    if (!actualNames.includes(name)) {
      differences.push(`Missing column: ${name}`);
      drift = true;
    }
  });
  
  // Check for extra columns
  actualNames.forEach(name => {
    if (!expectedNames.includes(name)) {
      differences.push(`Unexpected column: ${name}`);
      drift = true;
    }
  });
  
  // Check column order (warning only, not critical)
  if (!drift && expectedNames.join(',') !== actualNames.join(',')) {
    differences.push('Column order mismatch (non-critical)');
  }
  
  return { drift, differences };
}

/**
 * Normalize schema format
 */
function normalizeSchema(schema) {
  if (!Array.isArray(schema)) {
    return [];
  }
  
  return schema.map(col => ({
    name: (col.column_name || col.name || '').trim(),
    type: (col.data_type || col.type || 'string').toLowerCase()
  }));
}

module.exports = {
  validateFileSchema
};
