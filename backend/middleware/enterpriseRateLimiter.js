/**
 * Enterprise Rate Limiting Middleware
 * 
 * Provides per-user rate limiting with:
 * - Redis-backed sliding window counters
 * - Memory fallback for single-instance deployments
 * - Different limits for different endpoint types
 * - User tier support (basic, premium, enterprise)
 * - Graceful degradation on Redis failures
 */

const { systemLogger } = require('../utils/logger');

// Try to use Redis, fall back to in-memory
let redisClient = null;
let useRedis = false;

try {
  const redis = require('../redis');
  if (redis && redis.getClient) {
    redisClient = redis.getClient();
    useRedis = !!redisClient;
  }
} catch (e) {
  systemLogger?.debug?.('Redis not available for rate limiting, using in-memory');
}

// In-memory rate limit store (fallback)
const memoryStore = new Map();

// Rate limit configurations by endpoint type
const RATE_LIMITS = {
  // API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many API requests. Please try again later.'
  },
  // File upload endpoints
  upload: {
    windowMs: 60 * 1000,
    max: 20, // 20 uploads per minute
    message: 'Too many upload requests. Please wait before uploading more files.'
  },
  // Search/query endpoints
  search: {
    windowMs: 60 * 1000,
    max: 50, // 50 searches per minute
    message: 'Too many search requests. Please slow down.'
  },
  // Bulk operations
  bulk: {
    windowMs: 60 * 1000,
    max: 10, // 10 bulk operations per minute
    message: 'Too many bulk operations. Please wait.'
  },
  // Export operations
  export: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // 5 exports per 5 minutes
    message: 'Export rate limit reached. Please wait before exporting again.'
  }
};

// User tier multipliers
const TIER_MULTIPLIERS = {
  basic: 1.0,
  premium: 2.0,
  enterprise: 5.0,
  admin: 10.0
};

/**
 * Get rate limit key for a request
 */
function getRateLimitKey(req, endpointType) {
  const userId = req.user?.id || 'anonymous';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  
  // Use user ID if authenticated, otherwise use IP
  const identifier = req.user ? `user:${userId}` : `ip:${ip}`;
  
  return `ratelimit:${endpointType}:${identifier}`;
}

/**
 * Get current window timestamp (floored to window boundary)
 */
function getWindowTimestamp(windowMs) {
  return Math.floor(Date.now() / windowMs) * windowMs;
}

/**
 * Check and increment rate limit counter (Redis)
 */
async function checkRateLimitRedis(key, limit, windowMs) {
  try {
    const windowTs = getWindowTimestamp(windowMs);
    const windowKey = `${key}:${windowTs}`;
    
    const multi = redisClient.multi();
    multi.incr(windowKey);
    multi.expire(windowKey, Math.ceil(windowMs / 1000) + 1);
    
    const results = await multi.exec();
    const count = results[0][1]; // Get count from first command result
    
    return {
      allowed: count <= limit,
      current: count,
      remaining: Math.max(0, limit - count),
      resetMs: windowMs - (Date.now() - windowTs)
    };
  } catch (error) {
    systemLogger?.error?.('Redis rate limit error', { key, error: error.message });
    // Fall back to allowing the request on Redis failure
    return { allowed: true, current: 0, remaining: limit, resetMs: windowMs };
  }
}

/**
 * Check and increment rate limit counter (Memory)
 */
function checkRateLimitMemory(key, limit, windowMs) {
  const windowTs = getWindowTimestamp(windowMs);
  const windowKey = `${key}:${windowTs}`;
  const now = Date.now();
  
  // Clean up old entries periodically
  if (memoryStore.size > 10000) {
    for (const [k, v] of memoryStore) {
      if (v.expiry < now) {
        memoryStore.delete(k);
      }
    }
  }
  
  const entry = memoryStore.get(windowKey);
  
  if (!entry || entry.expiry < now) {
    // New window
    memoryStore.set(windowKey, {
      count: 1,
      expiry: now + windowMs
    });
    return {
      allowed: true,
      current: 1,
      remaining: limit - 1,
      resetMs: windowMs
    };
  }
  
  // Increment existing window
  entry.count++;
  
  return {
    allowed: entry.count <= limit,
    current: entry.count,
    remaining: Math.max(0, limit - entry.count),
    resetMs: entry.expiry - now
  };
}

/**
 * Check rate limit (uses Redis or memory)
 */
