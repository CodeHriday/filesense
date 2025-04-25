/**
 * Authorization Middleware
 * 
 * Checks if the authenticated user has the required permissions
 */

const { authLogger } = require('../utils/logger');
const db = require('../config/database');

/**
 * Middleware factory to authorize users based on permissions
 * 
 * @param {string|string[]} requiredPermissions - Required permission(s)
 * @returns {Function} - Express middleware
 */
function authorize(requiredPermissions) {
  return async (req, res, next) => {
    if (!req.user) {
      authLogger.warn('Authorization failed: No user data in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      // Convert to array if single permission
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];
      
      // Check if user has admin role (bypass permission check)
      if (req.user.roles && req.user.roles.includes('Admin')) {
        authLogger.info('User has Admin role, bypassing permission check');
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
        authLogger.info('User has required permissions', { 
          permissions: permissions.join(', ') 
        });
        return next();
      }
      
      // Log missing permissions
      authLogger.warn('User lacks required permissions', { 
        userId: req.user.id,
        requiredPermissions: permissions.join(', '),
        userPermissions: userPermStrings.join(', ')
      });
      
      return res.status(403).json({ 
        error: 'Permission denied',
        requiredPermissions: permissions
      });
    } catch (error) {
      authLogger.error('Error during authorization', { error: error.message });
      return res.status(500).json({ error: 'Authorization error' });
    }
  };
}

module.exports = authorize;