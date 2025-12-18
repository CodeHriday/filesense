/**
 * API Token Service
 * 
 * Manages API tokens for programmatic file uploads
 * Supports scoped permissions and rate limiting
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { systemLogger } = require('../utils/logger');

class APITokenService {
  /**
   * Generate a new API token
   * 
   * @param {Object} params - Token parameters
   * @param {string} params.name - Token name/description
   * @param {number} params.userId - User ID creating the token
   * @param {number} params.projectId - Project ID (optional, for project-scoped tokens)
   * @param {Array<string>} params.scopes - Token scopes (e.g., ['vendor_agreements:upload', 'projects:upload'])
   * @param {number} params.rateLimit - Max requests per rate window (default: 100)
   * @param {number} params.rateWindowHours - Rate limit window in hours (default: 1)
   * @param {Date} params.expiresAt - Expiration date (optional)
   * @returns {Promise<Object>} - Token object with plaintext token (only shown once)
   */
  async createToken({
    name,
    userId,
    projectId = null,
    scopes = [],
    rateLimit = 100,
    rateWindowHours = 1,
    expiresAt = null,
    createdBy
  }) {
    // Check if token name already exists (includes revoked tokens for true uniqueness)
    const existingToken = await query(
      `SELECT id FROM api_tokens WHERE name = $1`,
      [name]
    );
    if (existingToken.rows.length > 0) {
      throw new Error('A token with this name already exists');
    }

    // Generate random token
    const token = `dfo_${crypto.randomBytes(32).toString('hex')}`;
    const tokenPrefix = token.substring(0, 11); // 'dfo_' + first 7 chars
    const tokenHash = await bcrypt.hash(token, 10);

    // Insert token into database
    const result = await query(
      `INSERT INTO api_tokens (
        name, token_hash, token_prefix, user_id, project_id,
        scopes, rate_limit, rate_window_hours, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, token_prefix, user_id, project_id, scopes,
                rate_limit, rate_window_hours, is_active, expires_at, created_at`,
      [
        name,
        tokenHash,
        tokenPrefix,
        userId,
        projectId,
        JSON.stringify(scopes),
        rateLimit,
        rateWindowHours,
        expiresAt,
        createdBy
      ]
    );

    systemLogger.info('API token created', {
      tokenId: result.rows[0].id,
      userId,
      projectId,
      scopes
    });

    return {
      ...result.rows[0],
      token // Only returned once, never stored in plaintext
    };
  }

  /**
   * Verify and validate an API token
   * 
   * @param {string} token - Plaintext token to verify
   * @returns {Promise<Object>} - Token details if valid
   * @throws {Error} - If token is invalid or expired
   */
  async verifyToken(token) {
    if (!token || !token.startsWith('dfo_')) {
      throw new Error('Invalid token format');
    }

    const tokenPrefix = token.substring(0, 11);

    // Find token by prefix
    const result = await query(
      `SELECT * FROM api_tokens 
       WHERE token_prefix = $1 AND is_active = true`,
      [tokenPrefix]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid token');
    }

    const tokenRecord = result.rows[0];

    // Check expiration
    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      throw new Error('Token expired');
    }

    // Verify token hash
    const isValid = await bcrypt.compare(token, tokenRecord.token_hash);

    if (!isValid) {
      throw new Error('Invalid token');
    }

    // Update last_used_at
    await query(
      `UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1`,
      [tokenRecord.id]
    );

    // Parse scopes
    tokenRecord.scopes = typeof tokenRecord.scopes === 'string' 
      ? JSON.parse(tokenRecord.scopes) 
      : tokenRecord.scopes;

    return tokenRecord;
  }

  /**
   * Check if token has required scope
   * 
   * @param {Object} tokenRecord - Token record from database
   * @param {string} requiredScope - Required scope (e.g., 'vendor_agreements:upload')
   * @returns {boolean} - True if token has scope
   */
  hasScope(tokenRecord, requiredScope) {
    const scopes = Array.isArray(tokenRecord.scopes) 
      ? tokenRecord.scopes 
      : JSON.parse(tokenRecord.scopes);

    return scopes.includes(requiredScope) || scopes.includes('*');
  }

  /**
   * Check rate limit for token
   * 
   * @param {number} tokenId - Token ID
   * @returns {Promise<Object>} - Rate limit status
   */
  async checkRateLimit(tokenId) {
    // Get token rate limit settings
    const tokenResult = await query(
      `SELECT rate_limit, rate_window_hours FROM api_tokens WHERE id = $1`,
      [tokenId]
    );

    if (tokenResult.rows.length === 0) {
      throw new Error('Token not found');
    }

    const { rate_limit, rate_window_hours } = tokenResult.rows[0];

    // Count recent requests
    const countResult = await query(
      `SELECT COUNT(*) as request_count
       FROM upload_batches
       WHERE api_token_id = $1
         AND created_at > NOW() - INTERVAL '${rate_window_hours} hours'`,
      [tokenId]
    );

    const requestCount = parseInt(countResult.rows[0].request_count);
    const remaining = Math.max(0, rate_limit - requestCount);

    return {
      limit: rate_limit,
      remaining,
      used: requestCount,
      resetAt: new Date(Date.now() + rate_window_hours * 60 * 60 * 1000)
    };
  }

  /**
   * Revoke an API token
   * 
   * @param {number} tokenId - Token ID to revoke
   * @param {number} revokedBy - User ID revoking the token
   * @returns {Promise<boolean>} - True if revoked
   */
  async revokeToken(tokenId, revokedBy) {
    await query(
      `UPDATE api_tokens 
       SET is_active = false, revoked_at = NOW(), revoked_by = $2
       WHERE id = $1`,
      [tokenId, revokedBy]
    );

    systemLogger.info('API token revoked', {
      tokenId,
      revokedBy
    });

    return true;
  }

  /**
   * List tokens for user/project
   * 
   * @param {Object} filters - Filter parameters
   * @returns {Promise<Array>} - List of tokens (without hashes)
   */
  async listTokens(filters = {}) {
    const { userId, projectId, isActive = null } = filters;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(userId);
    }
    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      values.push(projectId);
    }
    if (isActive !== null) {
      conditions.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT id, name, token_prefix, user_id, project_id, scopes,
              rate_limit, rate_window_hours, is_active, expires_at,
              last_used_at, created_at, revoked_at
       FROM api_tokens 
       ${whereClause}
       ORDER BY created_at DESC`,
      values
    );

    return result.rows;
  }
}

module.exports = APITokenService;
