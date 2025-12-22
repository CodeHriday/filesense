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
const { userHasAllProjectAccess } = require('../utils/permissionHelpers');

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
      // Extract project_id from request (do this BEFORE admin bypass check)
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

      // Admin bypass (users with admin-level permissions can access all projects)
      // Uses permission-based check instead of hardcoded Admin role name
      if (allowAdminBypass && userHasAllProjectAccess(req.user)) {
        systemLogger.info('Admin bypass granted for project access', {
          userId: req.user.id,
          username: req.user.username,
          projectId
        });
        req.projectId = projectId;
        req.projectRole = 'Admin';
        req.isAdminBypass = true;
        return next();
      }

      // Resolve sub-projects to their parent for access control
      // Check membership against both the project and its parent (if it's a sub-project)
      const parentProjectId = await resolveToParentProject(projectId);
      
      // Check project membership (allow access if user is member of either the project itself OR its parent)
      // Includes both direct membership (project_members) and group-based membership (user_groups -> project_access_groups)
      const membershipResult = await db.query(`
        SELECT 
          p.name as project_name,
          p.is_active as project_active
        FROM projects p
        WHERE p.id IN ($1, $2)
          AND (
            EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = $3
            )
            OR EXISTS (
              SELECT 1 FROM user_groups ug
              INNER JOIN project_access_groups pag ON ug.group_id = pag.group_id
              WHERE pag.project_id = p.id AND ug.user_id = $3
            )
          )
        LIMIT 1
      `, [projectId, parentProjectId, req.user.id]);

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

      // Always check the target project's active status (not the parent's)
      const targetProjectResult = await db.query(`
        SELECT name, is_active 
        FROM projects 
        WHERE id = $1
      `, [projectId]);

      if (targetProjectResult.rows.length === 0) {
        systemLogger.warn('Project access denied: Target project not found', {
          userId: req.user.id,
          projectId
        });
        return res.status(404).json({ 
          error: 'Not found',
          message: 'Project not found'
        });
      }

      const targetProject = targetProjectResult.rows[0];

      // Check if target project is active
      if (!targetProject.is_active) {
        systemLogger.warn('Project access denied: Target project inactive', {
          userId: req.user.id,
          projectId,
          projectName: targetProject.name
        });
        return res.status(403).json({
          error: 'Access denied',
          message: 'This project is not active'
        });
      }

      // Success - attach project context to request
      req.projectId = projectId;
      req.projectName = targetProject.name;
      req.isAdminBypass = false;

      systemLogger.info('Project access granted', {
        userId: req.user.id,
        username: req.user.username,
        projectId,
        projectName: targetProject.name,
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
  const config = getResourceLookupConfig(req, resourceType);
  if (!config) return null;

  const { query, params } = config;

  try {
    const result = await db.query(query, params);
    return result.rows[0]?.project_id ?? null;
  } catch (error) {
    systemLogger.error('Error looking up resource project', {
      error: error.message,
      resourceType,
      params,
    });
    return null;
  }
}

// Pure function – zero cognitive complexity in main flow
function getResourceLookupConfig(req, resourceType) {
  const p = req.params;

  const configs = {
    file: () => {
      if (p.fileId) return { query: 'SELECT project_id FROM files WHERE file_id = $1', params: [p.fileId] };
      if (p.id) return { query: 'SELECT project_id FROM files WHERE id = $1', params: [p.id] };
      return null;
    },

    transformation: () => {
      if (p.mappingId) {
        return { query: 'SELECT project_id FROM transformation_mappings WHERE mapping_id = $1', params: [p.mappingId] };
      }
      if (p.id) {
        const query = /^\d+$/.test(p.id)
          ? 'SELECT project_id FROM transformation_mappings WHERE id = $1'
          : 'SELECT project_id FROM transformation_mappings WHERE mapping_id = $1';
        return { query, params: [p.id] };
      }
      return null;
    },
    mapping_group: () => {
      const id = p.groupId || p.id;
      return id ? { query: 'SELECT project_id FROM mapping_groups WHERE id = $1', params: [id] } : null;
    },
    workflow: () => {
      const id = p.workflowId || p.id;
      return id ? { query: 'SELECT project_id FROM business_processes WHERE id = $1', params: [id] } : null;
    },
    workflow_step: () => {
      if (p.stepId || p.id) {
        const id = p.stepId || p.id;
        return { query: 'SELECT project_id FROM workflow_steps WHERE id = $1', params: [id] };
      }
      if (p.workflowId) {
        return { query: 'SELECT DISTINCT project_id FROM workflow_steps WHERE workflow_id = $1', params: [p.workflowId] };
      }
      return null;
    },
    schedule: () => {
      const id = p.scheduleId || p.id;
      return id ? { query: 'SELECT project_id FROM schedules WHERE id = $1', params: [id] } : null;
    },
    connection: () => {
      const id = p.connectionId || p.id;
      return id ? { query: 'SELECT project_id FROM storage_connections WHERE connection_id = $1', params: [id] } : null;
    },
    alert_policy: () => {
      return p.id ? { query: 'SELECT project_id FROM alert_policies WHERE id = $1', params: [p.id] } : null;
    },
    job: () => {
      return p.jobId ? { query: 'SELECT project_id FROM transformation_jobs WHERE job_id = $1', params: [p.jobId] } : null;
    },
  };

  const builder = configs[resourceType];
  return builder ? builder() : null;
}

/**
 * Resolve a sub-project to its parent project for access control
 * If the project has a parent_id, return the parent_id; otherwise return the original projectId
 */
async function resolveToParentProject(projectId) {
  try {
    const result = await db.query(`
      SELECT parent_id 
      FROM projects 
      WHERE id = $1
    `, [projectId]);
    
    if (result.rows.length === 0) {
      return projectId; // Project not found, return original ID
    }
    
    const parentId = result.rows[0].parent_id;
    return parentId || projectId; // Return parent_id if exists, otherwise the original projectId
  } catch (error) {
    systemLogger.error('Error resolving project to parent', {
      error: error.message,
      projectId
    });
    return projectId; // On error, return original ID
  }
}

/**
 * Helper function to check if user has access to a specific project
 * Can be used programmatically without middleware
 */
async function checkProjectMembership(userId, projectId) {
  try {
    // Check membership against both the project and its parent (if it's a sub-project)
    const parentProjectId = await resolveToParentProject(projectId);
    
    const result = await db.query(`
      SELECT 
        pm.user_id,
        pm.project_id,
        p.name as project_name
      FROM project_members pm
      JOIN projects p ON pm.project_id = p.id
      WHERE pm.project_id IN ($1, $2)
        AND pm.user_id = $3
        AND p.is_active = TRUE
      LIMIT 1
    `, [projectId, parentProjectId, userId]);

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
 * Includes both parent projects and sub-projects (RBAC cascades from parent)
 */
async function getUserProjects(userId) {
  try {
    const result = await db.query(`
      WITH user_direct_parent_projects AS (
        -- Get parent projects user has direct access to
        SELECT DISTINCT
          p.id,
          p.name,
          p.description,
          p.parent_id,
          p.owner_id,
          p.is_active,
          p.created_at
        FROM projects p
        JOIN project_members pm ON p.id = pm.project_id
        WHERE pm.user_id = $1
          AND p.is_active = TRUE
      ),
      user_group_parent_projects AS (
        -- Get parent projects user has access to via groups
        SELECT DISTINCT
          p.id,
          p.name,
          p.description,
          p.parent_id,
          p.owner_id,
          p.is_active,
          p.created_at
        FROM projects p
        JOIN project_access_groups pag ON p.id = pag.project_id
        JOIN user_groups ug ON pag.group_id = ug.group_id
        WHERE ug.user_id = $1
          AND p.is_active = TRUE
      ),
      user_parent_projects AS (
        -- Combine direct and group-based parent project access
        SELECT * FROM user_direct_parent_projects
        UNION
        SELECT * FROM user_group_parent_projects
      ),
      user_sub_projects AS (
        -- Get sub-projects where user has access to parent (via direct or group membership)
        SELECT DISTINCT
          sp.id,
          sp.name,
          sp.description,
          sp.parent_id,
          sp.owner_id,
          sp.is_active,
          sp.created_at
        FROM projects sp
        WHERE sp.parent_id IN (SELECT id FROM user_parent_projects)
          AND sp.is_active = TRUE
      )
      -- Union parent projects and sub-projects
      SELECT id, name, description, parent_id, owner_id, is_active, created_at
      FROM user_parent_projects
      UNION
      SELECT id, name, description, parent_id, owner_id, is_active, created_at
      FROM user_sub_projects
      ORDER BY name
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
