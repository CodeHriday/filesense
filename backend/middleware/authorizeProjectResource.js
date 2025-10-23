/**
 * Comprehensive Project Resource Authorization Middleware
 * 
 * Combines three layers of access control:
 * 1. Project Membership - Must be a member of the project
 * 2. Global Permissions - Must have required permissions
 * 3. Project Policies - Policy engine evaluation (optional, future expansion)
 * 
 * This follows the principle of defense-in-depth for enterprise access control.
 * 
 * Usage:
 *   app.get('/api/files/:fileId',
 *     authenticateToken,
 *     authorizeProjectResource({
 *       resourceType: 'file',
 *       requiredPermissions: ['file:read'],
 *       projectRoles: ['Owner', 'Admin', 'Member', 'Viewer']
 *     }),
 *     handler
 *   );
 */

const { requireProjectAccess, checkProjectMembership } = require('./requireProjectAccess');
const ProjectPolicyEngine = require('../services/ProjectPolicyEngine');
const { authLogger } = require('../utils/logger');

/**
 * Middleware factory for project resource authorization
 * 
 * @param {Object} options - Configuration
 * @param {string} options.resourceType - Resource type (file, workflow, etc.)
 * @param {string|string[]} options.requiredPermissions - Global permissions required
 * @param {string[]} options.projectRoles - Allowed project roles (default: all)
 * @param {boolean} options.allowAdminBypass - Allow global admins to bypass (default: true)
 * @param {boolean} options.enforcePolicies - Enforce policy engine evaluation (default: false)
 * @param {Function} options.getProjectId - Custom project ID extraction (optional)
 * @returns {Function} Express middleware
 */
function authorizeProjectResource(options = {}) {
  const {
    resourceType,
    requiredPermissions = [],
    projectRoles = ['Owner', 'Admin', 'Member', 'Viewer'],
    allowAdminBypass = true,
    enforcePolicies = false,
    getProjectId = null
  } = options;

  return async (req, res, next) => {
    if (!req.user) {
      authLogger.warn('Authorization failed: No authenticated user');
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // ===============================
      // Layer 1: Project Membership Check
      // ===============================
      const projectAccessMiddleware = requireProjectAccess({
        resourceType,
        projectRoles,
        allowAdminBypass,
        getProjectId
      });

      // Execute project membership check
      await new Promise((resolve, reject) => {
        projectAccessMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }).catch(error => {
        // Project access check failed, response already sent by requireProjectAccess
        throw new Error('Project access denied');
      });

      // Check if response was already sent (access denied)
      if (res.headersSent) {
        return;
      }

      // ===============================
      // Layer 2: Global Permission Check
      // ===============================
      if (requiredPermissions && requiredPermissions.length > 0) {
        const permissions = Array.isArray(requiredPermissions)
          ? requiredPermissions
          : [requiredPermissions];

        // Admin bypass was already handled in Layer 1
        if (!req.isAdminBypass) {
          const userPermissions = req.user.permissions || [];
          const userPermStrings = userPermissions.map(p =>
            typeof p === 'object' ? `${p.resource}:${p.action}` : p
          );

          const hasAllPermissions = permissions.every(permission =>
            userPermStrings.includes(permission)
          );

          if (!hasAllPermissions) {
            authLogger.warn('Permission denied at global level', {
              userId: req.user.id,
              username: req.user.username,
              projectId: req.projectId,
              requiredPermissions: permissions,
              userPermissions: userPermStrings
            });

            return res.status(403).json({
              error: 'Permission denied',
              message: 'You do not have the required permissions for this action',
              requiredPermissions: permissions
            });
          }

          authLogger.info('Global permissions verified', {
            userId: req.user.id,
            permissions: permissions.join(', ')
          });
        }
      }

      // ===============================
      // Layer 3: Policy Engine Evaluation (Optional)
      // ===============================
      if (enforcePolicies && req.projectId && !req.isAdminBypass) {
        const action = extractAction(req);
        const resourceId = extractResourceId(req, resourceType);

        const policyEvaluation = await ProjectPolicyEngine.evaluate({
          userId: req.user.id,
          projectId: req.projectId,
          action,
          resourceType,
          resourceId,
          context: {
            method: req.method,
            path: req.path,
            projectRole: req.projectRole
          }
        });

        if (!policyEvaluation.allowed) {
          authLogger.warn('Policy evaluation denied access', {
            userId: req.user.id,
            username: req.user.username,
            projectId: req.projectId,
            action,
            resourceType,
            resourceId,
            reason: policyEvaluation.reason
          });

          return res.status(403).json({
            error: 'Access denied by policy',
            message: policyEvaluation.reason
          });
        }

        authLogger.info('Policy evaluation allowed access', {
          userId: req.user.id,
          projectId: req.projectId,
          action,
          resourceType,
          matchedPolicies: policyEvaluation.matchedPolicies.length
        });

        // Attach policy evaluation result to request
        req.policyEvaluation = policyEvaluation;
      }

      // ===============================
      // All Layers Passed
      // ===============================
      authLogger.info('Full authorization succeeded', {
        userId: req.user.id,
        username: req.user.username,
        projectId: req.projectId,
        projectRole: req.projectRole,
        resourceType,
        isAdminBypass: req.isAdminBypass,
        policiesEnforced: enforcePolicies
      });

      next();

    } catch (error) {
      // Only log error if response not already sent
      if (!res.headersSent) {
        authLogger.error('Authorization error', {
          error: error.message,
          stack: error.stack,
          userId: req.user?.id,
          path: req.path
        });

        return res.status(500).json({ error: 'Authorization failed' });
      }
    }
  };
}

/**
 * Extract action from request method and path
 */
function extractAction(req) {
  const method = req.method.toLowerCase();

  // Map HTTP methods to actions
  const actionMap = {
    get: 'read',
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'delete'
  };

  const baseAction = actionMap[method] || 'unknown';

  // Special cases for specific endpoints
  if (req.path.includes('/execute')) {
    return 'execute';
  }
  if (req.path.includes('/profile')) {
    return 'profile';
  }

  return baseAction;
}

/**
 * Extract resource ID from request
 */
function extractResourceId(req, resourceType) {
  // Try common parameter names
  const idParams = [
    'fileId',
    'id',
    'mappingId',
    'groupId',
    'workflowId',
    'scheduleId',
    'connectionId',
    'jobId'
  ];

  for (const param of idParams) {
    if (req.params[param]) {
      return req.params[param];
    }
  }

  return '*';
}

module.exports = authorizeProjectResource;
