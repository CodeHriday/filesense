/**
 * Connection Browse Routes
 * Routes for browsing files and folders in cloud storage connections
 */

const express = require('express');
const router = express.Router();
const ConnectionService = require('../services/ConnectionService');
const { systemLogger } = require('../utils/logger');
const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');

/**
 * GET /api/connections/:id/browse
 * Browse files and folders in a cloud storage connection
 * Query params:
 *   - path: Optional path prefix to browse (default: root)
 *   - delimiter: Optional delimiter for folder navigation (default: /)
 */
router.get('/:id/browse', async (req, res) => {
  try {
    const connectionId = req.params.id;
    const path = req.query.path || '';
    const delimiter = req.query.delimiter || '/';
    
    // Fetch connection details
    const connectionService = new ConnectionService();
    const connection = await connectionService.getConnectionById(connectionId);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    // Parse config (may be stringified JSON)
    const config = typeof connection.config === 'string' 
      ? JSON.parse(connection.config) 
      : connection.config;
    
    // Decrypt sensitive fields
    const decryptedConfig = connectionService.decryptSensitiveFieldsIfNeeded(
      connection.type,
      config
    );
    
    let result;
    
    switch (connection.type) {
      case 'aws':
      case 'vendor': // Vendor connections can be AWS
        result = await browseS3(decryptedConfig, path, delimiter);
        break;
      
      case 'gcp':
        result = await browseGCP(decryptedConfig, path, delimiter);
        break;
      
      case 'azure':
        result = await browseAzure(decryptedConfig, path, delimiter);
        break;
      
      default:
        return res.status(400).json({ 
          error: `Browsing not supported for connection type: ${connection.type}` 
        });
    }
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error browsing connection', { 
      error: error.message,
      connectionId: req.params.id,
      path: req.query.path
    });
    res.status(500).json({ error: 'Failed to browse connection: ' + error.message });
  }
});

/**
 * Browse AWS S3 bucket
 */
async function browseS3(config, prefix, delimiter) {
  const { bucket_name, region, access_key, secret_key } = config;
  
  if (!bucket_name) {
    throw new Error('S3 bucket name not configured');
  }
  
  // Configure AWS SDK
  const s3 = new AWS.S3({
    region: region || 'us-east-1',
    accessKeyId: access_key,
    secretAccessKey: secret_key
  });
  
  // List objects with prefix and delimiter
  const params = {
    Bucket: bucket_name,
    Prefix: prefix,
    Delimiter: delimiter,
    MaxKeys: 1000
  };
  
  const data = await s3.listObjectsV2(params).promise();
  
  // Parse results into folders and files
  const folders = (data.CommonPrefixes || []).map(p => ({
    name: p.Prefix.slice(prefix.length).replace(/\/$/, ''),
    path: p.Prefix,
    type: 'folder',
    size: null,
    modified: null
  }));
  
  const files = (data.Contents || [])
    .filter(obj => obj.Key !== prefix) // Exclude the prefix itself
    .map(obj => ({
      name: obj.Key.slice(prefix.length),
      path: obj.Key,
      type: 'file',
      size: obj.Size,
      modified: obj.LastModified
    }));
  
  return {
    success: true,
    path: prefix,
    folders,
    files,
    totalCount: folders.length + files.length
  };
}

/**
 * Browse Google Cloud Storage bucket
 */
