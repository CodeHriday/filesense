/**
 * Vendor Management Permission Middleware
 * Permission-based access control for vendor management features
 */

const { systemLogger } = require('../utils/logger');

/**
 * Check if user has a specific permission
 * @param {Object} user - User object with permissions array
 * @param {string} permission - Permission string (e.g., 'vendor_agreements:write')
 * @returns {boolean} True if user has permission
 */
function hasPermission(user, permission) {
  if (!user || !user.permissions) {
    return false;
  }

  // Check if permission exists in user.permissions array
  return user.permissions.some(p => {
    if (typeof p === 'string') {
      return p === permission;
    }
    if (typeof p === 'object' && p.name) {
      return p.name === permission;
    }
    return false;
  });
}

/**
 * Middleware to require specific permission
 * @param {string} permission - Required permission
 * @returns {Function} Express middleware
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(req.user, permission)) {
      systemLogger.warn('Permission check failed', {
        userId: req.user.id,
        requiredPermission: permission,
        userPermissions: req.user.permissions?.map(p => typeof p === 'string' ? p : p.name)
      });
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: permission
      });
    }

    // Mark that this permission was checked and granted
    if (!req.grantedPermissions) {
      req.grantedPermissions = [];
    }
    req.grantedPermissions.push(permission);

    next();
  };
}

/**
 * Middleware to check if user has permission (sets flag but doesn't block)
 * Useful for optional permission checks combined with other access rules
 * @param {string} permission - Permission to check
 * @returns {Function} Express middleware
 */
function checkPermission(permission) {
  return (req, res, next) => {
    if (req.user && hasPermission(req.user, permission)) {
      if (!req.grantedPermissions) {
        req.grantedPermissions = [];
      }
      req.grantedPermissions.push(permission);
      
      // Set a flag for this specific permission
      const flagName = 'has' + permission.split(':').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join('');
      req[flagName] = true;
    }
    next();
  };
}

/**
 * Check if user has any of the specified permissions
 * @param {Object} user - User object
 * @param {Array<string>} permissions - Array of permission strings
 * @returns {boolean} True if user has at least one permission
 */
function hasAnyPermission(user, permissions) {
  return permissions.some(permission => hasPermission(user, permission));
}

module.exports = {
  hasPermission,
  hasAnyPermission,
  requirePermission,
  checkPermission
};
