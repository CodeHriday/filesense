const { Queue } = require('bullmq');
const Redis = require('ioredis');
const { systemLogger } = require('../utils/logger');

let redisConnection = null;
let uploadQueue = null;

function createRedisConnection() {
  if (redisConnection) {
    return redisConnection;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      if (times > 3) {
        systemLogger.warn('Redis unavailable after 3 retries, queue functionality disabled');
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 5000
  };

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  redisConnection = new Redis(redisConfig);

  redisConnection.on('connect', () => {
    systemLogger.info('Redis connected for BullMQ upload queue');
  });

  redisConnection.on('error', (err) => {
    if (!err.message.includes('ECONNREFUSED')) {
      systemLogger.error('Redis connection error for upload queue', { error: err.message });
    }
  });

  return redisConnection;
}

function getUploadQueue() {
  if (uploadQueue) {
    return uploadQueue;
  }

  const connection = createRedisConnection();

  uploadQueue = new Queue('file-upload', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: {
        age: 3600,
        count: 1000
      },
      removeOnFail: {
        age: 86400,
        count: 5000
      },
      timeout: 600000
    }
  });

  uploadQueue.on('error', (err) => {
    systemLogger.error('Upload queue error', { error: err.message });
  });

  systemLogger.info('Upload queue initialized');

  return uploadQueue;
}

async function closeQueue() {
  if (uploadQueue) {
    await uploadQueue.close();
    uploadQueue = null;
  }
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}

module.exports = {
  getUploadQueue,
  closeQueue,
  createRedisConnection
};