async function browseGCP(config, prefix, delimiter) {
  const { bucket_name, project_id, service_account_key } = config;
  
  if (!bucket_name) {
    throw new Error('GCP bucket name not configured');
  }
  
  // Parse service account key (if it's a string)
  let credentials;
  try {
    credentials = typeof service_account_key === 'string'
      ? JSON.parse(service_account_key)
      : service_account_key;
  } catch (error) {
    throw new Error('Invalid service account key format');
  }
  
  // Create GCS client
  const storage = new Storage({
    projectId: project_id || credentials.project_id,
    credentials
  });
  
  const bucket = storage.bucket(bucket_name);
  
  // List files with prefix and delimiter
  const [files] = await bucket.getFiles({
    prefix,
    delimiter,
    maxResults: 1000
  });
  
  // Get prefixes (folders)
  const options = {
    prefix,
    delimiter,
    autoPaginate: false
  };
  
  const [, , apiResponse] = await bucket.getFiles(options);
  const folderPrefixes = apiResponse.prefixes || [];
  
  const folders = folderPrefixes.map(p => ({
    name: p.slice(prefix.length).replace(/\/$/, ''),
    path: p,
    type: 'folder',
    size: null,
    modified: null
  }));
  
  const filesList = files
    .filter(file => file.name !== prefix) // Exclude prefix itself
    .map(file => ({
      name: file.name.slice(prefix.length),
      path: file.name,
      type: 'file',
      size: file.metadata.size ? parseInt(file.metadata.size) : null,
      modified: file.metadata.updated || file.metadata.timeCreated
    }));
  
  return {
    success: true,
    path: prefix,
    folders,
    files: filesList,
    totalCount: folders.length + filesList.length
  };
}

/**
 * Browse Azure Blob Storage container
 */
async function browseAzure(config, prefix, delimiter) {
  const { account_name, container_name, account_key } = config;
  
  if (!account_name || !container_name) {
    throw new Error('Azure account name and container name are required');
  }
  
  // Create connection string
  const connectionString = `DefaultEndpointsProtocol=https;AccountName=${account_name};AccountKey=${account_key};EndpointSuffix=core.windows.net`;
  
  // Create BlobServiceClient
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(container_name);
  
  // List blobs with prefix and delimiter
  const folders = [];
  const files = [];
  const seenPrefixes = new Set();
  
  // Azure doesn't have native folder support, so we need to simulate it
  const listOptions = {
    prefix,
    includeMetadata: true
  };
  
  for await (const item of containerClient.listBlobsFlat(listOptions)) {
    const relativePath = item.name.slice(prefix.length);
    
    // Check if this blob represents a folder (contains delimiter)
    const delimiterIndex = relativePath.indexOf(delimiter);
    
    if (delimiterIndex > 0) {
      // This is inside a subfolder
      const folderName = relativePath.substring(0, delimiterIndex);
      const folderPath = prefix + folderName + delimiter;
      
      if (!seenPrefixes.has(folderPath)) {
        seenPrefixes.add(folderPath);
        folders.push({
          name: folderName,
          path: folderPath,
          type: 'folder',
          size: null,
          modified: null
        });
      }
    } else if (relativePath) {
      // This is a file in the current directory
      files.push({
        name: relativePath,
        path: item.name,
        type: 'file',
        size: item.properties.contentLength,
        modified: item.properties.lastModified
      });
    }
  }
  
  return {
    success: true,
    path: prefix,
    folders,
    files,
    totalCount: folders.length + files.length
  };
}

/**
 * POST /api/connections/infer-schema
 * Infer schema from a sample file in cloud storage
 * Body params:
 *   - connection_id: Connection ID
 *   - path: File path prefix
 *   - pattern: File name pattern
 */
