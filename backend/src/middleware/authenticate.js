/**
 * Authentication middleware module
 * 
 * This module provides middleware for authenticating requests and enforcing permissions.
 */
const authService = require('../services/authService');
const userRepository = require('../repositories/userRepository');
const db = require('../config/database');
const { cache } = require('../../config/redis');

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
      // This also populates user.effectiveRoles and user.groupInheritedRoles
      req.user.permissions = await getUserPermissions(user);
      
      // Propagate effective roles (direct + group-inherited) to req.user
      // This ensures downstream middleware (requireRole, etc.) can check all user roles
      if (user.effectiveRoles) {
        req.user.roles = user.effectiveRoles;
        req.user.groupInheritedRoles = user.groupInheritedRoles || [];
      }
      
      // Map permissions to features for frontend UI
      req.user.features = mapPermissionsToFeatures(req.user.permissions);
      
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
 * Map permissions to features for frontend UI
 * @param {Array} permissions - Array of permission strings or objects
 * @returns {Array} Array of feature objects with id, name, route
 */
const mapPermissionsToFeatures = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) {
    return [];
  }
  
  // Feature mapping: permission prefix -> feature object
  const featureMap = {
    'projects': { id: 'projects', name: 'Projects', route: '/project-management' },
    'file_catalog': { id: 'file_catalog', name: 'File Catalog', route: '/file-catalog' },
    'schedule': { id: 'schedule', name: 'Job Schedules', route: '/etl-scheduler' },
    'jobs': { id: 'jobs', name: 'Jobs', route: '/jobs' },
    'alerts': { id: 'alerts', name: 'Alerts', route: '/alerts' },
    'alert': { id: 'alerts', name: 'Alerts', route: '/alerts' }, // Also map 'alert' to alerts
    'dashboard': { id: 'dashboard', name: 'Dashboard', route: '/' },
    'access_groups': { id: 'access_groups', name: 'Access Groups', route: '/group-management' },
    'file_upload': { id: 'file_upload', name: 'File Upload', route: '/upload' },
    'file': { id: 'file_catalog', name: 'File Catalog', route: '/file-catalog' }, // Also map 'file' to file_catalog
    'connection': { id: 'connection', name: 'Connections', route: '/connections' },
    'transformation': { id: 'transformation', name: 'Transformations', route: '/mappings' },
    'mapping_group': { id: 'mapping_group', name: 'Batch Groups', route: '/mapping-groups' },
    'workflow': { id: 'workflow', name: 'Workflows', route: '/workflows' },
    'monitor': { id: 'monitor', name: 'Monitor', route: '/monitor' },
    'file_insights': { id: 'file_insights', name: 'File Insights', route: '/file-insights' },
    'insight': { id: 'file_insights', name: 'File Insights', route: '/file-insights' }, // Also map 'insight' to file_insights
    'lineage': { id: 'lineage', name: 'File Lineage', route: '/lineage' },
    'policies': { id: 'policies', name: 'Policies', route: '/policy-management' },
    'policy': { id: 'policies', name: 'Policies', route: '/policy-management' }, // Also map 'policy' to policies
    'tags': { id: 'tags', name: 'Tags', route: '/tag-management' },
    'tag': { id: 'tags', name: 'Tags', route: '/tag-management' }, // Also map 'tag' to tags
    'users': { id: 'users', name: 'User Management', route: '/users' },
    'user': { id: 'users', name: 'User Management', route: '/users' }, // Also map 'user' to users
    'roles': { id: 'roles', name: 'Role Management', route: '/roles' },
    'role': { id: 'roles', name: 'Role Management', route: '/roles' }, // Also map 'role' to roles
    'audit_trail': { id: 'audit_trail', name: 'Audit Trail', route: '/audit-trail' },
    'audit': { id: 'audit_trail', name: 'Audit Trail', route: '/audit-trail' }, // Also map 'audit' to audit_trail
    'settings': { id: 'settings', name: 'Dashboard Settings', route: '/dashboard-settings' },
  };
  
  const features = new Set();
  
  // Extract unique features from permissions
  permissions.forEach(permission => {
    let prefix = null;
    
    if (typeof permission === 'string') {
      // String format: "dashboard:read"
      prefix = permission.split(':')[0];
    } else if (typeof permission === 'object' && permission !== null) {
      // Object format: {resource: "dashboard", action: "read"}
      prefix = permission.resource;
    }
    
    if (prefix && featureMap[prefix]) {
      features.add(JSON.stringify(featureMap[prefix]));
    }
  });
  
  return Array.from(features).map(f => JSON.parse(f));
};

/**
 * Get roles inherited from access groups the user belongs to
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of role names inherited from groups
 */
const getGroupInheritedRoles = async (userId) => {
  try {
    const groupRolesQuery = `
      SELECT DISTINCT r.name as role_name, r.permissions as role_permissions
      FROM user_groups ug
      INNER JOIN access_group_roles agr ON ug.group_id = agr.group_id
      INNER JOIN roles r ON agr.role_id = r.id
      WHERE ug.user_id = $1
    `;
    
    const result = await db.query(groupRolesQuery, [userId]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching group-inherited roles:', error);
    return [];
  }
};

/**
 * Get user permissions based on roles (with Redis caching)
 * Includes both direct role assignments and roles inherited from access groups
 * @param {Object} user - User object with roles
 * @returns {Promise<Array>} Array of permission objects
 */
const getUserPermissions = async (user) => {
  // Create cache key based on user ID (since we now include group-based roles)
  const cacheKey = `permissions:user:${user.id}`;
  
  // Always compute effective roles (direct + group-inherited) regardless of cache
  // This ensures req.user.roles is always up-to-date
  const directRoles = user.roles || [];
  const groupInheritedRoles = await getGroupInheritedRoles(user.id);
  const groupRoleNames = groupInheritedRoles.map(r => r.role_name);
  
  // Merge all role names (deduplicated)
  const allRoleNames = [...new Set([...directRoles, ...groupRoleNames])];
  
  // Store effective roles on user object for downstream access
  user.effectiveRoles = allRoleNames;
  user.groupInheritedRoles = groupRoleNames;
  
  console.log(`User ${user.id} roles - Direct: [${directRoles.join(', ')}], Group-inherited: [${groupRoleNames.join(', ')}]`);
  
  // Try to get permissions from cache (but we've already computed roles above)
  try {
    const cachedPermissions = await cache.get(cacheKey);
    if (cachedPermissions) {
      console.log(`Cache HIT for permissions (${cacheKey})`);
      return cachedPermissions;
    }
    console.log(`Cache MISS for permissions (${cacheKey})`);
  } catch (error) {
    console.error('Redis cache error (falling back to database):', error);
  }
  
  // Start with some core permissions based on user existence
  const permissions = [
    'dashboard:read',
    'file_profile:read',
    'quality_checks:read'
  ];
  
  // Add role-based permissions from direct roles
  if (allRoleNames.length > 0) {
    try {
      // First, get permissions from role_permissions junction table
      const permissionsQuery = `
        SELECT p.* 
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN roles r ON rp.role_id = r.id
        WHERE r.name = ANY($1)
      `;
      
      const permissionsResult = await db.query(permissionsQuery, [allRoleNames]);
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
      
      const rolesResult = await db.query(rolesQuery, [allRoleNames]);
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
  
  // Cache the permissions for 10 minutes (600 seconds)
  try {
    await cache.set(cacheKey, uniquePermissions, 600);
    console.log(`Cached permissions with key: ${cacheKey}`);
  } catch (error) {
    console.error('Error caching permissions:', error);
  }
  
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