/**
 * Archival Storage Service
 * 
 * Storage-agnostic abstraction layer for file archival operations.
 * Supports AWS S3, Google Cloud Storage, Azure Blob Storage, and local filesystem.
 * Designed for platform independence - storage provider is configurable per retention policy.
 */

const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs').promises;
const path = require('path');
const { systemLogger } = require('../utils/logger');
const crypto = require('crypto');

class ArchivalStorageService {
  constructor(dbPool) {
    this.pool = dbPool;
    this.logger = systemLogger;
  }

  /**
   * Archive a file to the configured storage
   * @param {Object} fileInfo - File information
   * @param {Object} storageConfig - Storage configuration from retention policy
   * @returns {Object} Archive result with path and metadata
   */
  async archiveFile(fileInfo, storageConfig) {
    const { storage_type, connection_id, archive_path_prefix } = storageConfig;

    try {
      this.logger.info('Starting file archival', {
        fileId: fileInfo.file_id,
        filename: fileInfo.filename,
        storage_type
      });

      // Build archive path
      const archivePath = this.buildArchivePath(
        fileInfo.filename,
        fileInfo.file_id,
        archive_path_prefix || 'archive'
      );

      // Get storage client based on storage type
      let archiveResult;

      switch (storage_type) {
        case 's3':
        case 'aws':
          archiveResult = await this.archiveToS3(fileInfo, archivePath, connection_id);
          break;
        
        case 'gcs':
        case 'google':
          archiveResult = await this.archiveToGCS(fileInfo, archivePath, connection_id);
          break;
        
        case 'azure':
          archiveResult = await this.archiveToAzure(fileInfo, archivePath, connection_id);
          break;
        
        case 'local':
        case 'filesystem':
          archiveResult = await this.archiveToLocal(fileInfo, archivePath, storageConfig);
          break;
        
        default:
          throw new Error(`Unsupported storage type: ${storage_type}`);
      }

      this.logger.info('File archival completed', {
        fileId: fileInfo.file_id,
        archivePath: archiveResult.archivePath,
        size: archiveResult.size
      });

      return {
        success: true,
        archivePath: archiveResult.archivePath,
        compressedSize: archiveResult.size,
        checksum: archiveResult.checksum,
        storageType: storage_type,
        archivedAt: new Date()
      };

    } catch (error) {
      this.logger.error('File archival failed', {
        fileId: fileInfo.file_id,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * Restore a file from archive storage
   * @param {string} archivePath - Path to archived file
   * @param {string} destinationPath - Where to restore the file
   * @param {Object} storageConfig - Storage configuration
   * @returns {Object} Restoration result
   */
  async restoreFile(archivePath, destinationPath, storageConfig) {
    const { storage_type, connection_id } = storageConfig;

    try {
      this.logger.info('Starting file restoration', {
        archivePath,
        destinationPath,
        storage_type
      });

      switch (storage_type) {
        case 's3':
        case 'aws':
          await this.restoreFromS3(archivePath, destinationPath, connection_id);
          break;
        
        case 'gcs':
        case 'google':
          await this.restoreFromGCS(archivePath, destinationPath, connection_id);
          break;
        
        case 'azure':
          await this.restoreFromAzure(archivePath, destinationPath, connection_id);
          break;
        
        case 'local':
        case 'filesystem':
          await this.restoreFromLocal(archivePath, destinationPath, storageConfig);
          break;
        
        default:
          throw new Error(`Unsupported storage type: ${storage_type}`);
      }

      this.logger.info('File restoration completed', {
        archivePath,
        destinationPath
      });

      return {
        success: true,
        restoredPath: destinationPath,
        restoredAt: new Date()
      };

    } catch (error) {
      this.logger.error('File restoration failed', {
        archivePath,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * Delete an archived file permanently
   * @param {string} archivePath - Path to archived file
   * @param {Object} storageConfig - Storage configuration
   */
  async deleteArchivedFile(archivePath, storageConfig) {
    const { storage_type, connection_id } = storageConfig;

    try {
      switch (storage_type) {
        case 's3':
        case 'aws':
          await this.deleteFromS3(archivePath, connection_id);
          break;
        
        case 'gcs':
        case 'google':
          await this.deleteFromGCS(archivePath, connection_id);
          break;
        
        case 'azure':
          await this.deleteFromAzure(archivePath, connection_id);
          break;
        
        case 'local':
        case 'filesystem':
          await this.deleteFromLocal(archivePath, storageConfig);
          break;
        
        default:
          throw new Error(`Unsupported storage type: ${storage_type}`);
      }

      this.logger.info('Archived file deleted', { archivePath });

    } catch (error) {
      this.logger.error('Failed to delete archived file', {
        archivePath,
        error: error.message
      });
      
      throw error;
    }
  }

  // ============================================================================
  // AWS S3 Operations
  // ============================================================================

  async archiveToS3(fileInfo, archivePath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const s3 = this.createS3Client(connection);

    // Read file from local storage
    const fileData = await fs.readFile(fileInfo.file_path);
    
    // Calculate checksum
    const checksum = crypto.createHash('md5').update(fileData).digest('hex');

    // Upload to S3
    const params = {
      Bucket: connection.config.bucket_name,
      Key: archivePath,
      Body: fileData,
      ContentType: this.getContentType(fileInfo.file_type),
      Metadata: {
        'original-filename': fileInfo.filename,
        'file-id': fileInfo.file_id,
        'archived-at': new Date().toISOString()
      }
    };

    await s3.upload(params).promise();

    return {
      archivePath,
      size: fileData.length,
      checksum
    };
  }

  async restoreFromS3(archivePath, destinationPath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const s3 = this.createS3Client(connection);

    const params = {
      Bucket: connection.config.bucket_name,
      Key: archivePath
    };

    const data = await s3.getObject(params).promise();
    await fs.writeFile(destinationPath, data.Body);
  }

  async deleteFromS3(archivePath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const s3 = this.createS3Client(connection);

    await s3.deleteObject({
      Bucket: connection.config.bucket_name,
      Key: archivePath
    }).promise();
  }

  createS3Client(connection) {
    return new AWS.S3({
      accessKeyId: connection.config.access_key,
      secretAccessKey: connection.config.secret_key,
      region: connection.config.region || 'us-east-1'
    });
  }

  // ============================================================================
  // Google Cloud Storage Operations
  // ============================================================================

  async archiveToGCS(fileInfo, archivePath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const storage = this.createGCSClient(connection);
    
    const bucket = storage.bucket(connection.config.bucket_name);
    const file = bucket.file(archivePath);

    // Read file data
    const fileData = await fs.readFile(fileInfo.file_path);
    const checksum = crypto.createHash('md5').update(fileData).digest('hex');

    await file.save(fileData, {
      metadata: {
        contentType: this.getContentType(fileInfo.file_type),
        metadata: {
          originalFilename: fileInfo.filename,
          fileId: fileInfo.file_id,
          archivedAt: new Date().toISOString()
        }
      }
    });

    return {
      archivePath,
      size: fileData.length,
      checksum
    };
  }

  async restoreFromGCS(archivePath, destinationPath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const storage = this.createGCSClient(connection);
    
    const bucket = storage.bucket(connection.config.bucket_name);
    const file = bucket.file(archivePath);

    await file.download({ destination: destinationPath });
  }

  async deleteFromGCS(archivePath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const storage = this.createGCSClient(connection);
    
    const bucket = storage.bucket(connection.config.bucket_name);
    await bucket.file(archivePath).delete();
  }

  createGCSClient(connection) {
    const credentials = {
      type: 'service_account',
      project_id: connection.config.project_id,
      private_key: connection.config.private_key,
      client_email: connection.config.client_email
    };

    return new Storage({
      credentials,
      projectId: connection.config.project_id
    });
  }

  // ============================================================================
  // Azure Blob Storage Operations
  // ============================================================================

  async archiveToAzure(fileInfo, archivePath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const { blobClient } = this.createAzureClient(connection, archivePath);

    // Read file data
    const fileData = await fs.readFile(fileInfo.file_path);
    const checksum = crypto.createHash('md5').update(fileData).digest('hex');

    const blockBlobClient = blobClient.getBlockBlobClient();
    await blockBlobClient.upload(fileData, fileData.length, {
      blobHTTPHeaders: {
        blobContentType: this.getContentType(fileInfo.file_type)
      },
      metadata: {
        originalFilename: fileInfo.filename,
        fileId: fileInfo.file_id,
        archivedAt: new Date().toISOString()
      }
    });

    return {
      archivePath,
      size: fileData.length,
      checksum
    };
  }

  async restoreFromAzure(archivePath, destinationPath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const { blobClient } = this.createAzureClient(connection, archivePath);

    await blobClient.downloadToFile(destinationPath);
  }

  async deleteFromAzure(archivePath, connectionId) {
    const connection = await this.getConnectionConfig(connectionId);
    const { blobClient } = this.createAzureClient(connection, archivePath);

    await blobClient.delete();
  }

  createAzureClient(connection, blobName) {
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${connection.config.account_name};AccountKey=${connection.config.account_key};EndpointSuffix=core.windows.net`;
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(connection.config.container_name);
    const blobClient = containerClient.getBlobClient(blobName);

    return { containerClient, blobClient };
  }

  // ============================================================================
  // Local Filesystem Operations
  // ============================================================================

  async archiveToLocal(fileInfo, archivePath, storageConfig) {
    const baseArchivePath = storageConfig.local_archive_path || './archive';
    const fullArchivePath = path.join(baseArchivePath, archivePath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullArchivePath), { recursive: true });

    // Copy file to archive location
    const fileData = await fs.readFile(fileInfo.file_path);
    const checksum = crypto.createHash('md5').update(fileData).digest('hex');

    await fs.writeFile(fullArchivePath, fileData);

    // Write metadata file
    const metadataPath = `${fullArchivePath}.metadata.json`;
    await fs.writeFile(metadataPath, JSON.stringify({
      originalFilename: fileInfo.filename,
      fileId: fileInfo.file_id,
      archivedAt: new Date().toISOString(),
      checksum
    }, null, 2));

    return {
      archivePath: fullArchivePath,
      size: fileData.length,
      checksum
    };
  }

  async restoreFromLocal(archivePath, destinationPath, storageConfig) {
    const baseArchivePath = storageConfig.local_archive_path || './archive';
    const fullArchivePath = path.join(baseArchivePath, archivePath);

    // Ensure destination directory exists
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    // Copy file from archive to destination
    await fs.copyFile(fullArchivePath, destinationPath);
  }

  async deleteFromLocal(archivePath, storageConfig) {
    const baseArchivePath = storageConfig.local_archive_path || './archive';
    const fullArchivePath = path.join(baseArchivePath, archivePath);

    // Delete file and metadata
    await fs.unlink(fullArchivePath);
    
    const metadataPath = `${fullArchivePath}.metadata.json`;
    try {
      await fs.unlink(metadataPath);
    } catch (error) {
      // Metadata file might not exist, that's okay
      this.logger.debug('Metadata file not found during deletion', { metadataPath });
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get connection configuration from database
   */
  async getConnectionConfig(connectionId) {
    const result = await this.pool.query(`
      SELECT * FROM connections WHERE id = $1
    `, [connectionId]);

    if (result.rows.length === 0) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    return result.rows[0];
  }

  /**
   * Build archive path for a file
   */
  buildArchivePath(filename, fileId, prefix = 'archive') {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Organize archives by date: archive/2025/11/05/filename_fileId.ext
    return `${prefix}/${year}/${month}/${day}/${fileId}_${filename}`;
  }

  /**
   * Get content type based on file extension
   */
  getContentType(fileType) {
    const contentTypes = {
      'csv': 'text/csv',
      'json': 'application/json',
      'xml': 'application/xml',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'parquet': 'application/octet-stream',
      'txt': 'text/plain'
    };

    return contentTypes[fileType] || 'application/octet-stream';
  }
}

module.exports = ArchivalStorageService;
