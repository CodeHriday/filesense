/**
 * User Management Routes
 * Handles user registration, profile updates, password changes
 */

const express = require('express');
const router = express.Router();
const enhancedAuthService = require('../services/enhancedAuthService');
const authenticateToken = require('../middleware/authenticate');
const { asyncHandler } = require('../src/middleware/error-handler');
const db = require('../config/database');

/**
 * POST /api/users/register
 * Register a new local user with enhanced password validation
 */
router.post('/register', asyncHandler(async (req, res) => {
  const result = await enhancedAuthService.registerLocalUser(req.body);
  
  if (!result.success) {
    return res.status(400).json({
      error: 'Registration failed',
      message: result.message,
      errors: result.errors
    });
  }
  
  res.status(201).json({
    message: 'User registered successfully',
    user: result.user
  });
}));

/**
 * GET /api/users/password-requirements
 * Get password strength requirements
 */
router.get('/password-requirements', (req, res) => {
  const requirements = enhancedAuthService.getPasswordRequirements();
  res.json(requirements);
});

/**
 * PUT /api/users/change-password
 * Change user password (authenticated)
 */
router.put('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  
  const result = await enhancedAuthService.changePassword(
    userId,
    currentPassword,
    newPassword
  );
  
  if (!result.success) {
    return res.status(400).json({
      error: 'Password change failed',
      message: result.message,
      errors: result.errors
    });
  }
  
  res.json({
    message: result.message
  });
}));

/**
 * GET /api/users/profile
 * Get current user profile with full details
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const result = await db.query(
    `SELECT 
      id, username, email, 
      first_name, middle_name, last_name, full_name,
      phone_number, 
      address_line1, address_line2, city, state, postal_code, country,
      auth_provider, 
      created_at, updated_at, last_login
     FROM users 
     WHERE id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(result.rows[0]);
}));

/**
 * PUT /api/users/profile
 * Update user profile (authenticated)
 */
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    first_name,
    middle_name,
    last_name,
    phone_number,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country
  } = req.body;
  
  const updateQuery = `
    UPDATE users
    SET
      first_name = COALESCE($1, first_name),
      middle_name = COALESCE($2, middle_name),
      last_name = COALESCE($3, last_name),
      phone_number = COALESCE($4, phone_number),
      address_line1 = COALESCE($5, address_line1),
      address_line2 = COALESCE($6, address_line2),
      city = COALESCE($7, city),
      state = COALESCE($8, state),
      postal_code = COALESCE($9, postal_code),
      country = COALESCE($10, country),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $11
    RETURNING 
      id, username, email,
      first_name, middle_name, last_name, full_name,
      phone_number,
      address_line1, address_line2, city, state, postal_code, country,
      auth_provider,
      updated_at
  `;
  
  const result = await db.query(updateQuery, [
    first_name,
    middle_name,
    last_name,
    phone_number,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    userId
  ]);
  
  res.json({
    message: 'Profile updated successfully',
    user: result.rows[0]
  });
}));

module.exports = router;
