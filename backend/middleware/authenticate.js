/**
 * Authentication Middleware
 * 
 * Verifies JWT tokens and adds user data to the request
 */

const jwt = require('jsonwebtoken');
const { authLogger } = require('../utils/logger');
const db = require('../config/database');

/**
 * Middleware to authenticate the user from JWT token
 */
function authenticate(req, res, next) {
  // Get token from the Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    authLogger.warn('Authentication failed: No token provided');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'development_secret');
    
    // Add user data to request
    req.user = decoded;
    
    authLogger.info('Authentication successful, proceeding to next middleware');
    next();
  } catch (error) {
    authLogger.error('Authentication error', { error: error.message });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authenticate;