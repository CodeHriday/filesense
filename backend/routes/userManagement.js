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
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * GET /api/users
 * Get all users with pagination
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  
  // Build filters object
  const filters = { limit, offset };
  if (search) {
    filters.search = search;
  }
  
  // Fetch users with lockout status and optional search
  const users = await userRepository.findAll(filters);
  
  // Get total count for pagination (with same search filter)
  const totalCount = await userRepository.count(search ? { search } : {});
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
 * POST /api/users/change-password-required
 * Change password when required (e.g., after admin unlock)
 * Requires a short-lived passwordChangeToken from login response
 */
router.post('/change-password-required', asyncHandler(async (req, res) => {
  const { userId, newPassword, passwordChangeToken } = req.body;
  
  if (!userId || !newPassword || !passwordChangeToken) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'User ID, new password, and password change token are required'
    });
  }
  
  // Verify the password change token
  const jwt = require('jsonwebtoken');
  const { SECURITY_CONFIG } = require('../src/config/environment');
  
  try {
    const decoded = jwt.verify(passwordChangeToken, SECURITY_CONFIG.JWT_SECRET);
    
    // Verify token purpose
    if (decoded.purpose !== 'password_change_only') {
      return res.status(403).json({
        error: 'Invalid token',
        message: 'This token cannot be used for password changes'
      });
    }
    
    // Verify user ID matches
    if (decoded.userId !== userId) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'You can only change your own password'
      });
    }
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: 'Your password change session has expired. Please log in again.'
    });
  }
  
  // Validate password strength using enhanced auth service
  const validation = enhancedAuthService.validatePassword(newPassword);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Weak password',
      message: 'Password does not meet security requirements',
      errors: validation.errors
    });
  }
  
  const bcrypt = require('bcrypt');
  const saltRounds = SECURITY_CONFIG.BCRYPT_SALT_ROUNDS;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
  
  const result = await db.query(
    `UPDATE users 
     SET password = $1,
         must_change_password = FALSE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, username, email`,
    [hashedPassword, userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      message: `No user found with ID ${userId}`
    });
  }
  
  res.json({
    success: true,
    message: 'Password changed successfully',
    user: result.rows[0]
  });
}));

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
  if (!userHasAdminAccess(req.user)) {
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
        u.country,
        u.vendor_id
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
 * GET /api/users/data-stewards
 * Get all users with the Data Steward role
 */
router.get('/data-stewards', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT 
      u.id,
      u.username,
      u.email,
      u.first_name,
      u.middle_name,
      u.last_name,
      u.full_name
    FROM users u
    INNER JOIN user_roles ur ON u.id = ur.user_id
    INNER JOIN roles r ON ur.role_id = r.id
    WHERE r.name = 'Data Steward'
    ORDER BY u.full_name, u.username`
  );
  
  res.json({ dataStewards: result.rows });
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
  if (!userHasAdminAccess(req.user)) {
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
    roles,
    password,
    must_change_password
  } = req.body;
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
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
      
      // Handle password update if provided (admin changing user password)
      if (password) {
        const bcrypt = require('bcrypt');
        const { SECURITY_CONFIG } = require('../src/config/environment');
        const passwordSecurity = require('../utils/passwordSecurity');
        
        // Validate password strength
        const validation = passwordSecurity.validatePasswordStrength(password);
        if (!validation.valid) {
          const error = new Error('Password does not meet security requirements');
          error.statusCode = 400;
          error.details = {
            error: 'Weak password',
            message: 'Password does not meet security requirements',
            errors: validation.errors
          };
          throw error;
        }
        
        const saltRounds = SECURITY_CONFIG.BCRYPT_SALT_ROUNDS;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Get current password history
        const historyResult = await client.query(
          'SELECT password_history FROM users WHERE id = $1',
          [userId]
        );
        
        const currentHistory = historyResult.rows[0]?.password_history || [];
        const updatedHistory = passwordSecurity.addToPasswordHistory(hashedPassword, currentHistory);
        
        // Update password and password_history
        await client.query(
          `UPDATE users 
           SET password = $1, 
               password_history = $2::jsonb,
               must_change_password = COALESCE($3, must_change_password),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [hashedPassword, JSON.stringify(updatedHistory), must_change_password, userId]
        );
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
    // Handle password validation errors
    if (error.statusCode === 400 && error.details) {
      return res.status(400).json(error.details);
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
  if (!userHasAdminAccess(req.user)) {
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
 * GET /api/users/:id/dependencies
 * Check if user has dependencies (vendors, agreements, mappings, catalogs, projects)
 */
router.get('/:id/dependencies', authenticateToken, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can check user dependencies'
    });
  }
  
  const dependencies = {
    hasDependencies: false,
    vendors: [],
    agreements: [],
    mappings: [],
    catalogs: [],
    projects: []
  };
  
  // Check vendors where user is assigned
  const vendorsResult = await db.query(
    `SELECT id, vendor_name, vendor_code 
     FROM vendors 
     WHERE vendor_user_id = $1 AND status != 'deleted'`,
    [userId]
  );
  dependencies.vendors = vendorsResult.rows;
  
  // Check vendor agreements where user is a contact or approver
  const agreementsResult = await db.query(
    `SELECT id, agreement_code, vendor_id 
     FROM vendor_agreements 
     WHERE (manager_contact = (SELECT email FROM users WHERE id = $1)
            OR vendor_approved_by = $1 
            OR owner_approved_by = $1
            OR governance_approved_by = $1)
     AND status != 'deleted'`,
    [userId]
  );
  dependencies.agreements = agreementsResult.rows;
  
  // Check transformation mappings created by user
  const mappingsResult = await db.query(
    `SELECT mapping_id, mapping_name, project_id 
     FROM transformation_mappings 
     WHERE created_by = $1`,
    [userId]
  );
  dependencies.mappings = mappingsResult.rows;
  
  // Check vendor file profiling results (files uploaded by user)
  const catalogsResult = await db.query(
    `SELECT id, file_id, vendor_id 
     FROM vendor_file_profiling_results 
     WHERE uploaded_by_user_id = $1`,
    [userId]
  );
  dependencies.catalogs = catalogsResult.rows;
  
  // Check project ownership
  const projectsResult = await db.query(
    `SELECT id, name, description 
     FROM projects 
     WHERE owner_id = $1 AND is_archived = false`,
    [userId]
  );
  dependencies.projects = projectsResult.rows;
  
  // Set hasDependencies flag
  dependencies.hasDependencies = 
    dependencies.vendors.length > 0 ||
    dependencies.agreements.length > 0 ||
    dependencies.mappings.length > 0 ||
    dependencies.catalogs.length > 0 ||
    dependencies.projects.length > 0;
  
  res.json(dependencies);
}));

