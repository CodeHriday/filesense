/**
 * In-Memory Queue Implementation
 * 
 * Simple in-memory queue for:
 * - Development/testing without Redis
 * - Fallback when Redis unavailable
 * - Single-process environments
 * 
 * Limitations:
 * - Jobs lost on process restart
 * - Not suitable for multi-server deployments
 * - No persistence
 */

const QueueInterface = require('./QueueInterface');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class MemoryQueue extends QueueInterface {
  constructor() {
    super();
    this.jobs = new Map(); // jobId -> job object
    this.queues = new Map(); // queueName -> array of jobIds
    this.emitter = new EventEmitter();
    
    console.log('⚠️  Using in-memory queue (jobs not persisted, single process only)');
  }

  async addJob(queueName, data, options = {}) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      queueName,
      data,
      options: {
        attempts: options.attempts || 3,
        backoff: options.backoff || { type: 'exponential', delay: 5000 },
        timeout: options.timeout || 1800000, // 30 minutes
        removeOnComplete: options.removeOnComplete || 100,
        removeOnFail: options.removeOnFail || 500,
        ...options
      },
      state: 'waiting',
      progress: 0,
      attemptsMade: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null,
      error: null
    };

    this.jobs.set(jobId, job);

    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    this.queues.get(queueName).push(jobId);

    // Emit job waiting event
    setImmediate(() => {
      this.emitter.emit(`${queueName}:waiting`, jobId, job);
    });

    return jobId;
  }

  async getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return job;
  }

  async getJobStatus(jobId) {
    const job = await this.getJob(jobId);
    return {
      state: job.state,
      progress: job.progress,
      result: job.result,
      error: job.error,
      attemptsMade: job.attemptsMade,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  async updateProgress(jobId, progress) {
    const job = await this.getJob(jobId);
    job.progress = Math.min(100, Math.max(0, progress));
    job.updatedAt = new Date();
    
    this.emitter.emit(`${job.queueName}:progress`, jobId, progress);
  }

  async completeJob(jobId, result) {
    const job = await this.getJob(jobId);
    job.state = 'completed';
    job.progress = 100;
    job.result = result;
    job.updatedAt = new Date();

    this.emitter.emit(`${job.queueName}:completed`, jobId, result);

    // Auto-remove if configured
    if (job.options.removeOnComplete !== false) {
      setTimeout(() => {
        this.removeJob(jobId).catch(err => 
          console.error(`Error removing completed job ${jobId}:`, err)
        );
      }, 5000); // Remove after 5 seconds
    }
  }

  async failJob(jobId, error) {
    const job = await this.getJob(jobId);
    job.attemptsMade++;

    // Check if should retry
    if (job.attemptsMade < job.options.attempts) {
      // Calculate backoff delay
      let delay = 0;
      if (job.options.backoff) {
        if (job.options.backoff.type === 'exponential') {
          delay = job.options.backoff.delay * Math.pow(2, job.attemptsMade - 1);
        } else {
          delay = job.options.backoff.delay;
        }
      }

      job.state = 'delayed';
      job.updatedAt = new Date();

      // Retry after delay
      setTimeout(() => {
        job.state = 'waiting';
        this.emitter.emit(`${job.queueName}:waiting`, jobId, job);
      }, delay);

      console.log(`Job ${jobId} failed, retrying in ${delay}ms (attempt ${job.attemptsMade}/${job.options.attempts})`);
    } else {
      // Max attempts reached
      job.state = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = new Date();

      this.emitter.emit(`${job.queueName}:failed`, jobId, error);

      // Auto-remove if configured
      if (job.options.removeOnFail !== false) {
        setTimeout(() => {
          this.removeJob(jobId).catch(err => 
            console.error(`Error removing failed job ${jobId}:`, err)
          );
        }, 30000); // Remove after 30 seconds
      }
    }
  }

  async retryJob(jobId) {
    const job = await this.getJob(jobId);
    
    if (job.state !== 'failed') {
      throw new Error(`Cannot retry job ${jobId} with state ${job.state}`);
    }

    job.state = 'waiting';
    job.attemptsMade = 0;
    job.error = null;
    job.updatedAt = new Date();

    this.emitter.emit(`${job.queueName}:waiting`, jobId, job);
  }

  async getQueueStats(queueName) {
    const queue = this.queues.get(queueName) || [];
    const jobs = queue.map(id => this.jobs.get(id)).filter(Boolean);

    return {
      waiting: jobs.filter(j => j.state === 'waiting').length,
      active: jobs.filter(j => j.state === 'active').length,
      completed: jobs.filter(j => j.state === 'completed').length,
      failed: jobs.filter(j => j.state === 'failed').length,
      delayed: jobs.filter(j => j.state === 'delayed').length,
      total: jobs.length
    };
  }

  async removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      const queue = this.queues.get(job.queueName);
      if (queue) {
        const index = queue.indexOf(jobId);
        if (index > -1) {
          queue.splice(index, 1);
        }
      }
      this.jobs.delete(jobId);
    }
  }

  async cleanOldJobs(queueName, olderThanMs) {
    const queue = this.queues.get(queueName) || [];
    const cutoffDate = new Date(Date.now() - olderThanMs);
    let removed = 0;

    for (const jobId of [...queue]) {
      const job = this.jobs.get(jobId);
      if (job && job.updatedAt < cutoffDate && 
          (job.state === 'completed' || job.state === 'failed')) {
        await this.removeJob(jobId);
        removed++;
      }
    }

    return removed;
  }

  onJobCompleted(queueName, callback) {
    this.emitter.on(`${queueName}:completed`, callback);
  }

  onJobFailed(queueName, callback) {
    this.emitter.on(`${queueName}:failed`, callback);
  }

  onJobProgress(queueName, callback) {
    this.emitter.on(`${queueName}:progress`, callback);
  }

  onJobWaiting(queueName, callback) {
    this.emitter.on(`${queueName}:waiting`, callback);
  }

  async close() {
    this.emitter.removeAllListeners();
    this.jobs.clear();
    this.queues.clear();
  }
}

module.exports = MemoryQueue;
