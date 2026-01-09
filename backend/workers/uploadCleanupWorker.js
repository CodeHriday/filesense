const fs = require('fs');
const path = require('path');

class UploadCleanupWorker {
  constructor(logger, uploadsDir, maxAgeMs = 3600000) {
    this.logger = logger;
    this.uploadsDir = uploadsDir;
    this.maxAgeMs = maxAgeMs;
    this.intervalHandle = null;
    this.isProcessing = false;
  }

  async start() {
    this.logger.info('🧹 Upload cleanup worker started', {
      uploadsDir: this.uploadsDir,
      maxAgeMinutes: this.maxAgeMs / 60000,
      checkIntervalMinutes: 15
    });

    this.cleanup();

    this.intervalHandle = setInterval(() => {
      this.cleanup();
    }, 15 * 60 * 1000);
  }

  async cleanup() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      const files = await fs.promises.readdir(this.uploadsDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.uploadsDir, file);
        
        try {
          const stat = await fs.promises.stat(filePath);
          
          if (stat.isFile()) {
            const ageMs = now - stat.mtimeMs;
            
            if (ageMs > this.maxAgeMs) {
              await fs.promises.unlink(filePath);
              deletedCount++;
              this.logger.info('Deleted orphaned upload', {
                file,
                ageMinutes: Math.round(ageMs / 60000)
              });
            }
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            this.logger.warn('Error processing file for cleanup', {
              file,
              error: err.message
            });
          }
        }
      }

      if (deletedCount > 0) {
        this.logger.info('Upload cleanup completed', { deletedCount });
      }
    } catch (error) {
      this.logger.error('Error in upload cleanup worker', {
        error: error.message
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info('Upload cleanup worker stopped');
    }
  }
}

module.exports = UploadCleanupWorker;
