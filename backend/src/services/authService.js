/**
 * Authentication Service module
 * 
 * This module provides authentication and token management services.
 */
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const userRepository = require('../repositories/userRepository');
const db = require('../config/database');
const { SECURITY_CONFIG } = require('../config/environment');

/**
 * Generate JWT access token
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateAccessToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    roles: user.roles
  };
  
  return jwt.sign(
    payload,
    SECURITY_CONFIG.JWT_SECRET,
    { expiresIn: SECURITY_CONFIG.JWT_EXPIRATION }
  );
};

/**
 * Generate JWT refresh token
 * @param {Object} user - User object
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  const payload = {
    id: user.id,
    type: 'refresh'
  };
  
  return jwt.sign(
    payload,
    SECURITY_CONFIG.JWT_SECRET,
    { expiresIn: SECURITY_CONFIG.JWT_REFRESH_EXPIRATION }
  );
};

/**
 * Store refresh token in the database
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Token record
 */
const storeRefreshToken = async (userId, refreshToken, userAgent) => {
  try {
    const tokenId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration
    
    const query = `
      INSERT INTO refresh_tokens (
        id, user_id, token, user_agent, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    
    const result = await db.query(query, [
      tokenId,
      userId,
      refreshToken,
      userAgent,
      expiresAt
    ]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Error in authService.storeRefreshToken:', error);
    throw new Error('Failed to store refresh token');
  }
};

/**
 * Verify and get refresh token from the database
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} Token data
 */
const getRefreshToken = async (refreshToken) => {
  try {
    const query = `
      SELECT * FROM refresh_tokens
      WHERE token = $1 AND is_revoked = FALSE AND expires_at > NOW()
    `;
    
    const result = await db.query(query, [refreshToken]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error in authService.getRefreshToken:', error);
    throw new Error('Failed to validate refresh token');
  }
};

/**
 * Revoke a refresh token
 * @param {string} tokenId - Token ID
 * @returns {Promise<boolean>} True if successful
 */
const revokeRefreshToken = async (tokenId) => {
  try {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE, revoked_at = NOW()
      WHERE id = $1
      RETURNING id
    `;
    
    const result = await db.query(query, [tokenId]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error in authService.revokeRefreshToken:', error);
    throw new Error('Failed to revoke refresh token');
  }
};

/**
 * Revoke all refresh tokens for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of tokens revoked
 */
const revokeAllUserTokens = async (userId) => {
  try {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE, revoked_at = NOW()
      WHERE user_id = $1 AND is_revoked = FALSE
      RETURNING id
    `;
    
    const result = await db.query(query, [userId]);
    
    return result.rows.length;
  } catch (error) {
    console.error('Error in authService.revokeAllUserTokens:', error);
    throw new Error('Failed to revoke user tokens');
  }
};

/**
 * Clean up expired tokens
 * @returns {Promise<number>} Number of tokens removed
 */
const cleanupExpiredTokens = async () => {
  try {
    const query = `
      DELETE FROM refresh_tokens
      WHERE expires_at < NOW()
      RETURNING id
    `;
    
    const result = await db.query(query);
    
    return result.rows.length;
  } catch (error) {
    console.error('Error in authService.cleanupExpiredTokens:', error);
    throw new Error('Failed to clean up expired tokens');
  }
};

/**
 * Authenticate user credentials and generate tokens
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Authentication result with tokens
 */
const authenticateUser = async (username, password, userAgent) => {
  try {
    // Validate credentials
    const user = await userRepository.validateCredentials(username, password);
    
    if (!user) {
      return { success: false, message: 'Invalid username or password' };
    }
    
    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Store refresh token
    await storeRefreshToken(user.id, refreshToken, userAgent);
    
    // Clean up expired tokens (run asynchronously)
    cleanupExpiredTokens().catch(err => {
      console.error('Error cleaning up expired tokens:', err);
    });
    
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 24 * 60 * 60 // 24 hours in seconds
      }
    };
  } catch (error) {
    console.error('Error in authService.authenticateUser:', error);
    throw new Error('Authentication failed');
  }
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Refresh result with new tokens
 */
const refreshAccessToken = async (refreshToken, userAgent) => {
  try {
    // Verify JWT format and signature
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, SECURITY_CONFIG.JWT_SECRET);
    } catch (err) {
      return { success: false, message: 'Invalid refresh token' };
    }
    
    // Verify token type
    if (decoded.type !== 'refresh') {
      return { success: false, message: 'Invalid token type' };
    }
    
    // Check if token exists in database and is not revoked
    const tokenRecord = await getRefreshToken(refreshToken);
    
    if (!tokenRecord) {
      return { success: false, message: 'Refresh token expired or revoked' };
    }
    
    // Get the user
    const user = await userRepository.findById(decoded.id);
    
    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    
    // Revoke the old token
    await revokeRefreshToken(tokenRecord.id);
    
    // Store the new refresh token
    await storeRefreshToken(user.id, newRefreshToken, userAgent);
    
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles
      },
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 24 * 60 * 60 // 24 hours in seconds
      }
    };
  } catch (error) {
    console.error('Error in authService.refreshAccessToken:', error);
    throw new Error('Token refresh failed');
  }
};

/**
 * Logout user by revoking refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} Logout result
 */
const logout = async (refreshToken) => {
  try {
    // Verify JWT format and signature
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, SECURITY_CONFIG.JWT_SECRET);
    } catch (err) {
      return { success: true, message: 'Token already invalid' };
    }
    
    // Check if token exists in database
    const tokenRecord = await getRefreshToken(refreshToken);
    
    if (!tokenRecord) {
      return { success: true, message: 'Token already expired or revoked' };
    }
    
    // Revoke the token
    await revokeRefreshToken(tokenRecord.id);
    
    return { success: true, message: 'Logout successful' };
  } catch (error) {
    console.error('Error in authService.logout:', error);
    throw new Error('Logout failed');
  }
};

/**
 * Logout from all devices by revoking all user tokens
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Logout result
 */
const logoutAll = async (userId) => {
  try {
    const count = await revokeAllUserTokens(userId);
    
    return {
      success: true,
      message: `Logged out from all devices (${count} sessions)`
    };
  } catch (error) {
    console.error('Error in authService.logoutAll:', error);
    throw new Error('Logout from all devices failed');
  }
};

/**
 * Verify JWT token and get user data
 * @param {string} token - JWT token
 * @returns {Object} Decoded token data or null if invalid
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECURITY_CONFIG.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateUser,
  refreshAccessToken,
  logout,
  logoutAll,
  verifyToken,
  cleanupExpiredTokens
};