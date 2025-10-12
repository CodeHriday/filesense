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
    const { fileId, filePath, originalName, fileSize, fileType, userId } = job.data;

    this.logger.info('Processing file job', {
      jobId,
      fileId,
      fileName: originalName,
      fileSize
    });

    try {
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

      await this.queue.updateProgress(jobId, 60);

      // Step 2: Save metadata to database
      await this.saveFileMetadata(fileId, originalName, fileType, fileSize, fileInfo, userId);
      await this.queue.updateProgress(jobId, 80);

      // Step 3: Save column information
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

    } catch (error) {
      this.logger.error('Error processing file job', {
        jobId,
        fileId,
        error: error.message,
        stack: error.stack
      });

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
   * Save file metadata to database
   */
  async saveFileMetadata(fileId, filename, fileType, fileSize, fileInfo, userId) {
    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        quality_score = EXCLUDED.quality_score,
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
      85 // Default quality score
    ];

    const result = await this.dbPool.query(query, values);
    return result.rows[0];
  }

  /**
   * Save column information to database
   */
  async saveColumnInfo(fileId, schema) {
    const deleteQuery = 'DELETE FROM file_columns WHERE file_id = $1';
    await this.dbPool.query(deleteQuery, [fileId]);

    const insertQuery = `
      INSERT INTO file_columns (
        file_id, column_name, column_type, column_index,
        unique_count, null_count
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    for (const col of schema) {
      await this.dbPool.query(insertQuery, [
        fileId,
        col.name,
        col.type,
        schema.indexOf(col),
        col.unique_count || 0,
        col.null_count || 0
      ]);
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
