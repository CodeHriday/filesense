/**
 * Queue Interface - Abstract base class for job queue implementations
 * 
 * This interface allows switching between different queue backends:
 * - Redis (BullMQ) for Replit/development
 * - AWS SQS for AWS deployments
 * - Google Cloud Tasks for GCP deployments
 * - In-memory for testing/fallback
 * 
 * Cloud-ready: Change queue backend via environment variable, zero code changes
 */

class QueueInterface {
  /**
   * Add a job to the queue
   * @param {string} queueName - Name of the queue
   * @param {Object} data - Job data
   * @param {Object} options - Job options (attempts, backoff, etc.)
   * @returns {Promise<string>} Job ID
   */
  async addJob(queueName, data, options = {}) {
    throw new Error('addJob() must be implemented by subclass');
  }

  /**
   * Get job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job object
   */
  async getJob(jobId) {
    throw new Error('getJob() must be implemented by subclass');
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Status object {state, progress, result, error}
   */
  async getJobStatus(jobId) {
    throw new Error('getJobStatus() must be implemented by subclass');
  }

  /**
   * Update job progress
   * @param {string} jobId - Job ID
   * @param {number} progress - Progress percentage (0-100)
   * @returns {Promise<void>}
   */
  async updateProgress(jobId, progress) {
    throw new Error('updateProgress() must be implemented by subclass');
  }

  /**
   * Mark job as active (being processed)
   * @param {string} jobId - Job ID
   * @returns {Promise<void>}
   */
  async activateJob(jobId) {
    throw new Error('activateJob() must be implemented by subclass');
  }

  /**
   * Complete a job successfully
   * @param {string} jobId - Job ID
   * @param {*} result - Job result
   * @returns {Promise<void>}
   */
  async completeJob(jobId, result) {
    throw new Error('completeJob() must be implemented by subclass');
  }

  /**
   * Fail a job
   * @param {string} jobId - Job ID
   * @param {Error|string} error - Error object or message
   * @returns {Promise<void>}
   */
  async failJob(jobId, error) {
    throw new Error('failJob() must be implemented by subclass');
  }

  /**
   * Retry a failed job
   * @param {string} jobId - Job ID
   * @returns {Promise<void>}
   */
  async retryJob(jobId) {
    throw new Error('retryJob() must be implemented by subclass');
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   * @returns {Promise<Object>} Queue stats
   */
  async getQueueStats(queueName) {
    throw new Error('getQueueStats() must be implemented by subclass');
  }

  /**
   * Get comprehensive metrics for monitoring
   * @param {string} queueName - Optional queue name to filter metrics
   * @returns {Promise<Object>} Metrics object with processing stats and queue state
   */
  async getMetrics(queueName = null) {
    throw new Error('getMetrics() must be implemented by subclass');
  }

  /**
   * Remove a job from queue
   * @param {string} jobId - Job ID
   * @returns {Promise<void>}
   */
  async removeJob(jobId) {
    throw new Error('removeJob() must be implemented by subclass');
  }

  /**
   * Clean up old jobs
   * @param {string} queueName - Queue name
   * @param {number} olderThanMs - Remove jobs older than this (milliseconds)
   * @returns {Promise<number>} Number of jobs removed
   */
  async cleanOldJobs(queueName, olderThanMs) {
    throw new Error('cleanOldJobs() must be implemented by subclass');
  }

  /**
   * Subscribe to job completion events
   * @param {string} queueName - Queue name
   * @param {Function} callback - Callback function (jobId, result)
   */
  onJobCompleted(queueName, callback) {
    throw new Error('onJobCompleted() must be implemented by subclass');
  }

  /**
   * Subscribe to job failure events
   * @param {string} queueName - Queue name
   * @param {Function} callback - Callback function (jobId, error)
   */
  onJobFailed(queueName, callback) {
    throw new Error('onJobFailed() must be implemented by subclass');
  }

  /**
   * Close queue connection
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('close() must be implemented by subclass');
  }
}

module.exports = QueueInterface;
