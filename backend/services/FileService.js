/**
 * File Service
 * 
 * Handles all file-related operations including uploads, processing,
 * quality checks, and catalog management.
 */

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');

const ServiceBase = require('./ServiceBase');
const { systemLogger, performanceLogger } = require('../utils/logger');
const { processFileAsync } = require('../utils/asyncProcessor');

// Promisify fs functions
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

class FileService extends ServiceBase {
  constructor() {
    super();
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.ensureUploadDir();
  }

  /**
   * Ensure upload directory exists
   */
  ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.info('Created upload directory', { path: this.uploadDir });
    }
  }

  /**
   * Upload and process a file
   * 
   * @param {Object} fileData - File data from multer
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async uploadAndProcessFile(fileData, options = {}) {
    const traceId = this.generateTraceId();
    this.logger.info('Uploading and processing file', { 
      filename: fileData.originalname,
      size: fileData.size,
      traceId
    });

    try {
      // Generate a unique file ID
      const fileId = `file_${Date.now()}`;
      
      // Process the file asynchronously
      const processingTask = processFileAsync({
        filePath: fileData.path,
        fileName: fileData.originalname,
        fileType: path.extname(fileData.originalname).toLowerCase().substring(1),
        fileId,
        traceId,
        options
      });
      
      // Save initial file metadata to database
      const initialMetadata = {
        file_id: fileId,
        filename: fileData.originalname,
        file_type: path.extname(fileData.originalname).toLowerCase().substring(1),
        file_size: fileData.size.toString(),
        metadata: {
          path: fileData.path
        },
        processing_status: 'processing'
      };
      
      // Insert initial file record
      const insertQuery = `
        INSERT INTO files 
        (file_id, filename, file_type, file_size, metadata, processed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
        RETURNING id, file_id
      `;
      
      const result = await this.executeQuery(insertQuery, [
        initialMetadata.file_id,
        initialMetadata.filename,
        initialMetadata.file_type,
        initialMetadata.file_size,
        JSON.stringify(initialMetadata.metadata)
      ]);
      
      // Return initial response with task ID
      return {
        fileId: initialMetadata.file_id,
        taskId: processingTask.taskId,
        status: 'processing',
        message: 'File upload initiated. Processing in background.'
      };
    } catch (error) {
      this.logger.error('Error uploading file', { 
        error: error.message, 
        stack: error.stack,
        filename: fileData.originalname,
        traceId
      });
      throw error;
    }
  }

  /**
   * Get file catalog from database
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} File catalog
   */
  async getFileCatalog(options = {}) {
    const { sortBy = 'created_at', sortOrder = 'DESC', limit = 100, offset = 0 } = options;
    const traceId = this.generateTraceId();
    
    this.logger.info('Fetching file catalog', { traceId, sortBy, sortOrder, limit, offset });
    
    // Validate sort column to prevent SQL injection
    const validSortColumns = ['id', 'filename', 'file_type', 'file_size', 'created_at', 'processed_at', 'quality_score'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    
    // Validate sort order
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    const query = `
      SELECT * FROM files
      ORDER BY ${sortColumn} ${order}
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await this.executeQuery(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      this.logger.error('Error fetching file catalog', { 
        error: error.message,
        traceId
      });
      throw error;
    }
  }

  /**
   * Get a single file by ID
   * 
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File data
   */
  async getFileById(fileId) {
    const traceId = this.generateTraceId();
    this.logger.info('Fetching file by ID', { fileId, traceId });
    
    const query = `
      SELECT * FROM files WHERE file_id = $1 OR id = $1
    `;
    
    try {
      const result = await this.executeQuery(query, [fileId]);
      
      if (result.rows.length === 0) {
        this.logger.warn('File not found', { fileId, traceId });
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error fetching file by ID', { 
        error: error.message,
        fileId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Delete a file
   * 
   * @param {string} fileId - File ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileId) {
    const traceId = this.generateTraceId();
    this.logger.info('Deleting file', { fileId, traceId });
    
    try {
      // Get file information first
      const fileInfo = await this.getFileById(fileId);
      
      if (!fileInfo) {
        this.logger.warn('File not found for deletion', { fileId, traceId });
        return false;
      }
      
      // Delete from database within a transaction
      await this.executeTransaction(async (client) => {
        // Delete from the main files table
        await client.query('DELETE FROM files WHERE file_id = $1 OR id = $1', [fileId]);
        
        // Optional: Delete related records from other tables
        // await client.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
        // await client.query('DELETE FROM file_history WHERE file_id = $1', [fileId]);
      });
      
      // Try to delete the physical file if path is available
      if (fileInfo.metadata && fileInfo.metadata.path) {
        const filePath = fileInfo.metadata.path;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.info('Deleted physical file', { path: filePath, traceId });
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('Error deleting file', { 
        error: error.message,
        fileId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Update file metadata
   * 
   * @param {string} fileId - File ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated file data
   */
  async updateFile(fileId, updates) {
    const traceId = this.generateTraceId();
    this.logger.info('Updating file', { fileId, traceId, fields: Object.keys(updates) });
    
    // Check which fields are updatable
    const updatableFields = [
      'filename', 'quality_score', 'row_count', 'column_count', 
      'metadata', 'tags', 'description'
    ];
    
    // Filter out non-updatable fields
    const validUpdates = {};
    for (const field of updatableFields) {
      if (updates[field] !== undefined) {
        validUpdates[field] = updates[field];
      }
    }
    
    if (Object.keys(validUpdates).length === 0) {
      this.logger.warn('No valid fields to update', { fileId, traceId });
      return await this.getFileById(fileId);
    }
    
    try {
      // Build dynamic update query
      const setClauses = [];
      const queryParams = [];
      let paramCounter = 1;
      
      for (const [field, value] of Object.entries(validUpdates)) {
        if (field === 'metadata') {
          setClauses.push(`${field} = $${paramCounter}`);
          queryParams.push(JSON.stringify(value));
        } else {
          setClauses.push(`${field} = $${paramCounter}`);
          queryParams.push(value);
        }
        paramCounter++;
      }
      
      // Add updated_at timestamp
      setClauses.push(`updated_at = NOW()`);
      
      // Add file ID as the last parameter
      queryParams.push(fileId);
      
      const query = `
        UPDATE files
        SET ${setClauses.join(', ')}
        WHERE file_id = $${paramCounter} OR id = $${paramCounter}
        RETURNING *
      `;
      
      const result = await this.executeQuery(query, queryParams);
      
      if (result.rows.length === 0) {
        this.logger.warn('File not found for update', { fileId, traceId });
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error updating file', { 
        error: error.message,
        fileId,
        traceId
      });
      throw error;
    }
  }
}

module.exports = new FileService();