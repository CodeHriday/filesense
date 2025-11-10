/**
 * Redis configuration and utility module for caching
 */
const Redis = require('ioredis');

// Create Redis client with connection pooling
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy(times) {
    // Exponential backoff with cap - never give up, keep retrying
    const delay = Math.min(times * 100, 10000); // Max 10 seconds between retries
    return delay;
  },
  maxRetriesPerRequest: null, // Don't limit retries per request
  enableReadyCheck: true,
  lazyConnect: false,
  showFriendlyErrorStack: false,
  enableOfflineQueue: false // Don't queue commands when disconnected
});

let redisAvailable = false;

// Handle connection events
redis.on('connect', () => {
  console.log('Redis client connected');
  redisAvailable = true;
});

redis.on('ready', () => {
  console.log('Redis client ready');
  redisAvailable = true;
});

redis.on('error', (err) => {
  redisAvailable = false;
  // Silently handle connection refused (Redis not running)
  if (err.code !== 'ECONNREFUSED') {
    console.error('Redis client error:', err);
  }
});

redis.on('close', () => {
  redisAvailable = false;
});

redis.on('reconnecting', () => {
  console.log('Redis client reconnecting...');
});

/**
 * Cache utility functions with graceful Redis degradation
 */
const cache = {
  /**
   * Check if Redis is available
   * @returns {boolean} True if Redis is connected and ready
   */
  isAvailable() {
    return redisAvailable && redis.status === 'ready';
  },

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    if (!this.isAvailable()) {
      return null;
    }
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      if (error.message !== 'Connection is closed.') {
        console.error(`Error getting cache key ${key}:`, error);
      }
      return null;
    }
  },

  /**
   * Set cache value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 600 = 10 minutes)
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = 600) {
    if (!this.isAvailable()) {
      return false;
    }
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      if (error.message !== 'Connection is closed.') {
        console.error(`Error setting cache key ${key}:`, error);
      }
      return false;
    }
  },

  /**
   * Delete cache key(s)
   * @param {string|string[]} keys - Key or array of keys to delete
   * @returns {Promise<number>} Number of keys deleted
   */
  async del(keys) {
    if (!this.isAvailable()) {
      return 0;
    }
    try {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      return await redis.del(...keysArray);
    } catch (error) {
      if (error.message !== 'Connection is closed.') {
        console.error('Error deleting cache keys:', error);
      }
      return 0;
    }
  },

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'user:*:permissions')
   * @returns {Promise<number>} Number of keys deleted
   */
  async delPattern(pattern) {
    if (!this.isAvailable()) {
      return 0;
    }
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        return await redis.del(...keys);
      }
      return 0;
    } catch (error) {
      if (error.message !== 'Connection is closed.') {
        console.error(`Error deleting cache pattern ${pattern}:`, error);
      }
      return 0;
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async exists(key) {
    if (!this.isAvailable()) {
      return false;
    }
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      if (error.message !== 'Connection is closed.') {
        console.error(`Error checking cache key ${key}:`, error);
      }
      return false;
    }
  },

  /**
   * Get remaining TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
   */
  async ttl(key) {
    if (!this.isAvailable()) {
      return -2;
    }
    try {
      return await redis.ttl(key);
    } catch (error) {
      if (error.message !== 'Connection is closed.') {
        console.error(`Error getting TTL for key ${key}:`, error);
      }
      return -2;
    }
  },

  /**
   * Invalidate permissions cache for roles containing a specific role
   * @param {string} roleName - Role name
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateRolePermissions(roleName) {
    return await this.delPattern(`permissions:roles:*${roleName}*`);
  },

  /**
   * Invalidate all permission caches
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateAllPermissions() {
    return await this.delPattern('permissions:roles:*');
  }
};

module.exports = {
  redis,
  cache
};
