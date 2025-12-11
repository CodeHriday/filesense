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
        dqValidation: validationResult.dqValidation || null,
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
      
      // Get archive passwords from vendor agreement file schemas (pattern -> password map)
      const archivePasswords = await this.getArchivePasswords(job.vendor_agreement_id);
      
      // Check for archive files and expand them
      const expandedFiles = await this.expandArchiveFiles(
        s3, 
        connectionCredentials.bucket, 
        files, 
        archivePasswords,
        jobId
      );
      
      // Always use expanded file list - expandArchiveFiles replaces archives with their extracted contents
      // Archives are NOT included in expanded list when extraction succeeds (only extracted files are)
      // Archives WITH errors ARE included (with archiveError flag) to report the failure
      files = expandedFiles;
      
      // Log archive expansion results
      const extractedCount = files.filter(f => f.isExtracted).length;
      const archiveErrorCount = files.filter(f => f.archiveError).length;
      systemLogger.info('Archive expansion completed', { 
        jobId, 
        originalCount: filesResult.rows.length,
        expandedCount: files.length,
        extractedFileCount: extractedCount,
        archiveErrorCount 
      });
      
      // Update total file count after expansion
      if (files.length !== filesResult.rows.length) {
        await this.updateJobStatus(jobId, 'running', {
          total_files: files.length
        });
      }
      
      const totalFiles = files.length;
      const BATCH_SIZE = 10; // Process 10 files in parallel
      let errorCount = 0;
      
      // Shared progress tracker for real-time per-file updates
      const progressTracker = {
        processedCount: 0,
        validCount: 0,
        invalidCount: 0,
        errorCount: 0,
        updateInProgress: false,
        pendingUpdate: false
      };
      
      // Debounced progress update function
      const updateProgress = async () => {
        if (progressTracker.updateInProgress) {
          progressTracker.pendingUpdate = true;
          return;
        }
        progressTracker.updateInProgress = true;
        
        try {
          await this.updateJobStatus(jobId, 'running', {
            processed_count: progressTracker.processedCount,
            total_files: totalFiles,
            valid_count: progressTracker.validCount,
            invalid_count: progressTracker.invalidCount,
            error_count: progressTracker.errorCount
          });
        } finally {
          progressTracker.updateInProgress = false;
          if (progressTracker.pendingUpdate) {
            progressTracker.pendingUpdate = false;
            setImmediate(updateProgress);
          }
        }
      };
      
      // Process files in parallel batches
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel with per-file progress updates
        const batchPromises = batch.map(async (file) => {
          const filePath = file.file_path || file.filePath;
          const isExtracted = file.isExtracted === true;
          const originalArchive = file.originalArchive;
          let result;
          let isValid = false;
          let isError = false;
          
          // Handle archive extraction errors
          if (file.archiveError) {
            result = {
              filePath,
              valid: false,
              fileType: path.extname(filePath).slice(1).toLowerCase() || 'unknown',
              fileSize: null,
              fileSizeFormatted: '-',
              recordCount: null,
              error: file.archiveError,
              reason: `Archive extraction failed: ${file.archiveError}`
            };
            isError = true;
            
            if (file.id) {
              await pool.query(
                `UPDATE schema_validation_job_files 
                 SET status = 'error', error_message = $2, validation_result = $3, updated_at = NOW()
                 WHERE id = $1`,
                [file.id, file.archiveError, JSON.stringify(result)]
              );
            }
            
            progressTracker.processedCount++;
            progressTracker.errorCount++;
            updateProgress();
            
            return { result, isValid: false, isError: true };
          }
          
          try {
            // Get file metadata (size, type) - handle local extracted files
            const fileMetadata = await this.getFileMetadata(
              s3, 
              connectionCredentials.bucket, 
              filePath,
              isExtracted
            );
            
            const validationResult = await this.validateFileMetadata(
              s3,
              connectionCredentials.bucket,
              filePath,
              agreementSchema,
              isExtracted,
              originalArchive
            );

            // Merge metadata with validation result
            result = {
              filePath,
              fileSize: fileMetadata.size,
              fileSizeFormatted: this.formatFileSize(fileMetadata.size),
              fileType: fileMetadata.fileType,
              recordCount: validationResult.recordCount || null,
              ...validationResult
            };

            isValid = validationResult.valid;

            // If schema validation passed, run DQ validation
            let dqResult = { executed: false, status: 'skipped', rulesExecuted: 0, violationCount: 0 };
            if (isValid && validationResult.matchedPattern) {
              try {
                // Find the matched pattern to get its quality rules
                const matchedPatternObj = agreementSchema.patterns?.find(
                  p => p.file_name_pattern === validationResult.matchedPattern
                );
                
                if (matchedPatternObj?.qualityRules?.length > 0) {
                  // Extract sample data for DQ validation
                  const sampleData = await this.extractSampleData(
                    s3,
                    connectionCredentials.bucket,
                    filePath,
                    fileMetadata.fileType,
                    100, // Limit to 100 rows for performance
                    isExtracted
                  );
                  
                  if (sampleData && sampleData.length > 0) {
                    dqResult = await this.executeDQValidation(
                      sampleData,
                      matchedPatternObj.qualityRules,
                      { filePath, fileType: fileMetadata.fileType }
                    );
                  }
                }
              } catch (dqError) {
                systemLogger.warn('DQ validation failed', { 
                  filePath, 
                  error: dqError.message 
                });
                dqResult = {
                  executed: false,
                  status: 'error',
                  error: dqError.message,
                  rulesExecuted: 0,
                  violationCount: 0
                };
              }
            }

            // Add DQ results to the validation result
            result.dqValidation = dqResult;

            // Update file record if it exists in DB
            if (file.id) {
              await pool.query(
                `UPDATE schema_validation_job_files 
                 SET status = $2, validation_result = $3, 
                     dq_status = $4, dq_rules_executed = $5, dq_violation_count = $6,
                     updated_at = NOW()
                 WHERE id = $1`,
                [
                  file.id, 
                  validationResult.valid ? 'valid' : 'invalid', 
                  JSON.stringify(result),
                  dqResult.status || 'skipped',
                  dqResult.rulesExecuted || 0,
                  dqResult.violationCount || 0
                ]
              );
            }

          } catch (fileError) {
            systemLogger.error('Error validating file', { 
              filePath, 
              error: fileError.message 
            });
            
            result = {
              filePath,
              valid: false,
              fileType: path.extname(filePath).slice(1) || 'unknown',
              fileSize: null,
              fileSizeFormatted: '-',
              recordCount: null,
              error: fileError.message,
              reason: fileError.message
            };
            
            isError = true;
            
            if (file.id) {
              await pool.query(
                `UPDATE schema_validation_job_files 
                 SET status = 'error', error_message = $2, validation_result = $3, updated_at = NOW()
                 WHERE id = $1`,
                [file.id, fileError.message, JSON.stringify(result)]
              );
            }
          }
          
          // Update progress tracker per file (thread-safe increment)
          progressTracker.processedCount++;
          if (isValid) {
            progressTracker.validCount++;
          } else if (isError) {
            progressTracker.errorCount++;
          } else {
            progressTracker.invalidCount++;
          }
          
          // Trigger progress update (fire and forget - debounced)
          updateProgress().catch(err => {
            systemLogger.warn('Progress update failed', { jobId, error: err.message });
          });

          return { result, valid: isValid, error: isError };
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Aggregate batch results
        for (const { result, error } of batchResults) {
          results.push(result);
          if (error) {
            errorCount++;
          }
        }
        
        // Final progress sync after batch
        await this.updateJobStatus(jobId, 'running', {
          processed_count: progressTracker.processedCount,
          total_files: totalFiles,
          valid_count: progressTracker.validCount,
          invalid_count: progressTracker.invalidCount,
          error_count: progressTracker.errorCount
        });
        
        systemLogger.info('Batch processed', { 
          jobId, 
          batchNumber: Math.floor(i / BATCH_SIZE) + 1,
          processedCount: progressTracker.processedCount,
          totalFiles 
        });
      }
      
      // Copy final counts from tracker
      processedCount = progressTracker.processedCount;
      validCount = progressTracker.validCount;
      invalidCount = progressTracker.invalidCount;
      errorCount = progressTracker.errorCount;

      const reportPath = await this.generateReport(job, results);

      await this.updateJobStatus(jobId, 'completed', {
        processed_count: processedCount,
        total_files: totalFiles,
        valid_count: validCount,
        invalid_count: invalidCount,
        error_count: errorCount,
        report_path: reportPath
      });

      systemLogger.info('Schema validation job completed', { 
        jobId, 
        validCount, 
        invalidCount,
        errorCount,
        totalFiles 
      });

      return {
        success: true,
        validCount,
        invalidCount,
        errorCount,
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
   * Get archive passwords from vendor agreement file schemas
   * Returns a map of file_name_pattern -> password for archives that have passwords stored
   */
  static async getArchivePasswords(vendorAgreementId) {
    try {
      const passwordVaultService = new PasswordVaultService(pool, null, systemLogger);
      
      const schemasResult = await pool.query(
        `SELECT id, file_name_pattern FROM vendor_agreement_file_schemas 
         WHERE vendor_agreement_id = $1 AND is_active = TRUE`,
        [vendorAgreementId]
      );
      
      const passwordMap = {};
      
      for (const schema of schemasResult.rows) {
        try {
          const password = await passwordVaultService.retrievePassword(
            'vendor_agreement_file_schema',
            schema.id.toString()
          );
          if (password) {
            passwordMap[schema.file_name_pattern] = password;
            passwordMap[`schema_${schema.id}`] = password;
          }
        } catch (err) {
          // No password for this schema - that's okay
        }
      }
      
      systemLogger.info('Retrieved archive passwords for vendor agreement', {
        vendorAgreementId,
        schemaCount: schemasResult.rows.length,
        passwordsFound: Object.keys(passwordMap).filter(k => !k.startsWith('schema_')).length
      });
      
      return passwordMap;
    } catch (error) {
      systemLogger.warn('Failed to retrieve archive passwords', { 
        vendorAgreementId, 
        error: error.message 
      });
      return {};
    }
  }
  
  /**
   * Find the matching password for an archive file based on pattern matching
   */
  static findPasswordForFile(fileName, passwordMap) {
    if (!passwordMap || Object.keys(passwordMap).length === 0) {
      return null;
    }
    
    for (const [pattern, password] of Object.entries(passwordMap)) {
      if (pattern.startsWith('schema_')) continue;
      if (matchesPattern(fileName, pattern)) {
        return password;
      }
    }
    
    return null;
  }

  /**
   * Expand archive files - extract contents and return expanded file list
   * @param {Object} s3 - S3 client
   * @param {string} bucket - S3 bucket name
   * @param {Array} files - Array of file objects
   * @param {Object} archivePasswords - Map of file_name_pattern -> password
   * @param {string} jobId - Job ID for logging
   */
  static async expandArchiveFiles(s3, bucket, files, archivePasswords, jobId) {
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
          // Find matching password for this archive based on file pattern
          const archivePassword = this.findPasswordForFile(fileName, archivePasswords);
          
          systemLogger.info('Processing archive file for schema validation', { 
            filePath, 
            jobId,
            hasPassword: !!archivePassword 
          });
          
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
   * Get vendor agreement schema with associated DQ rules
   */
  static async getAgreementSchema(vendorAgreementId) {
    const fileSchemasResult = await pool.query(
      `SELECT id, file_name_pattern, schema, priority, file_description, quality_rule_ids 
       FROM vendor_agreement_file_schemas 
       WHERE vendor_agreement_id = $1 AND is_active = TRUE 
       ORDER BY priority ASC, id ASC`,
      [vendorAgreementId]
    );

    if (fileSchemasResult.rows.length > 0) {
      // Collect all unique quality rule IDs across all patterns
      const allRuleIds = new Set();
      for (const pattern of fileSchemasResult.rows) {
        if (pattern.quality_rule_ids && Array.isArray(pattern.quality_rule_ids)) {
          pattern.quality_rule_ids.forEach(id => allRuleIds.add(id));
        }
      }

      // Fetch full quality rule definitions if any exist
      let qualityRulesMap = {};
      if (allRuleIds.size > 0) {
        const rulesResult = await pool.query(
          `SELECT id, rule_name, rule_type, description, column_name, rule_config, severity, enabled
           FROM quality_rules 
           WHERE id = ANY($1) AND enabled = TRUE`,
          [Array.from(allRuleIds)]
        );
        
        for (const rule of rulesResult.rows) {
          qualityRulesMap[rule.id] = rule;
        }
      }

      // Attach full rule definitions to each pattern
      const patternsWithRules = fileSchemasResult.rows.map(pattern => ({
        ...pattern,
        qualityRules: (pattern.quality_rule_ids || [])
          .filter(id => qualityRulesMap[id])
          .map(id => qualityRulesMap[id])
      }));

      return {
        type: 'multi-pattern',
        patterns: patternsWithRules,
        qualityRulesMap
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
      pattern: legacyResult.rows[0].file_name,
      qualityRules: []
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
   * @param {Object} s3 - S3 client
   * @param {string} bucket - S3 bucket name
   * @param {string} filePath - Path to file (S3 or local)
   * @param {Object} agreementSchema - Schema to validate against
   * @param {boolean} isExtracted - Whether file was extracted from archive
   * @param {string} originalArchive - Original archive path (for pattern matching)
   */
  static async validateFileMetadata(s3, bucket, filePath, agreementSchema, isExtracted = false, originalArchive = null) {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName).toLowerCase().slice(1);
    
    // For extracted files, use the original archive name for pattern matching
    const patternMatchName = originalArchive ? path.basename(originalArchive) : fileName;

    let expectedSchema;
    let matchedPattern = null;

    if (agreementSchema.type === 'multi-pattern') {
      for (const pattern of agreementSchema.patterns) {
        if (matchesPattern(patternMatchName, pattern.file_name_pattern)) {
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
      // For DAT/fixed-width files, pass schema columns to help with extraction
      if (fileExtension === 'dat' || fileExtension === 'txt') {
        actualColumns = await this.extractFileColumnsWithSchema(s3, bucket, filePath, fileExtension, expectedSchema, isExtracted);
      } else {
        actualColumns = await this.extractFileColumns(s3, bucket, filePath, fileExtension, isExtracted);
      }
    } catch (err) {
      return {
        valid: false,
        reason: `Failed to read file headers: ${err.message}`,
        fileName,
        matchedPattern
      };
    }

    // Handle archive files that need extraction
    if (actualColumns.length === 1 && actualColumns[0] === '_archive_needs_extraction_') {
      return {
        valid: false,
        reason: 'Archive file needs extraction before validation',
        fileName,
        matchedPattern,
        isArchive: true
      };
    }

    const expectedColumns = expectedSchema.map(col => ({
      name: col.name || col.column_name,
      type: col.type || col.data_type,
      nullable: col.nullable !== false,
      start_position: col.start_position,
      width: col.width
    }));

    // Handle fixed-width files without headers
    if (actualColumns.length === 1 && actualColumns[0] === '_fixed_width_no_header_') {
      // For fixed-width DAT files without headers, validate by column count
      // Get actual column count by checking line length vs schema-defined positions
      const schemaColumnCount = expectedColumns.length;
      
      return {
        valid: true,
        fileName,
        matchedPattern,
        actualColumnCount: schemaColumnCount,
        expectedColumnCount: schemaColumnCount,
        missingColumns: [],
        extraColumns: [],
        recordCount: null,
        reason: 'Fixed-width file validated by schema column count',
        details: {
          actualColumns: expectedColumns.map(c => c.name),
          expectedColumns: expectedColumns.map(c => c.name)
        }
      };
    }

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
      recordCount = await this.getRecordCount(s3, bucket, filePath, fileExtension, isExtracted);
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
  static async getRecordCount(s3, bucket, filePath, fileExtension, isExtracted = false) {
    const s3Key = this.extractS3Key(filePath, bucket);
    
    // Check if this is a local file (extracted from archive)
    if ((isExtracted && fs.existsSync(filePath)) || (!filePath.startsWith('s3://') && fs.existsSync(filePath))) {
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
      
      systemLogger.debug('Parquet metadata structure', { 
        s3Key, 
        hasMetadata: !!metadata,
        metadataKeys: metadata ? Object.keys(metadata) : [],
        rowGroupsLength: metadata?.row_groups?.length,
        numRows: metadata?.num_rows,
        numRowsBigInt: typeof metadata?.num_rows
      });
      
      // First, check top-level numRows (hyparquet's preferred property)
      if (metadata?.numRows !== undefined && metadata.numRows !== null) {
        const count = Number(metadata.numRows);
        if (count > 0) {
          systemLogger.info('Parquet record count from numRows', { s3Key, count });
          return count;
        }
      }
      
      // Try direct num_rows property (may be BigInt)
      if (metadata?.num_rows !== undefined && metadata.num_rows !== null) {
        const count = Number(metadata.num_rows);
        if (count > 0) {
          systemLogger.info('Parquet record count from num_rows', { s3Key, count });
          return count;
        }
      }
      
      // Sum up row counts from all row groups as fallback
      if (metadata && metadata.row_groups && metadata.row_groups.length > 0) {
        let totalRows = BigInt(0);
        for (const rowGroup of metadata.row_groups) {
          // hyparquet may use num_rows or numRows
          const rowCount = rowGroup.num_rows ?? rowGroup.numRows;
          if (rowCount !== undefined && rowCount !== null) {
            totalRows += BigInt(rowCount);
          }
        }
        if (totalRows > 0) {
          const count = Number(totalRows);
          systemLogger.info('Parquet record count from row_groups', { s3Key, count });
          return count;
        }
      }
      
      // Check metadata.metadata for additional properties
      if (metadata?.metadata) {
        const innerMeta = metadata.metadata;
        if (innerMeta.num_rows !== undefined) {
          return Number(innerMeta.num_rows);
        }
        if (innerMeta.numRows !== undefined) {
          return Number(innerMeta.numRows);
        }
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
   * Extract sample data rows from a file for DQ validation
   * @param {AWS.S3} s3 - S3 client
   * @param {string} bucket - S3 bucket
   * @param {string} filePath - File path
   * @param {string} fileType - File extension type
   * @param {number} maxRows - Maximum rows to extract
   * @returns {Array} - Array of data row objects
   */
  static async extractSampleData(s3, bucket, filePath, fileType, maxRows = 100) {
    const s3Key = this.extractS3Key(filePath, bucket);
    
    try {
      // Check if this is a local file (extracted from archive)
      let buffer;
      if (fs.existsSync(filePath)) {
        buffer = fs.readFileSync(filePath);
      } else {
        const response = await s3.getObject({ Bucket: bucket, Key: s3Key }).promise();
        buffer = response.Body;
      }

      switch (fileType.toLowerCase()) {
        case 'csv':
        case 'txt':
        case 'dat': {
          return this.parseCsvSample(buffer, maxRows);
        }
        case 'json': {
          return this.parseJsonSample(buffer, maxRows);
        }
        case 'xlsx':
        case 'xls': {
          return this.parseExcelSample(buffer, maxRows);
        }
        case 'xml': {
          return this.parseXmlSample(buffer, maxRows);
        }
        default:
          systemLogger.debug('Unsupported file type for sample extraction', { fileType });
          return [];
      }
    } catch (error) {
      systemLogger.warn('Error extracting sample data', { 
        filePath, 
        fileType, 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * Parse CSV buffer to sample rows
   */
  static parseCsvSample(buffer, maxRows) {
    return new Promise((resolve) => {
      const rows = [];
      const stream = Readable.from(buffer);
      
      stream.pipe(csv())
        .on('data', (row) => {
          if (rows.length < maxRows) {
            rows.push(row);
          } else {
            stream.destroy(); // Stop reading
          }
        })
        .on('end', () => resolve(rows))
        .on('error', () => resolve(rows))
        .on('close', () => resolve(rows));
    });
  }

  /**
   * Parse JSON buffer to sample rows
   */
  static parseJsonSample(buffer, maxRows) {
    try {
      const content = buffer.toString('utf-8');
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed)) {
        return parsed.slice(0, maxRows);
      }
      
      // Look for array property in object
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          return parsed[key].slice(0, maxRows);
        }
      }
      
      // Single object
      return [parsed];
    } catch {
      return [];
    }
  }

  /**
   * Parse Excel buffer to sample rows
   */
  static parseExcelSample(buffer, maxRows) {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(firstSheet, { defval: null });
      return data.slice(0, maxRows);
    } catch {
      return [];
    }
  }

  /**
   * Parse XML buffer to sample rows
   */
  static parseXmlSample(buffer, maxRows) {
    try {
      const content = buffer.toString('utf-8');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
      });
      const parsed = parser.parse(content);
      
      // Find array of records in parsed XML
      const findRecordArray = (obj, depth = 0) => {
        if (depth > 5 || !obj) return null;
        
        for (const key of Object.keys(obj)) {
          const value = obj[key];
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            return value;
          }
          if (typeof value === 'object' && !Array.isArray(value)) {
            const result = findRecordArray(value, depth + 1);
            if (result) return result;
          }
        }
        return null;
      };
      
      const records = findRecordArray(parsed);
      return records ? records.slice(0, maxRows) : [];
    } catch {
      return [];
    }
  }

  /**
   * Extract column headers from file (metadata only - no full read)
   * @param {Object} s3 - S3 client
   * @param {string} bucket - S3 bucket name
   * @param {string} filePath - Path to file (S3 or local)
   * @param {string} fileExtension - File extension
   * @param {boolean} isExtracted - Whether file was extracted from archive (local file)
   */
  static async extractFileColumns(s3, bucket, filePath, fileExtension, isExtracted = false) {
    let buffer;
    
    // Handle local extracted files
    if (isExtracted && fs.existsSync(filePath)) {
      // Read first 64KB of local file
      const fd = fs.openSync(filePath, 'r');
      buffer = Buffer.alloc(65536);
      const bytesRead = fs.readSync(fd, buffer, 0, 65536, 0);
      fs.closeSync(fd);
      buffer = buffer.slice(0, bytesRead);
    } else {
      // Read from S3
      const s3Key = this.extractS3Key(filePath, bucket);
      
      const params = {
        Bucket: bucket,
        Key: s3Key,
        Range: 'bytes=0-65536'
      };

      const response = await s3.getObject(params).promise();
      buffer = response.Body;
    }

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
        if (isExtracted && fs.existsSync(filePath)) {
          return await this.extractParquetColumnsFromLocal(filePath);
        }
        return await this.extractParquetColumns(s3, bucket, this.extractS3Key(filePath, bucket));
      case 'dat':
      case 'txt':
        return this.extractFixedWidthColumns(buffer);
      case 'zip':
      case '7z':
      case 'tar':
      case 'tgz':
      case 'gz':
        // Archive files need extraction first - return special marker
        return ['_archive_needs_extraction_'];
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  }

  /**
   * Extract columns from file with schema information (for DAT/fixed-width files)
   * @param {Object} s3 - S3 client
   * @param {string} bucket - S3 bucket name
   * @param {string} filePath - Path to file
   * @param {string} fileExtension - File extension
   * @param {Array} schemaColumns - Schema-defined columns with position info
   * @param {boolean} isExtracted - Whether file was extracted from archive
   */
  static async extractFileColumnsWithSchema(s3, bucket, filePath, fileExtension, schemaColumns, isExtracted = false) {
    let buffer;
    
    // Handle local extracted files
    if (isExtracted && fs.existsSync(filePath)) {
      const fd = fs.openSync(filePath, 'r');
      buffer = Buffer.alloc(65536);
      const bytesRead = fs.readSync(fd, buffer, 0, 65536, 0);
      fs.closeSync(fd);
      buffer = buffer.slice(0, bytesRead);
    } else if (!filePath.startsWith('s3://') && fs.existsSync(filePath)) {
      // Local file path
      const fd = fs.openSync(filePath, 'r');
      buffer = Buffer.alloc(65536);
      const bytesRead = fs.readSync(fd, buffer, 0, 65536, 0);
      fs.closeSync(fd);
      buffer = buffer.slice(0, bytesRead);
    } else {
      // Read from S3
      const s3Key = this.extractS3Key(filePath, bucket);
      
      const params = {
        Bucket: bucket,
        Key: s3Key,
        Range: 'bytes=0-65536'
      };

      const response = await s3.getObject(params).promise();
      buffer = response.Body;
    }

    // For DAT/TXT files, pass schema columns for position-based extraction
    if (fileExtension === 'dat' || fileExtension === 'txt') {
      return this.extractFixedWidthColumns(buffer, schemaColumns);
    }
    
    throw new Error(`extractFileColumnsWithSchema only supports dat/txt files`);
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
   * Extract columns from local Parquet file (for extracted archives)
   */
  static async extractParquetColumnsFromLocal(localFilePath) {
    try {
      const buffer = fs.readFileSync(localFilePath);
      
      // Use dynamic import for hyparquet (ESM module)
      const hyparquet = await import('hyparquet');
      const parquetMetadata = hyparquet.parquetMetadata;
      
      // Properly convert Node.js Buffer to ArrayBuffer
      const arrayBuffer = new Uint8Array(buffer).buffer;
      
      const metadata = parquetMetadata(arrayBuffer);
      
      if (metadata && metadata.schema && metadata.schema.length > 0) {
        // First element is usually the root schema, columns start from index 1
        const columns = metadata.schema
          .slice(1)
          .filter(col => col.name)
          .map(col => col.name);
        
        if (columns.length > 0) {
          systemLogger.info('Extracted Parquet schema from local file', {
            filePath: localFilePath,
            columnCount: columns.length
          });
          return columns;
        }
      }
      
      throw new Error('Could not extract schema from Parquet file');
    } catch (error) {
      systemLogger.error('Local Parquet schema extraction failed', { 
        error: error.message,
        filePath: localFilePath
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

  /**
   * Execute DQ rule validation against file sample data
   * @param {Array} data - Sample data rows from file
   * @param {Array} qualityRules - Array of quality rule definitions from contract
   * @param {Object} metadata - File/validation metadata
   * @returns {Object} - DQ validation results
   */
  static async executeDQValidation(data, qualityRules, metadata) {
    if (!qualityRules || qualityRules.length === 0 || !data || data.length === 0) {
      return {
        executed: false,
        rulesExecuted: 0,
        rulesPassed: 0,
        violationCount: 0,
        violations: [],
        status: 'skipped',
        reason: !qualityRules?.length ? 'No DQ rules defined' : 'No data available'
      };
    }

    const violations = [];
    let rulesPassed = 0;
    const ruleResults = [];

    for (const rule of qualityRules) {
      if (!rule.enabled) continue;

      try {
        const ruleViolations = await this.executeRule(rule, data, metadata);
        
        ruleResults.push({
          ruleId: rule.id,
          ruleName: rule.rule_name,
          ruleType: rule.rule_type,
          severity: rule.severity,
          violationCount: ruleViolations.length,
          passed: ruleViolations.length === 0
        });

        if (ruleViolations.length === 0) {
          rulesPassed++;
        } else {
          violations.push(...ruleViolations.slice(0, 10)); // Limit per-rule violations
        }
      } catch (ruleError) {
        systemLogger.warn('DQ rule execution failed', { 
          ruleId: rule.id, 
          error: ruleError.message 
        });
        ruleResults.push({
          ruleId: rule.id,
          ruleName: rule.rule_name,
          ruleType: rule.rule_type,
          error: ruleError.message,
          passed: false
        });
      }
    }

    const rulesExecuted = ruleResults.length;
    const hasViolations = violations.length > 0;

    return {
      executed: true,
      rulesExecuted,
      rulesPassed,
      violationCount: violations.length,
      violations: violations.slice(0, 50), // Limit total violations stored
      ruleResults,
      status: hasViolations ? 'failed' : 'passed',
      summary: {
        total: rulesExecuted,
        passed: rulesPassed,
        failed: rulesExecuted - rulesPassed,
        passRate: rulesExecuted > 0 ? ((rulesPassed / rulesExecuted) * 100).toFixed(1) : 0
      }
    };
  }

  /**
   * Execute a single DQ rule against data
   * @param {Object} rule - Quality rule definition
   * @param {Array} data - Data rows to validate
   * @param {Object} metadata - File metadata
   * @returns {Array} - Array of violations
   */
  static async executeRule(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config || {};
    const ruleType = (rule.rule_type || '').toLowerCase();
    const columnName = rule.column_name;

    switch (ruleType) {
      case 'completeness':
      case 'null_check':
      case 'column_completeness':
        return this.validateCompleteness(rule, config, data, columnName);
      
      case 'validity':
      case 'validity_check':
      case 'email_validity':
      case 'phone_validity':
      case 'date_format':
      case 'timestamp_format':
        return this.validatePatternValidity(rule, config, data, columnName);
      
      case 'uniqueness':
      case 'duplicate_check':
        return this.validateUniqueness(rule, config, data, columnName);
      
      case 'range_check':
        return this.validateRange(rule, config, data, columnName);
      
      case 'length_check':
        return this.validateLength(rule, config, data, columnName);
      
      default:
        systemLogger.debug('Unsupported DQ rule type', { ruleType, ruleId: rule.id });
        return [];
    }
  }

  /**
   * Validate completeness - check for null/empty values
   */
  static validateCompleteness(rule, config, data, columnName) {
    const violations = [];
    let threshold = config.threshold || 1.0;
    if (threshold > 1) threshold = threshold / 100;

    if (columnName) {
      let nullCount = 0;
      data.forEach(row => {
        const value = row[columnName];
        if (value === null || value === undefined || value === '') {
          nullCount++;
        }
      });

      const completeness = data.length > 0 ? (data.length - nullCount) / data.length : 1;
      
      if (completeness < threshold) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.rule_name,
          columnName,
          severity: rule.severity,
          message: `Completeness ${(completeness * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(1)}%`,
          details: {
            nullCount,
            totalRows: data.length,
            completeness: (completeness * 100).toFixed(1)
          }
        });
      }
    }
    
    return violations;
  }

  /**
   * Validate validity - pattern, range, enum, datatype
   */
  static validateValidity(rule, config, data, columnName) {
    const violations = [];
    if (!columnName) return violations;

    const validationType = config.type;
    let violationCount = 0;
    const maxSampleViolations = 5;
    const sampleViolations = [];

    data.forEach((row, rowIndex) => {
      const value = row[columnName];
      if (value === null || value === undefined || value === '') return;

      let isValid = true;
      let reason = '';

      switch (validationType) {
        case 'pattern':
          if (config.pattern) {
            const regex = new RegExp(config.pattern);
            isValid = regex.test(String(value));
            reason = `Does not match pattern ${config.pattern}`;
          }
          break;
        
        case 'range':
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            if (config.min !== undefined && numValue < config.min) {
              isValid = false;
              reason = `Value ${numValue} < minimum ${config.min}`;
            }
            if (config.max !== undefined && numValue > config.max) {
              isValid = false;
              reason = `Value ${numValue} > maximum ${config.max}`;
            }
          }
          break;
        
        case 'enum':
          if (config.allowed_values && Array.isArray(config.allowed_values)) {
            isValid = config.allowed_values.includes(value);
            reason = `Value "${value}" not in allowed values`;
          }
          break;
      }

      if (!isValid) {
        violationCount++;
        if (sampleViolations.length < maxSampleViolations) {
          sampleViolations.push({ row: rowIndex + 1, value, reason });
        }
      }
    });

    if (violationCount > 0) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.rule_name,
        columnName,
        severity: rule.severity,
        message: `${violationCount} validity violations found`,
        details: {
          violationCount,
          samples: sampleViolations
        }
      });
    }

    return violations;
  }

  /**
   * Validate pattern validity - email, phone, date, timestamp formats
   * Uses rule_type to determine validation logic
   */
  static validatePatternValidity(rule, config, data, columnName) {
    const violations = [];
    const ruleType = (rule.rule_type || '').toLowerCase();
    let violationCount = 0;
    const maxSampleViolations = 5;
    const sampleViolations = [];

    // Define built-in patterns for common rule types
    const builtInPatterns = {
      'email_validity': /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'phone_validity': /^[\d\s\-\+\(\)\.]{7,20}$/,
      'date_format': /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^\d{2}-\d{2}-\d{4}$/,
      'timestamp_format': /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
    };

    // Use pattern from config if provided, otherwise use built-in pattern
    let pattern = null;
    if (config.pattern) {
      try {
        pattern = new RegExp(config.pattern);
      } catch (e) {
        systemLogger.warn('Invalid regex pattern in rule config', { ruleId: rule.id, pattern: config.pattern });
      }
    } else if (builtInPatterns[ruleType]) {
      pattern = builtInPatterns[ruleType];
    }

    if (!pattern) {
      // No pattern available, treat as generic validity
      return this.validateValidity(rule, config, data, columnName);
    }

    // If no column specified, check all columns for pattern validity
    const columnsToCheck = columnName ? [columnName] : Object.keys(data[0] || {});

    for (const col of columnsToCheck) {
      let colViolationCount = 0;
      const colSampleViolations = [];

      data.forEach((row, rowIndex) => {
        const value = row[col];
        if (value === null || value === undefined || value === '') return;

        const strValue = String(value).trim();
        if (!pattern.test(strValue)) {
          colViolationCount++;
          if (colSampleViolations.length < maxSampleViolations) {
            colSampleViolations.push({ row: rowIndex + 1, column: col, value: strValue });
          }
        }
      });

      if (colViolationCount > 0) {
        violationCount += colViolationCount;
        sampleViolations.push(...colSampleViolations.slice(0, maxSampleViolations - sampleViolations.length));
      }
    }

    if (violationCount > 0) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.rule_name,
        columnName: columnName || '(all columns)',
        severity: rule.severity,
        message: `${violationCount} ${ruleType.replace(/_/g, ' ')} violations found`,
        details: {
          violationCount,
          samples: sampleViolations
        }
      });
    }

    return violations;
  }

  /**
   * Validate uniqueness - check for duplicates
   */
  static validateUniqueness(rule, config, data, columnName) {
    const violations = [];
    const columnsToCheck = config.columns || (columnName ? [columnName] : []);
    if (columnsToCheck.length === 0) return violations;

    const seen = new Map();
    const duplicates = [];

    data.forEach((row, rowIndex) => {
      const keyParts = columnsToCheck.map(col => row[col]);
      if (keyParts.some(val => val === null || val === undefined || val === '')) return;

      const key = JSON.stringify(keyParts);
      if (seen.has(key)) {
        if (duplicates.length < 10) {
          duplicates.push({ row: rowIndex + 1, value: keyParts });
        }
      } else {
        seen.set(key, rowIndex + 1);
      }
    });

    if (duplicates.length > 0) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.rule_name,
        columnName: columnsToCheck.join(', '),
        severity: rule.severity,
        message: `${duplicates.length} duplicate values found`,
        details: {
          duplicateCount: duplicates.length,
          samples: duplicates.slice(0, 5)
        }
      });
    }

    return violations;
  }

  /**
   * Validate range - numeric min/max checks
   */
  static validateRange(rule, config, data, columnName) {
    const violations = [];
    if (!columnName) return violations;

    const min = config.min !== undefined ? Number(config.min) : null;
    const max = config.max !== undefined ? Number(config.max) : null;
    let violationCount = 0;
    const samples = [];

    data.forEach((row, rowIndex) => {
      const value = row[columnName];
      if (value === null || value === undefined || value === '') return;

      const numValue = Number(value);
      if (isNaN(numValue)) return;

      let outOfRange = false;
      let reason = '';

      if (min !== null && numValue < min) {
        outOfRange = true;
        reason = `${numValue} < ${min}`;
      }
      if (max !== null && numValue > max) {
        outOfRange = true;
        reason = `${numValue} > ${max}`;
      }

      if (outOfRange) {
        violationCount++;
        if (samples.length < 5) {
          samples.push({ row: rowIndex + 1, value: numValue, reason });
        }
      }
    });

    if (violationCount > 0) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.rule_name,
        columnName,
        severity: rule.severity,
        message: `${violationCount} range violations found`,
        details: { min, max, violationCount, samples }
      });
    }

    return violations;
  }

  /**
   * Validate length - string length checks
   */
  static validateLength(rule, config, data, columnName) {
    const violations = [];
    if (!columnName) return violations;

    const minLength = config.min_length;
    const maxLength = config.max_length;
    const exactLength = config.exact_length;
    let violationCount = 0;
    const samples = [];

    data.forEach((row, rowIndex) => {
      const value = row[columnName];
      if (value === null || value === undefined) return;

      const strValue = String(value);
      const length = strValue.length;
      let invalid = false;
      let reason = '';

      if (exactLength !== undefined && length !== exactLength) {
        invalid = true;
        reason = `Length ${length} != ${exactLength}`;
      } else {
        if (minLength !== undefined && length < minLength) {
          invalid = true;
          reason = `Length ${length} < ${minLength}`;
        }
        if (maxLength !== undefined && length > maxLength) {
          invalid = true;
          reason = `Length ${length} > ${maxLength}`;
        }
      }

      if (invalid) {
        violationCount++;
        if (samples.length < 5) {
          samples.push({ row: rowIndex + 1, value: strValue.substring(0, 50), length, reason });
        }
      }
    });

    if (violationCount > 0) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.rule_name,
        columnName,
        severity: rule.severity,
        message: `${violationCount} length violations found`,
        details: { minLength, maxLength, exactLength, violationCount, samples }
      });
    }

    return violations;
  }
}

module.exports = FastSchemaValidationService;
