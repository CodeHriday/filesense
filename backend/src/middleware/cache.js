/**
 * Response caching middleware for API endpoints
 * Uses Redis with in-memory fallback for caching frequently accessed data
 */
const { cache } = require('../../config/redis');
const NodeCache = require('node-cache');

const memoryCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

/**
 * Create a caching middleware for API responses
 * @param {Object} options - Caching options
 * @param {number} options.ttl - Time to live in seconds (default: 300)
 * @param {Function} options.keyGenerator - Function to generate cache key from req
 * @param {Function} options.shouldCache - Function to determine if response should be cached
 * @returns {Function} Express middleware
 */
function createCacheMiddleware(options = {}) {
  const {
    ttl = 300,
    keyGenerator = (req) => `${req.method}:${req.originalUrl}`,
    shouldCache = (req, res) => res.statusCode === 200
  } = options;

  return async (req, res, next) => {
    const cacheKey = keyGenerator(req);

    try {
      let cachedData = await cache.get(cacheKey);
      
      if (!cachedData) {
        cachedData = memoryCache.get(cacheKey);
      }

      if (cachedData) {
        res.set('X-Cache', 'HIT');
        return res.json(cachedData);
      }

      res.set('X-Cache', 'MISS');

      const originalJson = res.json.bind(res);
      res.json = function(data) {
        if (shouldCache(req, res)) {
          cache.set(cacheKey, data, ttl).catch(err => {
            console.error('Error caching response:', err);
          });
          
          memoryCache.set(cacheKey, data, ttl);
        }
        
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Cache key pattern to invalidate (supports * wildcard)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateCachePattern(pattern) {
  try {
    const count = await cache.delPattern(pattern);
    
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = pattern.split('*').map(escapeRegex).join('.*');
    const regex = new RegExp(`^${regexPattern}$`);
    
    const memKeys = memoryCache.keys().filter(key => regex.test(key));
    memoryCache.del(memKeys);
    
    return count + memKeys.length;
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return 0;
  }
}

/**
 * Clear all cache
 * @returns {Promise<void>}
 */
async function clearAllCache() {
  try {
    await cache.delPattern('*');
    memoryCache.flushAll();
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Invalidate dashboard metrics cache for specific user or all users
 * @param {number|null} userId - User ID (null to invalidate all users)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateDashboardCache(userId = null) {
  const pattern = userId 
    ? `dashboard:metrics:user:${userId}:*` 
    : 'dashboard:metrics:*';
  return await invalidateCachePattern(pattern);
}

/**
 * Invalidate file catalog cache
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateFileCatalogCache() {
  return await invalidateCachePattern('GET:/api/files*');
}

/**
 * Invalidate user data cache
 * @param {number|null} userId - User ID (null to invalidate all users)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateUserDataCache(userId = null) {
  const pattern = userId 
    ? `GET:/api/users/${userId}*` 
    : 'GET:/api/users*';
  return await invalidateCachePattern(pattern);
}

/**
 * Invalidate project-related caches
 * @param {number|null} projectId - Project ID (null to invalidate all projects)
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateProjectCache(projectId = null) {
  const pattern = projectId 
    ? `*:project:${projectId}:*` 
    : '*:project:*';
  return await invalidateCachePattern(pattern);
}

module.exports = {
  createCacheMiddleware,
  invalidateCachePattern,
  clearAllCache,
  invalidateDashboardCache,
  invalidateFileCatalogCache,
  invalidateUserDataCache,
  invalidateProjectCache
};
