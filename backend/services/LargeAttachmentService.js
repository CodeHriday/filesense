/**
 * Large Attachment Service
 * 
 * Handles oversized email attachments by uploading to cloud storage
 * and generating signed/temporary download URLs.
 */

const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { uploadFileToConnection } = require('../utils/cloudStorageFileList');
const { decryptCredentials } = require('../utils/encryption');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const attachmentBuilder = require('./AttachmentBuilder');

class LargeAttachmentService {
  constructor() {
    // Default signed URL expiration: 7 days
    this.DEFAULT_URL_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;
    
    // Attachment folder in cloud storage
    this.ATTACHMENT_FOLDER = 'email-attachments';
  }

  /**
   * Generate and upload attachment, return download URL if oversized
   * @param {string} jobId - Job ID
   * @param {string} connectionId - Cloud storage connection ID
   * @param {Object} options - { format, limit, includeRecordSnapshot, expirationSeconds }
   * @returns {Promise<Object>} - { inline, buffer, filename, downloadUrl, size, rowCount, truncated }
   */
  async prepareJobViolationsAttachment(jobId, connectionId, options = {}) {
    try {
      const { format = 'csv', limit, includeRecordSnapshot = false, expirationSeconds } = options;

      // Generate attachment using AttachmentBuilder with keepBufferForUpload=true
      // This ensures we get the buffer even if it exceeds inline size limit
      const attachment = await attachmentBuilder.generateJobViolationsAttachment(jobId, format, {
        limit,
        includeRecordSnapshot,
        keepBufferForUpload: true
      });

      if (!attachment) {
        return null; // No violations found
      }

      // If attachment is small enough for inline, return it directly
      if (!attachment.requiresCloudUpload) {
        return {
          inline: true,
          buffer: attachment.buffer,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          rowCount: attachment.rowCount,
          truncated: attachment.truncated
        };
      }

      // Attachment is too large - upload to cloud storage
      systemLogger.info('Uploading oversized attachment to cloud storage', {
        jobId,
        size: attachment.size,
        sizeFormatted: attachmentBuilder.formatSize(attachment.size)
      });

      // Defensive validation - ensure buffer is present
      if (!attachment.buffer) {
        throw new Error('Buffer is null for oversized attachment - keepBufferForUpload flag may not be set correctly');
      }

      const uploadPath = `${this.ATTACHMENT_FOLDER}/${attachment.filename}`;

      // Upload to cloud storage using the buffer from attachment
      const uploadResult = await uploadFileToConnection(
        pool,
        connectionId,
        uploadPath,
        attachment.buffer
      );

      systemLogger.info('Uploaded oversized attachment to cloud storage', {
        jobId,
        location: uploadResult.location
      });

      // Generate signed URL
      const downloadUrl = await this.generateSignedUrl(
        connectionId,
        uploadPath,
        expirationSeconds || this.DEFAULT_URL_EXPIRATION_SECONDS
      );

      return {
        inline: false,
        buffer: null,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        downloadUrl,
        size: attachment.size,
        rowCount: attachment.rowCount,
        truncated: attachment.truncated,
        expiresIn: expirationSeconds || this.DEFAULT_URL_EXPIRATION_SECONDS
      };
    } catch (error) {
      systemLogger.error('Error preparing job violations attachment', {
        jobId,
        connectionId,
        error: error.message
      });
      throw error;
    }
  }


