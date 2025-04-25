/**
 * Authentication Controller module
 * 
 * This module handles HTTP requests for authentication endpoints.
 */
const authService = require('../services/authService');
const { asyncHandler } = require('../middleware/error-handler');
const { validateRequest, loginSchema } = require('../middleware/validation');

/**
 * User login
 * @route POST /api/auth/login
 * @access Public
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  
  const result = await authService.authenticateUser(username, password, userAgent);
  
  if (!result.success) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: result.message
    });
  }
  
  // Send response with tokens and user data
  res.json({
    message: 'Login successful',
    user: result.user,
    tokens: result.tokens
  });
});

/**
 * Refresh access token
 * @route POST /api/auth/refresh
 * @access Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  
  if (!refreshToken) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Refresh token is required'
    });
  }
  
  const result = await authService.refreshAccessToken(refreshToken, userAgent);
  
  if (!result.success) {
    return res.status(401).json({
      error: 'Token refresh failed',
      message: result.message
    });
  }
  
  // Send response with new tokens and user data
  res.json({
    message: 'Token refreshed successfully',
    user: result.user,
    tokens: result.tokens
  });
});

/**
 * User logout
 * @route POST /api/auth/logout
 * @access Public
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Refresh token is required'
    });
  }
  
  const result = await authService.logout(refreshToken);
  
  res.json({
    message: result.message
  });
});

/**
 * User logout from all devices
 * @route POST /api/auth/logout-all
 * @access Authenticated
 */
const logoutAll = asyncHandler(async (req, res) => {
  // User ID comes from authenticated token
  const userId = req.user.id;
  
  const result = await authService.logoutAll(userId);
  
  res.json({
    message: result.message
  });
});

/**
 * Get current user data
 * @route GET /api/auth/me
 * @access Authenticated
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  // User data is already in req.user from the authenticateToken middleware
  // Just remove any sensitive information
  const { password, ...user } = req.user;
  
  res.json(user);
});

module.exports = {
  login: [validateRequest(loginSchema), login],
  refreshToken,
  logout,
  logoutAll,
  getCurrentUser
};