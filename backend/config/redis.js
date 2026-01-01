/**
 * Redis configuration and utility module for caching
 * With in-memory fallback when Redis is unavailable
 */
const Redis = require('ioredis');
const NodeCache = require('node-cache');

// In-memory fallback cache (used when Redis is unavailable)
const memoryCache = new NodeCache({
  stdTTL: 600, // Default 10 minutes
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false // Better performance
});

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
 * Cache utility functions with graceful Redis degradation and in-memory fallback
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
   * Get cached value (uses Redis if available, falls back to memory cache)
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    // Try Redis first if available
    if (this.isAvailable()) {
      try {
        const value = await redis.get(key);
        if (value) {
          return JSON.parse(value);
        }
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error(`Error getting cache key ${key}:`, error);
        }
        // Fall through to memory cache
      }
    }
    
    // Fallback to in-memory cache
    const memValue = memoryCache.get(key);
    return memValue !== undefined ? memValue : null;
  },

  /**
   * Set cache value with TTL (uses Redis if available, always stores in memory)
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 600 = 10 minutes)
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = 600) {
    // Always store in memory cache as fallback
    memoryCache.set(key, value, ttl);
    
    // Also store in Redis if available
    if (this.isAvailable()) {
      try {
        await redis.setex(key, ttl, JSON.stringify(value));
        return true;
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error(`Error setting cache key ${key}:`, error);
        }
        // Still return true since we stored in memory
      }
    }
    return true;
  },

  /**
   * Delete cache key(s)
   * @param {string|string[]} keys - Key or array of keys to delete
   * @returns {Promise<number>} Number of keys deleted
   */
  async del(keys) {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    
    // Delete from memory cache
    keysArray.forEach(key => memoryCache.del(key));
    
    // Delete from Redis if available
    if (this.isAvailable()) {
      try {
        return await redis.del(...keysArray);
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error('Error deleting cache keys:', error);
        }
      }
    }
    return keysArray.length;
  },

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'user:*:permissions')
   * @returns {Promise<number>} Number of keys deleted
   */
  async delPattern(pattern) {
    let deleted = 0;
    
    // Delete from memory cache using pattern matching
    const memKeys = memoryCache.keys();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    memKeys.forEach(key => {
      if (regex.test(key)) {
        memoryCache.del(key);
        deleted++;
      }
    });
    
    // Delete from Redis if available
    if (this.isAvailable()) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          return await redis.del(...keys);
        }
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error(`Error deleting cache pattern ${pattern}:`, error);
        }
      }
    }
    return deleted;
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async exists(key) {
    // Check Redis first if available
    if (this.isAvailable()) {
      try {
        const result = await redis.exists(key);
        if (result === 1) return true;
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error(`Error checking cache key ${key}:`, error);
        }
        // Fall through to memory cache
      }
    }
    
    // Fallback to memory cache
    return memoryCache.has(key);
  },

  /**
   * Get remaining TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
   */
  async ttl(key) {
    if (this.isAvailable()) {
      try {
        return await redis.ttl(key);
      } catch (error) {
        if (error.message !== 'Connection is closed.') {
          console.error(`Error getting TTL for key ${key}:`, error);
        }
      }
    }
    
    // For memory cache, get TTL
    const ttl = memoryCache.getTtl(key);
    if (ttl === undefined) return -2;
    if (ttl === 0) return -1;
    return Math.ceil((ttl - Date.now()) / 1000);
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
  },

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    return {
      redisAvailable: this.isAvailable(),
      memoryCacheKeys: memoryCache.keys().length,
      memoryCacheStats: memoryCache.getStats()
    };
  }
};

module.exports = {
  redis,
  cache
};
