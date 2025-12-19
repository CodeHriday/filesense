const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../src/middleware/authenticate');
const { systemLogger } = require('../utils/logger');
const { requireProjectAccess, getUserProjects } = require('../middleware/requireProjectAccess');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Get all sub-projects for a given parent project
 * GET /api/projects/:projectId/sub-projects
 */
router.get('/:projectId/sub-projects', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check if user has access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }
    }

    // Fetch all sub-projects for this parent project
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.owner_id,
        p.parent_id,
        p.is_active,
        p.metadata,
        p.settings,
        p.created_at,
        p.updated_at,
        u.username as owner_name,
        COUNT(DISTINCT f.file_id) as file_count,
        COALESCE(SUM(f.file_size), 0) as total_size
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN files f ON f.sub_project_id = p.id
      WHERE p.parent_id = $1
      GROUP BY p.id, u.username
      ORDER BY p.created_at DESC
    `, [projectId]);

    res.json({
      success: true,
      subProjects: result.rows,
      parentProjectId: parseInt(projectId)
    });

  } catch (error) {
    systemLogger.error('Error fetching sub-projects:', error);
    res.status(500).json({
      error: 'Failed to fetch sub-projects',
      message: error.message
    });
  }
});

/**
 * Create a new sub-project
 * POST /api/projects/:projectId/sub-projects
 */
router.post('/:projectId/sub-projects', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description } = req.body;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Sub-project name is required'
      });
    }

    // Check if user has access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to create sub-projects in this project'
        });
      }
    }

    // Verify parent project exists
    const parentCheck = await pool.query(
      'SELECT id, name FROM projects WHERE id = $1',
      [projectId]
    );

    if (parentCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Parent project not found',
        message: 'The specified parent project does not exist'
      });
    }

    // Check for duplicate name within the same parent
    const duplicateCheck = await pool.query(
      'SELECT id FROM projects WHERE parent_id = $1 AND LOWER(name) = LOWER($2)',
      [projectId, name.trim()]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Duplicate name',
        message: 'A sub-project with this name already exists in this project'
      });
    }

    // Create the sub-project
    const result = await pool.query(`
      INSERT INTO projects (name, description, parent_id, owner_id, is_default, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, FALSE, TRUE, NOW(), NOW())
      RETURNING 
        id, name, description, parent_id, owner_id, is_active, 
        metadata, settings, created_at, updated_at
    `, [name.trim(), description?.trim() || null, projectId, userId]);

    const newSubProject = result.rows[0];

    systemLogger.info('Sub-project created', {
      subProjectId: newSubProject.id,
      name: newSubProject.name,
      parentProjectId: projectId,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      subProject: newSubProject,
      message: 'Sub-project created successfully'
    });

  } catch (error) {
    systemLogger.error('Error creating sub-project:', error);
    res.status(500).json({
      error: 'Failed to create sub-project',
      message: error.message
    });
  }
});

/**
 * Update a sub-project
 * PUT /api/projects/:projectId/sub-projects/:subProjectId
 */
router.put('/:projectId/sub-projects/:subProjectId', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId } = req.params;
    const { name, description, is_active } = req.body;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check if user has access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to update sub-projects in this project'
        });
      }
    }

    // Verify sub-project exists and belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id, name, parent_id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Check for duplicate name if name is being changed
    if (name && name.trim() !== subProjectCheck.rows[0].name) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM projects WHERE parent_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
        [projectId, name.trim(), subProjectId]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          error: 'Duplicate name',
          message: 'A sub-project with this name already exists in this project'
        });
      }
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description?.trim() || null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }

    updates.push(`updated_at = NOW()`);
    values.push(subProjectId);

    const result = await pool.query(`
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING 
        id, name, description, parent_id, owner_id, is_active,
        metadata, settings, created_at, updated_at
    `, values);

    systemLogger.info('Sub-project updated', {
      subProjectId,
      parentProjectId: projectId,
      updatedBy: userId
    });

    res.json({
      success: true,
      subProject: result.rows[0],
      message: 'Sub-project updated successfully'
    });

  } catch (error) {
    systemLogger.error('Error updating sub-project:', error);
    res.status(500).json({
      error: 'Failed to update sub-project',
      message: error.message
    });
  }
});

/**
 * Delete a sub-project
 * DELETE /api/projects/:projectId/sub-projects/:subProjectId
 */
router.delete('/:projectId/sub-projects/:subProjectId', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId } = req.params;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check if user has access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to delete sub-projects in this project'
        });
      }
    }

    // Verify sub-project exists and belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id, name FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Check if sub-project has files
    const fileCheck = await pool.query(
      'SELECT COUNT(*) as file_count FROM files WHERE sub_project_id = $1',
      [subProjectId]
    );

    if (parseInt(fileCheck.rows[0].file_count) > 0) {
      return res.status(400).json({
        error: 'Sub-project has files',
        message: `Cannot delete sub-project. It contains ${fileCheck.rows[0].file_count} file(s). Please move or delete the files first.`
      });
    }

    // Delete the sub-project
    await pool.query('DELETE FROM projects WHERE id = $1', [subProjectId]);

    systemLogger.info('Sub-project deleted', {
      subProjectId,
      parentProjectId: projectId,
      deletedBy: userId
    });

    res.json({
      success: true,
      message: 'Sub-project deleted successfully'
    });

  } catch (error) {
    systemLogger.error('Error deleting sub-project:', error);
    res.status(500).json({
      error: 'Failed to delete sub-project',
      message: error.message
    });
  }
});

/**
 * Get members for a sub-project
 * GET /api/projects/:projectId/sub-projects/:subProjectId/members
 */
router.get('/:projectId/sub-projects/:subProjectId/members', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId } = req.params;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }
    }

    // Verify sub-project belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Fetch members
    const result = await pool.query(`
      SELECT 
        spm.id,
        spm.sub_project_id,
        spm.user_id,
        spm.role,
        spm.created_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name
      FROM sub_project_members spm
      JOIN users u ON spm.user_id = u.id
      WHERE spm.sub_project_id = $1
      ORDER BY u.username
    `, [subProjectId]);

    res.json({
      success: true,
      members: result.rows
    });

  } catch (error) {
    systemLogger.error('Error fetching sub-project members:', error);
    res.status(500).json({
      error: 'Failed to fetch sub-project members',
      message: error.message
    });
  }
});

/**
 * Add member to sub-project
 * POST /api/projects/:projectId/sub-projects/:subProjectId/members
 */
router.post('/:projectId/sub-projects/:subProjectId/members', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId } = req.params;
    const { user_id, role } = req.body;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Validation
    if (!user_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'User ID is required'
      });
    }

    // Check access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to manage members in this project'
        });
      }
    }

    // Verify sub-project belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Add member
    const result = await pool.query(`
      INSERT INTO sub_project_members (sub_project_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (sub_project_id, user_id) DO UPDATE SET role = EXCLUDED.role
      RETURNING id, sub_project_id, user_id, role, created_at
    `, [subProjectId, user_id, role || 'member']);

    systemLogger.info('Sub-project member added', {
      subProjectId,
      userId: user_id,
      addedBy: userId
    });

    res.status(201).json({
      success: true,
      member: result.rows[0],
      message: 'Member added successfully'
    });

  } catch (error) {
    systemLogger.error('Error adding sub-project member:', error);
    res.status(500).json({
      error: 'Failed to add sub-project member',
      message: error.message
    });
  }
});

/**
 * Remove member from sub-project
 * DELETE /api/projects/:projectId/sub-projects/:subProjectId/members/:memberId
 */
router.delete('/:projectId/sub-projects/:subProjectId/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId, memberId } = req.params;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to manage members in this project'
        });
      }
    }

    // Verify sub-project belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Remove member
    const result = await pool.query(
      'DELETE FROM sub_project_members WHERE id = $1 AND sub_project_id = $2 RETURNING id',
      [memberId, subProjectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Member not found',
        message: 'The specified member does not exist in this sub-project'
      });
    }

    systemLogger.info('Sub-project member removed', {
      subProjectId,
      memberId,
      removedBy: userId
    });

    res.json({
      success: true,
      message: 'Member removed successfully'
    });

  } catch (error) {
    systemLogger.error('Error removing sub-project member:', error);
    res.status(500).json({
      error: 'Failed to remove sub-project member',
      message: error.message
    });
  }
});

/**
 * Get access groups for a sub-project
 * GET /api/projects/:projectId/sub-projects/:subProjectId/groups
 */
router.get('/:projectId/sub-projects/:subProjectId/groups', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId } = req.params;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }
    }

    // Verify sub-project belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Fetch access groups
    const result = await pool.query(`
      SELECT 
        spag.id,
        spag.sub_project_id,
        spag.group_id,
        spag.created_at,
        ag.name as group_name,
        ag.description as group_description,
        COUNT(DISTINCT ug.user_id) as member_count
      FROM sub_project_access_groups spag
      JOIN access_groups ag ON spag.group_id = ag.id
      LEFT JOIN user_groups ug ON ag.id = ug.group_id
      WHERE spag.sub_project_id = $1
      GROUP BY spag.id, ag.id
      ORDER BY ag.name
    `, [subProjectId]);

    res.json({
      success: true,
      groups: result.rows
    });

  } catch (error) {
    systemLogger.error('Error fetching sub-project access groups:', error);
    res.status(500).json({
      error: 'Failed to fetch sub-project access groups',
      message: error.message
    });
  }
});

/**
 * Add access group to sub-project
 * POST /api/projects/:projectId/sub-projects/:subProjectId/groups
 */
router.post('/:projectId/sub-projects/:subProjectId/groups', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId } = req.params;
    const { group_id } = req.body;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Validation
    if (!group_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Group ID is required'
      });
    }

    // Check access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to manage groups in this project'
        });
      }
    }

    // Verify sub-project belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Verify group exists
    const groupCheck = await pool.query('SELECT id FROM access_groups WHERE id = $1', [group_id]);
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Group not found',
        message: 'The specified access group does not exist'
      });
    }

    // Add group
    const result = await pool.query(`
      INSERT INTO sub_project_access_groups (sub_project_id, group_id)
      VALUES ($1, $2)
      ON CONFLICT (sub_project_id, group_id) DO NOTHING
      RETURNING id, sub_project_id, group_id, created_at
    `, [subProjectId, group_id]);

    systemLogger.info('Sub-project access group added', {
      subProjectId,
      groupId: group_id,
      addedBy: userId
    });

    res.status(201).json({
      success: true,
      group: result.rows[0] || { sub_project_id: subProjectId, group_id: group_id },
      message: 'Access group added successfully'
    });

  } catch (error) {
    systemLogger.error('Error adding sub-project access group:', error);
    res.status(500).json({
      error: 'Failed to add sub-project access group',
      message: error.message
    });
  }
});

/**
 * Remove access group from sub-project
 * DELETE /api/projects/:projectId/sub-projects/:subProjectId/groups/:groupAssignmentId
 */
router.delete('/:projectId/sub-projects/:subProjectId/groups/:groupAssignmentId', authenticateToken, async (req, res) => {
  try {
    const { projectId, subProjectId, groupAssignmentId } = req.params;
    const pool = req.app.locals.pool;
    const userId = req.user.id;
    const isAdmin = userHasAdminAccess(req.user);

    // Check access to parent project
    if (!isAdmin) {
      const userProjects = await getUserProjects(userId);
      const hasAccess = userProjects.some(p => p.id === parseInt(projectId));
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to manage groups in this project'
        });
      }
    }

    // Verify sub-project belongs to parent
    const subProjectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND parent_id = $2',
      [subProjectId, projectId]
    );

    if (subProjectCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Sub-project not found',
        message: 'The specified sub-project does not exist or does not belong to this parent project'
      });
    }

    // Remove group
    const result = await pool.query(
      'DELETE FROM sub_project_access_groups WHERE id = $1 AND sub_project_id = $2 RETURNING id',
      [groupAssignmentId, subProjectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Group assignment not found',
        message: 'The specified group assignment does not exist in this sub-project'
      });
    }

    systemLogger.info('Sub-project access group removed', {
      subProjectId,
      groupAssignmentId,
      removedBy: userId
    });

    res.json({
      success: true,
      message: 'Access group removed successfully'
    });

  } catch (error) {
    systemLogger.error('Error removing sub-project access group:', error);
    res.status(500).json({
      error: 'Failed to remove sub-project access group',
      message: error.message
    });
  }
});

module.exports = router;
