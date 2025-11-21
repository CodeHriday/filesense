/**
 * Upload Batch Service
 * 
 * Manages upload batch lifecycle, file tracking, and status aggregation
 * for programmatic file uploads via API
 */

const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class UploadBatchService {
  /**
   * Generate unique batch ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate unique file ID
   */
  generateFileId() {
    return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Create a new upload batch
   * 
   * @param {Object} params - Batch parameters
   * @param {number} params.userId - User ID
   * @param {number} params.apiTokenId - API token ID (optional)
   * @param {number} params.projectId - Project ID
   * @param {string} params.targetType - Target type ('vendor' or 'internal')
   * @param {number} params.targetId - Target ID (agreement ID or project ID)
   * @param {number} params.totalFiles - Total number of files in batch
   * @returns {Promise<Object>} - Created batch object
   */
  async createBatch({ userId, apiTokenId, projectId, targetType, targetId, totalFiles }) {
    const batchId = this.generateBatchId();

    const result = await query(
      `INSERT INTO upload_batches (
        batch_id, user_id, api_token_id, project_id, 
        target_type, target_id, total_files, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [batchId, userId, apiTokenId, projectId, targetType, targetId, totalFiles, 'pending']
    );

    return result.rows[0];
  }

  /**
   * Add file to upload batch
   * 
   * @param {Object} params - File parameters
   * @returns {Promise<Object>} - Created file object
   */
  async addFileToBatch({
    batchId,
    originalFilename,
    fileType,
    fileSizeBytes,
    mimeType,
    targetType,
    targetId
  }) {
    const fileId = this.generateFileId();

    const result = await query(
      `INSERT INTO upload_files (
        file_id, batch_id, original_filename, file_type,
        file_size_bytes, mime_type, target_type, target_id, status
      ) VALUES ($1, 
        (SELECT id FROM upload_batches WHERE batch_id = $2),
        $3, $4, $5, $6, $7, $8, $9
      )
      RETURNING *`,
      [fileId, batchId, originalFilename, fileType, fileSizeBytes, mimeType, targetType, targetId, 'pending']
    );

    return result.rows[0];
  }

  /**
   * Update file status and progress
   * 
   * @param {string} fileId - File ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated file object
   */
  async updateFileStatus(fileId, updates) {
    const {
      status,
      phase,
      processedRecords,
      totalRecords,
      errorMessage,
      errorDetails,
      virusScanStatus,
      virusScanResult,
      cloudStoragePath,
      cloudStorageUrl,
      catalogFileId,
      etlJobId
    } = updates;

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (phase !== undefined) {
      setClauses.push(`phase = $${paramIndex++}`);
      values.push(phase);
    }
    if (processedRecords !== undefined) {
      setClauses.push(`processed_records = $${paramIndex++}`);
      values.push(processedRecords);
    }
    if (totalRecords !== undefined) {
      setClauses.push(`total_records = $${paramIndex++}`);
      values.push(totalRecords);
    }
    if (errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(errorMessage);
    }
    if (errorDetails !== undefined) {
      setClauses.push(`error_details = $${paramIndex++}`);
      values.push(JSON.stringify(errorDetails));
    }
    if (virusScanStatus !== undefined) {
      setClauses.push(`virus_scan_status = $${paramIndex++}`);
      values.push(virusScanStatus);
    }
    if (virusScanResult !== undefined) {
      setClauses.push(`virus_scan_result = $${paramIndex++}`);
      values.push(virusScanResult);
    }
    if (cloudStoragePath !== undefined) {
      setClauses.push(`cloud_storage_path = $${paramIndex++}`);
      values.push(cloudStoragePath);
    }
    if (cloudStorageUrl !== undefined) {
      setClauses.push(`cloud_storage_url = $${paramIndex++}`);
      values.push(cloudStorageUrl);
    }
    if (catalogFileId !== undefined) {
      setClauses.push(`catalog_file_id = $${paramIndex++}`);
      values.push(catalogFileId);
    }
    if (etlJobId !== undefined) {
      setClauses.push(`etl_job_id = $${paramIndex++}`);
      values.push(etlJobId);
    }

    // Set timestamps
    if (status === 'processing' && !updates.started_at) {
      setClauses.push(`started_at = NOW()`);
    }
    if (status === 'completed' || status === 'failed') {
      setClauses.push(`completed_at = NOW()`);
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided');
    }

    values.push(fileId);

    const result = await query(
      `UPDATE upload_files 
       SET ${setClauses.join(', ')}
       WHERE file_id = $${paramIndex}
       RETURNING *`,
      values
    );

    // Update batch aggregates
    await this.updateBatchAggregates(result.rows[0].batch_id);

    return result.rows[0];
  }

  /**
   * Update batch aggregates based on file statuses
   * 
   * @param {number} batchIdPk - Batch primary key ID
   */
  async updateBatchAggregates(batchIdPk) {
    await query(
      `UPDATE upload_batches b
       SET 
         completed_files = (
           SELECT COUNT(*) FROM upload_files 
           WHERE batch_id = $1 AND status = 'completed'
         ),
         failed_files = (
           SELECT COUNT(*) FROM upload_files 
           WHERE batch_id = $1 AND status = 'failed'
         ),
         total_records = (
           SELECT COALESCE(SUM(total_records), 0) FROM upload_files 
           WHERE batch_id = $1
         ),
         processed_records = (
           SELECT COALESCE(SUM(processed_records), 0) FROM upload_files 
           WHERE batch_id = $1
         ),
         status = CASE
           WHEN (SELECT COUNT(*) FROM upload_files WHERE batch_id = $1 AND status = 'failed') = b.total_files 
             THEN 'failed'
           WHEN (SELECT COUNT(*) FROM upload_files WHERE batch_id = $1 AND status IN ('completed', 'failed')) = b.total_files 
             THEN 'completed'
           WHEN (SELECT COUNT(*) FROM upload_files WHERE batch_id = $1 AND status = 'processing') > 0 
             THEN 'processing'
           ELSE 'pending'
         END,
         started_at = CASE
           WHEN b.started_at IS NULL AND EXISTS (
             SELECT 1 FROM upload_files WHERE batch_id = $1 AND started_at IS NOT NULL
           ) THEN NOW()
           ELSE b.started_at
         END,
         completed_at = CASE
           WHEN (SELECT COUNT(*) FROM upload_files WHERE batch_id = $1 AND status IN ('completed', 'failed')) = b.total_files
             AND b.completed_at IS NULL
           THEN NOW()
           ELSE b.completed_at
         END
       WHERE id = $1`,
      [batchIdPk]
    );
  }

  /**
   * Get batch status with file details
   * 
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} - Batch with file details
   */
  async getBatchStatus(batchId) {
    const batchResult = await query(
      `SELECT * FROM upload_batches WHERE batch_id = $1`,
      [batchId]
    );

    if (batchResult.rows.length === 0) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const batch = batchResult.rows[0];

    const filesResult = await query(
      `SELECT * FROM upload_files 
       WHERE batch_id = $1 
       ORDER BY uploaded_at ASC`,
      [batch.id]
    );

    return {
      ...batch,
      files: filesResult.rows
    };
  }

  /**
   * Get file status
   * 
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} - File status
   */
  async getFileStatus(fileId) {
    const result = await query(
      `SELECT * FROM upload_files WHERE file_id = $1`,
      [fileId]
    );

    if (result.rows.length === 0) {
      throw new Error(`File not found: ${fileId}`);
    }

    return result.rows[0];
  }

  /**
   * List batches for user/project
   * 
   * @param {Object} filters - Filter parameters
   * @returns {Promise<Array>} - List of batches
   */
  async listBatches(filters = {}) {
    const { userId, projectId, status, limit = 50, offset = 0 } = filters;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(userId);
    }
    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      values.push(projectId);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    values.push(limit, offset);

    const result = await query(
      `SELECT * FROM upload_batches 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return result.rows;
  }
}

module.exports = UploadBatchService;
