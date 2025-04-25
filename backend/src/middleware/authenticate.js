/**
 * Authentication middleware module
 * 
 * This module provides JWT authentication middleware for securing API routes.
 */
const jwt = require('jsonwebtoken');
const { SECURITY_CONFIG } = require('../config/environment');
const db = require('../config/database');

/**
 * Middleware to authenticate JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = async (req, res, next) => {
  // Skip auth for routes that don't require authentication
  if (req.path === '/api/health' || req.path === '/api/auth/login') {
    return next();
  }
  
  // Skip auth for Business Process Management routes, but set a default user
  if (req.path.match(/^\/api\/groups/) || 
      req.path.match(/^\/api\/business-processes/) || 
      req.path.match(/^\/api\/jobs/)) {
    console.log('Skipping auth for BPM route:', req.path);
    // Set a default admin user to prevent 'undefined' errors
    req.user = { 
      id: 2,  // Admin ID
      roles: ['Admin']
    };
    return next();
  }
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied',
      message: 'No authentication token provided' 
    });
  }
  
  try {
    // Verify token
    const verified = jwt.verify(token, SECURITY_CONFIG.JWT_SECRET);
    
    // Store user data from token
    req.user = verified;
    req.token = token;
    
    // Get permissions for the user based on roles
    if (verified.roles && verified.roles.length > 0) {
      const allPermissions = await getUserPermissions(verified.roles);
      req.user.permissions = allPermissions;
    } else {
      req.user.permissions = [];
    }
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.' 
      });
    }
    
    return res.status(403).json({ 
      error: 'Invalid token',
      message: 'The authentication token is invalid'
    });
  }
};

/**
 * Get all permissions for a user based on their roles
 * @param {Array<string>} roles - Array of role names
 * @returns {Promise<Array>} Array of permission objects
 */
const getUserPermissions = async (roles) => {
  try {
    let allPermissions = [];
    
    // Add critical permissions regardless of role
    const criticalPermissions = [
      { name: 'dashboard_view', resource: 'dashboard', action: 'view' },
      { name: 'file_view', resource: 'file', action: 'view' },
      'dashboard:read',
      'file_profile:read',
      'quality_checks:read'
    ];
    allPermissions = [...criticalPermissions];
    
    // 1. Get permissions from the permissions and role_permissions tables
    const permissionsQuery = `
      SELECT DISTINCT p.name, p.resource, p.action
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN roles r ON rp.role_id = r.id
      WHERE r.name = ANY($1::varchar[])
    `;
    
    const permissionsResult = await db.query(permissionsQuery, [roles]);
    
    // Add permissions from junction table
    const oldSystemPermissions = permissionsResult.rows.map(p => ({
      name: p.name,
      resource: p.resource,
      action: p.action
    }));
    allPermissions = [...allPermissions, ...oldSystemPermissions];
    
    // 2. Get permissions from the JSON array in the roles table
    const rolesWithPermissionsQuery = `
      SELECT name, permissions 
      FROM roles 
      WHERE name = ANY($1::varchar[])
    `;
    
    const rolesResult = await db.query(rolesWithPermissionsQuery, [roles]);
    
    // Process each role's JSON permissions
    for (const role of rolesResult.rows) {
      // Special handling for Executor role
      if (role.name === 'Executor') {
        const executorCorePermissions = [
          'dashboard:read',
          'file_profile:read',
          'quality_checks:read',
          'mappings:read',
          'lineage:read',
          'monitor:read',
          'scheduler:read',
          'badges:read',
          'insights:read',
          'recommendations:read',
          'stories:read'
        ];
        allPermissions = [...allPermissions, ...executorCorePermissions];
      }
      
      if (role.permissions) {
        try {
          // Handle array format
          if (Array.isArray(role.permissions)) {
            allPermissions = [...allPermissions, ...role.permissions];
          } 
          // Handle object format from PostgreSQL JSONB
          else if (typeof role.permissions === 'object') {
            // Check for numeric keys (PostgreSQL JSONB array representation)
            if (Object.keys(role.permissions).some(key => !isNaN(parseInt(key)))) {
              allPermissions = [...allPermissions, ...Object.values(role.permissions)];
            } else {
              allPermissions = [...allPermissions, ...Object.values(role.permissions)];
            }
          }
        } catch (err) {
          console.error(`Error processing permissions for role ${role.name}:`, err);
        }
      }
    }
    
    // Remove duplicates and return
    return [...new Set(allPermissions)];
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return [];
  }
};

/**
 * Check if user has a specific permission
 * @param {Object} req - Express request object
 * @param {string} permission - Permission string or object
 * @returns {boolean} True if user has permission
 */
const hasPermission = (req, permission) => {
  if (!req.user || !req.user.permissions) {
    return false;
  }
  
  // Handle string format permissions like 'resource:action'
  if (typeof permission === 'string') {
    return req.user.permissions.some(p => 
      p === permission || 
      (typeof p === 'object' && p.name === permission)
    );
  }
  
  // Handle object format permissions like { name, resource, action }
  if (typeof permission === 'object') {
    return req.user.permissions.some(p => 
      (p === permission.name) || 
      (typeof p === 'object' && 
        p.name === permission.name && 
        p.resource === permission.resource && 
        p.action === permission.action)
    );
  }
  
  return false;
};

/**
 * Middleware to require specific permission
 * @param {string|Object} permission - Required permission
 * @returns {Function} Express middleware
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (hasPermission(req, permission)) {
      next();
    } else {
      res.status(403).json({ 
        error: 'Permission denied',
        message: 'You do not have permission to access this resource'
      });
    }
  };
};

module.exports = {
  authenticateToken,
  hasPermission,
  requirePermission,
  getUserPermissions
};