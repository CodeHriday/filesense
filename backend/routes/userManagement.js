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
const userRepository = require('../src/repositories/userRepository');

/**
 * GET /api/users
 * Get all users with pagination
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Fetch users with lockout status
  const users = await userRepository.findAll({ limit, offset });
  
  // Get total count for pagination
  const totalCount = await userRepository.count();
  const totalPages = Math.ceil(totalCount / limit);
  
  res.json({
    users,
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalCount,
      totalPages
    }
  });
}));

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
 * GET /api/users/roles
 * Get all available roles for project/group assignment
 */
router.get('/roles', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, description FROM roles ORDER BY name`
  );
  
  res.json(result.rows);
}));

/**
 * GET /api/users/roles/:id
 * Get a single role by ID with permissions (admin only)
 */
router.get('/roles/:id', authenticateToken, asyncHandler(async (req, res) => {
  const roleId = parseInt(req.params.id);
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('Admin')) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can view role details'
    });
  }
  
  const result = await db.query(
    `SELECT 
      r.id, 
      r.name, 
      r.description,
      r.permissions,
      r.created_at,
      r.updated_at
    FROM roles r
    WHERE r.id = $1`,
    [roleId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ 
      error: 'Role not found',
      message: `No role found with ID ${roleId}`
    });
  }
  
  res.json(result.rows[0]);
}));

/**
 * GET /api/users/by-role/:roleName
 * Get users by role name (e.g., 'Vendor')
 * For 'vendor' role, uses attribute-based identification (internal_user = false AND user_type = 'Vendor')
 */
router.get('/by-role/:roleName', authenticateToken, asyncHandler(async (req, res) => {
  const { roleName } = req.params;
  
  // Use attribute-based identification for vendor users
  if (roleName.toLowerCase() === 'vendor') {
    const result = await db.query(
      `SELECT 
        u.id,
        u.username,
        u.email,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.full_name,
        u.phone_number,
        u.address_line1,
        u.address_line2,
        u.city,
        u.state,
        u.postal_code,
        u.country
      FROM users u
      WHERE u.internal_user = false AND u.user_type = 'Vendor'
      ORDER BY u.full_name, u.username`
    );
    
    return res.json(result.rows);
  }
  
  // For other roles, use role-based lookup
  const result = await db.query(
    `SELECT 
      u.id,
      u.username,
      u.email,
      u.first_name,
      u.middle_name,
      u.last_name,
      u.full_name,
      u.phone_number,
      u.address_line1,
      u.address_line2,
      u.city,
      u.state,
      u.postal_code,
      u.country
    FROM users u
    INNER JOIN user_roles ur ON u.id = ur.user_id
    INNER JOIN roles r ON ur.role_id = r.id
    WHERE LOWER(r.name) = LOWER($1)
    ORDER BY u.full_name, u.username`,
    [roleName]
  );
  
  res.json(result.rows);
}));

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

/**
 * GET /api/users/:id
 * Get a single user by ID with roles (admin only)
 */
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('Admin')) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can view user details'
    });
  }
  
  const result = await db.query(
    `SELECT 
      u.id, u.username, u.email,
      u.first_name, u.middle_name, u.last_name, u.full_name,
      u.phone_number,
      u.address_line1, u.address_line2, u.city, u.state, u.postal_code, u.country,
      u.auth_provider, u.internal_user, u.user_type,
      u.created_at, u.updated_at, u.last_login,
      COALESCE(
        json_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
        '[]'
      ) as roles
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1
    GROUP BY u.id`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ 
      error: 'User not found',
      message: `No user found with ID ${userId}`
    });
  }
  
  res.json(result.rows[0]);
}));

/**
 * PUT /api/users/:id
 * Update any user (admin only)
 */
router.put('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const {
    username,
    email,
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
    internal_user,
    user_type,
    roles
  } = req.body;
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('Admin')) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can update user information'
    });
  }
  
  // Use transaction helper with proper error handling
  let result;
  try {
    result = await db.transaction(async (client) => {
      // Update user information
      const updateQuery = `
        UPDATE users
        SET
          username = COALESCE($1, username),
          email = COALESCE($2, email),
          first_name = COALESCE($3, first_name),
          middle_name = COALESCE($4, middle_name),
          last_name = COALESCE($5, last_name),
          phone_number = COALESCE($6, phone_number),
          address_line1 = COALESCE($7, address_line1),
          address_line2 = COALESCE($8, address_line2),
          city = COALESCE($9, city),
          state = COALESCE($10, state),
          postal_code = COALESCE($11, postal_code),
          country = COALESCE($12, country),
          internal_user = COALESCE($13, internal_user),
          user_type = COALESCE($14, user_type),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $15
        RETURNING 
          id, username, email,
          first_name, middle_name, last_name, full_name,
          phone_number,
          address_line1, address_line2, city, state, postal_code, country,
          auth_provider, internal_user, user_type,
          updated_at
      `;
      
      const userResult = await client.query(updateQuery, [
        username,
        email,
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
        internal_user,
        user_type,
        userId
      ]);
      
      if (userResult.rows.length === 0) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }
    
    // Update roles if provided
    if (roles && Array.isArray(roles)) {
      // Delete existing role assignments
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      
      // Insert new role assignments
      for (const roleId of roles) {
        const roleIdentifier = typeof roleId === 'string' ? roleId : roleId;
        const isNumeric = !isNaN(roleIdentifier);
        
        let actualRoleId;
        
        if (isNumeric) {
          // Verify role exists
          const roleResult = await client.query(
            'SELECT id FROM roles WHERE id = $1',
            [roleIdentifier]
          );
          
          if (roleResult.rows.length > 0) {
            actualRoleId = roleResult.rows[0].id;
          }
        } else {
          // Look up role by name
          const roleResult = await client.query(
            'SELECT id FROM roles WHERE name = $1',
            [roleIdentifier]
          );
          
          if (roleResult.rows.length > 0) {
            actualRoleId = roleResult.rows[0].id;
          }
        }
        
        if (actualRoleId) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, NOW())',
            [userId, actualRoleId]
          );
        }
      }
    }
    
    // Fetch updated user with roles
    const updatedUser = await client.query(
      `SELECT 
        u.id, u.username, u.email,
        u.first_name, u.middle_name, u.last_name, u.full_name,
        u.phone_number,
        u.address_line1, u.address_line2, u.city, u.state, u.postal_code, u.country,
        u.auth_provider, u.internal_user, u.user_type,
        u.created_at, u.updated_at, u.last_login,
        COALESCE(
          json_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
          '[]'
        ) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id`,
      [userId]
    );
    
      return updatedUser.rows[0];
    });
  } catch (error) {
    // Handle specific error codes
    if (error.statusCode === 404) {
      return res.status(404).json({ 
        error: 'User not found',
        message: `No user found with ID ${userId}`
      });
    }
    // Re-throw other errors to be handled by asyncHandler
    throw error;
  }
  
  res.json({
    message: 'User updated successfully',
    user: result
  });
}));

/**
 * POST /api/users/:id/unlock
 * Manually unlock a locked user account (admin only)
 */
router.post('/:id/unlock', authenticateToken, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('Admin')) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can unlock user accounts'
    });
  }
  
  // Reset failed login attempts, clear lockout, and require password change
  const result = await db.query(
    `UPDATE users 
     SET failed_login_attempts = 0, 
         locked_until = NULL,
         must_change_password = TRUE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, username, email, failed_login_attempts, locked_until, must_change_password`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ 
      error: 'User not found',
      message: `No user found with ID ${userId}`
    });
  }
  
  res.json({
    message: 'User account unlocked successfully',
    user: result.rows[0]
  });
}));

/**
 * DELETE /api/users/:id
 * Delete a user (admin only)
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userRoles.includes('Admin')) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can delete users'
    });
  }
  
  // Prevent deleting self
  if (userId === req.user.id) {
    return res.status(400).json({ 
      error: 'Cannot delete self',
      message: 'You cannot delete your own user account'
    });
  }
  
  // Use transaction to ensure atomicity
  try {
    await db.transaction(async (client) => {
      // Check if user exists
      const userCheck = await client.query(
        'SELECT id, username FROM users WHERE id = $1',
        [userId]
      );
      
      if (userCheck.rows.length === 0) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }
      
      // Delete related records in the correct order (foreign key constraints)
      // Note: user_job_groups uses UUID for user_id, so we skip it
      // Note: audit_log, data_access_log, security_audit_log, user_dashboard_settings use VARCHAR for user_id
      
      // Delete user role assignments
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      
      // Delete user policy attachments
      await client.query('DELETE FROM user_policy_attachments WHERE user_id = $1', [userId]);
      
      // Delete user groups
      await client.query('DELETE FROM user_groups WHERE user_id = $1', [userId]);
      
      // Delete from other user-related tables that use integer user_id
      await client.query('DELETE FROM user_attributes WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_uuid_mapping WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM project_members WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM access_group_members WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM file_audit_details WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM password_reset_requests WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM policy_evaluation_cache WHERE user_id = $1', [userId]);
      
      // Delete the user
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });
    
    res.json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ 
        error: 'User not found',
        message: `No user found with ID ${userId}`
      });
    }
    throw error;
  }
}));

module.exports = router;