router.post('/infer-schema', async (req, res) => {
  try {
    const { connection_id, path, pattern } = req.body;
    
    if (!connection_id || !path || !pattern) {
      return res.status(400).json({ 
        error: 'connection_id, path, and pattern are required' 
      });
    }
    
    // Fetch connection details
    const connectionService = new ConnectionService();
    const connection = await connectionService.getConnectionById(connection_id);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    // Parse config
    const config = typeof connection.config === 'string' 
      ? JSON.parse(connection.config) 
      : connection.config;
    
    // Decrypt sensitive fields
    const decryptedConfig = connectionService.decryptSensitiveFieldsIfNeeded(
      connection.type,
      config
    );
    
    // Infer schema based on connection type
    let schema;
    
    switch (connection.type) {
      case 'aws':
      case 'vendor':
        schema = await inferSchemaFromS3(decryptedConfig, path, pattern);
        break;
      
      case 'gcp':
        schema = await inferSchemaFromGCP(decryptedConfig, path, pattern);
        break;
      
      case 'azure':
        schema = await inferSchemaFromAzure(decryptedConfig, path, pattern);
        break;
      
      default:
        return res.status(400).json({ 
          error: `Schema inference not supported for connection type: ${connection.type}` 
        });
    }
    
    res.json({
      success: true,
      schema,
      file_type: detectFileType(pattern)
    });
    
  } catch (error) {
    systemLogger.error('Error inferring schema', { 
      error: error.message,
      connectionId: req.body.connection_id,
      path: req.body.path,
      pattern: req.body.pattern
    });
    res.status(500).json({ error: 'Failed to infer schema: ' + error.message });
  }
});

/**
 * Detect file type from pattern
 */
function detectFileType(pattern) {
  const ext = pattern.toLowerCase().split('.').pop();
  const typeMap = {
    'csv': 'csv',
    'json': 'json',
    'xml': 'xml',
    'xlsx': 'xlsx',
    'xls': 'xlsx',
    'parquet': 'parquet',
    'txt': 'txt'
  };
  return typeMap[ext] || 'unknown';
}

/**
 * Infer schema from S3 file
 */
async function inferSchemaFromS3(config, prefix, pattern) {
  const { bucket_name, region, access_key, secret_key } = config;
  
  if (!bucket_name) {
    throw new Error('S3 bucket name not configured');
  }
  
  const s3 = new AWS.S3({
    region: region || 'us-east-1',
    accessKeyId: access_key,
    secretAccessKey: secret_key
  });
  
  // Find first matching file
  const listParams = {
    Bucket: bucket_name,
    Prefix: prefix,
    MaxKeys: 100
  };
  
  const data = await s3.listObjectsV2(listParams).promise();
  const matchingFile = (data.Contents || []).find(obj => {
    const fileName = obj.Key.split('/').pop();
    return matchFilePattern(fileName, pattern);
  });
  
  if (!matchingFile) {
    throw new Error('No matching file found to infer schema');
  }
  
  // Download sample of the file (first 100KB)
  const getParams = {
    Bucket: bucket_name,
    Key: matchingFile.Key,
    Range: 'bytes=0-102400' // First 100KB
  };
  
  const fileData = await s3.getObject(getParams).promise();
  const fileContent = fileData.Body.toString('utf-8');
  
  // Infer schema based on file type
  const fileType = detectFileType(pattern);
  return inferSchemaFromContent(fileContent, fileType);
}

/**
 * Infer schema from GCP file
 */
async function inferSchemaFromGCP(config, prefix, pattern) {
  const { bucket_name, project_id, service_account_key } = config;
  
  if (!bucket_name) {
    throw new Error('GCP bucket name not configured');
  }
  
  let credentials;
  try {
    credentials = typeof service_account_key === 'string'
      ? JSON.parse(service_account_key)
      : service_account_key;
  } catch (error) {
    throw new Error('Invalid service account key format');
  }
  
  const storage = new Storage({
    projectId: project_id || credentials.project_id,
    credentials
  });
  
  const bucket = storage.bucket(bucket_name);
  const [files] = await bucket.getFiles({ prefix, maxResults: 100 });
  
  const matchingFile = files.find(file => {
    const fileName = file.name.split('/').pop();
    return matchFilePattern(fileName, pattern);
  });
  
  if (!matchingFile) {
    throw new Error('No matching file found to infer schema');
  }
  
  // Download sample of the file (first 100KB)
  const [fileContent] = await matchingFile.download({
    start: 0,
    end: 102400
  });
  
  const fileType = detectFileType(pattern);
  return inferSchemaFromContent(fileContent.toString('utf-8'), fileType);
}

