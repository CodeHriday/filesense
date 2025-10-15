/**
 * Cloud Storage File Listing Utility
 * Lists files from AWS S3, Google Cloud Storage, and Azure Blob Storage
 */

const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const { decryptCredentials } = require('./encryption');

/**
 * List files from AWS S3
 */
async function listS3Files(config) {
  try {
    const s3 = new AWS.S3({
      accessKeyId: config.access_key,
      secretAccessKey: config.secret_key,
      region: config.region
    });

    const params = {
      Bucket: config.bucket_name,
      MaxKeys: 1000
    };

    const data = await s3.listObjectsV2(params).promise();
    
    return data.Contents.map(item => ({
      filename: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      source: 's3'
    }));
  } catch (error) {
    console.error('Error listing S3 files:', error);
    throw new Error(`Failed to list S3 files: ${error.message}`);
  }
}

/**
 * List files from Google Cloud Storage
 */
async function listGCSFiles(config) {
  try {
    const storage = new Storage({
      projectId: config.project_id,
      credentials: {
        client_email: config.client_email,
        private_key: config.private_key
      }
    });

    const [files] = await storage.bucket(config.bucket_name).getFiles();
    
    return files.map(file => ({
      filename: file.name,
      size: file.metadata.size,
      lastModified: file.metadata.updated,
      source: 'gcs'
    }));
  } catch (error) {
    console.error('Error listing GCS files:', error);
    throw new Error(`Failed to list GCS files: ${error.message}`);
  }
}

/**
 * List files from Azure Blob Storage
 */
async function listAzureFiles(config) {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      `DefaultEndpointsProtocol=https;AccountName=${config.account_name};AccountKey=${config.account_key};EndpointSuffix=core.windows.net`
    );

    const containerClient = blobServiceClient.getContainerClient(config.container_name);
    const files = [];

    for await (const blob of containerClient.listBlobsFlat()) {
      files.push({
        filename: blob.name,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified,
        source: 'azure'
      });
    }

    return files;
  } catch (error) {
    console.error('Error listing Azure files:', error);
    throw new Error(`Failed to list Azure files: ${error.message}`);
  }
}

/**
 * List files from a cloud storage connection
 * @param {Pool} pool - Database connection pool
 * @param {number} connectionId - Connection ID
 * @returns {Promise<Array>} - List of files
 */
async function listFilesFromConnection(pool, connectionId) {
  try {
    // Get connection details from transform_connections table
    const result = await pool.query(
      'SELECT * FROM transform_connections WHERE connection_id = $1',
      [connectionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Connection not found');
    }

    const connection = result.rows[0];
    const config = connection.config || {};

    // Decrypt credentials if encrypted
    const decryptedConfig = decryptCredentials(connection.type, config);

    // List files based on connection type
    switch (connection.type.toLowerCase()) {
      case 'aws':
      case 's3':
        return await listS3Files(decryptedConfig);
      
      case 'gcs':
      case 'google':
        return await listGCSFiles(decryptedConfig);
      
      case 'azure':
      case 'blob':
        return await listAzureFiles(decryptedConfig);
      
      default:
        throw new Error(`Unsupported connection type: ${connection.type}`);
    }
  } catch (error) {
    console.error('Error listing files from connection:', error);
    throw error;
  }
}

/**
 * List files and filter by pattern
 * @param {Pool} pool - Database connection pool
 * @param {number} connectionId - Connection ID
 * @param {string} pattern - File pattern with wildcards
 * @returns {Promise<Array>} - Filtered list of files
 */
async function listAndFilterFiles(pool, connectionId, pattern) {
  try {
    // Get all files from connection
    const allFiles = await listFilesFromConnection(pool, connectionId);

    // Convert pattern to regex
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const patternRegex = new RegExp(`^${regex}$`, 'i');

    // Filter files by pattern
    const matchedFiles = allFiles.filter(file => 
      patternRegex.test(file.filename)
    );

    return matchedFiles;
  } catch (error) {
    console.error('Error listing and filtering files:', error);
    throw error;
  }
}

module.exports = {
  listS3Files,
  listGCSFiles,
  listAzureFiles,
  listFilesFromConnection,
  listAndFilterFiles
};
