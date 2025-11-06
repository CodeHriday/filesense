/**
 * Idempotency middleware for preventing duplicate API requests
 * Supports the Idempotency-Key header for safe retries
 */

const crypto = require('crypto');

/**
 * Creates an idempotency middleware for specific endpoints
 * @param {Object} options - Configuration options
 * @param {number} options.ttlHours - Time to live in hours (default: 24)
 * @param {string} options.resourceType - Type of resource being created
 * @returns {Function} Express middleware
 */
function createIdempotencyMiddleware(options = {}) {
  const {
    ttlHours = 24,
    resourceType = 'unknown'
  } = options;

  return async (req, res, next) => {
    const idempotencyKey = req.headers['idempotency-key'];
    
    if (!idempotencyKey) {
      return next();
    }

    if (idempotencyKey.length > 255) {
      return res.status(400).json({
        error: 'Invalid idempotency key',
        message: 'Idempotency-Key header must be 255 characters or less'
      });
    }

    const pool = req.app.locals.pool || req.app.get('db');
    const userId = req.user?.id;

    try {
      const existingRequest = await pool.query(`
        SELECT id, resource_id, response_status, response_body, created_at
        FROM idempotency_keys
        WHERE key = $1 AND user_id = $2 AND expires_at > NOW()
      `, [idempotencyKey, userId]);

      if (existingRequest.rows.length > 0) {
        const cached = existingRequest.rows[0];
        
        console.log('Idempotency key hit:', {
          key: idempotencyKey.substring(0, 8) + '...',
          resourceType,
          userId,
          cachedAt: cached.created_at
        });

        res.set('X-Idempotency-Hit', 'true');
        res.set('X-Idempotency-Created-At', cached.created_at.toISOString());
        
        return res.status(cached.response_status).json(cached.response_body);
      }

      const originalJson = res.json.bind(res);
      let responseData = null;
      let responseStatus = null;

      res.json = function(data) {
        responseData = data;
        responseStatus = res.statusCode;

        if (responseStatus >= 200 && responseStatus < 300) {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + ttlHours);

          const resourceId = data?.id || data?.data?.id || null;

          pool.query(`
            INSERT INTO idempotency_keys (key, resource_type, resource_id, response_status, response_body, expires_at, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (key) DO UPDATE SET
              response_status = EXCLUDED.response_status,
              response_body = EXCLUDED.response_body
          `, [idempotencyKey, resourceType, resourceId, responseStatus, JSON.stringify(data), expiresAt, userId])
          .catch(err => {
            console.error('Error storing idempotency key:', err);
          });

          console.log('Idempotency key stored:', {
            key: idempotencyKey.substring(0, 8) + '...',
            resourceType,
            resourceId,
            userId,
            expiresAt
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      next();
    }
  };
}

/**
 * Cleanup expired idempotency keys
 * Should be run periodically (e.g., daily cron job)
 */
async function cleanupExpiredKeys(pool) {
  try {
    const result = await pool.query(`
      DELETE FROM idempotency_keys
      WHERE expires_at < NOW()
    `);

    console.log(`Cleaned up ${result.rowCount} expired idempotency keys`);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up idempotency keys:', error);
    return 0;
  }
}

/**
 * Generate a secure idempotency key
 * Helper function for client-side use
 */
function generateIdempotencyKey() {
  return crypto.randomUUID();
}

module.exports = {
  createIdempotencyMiddleware,
  cleanupExpiredKeys,
  generateIdempotencyKey
};
