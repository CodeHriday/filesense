/**
 * Authorization Middleware
 * 
 * Checks if the authenticated user has the required permissions
 */

const { systemLogger } = require('../utils/logger');
const db = require('../config/database');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Middleware factory to authorize users based on permissions
 * 
 * @param {string|string[]} requiredPermissions - Required permission(s)
 * @returns {Function} - Express middleware
 */
function authorize(requiredPermissions) {
  return async (req, res, next) => {
    if (!req.user) {
      systemLogger.warn('Authorization failed: No user data in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      // Convert to array if single permission
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];
      
      // Check if user has admin-level access (bypass permission check)
      if (userHasAdminAccess(req.user)) {
        systemLogger.info('User has admin-level access, bypassing permission check');
        return next();
      }
      
      // Check if user has required permissions
      const userPermissions = req.user.permissions || [];
      
      // Convert permissions to strings for comparison
      const userPermStrings = userPermissions.map(p => 
        typeof p === 'object' ? `${p.resource}:${p.action}` : p
      );
      
      const hasAllPermissions = permissions.every(permission => 
        userPermStrings.includes(permission)
      );
      
      if (hasAllPermissions) {
        systemLogger.info('User has required permissions', { 
          permissions: permissions.join(', ') 
        });
        return next();
      }
      
      // Log missing permissions
      systemLogger.warn('User lacks required permissions', { 
        userId: req.user.id,
        requiredPermissions: permissions.join(', '),
        userPermissions: userPermStrings.join(', ')
      });
      
      return res.status(403).json({ 
        error: 'Permission denied',
        requiredPermissions: permissions
      });
    } catch (error) {
      systemLogger.error('Error during authorization', { error: error.message });
      return res.status(500).json({ error: 'Authorization error' });
    }
  };
}

module.exports = authorize;