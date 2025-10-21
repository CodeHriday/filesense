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
    const { fileId, filePath, originalName, fileSize, fileType, userId, fileHash } = job.data;
    const startTime = Date.now();

    this.logger.info('Processing file job', {
      jobId,
      fileId,
      fileName: originalName,
      fileSize
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

      // Step 4: Save metadata to database (including duplicates and hash)
      await this.saveFileMetadata(fileId, originalName, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats);
      await this.queue.updateProgress(jobId, 85);

      // Step 5: Save column information with profiling data
      if (fileInfo.schema && fileInfo.schema.length > 0) {
        await this.saveColumnInfo(fileId, fileInfo.schema);
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
        this.logger.warn('Python processor not found, using fallback', { pythonScript });
        // Fallback to basic file info
        const stats = fs.statSync(filePath);
        return resolve({
          row_count: 0,
          column_count: 0,
          schema: [],
          processing_time_seconds: 0,
          size_bytes: stats.size
        });
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
          this.logger.error('Python processor error', {
            code,
            stderr,
            filePath
          });
          reject(new Error(`Python processor failed with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            this.logger.error('Failed to parse Python output', {
              stdout,
              error: error.message
            });
            reject(new Error('Failed to parse Python processor output'));
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
   * Save file metadata to database
   */
  async saveFileMetadata(fileId, filename, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats) {
    // Build metadata object with encoding, delimiter, and preview data
    const metadata = {
      encoding: fileInfo.encoding || null,
      delimiter: fileInfo.delimiter || null,
      preview_data: fileInfo.preview_data || []
    };

    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score, metadata, checksum,
        duplicate_records_count, duplicate_records_percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        quality_score = EXCLUDED.quality_score,
        metadata = EXCLUDED.metadata,
        checksum = EXCLUDED.checksum,
        duplicate_records_count = EXCLUDED.duplicate_records_count,
        duplicate_records_percentage = EXCLUDED.duplicate_records_percentage,
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
      85, // Default quality score
      JSON.stringify(metadata),
      fileHash || null,
      duplicateStats?.duplicate_count || 0,
      duplicateStats?.duplicate_percentage || 0.0
    ];

    const result = await this.dbPool.query(query, values);
    return result.rows[0];
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

      if (status === 'failure' && process.env.QUARANTINE_FAILED_FILES === 'true') {
        // Optionally quarantine failed files for debugging
        const quarantinePath = filePath.replace('/uploads/', '/quarantine/');
        const quarantineDir = path.dirname(quarantinePath);
        
        if (!fs.existsSync(quarantineDir)) {
          fs.mkdirSync(quarantineDir, { recursive: true });
        }
        
        fs.renameSync(filePath, quarantinePath);
        this.logger.info('File quarantined for debugging', { 
          originalPath: filePath, 
          quarantinePath 
        });
      } else {
        // Delete the file
        fs.unlinkSync(filePath);
        this.logger.info('Uploaded file cleaned up', { filePath, status });
      }
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
