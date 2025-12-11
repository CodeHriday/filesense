/**
 * Fast Schema Validation Service
 * Validates file metadata against vendor agreement schemas without storing to database
 * Generates downloadable Excel reports
 */

const { systemLogger } = require('../utils/logger');
const { pool } = require('../config/database');
const AWS = require('aws-sdk');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { decryptCredentials } = require('../utils/encryption');
const { matchesPattern } = require('../utils/filePatternMatcher');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { XMLParser } = require('fast-xml-parser');
const axios = require('axios');
const ArchiveDetectionService = require('./archiveDetectionService');
const PasswordVaultService = require('./passwordVaultService');

// Archive file extensions
const ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.tar', '.tar.gz', '.tar.bz2', '.tgz', '.tbz2'];

class FastSchemaValidationService {
  
  /**
   * Create a new schema validation job
   */
  static async createJob(jobData) {
    const { 
      jobName, 
      projectId, 
      connectionId, 
      vendorAgreementId,
      s3Path, 
      filePattern, 
      recursive,
      files,
      createdBy,
      executionType,
      scheduleType,
      cronExpression,
      scheduleStartDate
    } = jobData;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const jobResult = await client.query(
        `INSERT INTO schema_validation_jobs 
         (job_name, project_id, connection_id, vendor_agreement_id, s3_path, file_pattern, 
          recursive, total_files, status, created_by, execution_type, schedule_type, 
          cron_expression, schedule_start_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          jobName,
          projectId,
          connectionId,
          vendorAgreementId,
          s3Path,
          filePattern,
          recursive,
          files?.length || 0,
          executionType === 'scheduled' ? 'scheduled' : 'pending',
          createdBy,
          executionType,
          scheduleType,
          cronExpression,
          scheduleStartDate
        ]
      );

      const job = jobResult.rows[0];

      if (files && files.length > 0) {
        // Filter out null/undefined/empty file paths
        const validFiles = files.filter(f => f && typeof f === 'string' && f.trim().length > 0);
        
        if (validFiles.length > 0) {
          const fileValues = validFiles.map((filePath, index) => 
            `($1, $${index + 2}, 'pending')`
          ).join(', ');
          
          await client.query(
            `INSERT INTO schema_validation_job_files (job_id, file_path, status)
             VALUES ${fileValues}`,
            [job.id, ...validFiles]
          );
          
          // Update total_files count if it changed
          if (validFiles.length !== files.length) {
            await client.query(
              `UPDATE schema_validation_jobs SET total_files = $1 WHERE id = $2`,
              [validFiles.length, job.id]
            );
          }
        }
      }

      await client.query('COMMIT');

      systemLogger.info('Created schema validation job', { 
        jobId: job.id, 
        totalFiles: files?.length || 0 
      });

      return job;

    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating schema validation job', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get job by ID
   */
  static async getJob(jobId) {
    const result = await pool.query(
      `SELECT svj.*, 
              p.name as project_name,
              sc.name as connection_name,
              COALESCE(va.agreement_code, va.file_name) as agreement_name,
              v.vendor_name as vendor_name
       FROM schema_validation_jobs svj
       LEFT JOIN projects p ON svj.project_id = p.id
       LEFT JOIN storage_connections sc ON svj.connection_id = sc.connection_id
       LEFT JOIN vendor_agreements va ON svj.vendor_agreement_id = va.id
       LEFT JOIN vendors v ON va.vendor_id = v.id
       WHERE svj.id = $1`,
      [jobId]
    );

    return result.rows[0];
  }

  /**
   * Get all jobs with optional filters
   */
  static async getJobs(filters = {}) {
    let query = `
      SELECT svj.*, 
             p.name as project_name,
             sc.name as connection_name,
             COALESCE(va.agreement_code, va.file_name) as agreement_name,
             v.vendor_name as vendor_name
      FROM schema_validation_jobs svj
      LEFT JOIN projects p ON svj.project_id = p.id
      LEFT JOIN storage_connections sc ON svj.connection_id::text = sc.connection_id
      LEFT JOIN vendor_agreements va ON svj.vendor_agreement_id = va.id
      LEFT JOIN vendors v ON va.vendor_id = v.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.status) {
      params.push(filters.status);
      query += ` AND svj.status = $${params.length}`;
    }
    
    if (filters.projectId) {
      params.push(filters.projectId);
      query += ` AND svj.project_id = $${params.length}`;
    }

    query += ` ORDER BY svj.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get paginated file details for a job
   */
  static async getJobFileDetails(jobId, options = {}) {
    const { 
      page = 1, 
      pageSize = 25, 
      status = null, 
      sortBy = 'id',
      sortOrder = 'asc'
    } = options;

    const offset = (page - 1) * pageSize;
    const validSortColumns = ['id', 'file_path', 'status', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM schema_validation_job_files WHERE job_id = $1`;
    const countParams = [jobId];
    
    if (status) {
      countParams.push(status);
      countQuery += ` AND status = $${countParams.length}`;
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Get paginated files
    let query = `
      SELECT id, job_id, file_path, status, validation_result, error_message, created_at, updated_at
      FROM schema_validation_job_files 
      WHERE job_id = $1
    `;
    const params = [jobId];
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    query += ` ORDER BY ${sortColumn} ${order}`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);

    // Parse validation_result JSON for each file
    const files = result.rows.map(row => {
      let validationResult = {};
      try {
        validationResult = typeof row.validation_result === 'string' 
          ? JSON.parse(row.validation_result) 
          : (row.validation_result || {});
      } catch (e) {
        validationResult = {};
      }
      
      return {
        id: row.id,
        filePath: row.file_path,
        fileName: path.basename(row.file_path || ''),
        status: row.status,
        fileType: validationResult.fileType || path.extname(row.file_path || '').slice(1) || 'unknown',
        fileSize: validationResult.fileSize || null,
        fileSizeFormatted: validationResult.fileSizeFormatted || '-',
        recordCount: validationResult.recordCount || null,
        matchedPattern: validationResult.matchedPattern || null,
        actualColumnCount: validationResult.actualColumnCount || null,
        expectedColumnCount: validationResult.expectedColumnCount || null,
        missingColumns: validationResult.missingColumns || [],
        extraColumns: validationResult.extraColumns || [],
        reason: validationResult.reason || row.error_message || '-',
        valid: validationResult.valid !== undefined ? validationResult.valid : (row.status === 'valid'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return {
      files,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: page * pageSize < totalCount,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Get scheduled jobs
   */
  static async getScheduledJobs() {
    const result = await pool.query(
      `SELECT svj.*, 
              p.name as project_name,
              COALESCE(va.agreement_code, va.file_name) as agreement_name,
              v.vendor_name as vendor_name
       FROM schema_validation_jobs svj
       LEFT JOIN projects p ON svj.project_id = p.id
       LEFT JOIN vendor_agreements va ON svj.vendor_agreement_id = va.id
       LEFT JOIN vendors v ON va.vendor_id = v.id
       WHERE svj.execution_type = 'scheduled' 
         AND svj.status IN ('scheduled', 'pending')
       ORDER BY svj.next_run_at ASC`
    );

    return result.rows;
  }

  /**
   * Update job status
   */
  static async updateJobStatus(jobId, status, additionalFields = {}) {
    const fields = ['status = $2'];
    const values = [jobId, status];
    let paramIndex = 3;

    if (status === 'running' && !additionalFields.started_at) {
      fields.push(`started_at = NOW()`);
    }
    
    if (status === 'completed' || status === 'failed') {
      fields.push(`completed_at = NOW()`);
    }

    for (const [key, value] of Object.entries(additionalFields)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    await pool.query(
      `UPDATE schema_validation_jobs 
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $1`,
      values
    );
  }

  /**
   * Process validation job
   */
  static async processJob(jobId) {
    const job = await this.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    systemLogger.info('Starting schema validation job', { jobId });

    try {
      await this.updateJobStatus(jobId, 'running');

      const filesResult = await pool.query(
        `SELECT * FROM schema_validation_job_files WHERE job_id = $1 ORDER BY id`,
        [jobId]
      );
      
      let files = filesResult.rows;
      const results = [];
      let validCount = 0;
      let invalidCount = 0;
      let processedCount = 0;

      const agreementSchema = await this.getAgreementSchema(job.vendor_agreement_id);
      const connectionCredentials = await this.getConnectionCredentials(job.connection_id);
      const s3 = this.createS3Client(connectionCredentials);
      
      // Get archive password from vendor agreement (if any)
      const archivePassword = await this.getArchivePassword(job.vendor_agreement_id);
      
      // Check for archive files and expand them
      const expandedFiles = await this.expandArchiveFiles(
        s3, 
        connectionCredentials.bucket, 
        files, 
        archivePassword,
        jobId
      );
      
      // Use expanded file list if archives were found
      if (expandedFiles.length > files.length) {
        files = expandedFiles;
        await this.updateJobStatus(jobId, 'running', {
          total_files: files.length
        });
      }
      
      const totalFiles = files.length;

      for (const file of files) {
        try {
          // Get file metadata (size, type)
          const fileMetadata = await this.getFileMetadata(
            s3, 
            connectionCredentials.bucket, 
            file.file_path || file.filePath
          );
          
          const validationResult = await this.validateFileMetadata(
            s3,
            connectionCredentials.bucket,
            file.file_path || file.filePath,
            agreementSchema
          );

          // Merge metadata with validation result
          const fullResult = {
            filePath: file.file_path || file.filePath,
            fileSize: fileMetadata.size,
            fileSizeFormatted: this.formatFileSize(fileMetadata.size),
            fileType: fileMetadata.fileType,
            recordCount: validationResult.recordCount || null,
            ...validationResult
          };

          results.push(fullResult);

          if (validationResult.valid) {
            validCount++;
          } else {
            invalidCount++;
          }

          // Update file record if it exists in DB
          if (file.id) {
            await pool.query(
              `UPDATE schema_validation_job_files 
               SET status = $2, validation_result = $3, updated_at = NOW()
               WHERE id = $1`,
              [file.id, validationResult.valid ? 'valid' : 'invalid', JSON.stringify(fullResult)]
            );
          }

        } catch (fileError) {
          systemLogger.error('Error validating file', { 
            filePath: file.file_path || file.filePath, 
            error: fileError.message 
          });
          
          const errorResult = {
            filePath: file.file_path || file.filePath,
            valid: false,
            fileType: path.extname(file.file_path || file.filePath).slice(1) || 'unknown',
            fileSize: null,
            fileSizeFormatted: '-',
            recordCount: null,
            error: fileError.message,
            reason: fileError.message
          };
          
          results.push(errorResult);
          
          invalidCount++;
          
          if (file.id) {
            await pool.query(
              `UPDATE schema_validation_job_files 
               SET status = 'error', error_message = $2, validation_result = $3, updated_at = NOW()
               WHERE id = $1`,
              [file.id, fileError.message, JSON.stringify(errorResult)]
            );
          }
        }

        processedCount++;

        // Update progress after EVERY file for real-time feedback
        await this.updateJobStatus(jobId, 'running', {
          processed_count: processedCount,
          total_files: totalFiles,
          valid_count: validCount,
          invalid_count: invalidCount
        });
      }

      const reportPath = await this.generateReport(job, results);

      await this.updateJobStatus(jobId, 'completed', {
        processed_count: processedCount,
        total_files: totalFiles,
        valid_count: validCount,
        invalid_count: invalidCount,
        report_path: reportPath
      });

      systemLogger.info('Schema validation job completed', { 
        jobId, 
        validCount, 
        invalidCount,
        totalFiles 
      });

      return {
        success: true,
        validCount,
        invalidCount,
        totalFiles,
        reportPath
      };

    } catch (error) {
      systemLogger.error('Schema validation job failed', { 
        jobId, 
        error: error.message 
      });
      
      await this.updateJobStatus(jobId, 'failed', {
        error_message: error.message
      });
      
      throw error;
    }
  }

  /**
   * Get archive password from vendor agreement
   */
  static async getArchivePassword(vendorAgreementId) {
    try {
      const passwordVaultService = new PasswordVaultService(pool, null, systemLogger);
      const password = await passwordVaultService.retrievePassword(
        'vendor_agreement',
        vendorAgreementId.toString()
      );
      return password;
    } catch (error) {
      // No password stored or retrieval failed - that's okay for non-encrypted archives
      return null;
    }
  }

  /**
   * Expand archive files - extract contents and return expanded file list
   */
  static async expandArchiveFiles(s3, bucket, files, archivePassword, jobId) {
    const expandedFiles = [];
    const archiveDetector = new ArchiveDetectionService(systemLogger);
    const tempDir = path.join(os.tmpdir(), `schema-validation-${jobId}`);
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    for (const file of files) {
      const filePath = file.file_path || file.filePath;
      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();
      
      // Check if this is an archive file
      const isArchive = ARCHIVE_EXTENSIONS.some(archiveExt => 
        fileName.toLowerCase().endsWith(archiveExt)
      );
      
      if (isArchive) {
        try {
          systemLogger.info('Processing archive file for schema validation', { filePath, jobId });
          
          // Download archive to temp location
          const s3Key = this.extractS3Key(filePath, bucket);
          const tempArchivePath = path.join(tempDir, fileName);
          
          const response = await s3.getObject({ Bucket: bucket, Key: s3Key }).promise();
          fs.writeFileSync(tempArchivePath, response.Body);
          
          // Extract archive contents
          const extractedFiles = await this.extractArchiveContents(
            tempArchivePath,
            tempDir,
            archivePassword,
            archiveDetector
          );
          
          // Add extracted files to the list
          for (const extractedFile of extractedFiles) {
            expandedFiles.push({
              file_path: extractedFile.fullPath,
              filePath: extractedFile.fullPath,
              originalArchive: filePath,
              isExtracted: true,
              extractedFileName: extractedFile.fileName
            });
          }
          
          // Clean up archive file
          if (fs.existsSync(tempArchivePath)) {
            fs.unlinkSync(tempArchivePath);
          }
          
        } catch (archiveError) {
          systemLogger.error('Failed to process archive', { 
            filePath, 
            error: archiveError.message 
          });
          // Add the archive itself as a file that couldn't be processed
          expandedFiles.push({
            ...file,
            archiveError: archiveError.message
          });
        }
      } else {
        // Not an archive, add as-is
        expandedFiles.push(file);
      }
    }
    
    return expandedFiles;
  }

  /**
   * Extract contents from an archive file
   */
  static async extractArchiveContents(archivePath, outputDir, password, archiveDetector) {
    const archiveInfo = await archiveDetector.analyzeArchive(archivePath);
    
    if (!archiveInfo.isArchive) {
      throw new Error('File is not a valid archive');
    }
    
    const extractedFiles = [];
    const extractDir = path.join(outputDir, `extracted_${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    
    const archiveType = archiveInfo.archiveType;
    
    if (archiveType === 'zip') {
      // Use Python pyzipper for ZIP extraction (supports password-protected)
      const extracted = await this.extractZipWithPython(archivePath, extractDir, password);
      extractedFiles.push(...extracted);
    } else if (archiveType === 'tar' || archiveType === 'tar.gz' || archiveType === 'tgz') {
      const extracted = await this.extractTar(archivePath, extractDir, archiveType);
      extractedFiles.push(...extracted);
    } else if (archiveType === '7z') {
      const extracted = await this.extract7z(archivePath, extractDir, password);
      extractedFiles.push(...extracted);
    } else {
      throw new Error(`Unsupported archive type: ${archiveType}`);
    }
    
    return extractedFiles;
  }

  /**
   * Extract ZIP using Python pyzipper (supports AES-256 encryption)
   */
  static async extractZipWithPython(archivePath, outputDir, password) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      const pythonScript = `
import sys
import json
import os
import pyzipper

archive_path = sys.argv[1]
output_dir = sys.argv[2]
password = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '__NO_PASSWORD__' else None

try:
    extracted = []
    with pyzipper.AESZipFile(archive_path, 'r') as archive:
        for member_info in archive.infolist():
            if member_info.is_dir():
                continue
            member_name = os.path.basename(member_info.filename)
            if not member_name or '..' in member_info.filename:
                continue
            if member_name.startswith('._') or '__MACOSX' in member_info.filename:
                continue
            safe_path = os.path.join(output_dir, member_name)
            with archive.open(member_info, pwd=password.encode() if password else None) as source:
                with open(safe_path, 'wb') as target:
                    target.write(source.read())
            file_size = os.path.getsize(safe_path)
            extracted.append({
                'relativePath': member_info.filename,
                'fileName': member_name,
                'fullPath': safe_path,
                'originalSize': file_size
            })
    print(json.dumps({'success': True, 'files': extracted}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;
      
      const pythonProcess = spawn('python3', ['-c', pythonScript, archivePath, outputDir, password || '__NO_PASSWORD__']);
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });
      
      pythonProcess.on('close', (code) => {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success) {
            resolve(result.files);
          } else {
            reject(new Error(result.error || 'ZIP extraction failed'));
          }
        } catch (e) {
          reject(new Error(`ZIP extraction failed: ${stderr || e.message}`));
        }
      });
    });
  }

  /**
   * Extract TAR archives
   */
  static async extractTar(archivePath, outputDir, archiveType) {
    return new Promise((resolve, reject) => {
      const tar = require('tar-stream');
      const gunzip = require('gunzip-maybe');
      const extractedFiles = [];
      const extract = tar.extract();
      
      extract.on('entry', (header, stream, next) => {
        if (header.type !== 'file') {
          stream.resume();
          return next();
        }
        
        const fileName = path.basename(header.name);
        if (!fileName || header.name.includes('..')) {
          stream.resume();
          return next();
        }
        
        const outputPath = path.join(outputDir, fileName);
        const writeStream = fs.createWriteStream(outputPath);
        
        stream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          extractedFiles.push({
            relativePath: header.name,
            fileName: fileName,
            fullPath: outputPath,
            originalSize: header.size
          });
          next();
        });
        
        writeStream.on('error', () => next());
      });
      
      extract.on('finish', () => resolve(extractedFiles));
      extract.on('error', (err) => reject(err));
      
      const fileStream = fs.createReadStream(archivePath);
      if (archiveType === 'tar.gz' || archiveType === 'tgz') {
        fileStream.pipe(gunzip()).pipe(extract);
      } else {
        fileStream.pipe(extract);
      }
    });
  }

  /**
   * Extract 7z archives
   */
  static async extract7z(archivePath, outputDir, password) {
    const sevenZip = require('node-7z-archive');
    
    return new Promise((resolve, reject) => {
      const options = password ? { password } : {};
      const extractStream = sevenZip.extractFull(archivePath, outputDir, options);
      
      extractStream.on('end', async () => {
        try {
          const files = await fs.promises.readdir(outputDir);
          const extractedFiles = [];
          
          for (const file of files) {
            const filePath = path.join(outputDir, file);
            const stats = await fs.promises.stat(filePath);
            
            if (stats.isFile()) {
              extractedFiles.push({
                relativePath: file,
                fileName: file,
                fullPath: filePath,
                originalSize: stats.size
              });
            }
          }
          
          resolve(extractedFiles);
        } catch (error) {
          reject(new Error(`Failed to read extracted 7z files: ${error.message}`));
        }
      });
      
      extractStream.on('error', (error) => {
        if (error.message && (error.message.includes('password') || error.message.includes('encrypted'))) {
          reject(new Error('ARCHIVE_PASSWORD_REQUIRED: Archive is password-protected but no password was provided'));
        } else {
          reject(new Error(`7z extraction failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * Get file metadata from S3
   */
  static async getFileMetadata(s3, bucket, filePath) {
    try {
      const s3Key = this.extractS3Key(filePath, bucket);
      
      // Check if this is a local extracted file
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          size: stats.size,
          fileType: path.extname(filePath).slice(1).toLowerCase() || 'unknown',
          lastModified: stats.mtime
        };
      }
      
      // Get metadata from S3
      const headResponse = await s3.headObject({ Bucket: bucket, Key: s3Key }).promise();
      
      return {
        size: headResponse.ContentLength,
        fileType: path.extname(s3Key).slice(1).toLowerCase() || 'unknown',
        lastModified: headResponse.LastModified
      };
    } catch (error) {
      return {
        size: null,
        fileType: path.extname(filePath).slice(1).toLowerCase() || 'unknown',
        lastModified: null
      };
    }
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes) {
    if (bytes === null || bytes === undefined) return '-';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get vendor agreement schema
   */
  static async getAgreementSchema(vendorAgreementId) {
    const fileSchemasResult = await pool.query(
      `SELECT id, file_name_pattern, schema, priority, file_description 
       FROM vendor_agreement_file_schemas 
       WHERE vendor_agreement_id = $1 AND is_active = TRUE 
       ORDER BY priority ASC, id ASC`,
      [vendorAgreementId]
    );

    if (fileSchemasResult.rows.length > 0) {
      return {
        type: 'multi-pattern',
        patterns: fileSchemasResult.rows
      };
    }

    const legacyResult = await pool.query(
      `SELECT schema, file_name FROM vendor_agreements WHERE id = $1`,
      [vendorAgreementId]
    );

    if (legacyResult.rows.length === 0) {
      throw new Error('Vendor agreement not found');
    }

    return {
      type: 'legacy',
      schema: legacyResult.rows[0].schema,
      pattern: legacyResult.rows[0].file_name
    };
  }

  /**
   * Get connection credentials
   */
  static async getConnectionCredentials(connectionId) {
    const result = await pool.query(
      `SELECT * FROM storage_connections WHERE connection_id = $1`,
      [connectionId.toString()]
    );

    if (result.rows.length === 0) {
      throw new Error('Connection not found');
    }

    const connection = result.rows[0];
    const config = connection.config || {};
    
    // Determine connection type for decryption
    const storageType = config.storage_type || config.provider || connection.type || 'aws';
    
    // Decrypt credentials before using them
    const decryptedConfig = decryptCredentials(storageType, config);
    
    // Return credentials from decrypted config
    return {
      ...connection,
      bucket: decryptedConfig.bucket || decryptedConfig.bucketName || decryptedConfig.bucket_name || config.bucket_name,
      access_key_id: decryptedConfig.access_key || decryptedConfig.access_key_id || decryptedConfig.accessKeyId,
      secret_access_key: decryptedConfig.secret_key || decryptedConfig.secret_access_key || decryptedConfig.secretAccessKey,
      region: decryptedConfig.region || config.region || 'us-east-1'
    };
  }

  /**
   * Create S3 client
   */
  static createS3Client(credentials) {
    return new AWS.S3({
      accessKeyId: credentials.access_key_id || credentials.accessKeyId,
      secretAccessKey: credentials.secret_access_key || credentials.secretAccessKey,
      region: credentials.region || 'us-east-1'
    });
  }

  /**
   * Extract S3 key from full S3 URI or path
   * Handles formats like:
   * - s3://bucket/path/to/file.csv -> path/to/file.csv
   * - /path/to/file.csv -> path/to/file.csv
   * - path/to/file.csv -> path/to/file.csv
   */
  static extractS3Key(filePath, bucket) {
    if (!filePath) return filePath;
    
    // Handle s3:// URI format
    if (filePath.startsWith('s3://')) {
      // Remove s3://bucket/ prefix
      const withoutProtocol = filePath.slice(5); // Remove "s3://"
      const slashIndex = withoutProtocol.indexOf('/');
      if (slashIndex !== -1) {
        return withoutProtocol.slice(slashIndex + 1);
      }
      return '';
    }
    
    // Handle leading slash
    if (filePath.startsWith('/')) {
      return filePath.slice(1);
    }
    
    return filePath;
  }

  /**
   * Validate file metadata against schema
   */
  static async validateFileMetadata(s3, bucket, filePath, agreementSchema) {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName).toLowerCase().slice(1);

    let expectedSchema;
    let matchedPattern = null;

    if (agreementSchema.type === 'multi-pattern') {
      for (const pattern of agreementSchema.patterns) {
        if (matchesPattern(fileName, pattern.file_name_pattern)) {
          expectedSchema = pattern.schema;
          matchedPattern = pattern.file_name_pattern;
          break;
        }
      }

      if (!expectedSchema) {
        return {
          valid: false,
          reason: 'No matching schema pattern',
          fileName,
          availablePatterns: agreementSchema.patterns.map(p => p.file_name_pattern)
        };
      }
    } else {
      expectedSchema = agreementSchema.schema;
      matchedPattern = agreementSchema.pattern;
    }

    if (!expectedSchema || expectedSchema.length === 0) {
      return {
        valid: true,
        reason: 'No schema defined',
        fileName,
        matchedPattern
      };
    }

    let actualColumns;
    try {
      actualColumns = await this.extractFileColumns(s3, bucket, filePath, fileExtension);
    } catch (err) {
      return {
        valid: false,
        reason: `Failed to read file headers: ${err.message}`,
        fileName,
        matchedPattern
      };
    }

    const expectedColumns = expectedSchema.map(col => ({
      name: col.name || col.column_name,
      type: col.type || col.data_type,
      nullable: col.nullable !== false
    }));

    const missingColumns = [];
    const extraColumns = [];
    const typeMismatches = [];

    const actualColumnNames = actualColumns.map(c => c.toLowerCase());
    const expectedColumnNames = expectedColumns.map(c => c.name.toLowerCase());

    for (const expected of expectedColumns) {
      if (!actualColumnNames.includes(expected.name.toLowerCase())) {
        missingColumns.push(expected.name);
      }
    }

    for (const actual of actualColumns) {
      if (!expectedColumnNames.includes(actual.toLowerCase())) {
        extraColumns.push(actual);
      }
    }

    const valid = missingColumns.length === 0;

    // Get record count for the file
    let recordCount = null;
    try {
      recordCount = await this.getRecordCount(s3, bucket, filePath, fileExtension);
    } catch (countErr) {
      systemLogger.warn('Failed to count records', { filePath, error: countErr.message });
    }

    return {
      valid,
      fileName,
      matchedPattern,
      actualColumnCount: actualColumns.length,
      expectedColumnCount: expectedColumns.length,
      missingColumns,
      extraColumns,
      recordCount,
      reason: valid ? 'Schema matches' : `Missing ${missingColumns.length} column(s)`,
      details: {
        actualColumns,
        expectedColumns: expectedColumns.map(c => c.name)
      }
    };
  }

  /**
   * Get record count for a file (approximate for large files)
   */
  static async getRecordCount(s3, bucket, filePath, fileExtension) {
    const s3Key = this.extractS3Key(filePath, bucket);
    
    // Check if this is a local file (extracted from archive)
    if (fs.existsSync(filePath)) {
      return this.countRecordsFromBuffer(fs.readFileSync(filePath), fileExtension);
    }
    
    try {
      // For parquet files, get row count from metadata
      if (fileExtension === 'parquet') {
        return await this.getParquetRecordCount(s3, bucket, s3Key);
      }
      
      // For small files, download and count
      const headResponse = await s3.headObject({ Bucket: bucket, Key: s3Key }).promise();
      const fileSize = headResponse.ContentLength;
      
      // For files under 10MB, count all records
      if (fileSize < 10 * 1024 * 1024) {
        const response = await s3.getObject({ Bucket: bucket, Key: s3Key }).promise();
        return this.countRecordsFromBuffer(response.Body, fileExtension);
      }
      
      // For larger files, sample and estimate
      const sampleSize = 1024 * 1024; // 1MB sample
      const params = {
        Bucket: bucket,
        Key: s3Key,
        Range: `bytes=0-${sampleSize - 1}`
      };
      
      const response = await s3.getObject(params).promise();
      const sampleRecords = this.countRecordsFromBuffer(response.Body, fileExtension);
      
      // Estimate total based on sample
      const estimatedTotal = Math.round((sampleRecords / sampleSize) * fileSize);
      return estimatedTotal;
    } catch (error) {
      systemLogger.warn('Error counting records', { s3Key, error: error.message });
      return null;
    }
  }

  /**
   * Get record count from Parquet file metadata
   */
  static async getParquetRecordCount(s3, bucket, s3Key) {
    try {
      const response = await s3.getObject({ Bucket: bucket, Key: s3Key }).promise();
      const buffer = response.Body;
      
      // Use dynamic import for hyparquet (ESM module)
      const hyparquet = await import('hyparquet');
      const parquetMetadata = hyparquet.parquetMetadata;
      
      const arrayBuffer = new Uint8Array(buffer).buffer;
      const metadata = parquetMetadata(arrayBuffer);
      
      // Sum up row counts from all row groups
      if (metadata && metadata.row_groups) {
        let totalRows = 0;
        for (const rowGroup of metadata.row_groups) {
          if (rowGroup.num_rows) {
            totalRows += rowGroup.num_rows;
          }
        }
        return totalRows > 0 ? totalRows : null;
      }
      
      // Try direct num_rows property
      if (metadata && metadata.num_rows) {
        return metadata.num_rows;
      }
      
      return null;
    } catch (error) {
      systemLogger.warn('Error getting parquet record count', { s3Key, error: error.message });
      return null;
    }
  }

  /**
   * Count records from a buffer based on file type
   */
  static countRecordsFromBuffer(buffer, fileExtension) {
    try {
      switch (fileExtension) {
        case 'csv':
        case 'txt':
        case 'dat': {
          const content = buffer.toString('utf-8');
          const lines = content.split('\n').filter(l => l.trim());
          // Subtract 1 for header row
          return Math.max(0, lines.length - 1);
        }
        case 'json': {
          const content = buffer.toString('utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            return parsed.length;
          }
          // For object with array property
          for (const key of Object.keys(parsed)) {
            if (Array.isArray(parsed[key])) {
              return parsed[key].length;
            }
          }
          return 1;
        }
        case 'xlsx':
        case 'xls': {
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const range = xlsx.utils.decode_range(firstSheet['!ref'] || 'A1');
          // Subtract 1 for header row
          return Math.max(0, range.e.r);
        }
        case 'xml': {
          const content = buffer.toString('utf-8');
          // Count closing tags that look like record elements (rough estimate)
          const matches = content.match(/<\/[A-Za-z]+>/g);
          if (matches) {
            // Estimate based on common patterns (divide by avg tags per record)
            return Math.round(matches.length / 5);
          }
          return null;
        }
        case 'parquet': {
          // Parquet record count requires async operation, handled separately
          return null;
        }
        default:
          return null;
      }
    } catch (error) {
      systemLogger.warn('Error counting records from buffer', { fileExtension, error: error.message });
      return null;
    }
  }

  /**
   * Extract column headers from file (metadata only - no full read)
   */
  static async extractFileColumns(s3, bucket, filePath, fileExtension) {
    // Extract the actual S3 key from the file path (handles s3:// URIs)
    const s3Key = this.extractS3Key(filePath, bucket);
    
    const params = {
      Bucket: bucket,
      Key: s3Key,
      Range: 'bytes=0-65536'
    };

    const response = await s3.getObject(params).promise();
    const buffer = response.Body;

    switch (fileExtension) {
      case 'csv':
        return this.extractCSVColumns(buffer);
      case 'json':
        return this.extractJSONColumns(buffer);
      case 'xlsx':
      case 'xls':
        return this.extractExcelColumns(buffer);
      case 'xml':
        return this.extractXMLColumns(buffer);
      case 'parquet':
        return await this.extractParquetColumns(s3, bucket, s3Key);
      case 'dat':
      case 'txt':
        return this.extractFixedWidthColumns(buffer);
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  }

  /**
   * Extract columns from CSV header
   */
  static extractCSVColumns(buffer) {
    const content = buffer.toString('utf-8');
    const firstLine = content.split('\n')[0].trim();
    
    const columns = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of firstLine) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        columns.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) {
      columns.push(current.trim().replace(/^"|"$/g, ''));
    }

    return columns;
  }

  /**
   * Extract keys from JSON (first object)
   */
  static extractJSONColumns(buffer) {
    const content = buffer.toString('utf-8');
    
    try {
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Object.keys(parsed[0]);
      }
      
      if (typeof parsed === 'object') {
        return Object.keys(parsed);
      }
      
      return [];
    } catch (e) {
      const arrayMatch = content.match(/\[\s*\{([^}]+)\}/);
      if (arrayMatch) {
        const keyMatches = arrayMatch[1].match(/"([^"]+)"\s*:/g);
        if (keyMatches) {
          return keyMatches.map(k => k.replace(/"/g, '').replace(':', '').trim());
        }
      }
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Extract columns from Excel header
   */
  static extractExcelColumns(buffer) {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    
    const range = xlsx.utils.decode_range(firstSheet['!ref'] || 'A1');
    const columns = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = xlsx.utils.encode_cell({ r: 0, c: col });
      const cell = firstSheet[cellAddress];
      if (cell && cell.v !== undefined) {
        columns.push(String(cell.v));
      }
    }

    return columns;
  }

  /**
   * Extract columns/fields from XML (first record element)
   */
  static extractXMLColumns(buffer) {
    const content = buffer.toString('utf-8');
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    try {
      const parsed = parser.parse(content);
      
      // Find the first array of records (common XML patterns)
      const findRecordKeys = (obj, depth = 0) => {
        if (depth > 5) return null; // Prevent infinite recursion
        
        for (const key of Object.keys(obj)) {
          const value = obj[key];
          
          // If it's an array, get keys from first element
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            return Object.keys(value[0]).filter(k => !k.startsWith('@_'));
          }
          
          // If it's an object with a single child that's an array
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const result = findRecordKeys(value, depth + 1);
            if (result) return result;
          }
        }
        return null;
      };
      
      const columns = findRecordKeys(parsed);
      if (columns && columns.length > 0) {
        return columns;
      }
      
      // Fallback: get all unique keys from root level
      const rootKeys = Object.keys(parsed).filter(k => !k.startsWith('?'));
      if (rootKeys.length === 1) {
        const rootValue = parsed[rootKeys[0]];
        if (typeof rootValue === 'object' && rootValue !== null) {
          return Object.keys(rootValue).filter(k => !k.startsWith('@_'));
        }
      }
      
      return rootKeys;
    } catch (e) {
      throw new Error(`Failed to parse XML: ${e.message}`);
    }
  }

  /**
   * Extract columns from Parquet file via hyparquet library
   * Parquet has schema metadata in footer that can be read efficiently
   */
  static async extractParquetColumns(s3, bucket, s3Key, credentials = null) {
    try {
      const fullParams = { Bucket: bucket, Key: s3Key };
      const fullResponse = await s3.getObject(fullParams).promise();
      const buffer = fullResponse.Body;
      
      // Use dynamic import for hyparquet (ESM module)
      const hyparquet = await import('hyparquet');
      const parquetMetadata = hyparquet.parquetMetadata;
      
      // Properly convert Node.js Buffer to ArrayBuffer
      // Node.js Buffer may share underlying ArrayBuffer, so we need to copy
      const arrayBuffer = new Uint8Array(buffer).buffer;
      
      const metadata = parquetMetadata(arrayBuffer);
      
      if (metadata && metadata.schema && metadata.schema.length > 0) {
        // First element is usually the root schema, columns start from index 1
        const columns = metadata.schema
          .slice(1)
          .filter(col => col.name) // Filter out any entries without names
          .map(col => col.name);
        
        if (columns.length > 0) {
          systemLogger.info('Extracted Parquet schema', {
            bucket,
            key: s3Key,
            columnCount: columns.length
          });
          return columns;
        }
      }
      
      throw new Error('Could not extract schema from Parquet file');
    } catch (error) {
      systemLogger.error('Parquet schema extraction failed', { 
        error: error.message,
        bucket,
        key: s3Key
      });
      throw new Error(`Parquet schema extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract columns from fixed-width/DAT file
   * Fixed-width files don't typically have delimiters; column positions
   * are defined by start position and width in the schema.
   * 
   * This method attempts to detect if there's a header row, otherwise
   * returns a special indicator so validation can fall back to schema-defined columns.
   */
  static extractFixedWidthColumns(buffer, schemaColumns = null) {
    const content = buffer.toString('utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    if (lines.length === 0) {
      return ['_empty_file_'];
    }
    
    const firstLine = lines[0];
    
    // If schema defines column positions with start_position/width,
    // use those to extract column names from first line
    if (schemaColumns && Array.isArray(schemaColumns) && schemaColumns.length > 0) {
      const hasPositions = schemaColumns.every(col => 
        typeof col.start_position === 'number' && typeof col.width === 'number'
      );
      
      if (hasPositions) {
        // Extract values from first line using schema positions
        const extractedColumns = schemaColumns.map(col => {
          const start = col.start_position - 1; // Convert to 0-indexed
          const end = start + col.width;
          return firstLine.substring(start, end).trim();
        });
        
        // Check if extracted values look like column names (alphanumeric)
        const looksLikeHeaders = extractedColumns.every(val => 
          /^[A-Za-z]/.test(val) && !/^\d+(\.\d+)?$/.test(val)
        );
        
        if (looksLikeHeaders) {
          return extractedColumns.filter(c => c);
        }
        
        // Return schema-defined column names instead
        return schemaColumns.map(col => col.column_name || col.name || `col_${col.start_position}`);
      }
    }
    
    // Fallback: Try to detect if first line is a header
    // Check if it contains only alphabetic characters and common separators
    if (/^[A-Za-z_]/.test(firstLine.trim())) {
      // Try tab-delimited first
      let columns = firstLine.split('\t').map(c => c.trim()).filter(c => c);
      if (columns.length > 1) {
        return columns;
      }
      
      // Try multiple spaces as delimiter
      columns = firstLine.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
      if (columns.length > 1) {
        return columns;
      }
    }
    
    // Return indicator that this is a headerless fixed-width file
    // Validation should fall back to comparing column count with schema
    return ['_fixed_width_no_header_'];
  }

  /**
   * Generate Excel report
   */
  static async generateReport(job, results) {
    const reportDir = path.join(os.tmpdir(), 'schema-validation-reports');
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFileName = `schema-validation-${job.id}-${Date.now()}.xlsx`;
    const reportPath = path.join(reportDir, reportFileName);

    const summaryData = [
      ['Schema Validation Report'],
      [''],
      ['Job Name', job.job_name],
      ['Project', job.project_name],
      ['Vendor Agreement', `${job.vendor_name || ''} - ${job.agreement_name || ''}`],
      ['S3 Path', job.s3_path],
      ['Executed At', new Date().toISOString()],
      [''],
      ['Summary'],
      ['Total Files', results.length],
      ['Valid Files', results.filter(r => r.valid).length],
      ['Invalid Files', results.filter(r => !r.valid).length],
    ];

    const detailsData = [
      ['File Name', 'File Type', 'File Size', 'Record Count', 'Status', 'Matched Pattern', 'Actual Columns', 'Expected Columns', 'Missing Columns', 'Extra Columns', 'Reason', 'Full Path']
    ];

    for (const result of results) {
      detailsData.push([
        result.fileName || path.basename(result.filePath || ''),
        result.fileType || path.extname(result.filePath || '').slice(1) || '-',
        result.fileSizeFormatted || '-',
        result.recordCount || '-',
        result.valid ? 'Valid' : 'Invalid',
        result.matchedPattern || '-',
        result.actualColumnCount || '-',
        result.expectedColumnCount || '-',
        result.missingColumns?.join(', ') || '-',
        result.extraColumns?.join(', ') || '-',
        result.reason || result.error || '-',
        result.filePath || '-'
      ]);
    }

    const invalidFiles = results.filter(r => !r.valid && r.missingColumns?.length > 0);
    const columnIssuesData = [
      ['File', 'Missing Column', 'Expected Type']
    ];

    for (const file of invalidFiles) {
      for (const col of file.missingColumns || []) {
        const expectedCol = file.details?.expectedColumns?.find(c => 
          c.toLowerCase() === col.toLowerCase()
        );
        columnIssuesData.push([
          file.filePath,
          col,
          '-'
        ]);
      }
    }

    const workbook = xlsx.utils.book_new();

    const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const detailsSheet = xlsx.utils.aoa_to_sheet(detailsData);
    xlsx.utils.book_append_sheet(workbook, detailsSheet, 'File Details');

    if (columnIssuesData.length > 1) {
      const issuesSheet = xlsx.utils.aoa_to_sheet(columnIssuesData);
      xlsx.utils.book_append_sheet(workbook, issuesSheet, 'Column Issues');
    }

    xlsx.writeFile(workbook, reportPath);

    systemLogger.info('Generated schema validation report', { 
      jobId: job.id, 
      reportPath 
    });

    return reportPath;
  }

  /**
   * Get report file path for download
   */
  static async getReportPath(jobId) {
    const result = await pool.query(
      `SELECT report_path FROM schema_validation_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0 || !result.rows[0].report_path) {
      return null;
    }

    const reportPath = result.rows[0].report_path;
    
    if (!fs.existsSync(reportPath)) {
      return null;
    }

    return reportPath;
  }

  /**
   * Delete a scheduled job
   */
  static async deleteSchedule(scheduleId) {
    await pool.query(
      `DELETE FROM schema_validation_jobs WHERE id = $1 AND status = 'scheduled'`,
      [scheduleId]
    );
  }

  /**
   * Update a schedule
   */
  static async updateSchedule(scheduleId, updates) {
    const fields = [];
    const values = [scheduleId];
    let paramIndex = 2;

    if (updates.cronExpression !== undefined) {
      fields.push(`cron_expression = $${paramIndex}`);
      values.push(updates.cronExpression);
      paramIndex++;
    }

    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    if (fields.length === 0) return;

    await pool.query(
      `UPDATE schema_validation_jobs 
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $1`,
      values
    );
  }
}

module.exports = FastSchemaValidationService;
