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
 * @param {number|string} connectionId - Connection ID (integer for regular connections, UUID for vendor connections)
 * @returns {Promise<Array>} - List of files
 */
async function listFilesFromConnection(pool, connectionId) {
  try {
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

    const config = connection.config || {};

    // Determine the actual storage type
    let storageType = connection.type.toLowerCase();
    
    // For vendor connections, get the storage type from config
    if (storageType === 'vendor') {
      storageType = (config.storage_type || config.provider || '').toLowerCase();
    }

    // Decrypt credentials if encrypted
    const decryptedConfig = decryptCredentials(storageType, config);

    // Normalize field names for vendor connections
    // Vendor connections use different field names than regular connections
    if (connection.type.toLowerCase() === 'vendor') {
      // Map vendor field names to expected field names
      if (config.bucket && !decryptedConfig.bucket_name) {
        decryptedConfig.bucket_name = config.bucket;
      }
      if (decryptedConfig.access_key_id && !decryptedConfig.access_key) {
        decryptedConfig.access_key = decryptedConfig.access_key_id;
      }
      if (decryptedConfig.secret_access_key && !decryptedConfig.secret_key) {
        decryptedConfig.secret_key = decryptedConfig.secret_access_key;
      }
      // Copy other fields
      if (config.region) decryptedConfig.region = config.region;
    }

    // List files based on storage type
    switch (storageType) {
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
        throw new Error(`Unsupported storage type: ${storageType} (connection type: ${connection.type})`);
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
    // Get connection to check bucket name
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
    
    // Get all files from connection
    const allFiles = await listFilesFromConnection(pool, connectionId);

    // Normalize pattern - strip bucket name prefix if present (S3 object keys don't include bucket name)
    let normalizedPattern = pattern;
    if (connection && connection.config) {
      const config = typeof connection.config === 'string' 
        ? JSON.parse(connection.config) 
        : connection.config;
      
      const bucketName = config.bucket_name || config.container_name;
      if (bucketName && normalizedPattern.startsWith(bucketName + '/')) {
        normalizedPattern = normalizedPattern.substring(bucketName.length + 1);
        console.log(`Stripped bucket name from pattern: "${pattern}" -> "${normalizedPattern}"`);
      }
    }

    // Use safe regex conversion to prevent ReDoS
    const { globToRegex } = require('./regexValidator');
    const patternRegex = globToRegex(normalizedPattern);

    // Filter files by pattern
    const matchedFiles = allFiles.filter(file => 
      patternRegex.test(file.filename)
    );
    
    console.log(`listAndFilterFiles: pattern="${normalizedPattern}", matched ${matchedFiles.length} of ${allFiles.length} files`);

    return matchedFiles;
  } catch (error) {
    console.error('Error listing and filtering files:', error);
    throw error;
  }
}

/**
 * Download file from AWS S3
 */
async function downloadS3File(config, filename) {
  try {
    const s3 = new AWS.S3({
      accessKeyId: config.access_key,
      secretAccessKey: config.secret_key,
      region: config.region
    });

    const params = {
      Bucket: config.bucket_name,
      Key: filename
    };

    const data = await s3.getObject(params).promise();
    return data.Body;
  } catch (error) {
    console.error('Error downloading S3 file:', error);
    throw new Error(`Failed to download S3 file: ${error.message}`);
  }
}

/**
 * Download file from Google Cloud Storage
 */
async function downloadGCSFile(config, filename) {
  try {
    const storage = new Storage({
      projectId: config.project_id,
      credentials: {
        client_email: config.client_email,
        private_key: config.private_key
      }
    });

    const file = storage.bucket(config.bucket_name).file(filename);
    const [contents] = await file.download();
    return contents;
  } catch (error) {
    console.error('Error downloading GCS file:', error);
    throw new Error(`Failed to download GCS file: ${error.message}`);
  }
}

/**
 * Download file from Azure Blob Storage
 */
async function downloadAzureFile(config, filename) {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      `DefaultEndpointsProtocol=https;AccountName=${config.account_name};AccountKey=${config.account_key};EndpointSuffix=core.windows.net`
    );

    const containerClient = blobServiceClient.getContainerClient(config.container_name);
    const blobClient = containerClient.getBlobClient(filename);
    const downloadResponse = await blobClient.download(0);
    
    return await streamToBuffer(downloadResponse.readableStreamBody);
  } catch (error) {
    console.error('Error downloading Azure file:', error);
    throw new Error(`Failed to download Azure file: ${error.message}`);
  }
}

/**
 * Upload file to AWS S3
 */
async function uploadS3File(config, filename, buffer) {
  try {
    const s3 = new AWS.S3({
      accessKeyId: config.access_key,
      secretAccessKey: config.secret_key,
      region: config.region
    });

    const params = {
      Bucket: config.bucket_name,
      Key: filename,
      Body: buffer
    };

    await s3.putObject(params).promise();
    return { success: true, location: `s3://${config.bucket_name}/${filename}` };
  } catch (error) {
    console.error('Error uploading S3 file:', error);
    throw new Error(`Failed to upload S3 file: ${error.message}`);
  }
}

