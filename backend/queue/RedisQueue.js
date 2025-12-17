/**
 * Redis Queue Implementation using BullMQ
 * 
 * Production-ready queue with:
 * - Job persistence (survives process restarts)
 * - Multi-server support
 * - Automatic retries with exponential backoff
 * - Job priority and rate limiting
 * - Event subscriptions
 * 
 * Cloud-ready: Works with Redis, AWS ElastiCache, GCP Memorystore, Upstash
 */

const QueueInterface = require('./QueueInterface');
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

class RedisQueue extends QueueInterface {
  constructor(redisUrl = process.env.REDIS_URL) {
    super();
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required for RedisQueue');
    }

    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });

    this.queues = new Map(); // queueName -> Queue instance
    this.workers = new Map(); // queueName -> Worker instance

    
  }

  _getQueue(queueName) {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, { 
        connection: this.connection 
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName);
  }

  async addJob(queueName, data, options = {}) {
    const queue = this._getQueue(queueName);
    
    const job = await queue.add(
      options.jobName || 'default',
      data,
      {
        attempts: options.attempts || 3,
        backoff: options.backoff || {
          type: 'exponential',
          delay: 5000
        },
        timeout: options.timeout || 1800000, // 30 minutes
        removeOnComplete: options.removeOnComplete !== undefined 
          ? options.removeOnComplete 
          : { count: 100, age: 86400 }, // Keep last 100 or 1 day
        removeOnFail: options.removeOnFail !== undefined
          ? options.removeOnFail
          : { count: 500, age: 604800 }, // Keep last 500 or 7 days
        priority: options.priority,
        ...options
      }
    );

    return job.id;
  }

  async getJob(jobId) {
    // Need to search across all queues (limitation of BullMQ)
    // In practice, we'd track queue name with job ID
    for (const [queueName, queue] of this.queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        return {
          id: job.id,
          queueName,
          data: job.data,
          state: await job.getState(),
          progress: job.progress,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          returnvalue: job.returnvalue,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn
        };
      }
    }
    throw new Error(`Job ${jobId} not found`);
  }

  async getJobStatus(jobId) {
    const job = await this.getJob(jobId);
    return {
      state: job.state,
      progress: job.progress || 0,
      result: job.returnvalue,
      error: job.failedReason,
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : null
    };
  }

  async updateProgress(jobId, progress) {
    const job = await this.getJob(jobId);
    
    // Get actual BullMQ job to update progress
    for (const queue of this.queues.values()) {
      const bullJob = await queue.getJob(jobId);
      if (bullJob) {
        await bullJob.updateProgress(progress);
        return;
      }
    }
  }

  async activateJob(jobId) {
    // BullMQ automatically marks jobs as active when processing starts
    // This is a no-op for Redis queue, state is managed by BullMQ
    // The job state will be 'active' once the worker picks it up
  }

  async completeJob(jobId, result) {
    // This is typically handled by workers, but can be done manually
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.moveToCompleted(result, null, false);
        return;
      }
    }
    throw new Error(`Job ${jobId} not found`);
  }

  async failJob(jobId, error) {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await job.moveToFailed(new Error(errorMessage), null, false);
        return;
      }
    }
    throw new Error(`Job ${jobId} not found`);
  }

  async retryJob(jobId) {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.retry();
        return;
      }
    }
    throw new Error(`Job ${jobId} not found`);
  }

  async getQueueStats(queueName) {
    const queue = this._getQueue(queueName);
    const counts = await queue.getJobCounts();
    
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0)
    };
  }

  async getMetrics(queueName = null) {
    // For Redis/BullMQ, we don't track historical metrics like MemoryQueue
    // Return zeros for now - can be enhanced with BullMQ metrics later
    const baseMetrics = {
      totalProcessed: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      totalRetries: 0,
      successRate: '0%',
      averageProcessingTimeMs: 0,
      uptimeMs: 0,
      uptimeHuman: 'N/A',
      note: 'Historical metrics not available in Redis mode. Use BullMQ metrics or Bull Board UI.'
    };

    if (queueName) {
      const queueStats = await this.getQueueStats(queueName);
      return {
        ...baseMetrics,
        queue: queueStats
      };
    }

    // Get all queue stats
    const allQueues = {};
    for (const [name] of this.queues) {
      allQueues[name] = await this.getQueueStats(name);
    }

    return {
      ...baseMetrics,
      queues: allQueues
    };
  }

  async removeJob(jobId) {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        return;
      }
    }
  }

  async cleanOldJobs(queueName, olderThanMs) {
    const queue = this._getQueue(queueName);
    
    // Clean completed jobs
    const completedRemoved = await queue.clean(olderThanMs, 100, 'completed');
    
    // Clean failed jobs
    const failedRemoved = await queue.clean(olderThanMs, 100, 'failed');
    
    return completedRemoved.length + failedRemoved.length;
  }

  onJobCompleted(queueName, callback) {
    const queue = this._getQueue(queueName);
    queue.on('completed', (job) => {
      callback(job.id, job.returnvalue);
    });
  }

  onJobFailed(queueName, callback) {
    const queue = this._getQueue(queueName);
    queue.on('failed', (job, error) => {
      callback(job.id, error);
    });
  }

  onJobProgress(queueName, callback) {
    const queue = this._getQueue(queueName);
    queue.on('progress', (job, progress) => {
      callback(job.id, progress);
    });
  }

  async close() {
    // Close all workers
    for (const worker of this.workers.values()) {
      await worker.close();
    }

    // Close all queues
    for (const queue of this.queues.values()) {
      await queue.close();
    }

    // Close Redis connection
    await this.connection.quit();

    this.queues.clear();
    this.workers.clear();
  }
}

module.exports = RedisQueue;
