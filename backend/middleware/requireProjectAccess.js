/**
 * Project-Level Access Control Middleware
 * 
 * Enforces project membership and role-based access following AWS/Databricks patterns.
 * Users must be project members to access project resources.
 * 
 * Usage:
 *   app.get('/api/files/:fileId', 
 *     authenticateToken,
 *     requireProjectAccess({ resourceType: 'file', projectRoles: ['Owner', 'Admin', 'Member', 'Viewer'] }),
 *     handler
 *   );
 */

const db = require('../config/database');
const { systemLogger } = require('../utils/logger');

/**
 * Middleware factory to enforce project-level access control
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.resourceType - Type of resource (file, workflow, transformation, etc.)
 * @param {string[]} options.projectRoles - Allowed project roles (Owner, Admin, Member, Viewer)
 * @param {boolean} options.allowAdminBypass - Allow global admins to bypass (default: true)
 * @param {Function} options.getProjectId - Custom function to extract project_id (optional)
 * @returns {Function} Express middleware
 */
function requireProjectAccess(options = {}) {
  const {
    resourceType,
    projectRoles = ['Owner', 'Admin', 'Member', 'Viewer'],
    allowAdminBypass = true,
    getProjectId = null
  } = options;

  return async (req, res, next) => {
    if (!req.user) {
      systemLogger.warn('Project access check failed: No authenticated user');
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Admin bypass (global admins can access all projects)
      if (allowAdminBypass && req.user.roles && req.user.roles.includes('Admin')) {
        systemLogger.info('Admin bypass granted for project access', {
          userId: req.user.id,
          username: req.user.username
        });
        req.projectRole = 'Admin';
        req.isAdminBypass = true;
        return next();
      }

      // Extract project_id from request
      let projectId = null;

      if (getProjectId && typeof getProjectId === 'function') {
        // Custom project ID extraction
        projectId = await getProjectId(req, db);
      } else {
        // Standard extraction logic
        projectId = await extractProjectId(req, resourceType);
      }

      if (!projectId) {
        systemLogger.warn('Project access denied: Unable to determine project_id', {
          userId: req.user.id,
          resourceType,
          path: req.path
        });
        return res.status(400).json({ error: 'Project context required' });
      }

      // Check project membership
      const membershipResult = await db.query(`
        SELECT 
          p.name as project_name,
          p.is_active as project_active
        FROM project_members pm
        JOIN projects p ON pm.project_id = p.id
        WHERE pm.project_id = $1 
          AND pm.user_id = $2
      `, [projectId, req.user.id]);

      if (membershipResult.rows.length === 0) {
        systemLogger.warn('Project access denied: User not a member', {
          userId: req.user.id,
          username: req.user.username,
          projectId,
          resourceType
        });
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You are not a member of this project'
        });
      }

      const membership = membershipResult.rows[0];

      // Check if project is active
      if (!membership.project_active) {
        systemLogger.warn('Project access denied: Project inactive', {
          userId: req.user.id,
          projectId,
          projectName: membership.project_name
        });
        return res.status(403).json({
          error: 'Access denied',
          message: 'This project is not active'
        });
      }

      // Success - attach project context to request
      req.projectId = projectId;
      req.projectName = membership.project_name;
      req.isAdminBypass = false;

      systemLogger.info('Project access granted', {
        userId: req.user.id,
        username: req.user.username,
        projectId,
        projectName: membership.project_name,
        resourceType
      });

      next();

    } catch (error) {
      systemLogger.error('Error during project access check', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        path: req.path
      });
      return res.status(500).json({ error: 'Project access check failed' });
    }
  };
}

/**
 * Standard project ID extraction logic
 * Tries multiple sources in order of precedence
 */
async function extractProjectId(req, resourceType) {
  // 1. Direct project_id in params or query
  if (req.params.projectId) {
    return parseInt(req.params.projectId, 10);
  }
  if (req.query.project_id) {
    return parseInt(req.query.project_id, 10);
  }
  if (req.body && req.body.project_id) {
    return parseInt(req.body.project_id, 10);
  }

  // 2. Lookup project_id from resource
  if (resourceType) {
    return await lookupResourceProject(req, resourceType);
  }

  return null;
}

/**
 * Lookup project_id from resource tables
 */
