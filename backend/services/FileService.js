/**
 * File Service
 * 
 * Handles file management operations including upload, storage, metadata
 * extraction, catalog management, and lifecycle tracking.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const ServiceBase = require('./ServiceBase');

// Promisify file system operations
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

class FileService extends ServiceBase {
  /**
   * Create a new FileService instance
   * 
   * @param {Pool} dbPool - PostgreSQL connection pool
   * @param {Object} logger - Logger instance
   */
  constructor(dbPool, logger) {
    super(dbPool, logger);
    
    // Set up upload directory
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.tempDir = path.join(this.uploadDir, 'temp');
    this.ensureDirectoriesExist();
    
    // Allowed file types with validation functions
    this.allowedTypes = {
      csv: this.validateCsv.bind(this),
      json: this.validateJson.bind(this),
      parquet: this.validateParquet.bind(this),
      xlsx: this.validateExcel.bind(this)
    };
  }
  
  /**
   * Ensure required directories exist
   * 
   * @private
   */
  async ensureDirectoriesExist() {
    try {
      if (!fs.existsSync(this.uploadDir)) {
        await mkdir(this.uploadDir, { recursive: true });
        this.logger.info('Created uploads directory', { path: this.uploadDir });
      }
      
      if (!fs.existsSync(this.tempDir)) {
        await mkdir(this.tempDir, { recursive: true });
        this.logger.info('Created temporary uploads directory', { path: this.tempDir });
      }
    } catch (error) {
      this.logger.error('Error creating directories', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Save an uploaded file and store metadata
   * 
   * @param {Object} fileData - File data from multer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} - File metadata
   */
  async saveFile(fileData, options = {}) {
    const traceId = this.generateTraceId();
    this.logger.info('Saving uploaded file', { 
      filename: fileData.originalname,
      size: fileData.size,
      traceId
    });
    
    try {
      // Generate unique ID for the file
      const fileId = `file_${Date.now()}`;
      const extension = path.extname(fileData.originalname).toLowerCase().substring(1);
      
      // Basic validation
      if (!this.allowedTypes[extension]) {
        throw new Error(`File type not supported: ${extension}`);
      }
      
      // Additional type-specific validation
      await this.allowedTypes[extension](fileData.path);
      
      // Extract file metadata
      const metadata = await this.extractMetadata(fileData, extension);
      
      // Store in database 
      const fileRecord = await this.executeTransaction(async (client) => {
        // Insert file record
        const insertQuery = `
          INSERT INTO files (
            file_id, 
            filename, 
            file_type, 
            file_size, 
            row_count,
            column_count, 
            processed_at,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
          RETURNING *
        `;
        
        const result = await client.query(insertQuery, [
          fileId,
          fileData.originalname,
          extension,
          fileData.size.toString(),
          metadata.rowCount || 0,
          metadata.columnCount || 0,
          JSON.stringify({ path: fileData.path })
        ]);
        
        // Insert column metadata if available
        if (metadata.columns && metadata.columns.length > 0) {
          for (let i = 0; i < metadata.columns.length; i++) {
            const column = metadata.columns[i];
            
            await client.query(`
              INSERT INTO file_columns (
                file_id,
                column_name,
                column_type,
                column_index,
                stats
              )
              VALUES ($1, $2, $3, $4, $5)
            `, [
              fileId,
              column.name,
              column.type,
              i,
              JSON.stringify(column.stats || {})
            ]);
          }
        }
        
        return result.rows[0];
      }, { traceId });
      
      this.logger.info('File saved successfully', { 
        fileId,
        filename: fileData.originalname,
        traceId
      });
      
      return fileRecord;
    } catch (error) {
      this.logger.error('Error saving file', { 
        error: error.message, 
        filename: fileData.originalname,
        traceId
      });
      
      // Clean up the file if there was an error
      try {
        await unlink(fileData.path);
        this.logger.debug('Temporary file deleted after error', { path: fileData.path });
      } catch (unlinkError) {
        this.logger.warn('Failed to delete temporary file', { 
          error: unlinkError.message,
          path: fileData.path
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Get file by ID with associated columns
   * 
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} - File with columns
   */
  async getFileById(fileId) {
    const traceId = this.generateTraceId();
    this.logger.debug('Fetching file by ID', { fileId, traceId });
    
    try {
      const result = await this.executeQuery(
        'SELECT * FROM files WHERE file_id = $1',
        [fileId]
      );
      
      if (result.rows.length === 0) {
        this.logger.warn('File not found', { fileId, traceId });
        return null;
      }
      
      const file = result.rows[0];
      
      // Get columns for the file
      const columnsResult = await this.executeQuery(
        'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
        [fileId]
      );
      
      file.columns = columnsResult.rows;
      
      return file;
    } catch (error) {
      this.logger.error('Error fetching file', { 
        error: error.message,
        fileId,
        traceId
      });
      throw error;
    }
  }
  
  /**
   * Get all files with basic filtering and sorting
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - List of files
   */
  async getAllFiles(options = {}) {
    const { 
      sortBy = 'created_at', 
      sortOrder = 'DESC', 
      limit = 50, 
      offset = 0,
      fileType = null,
      search = null
    } = options;
    
    const traceId = this.generateTraceId();
    this.logger.debug('Fetching all files', { options, traceId });
    
    try {
      // Validate sort column to prevent SQL injection
      const validSortColumns = ['id', 'filename', 'file_type', 'file_size', 'created_at', 'quality_score'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      
      // Validate sort order
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      
      let query = 'SELECT * FROM files';
      const params = [];
      let whereClauses = [];
      
      // Add filter by file type
      if (fileType) {
        whereClauses.push('file_type = $' + (params.length + 1));
        params.push(fileType);
      }
      
      // Add search filter
      if (search) {
        whereClauses.push('(filename ILIKE $' + (params.length + 1) + 
                         ' OR file_id ILIKE $' + (params.length + 1) + ')');
        params.push(`%${search}%`);
      }
      
      // Add WHERE clause if filters are applied
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }
      
      // Add sorting and pagination
      query += ` ORDER BY ${sortColumn} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await this.executeQuery(query, params, { traceId });
      
      return result.rows;
    } catch (error) {
      this.logger.error('Error fetching files', { 
        error: error.message,
        traceId
      });
      throw error;
    }
  }
  
  /**
   * Delete a file and its metadata
   * 
   * @param {string} fileId - File ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFile(fileId) {
    const traceId = this.generateTraceId();
    this.logger.info('Deleting file', { fileId, traceId });
    
    try {
      // Get file info before deleting
      const file = await this.getFileById(fileId);
      
      if (!file) {
        this.logger.warn('File not found for deletion', { fileId, traceId });
        return false;
      }
      
      // Delete the file from the database within a transaction
      await this.executeTransaction(async (client) => {
        // First delete columns
        await client.query('DELETE FROM file_columns WHERE file_id = $1', [fileId]);
        
        // Then delete the file record
        await client.query('DELETE FROM files WHERE file_id = $1', [fileId]);
      }, { traceId });
      
      // Delete the physical file if it exists
      if (file.metadata && file.metadata.path) {
        try {
          const filePath = file.metadata.path;
          
          if (fs.existsSync(filePath)) {
            await unlink(filePath);
            this.logger.debug('Physical file deleted', { path: filePath });
          }
        } catch (unlinkError) {
          this.logger.warn('Error deleting physical file', {
            error: unlinkError.message,
            fileId,
            traceId
          });
          // Continue despite physical file deletion error
        }
      }
      
      this.logger.info('File deleted successfully', { fileId, traceId });
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
   * @returns {Promise<Object>} - Updated file record
   */
  async updateFile(fileId, updates) {
    const traceId = this.generateTraceId();
    this.logger.info('Updating file', { 
      fileId, 
      updatedFields: Object.keys(updates),
      traceId
    });
    
    try {
      // Build dynamic update query
      const setClauses = [];
      const queryParams = [fileId];
      let paramCounter = 2;
      
      const updatableFields = [
        'quality_score', 'row_count', 'column_count', 'metadata'
      ];
      
      for (const field of updatableFields) {
        if (updates[field] !== undefined) {
          let value = updates[field];
          
          // Handle special fields
          if (field === 'metadata' && typeof value === 'object') {
            value = JSON.stringify(value);
          }
          
          setClauses.push(`${field} = $${paramCounter}`);
          queryParams.push(value);
          paramCounter++;
        }
      }
      
      // Add updated_at
      setClauses.push('updated_at = NOW()');
      
      const query = `
        UPDATE files
        SET ${setClauses.join(', ')}
        WHERE file_id = $1
        RETURNING *
      `;
      
      const result = await this.executeQuery(query, queryParams, { traceId });
      
      if (result.rows.length === 0) {
        this.logger.warn('File not found for update', { fileId, traceId });
        return null;
      }
      
      this.logger.info('File updated successfully', { fileId, traceId });
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
  
  /**
   * Extract metadata from file
   * 
   * @private
   * @param {Object} fileData - File data from multer
   * @param {string} extension - File extension
   * @returns {Promise<Object>} - Extracted metadata
   */
  async extractMetadata(fileData, extension) {
    // Basic metadata available without parsing
    const metadata = {
      size: fileData.size,
      name: fileData.originalname,
      type: extension,
      path: fileData.path,
      uploadedAt: new Date().toISOString()
    };
    
    // Get file stats
    const stats = await stat(fileData.path);
    metadata.created = stats.birthtime;
    metadata.modified = stats.mtime;
    
    // Type-specific metadata extraction will be handled by specialized
    // processors in a more robust implementation
    
    return metadata;
  }
  
  /**
   * Validate CSV file
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateCsv(filePath) {
    // Simple validation: check if file exists and is readable
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      await fileHandle.close();
      return true;
    } catch (error) {
      throw new Error(`Invalid CSV file: ${error.message}`);
    }
  }
  
  /**
   * Validate JSON file
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateJson(filePath) {
    try {
      // Read a portion of the file to validate JSON structure
      const fileHandle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(4096); // Read first 4KB
      
      await fileHandle.read(buffer, 0, 4096, 0);
      await fileHandle.close();
      
      const sample = buffer.toString('utf8').trim();
      
      // Check if it starts with [ or { for valid JSON
      if (!sample.startsWith('[') && !sample.startsWith('{')) {
        throw new Error('Invalid JSON structure');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Invalid JSON file: ${error.message}`);
    }
  }
  
  /**
   * Validate Parquet file
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateParquet(filePath) {
    // In a real implementation, we would use the parquetjs library
    // to validate the file structure
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      await fileHandle.close();
      return true;
    } catch (error) {
      throw new Error(`Invalid Parquet file: ${error.message}`);
    }
  }
  
  /**
   * Validate Excel file
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateExcel(filePath) {
    // In a real implementation, we would use the xlsx library
    // to validate the file structure
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      await fileHandle.close();
      return true;
    } catch (error) {
      throw new Error(`Invalid Excel file: ${error.message}`);
    }
  }

  /**
   * Get file profile with column details formatted for frontend
   * 
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} - File profile with formatted columns
   */
  async getFileProfile(fileId) {
    const traceId = this.generateTraceId();
    this.logger.debug('Fetching file profile', { fileId, traceId });
    
    try {
      // Get file and its columns
      const file = await this.getFileById(fileId);
      
      if (!file) {
        this.logger.warn('File not found for profile', { fileId, traceId });
        return null;
      }
      
      // Format the profile for frontend consumption
      const profile = {
        fileId: file.file_id,
        filename: file.filename,
        fileType: file.file_type,
        fileSize: file.file_size,
        rowCount: file.row_count,
        columnCount: file.column_count,
        processedAt: file.processed_at,
        columns: []
      };
      
      // Format columns
      if (file.columns && file.columns.length > 0) {
        profile.columns = file.columns.map(column => {
          const stats = column.stats || {};
          
          return {
            name: column.column_name,
            type: column.column_type,
            unique: stats.unique_count || null,
            missing: stats.null_count || 0,
            min: stats.min_value || null,
            max: stats.max_value || null,
            histogram: stats.histogram || null,
            most_frequent_value: stats.most_frequent_value || null,
            least_frequent_value: stats.least_frequent_value || null,
            top_values: stats.top_values || null
          };
        });
      }
      
      // Add summary stats
      const totalCells = profile.rowCount * profile.columnCount;
      let missingCount = 0;
      let uniqueValues = 0;
      
      profile.columns.forEach(col => {
        missingCount += col.missing || 0;
        uniqueValues += col.unique || 0;
      });
      
      const completeness = totalCells > 0 ? 
        ((totalCells - missingCount) / totalCells * 100).toFixed(2) : 
        "100.00";
      
      const uniqueness = profile.columns.length > 0 ? 
        ((uniqueValues / profile.columns.length) / profile.rowCount * 100).toFixed(2) : 
        "0.00";
      
      profile.summary = {
        completeness,
        uniqueness
      };
      
      return profile;
    } catch (error) {
      this.logger.error('Error fetching file profile', { 
        error: error.message,
        fileId,
        traceId
      });
      throw error;
    }
  }
}

module.exports = FileService;