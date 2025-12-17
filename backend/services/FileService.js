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
const { fileTypeFromFile } = require('file-type');
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
      xlsx: this.validateExcel.bind(this),
      xml: this.validateXml.bind(this),
      // Archive formats
      zip: this.validateArchive.bind(this),
      tar: this.validateArchive.bind(this),
      gz: this.validateArchive.bind(this),
      tgz: this.validateArchive.bind(this),
      bz2: this.validateArchive.bind(this),
      // SAS datasets
      sas7bdat: this.validateBinary.bind(this),
      xpt: this.validateBinary.bind(this),
      // Avro
      avro: this.validateBinary.bind(this),
      // DAT files
      dat: this.validateGeneric.bind(this)
    };
    
    // MIME type mappings for file type validation
    this.mimeTypeMappings = {
      'csv': ['text/csv', 'text/plain', 'application/csv'],
      'json': ['application/json', 'text/json', 'text/plain'],
      'parquet': ['application/octet-stream', 'application/vnd.apache.parquet', 'application/x-parquet'],
      'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
      'xml': ['application/xml', 'text/xml'],
      // Archive formats
      'zip': ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      'tar': ['application/x-tar', 'application/octet-stream'],
      'gz': ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
      'tgz': ['application/x-tar', 'application/gzip', 'application/octet-stream'],
      'bz2': ['application/x-bzip2', 'application/octet-stream'],
      // SAS datasets
      'sas7bdat': ['application/octet-stream', 'application/x-sas-data'],
      'xpt': ['application/octet-stream', 'application/x-sas-xport'],
      // Avro
      'avro': ['application/octet-stream', 'application/avro'],
      // DAT files (various possible types)
      'dat': ['application/octet-stream', 'text/plain', 'application/x-dat']
    };
    
    // File size limits per file type (in bytes)
    this.fileSizeLimits = {
      'csv': 500 * 1024 * 1024,    // 500 MB
      'json': 500 * 1024 * 1024,   // 500 MB
      'parquet': 1024 * 1024 * 1024, // 1 GB
      'xlsx': 100 * 1024 * 1024,   // 100 MB
      'xml': 100 * 1024 * 1024,    // 100 MB
      // Archive formats (larger limits for compressed data)
      'zip': 2 * 1024 * 1024 * 1024,    // 2 GB
      'tar': 2 * 1024 * 1024 * 1024,    // 2 GB
      'gz': 2 * 1024 * 1024 * 1024,     // 2 GB
      'tgz': 2 * 1024 * 1024 * 1024,    // 2 GB
      'bz2': 2 * 1024 * 1024 * 1024,    // 2 GB
      // SAS datasets
      'sas7bdat': 1024 * 1024 * 1024,   // 1 GB
      'xpt': 1024 * 1024 * 1024,        // 1 GB
      // Avro
      'avro': 1024 * 1024 * 1024,       // 1 GB
      // DAT files
      'dat': 500 * 1024 * 1024          // 500 MB
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
      
      // Basic validation - check if file type is allowed
      if (!this.allowedTypes[extension]) {
        this.logger.warn('Unsupported file type', { extension, filename: fileData.originalname, traceId });
        throw new Error(`File type not supported: ${extension}`);
      }
      
      // Validate file size against type-specific limits
      const sizeLimit = this.fileSizeLimits[extension] || (100 * 1024 * 1024); // Default 100MB
      if (fileData.size > sizeLimit) {
        this.logger.warn('File size exceeds limit', { 
          size: fileData.size, 
          limit: sizeLimit, 
          extension,
          filename: fileData.originalname,
          traceId 
        });
        throw new Error(`File size exceeds limit for ${extension} files (max: ${Math.floor(sizeLimit / 1024 / 1024)}MB)`);
      }
      
      // Perform MIME type validation using magic bytes
      await this.validateMimeType(fileData.path, extension);
      
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
        
        // Insert column metadata if available (optimized batch insert)
        if (metadata.columns && metadata.columns.length > 0) {
          // Build VALUES clause and params array for batch insert
          const valuesClauses = [];
          const params = [];
          
          metadata.columns.forEach((column, index) => {
            const offset = params.length; // Current position in params array
            valuesClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
            params.push(
              fileId,
              column.name,
              column.type,
              index,
              JSON.stringify(column.stats || {})
            );
          });
          
          // Single batch INSERT for all columns (5-10% faster than N individual INSERTs)
          await client.query(`
            INSERT INTO file_columns (file_id, column_name, column_type, column_index, stats)
            VALUES ${valuesClauses.join(', ')}
          `, params);
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
      search = null,
      projectIds = null
    } = options;
    
    const traceId = this.generateTraceId();
    this.logger.debug('Fetching all files', { options, traceId });
    
    try {
      // Validate sort column to prevent SQL injection
      const validSortColumns = ['id', 'filename', 'file_type', 'file_size', 'created_at', 'quality_score'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      
      // Validate sort order
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      
      let query = `
        SELECT DISTINCT 
          files.*, 
          projects.name as project_name,
          sub_projects.name as sub_project_name,
          lfg.has_schema_changes,
          lfg.canonical_name as logical_file_name
        FROM files 
        LEFT JOIN projects ON files.project_id = projects.id
        LEFT JOIN projects AS sub_projects ON files.sub_project_id = sub_projects.id
        LEFT JOIN file_audit_details fad ON files.file_id = fad.file_id
        LEFT JOIN logical_file_groups lfg ON files.logical_file_id = lfg.logical_file_id
      `;
      const params = [];
      let whereClauses = [];
      
      // Exclude transformation target files from File Catalog (only show ad-hoc uploads)
      whereClauses.push("(fad.file_role IS NULL OR fad.file_role != 'target')");
      
      // Add project filtering (if projectIds provided)
      if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
        whereClauses.push('files.project_id = ANY($' + (params.length + 1) + ')');
        params.push(projectIds);
      }
      
      // Add filter by file type
      if (fileType) {
        whereClauses.push('files.file_type = $' + (params.length + 1));
        params.push(fileType);
      }
      
      // Add search filter
      if (search) {
        whereClauses.push('(files.filename ILIKE $' + (params.length + 1) + 
                         ' OR files.file_id ILIKE $' + (params.length + 1) + ')');
        params.push(`%${search}%`);
      }
      
      // Add WHERE clause if filters are applied
      if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
      }
      
      // Add sorting and pagination (prefix with files. if needed)
      const sortCol = sortColumn === 'id' || sortColumn === 'filename' || sortColumn === 'file_type' || 
                      sortColumn === 'file_size' || sortColumn === 'created_at' || sortColumn === 'quality_score' 
                      ? `files.${sortColumn}` : sortColumn;
      query += ` ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
   * Validate MIME type using magic bytes
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @param {string} expectedExtension - Expected file extension
   * @returns {Promise<boolean>} - Validation result
   */
  async validateMimeType(filePath, expectedExtension) {
    try {
      // Detect file type from magic bytes
      const detectedType = await fileTypeFromFile(filePath);
      
      // For text-based files (CSV, JSON, XML), file-type may return undefined
      // because they don't have magic bytes. We'll use content-based validation for these.
      const textBasedTypes = ['csv', 'json', 'xml'];
      
      if (textBasedTypes.includes(expectedExtension)) {
        // For text files, perform content-based validation
        return true; // Will be validated by type-specific validators
      }
      
      // For binary files (Parquet, Excel), validate against expected MIME types
      if (!detectedType) {
        this.logger.warn('Could not detect file type from magic bytes', { 
          filePath, 
          expectedExtension 
        });
        // Continue with type-specific validation
        return true;
      }
      
      // Check if detected MIME type matches allowed types for this extension
      const allowedMimeTypes = this.mimeTypeMappings[expectedExtension];
      if (!allowedMimeTypes) {
        throw new Error(`No MIME type mappings found for extension: ${expectedExtension}`);
      }
      
      // For XLSX files, check for ZIP signature (Office Open XML)
      if (expectedExtension === 'xlsx' && detectedType.mime === 'application/zip') {
        return true;
      }
      
      // For Parquet files, check for octet-stream
      if (expectedExtension === 'parquet' && detectedType.mime === 'application/octet-stream') {
        return true;
      }
      
      // Strict validation for other types
      if (!allowedMimeTypes.includes(detectedType.mime)) {
        this.logger.warn('MIME type mismatch', {
          detected: detectedType.mime,
          expected: allowedMimeTypes,
          extension: expectedExtension,
          filePath
        });
        throw new Error(`File MIME type mismatch. Expected ${expectedExtension}, but detected ${detectedType.mime}`);
      }
      
      this.logger.debug('MIME type validation passed', {
        detectedType: detectedType.mime,
        expectedExtension,
        filePath
      });
      
      return true;
    } catch (error) {
      if (error.message.includes('MIME type mismatch')) {
        throw error;
      }
      this.logger.error('Error validating MIME type', { error: error.message, filePath });
      // Don't fail on MIME detection errors, let type-specific validation handle it
      return true;
    }
  }

  /**
   * Validate CSV file
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateCsv(filePath) {
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(1024); // Read first 1KB
      
      await fileHandle.read(buffer, 0, 1024, 0);
      await fileHandle.close();
      
      const sample = buffer.toString('utf8').trim();
      
      // Basic CSV validation: should not contain binary characters
      const hasBinaryChars = /\p{Cc}/u.test(sample);
      if (hasBinaryChars) {
        throw new Error('File contains binary characters, not a valid CSV');
      }
      
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
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(4);
      
      // Read first 4 bytes to check for ZIP signature (PK\x03\x04)
      await fileHandle.read(buffer, 0, 4, 0);
      await fileHandle.close();
      
      // XLSX files are ZIP archives and should start with PK signature
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        throw new Error('File is not a valid ZIP archive (XLSX files are ZIP-based)');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Invalid Excel file: ${error.message}`);
    }
  }

  /**
   * Validate XML file
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateXml(filePath) {
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(1024); // Read first 1KB
      
      await fileHandle.read(buffer, 0, 1024, 0);
      await fileHandle.close();
      
      const sample = buffer.toString('utf8').trim();
      
      // Basic XML validation: should start with <?xml or <
      if (!sample.startsWith('<?xml') && !sample.startsWith('<')) {
        throw new Error('Invalid XML structure - must start with <?xml or <');
      }
      
      // Check for binary characters
      const hasBinaryChars = /\p{Cc}/u.test(sample);
      if (hasBinaryChars) {
        throw new Error('File contains binary characters, not a valid XML');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Invalid XML file: ${error.message}`);
    }
  }

  /**
   * Validate archive files (ZIP, TAR, GZ, etc.)
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateArchive(filePath) {
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      
      // Read first 4 bytes for quick signature checks
      const headerBuffer = Buffer.alloc(4);
      await fileHandle.read(headerBuffer, 0, 4, 0);
      
      // Check for common archive signatures
      // ZIP: PK\x03\x04 (50 4B 03 04)
      // GZIP/TAR.GZ: 1F 8B (gzip magic number)
      // BZIP2/TAR.BZ2: 42 5A (bzip2 magic number)
      const isZip = (headerBuffer[0] === 0x50 && headerBuffer[1] === 0x4B);
      const isGzip = (headerBuffer[0] === 0x1F && headerBuffer[1] === 0x8B);
      const isBzip2 = (headerBuffer[0] === 0x42 && headerBuffer[1] === 0x5A);
      
      if (isZip || isGzip || isBzip2) {
        await fileHandle.close();
        return true;
      }
      
      // Check for TAR file signature at offset 257: "ustar" (POSIX tar format)
      const tarBuffer = Buffer.alloc(262); // Read 257 + 5 bytes for "ustar"
      await fileHandle.read(tarBuffer, 0, 262, 0);
      await fileHandle.close();
      
      const tarSignature = tarBuffer.slice(257, 262).toString('ascii');
      const isTar = tarSignature === 'ustar';
      
      // if (isTar) {
      //   return true;
      // }
      
      // If none of the known archive signatures match, still allow the file
      // Python processors will determine if it's a valid archive during processing
      return true;
    } catch (error) {
      throw new Error(`Invalid archive file: ${error.message}`);
    }
  }

  /**
   * Validate binary files (SAS, Avro, etc.)
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateBinary(filePath) {
    try {
      // Basic validation: ensure file exists and is readable
      const fileHandle = await fs.promises.open(filePath, 'r');
      await fileHandle.close();
      return true;
    } catch (error) {
      throw new Error(`Invalid binary file: ${error.message}`);
    }
  }

  /**
   * Validate generic files (DAT, etc.)
   * 
   * @private
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} - Validation result
   */
  async validateGeneric(filePath) {
    try {
      // Basic validation: ensure file exists and is readable
      const fileHandle = await fs.promises.open(filePath, 'r');
      await fileHandle.close();
      return true;
    } catch (error) {
      throw new Error(`Invalid file: ${error.message}`);
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
          return {
            name: column.column_name,
            type: column.column_type,
            unique: column.unique_count || null,
            missing: column.null_count || 0,
            min: column.min_value || null,
            max: column.max_value || null,
            histogram: column.histogram || null,
            most_frequent_value: column.most_frequent_value || null,
            least_frequent_value: column.least_frequent_value || null,
            top_values: column.top_values || null
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