/**
 * GET /api/users/:id/eligible-replacements
 * Get eligible replacement users for ownership transfer
 * - For vendor users: Returns only users from the same vendor
 * - For internal users: Returns only other internal users (not vendor users)
 */
router.get('/:id/eligible-replacements', authenticateToken, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can fetch eligible replacements'
    });
  }
  
  // Get the user being deleted
  const userResult = await db.query(
    `SELECT id, username, email, internal_user, user_type, vendor_id
     FROM users 
     WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({
      error: 'User not found',
      message: `No user found with ID ${userId}`
    });
  }
  
  const userToDelete = userResult.rows[0];
  let eligibleUsers = [];
  
  // Determine filtering logic based on user type
  if (userToDelete.vendor_id) {
    // Vendor user: Only show contacts from the same vendor
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, 
              u.internal_user, u.user_type, u.vendor_id,
              ARRAY_AGG(r.name) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.vendor_id = $1 
         AND u.id != $2
       GROUP BY u.id, u.username, u.email, u.first_name, u.last_name,
                u.internal_user, u.user_type, u.vendor_id
       ORDER BY u.username`,
      [userToDelete.vendor_id, userId]
    );
    eligibleUsers = result.rows;
  } else if (userToDelete.internal_user || !userToDelete.user_type || userToDelete.user_type !== 'Vendor') {
    // Internal user: Only show other internal users (exclude vendor users)
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, 
              u.internal_user, u.user_type, u.vendor_id,
              ARRAY_AGG(r.name) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE (u.internal_user = true OR u.user_type IS NULL OR u.user_type != 'Vendor')
         AND u.vendor_id IS NULL
         AND u.id != $1
       GROUP BY u.id, u.username, u.email, u.first_name, u.last_name,
                u.internal_user, u.user_type, u.vendor_id
       ORDER BY u.username`,
      [userId]
    );
    eligibleUsers = result.rows;
  }
  
  res.json({
    userToDelete: {
      id: userToDelete.id,
      username: userToDelete.username,
      email: userToDelete.email,
      internal_user: userToDelete.internal_user,
      user_type: userToDelete.user_type,
      vendor_id: userToDelete.vendor_id
    },
    eligibleReplacements: eligibleUsers
  });
}));

/**
 * POST /api/users/bulk-dependencies
 * Check dependencies for multiple users
 */
router.post('/bulk-dependencies', authenticateToken, asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can check user dependencies'
    });
  }
  
  // Validate input
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'userIds must be a non-empty array'
    });
  }
  
  const usersWithDependencies = [];
  
  for (const userId of userIds) {
    const id = parseInt(userId);
    
    // Check for any dependencies
    const vendorsCount = await db.query(
      'SELECT COUNT(*) FROM vendors WHERE vendor_user_id = $1 AND status != $2',
      [id, 'deleted']
    );
    
    const agreementsCount = await db.query(
      `SELECT COUNT(*) FROM vendor_agreements 
       WHERE (manager_contact = (SELECT email FROM users WHERE id = $1)
              OR vendor_approved_by = $1 
              OR owner_approved_by = $1
              OR governance_approved_by = $1)
       AND status != 'deleted'`,
      [id]
    );
    
    const mappingsCount = await db.query(
      'SELECT COUNT(*) FROM transformation_mappings WHERE created_by = $1',
      [id]
    );
    
    const catalogsCount = await db.query(
      'SELECT COUNT(*) FROM vendor_file_profiling_results WHERE uploaded_by_user_id = $1',
      [id]
    );
    
    const projectsCount = await db.query(
      'SELECT COUNT(*) FROM projects WHERE owner_id = $1 AND is_archived = false',
      [id]
    );
    
    const totalDependencies = 
      parseInt(vendorsCount.rows[0].count) +
      parseInt(agreementsCount.rows[0].count) +
      parseInt(mappingsCount.rows[0].count) +
      parseInt(catalogsCount.rows[0].count) +
      parseInt(projectsCount.rows[0].count);
    
    if (totalDependencies > 0) {
      const userInfo = await db.query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [id]
      );
      usersWithDependencies.push({
        ...userInfo.rows[0],
        dependencyCount: totalDependencies
      });
    }
  }
  
  res.json({
    usersWithDependencies,
    canDelete: usersWithDependencies.length === 0
  });
}));

/**
 * POST /api/users/:id/transfer-ownership
 * Transfer ownership from one user to another vendor contact
 */
router.post('/:id/transfer-ownership', authenticateToken, asyncHandler(async (req, res) => {
  const fromUserId = parseInt(req.params.id);
  const { toUserId } = req.body;
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can transfer ownership'
    });
  }
  
  // Validate input
  if (!toUserId) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'toUserId is required'
    });
  }
  
  const toUserIdInt = parseInt(toUserId);
  
  // Prevent transferring to self
  if (fromUserId === toUserIdInt) {
    return res.status(400).json({
      error: 'Invalid transfer',
      message: 'Cannot transfer ownership to the same user'
    });
  }
  
  // Verify target user is a vendor contact
  const targetUser = await db.query(
    `SELECT id, username, email, internal_user, user_type, vendor_id 
     FROM users 
     WHERE id = $1`,
    [toUserIdInt]
  );
  
  if (targetUser.rows.length === 0) {
    return res.status(404).json({
      error: 'Target user not found',
      message: 'The selected user does not exist'
    });
  }
  
  const targetUserData = targetUser.rows[0];
  if (targetUserData.internal_user !== false || targetUserData.user_type !== 'Vendor') {
    return res.status(400).json({
      error: 'Invalid target user',
      message: 'Target user must be a vendor contact'
    });
  }
  
  // Get source user's vendor associations
  const sourceUser = await db.query(
    `SELECT id, email, vendor_id 
     FROM users 
     WHERE id = $1`,
    [fromUserId]
  );
  
  if (sourceUser.rows.length === 0) {
    return res.status(404).json({
      error: 'Source user not found',
      message: 'The user to transfer from does not exist'
    });
  }
  
  const sourceUserData = sourceUser.rows[0];
  
  // If source user has a vendor_id, ensure target user has the same vendor_id
  if (sourceUserData.vendor_id && targetUserData.vendor_id !== sourceUserData.vendor_id) {
    return res.status(400).json({
      error: 'Invalid transfer',
      message: 'Target user must belong to the same vendor organization'
    });
  }
  
  const sourceEmail = sourceUserData.email;
  const targetEmail = targetUserData.email;
  
  // Transfer ownership in transaction
  const transferResults = {
    vendors: 0,
    agreements: 0,
    mappings: 0,
    catalogs: 0,
    projects: 0
  };
  
  await db.transaction(async (client) => {
    // Transfer vendor assignments
    const vendorsUpdate = await client.query(
      'UPDATE vendors SET vendor_user_id = $1 WHERE vendor_user_id = $2 AND status != $3 RETURNING id',
      [toUserIdInt, fromUserId, 'deleted']
    );
    transferResults.vendors = vendorsUpdate.rowCount;
    
    // Transfer vendor agreement contacts (manager_contact uses email)
    const agreementsUpdate = await client.query(
      `UPDATE vendor_agreements 
       SET manager_contact = $1,
           vendor_approved_by = CASE WHEN vendor_approved_by = $2 THEN $3 ELSE vendor_approved_by END,
           owner_approved_by = CASE WHEN owner_approved_by = $2 THEN $3 ELSE owner_approved_by END,
           governance_approved_by = CASE WHEN governance_approved_by = $2 THEN $3 ELSE governance_approved_by END
       WHERE (manager_contact = $4 
              OR vendor_approved_by = $2 
              OR owner_approved_by = $2
              OR governance_approved_by = $2)
       AND status != 'deleted'
       RETURNING id`,
      [targetEmail, fromUserId, toUserIdInt, sourceEmail]
    );
    transferResults.agreements = agreementsUpdate.rowCount;
    
    // Transfer transformation mappings
    const mappingsUpdate = await client.query(
      'UPDATE transformation_mappings SET created_by = $1 WHERE created_by = $2 RETURNING mapping_id',
      [toUserIdInt, fromUserId]
    );
    transferResults.mappings = mappingsUpdate.rowCount;
    
    // Transfer vendor file profiling results ownership
    const catalogsUpdate = await client.query(
      `UPDATE vendor_file_profiling_results 
       SET uploaded_by_user_id = $1
       WHERE uploaded_by_user_id = $2
       RETURNING id`,
      [toUserIdInt, fromUserId]
    );
    transferResults.catalogs = catalogsUpdate.rowCount;
    
    // Transfer project ownership
    const projectsUpdate = await client.query(
      'UPDATE projects SET owner_id = $1 WHERE owner_id = $2 AND is_archived = false RETURNING id',
      [toUserIdInt, fromUserId]
    );
    transferResults.projects = projectsUpdate.rowCount;
  });
  
  res.json({
    message: 'Ownership transferred successfully',
    results: transferResults
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
  if (!userHasAdminAccess(req.user)) {
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

/**
 * POST /api/users/bulk-delete
 * Delete multiple users at once (admin only)
 */
router.post('/bulk-delete', authenticateToken, asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can delete users'
    });
  }
  
  // Validate input
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'userIds must be a non-empty array'
    });
  }
  
  // Prevent deleting self
  const currentUserId = req.user.id;
  if (userIds.includes(currentUserId)) {
    return res.status(400).json({
      error: 'Cannot delete self',
      message: 'You cannot delete your own user account'
    });
  }
  
  const results = {
    successful: [],
    failed: []
  };
  
  // Delete each user
  for (const userId of userIds) {
    try {
      await db.transaction(async (client) => {
        // Check if user exists
        const userCheck = await client.query(
          'SELECT id, username FROM users WHERE id = $1',
          [userId]
        );
        
        if (userCheck.rows.length === 0) {
          results.failed.push({ id: userId, error: 'User not found' });
          return;
        }
        
        // Delete related records in the correct order (foreign key constraints)
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM user_policy_attachments WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM user_groups WHERE user_id = $1', [userId]);
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
        
        results.successful.push({ id: userId, username: userCheck.rows[0].username });
      });
    } catch (error) {
      results.failed.push({ id: userId, error: error.message });
    }
  }
  
  res.json({
    message: `Deleted ${results.successful.length} user(s) successfully`,
    results
  });
}));

/**
 * POST /api/users/roles/bulk-delete
 * Delete multiple roles at once (admin only)
 */
router.post('/roles/bulk-delete', authenticateToken, asyncHandler(async (req, res) => {
  const { roleIds } = req.body;
  
  // Check if user has admin permissions
  const userRoles = req.user.roles || [];
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Only administrators can delete roles'
    });
  }
  
  // Validate input
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'roleIds must be a non-empty array'
    });
  }
  
  const results = {
    successful: [],
    failed: []
  };
  
  // System roles that cannot be deleted
  const protectedRoles = ['Admin', 'User', 'Vendor', 'Governance Manager', 'Data Steward'];
  
  // Delete each role
  for (const roleId of roleIds) {
    try {
      await db.transaction(async (client) => {
        // Check if role exists
        const roleCheck = await client.query(
          'SELECT id, name FROM roles WHERE id = $1',
          [roleId]
        );
        
        if (roleCheck.rows.length === 0) {
          results.failed.push({ id: roleId, error: 'Role not found' });
          return;
        }
        
        const roleName = roleCheck.rows[0].name;
        
        // Prevent deleting protected system roles
        if (protectedRoles.includes(roleName)) {
          results.failed.push({ 
            id: roleId, 
            error: `Cannot delete system role: ${roleName}` 
          });
          return;
        }
        
        // Delete related records
        await client.query('DELETE FROM user_roles WHERE role_id = $1', [roleId]);
        await client.query('DELETE FROM role_policy_attachments WHERE role_id = $1', [roleId]);
        
        // Delete the role
        await client.query('DELETE FROM roles WHERE id = $1', [roleId]);
        
        results.successful.push({ id: roleId, name: roleName });
      });
    } catch (error) {
      results.failed.push({ id: roleId, error: error.message });
    }
  }
  
  res.json({
    message: `Deleted ${results.successful.length} role(s) successfully`,
    results
  });
}));

module.exports = router;
