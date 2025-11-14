const BatchRecordProcessor = require('./BatchRecordProcessor');
const UploadBatchService = require('./UploadBatchService');
const virusScanService = require('./VirusScanService');
const { systemLogger } = require('../utils/logger');
const fs = require('fs');

const batchProcessor = new BatchRecordProcessor();
const uploadBatchService = new UploadBatchService();

class UploadProcessor {
  async processUploadFile(uploadFile, filePath, options) {
    try {
      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'processing', {
        started_at: new Date()
      });

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const scanResult = await virusScanService.scanFile(filePath);
      if (!scanResult.isClean) {
        throw new Error(`Virus detected: ${scanResult.virus || 'Unknown threat'}`);
      }

      const result = await batchProcessor.processFile(uploadFile, filePath, options);

      await uploadBatchService.updateFileStatus(uploadFile.file_id, 'completed', {
        records_processed: result.recordsProcessed,
        completed_at: new Date()
      });

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

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

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          systemLogger.error('Failed to cleanup file', {
            filePath,
            error: cleanupError.message
          });
        }
      }

      throw error;
    }
  }
}

module.exports = new UploadProcessor();
