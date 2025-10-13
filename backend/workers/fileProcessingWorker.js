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

class FileProcessingWorker {
  constructor(queue, dbPool, logger) {
    this.queue = queue;
    this.dbPool = dbPool;
    this.logger = logger;
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

    this.logger.info('Processing file job', {
      jobId,
      fileId,
      fileName: originalName,
      fileSize
    });

    try {
      // Mark job as active
      await this.queue.activateJob(jobId);
      
      // Update progress: Starting
      await this.queue.updateProgress(jobId, 10);

      // Step 1: Process file using Python streaming processors
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

      await this.queue.updateProgress(jobId, 100);

      // Complete job
      await this.queue.completeJob(jobId, {
        success: true,
        fileId,
        rowCount: fileInfo.row_count,
        columnCount: fileInfo.column_count,
        processingTime: fileInfo.processing_time_seconds
      });

      // Cleanup: Delete uploaded file after successful processing
      await this.cleanupUploadedFile(filePath, 'success');

    } catch (error) {
      this.logger.error('Error processing file job', {
        jobId,
        fileId,
        error: error.message,
        stack: error.stack
      });

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
        min_is_frequent, max_is_frequent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `;

    for (const col of schema) {
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
        col.min_value !== undefined && col.min_value !== null ? parseFloat(col.min_value) : null,
        col.max_value !== undefined && col.max_value !== null ? parseFloat(col.max_value) : null,
        col.most_frequent_count || null,
        col.least_frequent_count || null,
        col.min_frequency || null,
        col.max_frequency || null,
        col.min_is_frequent !== undefined && col.min_is_frequent !== null ? col.min_is_frequent : null,
        col.max_is_frequent !== undefined && col.max_is_frequent !== null ? col.max_is_frequent : null
      ]);
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
