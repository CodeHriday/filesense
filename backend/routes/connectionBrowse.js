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

module.exports = router;