/**
 * Infer schema from Azure file
 */
async function inferSchemaFromAzure(config, prefix, pattern) {
  const { account_name, container_name, account_key } = config;
  
  if (!account_name || !container_name) {
    throw new Error('Azure account name and container name are required');
  }
  
  const connectionString = `DefaultEndpointsProtocol=https;AccountName=${account_name};AccountKey=${account_key};EndpointSuffix=core.windows.net`;
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(container_name);
  
  // Find matching file
  let matchingBlob = null;
  for await (const item of containerClient.listBlobsFlat({ prefix })) {
    const fileName = item.name.split('/').pop();
    if (matchFilePattern(fileName, pattern)) {
      matchingBlob = item;
      break;
    }
  }
  
  if (!matchingBlob) {
    throw new Error('No matching file found to infer schema');
  }
  
  // Download sample of the file (first 100KB)
  const blobClient = containerClient.getBlobClient(matchingBlob.name);
  const downloadResponse = await blobClient.download(0, 102400);
  const fileContent = await streamToString(downloadResponse.readableStreamBody);
  
  const fileType = detectFileType(pattern);
  return inferSchemaFromContent(fileContent, fileType);
}

/**
 * Helper to match file name against pattern
 */
function matchFilePattern(fileName, pattern) {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(fileName);
}

/**
 * Helper to convert stream to string (Azure)
 */
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data.toString());
    });
    readableStream.on('end', () => {
      resolve(chunks.join(''));
    });
    readableStream.on('error', reject);
  });
}

/**
 * Infer schema from file content
 */
function inferSchemaFromContent(content, fileType) {
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('File is empty or unreadable');
  }
  
  switch (fileType) {
    case 'csv':
      return inferSchemaFromCSV(lines);
    
    case 'json':
      return inferSchemaFromJSON(content);
    
    default:
      // For unsupported types, return basic structure
      return [{
        column_name: 'data',
        data_type: 'string'
      }];
  }
}

/**
 * Infer schema from CSV content
 */
function inferSchemaFromCSV(lines) {
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row');
  }
  
  // Parse header
  const header = lines[0].split(',').map(col => col.trim().replace(/^"|"$/g, ''));
  
  // Parse sample rows to infer types
  const sampleRows = lines.slice(1, Math.min(11, lines.length)).map(line => 
    line.split(',').map(val => val.trim().replace(/^"|"$/g, ''))
  );
  
  return header.map((colName, idx) => {
    const sampleValues = sampleRows.map(row => row[idx]).filter(v => v);
    const inferredType = inferDataType(sampleValues);
    
    return {
      column_name: colName,
      data_type: inferredType
    };
  });
}

/**
 * Infer schema from JSON content
 */
function inferSchemaFromJSON(content) {
  try {
    const data = JSON.parse(content);
    const sample = Array.isArray(data) ? data[0] : data;
    
    if (!sample || typeof sample !== 'object') {
      throw new Error('Invalid JSON structure');
    }
    
    return Object.keys(sample).map(key => ({
      column_name: key,
      data_type: inferDataType([sample[key]])
    }));
  } catch (error) {
    throw new Error('Failed to parse JSON: ' + error.message);
  }
}

/**
 * Infer data type from sample values
 */
function inferDataType(values) {
  if (values.length === 0) return 'string';
  
  const allNumbers = values.every(v => !isNaN(v) && v !== '');
  if (allNumbers) {
    const hasDecimals = values.some(v => v.includes('.'));
    return hasDecimals ? 'float' : 'integer';
  }
  
  const allBooleans = values.every(v => 
    v.toLowerCase() === 'true' || v.toLowerCase() === 'false'
  );
  if (allBooleans) return 'boolean';
  
  const allDates = values.every(v => !isNaN(Date.parse(v)));
  if (allDates) return 'date';
  
  return 'string';
}

module.exports = router;