  /**
   * Generate signed URL for cloud storage file
   * @param {string} connectionId - Cloud storage connection ID
   * @param {string} filepath - File path in cloud storage
   * @param {number} expirationSeconds - URL expiration time in seconds
   * @returns {Promise<string>} - Signed URL
   */
  async generateSignedUrl(connectionId, filepath, expirationSeconds) {
    try {
      // Get connection details
      let connection = null;
      
      const transformResult = await pool.query(
        'SELECT * FROM transform_connections WHERE id::text = $1',
        [String(connectionId)]
      );

      if (transformResult.rows.length > 0) {
        connection = transformResult.rows[0];
      } else {
        const storageResult = await pool.query(
          'SELECT * FROM storage_connections WHERE connection_id = $1',
          [connectionId]
        );
        
        if (storageResult.rows.length > 0) {
          connection = storageResult.rows[0];
        }
      }

      if (!connection) {
        throw new Error(`Connection ${connectionId} not found`);
      }

      const config = connection.config || {};
      let storageType = connection.type.toLowerCase();
      
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

      // Generate signed URL based on storage type
      switch (storageType) {
        case 'aws':
        case 's3':
          return this.generateS3SignedUrl(decryptedConfig, filepath, expirationSeconds);
        
        case 'gcs':
        case 'google':
          return this.generateGCSSignedUrl(decryptedConfig, filepath, expirationSeconds);
        
        case 'azure':
        case 'blob':
          return this.generateAzureSignedUrl(decryptedConfig, filepath, expirationSeconds);
        
        default:
          throw new Error(`Unsupported storage type for signed URLs: ${storageType}`);
      }
    } catch (error) {
      systemLogger.error('Error generating signed URL', {
        connectionId,
        filepath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate AWS S3 signed URL
   * @private
   */
  async generateS3SignedUrl(config, filepath, expirationSeconds) {
    try {
      const s3 = new AWS.S3({
        accessKeyId: config.access_key,
        secretAccessKey: config.secret_key,
        region: config.region
      });

      const params = {
        Bucket: config.bucket_name,
        Key: filepath,
        Expires: expirationSeconds
      };

      const signedUrl = await s3.getSignedUrlPromise('getObject', params);
      return signedUrl;
    } catch (error) {
      systemLogger.error('Error generating S3 signed URL', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate Google Cloud Storage signed URL
   * @private
   */
  async generateGCSSignedUrl(config, filepath, expirationSeconds) {
    try {
      const storage = new Storage({
        projectId: config.project_id,
        credentials: {
          client_email: config.client_email,
          private_key: config.private_key
        }
      });

      const file = storage.bucket(config.bucket_name).file(filepath);
      
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + (expirationSeconds * 1000)
      });

      return signedUrl;
    } catch (error) {
      systemLogger.error('Error generating GCS signed URL', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate Azure Blob Storage signed URL (SAS token)
   * @private
   */
  async generateAzureSignedUrl(config, filepath, expirationSeconds) {
    try {
      const accountName = config.account_name;
      const accountKey = config.account_key;
      const containerName = config.container_name;

      // Create shared key credential
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

      // Generate SAS token
      const sasOptions = {
        containerName,
        blobName: filepath,
        permissions: BlobSASPermissions.parse('r'), // Read-only permission
        startsOn: new Date(),
        expiresOn: new Date(Date.now() + (expirationSeconds * 1000))
      };

      const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();

      // Construct signed URL
      const signedUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${filepath}?${sasToken}`;
      
      return signedUrl;
    } catch (error) {
      systemLogger.error('Error generating Azure signed URL', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate and upload consolidated attachment for multiple jobs, return download URL if oversized
   * @param {Array<string>} jobIds - Array of job IDs
   * @param {string} connectionId - Cloud storage connection ID
   * @param {Object} options - { format, limit, includeRecordSnapshot, expirationSeconds }
   * @returns {Promise<Object>} - { inline, buffer, filename, downloadUrl, size, rowCount, truncated }
   */
  async prepareConsolidatedViolationsAttachment(jobIds, connectionId, options = {}) {
    try {
      const { format = 'csv', limit, includeRecordSnapshot = false, expirationSeconds } = options;

      // Generate consolidated attachment with keepBufferForUpload=true
      const attachment = await attachmentBuilder.generateConsolidatedViolationsAttachment(jobIds, format, {
        limit,
        includeRecordSnapshot,
        keepBufferForUpload: true
      });

      if (!attachment) {
        return null; // No violations found
      }

      // If attachment is small enough for inline, return it directly
      if (!attachment.requiresCloudUpload) {
        return {
          inline: true,
          buffer: attachment.buffer,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          rowCount: attachment.rowCount,
          truncated: attachment.truncated
        };
      }

      // Attachment is too large - upload to cloud storage
      systemLogger.info('Uploading oversized consolidated attachment to cloud storage', {
        jobCount: jobIds.length,
        size: attachment.size,
        sizeFormatted: attachmentBuilder.formatSize(attachment.size)
      });

      // Defensive validation - ensure buffer is present
      if (!attachment.buffer) {
        throw new Error('Buffer is null for oversized consolidated attachment - keepBufferForUpload flag may not be set correctly');
      }

      const uploadPath = `${this.ATTACHMENT_FOLDER}/${attachment.filename}`;

      // Upload to cloud storage using the buffer from attachment
      const uploadResult = await uploadFileToConnection(
        pool,
        connectionId,
        uploadPath,
        attachment.buffer
      );

      systemLogger.info('Uploaded oversized consolidated attachment to cloud storage', {
        jobCount: jobIds.length,
        location: uploadResult.location
      });

      // Generate signed URL
      const downloadUrl = await this.generateSignedUrl(
        connectionId,
        uploadPath,
        expirationSeconds || this.DEFAULT_URL_EXPIRATION_SECONDS
      );

      return {
        inline: false,
        buffer: null,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        downloadUrl,
        size: attachment.size,
        rowCount: attachment.rowCount,
        truncated: attachment.truncated,
        expiresIn: expirationSeconds || this.DEFAULT_URL_EXPIRATION_SECONDS
      };
    } catch (error) {
      systemLogger.error('Error preparing consolidated violations attachment', {
        jobIds,
        connectionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up expired attachments from cloud storage (optional maintenance task)
   * @param {string} connectionId - Cloud storage connection ID
   * @param {number} maxAgeSeconds - Max age in seconds (default: 30 days)
   */
  async cleanupExpiredAttachments(connectionId, maxAgeSeconds = 30 * 24 * 60 * 60) {
    try {
      systemLogger.info('Cleanup of expired attachments not yet implemented', {
        connectionId,
        maxAgeSeconds
      });
      
      // TODO: Implement cleanup logic if needed
      // This would list files in ATTACHMENT_FOLDER and delete files older than maxAgeSeconds
    } catch (error) {
      systemLogger.error('Error cleaning up expired attachments', {
        connectionId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new LargeAttachmentService();