async function checkRateLimit(key, limit, windowMs) {
  if (useRedis && redisClient) {
    return checkRateLimitRedis(key, limit, windowMs);
  }
  return checkRateLimitMemory(key, limit, windowMs);
}

/**
 * Get user's tier for rate limit multiplier
 */
function getUserTier(user) {
  if (!user) return 'basic';
  // Check for admin-level access using permission-based check
  const { userHasAdminAccess } = require('../utils/permissionHelpers');
  if (userHasAdminAccess(user)) return 'admin';
  if (user.tier) return user.tier;
  if (user.subscription === 'enterprise') return 'enterprise';
  if (user.subscription === 'premium') return 'premium';
  return 'basic';
}

/**
 * Create rate limiter middleware for specific endpoint type
 */
function createRateLimiter(endpointType = 'api', options = {}) {
  const config = RATE_LIMITS[endpointType] || RATE_LIMITS.api;
  const {
    windowMs = config.windowMs,
    max = config.max,
    message = config.message,
    skipCondition = null,
    keyGenerator = null
  } = options;

  return async (req, res, next) => {
    // Skip rate limiting for specific conditions
    if (skipCondition && skipCondition(req)) {
      return next();
    }

    // Skip rate limiting in development if configured
    if (process.env.SKIP_RATE_LIMIT === 'true') {
      return next();
    }

    // Generate rate limit key
    const key = keyGenerator 
      ? keyGenerator(req) 
      : getRateLimitKey(req, endpointType);

    // Get user tier multiplier
    const tier = getUserTier(req.user);
    const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
    const adjustedMax = Math.floor(max * multiplier);

    // Check rate limit
    const result = await checkRateLimit(key, adjustedMax, windowMs);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', adjustedMax);
    res.set('X-RateLimit-Remaining', result.remaining);
    res.set('X-RateLimit-Reset', Math.ceil(Date.now() + result.resetMs));
    res.set('X-RateLimit-Tier', tier);

    if (!result.allowed) {
      res.set('Retry-After', Math.ceil(result.resetMs / 1000));
      
      systemLogger?.warn?.('Rate limit exceeded', {
        key,
        endpointType,
        current: result.current,
        limit: adjustedMax,
        tier,
        path: req.path,
        userId: req.user?.id
      });

      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: Math.ceil(result.resetMs / 1000),
        limit: adjustedMax,
        current: result.current
      });
    }

    next();
  };
}

/**
 * Global rate limiter (applies to all requests)
 */
function globalRateLimiter(options = {}) {
  return createRateLimiter('api', options);
}

/**
 * Upload rate limiter
 */
function uploadRateLimiter(options = {}) {
  return createRateLimiter('upload', options);
}

/**
 * Search rate limiter
 */
function searchRateLimiter(options = {}) {
  return createRateLimiter('search', options);
}

/**
 * Bulk operation rate limiter
 */
function bulkRateLimiter(options = {}) {
  return createRateLimiter('bulk', options);
}

/**
 * Export rate limiter
 */
function exportRateLimiter(options = {}) {
  return createRateLimiter('export', options);
}

/**
 * Get rate limit stats for monitoring
 */
function getRateLimitStats() {
  return {
    type: useRedis ? 'redis' : 'memory',
    memoryStoreSize: memoryStore.size,
    redisConnected: useRedis,
    configs: RATE_LIMITS,
    tierMultipliers: TIER_MULTIPLIERS
  };
}

/**
 * Clear rate limit for a specific user (admin action)
 */
async function clearUserRateLimit(userId) {
  const pattern = `ratelimit:*:user:${userId}:*`;
  
  try {
    if (useRedis && redisClient) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
    
    // Also clear from memory store
    for (const key of memoryStore.keys()) {
      if (key.includes(`user:${userId}`)) {
        memoryStore.delete(key);
      }
    }
    
    systemLogger?.info?.('Rate limit cleared for user', { userId });
    return true;
  } catch (error) {
    systemLogger?.error?.('Error clearing rate limit', { userId, error: error.message });
    return false;
  }
}

module.exports = {
  createRateLimiter,
  globalRateLimiter,
  uploadRateLimiter,
  searchRateLimiter,
  bulkRateLimiter,
  exportRateLimiter,
  getRateLimitStats,
  clearUserRateLimit,
  RATE_LIMITS,
  TIER_MULTIPLIERS
};
