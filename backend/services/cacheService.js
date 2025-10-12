/**
 * Multi-Layer Cache Service
 * 
 * Provides a caching layer with Redis support and in-memory fallback:
 * - Uses Redis if REDIS_URL is configured (cloud production)
 * - Falls back to in-memory cache (Replit development)
 * - Supports TTL (time-to-live) for automatic expiration
 * - Cloud-agnostic: works with AWS ElastiCache, GCP Memorystore, Azure Cache
 */

const { systemLogger } = require('../utils/logger');
const NodeCache = require('node-cache');

class CacheService {
  constructor() {
    this.cacheType = null;
    this.redisClient = null;
    this.memoryCache = null;
    this.isReady = false;
  }

  async initialize() {
    try {
      // Try Redis first (if REDIS_URL is provided)
      if (process.env.REDIS_URL) {
        await this._initializeRedis();
      } else {
        // Fallback to in-memory cache
        this._initializeMemoryCache();
      }

      this.isReady = true;
      return { success: true, type: this.cacheType };

    } catch (error) {
      // If Redis fails, fallback to memory cache
      systemLogger?.warn?.('Redis initialization failed, falling back to memory cache', {
        error: error.message
      });
      this._initializeMemoryCache();
      this.isReady = true;
      return { success: true, type: this.cacheType };
    }
  }

  async _initializeRedis() {
    const { createClient } = require('redis');

    this.redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            systemLogger?.error?.('Redis connection failed after 3 retries, switching to memory cache');
            return new Error('Max reconnect attempts reached');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    this.redisClient.on('error', (err) => {
      systemLogger?.error?.('Redis client error', { error: err.message });
    });

    await this.redisClient.connect();
    
    this.cacheType = 'redis';
    console.log('✅ Cache: Using Redis');
    systemLogger?.info?.('Cache service initialized with Redis');
  }

  _initializeMemoryCache() {
    // In-memory cache with automatic cleanup
    this.memoryCache = new NodeCache({
      stdTTL: 300, // Default 5 minutes
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false // Better performance
    });

    this.cacheType = 'memory';
    console.log('ℹ️  Cache: Using in-memory (fallback)');
    systemLogger?.info?.('Cache service initialized with in-memory cache');
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null if not found
   */
  async get(key) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        return this.memoryCache.get(key) || null;
      }
    } catch (error) {
      systemLogger?.error?.('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  async set(key, value, ttl = 300) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      } else {
        this.memoryCache.set(key, value, ttl);
      }
    } catch (error) {
      systemLogger?.error?.('Cache set error', { key, error: error.message });
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        await this.redisClient.del(key);
      } else {
        this.memoryCache.del(key);
      }
    } catch (error) {
      systemLogger?.error?.('Cache delete error', { key, error: error.message });
    }
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'files:*')
   */
  async delPattern(pattern) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } else {
        // Memory cache: delete all keys matching pattern
        const keys = this.memoryCache.keys();
        // Replace all * with .* for proper regex matching
        const regexPattern = '^' + pattern.replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexPattern);
        const matchedKeys = keys.filter(key => regex.test(key));
        matchedKeys.forEach(key => {
          this.memoryCache.del(key);
        });
        systemLogger?.debug?.('Cache pattern invalidation', { 
          pattern, 
          matchedKeys: matchedKeys.length 
        });
      }
    } catch (error) {
      systemLogger?.error?.('Cache delete pattern error', { pattern, error: error.message });
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        return await this.redisClient.exists(key) === 1;
      } else {
        return this.memoryCache.has(key);
      }
    } catch (error) {
      systemLogger?.error?.('Cache exists error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        const info = await this.redisClient.info('stats');
        const keys = await this.redisClient.dbSize();
        
        return {
          type: 'redis',
          keys,
          info: info.split('\r\n').reduce((acc, line) => {
            const [key, value] = line.split(':');
            if (key && value) acc[key] = value;
            return acc;
          }, {})
        };
      } else {
        const stats = this.memoryCache.getStats();
        return {
          type: 'memory',
          keys: stats.keys,
          hits: stats.hits,
          misses: stats.misses,
          hitRate: stats.hits / (stats.hits + stats.misses) || 0
        };
      }
    } catch (error) {
      systemLogger?.error?.('Cache stats error', { error: error.message });
      return { type: this.cacheType, error: error.message };
    }
  }

  /**
   * Clear all cache entries
   */
  async flush() {
    if (!this.isReady) {
      await this.initialize();
    }

    try {
      if (this.cacheType === 'redis') {
        await this.redisClient.flushDb();
      } else {
        this.memoryCache.flushAll();
      }
      systemLogger?.info?.('Cache flushed');
    } catch (error) {
      systemLogger?.error?.('Cache flush error', { error: error.message });
    }
  }

  /**
   * Close cache connection (for graceful shutdown)
   */
  async close() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      if (this.memoryCache) {
        this.memoryCache.close();
      }
      this.isReady = false;
      systemLogger?.info?.('Cache service closed');
    } catch (error) {
      systemLogger?.error?.('Cache close error', { error: error.message });
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
