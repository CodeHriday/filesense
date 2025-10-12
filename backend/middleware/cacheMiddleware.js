/**
 * Cache Middleware
 * 
 * Automatic response caching for GET endpoints:
 * - Caches successful GET responses
 * - Configurable TTL per route
 * - Automatic cache invalidation on POST/PUT/DELETE
 * - Cache key based on URL and query parameters
 */

const cacheService = require('../services/cacheService');
const { systemLogger } = require('../utils/logger');

/**
 * Generate cache key from request
 * @param {object} req - Express request object
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
  const baseKey = req.originalUrl || req.url;
  // Include user ID if authenticated (for user-specific caching)
  const userId = req.user?.id || 'anonymous';
  return `cache:${userId}:${baseKey}`;
}

/**
 * Cache middleware factory
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {Function} Express middleware
 */
function cacheMiddleware(ttl = 300) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Check if cached response exists
      const cachedResponse = await cacheService.get(cacheKey);
      
      if (cachedResponse) {
        // Cache hit
        systemLogger?.debug?.('Cache hit', { key: cacheKey });
        
        // Set cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        
        return res.status(cachedResponse.status).json(cachedResponse.data);
      }

      // Cache miss - intercept response
      systemLogger?.debug?.('Cache miss', { key: cacheKey });
      res.set('X-Cache', 'MISS');

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function(data) {
        // Only cache successful responses (2xx status codes)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, {
            status: res.statusCode,
            data: data
          }, ttl).catch(err => {
            systemLogger?.error?.('Failed to cache response', { 
              key: cacheKey, 
              error: err.message 
            });
          });
        }

        // Call original json method
        return originalJson(data);
      };

      next();

    } catch (error) {
      // On error, skip caching and continue
      systemLogger?.error?.('Cache middleware error', { 
        key: cacheKey, 
        error: error.message 
      });
      next();
    }
  };
}

/**
 * Cache invalidation middleware
 * Automatically invalidates cache on POST/PUT/DELETE requests
 * @param {string} pattern - Cache key pattern to invalidate (e.g., 'cache:*:files*')
 */
function invalidateCache(pattern) {
  return async (req, res, next) => {
    // Only invalidate on write operations
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      try {
        await cacheService.delPattern(pattern);
        systemLogger?.info?.('Cache invalidated', { pattern, method: req.method });
      } catch (error) {
        systemLogger?.error?.('Cache invalidation error', { 
          pattern, 
          error: error.message 
        });
      }
    }
    next();
  };
}

/**
 * Manual cache invalidation helper
 * Use this to invalidate specific cache entries programmatically
 * @param {string} key - Cache key or pattern to invalidate
 */
async function invalidate(key) {
  try {
    if (key.includes('*')) {
      await cacheService.delPattern(key);
    } else {
      await cacheService.del(key);
    }
    systemLogger?.info?.('Cache manually invalidated', { key });
  } catch (error) {
    systemLogger?.error?.('Manual cache invalidation error', { 
      key, 
      error: error.message 
    });
  }
}

module.exports = {
  cacheMiddleware,
  invalidateCache,
  invalidate,
  generateCacheKey
};
