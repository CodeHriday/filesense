/**
 * Enterprise Response Caching Middleware
 * 
 * Provides intelligent API response caching with:
 * - Redis-backed caching for distributed environments
 * - In-memory fallback for single-instance deployments
 * - Smart cache invalidation based on entity changes
 * - Per-route cache configuration
 * - User-scoped caching for personalized data
 */

const { systemLogger } = require('../utils/logger');

// Try to use Redis, fall back to in-memory
let redisClient = null;
let useRedis = false;

const redis = require('../redis');

redisClient = redis?.getClient?.() || null;
useRedis = !!redisClient;

if (!useRedis) {
  systemLogger?.debug?.('Redis not available for caching, using in-memory');
}

// In-memory cache fallback
const memoryCache = new Map();
const memoryCacheExpiry = new Map();
const MAX_MEMORY_CACHE_SIZE = 1000;

// Cache configuration per route pattern
const CACHE_CONFIG = {
  // Dashboard and stats - aggressive caching
  '/api/jobs/stats': { ttl: 60, scope: 'global' },
  '/api/dashboard': { ttl: 30, scope: 'user' },
  '/api/files/stats': { ttl: 60, scope: 'global' },
  
  // List endpoints - moderate caching
  '/api/jobs': { ttl: 15, scope: 'user' },
  '/api/jobs/v2': { ttl: 15, scope: 'user' },
  '/api/files': { ttl: 30, scope: 'user' },
  '/api/mappings': { ttl: 60, scope: 'user' },
  '/api/projects': { ttl: 120, scope: 'user' },
  
  // Reference data - long caching
  '/api/governance-tags': { ttl: 300, scope: 'global' },
  '/api/quality-rules': { ttl: 300, scope: 'global' }
};

// Entity to cache key mapping for invalidation
const ENTITY_CACHE_PATTERNS = {
  'job': ['/api/jobs', '/api/dashboard'],
  'file': ['/api/files', '/api/dashboard'],
  'mapping': ['/api/mappings', '/api/jobs'],
  'project': ['/api/projects'],
  'tag': ['/api/governance-tags'],
  'rule': ['/api/quality-rules']
};

/**
 * Generate cache key for a request
 */
function generateCacheKey(req, config) {
  const basePath = req.originalUrl.split('?')[0];
  const queryString = JSON.stringify(req.query);
  
  if (config.scope === 'user' && req.user?.id) {
    return `cache:${req.user.id}:${basePath}:${queryString}`;
  }
  
  return `cache:global:${basePath}:${queryString}`;
}

/**
 * Get matching cache config for a route
 */
function getCacheConfig(path) {
  for (const [pattern, config] of Object.entries(CACHE_CONFIG)) {
    if (path.startsWith(pattern)) {
      return config;
    }
  }
  return null;
}

/**
 * Set value in cache (Redis or memory)
 */
async function setCache(key, value, ttlSeconds) {
  try {
    if (useRedis && redisClient) {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
    } else {
      // Memory cache with size limit
      if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
        // Remove oldest entries
        const keysToDelete = Array.from(memoryCache.keys()).slice(0, 100);
        keysToDelete.forEach(k => {
          memoryCache.delete(k);
          memoryCacheExpiry.delete(k);
        });
      }
      
      memoryCache.set(key, value);
      memoryCacheExpiry.set(key, Date.now() + (ttlSeconds * 1000));
    }
  } catch (error) {
    systemLogger?.error?.('Cache set error', { key, error: error.message });
  }
}

/**
 * Get value from cache (Redis or memory)
 */
async function getCache(key) {
  try {
    if (useRedis && redisClient) {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } else {
      const expiry = memoryCacheExpiry.get(key);
      if (expiry && expiry > Date.now()) {
        return memoryCache.get(key);
      }
      // Expired, clean up
      memoryCache.delete(key);
      memoryCacheExpiry.delete(key);
      return null;
    }
  } catch (error) {
    systemLogger?.debug?.('Cache get error', { key, error: error.message });
    return null;
  }
}

/**
 * Delete cache entries matching a pattern
 */
async function invalidateCache(pattern) {
  try {
    if (useRedis && redisClient) {
      const keys = await redisClient.keys(`cache:*:${pattern}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } else {
      for (const key of memoryCache.keys()) {
        if (key.includes(pattern)) {
          memoryCache.delete(key);
          memoryCacheExpiry.delete(key);
        }
      }
    }
  } catch (error) {
    systemLogger?.error?.('Cache invalidation error', { pattern, error: error.message });
  }
}

/**
 * Invalidate cache for a specific entity
 */
async function invalidateEntityCache(entityType, entityId = null) {
  const patterns = ENTITY_CACHE_PATTERNS[entityType] || [];
  for (const pattern of patterns) {
    await invalidateCache(pattern);
  }
  systemLogger?.debug?.('Invalidated cache for entity', { entityType, entityId, patterns });
}

/**
 * Response caching middleware
 * Caches GET responses based on route configuration
 */
function responseCacheMiddleware(options = {}) {
  const { 
    defaultTtl = 60,
    skipCondition = null 
  } = options;

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching for specific conditions
    if (skipCondition && skipCondition(req)) {
      return next();
    }

    // Skip if no-cache header
    if (req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    const config = getCacheConfig(req.path) || { ttl: defaultTtl, scope: 'global' };
    const cacheKey = generateCacheKey(req, config);

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', cacheKey.substring(0, 50));
      return res.json(cached);
    }

    // Capture the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setCache(cacheKey, body, config.ttl).catch(() => {});
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Cache invalidation middleware for mutating requests
 * Automatically invalidates related caches after POST/PUT/DELETE
 */
function cacheInvalidationMiddleware() {
  return async (req, res, next) => {
    // Only process mutating requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Capture original end
    const originalEnd = res.end.bind(res);
    
    res.end = async function(chunk, encoding) {
      // Only invalidate on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Determine entity type from path
        const pathParts = req.path.split('/').filter(Boolean);
        if (pathParts.length >= 2) {
          const entityType = pathParts[1]; // e.g., 'jobs', 'files', etc.
          const singularType = entityType.replace(/s$/, '');
          
          // Invalidate related caches
          invalidateEntityCache(singularType).catch(() => {});
        }
      }
      
      return originalEnd(chunk, encoding);
    };

    next();
  };
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    type: useRedis ? 'redis' : 'memory',
    memoryCacheSize: memoryCache.size,
    maxMemoryCacheSize: MAX_MEMORY_CACHE_SIZE,
    redisConnected: useRedis
  };
}

/**
 * Clear all cache
 */
async function clearAllCache() {
  try {
    if (useRedis && redisClient) {
      const keys = await redisClient.keys('cache:*');
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
    memoryCache.clear();
    memoryCacheExpiry.clear();
    systemLogger?.info?.('All cache cleared');
  } catch (error) {
    systemLogger?.error?.('Error clearing cache', { error: error.message });
  }
}

module.exports = {
  responseCacheMiddleware,
  cacheInvalidationMiddleware,
  invalidateCache,
  invalidateEntityCache,
  getCacheStats,
  clearAllCache,
  setCache,
  getCache,
  CACHE_CONFIG
};
