const { Worker } = require('bullmq');
const { createRedisConnection } = require('../queues/uploadQueue');
const BatchRecordProcessor = require('../services/BatchRecordProcessor');
const UploadBatchService = require('../services/UploadBatchService');
const virusScanService = require('../services/VirusScanService');
const { systemLogger } = require('../utils/logger');
const fs = require('fs');

const batchProcessor = new BatchRecordProcessor();
const uploadBatchService = new UploadBatchService();

class UploadWorker {
  constructor() {
    this.worker = null;
  }

  start(concurrency = 5) {
    const connection = createRedisConnection();

    this.worker = new Worker(
      'file-upload',
      async (job) => {
        return await this.processUploadJob(job);
      },
      {
        connection,
        concurrency,
        limiter: {
          max: 10,
          duration: 1000
        }
      }
    );

    this.worker.on('completed', (job) => {
      systemLogger.info('Upload job completed', {
        jobId: job.id,
        fileId: job.data.uploadFile.file_id,
        duration: Date.now() - job.timestamp
      });
    });

    this.worker.on('failed', (job, err) => {
      systemLogger.error('Upload job failed', {
        jobId: job?.id,
        fileId: job?.data?.uploadFile?.file_id,
        error: err.message,
        attempts: job?.attemptsMade
      });
    });

    this.worker.on('error', (err) => {
      systemLogger.error('Worker error', { error: err.message });
    });

    systemLogger.info('Upload worker started', { concurrency });

    return this.worker;
  }

  async processUploadJob(job) {
    const { uploadFile, filePath, options } = job.data;

    try {
      await job.updateProgress(0);

      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'queued', {
        started_at: new Date()
      });

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      await job.updateProgress(10);

      // Update status to scanning before virus check
      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'scanning', {
        scanning_started_at: new Date()
      });

      const scanResult = await virusScanService.scanFile(filePath);
      if (!scanResult.isClean) {
        throw new Error(`Virus detected: ${scanResult.virus || 'Unknown threat'}`);
      }

      await job.updateProgress(30);

      // Update status to processing after virus scan
      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'processing', {
        processing_started_at: new Date()
      });

      const result = await batchProcessor.processFile(uploadFile, filePath, options);

      await job.updateProgress(90);

      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'completed', {
        records_processed: result.recordsProcessed,
        completed_at: new Date()
      });

      // NOTE: File is NOT deleted here - FileProcessingWorker needs it for profiling
      // FileProcessingWorker.cleanupUploadedFile() handles deletion after profiling completes

      await job.updateProgress(100);

      return {
        success: true,
        recordsProcessed: result.recordsProcessed,
        fileId: uploadFile.file_id
      };

    } catch (error) {
      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'failed', {
        error_message: error.message,
        error_details: {
          stack: error.stack,
          timestamp: new Date().toISOString()
        },
        completed_at: new Date()
      });

      // Clean up infected files immediately (security requirement)
      // For other errors, FileProcessingWorker handles cleanup
      if (error.message.includes('Virus detected') && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          systemLogger.info('Deleted infected file', { filePath });
        } catch (cleanupError) {
          systemLogger.error('Failed to cleanup infected file', {
            filePath,
            error: cleanupError.message
          });
        }
      }

      throw error;
    }
  }

  async stop() {
    if (this.worker) {
      await this.worker.close();
      systemLogger.info('Upload worker stopped');
    }
  }
}

module.exports = UploadWorker;
