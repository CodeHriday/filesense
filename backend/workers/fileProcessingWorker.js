/**
 * File Processing Worker
 * 
 * Processes file upload jobs in the background:
 * - Schema extraction
 * - Data profiling
 * - Quality checks
 * - Metadata storage
 * 
 * Cloud-ready: Works with any queue backend (Redis, AWS SQS, GCP Tasks)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { captureFileAudit, captureFileSchema } = require('../services/fileAuditService');
const { saveSchemaSnapshot } = require('../services/schemaService');
const QualityValidationEngine = require('../services/qualityValidationEngine');
const { persistGovernanceMetadata } = require('../services/governanceService');
const { invalidateFileCache, invalidateFileCatalogCache } = require('../src/middleware/cache');
const PasswordVaultService = require('../services/passwordVaultService');
const ArchiveDetectionService = require('../services/archiveDetectionService');
const ArchiveExtractionService = require('../services/archiveExtractionService');
const DLQService = require('../services/dlqService');

// Archive and special format file extensions
const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.tar.gz', '.tar.bz2', '.tgz', '.tbz2'];
const SPECIAL_FORMAT_EXTENSIONS = ['.sas7bdat', '.xpt', '.avro', '.dat', '.txt'];
const LEGACY_EXTENSIONS = ['.csv', '.json', '.xlsx', '.xls', '.parquet', '.xml'];

class FileProcessingWorker {
  constructor(queue, dbPool, logger, auditService = null) {
    this.queue = queue;
    this.dbPool = dbPool;
    this.logger = logger;
    this.auditService = auditService;
    
    // Initialize password vault service
    try {
      this.passwordVaultService = new PasswordVaultService(dbPool, auditService, logger);
    } catch (error) {
      this.logger.error('Failed to initialize password vault service', { error: error.message });
      throw error;
    }
    
    // Initialize archive services
    try {
      const virusScanService = require('../services/VirusScanService');
      this.archiveDetectionService = new ArchiveDetectionService(dbPool, logger);
      this.archiveExtractionService = new ArchiveExtractionService(dbPool, virusScanService, logger);
      this.dlqService = new DLQService(dbPool, logger);
    } catch (error) {
      this.logger.error('Failed to initialize archive services', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Detect if file is an archive or special format requiring Python API
   */
  isArchiveOrSpecialFormat(filePath) {
    const ext = this.getFileExtension(filePath);
    return ARCHIVE_EXTENSIONS.includes(ext) || SPECIAL_FORMAT_EXTENSIONS.includes(ext);
  }
  
  /**
   * Get file extension for processing
   * Normalizes short-form extensions (.tgz, .tbz2) to long-form (.tar.gz, .tar.bz2)
   */
  getFileExtension(filePath) {
    const name = filePath.toLowerCase();
    // Handle compound extensions and short-form aliases
    if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return '.tar.gz';
    if (name.endsWith('.tar.bz2') || name.endsWith('.tbz2')) return '.tar.bz2';
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Get MIME content type for file upload to S3
   */
  getContentType(fileType) {
    const mimeTypes = {
      'csv': 'text/csv',
      'json': 'application/json',
      'xml': 'application/xml',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel',
      'parquet': 'application/octet-stream',
      'avro': 'application/avro',
      'dat': 'application/octet-stream',
      'txt': 'text/plain',
      'zip': 'application/zip',
      '7z': 'application/x-7z-compressed',
      'tar': 'application/x-tar',
      'tar.gz': 'application/gzip',
      'tar.bz2': 'application/x-bzip2'
    };
    return mimeTypes[fileType] || 'application/octet-stream';
  }

  /**
   * Categorize error and determine failure reason code
   * @param {Error} error - Error object
   * @returns {Object} - {reasonCode, actionableMessage}
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    // Virus detection
    if (message.includes('virus') || message.includes('malware') || message.includes('infected')) {
      return {
        reasonCode: 'virus_detected',
        actionableMessage: 'File contains malware or virus. Upload was rejected for security reasons.'
      };
    }
    
    // Password missing
    if (message.includes('password') && (message.includes('required') || message.includes('protected') || message.includes('encrypted'))) {
      return {
        reasonCode: 'password_missing',
        actionableMessage: 'Archive is password-protected. Please provide the password to extract contents.'
      };
    }
    
    // ClamAV unavailable
    if (message.includes('clamav') || message.includes('virus scan') && message.includes('unavailable')) {
      return {
        reasonCode: 'clamav_unavailable',
        actionableMessage: 'Virus scanning service is temporarily unavailable. File upload rejected as a security precaution.'
      };
    }
    
    // Encoding issues
    if (message.includes('encoding') || message.includes('decode') || message.includes('utf') || message.includes('ascii')) {
      return {
        reasonCode: 'unsupported_encoding',
        actionableMessage: 'File contains unsupported character encoding. Try converting to UTF-8 before uploading.'
      };
    }
    
    // Archive extraction failed
    if (message.includes('extract') || message.includes('unzip') || message.includes('decompress') || message.includes('corrupt')) {
      return {
        reasonCode: 'extraction_failed',
        actionableMessage: 'Unable to extract archive contents. File may be corrupted or use an unsupported compression format.'
      };
    }
    
    // Schema validation failed
    if (message.includes('schema') && (message.includes('mismatch') || message.includes('validation') || message.includes('drift'))) {
      return {
        reasonCode: 'schema_validation_failed',
        actionableMessage: 'File structure does not match expected vendor agreement schema. Check column names and data types.'
      };
    }
    
    // Empty file - no data rows (general case from BatchRecordProcessor)
    if (message.includes('no data rows') || (message.includes('empty') && message.includes('headers'))) {
      return {
        reasonCode: 'empty_file',
        actionableMessage: 'File contains no data rows. It may be empty or contain only headers. Please upload a file with at least one data record.'
      };
    }
    
    // Vendor file validation failed - empty file
    if (message.includes('vendor file validation') && message.includes('empty')) {
      return {
        reasonCode: 'empty_file',
        actionableMessage: 'File is empty or contains no data. Please upload a file with at least one data record.'
      };
    }
    
    // Vendor file validation failed - header only
    if (message.includes('vendor file validation') && (message.includes('header row') || message.includes('no data records'))) {
      return {
        reasonCode: 'header_only_file',
        actionableMessage: 'File contains only a header row with no data records. Please upload a file with data content.'
      };
    }
    
    // Vendor file validation failed - header issues
    if (message.includes('vendor file validation') && message.includes('header issue')) {
      return {
        reasonCode: 'header_validation_failed',
        actionableMessage: 'File has header format issues (missing headers, multiple header rows, or header-data mismatch). Please verify the file structure.'
      };
    }
    
    // Generic vendor file validation failure
    if (message.includes('vendor file validation')) {
      return {
        reasonCode: 'vendor_validation_failed',
        actionableMessage: error.message.replace('Vendor file validation failed:\n', '')
      };
    }
    
    // Format conversion failed
    if (message.includes('conversion') || message.includes('transform') || message.includes('format')) {
      return {
        reasonCode: 'conversion_failed',
        actionableMessage: 'Unable to convert file to internal format. File may contain invalid data or unsupported features.'
      };
    }
    
    // Malformed file (catch-all for parsing/structure issues)
    if (message.includes('parse') || message.includes('invalid') || message.includes('malformed') || message.includes('corrupt')) {
      return {
        reasonCode: 'malformed_file',
        actionableMessage: 'File structure is invalid or corrupted. Verify file integrity and format before re-uploading.'
      };
    }
    
    // Default: conversion_failed with original error message
    return {
      reasonCode: 'conversion_failed',
      actionableMessage: `Processing failed: ${error.message}`
    };
  }

  /**
   * Update the processing step in the database
   */
  async updateProcessingStep(fileId, step) {
    try {
      await this.dbPool.query(
        'UPDATE files SET processing_step = $1 WHERE file_id = $2',
        [step, fileId]
      );
    } catch (error) {
      this.logger.error('Failed to update processing step', {
        fileId,
        step,
        error: error.message
      });
    }
  }

  /**
   * Start processing jobs from queue
   */
  async start() {
    this.logger.info('🚀 File processing worker started');

    // Subscribe to new jobs
    console.log('[FILE WORKER] Checking onJobWaiting availability:', !!this.queue.onJobWaiting);
    this.queue.onJobWaiting && this.queue.onJobWaiting('file-processing', async (jobId, job) => {
      try {
        console.log('[FILE WORKER] Job waiting callback triggered for:', jobId, 'fileId:', job.data?.fileId);
        await this.processJob(jobId, job);
      } catch (callbackError) {
        console.error('[FILE WORKER] ERROR in callback:', callbackError.message, callbackError.stack);
        // Try to mark file as failed in database
        if (job.data?.fileId) {
          try {
            await this.dbPool.query(
              'UPDATE files SET processing_step = $1, processing_error = $2, updated_at = NOW() WHERE file_id = $3',
              ['failed', `Callback error: ${callbackError.message}`, job.data.fileId]
            );
          } catch (dbErr) {
            console.error('[FILE WORKER] Failed to update file status:', dbErr.message);
          }
        }
      }
    });
    console.log('[FILE WORKER] onJobWaiting listener registered');

    // Log completion events
    this.queue.onJobCompleted('file-processing', (jobId, result) => {
      this.logger.info('File processing completed', { jobId, ...result });
    });

    // Log failure events
    this.queue.onJobFailed('file-processing', (jobId, error) => {
      this.logger.error('File processing failed', { jobId, error: error.message });
    });

    // Recover orphaned jobs after a short delay to allow queue setup
    setTimeout(() => this.recoverOrphanedJobs(), 2000);
  }

  /**
   * Recover orphaned jobs that are stuck in 'queued' state in the database
   * This can happen when the server restarts while jobs were in the in-memory queue
   */
  async recoverOrphanedJobs() {
    try {
      console.log('[ORPHAN RECOVERY] Starting orphan recovery check...');
      console.log('[ORPHAN RECOVERY] dbPool exists:', !!this.dbPool);
      this.logger.info('Checking for orphaned queued files...');
      
      if (!this.dbPool) {
        console.error('[ORPHAN RECOVERY] ERROR: dbPool is not available!');
        return;
      }
      
      // Write debug status to database for verification
      await this.dbPool.query(
        `INSERT INTO system_settings (setting_key, setting_value) 
         VALUES ('orphan_recovery_last_run', $1)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1`,
        [new Date().toISOString()]
      ).catch(e => console.log('[ORPHAN RECOVERY] Could not write debug status:', e.message));
      
      const result = await this.dbPool.query(`
        SELECT f.file_id, f.filename, f.file_size, f.file_type, f.project_id, f.sub_project_id, 
               f.vendor_agreement_id, f.is_vendor_file, f.metadata
        FROM files f
        WHERE f.processing_step = 'queued'
          AND f.created_at < NOW() - INTERVAL '5 minutes'
          AND f.created_at > NOW() - INTERVAL '24 hours'
        ORDER BY f.created_at ASC
        LIMIT 20
      `);

      console.log(`[ORPHAN RECOVERY] Query returned ${result.rows.length} orphaned files`);
      
      if (result.rows.length === 0) {
        this.logger.info('No orphaned queued files found');
        return;
      }

      console.log('[ORPHAN RECOVERY] Found orphaned files:', result.rows.map(r => r.file_id));
      this.logger.info(`Found ${result.rows.length} orphaned queued files, re-queueing...`);

      for (const file of result.rows) {
        try {
          const fs = require('fs');
          const path = require('path');
          
          let filePath = file.metadata?.file_path;
          
          if (!filePath || !fs.existsSync(filePath)) {
            const uploadsDir = 'uploads';
            const files = fs.readdirSync(uploadsDir);
            const filenamePattern = file.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matchingFile = files.find(f => f.endsWith(`-${file.filename}`) || f === file.filename);
            
            if (matchingFile) {
              filePath = path.join(uploadsDir, matchingFile);
              this.logger.info('Found matching file on disk', { 
                fileId: file.file_id, 
                filename: file.filename,
                foundPath: filePath 
              });
            }
          }
          
          if (!filePath || !fs.existsSync(filePath)) {
            this.logger.warn('Orphaned file not found on disk, marking as failed', { 
              fileId: file.file_id, 
              filename: file.filename
            });
            await this.dbPool.query(
              `UPDATE files SET processing_step = 'failed', processing_error = $1 WHERE file_id = $2`,
              ['File not found on disk after server restart', file.file_id]
            );
            continue;
          }

          const jobData = {
            fileId: file.file_id,
            filePath,
            originalName: file.filename,
            fileSize: file.file_size,
            fileType: file.file_type,
            projectId: file.project_id,
            subProjectId: file.sub_project_id,
            agreementId: file.vendor_agreement_id,
            isVendorFile: file.is_vendor_file,
            delimiter: file.metadata?.delimiter,
            headerConfig: file.metadata?.headerConfig,
            fixedWidthSchema: file.metadata?.fixedWidthSchema,
            archivePassword: file.metadata?.archivePassword
          };

          const jobId = await this.queue.addJob('file-processing', jobData);
          this.logger.info('Re-queued orphaned file', { 
            fileId: file.file_id, 
            filename: file.filename,
            newJobId: jobId 
          });

        } catch (requeueError) {
          this.logger.error('Failed to re-queue orphaned file', {
            fileId: file.file_id,
            error: requeueError.message
          });
        }
      }
    } catch (error) {
      console.error('[ORPHAN RECOVERY] ERROR:', error.message, error.stack);
      this.logger.error('Failed to recover orphaned jobs', { error: error.message });
    }
  }

  /**
   * Extract file extension from filename
   */
  getExtensionFromFilename(filename) {
    if (!filename) return '';
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  /**
   * Process a single file upload job
   */
  async processJob(jobId, job) {
    const { fileId, filePath, originalName, fileSize, fileType, userId, fileHash, projectId, subProjectId, qualityRuleIds, agreementId, isVendorFile, headerConfig, fixedWidthSchema } = job.data;
    // Extract archivePassword and delimiter separately with let since we may need to reassign them
    let archivePassword = job.data.archivePassword;
    let delimiter = job.data.delimiter;
    const startTime = Date.now();
    
    // Get retry information from job options (BullMQ)
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts || 3;
    const isLastAttempt = attemptsMade >= maxAttempts - 1;

    this.logger.info('Processing file job', {
      jobId,
      fileId,
      fileName: originalName,
      fileSize
    });

    // DEBUG: Log received agreementId value
    this.logger.info('Worker received job data', {
      fileId,
      agreementId,
      projectId,
      subProjectId,
      qualityRuleIds,
      hasAgreementId: !!agreementId
    });

    // Audit log: File processing started
    if (this.auditService) {
      await this.auditService.logExecutionStateChange({
        executionId: jobId,
        executionType: 'file_processing',
        entityId: fileId,
        entityName: originalName,
        previousStatus: 'queued',
        newStatus: 'processing',
        triggeredByUser: userId,
        triggerType: 'upload',
        metadata: {
          fileSize,
          fileType,
          fileHash
        },
        context: null
      });
    }

    try {
      // Mark job as active
      await this.queue.activateJob(jobId);
      
      // Update progress: Starting
      await this.queue.updateProgress(jobId, 10);

      // Step 0.1: Virus scan the uploaded file (security check)
      const virusScanService = require('../services/VirusScanService');
      try {
        this.logger.info('Starting virus scan for uploaded file', { fileId, filePath });
        const scanResult = await virusScanService.scanFile(filePath);
        
        if (scanResult.isInfected) {
          this.logger.error('Virus detected in uploaded file', {
            fileId,
            filename: originalName,
            viruses: scanResult.viruses
          });
          throw new Error(`Virus detected: ${scanResult.viruses?.join(', ') || 'Unknown threat'}`);
        }
        
        this.logger.info('Virus scan passed', {
          fileId,
          filename: originalName,
          skipped: scanResult.skipped || false,
          message: scanResult.skipped ? 'Scan skipped - virus definitions unavailable' : 'No threats detected'
        });
        
        // Store virus scan status in file metadata
        const virusScanStatus = scanResult.skipped ? 'skipped' : 'completed';
        await this.dbPool.query(
          `UPDATE files SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE file_id = $2`,
          [JSON.stringify({ virus_scan_status: virusScanStatus, virus_scan_message: scanResult.skipped ? 'Scan skipped - ClamAV unavailable' : 'No threats detected' }), fileId]
        );
      } catch (scanError) {
        if (scanError.message.includes('Virus detected')) {
          throw scanError; // Re-throw virus detection errors
        }
        // Log scan errors but continue processing (graceful degradation)
        this.logger.warn('Virus scan failed, continuing with processing', {
          fileId,
          error: scanError.message
        });
        
        // Store virus scan failure status
        await this.dbPool.query(
          `UPDATE files SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE file_id = $2`,
          [JSON.stringify({ virus_scan_status: 'skipped', virus_scan_message: 'Scan skipped - ' + scanError.message }), fileId]
        );
      }
      
      await this.queue.updateProgress(jobId, 15);

      // Step 0.2: Upload file to S3 drop location if configured
      const { dropLocationConnectionId, dropLocationBucket, dropLocationPrefix } = job.data;
      let s3UploadedPath = null;
      
      if (dropLocationConnectionId && dropLocationBucket) {
        try {
          this.logger.info('Uploading file to S3 drop location', {
            fileId,
            connectionId: dropLocationConnectionId,
            bucket: dropLocationBucket,
            prefix: dropLocationPrefix
          });
          
          const connectionService = require('../services/ConnectionService');
          const connection = await connectionService.getConnectionById(dropLocationConnectionId);
          
          if (connection && connection.config) {
            // Build S3 key with prefix
            const s3Key = dropLocationPrefix 
              ? `${dropLocationPrefix.replace(/\/$/, '')}/${originalName}`
              : originalName;
            
            // Use ConnectionService to create S3 client (supports IAM role authentication)
            const s3 = await connectionService.createS3Client(connection);
            
            const fileContent = require('fs').readFileSync(filePath);
            await s3.putObject({
              Bucket: dropLocationBucket,
              Key: s3Key,
              Body: fileContent,
              ContentType: this.getContentType(fileType)
            }).promise();
            
            s3UploadedPath = `s3://${dropLocationBucket}/${s3Key}`;
            
            this.logger.info('File uploaded to S3 successfully', {
              fileId,
              s3Path: s3UploadedPath
            });
            
            // Update file record with S3 location
            await this.dbPool.query(
              `UPDATE files SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE file_id = $2`,
              [JSON.stringify({ s3_location: s3UploadedPath, s3_bucket: dropLocationBucket, s3_key: s3Key }), fileId]
            );
          }
        } catch (s3Error) {
          this.logger.error('Failed to upload file to S3', {
            fileId,
            error: s3Error.message
          });
          // Continue processing even if S3 upload fails - file is still available locally
        }
      }
      
      await this.queue.updateProgress(jobId, 20);

      // Step 0.5: Check if file is an archive and retrieve password if needed
      // archivePassword may come from job.data (ad-hoc upload) or password vault (vendor agreement)
      const fileExtension = this.getFileExtension(filePath);
      const isArchive = ARCHIVE_EXTENSIONS.includes(fileExtension);
      
      // Step 0.6: If delimiter not provided in job.data, retrieve from file metadata
      if (!delimiter) {
        try {
          const metadataResult = await this.dbPool.query('SELECT metadata FROM files WHERE file_id = $1', [fileId]);
          if (metadataResult.rows.length > 0 && metadataResult.rows[0].metadata) {
            const metadata = typeof metadataResult.rows[0].metadata === 'string'
              ? JSON.parse(metadataResult.rows[0].metadata)
              : metadataResult.rows[0].metadata;
            
            if (metadata.delimiter) {
              delimiter = metadata.delimiter;
              this.logger.info('Delimiter found in file metadata', { fileId, delimiter });
            }
          }
        } catch (metadataError) {
          this.logger.warn('Could not retrieve file metadata for delimiter', { 
            fileId, 
            error: metadataError.message 
          });
          // Continue without delimiter - will use auto-detection
        }
      } else {
        this.logger.info('Delimiter provided in job data', { fileId, delimiter });
      }
      
      if (isArchive) {
        this.logger.info('Archive file detected, checking for password', { fileId, fileExtension, agreementId });
        
        // Three password flows: 
        // 1. ad-hoc (from job.data)
        // 2. vendor agreement file schema (from vault with entityType='vendor_agreement_file_schema')
        // 3. file-specific (from vault with entityType='file')
        if (!archivePassword) {
          // No password in job.data, try retrieving from vault
          try {
            // First, try to get password from vendor agreement file schema (if agreementId is available)
            if (agreementId) {
              // Find the file schema that matches the filename pattern for this agreement
              const schemaResult = await this.dbPool.query(
                `SELECT id, file_name_pattern 
                 FROM vendor_agreement_file_schemas 
                 WHERE vendor_agreement_id = $1 AND is_active = true
                 ORDER BY priority ASC`,
                [agreementId]
              );
              
              // Find a schema that matches the uploaded filename
              let matchedSchemaId = null;
              for (const schema of schemaResult.rows) {
                const pattern = schema.file_name_pattern;
                // Convert glob pattern to regex (simple conversion for common patterns)
                const regexPattern = pattern
                  .replace(/\./g, '\\.')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.');
                const regex = new RegExp(`^${regexPattern}$`, 'i');
                if (regex.test(originalName)) {
                  matchedSchemaId = schema.id;
                  this.logger.info('Matched file schema for password lookup', { 
                    fileId, 
                    agreementId,
                    schemaId: matchedSchemaId,
                    pattern: schema.file_name_pattern,
                    filename: originalName
                  });
                  break;
                }
              }
              
              // Retrieve password using the matched schema ID
              if (matchedSchemaId) {
                archivePassword = await this.passwordVaultService.retrievePassword(
                  'vendor_agreement_file_schema', 
                  matchedSchemaId.toString(), 
                  userId
                );
                if (archivePassword) {
                  this.logger.info('Archive password retrieved from vendor agreement file schema vault', { 
                    fileId, 
                    agreementId,
                    schemaId: matchedSchemaId
                  });
                }
              } else {
                this.logger.info('No matching file schema found for password lookup', { 
                  fileId, 
                  agreementId,
                  filename: originalName
                });
              }
            }
            
            // If no vendor agreement password, try file-specific password
            if (!archivePassword) {
              archivePassword = await this.passwordVaultService.retrievePassword('file', fileId, userId);
              if (archivePassword) {
                this.logger.info('Archive password retrieved from file vault', { fileId });
              } else {
                this.logger.info('No password found for archive (processing without password)', { fileId, agreementId });
              }
            }
          } catch (passwordError) {
            this.logger.warn('Failed to retrieve archive password from vault', { 
              fileId, 
              agreementId,
              error: passwordError.message 
            });
            // Continue without password - file might not be encrypted
          }
        } else {
          // Password provided in job.data (ad-hoc upload flow)
          this.logger.info('Using ad-hoc archive password from upload request', { fileId, passwordLength: archivePassword.length });
        }

        // Step 0.7: Extract archive contents
        this.logger.info('Attempting to extract archive', { fileId, filePath });
        try {
          const extractionResult = await this.archiveExtractionService.extractArchive(
            filePath,
            fileId,
            archivePassword,
            userId
          );

          this.logger.info('Archive extraction completed successfully', {
            fileId,
            extractedCount: extractionResult.extractedCount,
            files: extractionResult.files.map(f => f.filename)
          });

          // Find the primary data file (filter out macOS metadata files)
          const primaryDataFile = extractionResult.files.find(f => 
            f && f.fullPath && 
            !f.relativePath?.startsWith('__MACOSX') && 
            !f.fileName?.startsWith('._') &&
            !f.relativePath?.includes('/._')
          );

          if (primaryDataFile && primaryDataFile.fullPath) {
            this.logger.info('Profiling primary extracted file', {
              fileId,
              primaryFile: primaryDataFile.fileName,
              fullPath: primaryDataFile.fullPath
            });

            try {
              // Profile the extracted data file using Flask API
              const profileResult = await this.callFlaskProfileAPI(
                primaryDataFile.fullPath,
                primaryDataFile.fileName,
                fileId,
                null, // no password for extracted file
                delimiter,
                headerConfig,
                fixedWidthSchema
              );

              // Update the parent archive file with profiling metrics from the extracted file
              if (profileResult) {
                await this.dbPool.query(
                  `UPDATE files SET 
                    row_count = $1,
                    column_count = $2,
                    schema_definition = $3,
                    processing_step = 'complete',
                    updated_at = NOW()
                  WHERE file_id = $4`,
                  [
                    profileResult.rowCount || 0,
                    profileResult.columnCount || 0,
                    profileResult.schemaDefinition ? JSON.stringify(profileResult.schemaDefinition) : null,
                    fileId
                  ]
                );

                this.logger.info('Archive profiling metrics updated from extracted file', {
                  fileId,
                  rowCount: profileResult.rowCount,
                  columnCount: profileResult.columnCount
                });
              }
            } catch (profileError) {
              this.logger.error('Failed to profile extracted file, archive will show no profile data', {
                fileId,
                primaryFile: primaryDataFile.fileName,
                error: profileError.message
              });
              // Still mark as complete - extraction succeeded even if profiling failed
              await this.dbPool.query(
                'UPDATE files SET processing_step = $1, updated_at = NOW() WHERE file_id = $2',
                ['complete', fileId]
              );
            }
          } else {
            this.logger.warn('No primary data file found in archive to profile', {
              fileId,
              extractedFiles: extractionResult.files.map(f => f?.relativePath)
            });
            // Update file processing_step to 'complete' for archive files
            await this.dbPool.query(
              'UPDATE files SET processing_step = $1, updated_at = NOW() WHERE file_id = $2',
              ['complete', fileId]
            );
          }

          // Cleanup temp directory after profiling
          if (extractionResult.tempDir) {
            try {
              const fs = require('fs');
              await fs.promises.rm(extractionResult.tempDir, { recursive: true, force: true });
              this.logger.info('Cleaned up archive extraction temp directory', {
                fileId,
                tempDir: extractionResult.tempDir
              });
            } catch (cleanupError) {
              this.logger.warn('Failed to cleanup temp directory', {
                fileId,
                tempDir: extractionResult.tempDir,
                error: cleanupError.message
              });
            }
          }

          // Complete the job - extracted files will be queued separately
          await this.queue.completeJob(jobId, {
            success: true,
            fileId,
            extractedCount: extractionResult.extractedCount,
            files: extractionResult.files,
            message: 'Archive extracted successfully'
          });

          // Audit log: Archive extraction completed
          if (this.auditService) {
            await this.auditService.logExecutionStateChange({
              executionId: jobId,
              executionType: 'archive_extraction',
              entityId: fileId,
              entityName: originalName,
              previousStatus: 'processing',
              newStatus: 'completed',
              triggeredByUser: userId,
              triggerType: 'extraction',
              metadata: {
                extractedCount: extractionResult.extractedCount,
                extractedFiles: extractionResult.files.map(f => f.filename)
              },
              context: null
            });
          }

          return;
        } catch (extractionError) {
          this.logger.error('Archive extraction failed', {
            fileId,
            error: extractionError.message,
            stack: extractionError.stack
          });

          // Categorize error and create DLQ job if appropriate
          const errorCategory = this.categorizeError(extractionError);

          if (errorCategory.reasonCode === 'password_missing' || 
              extractionError.message.toLowerCase().includes('password') ||
              extractionError.message.toLowerCase().includes('encrypted')) {
            // Create DLQ job for password-related failures
            await this.dlqService.createDLQJob(
              'archive_extraction',
              {
                archiveFilePath: filePath,
                archiveFileId: fileId,
                userId: userId
              },
              extractionError,
              'Provide the correct password for this password-protected archive'
            );

            this.logger.info('DLQ job created for password-protected archive', { fileId });

            // Update file status to indicate password required
            await this.dbPool.query(
              'UPDATE files SET processing_step = $1, metadata = jsonb_set(COALESCE(metadata, \'{}\'::jsonb), \'{password_required}\', \'true\') WHERE file_id = $2',
              ['password_required', fileId]
            );

            // Fail the job gracefully
            await this.queue.failJob(jobId, extractionError);

            // Audit log: Archive extraction failed - password required
            if (this.auditService) {
              await this.auditService.logExecutionStateChange({
                executionId: jobId,
                executionType: 'archive_extraction',
                entityId: fileId,
                entityName: originalName,
                previousStatus: 'processing',
                newStatus: 'failed_password_required',
                triggeredByUser: userId,
                triggerType: 'extraction',
                metadata: {
                  errorCode: errorCategory.reasonCode,
                  errorMessage: extractionError.message
                },
                context: null
              });
            }

            return;
          } else {
            // Other extraction failures - create DLQ job but don't return early
            await this.dlqService.createDLQJob(
              'archive_extraction',
              {
                archiveFilePath: filePath,
                archiveFileId: fileId,
                userId: userId,
                password: archivePassword || null
              },
              extractionError,
              errorCategory.actionableMessage
            );

            this.logger.warn('DLQ job created for failed archive extraction, continuing with container profiling', { fileId });
            
            // Continue to profile the archive container as a fallback
          }
        }
      }

      // Step 1: Process file using Python streaming processors or Flask API
      await this.updateProcessingStep(fileId, 'analyzing');
      this.logger.info('Calling Python processor for file analysis', { fileId });
      await this.queue.updateProgress(jobId, 30);

      let fileInfo;
      
      // Determine if we need to use Flask API
      // Flask API is used for: archives, special formats, or when custom delimiter/headerConfig is provided
      const needsFlaskAPI = this.isArchiveOrSpecialFormat(filePath) || !!delimiter || !!headerConfig || !!fixedWidthSchema;
      
      if (needsFlaskAPI) {
        this.logger.info('Using Flask profile API', { 
          fileId, 
          fileExtension,
          hasPassword: !!archivePassword,
          hasDelimiter: !!delimiter,
          hasHeaderConfig: !!headerConfig,
          hasFixedWidthSchema: !!fixedWidthSchema,
          reason: this.isArchiveOrSpecialFormat(filePath) ? 'archive_or_special' : 'custom_config'
        });
        fileInfo = await this.callFlaskProfileAPI(filePath, originalName, fileId, archivePassword, delimiter, headerConfig, fixedWidthSchema);
      } else {
        // Use legacy process_file.py for standard formats without custom config
        fileInfo = await this.callPythonProcessor(filePath, fileType);
      }

      this.logger.info('Python processing completed', {
        fileId,
        rowCount: fileInfo.row_count,
        columnCount: fileInfo.column_count
      });

      await this.queue.updateProgress(jobId, 50);

      // Skip legacy profiling/validation when Flask API was used (it handles everything)
      let profilingData = { columns: [] };
      let headerValidation = { success: true, status: 'healthy', health_score: 100, issues: [] };
      let duplicateStats = { total_rows: 0, unique_rows: 0, duplicate_count: 0, duplicate_percentage: 0.0 };
      
      if (!needsFlaskAPI) {
        // Legacy processing path for CSV/JSON/XLSX/Parquet/XML
        
        // Step 2: Generate detailed column profiling (min/max, frequency values)
        await this.updateProcessingStep(fileId, 'profiling');
        this.logger.info('Generating column profiling statistics', { fileId });
        profilingData = await this.callProfilingScript(filePath, fileType);
        
        // Merge profiling data with schema (preserve original column type)
        if (fileInfo.schema && profilingData.columns) {
          fileInfo.schema = fileInfo.schema.map(col => {
            const profiling = profilingData.columns.find(p => p.name === col.name);
            if (profiling) {
              // Preserve original type, merge other profiling fields
              const { type, ...profilingData } = profiling;
              return { ...col, ...profilingData };
            }
            return col;
          });
        }

        await this.queue.updateProgress(jobId, 65);

        // Step 2.5: Validate file headers for common issues
        await this.updateProcessingStep(fileId, 'header_validation');
        this.logger.info('Validating file headers', { fileId });
        headerValidation = await this.callHeaderValidator(filePath, fileType);
        
        this.logger.info('Header validation completed', {
          fileId,
          status: headerValidation.status,
          issuesFound: headerValidation.issues_found || 0
        });

        await this.queue.updateProgress(jobId, 70);

        // Step 2.6: Vendor file validation - fail upload on critical data quality issues
        if (isVendorFile) {
          const validationErrors = [];
          
          // Check for empty file (0 rows including header)
          if (!fileInfo.row_count && fileInfo.row_count !== 0) {
            validationErrors.push('File could not be parsed - unable to determine row count');
          } else if (fileInfo.row_count === 0 && (!fileInfo.schema || fileInfo.schema.length === 0)) {
            validationErrors.push('File is completely empty (no header or data rows)');
          } else if (fileInfo.row_count === 0 && fileInfo.schema && fileInfo.schema.length > 0) {
            validationErrors.push('File contains only a header row with no data records');
          }
          
          // Check for critical header issues (only for non-fixed-width files)
          if (!fixedWidthSchema && headerValidation.issues && headerValidation.issues.length > 0) {
            const criticalIssues = headerValidation.issues.filter(issue => 
              issue.severity === 'critical' || 
              issue.type === 'multiple_headers' ||
              issue.type === 'missing_headers' ||
              issue.type === 'header_data_mismatch'
            );
            
            if (criticalIssues.length > 0) {
              criticalIssues.forEach(issue => {
                validationErrors.push(`Header issue: ${issue.description || issue.type}`);
              });
            }
          }
          
          // If validation errors exist, fail the vendor file upload
          if (validationErrors.length > 0) {
            const errorMessage = `Vendor file validation failed:\n- ${validationErrors.join('\n- ')}`;
            this.logger.error('Vendor file validation failed', {
              fileId,
              agreementId,
              validationErrors,
              rowCount: fileInfo.row_count,
              columnCount: fileInfo.schema?.length || 0
            });
            throw new Error(errorMessage);
          }
          
          this.logger.info('Vendor file validation passed', { 
            fileId, 
            agreementId,
            rowCount: fileInfo.row_count,
            columnCount: fileInfo.schema?.length || 0
          });
        }

        // Step 3: Detect duplicate rows
        await this.updateProcessingStep(fileId, 'duplicates');
        this.logger.info('Detecting duplicate rows', { fileId });
        duplicateStats = await this.detectDuplicates(filePath, fileType);
        
        this.logger.info('Duplicate detection completed', {
          fileId,
          duplicateCount: duplicateStats.duplicate_count,
          duplicatePercentage: duplicateStats.duplicate_percentage
        });
      } else {
        // Archives/special formats - skip legacy processors
        this.logger.info('Skipping legacy profiling/validation for archive/special format', { 
          fileId, 
          fileExtension 
        });
      }

      await this.queue.updateProgress(jobId, 75);

      // Step 4: Save metadata to database (including duplicates, hash, and header validation)
      await this.saveFileMetadata(fileId, originalName, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats, headerValidation, projectId, subProjectId, agreementId, delimiter, headerConfig, fixedWidthSchema);
      
      // Step 4.2: Track file processing artifacts and archive members (for archives/special formats)
      if (fileInfo.format_specific) {
        try {
          // Track archive members if present
          if (fileInfo.format_specific.archive_members) {
            await this.trackArchiveMembers(fileId, fileInfo.format_specific.archive_members);
            this.logger.info('Archive members tracked', { 
              fileId, 
              memberCount: fileInfo.format_specific.archive_members.length 
            });
          }
          
          // Track processing artifacts (CSV/Parquet outputs from archives)
          if (fileInfo.format_specific.profiled_member) {
            await this.trackProcessingArtifact(
              fileId, 
              fileInfo.format_specific.profiled_member,
              'primary_extraction'
            );
            this.logger.info('Processing artifact tracked', { 
              fileId, 
              artifact: fileInfo.format_specific.profiled_member 
            });
          }
        } catch (trackingError) {
          this.logger.warn('Failed to track artifacts/members', { 
            fileId, 
            error: trackingError.message 
          });
          // Don't fail the job - tracking is supplementary
        }
      }
      
      // Invalidate file cache after metadata update
      await invalidateFileCache(fileId);
      await invalidateFileCatalogCache();
      
      // Step 4.1: Save file-quality-rule associations if provided
      if (qualityRuleIds && Array.isArray(qualityRuleIds) && qualityRuleIds.length > 0) {
        this.logger.info('Saving file-quality-rule associations', { fileId, ruleCount: qualityRuleIds.length });
        for (const ruleId of qualityRuleIds) {
          try {
            await this.dbPool.query(
              'INSERT INTO file_quality_rules (file_id, quality_rule_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [fileId, ruleId]
            );
          } catch (err) {
            this.logger.warn('Failed to insert file quality rule association', { 
              file_id: fileId, 
              quality_rule_id: ruleId, 
              error: err.message 
            });
          }
        }
        this.logger.info('File-quality-rule associations saved', { fileId, ruleCount: qualityRuleIds.length });
      }
      
      // Step 4.5: Create file ownership record with creator and owner from uploader
      await this.createFileOwnership(fileId, userId, originalName);
      
      await this.queue.updateProgress(jobId, 85);

      // Step 5: Save column information with profiling data
      if (fileInfo.schema && fileInfo.schema.length > 0) {
        await this.saveColumnInfo(fileId, fileInfo.schema);
      }

      // Step 5.5: Save preview data to database (100 rows)
      if (fileInfo.preview_data && fileInfo.preview_data.length > 0) {
        await this.savePreviewData(fileId, fileInfo.preview_data);
      }
      
      // Step 5.7: Apply vendor agreement governance metadata if contract validation mode
      if (agreementId && fileInfo.schema && fileInfo.schema.length > 0) {
        try {
          await this.applyAgreementGovernance(fileId, agreementId, fileInfo.schema, originalName, projectId);
        } catch (govError) {
          this.logger.warn('Failed to apply vendor agreement governance', { 
            fileId, 
            agreementId, 
            error: govError.message 
          });
          // Don't fail the job - governance is supplementary
        }
      }

      // Step 5.8: Apply vendor file governance metadata (ISOLATED from contract validation)
      // This block ONLY runs for vendor file uploads (isVendorFile flag set during upload)
      // Does NOT affect: contract validation files, mapping jobs, or normal file uploads
      if (isVendorFile && fileInfo.schema && fileInfo.schema.length > 0 && !agreementId) {
        try {
          await this.applyVendorFileGovernance(fileId, originalName, fileInfo.schema, projectId);
        } catch (govError) {
          this.logger.warn('Failed to apply vendor file governance', { 
            fileId, 
            error: govError.message 
          });
          // Don't fail the job - governance is supplementary
        }
      }

      await this.queue.updateProgress(jobId, 90);

      // Step 6: Capture file audit details and schema
      await this.updateProcessingStep(fileId, 'schema');
      const correlationId = uuidv4();
      
      // Capture file schema with versioning
      const schemaResult = await captureFileSchema(this.dbPool, {
        fileId,
        fileName: originalName,
        fileSchema: {
          columns: fileInfo.schema || [],
          encoding: fileInfo.encoding,
          delimiter: fileInfo.delimiter
        },
        correlationId,
        createdBy: userId
      });

      this.logger.info('File schema captured', {
        fileId,
        schemaId: schemaResult.schemaId,
        isNew: schemaResult.isNew,
        hasChanges: schemaResult.hasChanges
      });

      // Capture comprehensive file audit
      await captureFileAudit(this.dbPool, {
        fileId,
        fileName: originalName,
        fileSchemaId: schemaResult.schemaId,
        fileHash,
        filePattern: null,
        fileType,
        fileDelimiter: fileInfo.delimiter,
        encoding: fileInfo.encoding,
        numberOfColumns: fileInfo.column_count,
        fileSizeBytes: fileSize,
        source: 'upload',
        sourcePath: originalName,
        noOfRecordsInSource: fileInfo.row_count,
        loadStep1: 'file_processing',
        loadStep1Path: filePath,
        loadStep1RecCnt: fileInfo.row_count,
        loadType: 'manual_upload',
        correlationId,
        userId,
        processingDurationMs: Date.now() - startTime,
        status: 'success',
        createdBy: userId
      });

      this.logger.info('File audit captured', {
        fileId,
        correlationId
      });

      // Save schema snapshot for schema history tracking with logical file grouping
      try {
        const schemaDefinition = {
          columns: (fileInfo.schema || []).map((col, index) => ({
            name: col.name,
            type: col.type || col.data_type || 'string',
            nullable: col.nullable !== false,
            index: index
          }))
        };
        const snapshotResult = await saveSchemaSnapshot(this.dbPool, fileId, originalName, schemaDefinition, null, fileInfo.row_count, projectId);
        this.logger.info('Schema snapshot saved for history tracking', {
          fileId,
          columnCount: schemaDefinition.columns.length,
          logicalFileId: snapshotResult.logical_file_id,
          hasSchemaChange: snapshotResult.has_schema_change
        });
      } catch (schemaSnapshotError) {
        this.logger.error('Error saving schema snapshot', {
          fileId,
          error: schemaSnapshotError.message
        });
        // Don't fail the whole processing if schema snapshot fails
      }

      // Step 7: Run quality validation if quality rules are associated
      if (qualityRuleIds && qualityRuleIds.length > 0) {
        try {
          await this.updateProcessingStep(fileId, 'quality_validation');
          await this.queue.updateProgress(jobId, 92);
          
          this.logger.info('Running quality validation', { 
            fileId, 
            ruleCount: qualityRuleIds.length 
          });
          
          // Fetch quality rules from database
          const rulesResult = await this.dbPool.query(
            'SELECT * FROM quality_rules WHERE id = ANY($1) AND enabled = true',
            [qualityRuleIds]
          );
          
          if (rulesResult.rows.length > 0) {
            // Use preview data for validation (up to 100 rows)
            const dataToValidate = fileInfo.preview_data || [];
            
            if (dataToValidate.length > 0) {
              // Initialize quality validation engine
              const validationEngine = new QualityValidationEngine(this.dbPool);
              
              // Run validation
              const validationResult = await validationEngine.validateData(
                rulesResult.rows,
                dataToValidate,
                {
                  file_id: fileId,
                  file_name: originalName,
                  upload_date: new Date()
                }
              );
              
              this.logger.info('Quality validation completed', {
                fileId,
                violations: validationResult.violations.length,
                errors: validationResult.errors.length,
                summary: validationResult.summary
              });
              
              // Persist violations to database
              if (validationResult.violations.length > 0) {
                await validationEngine.persistViolations(
                  validationResult.violations,
                  dataToValidate,
                  'file_upload'
                );
                this.logger.info('Quality rule violations persisted', {
                  fileId,
                  violationCount: validationResult.violations.length
                });
              }
              
              // Persist errors to database
              if (validationResult.errors.length > 0) {
                const errors = validationResult.errors.map(err => ({
                  error_type: 'data_quality',
                  severity: 'error',
                  error_message: err.error_message,
                  error_details: { rule_id: err.rule_id, rule_name: err.rule_name }
                }));
                await validationEngine.persistErrors(errors, 'file', fileId);
                this.logger.info('Quality validation errors persisted', {
                  fileId,
                  errorCount: errors.length
                });
              }
            } else {
              this.logger.warn('No data available for quality validation', { fileId });
            }
          } else {
            this.logger.info('No enabled quality rules found for validation', { fileId });
          }
        } catch (validationError) {
          // If quality check abort is triggered, fail the file processing
          if (validationError.code === 'QUALITY_ABORT') {
            this.logger.error('File processing aborted due to quality violations', {
              fileId,
              violations: validationError.violations
            });
            await this.updateProcessingStep(fileId, 'failed');
            throw validationError;
          }
          
          this.logger.error('Quality validation failed', {
            fileId,
            error: validationError.message,
            stack: validationError.stack
          });
          // Don't fail the whole processing if quality validation fails (but not for QUALITY_ABORT)
        }
      }

      await this.queue.updateProgress(jobId, 100);

      // Mark processing as complete
      await this.updateProcessingStep(fileId, 'complete');
      
      // Invalidate file cache after processing completes
      await invalidateFileCache(fileId);
      await invalidateFileCatalogCache();

      const processingDuration = Date.now() - startTime;

      // Complete job
      await this.queue.completeJob(jobId, {
        success: true,
        fileId,
        rowCount: fileInfo.row_count,
        columnCount: fileInfo.column_count,
        processingTime: fileInfo.processing_time_seconds
      });

      // Audit log: File processing completed
      if (this.auditService) {
        await this.auditService.logExecutionStateChange({
          executionId: jobId,
          executionType: 'file_processing',
          entityId: fileId,
          entityName: originalName,
          previousStatus: 'processing',
          newStatus: 'completed',
          triggeredByUser: userId,
          triggerType: 'upload',
          executionDurationMs: processingDuration,
          rowsProcessed: fileInfo.row_count,
          metadata: {
            columnCount: fileInfo.column_count,
            duplicateCount: duplicateStats.duplicate_count,
            duplicatePercentage: duplicateStats.duplicate_percentage,
            fileHash
          },
          context: null
        });
      }

      // Cleanup: Delete uploaded file after successful processing
      await this.cleanupUploadedFile(filePath, 'success');

      // Trigger garbage collection after processing to free memory
      this.triggerGarbageCollection();

    } catch (error) {
      this.logger.error('Error processing file job', {
        jobId,
        fileId,
        error: error.message,
        stack: error.stack
      });

      const processingDuration = Date.now() - startTime;

      // Categorize error and get failure reason code
      const { reasonCode, actionableMessage } = this.categorizeError(error);

      // Save file metadata with error to database so user can see what failed
      try {
        await this.saveFailedFileMetadata(fileId, originalName, fileType, fileSize, actionableMessage, fileHash, projectId, agreementId, reasonCode);
        this.logger.info('Failed file metadata saved to database', { 
          fileId, 
          failureReason: reasonCode,
          errorMsg: actionableMessage 
        });
      } catch (saveError) {
        this.logger.error('Failed to save error metadata', {
          fileId,
          saveError: saveError.message
        });
      }

      // Audit log: File processing failed
      if (this.auditService) {
        await this.auditService.logExecutionStateChange({
          executionId: jobId,
          executionType: 'file_processing',
          entityId: fileId,
          entityName: originalName,
          previousStatus: 'processing',
          newStatus: 'failed',
          statusReason: actionableMessage,
          triggeredByUser: userId,
          triggerType: 'upload',
          executionDurationMs: processingDuration,
          metadata: {
            failureReasonCode: reasonCode,
            originalError: error.message,
            errorStack: error.stack
          },
          context: null
        });
      }

      // Mark processing as failed
      await this.updateProcessingStep(fileId, 'failed');

      // Only cleanup file on the last attempt to allow retries to access the file
      if (isLastAttempt) {
        this.logger.info('Last retry attempt exhausted, cleaning up file', { 
          fileId, 
          attemptsMade: attemptsMade + 1, 
          maxAttempts 
        });
        await this.cleanupUploadedFile(filePath, 'failure');
      } else {
        this.logger.info('Preserving file for retry attempt', { 
          fileId, 
          attemptsMade: attemptsMade + 1, 
          maxAttempts,
          retriesRemaining: maxAttempts - attemptsMade - 1
        });
      }

      await this.queue.failJob(jobId, error);
    }
  }

  /**
   * Call Python file processor using streaming
   */
  async callPythonProcessor(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, '../../utils/process_file.py');
      
      // Check if file exists
      if (!fs.existsSync(pythonScript)) {
        const errorMsg = `Python processor script not found at ${pythonScript}. This indicates a deployment issue.`;
        this.logger.error('Python processor not found - DEPLOYMENT ISSUE', { 
          pythonScript,
          expectedPath: pythonScript,
          workingDirectory: process.cwd()
        });
        return reject(new Error(errorMsg));
      }

      // Set PYTHONPATH to include workspace root for utils module
      const workspaceRoot = path.join(__dirname, '../..');
      const env = {
        ...process.env,
        PYTHONPATH: workspaceRoot
      };
      
      // Use virtual environment wrapper script to ensure dependencies are available
      const venvScript = path.join(__dirname, '../../run_python_with_venv.sh');
      const python = spawn(venvScript, [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
      
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        // Log stderr if present (warnings, debug info, etc.)
        if (stderr) {
          this.logger.warn('Python processor stderr output', {
            stderr: stderr.substring(0, 1000),
            filePath,
            fileType
          });
        }
        
        if (code !== 0) {
          this.logger.error('Python processor failed with non-zero exit code', {
            exitCode: code,
            stderr,
            stdout: stdout.substring(0, 500),
            filePath,
            fileType
          });
          reject(new Error(`Python processor failed with exit code ${code}. Error: ${stderr || 'No error output'}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            
            // Check if Python script returned an error in JSON format
            if (result.error) {
              this.logger.error('Python processor returned error in output', {
                error: result.error,
                errorType: result.error_type,
                filePath,
                fileType
              });
              reject(new Error(`Python processing error: ${result.error}`));
            } else {
              resolve(result);
            }
          } catch (error) {
            this.logger.error('Failed to parse Python JSON output', {
              stdout: stdout.substring(0, 1000),
              stderr: stderr.substring(0, 1000),
              stdoutLength: stdout.length,
              stderrLength: stderr.length,
              parseError: error.message,
              filePath,
              fileType
            });
            reject(new Error(`Failed to parse Python processor output: ${error.message}`));
          }
        }
      });

      python.on('error', (error) => {
        this.logger.error('Failed to spawn Python processor', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Call Flask profile API for archives and special formats
   * Supports password-protected archives, SAS, Avro, DAT files, and custom delimiters
   */
  async callFlaskProfileAPI(filePath, originalName, fileId, password = null, delimiter = null, headerConfig = null, fixedWidthSchema = null) {
    try {
      const profileAPIUrl = process.env.PROFILE_API_URL || 'http://localhost:8000';
      
      // Flask API expects local_file_path, not file_data
      const requestBody = {
        file_id: fileId,
        local_file_path: filePath,
        filename: originalName
      };
      
      // Add password if provided
      if (password) {
        requestBody.password = password;
      }
      
      // Add delimiter if provided (supports multi-character delimiters)
      if (delimiter) {
        requestBody.delimiter = delimiter;
      }
      
      // Add header configuration if provided (for files without headers)
      if (headerConfig) {
        requestBody.header_config = headerConfig;
      }
      
      // Add fixed-width schema if provided (for .dat files without delimiters)
      if (fixedWidthSchema) {
        requestBody.fixed_width_schema = fixedWidthSchema;
      }
      
      this.logger.info('Calling Flask profile API', { 
        url: `${profileAPIUrl}/api/vendor-profile`,
        filename: originalName,
        filePath: filePath,
        fileId: fileId,
        hasPassword: !!password
      });
      
      const response = await axios.post(
        `${profileAPIUrl}/api/vendor-profile`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 300000, // 5 minute timeout for large archives
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      
      // Transform Flask response to match process_file.py format
      const flaskResult = response.data;
      const metadata = flaskResult.metadata || {};
      const columnProfiles = flaskResult.column_profiles || [];
      
      // Build schema from column profiles if available, otherwise use basic column list
      let schema = [];
      if (columnProfiles.length > 0) {
        schema = columnProfiles.map(col => ({
          name: col.name,
          type: col.type || 'string',
          nullable: col.nullable !== undefined ? col.nullable : true,
          null_count: col.null_count || 0,
          unique_count: col.unique_count || 0,
          min_value: col.min,
          max_value: col.max,
          mean_value: col.mean,
          min_length: col.min_length,
          max_length: col.max_length,
          avg_length: col.avg_length,
          top_values: col.top_values || [],
          patterns: col.patterns || [],
          most_frequent_value: col.most_frequent_value,
          most_frequent_count: col.most_frequent_count,
          least_frequent_value: col.least_frequent_value,
          least_frequent_count: col.least_frequent_count
        }));
      } else if (metadata.columns && metadata.columns.length > 0) {
        schema = metadata.columns.map(colName => ({
          name: colName,
          type: 'string',
          nullable: true
        }));
      }
      
      return {
        row_count: metadata.row_count || 0,
        column_count: metadata.column_count || 0,
        schema: schema,
        processing_time_seconds: 0,
        size_bytes: metadata.file_size_mb ? Math.round(metadata.file_size_mb * 1024 * 1024) : 0,
        encoding: null,
        delimiter: null,
        preview_data: flaskResult.preview_data || [],
        format_specific: metadata.format_specific || {}, // SAS labels, Avro schema, archive manifest
        processing_error: flaskResult.processing_error || metadata.load_error || null // Pass through any load errors
      };
      
    } catch (error) {
      // Enhanced diagnostics for Flask API errors
      const fileExists = fs.existsSync(filePath);
      const fileStats = fileExists ? fs.statSync(filePath) : null;
      
      this.logger.error('Flask profile API call failed', {
        error: error.message,
        responseData: error.response?.data,
        responseStatus: error.response?.status,
        requestFilename: originalName,
        requestFilePath: filePath,
        fileExists: fileExists,
        fileSize: fileStats ? fileStats.size : null,
        fileModified: fileStats ? fileStats.mtime : null,
        stackTrace: error.stack
      });
      
      // Handle specific error cases with detailed messages
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Unknown error';
        
        if (errorMsg.includes('password')) {
          throw new Error('Archive requires password. Please provide a password and retry.');
        }
        
        if (errorMsg.includes('Virus detected')) {
          throw new Error('File failed virus scan. Cannot process infected archive.');
        }
        
        // Include Flask error details in the thrown error
        throw new Error(`Failed to profile file via Flask API: ${errorMsg}. File: ${originalName}, Exists: ${fileExists}`);
      }
      
      if (!fileExists) {
        throw new Error(`Failed to profile file via Flask API: File not found at ${filePath}. The file may have been deleted prematurely.`);
      }
      
      throw new Error(`Failed to profile file via Flask API: ${error.message}`);
    }
  }

  /**
   * Call Python profiling script to get detailed column statistics
   */
  async callProfilingScript(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, '../../utils/profile_columns.py');
      
      // Check if file exists
      if (!fs.existsSync(pythonScript)) {
        this.logger.warn('Profiling script not found, skipping profiling', { pythonScript });
        return resolve({ columns: [] });
      }

      // Set PYTHONPATH to include workspace root for utils module
      const workspaceRoot = path.join(__dirname, '../..');
      const env = {
        ...process.env,
        PYTHONPATH: workspaceRoot
      };
      
      // Use virtual environment wrapper script to ensure dependencies are available
      const venvScript = path.join(__dirname, '../../run_python_with_venv.sh');
      const python = spawn(venvScript, [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
      
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          this.logger.error('Profiling script error', {
            code,
            stderr,
            filePath
          });
          // Don't fail the whole job, just skip profiling
          resolve({ columns: [] });
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            this.logger.error('Failed to parse profiling output', {
              stdout,
              error: error.message
            });
            resolve({ columns: [] });
          }
        }
      });

      python.on('error', (error) => {
        this.logger.error('Failed to spawn profiling script', { error: error.message });
        resolve({ columns: [] });
      });
    });
  }

  /**
   * Call Python header validation script to detect header issues
   */
  async callHeaderValidator(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, '../../utils/header_validator.py');
      
      // Check if file exists
      if (!fs.existsSync(pythonScript)) {
        this.logger.warn('Header validator script not found, skipping validation', { pythonScript });
        return resolve({ success: true, status: 'healthy', health_score: 100, issues: [] });
      }

      // Set PYTHONPATH to include workspace root for utils module
      const workspaceRoot = path.join(__dirname, '../..');
      const env = {
        ...process.env,
        PYTHONPATH: workspaceRoot
      };
      
      // Use virtual environment wrapper script to ensure dependencies are available
      const venvScript = path.join(__dirname, '../../run_python_with_venv.sh');
      const python = spawn(venvScript, [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
      
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          this.logger.error('Header validation script error', {
            code,
            stderr,
            filePath
          });
          // Don't fail the whole job, just skip validation
          resolve({ success: true, status: 'healthy', health_score: 100, issues: [] });
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            this.logger.error('Failed to parse header validation output', {
              stdout,
              error: error.message
            });
            resolve({ success: true, status: 'healthy', health_score: 100, issues: [] });
          }
        }
      });

      python.on('error', (error) => {
        this.logger.error('Failed to spawn header validation script', { error: error.message });
        resolve({ success: true, status: 'healthy', health_score: 100, issues: [] });
      });
    });
  }

  /**
   * Detect duplicate rows using Python quality_checks module
   */
  async detectDuplicates(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const pythonCode = `
import sys
import json
sys.path.insert(0, '.')
from quality_checks import detect_duplicate_rows

result = detect_duplicate_rows('${filePath.replace(/'/g, "\\'")}', '${fileType}')
print(json.dumps(result))
`;
      
      // Use virtual environment wrapper script to ensure dependencies are available
      const venvScript = path.join(__dirname, '../../run_python_with_venv.sh');
      const python = spawn(venvScript, ['-c', pythonCode]); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with no user input in script
      
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          this.logger.error('Duplicate detection error', {
            code,
            stderr,
            filePath
          });
          // Don't fail the whole job, return zeros
          resolve({
            total_rows: 0,
            unique_rows: 0,
            duplicate_count: 0,
            duplicate_percentage: 0.0
          });
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            this.logger.error('Failed to parse duplicate detection output', {
              stdout,
              error: error.message
            });
            resolve({
              total_rows: 0,
              unique_rows: 0,
              duplicate_count: 0,
              duplicate_percentage: 0.0
            });
          }
        }
      });

      python.on('error', (error) => {
        this.logger.error('Failed to spawn duplicate detection', { error: error.message });
        resolve({
          total_rows: 0,
          unique_rows: 0,
          duplicate_count: 0,
          duplicate_percentage: 0.0
        });
      });
    });
  }

  /**
   * Calculate quality score based on multiple factors
   */
  calculateQualityScore(fileInfo, duplicateStats, headerValidation) {
    let qualityScore = 100;

    // Factor 1: Header validation health score (most important - up to -50 points)
    if (headerValidation && headerValidation.health_score !== undefined) {
      const headerPenalty = 100 - headerValidation.health_score;
      qualityScore -= (headerPenalty * 0.5); // Weight: 50%
    }

    // Factor 2: Duplicate records (up to -30 points)
    if (duplicateStats && duplicateStats.duplicate_percentage > 0) {
      const duplicatePenalty = Math.min(duplicateStats.duplicate_percentage, 100) * 0.3;
      qualityScore -= duplicatePenalty; // Weight: 30%
    }

    // Factor 3: Missing data in columns (up to -20 points)
    if (fileInfo && fileInfo.schema && fileInfo.schema.length > 0) {
      let totalNullPercentage = 0;
      let columnsWithData = 0;

      fileInfo.schema.forEach(col => {
        if (col.null_count !== undefined && fileInfo.row_count > 0) {
          const nullPercentage = (col.null_count / fileInfo.row_count) * 100;
          totalNullPercentage += nullPercentage;
          columnsWithData++;
        }
      });

      if (columnsWithData > 0) {
        const avgNullPercentage = totalNullPercentage / columnsWithData;
        const nullPenalty = Math.min(avgNullPercentage, 100) * 0.2;
        qualityScore -= nullPenalty; // Weight: 20%
      }
    }

    // Ensure score is between 0 and 100
    qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

    return qualityScore;
  }

  /**
   * Save file metadata to database
   */
  async saveFileMetadata(fileId, filename, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats, headerValidation, projectId, subProjectId = null, agreementId = null, userDelimiter = null, headerConfig = null, fixedWidthSchema = null) {
    // Fetch existing metadata to preserve original fields (connection_id, storage_location, provider, etc.)
    let existingMetadata = {};
    try {
      const existingFile = await this.dbPool.query('SELECT metadata FROM files WHERE file_id = $1', [fileId]);
      if (existingFile.rows.length > 0 && existingFile.rows[0].metadata) {
        existingMetadata = typeof existingFile.rows[0].metadata === 'string' 
          ? JSON.parse(existingFile.rows[0].metadata) 
          : existingFile.rows[0].metadata;
        
        this.logger.info('Fetched existing metadata for merge', { 
          fileId, 
          hasConnectionId: !!existingMetadata.connection_id,
          connectionId: existingMetadata.connection_id,
          existingKeys: Object.keys(existingMetadata)
        });
      }
    } catch (err) {
      this.logger.warn('Could not fetch existing metadata, will create new', { fileId, error: err.message });
    }

    // Merge existing metadata with new profiling data
    // Existing fields (connection_id, storage_location, provider, etc.) are preserved
    // New/updated fields (encoding, delimiter, preview_data, header_validation, header_config, fixed_width_schema) are added
    // User-provided delimiter takes precedence over auto-detected delimiter
    const metadata = {
      ...existingMetadata, // Preserve original metadata
      encoding: fileInfo.encoding || null,
      delimiter: userDelimiter || fileInfo.delimiter || null,
      preview_data: fileInfo.preview_data || [],
      header_validation: headerValidation || null,
      header_config: headerConfig || existingMetadata.header_config || null,
      fixed_width_schema: fixedWidthSchema || existingMetadata.fixed_width_schema || null
    };
    
    this.logger.info('Merged metadata result', { 
      fileId, 
      hasConnectionId: !!metadata.connection_id,
      connectionId: metadata.connection_id,
      mergedKeys: Object.keys(metadata)
    });

    // Calculate dynamic quality score based on multiple factors
    const qualityScore = this.calculateQualityScore(fileInfo, duplicateStats, headerValidation);

    this.logger.info('Calculated quality score', {
      fileId,
      qualityScore,
      headerHealthScore: headerValidation?.health_score,
      duplicatePercentage: duplicateStats?.duplicate_percentage
    });

    // Extract processing error if present (e.g., binary file that couldn't be parsed)
    const processingError = fileInfo.processing_error || null;

    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score, metadata, checksum,
        duplicate_records_count, duplicate_records_percentage, project_id, sub_project_id, vendor_agreement_id, processing_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        quality_score = EXCLUDED.quality_score,
        metadata = EXCLUDED.metadata,
        checksum = EXCLUDED.checksum,
        duplicate_records_count = EXCLUDED.duplicate_records_count,
        duplicate_records_percentage = EXCLUDED.duplicate_records_percentage,
        sub_project_id = EXCLUDED.sub_project_id,
        vendor_agreement_id = EXCLUDED.vendor_agreement_id,
        processing_error = EXCLUDED.processing_error,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      fileId,
      filename,
      fileType,
      fileSize,
      fileInfo.row_count || 0,
      fileInfo.column_count || 0,
      qualityScore,
      JSON.stringify(metadata),
      fileHash || null,
      duplicateStats?.duplicate_count || 0,
      duplicateStats?.duplicate_percentage || 0.0,
      projectId,
      subProjectId,
      agreementId || null,
      processingError
    ];

    const result = await this.dbPool.query(query, values);
    return result.rows[0];
  }

  /**
   * Save failed file metadata to database with error information
   */
  async saveFailedFileMetadata(fileId, filename, fileType, fileSize, errorMessage, fileHash, projectId, agreementId = null, failureReasonCode = null) {
    // Fetch existing metadata to preserve original fields (connection_id, storage_location, provider, etc.)
    let existingMetadata = {};
    try {
      const existingFile = await this.dbPool.query('SELECT metadata FROM files WHERE file_id = $1', [fileId]);
      if (existingFile.rows.length > 0 && existingFile.rows[0].metadata) {
        existingMetadata = typeof existingFile.rows[0].metadata === 'string' 
          ? JSON.parse(existingFile.rows[0].metadata) 
          : existingFile.rows[0].metadata;
      }
    } catch (err) {
      this.logger.warn('Could not fetch existing metadata for failed file, will create new', { fileId, error: err.message });
    }

    // Merge existing metadata with error information
    const metadata = {
      ...existingMetadata, // Preserve original metadata
      encoding: null,
      delimiter: null,
      preview_data: [],
      error: errorMessage
    };

    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score, metadata, checksum,
        duplicate_records_count, duplicate_records_percentage, project_id, processing_error, vendor_agreement_id, failure_reason_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        processing_error = EXCLUDED.processing_error,
        failure_reason_code = EXCLUDED.failure_reason_code,
        metadata = EXCLUDED.metadata,
        vendor_agreement_id = EXCLUDED.vendor_agreement_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      fileId,
      filename,
      fileType,
      fileSize,
      0, // row_count
      0, // column_count
      0, // quality_score - 0 indicates failed processing
      JSON.stringify(metadata),
      fileHash || null,
      0, // duplicate_records_count
      0.0, // duplicate_records_percentage
      projectId,
      errorMessage,
      agreementId || null,
      failureReasonCode || null
    ];

    const result = await this.dbPool.query(query, values);
    return result.rows[0];
  }

  /**
   * Track processing artifacts (CSV/Parquet outputs from archive extraction)
   */
  async trackProcessingArtifact(fileId, artifactName, artifactType) {
    try {
      const artifactId = uuidv4();
      const query = `
        INSERT INTO file_processing_artifacts (
          artifact_id, file_id, artifact_type, artifact_name, created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const values = [artifactId, fileId, artifactType, artifactName];
      const result = await this.dbPool.query(query, values);
      
      this.logger.info('Processing artifact tracked', {
        artifactId,
        fileId,
        artifactType,
        artifactName
      });
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to track processing artifact', {
        fileId,
        artifactName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Track archive members (nested files within archives)
   */
  async trackArchiveMembers(fileId, members) {
    try {
      if (!Array.isArray(members) || members.length === 0) {
        this.logger.warn('No archive members to track', { fileId });
        return;
      }
      
      const values = [];
      const placeholders = [];
      
      members.forEach((member, index) => {
        const memberId = uuidv4();
        const baseIndex = index * 6;
        
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
        );
        
        values.push(
          memberId,
          fileId,
          member.name || member.member_name || 'unknown',
          member.size || member.member_size || 0,
          member.is_directory || member.is_dir || false,
          member.extracted || false
        );
      });
      
      const query = `
        INSERT INTO archive_members (
          member_id, file_id, member_name, member_size, is_directory, extracted
        ) VALUES ${placeholders.join(', ')}
        RETURNING *
      `;
      
      const result = await this.dbPool.query(query, values);
      
      this.logger.info('Archive members tracked', {
        fileId,
        memberCount: result.rows.length
      });
      
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to track archive members', {
        fileId,
        memberCount: members?.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create file ownership record with creator and owner populated from uploader
   */
  async createFileOwnership(fileId, userId, filename) {
    try {
      // If no userId provided, create ownership record with defaults
      if (!userId) {
        this.logger.warn('No userId provided for file ownership, using defaults', { fileId, filename });
        
        const query = `
          INSERT INTO file_ownership (
            file_id, 
            creator_user_id, creator_name, creator_email,
            owner_user_id, owner_name, owner_email,
            sensitivity_level,
            created_at, updated_at
          ) VALUES ($1, NULL, $2, NULL, NULL, $3, NULL, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (file_id) DO NOTHING
          RETURNING *
        `;
        
        const result = await this.dbPool.query(query, [
          fileId,
          'Unknown',
          'Unassigned',
          'Public'
        ]);
        
        return result.rows[0];
      }
      
      // Fetch user details from database
      const userQuery = 'SELECT id, username, full_name, email FROM users WHERE id = $1';
      const userResult = await this.dbPool.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        this.logger.warn('User not found for file ownership, using defaults', { fileId, userId, filename });
        
        const query = `
          INSERT INTO file_ownership (
            file_id, 
            creator_user_id, creator_name, creator_email,
            owner_user_id, owner_name, owner_email,
            sensitivity_level,
            created_at, updated_at
          ) VALUES ($1, $2, $3, NULL, $4, $5, NULL, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (file_id) DO NOTHING
          RETURNING *
        `;
        
        const result = await this.dbPool.query(query, [
          fileId,
          userId,
          'Unknown',
          userId,
          'Unassigned',
          'Public'
        ]);
        
        return result.rows[0];
      }
      
      const user = userResult.rows[0];
      const userName = user.full_name || user.username || 'Unknown';
      const userEmail = user.email || null;
      
      // Create ownership record with both creator and owner set to the uploader
      const query = `
        INSERT INTO file_ownership (
          file_id, 
          creator_user_id, creator_name, creator_email,
          owner_user_id, owner_name, owner_email,
          sensitivity_level,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (file_id) DO NOTHING
        RETURNING *
      `;
      
      const result = await this.dbPool.query(query, [
        fileId,
        userId,           // creator_user_id
        userName,         // creator_name
        userEmail,        // creator_email
        userId,           // owner_user_id (default to creator)
        userName,         // owner_name (default to creator)
        userEmail,        // owner_email (default to creator)
        'Public'          // sensitivity_level (default)
      ]);
      
      this.logger.info('File ownership record created', {
        fileId,
        creatorName: userName,
        ownerName: userName
      });
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to create file ownership record', {
        fileId,
        userId,
        error: error.message
      });
      // Don't throw - ownership creation failure shouldn't fail the entire upload
      return null;
    }
  }

  /**
   * Safely parse float value for PostgreSQL NUMERIC(38,10)
   * Returns null for values that would cause overflow
   */
  safeParseFloat(value) {
    if (value === undefined || value === null) return null;
    
    try {
      const parsed = parseFloat(value);
      
      // Check for invalid numbers
      if (!isFinite(parsed)) {
        return null;
      }
      
      // PostgreSQL NUMERIC(38,10) limit: approximately ±9.9999999999E+27
      const MAX_NUMERIC = 9.9999999999e27;
      
      if (Math.abs(parsed) > MAX_NUMERIC) {
        this.logger.warn('Value exceeds PostgreSQL NUMERIC limit, storing as null', {
          value: value,
          parsed: parsed
        });
        return null;
      }
      
      return parsed;
    } catch (error) {
      this.logger.warn('Failed to parse float value', {
        value: value,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Save column information to database with profiling data
   */
  async saveColumnInfo(fileId, schema) {
    const deleteQuery = 'DELETE FROM file_columns WHERE file_id = $1';
    await this.dbPool.query(deleteQuery, [fileId]);

    const insertQuery = `
      INSERT INTO file_columns (
        file_id, column_name, column_type, column_index,
        unique_count, null_count, min_value, max_value,
        most_frequent_value, least_frequent_value,
        min_value_decimal, max_value_decimal,
        most_frequent_count, least_frequent_count,
        min_frequency, max_frequency,
        min_is_frequent, max_is_frequent,
        patterns
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `;

    let successfulColumnCount = 0;
    const initialColumnCount = schema.length;
    
    for (const col of schema) {
      try {
        // Only parse decimal values for numeric column types
        const isNumericType = ['integer', 'float', 'decimal', 'numeric', 'number'].includes(col.type?.toLowerCase());
        const minValueDecimal = isNumericType ? this.safeParseFloat(col.min_value) : null;
        const maxValueDecimal = isNumericType ? this.safeParseFloat(col.max_value) : null;
        
        await this.dbPool.query(insertQuery, [
          fileId,
          col.name,
          col.type,
          schema.indexOf(col),
          col.unique_count || 0,
          col.null_count || 0,
          col.min_value !== undefined && col.min_value !== null ? String(col.min_value) : null,
          col.max_value !== undefined && col.max_value !== null ? String(col.max_value) : null,
          col.most_frequent_value || null,
          col.least_frequent_value || null,
          minValueDecimal,
          maxValueDecimal,
          col.most_frequent_count || null,
          col.least_frequent_count || null,
          col.min_frequency || null,
          col.max_frequency || null,
          col.min_is_frequent !== undefined && col.min_is_frequent !== null ? col.min_is_frequent : null,
          col.max_is_frequent !== undefined && col.max_is_frequent !== null ? col.max_is_frequent : null,
          col.patterns && col.patterns.length > 0 ? JSON.stringify(col.patterns) : null
        ]);
        successfulColumnCount++;
      } catch (columnErr) {
        this.logger.error(`Error saving column "${col.name}" (index ${schema.indexOf(col)}):`, {
          error: columnErr.message,
          column: col.name,
          columnIndex: schema.indexOf(col),
          columnData: JSON.stringify(col, null, 2)
        });
        // Continue with other columns
      }
    }
    
    // Update the file record with the accurate column count
    if (successfulColumnCount !== initialColumnCount) {
      this.logger.info(`Updating column count from ${initialColumnCount} to ${successfulColumnCount} for file ${fileId}`);
      await this.dbPool.query(
        'UPDATE files SET column_count = $1 WHERE file_id = $2',
        [successfulColumnCount, fileId]
      );
    }
  }

  /**
   * Save preview data to database (up to 10,000 rows for quality validation)
   * @param {string} fileId - Unique file identifier
   * @param {Array} previewRows - Array of row objects
   */
  async savePreviewData(fileId, previewRows) {
    try {
      this.logger.info('Saving preview data to database', {
        fileId,
        rowCount: previewRows.length
      });

      // Limit to 10,000 rows for performance/storage balance
      const maxRows = 10000;
      const limitedRows = previewRows.slice(0, maxRows);

      // Use batch inserts for efficiency
      const batchSize = 100;
      for (let i = 0; i < limitedRows.length; i += batchSize) {
        const batch = limitedRows.slice(i, i + batchSize);
        const values = batch.map((_, idx) => {
          const base = idx * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        });
        
        const params = batch.flatMap((row, idx) => [
          fileId, i + idx + 1, JSON.stringify(row)
        ]);
        
        await this.dbPool.query(`
          INSERT INTO file_preview_data (file_id, row_number, row_data)
          VALUES ${values.join(', ')}
          ON CONFLICT (file_id, row_number) 
          DO UPDATE SET row_data = EXCLUDED.row_data
        `, params);
      }

      this.logger.info('Preview data saved successfully', {
        fileId,
        rowsSaved: limitedRows.length
      });
    } catch (error) {
      this.logger.error('Error saving preview data', {
        fileId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Apply vendor agreement governance metadata (PII tags, classification)
   * Uses unified governance service for consistent metadata persistence
   * @param {string} fileId - File ID
   * @param {number} agreementId - Vendor agreement ID
   * @param {Array} schema - Profiled file schema
   * @param {string} filename - Original filename
   * @param {number} projectId - Project ID
   */
  async applyAgreementGovernance(fileId, agreementId, schema, filename, projectId) {
    this.logger.info('Applying vendor agreement governance', { fileId, agreementId, filename });
    
    // Fetch vendor agreement with file schemas (including quality_rule_ids for file-level tags)
    const agreementResult = await this.dbPool.query(`
      SELECT 
        va.id,
        va.agreement_code,
        vafs.id as schema_id,
        vafs.file_name_pattern,
        vafs.schema,
        vafs.contains_pii,
        vafs.data_classification,
        vafs.quality_rule_ids,
        vafs.priority
      FROM vendor_agreements va
      LEFT JOIN vendor_agreement_file_schemas vafs ON va.id = vafs.vendor_agreement_id AND vafs.is_active = true
      WHERE va.id = $1 AND va.project_id = $2
      ORDER BY vafs.priority ASC NULLS LAST
    `, [agreementId, projectId]);
    
    this.logger.info('Fetched agreement schemas', {
      fileId,
      agreementId,
      projectId,
      schemaCount: agreementResult.rows.length,
      schemas: agreementResult.rows.map(r => ({
        schema_id: r.schema_id,
        pattern: r.file_name_pattern,
        contains_pii: r.contains_pii,
        classification: r.data_classification,
        quality_rules: r.quality_rule_ids,
        has_schema: !!r.schema
      }))
    });
    
    if (agreementResult.rows.length === 0) {
      this.logger.warn('Vendor agreement not found or no file schemas', { agreementId, projectId });
      return;
    }
    
    // Find matching schema based on filename pattern
    let matchedSchema = null;
    this.logger.info('Starting pattern matching', { fileId, filename, patternCount: agreementResult.rows.length });
    
    for (const row of agreementResult.rows) {
      if (!row.file_name_pattern) {
        this.logger.info('Skipping schema with no pattern', { fileId, schema_id: row.schema_id });
        continue;
      }
      
      // Simple wildcard matching (convert * to .* for regex)
      const patternRegex = new RegExp('^' + row.file_name_pattern.replace(/\*/g, '.*') + '$', 'i');
      const isMatch = patternRegex.test(filename);
      
      this.logger.info('Testing pattern', {
        fileId,
        schema_id: row.schema_id,
        pattern: row.file_name_pattern,
        regex: patternRegex.source,
        filename,
        isMatch
      });
      
      if (isMatch) {
        matchedSchema = row;
        this.logger.info('Pattern matched!', {
          fileId,
          schema_id: row.schema_id,
          pattern: row.file_name_pattern,
          contains_pii: row.contains_pii,
          classification: row.data_classification,
          quality_rules: row.quality_rule_ids
        });
        break;
      }
    }
    
    // Fallback to first schema if no pattern match
    if (!matchedSchema && agreementResult.rows[0].schema) {
      matchedSchema = agreementResult.rows[0];
      this.logger.warn('No pattern match, using first schema as fallback', {
        fileId,
        agreementId,
        filename,
        fallback_pattern: matchedSchema.file_name_pattern,
        fallback_classification: matchedSchema.data_classification
      });
    }
    
    if (!matchedSchema || !matchedSchema.schema) {
      this.logger.warn('No matching schema found for filename', { agreementId, filename });
      return;
    }
    
    // Extract PII columns from schema
    const schemaObj = typeof matchedSchema.schema === 'string' 
      ? JSON.parse(matchedSchema.schema) 
      : matchedSchema.schema;
    
    this.logger.info('Processing agreement schema for PII', {
      fileId,
      schemaType: typeof matchedSchema.schema,
      isArray: Array.isArray(schemaObj),
      schemaLength: Array.isArray(schemaObj) ? schemaObj.length : 0,
      schemaColumns: Array.isArray(schemaObj) ? schemaObj.map(c => c.name || c.column_name) : []
    });
    
    // Extract PII columns
    let piiColumnNames = [];
    if (Array.isArray(schemaObj) && schemaObj.length > 0) {
      // Find PII columns (those with is_pii: true)
      const piiColumns = schemaObj.filter(col => col.is_pii === true || col.pii === true);
      
      this.logger.info('PII columns detected in schema', {
        fileId,
        piiColumnCount: piiColumns.length,
        piiColumns: piiColumns.map(c => ({
          name: c.name || c.column_name,
          is_pii: c.is_pii,
          pii: c.pii
        })),
        totalSchemaColumns: schemaObj.length
      });
      
      // Extract column names for governance persistence
      piiColumnNames = piiColumns.map(col => col.name || col.column_name);
      
      // CRITICAL FIX: Create column_governance_tag_assignments for PII columns
      // This was accidentally removed during file processing worker refactor
      if (piiColumnNames.length > 0) {
        try {
          // Get the PII governance tag_id
          const piiTagResult = await this.dbPool.query(`
            SELECT tag_id 
            FROM governance_tags 
            WHERE tag_name = 'PII'
            LIMIT 1
          `);
          
          if (piiTagResult.rows.length > 0) {
            const piiTagId = piiTagResult.rows[0].tag_id;
            
            // Delete existing tag assignments for this file (clean slate)
            await this.dbPool.query(`
              DELETE FROM column_governance_tag_assignments
              WHERE file_id = $1
            `, [fileId]);
            
            // Bulk insert PII tag assignments for all PII columns
            const insertPromises = piiColumnNames.map(columnName =>
              this.dbPool.query(`
                INSERT INTO column_governance_tag_assignments (file_id, column_name, tag_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (file_id, column_name, tag_id) DO NOTHING
              `, [fileId, columnName, piiTagId])
            );
            
            await Promise.all(insertPromises);
            
            this.logger.info('Created column governance tag assignments for PII columns', {
              fileId,
              piiTagId,
              columnCount: piiColumnNames.length,
              columns: piiColumnNames
            });
          } else {
            this.logger.warn('PII governance tag not found in database', { fileId });
          }
        } catch (tagAssignError) {
          this.logger.error('Failed to create column governance tag assignments', {
            fileId,
            error: tagAssignError.message,
            stack: tagAssignError.stack
          });
          // Don't throw - allow file processing to continue
        }
      }
    }
    
    // Extract file-level tags from quality_rule_ids
    let fileTags = [];
    if (matchedSchema.quality_rule_ids && Array.isArray(matchedSchema.quality_rule_ids)) {
      // Fetch quality rule names to use as tags
      try {
        const rulesResult = await this.dbPool.query(`
          SELECT id, rule_name 
          FROM quality_rules 
          WHERE id = ANY($1::int[])
        `, [matchedSchema.quality_rule_ids]);
        
        fileTags = rulesResult.rows.map(r => r.rule_name);
        
        this.logger.info('Extracted file-level tags from quality rules', {
          fileId,
          ruleIds: matchedSchema.quality_rule_ids,
          tags: fileTags
        });
      } catch (tagError) {
        this.logger.warn('Failed to fetch quality rule names for tags', {
          fileId,
          error: tagError.message
        });
      }
    }
    
    // Use unified governance service to persist all metadata atomically
    const result = await persistGovernanceMetadata(this.dbPool, {
      fileId,
      containsPii: matchedSchema.contains_pii || false,
      dataClassification: matchedSchema.data_classification,
      fileTags,
      piiColumns: piiColumnNames,
      profiledSchema: schema
    });
    
    if (result.success) {
      this.logger.info('Successfully applied all governance metadata via unified service', {
        fileId,
        governanceApplied: result.governanceApplied
      });
    } else {
      this.logger.error('Failed to apply governance metadata', {
        fileId,
        error: result.error
      });
    }
  }

  /**
   * Apply vendor file governance metadata (file tags, PII columns, sensitivity)
   * This is ISOLATED from contract validation and only runs for vendor file uploads
   * Does NOT affect: contract validation files, mapping jobs, or normal file uploads
   * @param {string} fileId - File ID
   * @param {string} filename - Original filename
   * @param {Array} schema - Profiled file schema
   * @param {number} projectId - Project ID
   */
  async applyVendorFileGovernance(fileId, filename, schema, projectId) {
    this.logger.info('Applying vendor file governance (isolated path)', { fileId, filename, projectId });
    
    // Step 1: Get connection_id from file metadata
    const fileResult = await this.dbPool.query(`
      SELECT metadata
      FROM files
      WHERE file_id = $1
    `, [fileId]);
    
    if (fileResult.rows.length === 0) {
      this.logger.warn('File not found for vendor governance', { fileId });
      return;
    }
    
    const metadata = typeof fileResult.rows[0].metadata === 'string' 
      ? JSON.parse(fileResult.rows[0].metadata) 
      : fileResult.rows[0].metadata;
    
    const connectionId = metadata.connection_id;
    
    if (!connectionId) {
      this.logger.warn('No connection_id found in vendor file metadata', { fileId });
      return;
    }
    
    this.logger.info('Retrieved connection_id from file metadata', { fileId, connectionId });
    
    // Step 2: Query vendor agreement file schemas using connection_id
    const schemaResult = await this.dbPool.query(`
      SELECT 
        vafs.id as schema_id,
        vafs.file_name_pattern,
        vafs.schema,
        vafs.contains_pii,
        vafs.data_classification,
        vafs.quality_rule_ids,
        vafs.priority,
        va.id as agreement_id,
        va.agreement_code
      FROM vendor_agreement_file_schemas vafs
      INNER JOIN vendor_agreements va ON vafs.vendor_agreement_id = va.id
      WHERE va.vendor_connection_id = $1
        AND va.project_id = $2
        AND va.approval_status = 'governance_approved'
        AND va.is_locked = true
        AND va.status = 'active'
        AND vafs.is_active = true
      ORDER BY vafs.priority ASC NULLS LAST
    `, [connectionId, projectId]);
    
    this.logger.info('Fetched vendor agreement file schemas', {
      fileId,
      connectionId,
      schemaCount: schemaResult.rows.length,
      schemas: schemaResult.rows.map(r => ({
        schema_id: r.schema_id,
        pattern: r.file_name_pattern,
        contains_pii: r.contains_pii,
        classification: r.data_classification,
        quality_rules: r.quality_rule_ids
      }))
    });
    
    if (schemaResult.rows.length === 0) {
      this.logger.info('No vendor agreement file schemas found for connection', { fileId, connectionId });
      return;
    }
    
    // Step 3: Match filename against patterns
    const { matchesPattern } = require('../utils/filePatternMatcher');
    let matchedSchema = null;
    
    for (const row of schemaResult.rows) {
      if (!row.file_name_pattern) {
        continue;
      }
      
      const isMatch = matchesPattern(filename, row.file_name_pattern);
      
      if (isMatch) {
        matchedSchema = row;
        this.logger.info('Matched vendor file pattern', {
          fileId,
          filename,
          pattern: row.file_name_pattern,
          schema_id: row.schema_id,
          contains_pii: row.contains_pii,
          classification: row.data_classification
        });
        break;
      }
    }
    
    // Fallback to first schema if no pattern match
    if (!matchedSchema && schemaResult.rows[0].schema) {
      matchedSchema = schemaResult.rows[0];
      this.logger.warn('No pattern match, using first schema as fallback', {
        fileId,
        filename,
        fallback_pattern: matchedSchema.file_name_pattern
      });
    }
    
    if (!matchedSchema) {
      this.logger.warn('No matching schema found for vendor file', { fileId, filename });
      return;
    }
    
    // Step 4: Extract PII columns from schema
    const schemaObj = typeof matchedSchema.schema === 'string' 
      ? JSON.parse(matchedSchema.schema) 
      : matchedSchema.schema;
    
    let piiColumnNames = [];
    if (Array.isArray(schemaObj) && schemaObj.length > 0) {
      const piiColumns = schemaObj.filter(col => col.is_pii === true || col.pii === true);
      piiColumnNames = piiColumns.map(col => col.name || col.column_name);
      
      this.logger.info('PII columns detected in vendor file schema', {
        fileId,
        piiColumnCount: piiColumns.length,
        piiColumns: piiColumnNames
      });
    }
    
    // Step 5: Extract file-level tags from quality_rule_ids
    let fileTags = [];
    if (matchedSchema.quality_rule_ids && Array.isArray(matchedSchema.quality_rule_ids)) {
      try {
        const rulesResult = await this.dbPool.query(`
          SELECT id, rule_name 
          FROM quality_rules 
          WHERE id = ANY($1::int[])
        `, [matchedSchema.quality_rule_ids]);
        
        fileTags = rulesResult.rows.map(r => r.rule_name);
        
        this.logger.info('Extracted file-level tags from quality rules for vendor file', {
          fileId,
          ruleIds: matchedSchema.quality_rule_ids,
          tags: fileTags
        });
      } catch (tagError) {
        this.logger.warn('Failed to fetch quality rule names for vendor file tags', {
          fileId,
          error: tagError.message
        });
      }
    }
    
    // Step 6: Use unified governance service to persist all metadata atomically
    const result = await persistGovernanceMetadata(this.dbPool, {
      fileId,
      containsPii: matchedSchema.contains_pii || false,
      dataClassification: matchedSchema.data_classification,
      fileTags,
      piiColumns: piiColumnNames,
      profiledSchema: schema
    });
    
    if (result.success) {
      this.logger.info('Successfully applied vendor file governance via unified service', {
        fileId,
        governanceApplied: result.governanceApplied
      });
    } else {
      this.logger.error('Failed to apply vendor file governance', {
        fileId,
        error: result.error
      });
    }
  }

  /**
   * Cleanup uploaded file after processing
   * @param {string} filePath - Path to the uploaded file
   * @param {string} status - 'success' or 'failure'
   */
  async cleanupUploadedFile(filePath, status) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.logger.debug('File already deleted or does not exist', { filePath });
        return;
      }

      // Always delete the file for security - we store metadata and preview data only
      fs.unlinkSync(filePath);
      this.logger.info('Uploaded file deleted (security policy - metadata and preview stored)', { 
        filePath, 
        status 
      });
    } catch (error) {
      this.logger.error('Error cleaning up uploaded file', {
        filePath,
        error: error.message
      });
      // Don't throw - cleanup failure shouldn't fail the job
    }
  }

  /**
   * Trigger garbage collection after file processing to free memory
   * Only works if Node.js was started with --expose-gc flag
   */
  triggerGarbageCollection() {
    try {
      if (global.gc) {
        const before = process.memoryUsage();
        global.gc();
        const after = process.memoryUsage();
        const freedMB = Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024);
        if (freedMB > 5) {
          this.logger.info('Garbage collection freed memory', {
            freedMB,
            heapUsedMB: Math.round(after.heapUsed / 1024 / 1024)
          });
        }
      }
    } catch (error) {
      // Silently ignore GC errors
    }
  }

  /**
   * Stop worker
   */
  async stop() {
    this.logger.info('Stopping file processing worker');
    // Cleanup if needed
  }
}

module.exports = FileProcessingWorker;
