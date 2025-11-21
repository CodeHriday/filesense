/**
 * API Token Authentication Middleware
 * 
 * Authenticates API tokens for programmatic upload endpoints
 * Supports scoped permissions and rate limiting
 */

const APITokenService = require('../services/APITokenService');
const { systemLogger } = require('../utils/logger');

const apiTokenService = new APITokenService();

/**
 * Middleware to authenticate API token
 * 
 * Expects token in Authorization header: Bearer dfo_xxxxx
 * Adds tokenRecord to req object if valid
 */
async function authenticateAPIToken(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Provide API token in Authorization header: Bearer dfo_xxxxx'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const tokenRecord = await apiTokenService.verifyToken(token);

    // Check rate limit
    const rateLimit = await apiTokenService.checkRateLimit(tokenRecord.id);

    if (rateLimit.remaining <= 0) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        limit: rateLimit.limit,
        resetAt: rateLimit.resetAt
      });
    }

    // Add token info to request
    req.apiToken = tokenRecord;
    req.rateLimit = rateLimit;

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', rateLimit.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toISOString());

    systemLogger.info('API token authenticated', {
      tokenId: tokenRecord.id,
      userId: tokenRecord.user_id,
      projectId: tokenRecord.project_id,
      scopes: tokenRecord.scopes
    });

    next();
  } catch (error) {
    systemLogger.warn('API token authentication failed', {
      error: error.message,
      authHeader: req.headers.authorization ? 'present' : 'missing'
    });

    return res.status(401).json({ 
      error: 'Authentication failed',
      message: error.message
    });
  }
}

/**
 * Middleware factory to require specific scope
 * 
 * @param {string} requiredScope - Required scope (e.g., 'vendor_agreements:upload')
 * @returns {Function} - Express middleware
 */
function requireScope(requiredScope) {
  return (req, res, next) => {
    if (!req.apiToken) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    if (!apiTokenService.hasScope(req.apiToken, requiredScope)) {
      systemLogger.warn('API token lacks required scope', {
        tokenId: req.apiToken.id,
        requiredScope,
        tokenScopes: req.apiToken.scopes
      });

      return res.status(403).json({ 
        error: 'Insufficient permissions',
        requiredScope,
        message: `Token does not have required scope: ${requiredScope}`
      });
    }

    next();
  };
}

module.exports = {
  authenticateAPIToken,
  requireScope
};