/**
 * Upload file to Google Cloud Storage
 */
async function uploadGCSFile(config, filename, buffer) {
  try {
    const storage = new Storage({
      projectId: config.project_id,
      credentials: {
        client_email: config.client_email,
        private_key: config.private_key
      }
    });

    const file = storage.bucket(config.bucket_name).file(filename);
    await file.save(buffer);
    return { success: true, location: `gs://${config.bucket_name}/${filename}` };
  } catch (error) {
    console.error('Error uploading GCS file:', error);
    throw new Error(`Failed to upload GCS file: ${error.message}`);
  }
}

/**
 * Upload file to Azure Blob Storage
 */
async function uploadAzureFile(config, filename, buffer) {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      `DefaultEndpointsProtocol=https;AccountName=${config.account_name};AccountKey=${config.account_key};EndpointSuffix=core.windows.net`
    );

    const containerClient = blobServiceClient.getContainerClient(config.container_name);
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.upload(buffer, buffer.length);
    
    return { success: true, location: `https://${config.account_name}.blob.core.windows.net/${config.container_name}/${filename}` };
  } catch (error) {
    console.error('Error uploading Azure file:', error);
    throw new Error(`Failed to upload Azure file: ${error.message}`);
  }
}

/**
 * Download file from cloud storage connection
 */
async function downloadFileFromConnection(pool, connectionId, filename) {
  try {
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

    const config = connection.config || {};

    // Determine the actual storage type
    let storageType = connection.type.toLowerCase();
    
    // For vendor connections, get the storage type from config
    if (storageType === 'vendor') {
      storageType = (config.storage_type || config.provider || '').toLowerCase();
    }

    const decryptedConfig = decryptCredentials(storageType, config);

    // Normalize field names for vendor connections
    if (connection.type.toLowerCase() === 'vendor') {
      if (config.bucket && !decryptedConfig.bucket_name) {
        decryptedConfig.bucket_name = config.bucket;
      }
      if (decryptedConfig.access_key_id && !decryptedConfig.access_key) {
        decryptedConfig.access_key = decryptedConfig.access_key_id;
      }
      if (decryptedConfig.secret_access_key && !decryptedConfig.secret_key) {
        decryptedConfig.secret_key = decryptedConfig.secret_access_key;
      }
      if (config.region) decryptedConfig.region = config.region;
    }

    switch (storageType) {
      case 'aws':
      case 's3':
        return await downloadS3File(decryptedConfig, filename);
      
      case 'gcs':
      case 'google':
        return await downloadGCSFile(decryptedConfig, filename);
      
      case 'azure':
      case 'blob':
        return await downloadAzureFile(decryptedConfig, filename);
      
      default:
        throw new Error(`Unsupported storage type: ${storageType} (connection type: ${connection.type})`);
    }
  } catch (error) {
    console.error('Error downloading file from connection:', error);
    throw error;
  }
}

/**
 * Upload file to cloud storage connection
 */
async function uploadFileToConnection(pool, connectionId, filename, buffer) {
  try {
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

    const config = connection.config || {};

    // Determine the actual storage type
    let storageType = connection.type.toLowerCase();
    
    // For vendor connections, get the storage type from config
    if (storageType === 'vendor') {
      storageType = (config.storage_type || config.provider || '').toLowerCase();
    }

    const decryptedConfig = decryptCredentials(storageType, config);

    // Normalize field names for vendor connections
    if (connection.type.toLowerCase() === 'vendor') {
      if (config.bucket && !decryptedConfig.bucket_name) {
        decryptedConfig.bucket_name = config.bucket;
      }
      if (decryptedConfig.access_key_id && !decryptedConfig.access_key) {
        decryptedConfig.access_key = decryptedConfig.access_key_id;
      }
      if (decryptedConfig.secret_access_key && !decryptedConfig.secret_key) {
        decryptedConfig.secret_key = decryptedConfig.secret_access_key;
      }
      if (config.region) decryptedConfig.region = config.region;
    }

    switch (storageType) {
      case 'aws':
      case 's3':
        return await uploadS3File(decryptedConfig, filename, buffer);
      
      case 'gcs':
      case 'google':
        return await uploadGCSFile(decryptedConfig, filename, buffer);
      
      case 'azure':
      case 'blob':
        return await uploadAzureFile(decryptedConfig, filename, buffer);
      
      default:
        throw new Error(`Unsupported storage type: ${storageType} (connection type: ${connection.type})`);
    }
  } catch (error) {
    console.error('Error uploading file to connection:', error);
    throw error;
  }
}

/**
 * Convert stream to buffer (for Azure)
 */
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

module.exports = {
  listS3Files,
  listGCSFiles,
  listAzureFiles,
  listFilesFromConnection,
  listAndFilterFiles,
  downloadS3File,
  downloadGCSFile,
  downloadAzureFile,
  uploadS3File,
  uploadGCSFile,
  uploadAzureFile,
  downloadFileFromConnection,
  uploadFileToConnection
};