async function lookupResourceProject(req, resourceType) {
  let query = null;
  let params = null;

  switch (resourceType) {
    case 'file':
      if (req.params.fileId) {
        query = 'SELECT project_id FROM files WHERE file_id = $1';
        params = [req.params.fileId];
      } else if (req.params.id) {
        query = 'SELECT project_id FROM files WHERE id = $1';
        params = [req.params.id];
      }
      break;

    case 'transformation':
      if (req.params.mappingId) {
        query = 'SELECT project_id FROM transformation_mappings WHERE mapping_id = $1';
        params = [req.params.mappingId];
      } else if (req.params.id) {
        // Check if id is numeric or a mapping_id string
        const isNumeric = /^\d+$/.test(req.params.id);
        if (isNumeric) {
          query = 'SELECT project_id FROM transformation_mappings WHERE id = $1';
        } else {
          query = 'SELECT project_id FROM transformation_mappings WHERE mapping_id = $1';
        }
        params = [req.params.id];
      }
      break;

    case 'mapping_group':
      if (req.params.groupId || req.params.id) {
        query = 'SELECT project_id FROM mapping_groups WHERE id = $1';
        params = [req.params.groupId || req.params.id];
      }
      break;

    case 'workflow':
      // Workflows are stored in business_processes table
      if (req.params.workflowId || req.params.id) {
        query = 'SELECT project_id FROM business_processes WHERE id = $1';
        params = [req.params.workflowId || req.params.id];
      }
      break;

    case 'workflow_step':
      // Workflow steps have their own project_id
      if (req.params.stepId || req.params.id) {
        query = 'SELECT project_id FROM workflow_steps WHERE id = $1';
        params = [req.params.stepId || req.params.id];
      } else if (req.params.workflowId) {
        // If we have workflow ID, get project from workflow's steps
        query = 'SELECT DISTINCT project_id FROM workflow_steps WHERE workflow_id = $1';
        params = [req.params.workflowId];
      }
      break;

    case 'schedule':
      if (req.params.scheduleId || req.params.id) {
        query = 'SELECT project_id FROM schedules WHERE id = $1';
        params = [req.params.scheduleId || req.params.id];
      }
      break;

    case 'connection':
      if (req.params.connectionId || req.params.id) {
        query = 'SELECT project_id FROM storage_connections WHERE connection_id = $1 OR id = $1';
        params = [req.params.connectionId || req.params.id];
      }
      break;

    case 'job':
      if (req.params.jobId) {
        query = 'SELECT project_id FROM transformation_jobs WHERE job_id = $1';
        params = [req.params.jobId];
      }
      break;

    default:
      return null;
  }

  if (query && params) {
    try {
      const result = await db.query(query, params);
      if (result.rows.length > 0) {
        return result.rows[0].project_id;
      }
    } catch (error) {
      systemLogger.error('Error looking up resource project', {
        error: error.message,
        resourceType,
        params
      });
    }
  }

  return null;
}

/**
 * Helper function to check if user has access to a specific project
 * Can be used programmatically without middleware
 */
async function checkProjectMembership(userId, projectId) {
  try {
    const result = await db.query(`
      SELECT 
        pm.user_id,
        pm.project_id,
        p.name as project_name
      FROM project_members pm
      JOIN projects p ON pm.project_id = p.id
      WHERE pm.project_id = $1 
        AND pm.user_id = $2
        AND p.is_active = TRUE
    `, [projectId, userId]);

    if (result.rows.length === 0) {
      return { hasAccess: false, role: null, projectName: null };
    }

    return {
      hasAccess: true,
      role: null,
      projectName: result.rows[0].project_name
    };
  } catch (error) {
    systemLogger.error('Error checking project membership', {
      error: error.message,
      userId,
      projectId
    });
    return { hasAccess: false, role: null, projectName: null };
  }
}

/**
 * Helper to get all projects accessible by a user
 */
async function getUserProjects(userId) {
  try {
    const result = await db.query(`
      SELECT DISTINCT
        p.id,
        p.name,
        p.description
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = $1
        AND p.is_active = TRUE
      ORDER BY p.name
    `, [userId]);

    return result.rows;
  } catch (error) {
    systemLogger.error('Error getting user projects', {
      error: error.message,
      userId
    });
    return [];
  }
}

module.exports = {
  requireProjectAccess,
  checkProjectMembership,
  getUserProjects
};
