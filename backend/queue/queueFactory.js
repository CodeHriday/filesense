/**
 * Queue Factory
 * 
 * Creates appropriate queue implementation based on environment configuration.
 * Enables cloud-agnostic queue usage:
 * 
 * Environment Variables:
 * - QUEUE_TYPE: 'redis' | 'memory' | 'aws' | 'gcp'
 * - REDIS_URL: Redis connection string (for redis type)
 * 
 * Examples:
 * 
 * // Replit (Redis available)
 * QUEUE_TYPE=redis
 * REDIS_URL=redis://...
 * 
 * // Replit (fallback to memory)
 * QUEUE_TYPE=memory
 * 
 * // AWS (future)
 * QUEUE_TYPE=aws
 * AWS_SQS_QUEUE_URL=https://sqs...
 * 
 * // GCP (future)
 * QUEUE_TYPE=gcp
 * GCP_PROJECT_ID=...
 */

const MemoryQueue = require('./MemoryQueue');

let queueInstance = null;

/**
 * Create or get singleton queue instance
 * @returns {QueueInterface} Queue instance
 */
function createQueue() {
  if (queueInstance) {
    return queueInstance;
  }

  const queueType = process.env.QUEUE_TYPE || 'memory';

  console.log(`🔧 Initializing queue (type: ${queueType})...`);

  switch (queueType.toLowerCase()) {
    case 'redis': {
      try {
        const RedisQueue = require('./RedisQueue');
        queueInstance = new RedisQueue(process.env.REDIS_URL);
        console.log('✅ Redis queue initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize Redis queue, falling back to memory:', error.message);
        queueInstance = new MemoryQueue();
      }
      break;
    }

    case 'memory': {
      queueInstance = new MemoryQueue();
      break;
    }

    case 'aws': {
      // Future implementation
      console.warn('⚠️  AWS SQS queue not yet implemented, using memory queue');
      queueInstance = new MemoryQueue();
      // TODO: Implement AWSQueue
      // const AWSQueue = require('./AWSQueue');
      // queueInstance = new AWSQueue(process.env.AWS_SQS_QUEUE_URL);
      break;
    }

    case 'gcp': {
      // Future implementation
      console.warn('⚠️  GCP Cloud Tasks queue not yet implemented, using memory queue');
      queueInstance = new MemoryQueue();
      // TODO: Implement GCPQueue
      // const GCPQueue = require('./GCPQueue');
      // queueInstance = new GCPQueue(process.env.GCP_PROJECT_ID);
      break;
    }

    default: {
      console.warn(`⚠️  Unknown queue type '${queueType}', using memory queue`);
      queueInstance = new MemoryQueue();
    }
  }

  return queueInstance;
}

/**
 * Get current queue instance
 * @returns {QueueInterface} Queue instance
 */
function getQueue() {
  if (!queueInstance) {
    return createQueue();
  }
  return queueInstance;
}

/**
 * Close queue connection
 * @returns {Promise<void>}
 */
async function closeQueue() {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}

module.exports = {
  createQueue,
  getQueue,
  closeQueue
};
