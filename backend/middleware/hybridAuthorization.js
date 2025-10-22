/**
 * Hybrid Authorization Middleware
 * 
 * Combines existing role/permission checks with new policy-based authorization.
 * Provides backward compatibility while enabling enterprise RBAC features.
 */

const PolicyEngine = require('../services/policyEngine');
const { systemLogger } = require('../utils/logger');

class HybridAuthorizationMiddleware {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.policyEngine = new PolicyEngine(dbPool);
  }

  /**
   * Check if user has a specific role (legacy support)
   */
  requireRole(roleName) {
    return (req, res, next) => {
      if (!req.user || !req.user.roles || !req.user.roles.includes(roleName)) {
        systemLogger.warn('Role check failed', {
          userId: req.user?.id,
          requiredRole: roleName,
          userRoles: req.user?.roles
        });
        return res.status(403).json({ error: `Access denied. ${roleName} role required.` });
      }
      next();
    };
  }

  /**
   * Check if user has any of the specified roles
   */
  requireAnyRole(roles) {
    return (req, res, next) => {
      if (!req.user || !req.user.roles) {
        return res.status(403).json({ error: 'Access denied. No roles assigned.' });
      }
      
      const hasRole = roles.some(role => req.user.roles.includes(role));
      if (!hasRole) {
        systemLogger.warn('Role check failed (any)', {
          userId: req.user?.id,
          requiredRoles: roles,
          userRoles: req.user?.roles
        });
        return res.status(403).json({ 
          error: `Access denied. One of the following roles required: ${roles.join(', ')}` 
        });
      }
      next();
    };
  }

  /**
   * Check permission using legacy system (from user.permissions)
   */
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user || !req.user.permissions) {
        return res.status(403).json({ error: 'Access denied. No permissions assigned.' });
      }

      const hasPermission = req.user.permissions.includes(permission) ||
                           req.user.permissions.some(p => 
                             typeof p === 'object' && p.name === permission
                           );

      if (!hasPermission) {
        systemLogger.warn('Permission check failed', {
          userId: req.user?.id,
          requiredPermission: permission,
          userPermissions: req.user?.permissions
        });
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      }
      next();
    };
  }

  /**
   * Hybrid check: Try policy engine first, fall back to legacy permissions
   */
  requireAuthorization(action, options = {}) {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const resourceType = options.resourceType ? options.resourceType(req) : null;
        const resourceId = options.resourceId ? options.resourceId(req) : null;
        const additionalContext = options.context ? options.context(req) : {};

        // Try policy engine first
        try {
          const decision = await this.policyEngine.evaluateAccess(
            userId,
            action,
            resourceType,
            resourceId,
            additionalContext
          );

          if (decision.allowed) {
            systemLogger.debug('Policy check passed', {
              userId,
              action,
              resourceType,
              resourceId,
              method: 'policy_engine'
            });
            req.authorizationMethod = 'policy_engine';
            req.policyDecision = decision;
            return next();
          }

          // If policy explicitly denies, don't fall back
          if (decision.decision === 'EXPLICIT_DENY') {
            systemLogger.warn('Policy explicitly denied access', {
              userId,
              action,
              resourceType,
              resourceId,
              reason: decision.reason
            });
            return res.status(403).json({
              error: 'Access denied',
              reason: decision.reason
            });
          }
        } catch (policyError) {
          systemLogger.warn('Policy engine error, falling back to legacy', { error: policyError.message });
        }

        // Fall back to legacy permission check if policy engine didn't explicitly allow or deny
        if (options.legacyPermission) {
          const hasPermission = req.user.permissions?.includes(options.legacyPermission) ||
                               req.user.permissions?.some(p => 
                                 typeof p === 'object' && p.name === options.legacyPermission
                               );

          if (hasPermission) {
            systemLogger.debug('Legacy permission check passed', {
              userId,
              permission: options.legacyPermission,
              method: 'legacy_rbac'
            });
            req.authorizationMethod = 'legacy_rbac';
            return next();
          }
        }

        // Fall back to role check if specified
        if (options.legacyRole) {
          const hasRole = req.user.roles?.includes(options.legacyRole);
          if (hasRole) {
            systemLogger.debug('Legacy role check passed', {
              userId,
              role: options.legacyRole,
              method: 'legacy_role'
            });
            req.authorizationMethod = 'legacy_role';
            return next();
          }
        }

        // All checks failed
        systemLogger.warn('Authorization failed (all methods)', {
          userId,
          action,
          resourceType,
          resourceId,
          legacyPermission: options.legacyPermission,
          legacyRole: options.legacyRole
        });

        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      } catch (error) {
        systemLogger.error('Error during hybrid authorization', error);
        return res.status(500).json({ error: 'Authorization check failed' });
      }
    };
  }

  /**
   * Utility to check authorization programmatically (for use in route handlers)
   */
  async checkAuthorization(userId, action, resourceType = null, resourceId = null, context = {}) {
    try {
      const decision = await this.policyEngine.evaluateAccess(
        userId,
        action,
        resourceType,
        resourceId,
        context
      );
      return decision.allowed;
    } catch (error) {
      systemLogger.error('Error checking authorization', error);
      return false;
    }
  }
}

// Create singleton instance for server.js to use
let authMiddlewareInstance = null;

function initializeAuthMiddleware(dbPool) {
  if (!authMiddlewareInstance) {
    authMiddlewareInstance = new HybridAuthorizationMiddleware(dbPool);
  }
  return authMiddlewareInstance;
}

module.exports = { HybridAuthorizationMiddleware, initializeAuthMiddleware };
