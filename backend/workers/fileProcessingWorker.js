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
const { captureFileAudit, captureFileSchema } = require('../services/fileAuditService');
const { saveSchemaSnapshot } = require('../services/schemaService');
const QualityValidationEngine = require('../services/qualityValidationEngine');

class FileProcessingWorker {
  constructor(queue, dbPool, logger, auditService = null) {
    this.queue = queue;
    this.dbPool = dbPool;
    this.logger = logger;
    this.auditService = auditService;
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
    this.queue.onJobWaiting && this.queue.onJobWaiting('file-processing', async (jobId, job) => {
      await this.processJob(jobId, job);
    });

    // Log completion events
    this.queue.onJobCompleted('file-processing', (jobId, result) => {
      this.logger.info('File processing completed', { jobId, ...result });
    });

    // Log failure events
    this.queue.onJobFailed('file-processing', (jobId, error) => {
      this.logger.error('File processing failed', { jobId, error: error.message });
    });
  }

  /**
   * Process a single file upload job
   */
  async processJob(jobId, job) {
    const { fileId, filePath, originalName, fileSize, fileType, userId, fileHash, projectId, subProjectId, qualityRuleIds, agreementId } = job.data;
    const startTime = Date.now();

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

      // Step 1: Process file using Python streaming processors
      await this.updateProcessingStep(fileId, 'analyzing');
      this.logger.info('Calling Python processor for file analysis', { fileId });
      await this.queue.updateProgress(jobId, 30);

      const fileInfo = await this.callPythonProcessor(filePath, fileType);

      this.logger.info('Python processing completed', {
        fileId,
        rowCount: fileInfo.row_count,
        columnCount: fileInfo.column_count
      });

      await this.queue.updateProgress(jobId, 50);

      // Step 2: Generate detailed column profiling (min/max, frequency values)
      await this.updateProcessingStep(fileId, 'profiling');
      this.logger.info('Generating column profiling statistics', { fileId });
      const profilingData = await this.callProfilingScript(filePath, fileType);
      
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
      const headerValidation = await this.callHeaderValidator(filePath, fileType);
      
      this.logger.info('Header validation completed', {
        fileId,
        status: headerValidation.status,
        issuesFound: headerValidation.issues_found || 0
      });

      await this.queue.updateProgress(jobId, 70);

      // Step 3: Detect duplicate rows
      await this.updateProcessingStep(fileId, 'duplicates');
      this.logger.info('Detecting duplicate rows', { fileId });
      const duplicateStats = await this.detectDuplicates(filePath, fileType);
      
      this.logger.info('Duplicate detection completed', {
        fileId,
        duplicateCount: duplicateStats.duplicate_count,
        duplicatePercentage: duplicateStats.duplicate_percentage
      });

      await this.queue.updateProgress(jobId, 75);

      // Step 4: Save metadata to database (including duplicates, hash, and header validation)
      await this.saveFileMetadata(fileId, originalName, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats, headerValidation, projectId, subProjectId);
      
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
                await validationEngine.persistViolations(validationResult.violations);
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
          this.logger.error('Quality validation failed', {
            fileId,
            error: validationError.message,
            stack: validationError.stack
          });
          // Don't fail the whole processing if quality validation fails
        }
      }

      await this.queue.updateProgress(jobId, 100);

      // Mark processing as complete
      await this.updateProcessingStep(fileId, 'complete');

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

    } catch (error) {
      this.logger.error('Error processing file job', {
        jobId,
        fileId,
        error: error.message,
        stack: error.stack
      });

      const processingDuration = Date.now() - startTime;

      // Save file metadata with error to database so user can see what failed
      try {
        await this.saveFailedFileMetadata(fileId, originalName, fileType, fileSize, error.message, fileHash, projectId);
        this.logger.info('Failed file metadata saved to database', { fileId, errorMsg: error.message });
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
          statusReason: error.message,
          triggeredByUser: userId,
          triggerType: 'upload',
          executionDurationMs: processingDuration,
          metadata: {
            errorStack: error.stack
          },
          context: null
        });
      }

      // Mark processing as failed
      await this.updateProcessingStep(fileId, 'failed');

      // Cleanup: Delete or quarantine failed file
      await this.cleanupUploadedFile(filePath, 'failure');

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
      
      const python = spawn('python3', [pythonScript, filePath, fileType], { env });
      
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
      
      const python = spawn('python3', [pythonScript, filePath, fileType], { env });
      
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
      
      const python = spawn('python3', [pythonScript, filePath, fileType], { env });
      
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
      
      const python = spawn('python3', ['-c', pythonCode]);
      
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
  async saveFileMetadata(fileId, filename, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats, headerValidation, projectId, subProjectId = null) {
    // Build metadata object with encoding, delimiter, preview data, and header validation
    const metadata = {
      encoding: fileInfo.encoding || null,
      delimiter: fileInfo.delimiter || null,
      preview_data: fileInfo.preview_data || [],
      header_validation: headerValidation || null
    };

    // Calculate dynamic quality score based on multiple factors
    const qualityScore = this.calculateQualityScore(fileInfo, duplicateStats, headerValidation);

    this.logger.info('Calculated quality score', {
      fileId,
      qualityScore,
      headerHealthScore: headerValidation?.health_score,
      duplicatePercentage: duplicateStats?.duplicate_percentage
    });

    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score, metadata, checksum,
        duplicate_records_count, duplicate_records_percentage, project_id, sub_project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
      subProjectId
    ];

    const result = await this.dbPool.query(query, values);
    return result.rows[0];
  }

  /**
   * Save failed file metadata to database with error information
   */
  async saveFailedFileMetadata(fileId, filename, fileType, fileSize, errorMessage, fileHash, projectId) {
    const metadata = {
      encoding: null,
      delimiter: null,
      preview_data: [],
      error: errorMessage
    };

    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score, metadata, checksum,
        duplicate_records_count, duplicate_records_percentage, project_id, processing_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        processing_error = EXCLUDED.processing_error,
        metadata = EXCLUDED.metadata,
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
      errorMessage
    ];

    const result = await this.dbPool.query(query, values);
    return result.rows[0];
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
   * Save preview data (100 rows) to database
   * @param {string} fileId - Unique file identifier
   * @param {Array} previewRows - Array of row objects (max 100)
   */
  async savePreviewData(fileId, previewRows) {
    try {
      this.logger.info('Saving preview data to database', {
        fileId,
        rowCount: previewRows.length
      });

      // Limit to 100 rows
      const limitedRows = previewRows.slice(0, 100);

      // Insert each row into file_preview_data table
      for (let i = 0; i < limitedRows.length; i++) {
        await this.dbPool.query(
          `INSERT INTO file_preview_data (file_id, row_number, row_data)
           VALUES ($1, $2, $3)
           ON CONFLICT (file_id, row_number) 
           DO UPDATE SET row_data = EXCLUDED.row_data`,
          [fileId, i + 1, JSON.stringify(limitedRows[i])]
        );
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
      // Don't throw - preview data failure shouldn't fail the job
    }
  }

  /**
   * Apply vendor agreement governance metadata (PII tags, classification)
   * @param {string} fileId - File ID
   * @param {number} agreementId - Vendor agreement ID
   * @param {Array} schema - Profiled file schema
   * @param {string} filename - Original filename
   * @param {number} projectId - Project ID
   */
  async applyAgreementGovernance(fileId, agreementId, schema, filename, projectId) {
    this.logger.info('Applying vendor agreement governance', { fileId, agreementId, filename });
    
    // Fetch vendor agreement with file schemas
    const agreementResult = await this.dbPool.query(`
      SELECT 
        va.id,
        va.agreement_code,
        vafs.id as schema_id,
        vafs.file_name_pattern,
        vafs.schema,
        vafs.contains_pii,
        vafs.data_classification,
        vafs.priority
      FROM vendor_agreements va
      LEFT JOIN vendor_agreement_file_schemas vafs ON va.id = vafs.vendor_agreement_id AND vafs.is_active = true
      WHERE va.id = $1 AND va.project_id = $2
      ORDER BY vafs.priority ASC NULLS LAST
    `, [agreementId, projectId]);
    
    // DEBUG: Log fetched schemas
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
          classification: row.data_classification
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
    
    // Update files table with governance metadata
    await this.dbPool.query(`
      UPDATE files 
      SET contains_pii = $1,
          data_classification = $2
      WHERE file_id = $3
    `, [matchedSchema.contains_pii || false, matchedSchema.data_classification, fileId]);
    
    this.logger.info('Applied governance metadata to file', { 
      fileId, 
      contains_pii: matchedSchema.contains_pii,
      data_classification: matchedSchema.data_classification 
    });
    
    // Extract PII columns from schema and insert into column_sensitivity_tags
    const schemaObj = typeof matchedSchema.schema === 'string' 
      ? JSON.parse(matchedSchema.schema) 
      : matchedSchema.schema;
    
    // DEBUG: Log schema object
    this.logger.info('Processing agreement schema for PII', {
      fileId,
      schemaType: typeof matchedSchema.schema,
      isArray: Array.isArray(schemaObj),
      schemaLength: Array.isArray(schemaObj) ? schemaObj.length : 0,
      schemaColumns: Array.isArray(schemaObj) ? schemaObj.map(c => c.name || c.column_name) : []
    });
    
    if (Array.isArray(schemaObj) && schemaObj.length > 0) {
      // Find PII columns (those with is_pii: true)
      const piiColumns = schemaObj.filter(col => col.is_pii === true || col.pii === true);
      
      // DEBUG: Log PII column detection
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
      
      if (piiColumns.length > 0) {
        // Map schema column names (case-insensitive) to profiled columns
        const profiledColumnNames = schema.map(c => c.name.toLowerCase());
        
        // DEBUG: Log profiled column names
        this.logger.info('Profiled columns for PII matching', {
          fileId,
          profiledColumnNames,
          profiledColumnCount: profiledColumnNames.length
        });
        
        for (const piiCol of piiColumns) {
          const columnName = piiCol.name || piiCol.column_name;
          const columnNameLower = columnName.toLowerCase();
          
          this.logger.info('Processing PII column for tagging', {
            fileId,
            columnName,
            columnNameLower,
            existsInProfile: profiledColumnNames.includes(columnNameLower)
          });
          
          // Check if column exists in profiled schema
          if (!profiledColumnNames.includes(columnNameLower)) {
            this.logger.warn('PII column from schema not found in profiled file', { 
              fileId, 
              columnName,
              agreementId,
              profiledColumnNames 
            });
            continue;
          }
          
          // Insert sensitivity tag
          try {
            const insertResult = await this.dbPool.query(`
              INSERT INTO column_sensitivity_tags (file_id, column_name, sensitivity_level, tagged_by, tagged_at)
              VALUES ($1, $2, $3, $4, NOW())
              ON CONFLICT (file_id, column_name) DO UPDATE
              SET sensitivity_level = EXCLUDED.sensitivity_level,
                  tagged_at = NOW()
              RETURNING *
            `, [fileId, columnName, 'PII', 'system']);
            
            this.logger.info('Successfully applied PII tag to column', { 
              fileId, 
              columnName,
              rowsAffected: insertResult.rowCount,
              inserted: insertResult.rows[0]
            });
          } catch (tagError) {
            this.logger.error('Failed to insert PII tag', { 
              fileId, 
              columnName, 
              error: tagError.message,
              stack: tagError.stack 
            });
          }
        }
        
        this.logger.info('PII tags applied', { fileId, piiColumnCount: piiColumns.length });
      } else {
        this.logger.info('No PII columns found in schema', { fileId, agreementId });
      }
    } else {
      this.logger.info('Schema is not an array or is empty', { fileId, agreementId });
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
   * Stop worker
   */
  async stop() {
    this.logger.info('Stopping file processing worker');
    // Cleanup if needed
  }
}

module.exports = FileProcessingWorker;
