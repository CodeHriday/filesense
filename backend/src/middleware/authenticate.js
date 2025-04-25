/**
 * Authentication middleware module
 * 
 * This module provides middleware for authenticating requests and enforcing permissions.
 */
const authService = require('../services/authService');
const userRepository = require('../repositories/userRepository');
const db = require('../config/database');

/**
 * Middleware to authenticate API requests using JWT
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required'
      });
    }
    
    // Verify the token
    const decoded = authService.verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
    
    // Check the token type is not a refresh token
    if (decoded.type === 'refresh') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token type'
      });
    }
    
    // Get user from database to ensure it exists and get current roles
    try {
      const user = await userRepository.findById(decoded.id);
      
      // Combine token data with fresh user data
      req.user = {
        ...decoded,
        ...user
      };
      
      // Add user permissions to request for permission checking
      req.user.permissions = await getUserPermissions(user);
      
      console.log('Authentication successful, proceeding to next middleware');
      next();
    } catch (error) {
      if (error.status === 404) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User no longer exists'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error in authenticateToken middleware:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed due to server error'
    });
  }
};

/**
 * Get user permissions based on roles
 * @param {Object} user - User object with roles
 * @returns {Promise<Array>} Array of permission objects
 */
const getUserPermissions = async (user) => {
  // Start with some core permissions based on user existence
  const permissions = [
    'dashboard:read',
    'file_profile:read',
    'quality_checks:read'
  ];
  
  // Add role-based permissions
  if (user.roles && user.roles.length > 0) {
    try {
      // First, get permissions from role_permissions junction table
      const permissionsQuery = `
        SELECT p.* 
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN roles r ON rp.role_id = r.id
        WHERE r.name = ANY($1)
      `;
      
      const permissionsResult = await db.query(permissionsQuery, [user.roles]);
      console.log('Permission query result rows:', permissionsResult.rows.length);
      
      // Add each permission object to the permissions array
      permissionsResult.rows.forEach(permission => {
        permissions.push({
          name: permission.name,
          resource: permission.resource,
          action: permission.action
        });
      });
      
      console.log('Added permissions from role_permissions junction table');
      
      // Get permissions stored directly in the roles table as JSON array
      const rolesQuery = `
        SELECT name, permissions
        FROM roles
        WHERE name = ANY($1)
      `;
      
      const rolesResult = await db.query(rolesQuery, [user.roles]);
      console.log('Roles query result rows:', rolesResult.rows.length);
      
      // Process each role
      rolesResult.rows.forEach(role => {
        console.log(`Processing role ${role.name}`);
        console.log('Role permissions type:', typeof role.permissions);
        console.log('Role permissions:', role.permissions);
        
        // Parse the permissions if it's a JSON string
        let rolePermissions = role.permissions;
        if (typeof rolePermissions === 'string') {
          try {
            rolePermissions = JSON.parse(rolePermissions);
          } catch (e) {
            console.error('Error parsing role permissions JSON:', e);
          }
        }
        
        // Add each permission to the permissions array
        if (Array.isArray(rolePermissions)) {
          console.log('Processing array format permissions');
          rolePermissions.forEach(permission => {
            permissions.push(permission);
          });
        }
      });
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  }
  
  // Remove duplicates and return
  const uniquePermissions = [...new Set(permissions)];
  console.log('Final permission count:', permissions.length);
  return uniquePermissions;
};

/**
 * Middleware to check if user has required permission
 * @param {string} permissionRequired - Permission required (format: 'resource:action')
 * @returns {Function} Express middleware function
 */
const requirePermission = (permissionRequired) => {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    const hasPermission = checkPermission(req.user.permissions, permissionRequired);
    
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `You don't have permission to access this resource`
      });
    }
    
    next();
  };
};

/**
 * Check if user has the required permission
 * @param {Array} userPermissions - Array of user permissions
 * @param {string} requiredPermission - Required permission string
 * @returns {boolean} True if user has permission
 */
const checkPermission = (userPermissions, requiredPermission) => {
  // Direct string match (for string format permissions like 'dashboard:read')
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }
  
  // Split required permission into resource and action
  const [requiredResource, requiredAction] = requiredPermission.split(':');
  
  // Check object format permissions
  for (const permission of userPermissions) {
    if (typeof permission === 'object' && permission !== null) {
      if (
        (permission.resource === requiredResource || permission.resource === '*') &&
        (permission.action === requiredAction || permission.action === '*')
      ) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Middleware to check if user has required role
 * @param {string} roleRequired - Role required
 * @returns {Function} Express middleware function
 */
const requireRole = (roleRequired) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    if (!req.user.roles.includes(roleRequired)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This action requires the ${roleRequired} role`
      });
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireRole,
  getUserPermissions
};