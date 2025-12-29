const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { 
  executeMappingGroup, 
  getGroupExecutionStatus,
  getGroupExecutionHistory 
} = require('../services/mappingGroupExecutionEngine');
const authorizeProjectResource = require('../middleware/authorizeProjectResource');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Mapping Groups API Routes
 * Handles CRUD operations and execution for mapping groups
 */

// Get all mapping groups (filtered by user's accessible projects)
router.get('/', async (req, res) => {
  try {
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    // Get user's accessible projects
    const isAdmin = userHasAdminAccess(req.user);
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        // User has no project access, return empty list
        return res.json({
          success: true,
          groups: []
        });
      }
    }
    
    let query = `
      SELECT mg.*, 
             COUNT(mgm.id)::int as mapping_count,
             (SELECT COUNT(*) FROM mapping_group_executions WHERE group_id = mg.id)::int as execution_count,
             p.name as project_name
      FROM mapping_groups mg
      LEFT JOIN mapping_group_members mgm ON mg.id = mgm.group_id
      LEFT JOIN projects p ON mg.project_id = p.id
    `;
    
    // Filter by project membership (unless admin)
    if (!isAdmin && projectIds.length > 0) {
      query += ` WHERE mg.project_id = ANY($1)`;
    }
    
    query += ` GROUP BY mg.id, p.name ORDER BY mg.created_at DESC`;
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      groups: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching mapping groups', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch mapping groups'
    });
  }
});

// Get a single mapping group by ID
router.get('/:id',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:read']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const groupResult = await pool.query(`
      SELECT mg.*, 
             COUNT(mgm.id)::int as mapping_count
      FROM mapping_groups mg
      LEFT JOIN mapping_group_members mgm ON mg.id = mgm.group_id
      WHERE mg.id = $1
      GROUP BY mg.id
    `, [id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    // Get group members
    const membersResult = await pool.query(`
      SELECT mgm.*, tm.mapping_name, tm.file_name_pattern
      FROM mapping_group_members mgm
      JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
      WHERE mgm.group_id = $1
      ORDER BY mgm.execution_order ASC, mgm.id ASC
    `, [id]);
    
    const group = groupResult.rows[0];
    res.json({
      success: true,
      ...group,
      group_name: group.name,
      concurrency_limit: group.max_concurrency,
      members: membersResult.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching mapping group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch mapping group'
    });
  }
});

// Create a new mapping group
router.post('/',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:write'],
    getProjectId: async (req) => {
      // For POST, project_id is required - no defaults allowed for security
      if (!req.body.project_id) {
        throw new Error('project_id is required');
      }
      return parseInt(req.body.project_id, 10);
    }
  }),
  async (req, res) => {
    try {
      const { name, description, max_concurrency = 10, created_by, sub_project_id } = req.body;
      const projectId = req.projectId; // Set by authorization middleware, no fallback allowed
      
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Name is required'
        });
      }
      
      const result = await pool.query(`
        INSERT INTO mapping_groups (name, description, max_concurrency, created_by, project_id, sub_project_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [name, description, max_concurrency, created_by, projectId, sub_project_id || null]);
    
    systemLogger.info('Mapping group created', { groupId: result.rows[0].id });
    
    res.status(201).json({
      success: true,
      group: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error creating mapping group', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create mapping group'
    });
  }
});

// Update a mapping group
router.put('/:id',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:write']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, max_concurrency, status, sub_project_id } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (max_concurrency !== undefined) {
      updates.push(`max_concurrency = $${paramIndex++}`);
      values.push(max_concurrency);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    // Note: project_id cannot be changed after creation for security
    if (sub_project_id !== undefined) {
      updates.push(`sub_project_id = $${paramIndex++}`);
      values.push(sub_project_id || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(id);
    
    const result = await pool.query(`
      UPDATE mapping_groups
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    systemLogger.info('Mapping group updated', { groupId: id });
    
    res.json({
      success: true,
      group: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error updating mapping group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update mapping group'
    });
  }
});

// Delete a mapping group
router.delete('/:id',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:write']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM mapping_groups WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    systemLogger.info('Mapping group deleted', { groupId: id });
    
    res.json({
      success: true,
      message: 'Mapping group deleted successfully'
    });
  } catch (error) {
    systemLogger.error('Error deleting mapping group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete mapping group'
    });
  }
});

// Get group members
router.get('/:id/members',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:read']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const membersResult = await pool.query(`
      SELECT mgm.*, tm.mapping_name, tm.file_name_pattern
      FROM mapping_group_members mgm
      JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
      WHERE mgm.group_id = $1
      ORDER BY mgm.execution_order ASC, mgm.id ASC
    `, [id]);
    
    res.json({
      success: true,
      members: membersResult.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching group members', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group members'
    });
  }
});

// Add mapping to group
router.post('/:id/members',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:write']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { mapping_id, execution_order = 0 } = req.body;
    
    if (!mapping_id) {
      return res.status(400).json({
        success: false,
        error: 'mapping_id is required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO mapping_group_members (group_id, mapping_id, execution_order)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, mapping_id, execution_order]);
    
    systemLogger.info('Mapping added to group', { groupId: id, mappingId: mapping_id });
    
    res.status(201).json({
      success: true,
      member: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error adding mapping to group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Mapping already exists in this group'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add mapping to group'
    });
  }
});

// Remove mapping from group
router.delete('/:id/members/:memberId',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:write']
  }),
  async (req, res) => {
  try {
    const { id, memberId } = req.params;
    
    const result = await pool.query(`
      DELETE FROM mapping_group_members 
      WHERE id = $1 AND group_id = $2
      RETURNING *
    `, [memberId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Group member not found'
      });
    }
    
    systemLogger.info('Mapping removed from group', { 
      groupId: id, 
      memberId 
    });
    
    res.json({
      success: true,
      message: 'Mapping removed from group successfully'
    });
  } catch (error) {
    systemLogger.error('Error removing mapping from group', { 
      groupId: req.params.id, 
      memberId: req.params.memberId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove mapping from group'
    });
  }
});

// Replace all members atomically (PUT endpoint for bulk sync)
router.put('/:id/members',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:write']
  }),
  async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { members } = req.body; // Array of {mapping_id, execution_order}
    
    if (!Array.isArray(members)) {
      return res.status(400).json({
        success: false,
        error: 'members must be an array'
      });
    }

    // Start transaction
    await client.query('BEGIN');
    
    // Delete all existing members
    await client.query('DELETE FROM mapping_group_members WHERE group_id = $1', [id]);
    
    // Insert all new members
    for (const member of members) {
      await client.query(`
        INSERT INTO mapping_group_members (group_id, mapping_id, execution_order)
        VALUES ($1, $2, $3)
      `, [id, member.mapping_id, member.execution_order]);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    systemLogger.info('Mapping group members replaced', { 
      groupId: id, 
      memberCount: members.length 
    });
    
    res.json({
      success: true,
      message: 'Members updated successfully',
      count: members.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error replacing group members', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update members'
    });
  } finally {
    client.release();
  }
});

// Execute a mapping group
router.post('/:id/execute',
  authorizeProjectResource({
    resourceType: 'mapping_group',
    requiredPermissions: ['mapping_group:execute']
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
    
    // Fetch group data from database
    const groupResult = await pool.query(
      'SELECT max_concurrency FROM mapping_groups WHERE id = $1',
      [id]
    );
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    const { max_concurrency } = groupResult.rows[0];
    const triggered_by = req.user?.id || req.body?.triggered_by;
    
    // Execute group asynchronously
    executeMappingGroup(parseInt(id), max_concurrency, triggered_by)
      .then(result => {
        systemLogger.info('Mapping group execution completed', { 
          groupId: id, 
          executionId: result.executionId 
        });
      })
      .catch(error => {
        systemLogger.error('Mapping group execution failed', { 
          groupId: id, 
          error: error.message 
        });
      });
    
    res.status(202).json({
      success: true,
      message: 'Mapping group execution started',
      groupId: parseInt(id)
    });
  } catch (error) {
    systemLogger.error('Error starting mapping group execution', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start mapping group execution'
    });
  }
});

// Get execution history for a group
router.get('/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await getGroupExecutionHistory(parseInt(id), limit);
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching group execution history', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution history'
    });
  }
});

// Get specific execution status
router.get('/:id/executions/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const result = await getGroupExecutionStatus(parseInt(executionId));
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching execution status', { 
      executionId: req.params.executionId, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution status'
    });
  }
});

/**
 * GET /api/mapping-groups/init-data
 * Batch endpoint to get all data needed for MappingGroupForm page in a single call
 * Replaces 4 separate API calls: projects, transformations, mapping-group (edit), members (edit)
 * Permission-aware: Filters data based on user's project access
 */
router.get('/init-data', async (req, res) => {
  try {
    const { groupId } = req.query;
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    const isAdmin = userHasAdminAccess(req.user);
    let accessibleProjectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      accessibleProjectIds = userProjects.map(p => p.id);
      
      // Non-admin with no project access gets empty data
      if (accessibleProjectIds.length === 0) {
        return res.json({
          success: true,
          projects: [],
          transformations: [],
          group: null,
          members: []
        });
      }
    }
    
    // Build projects query - filter to parent projects only
    let projectsQuery = `
      SELECT id, name, description, parent_project_id
      FROM projects
      WHERE parent_project_id IS NULL
    `;
    const projectsParams = [];
    
    if (!isAdmin) {
      projectsQuery += ` AND id = ANY($1)`;
      projectsParams.push(accessibleProjectIds);
    }
    projectsQuery += ` ORDER BY name`;
    
    // Build transformations query
    let transformationsQuery = `
      SELECT mapping_id, mapping_name, file_name_pattern, project_id, source_connection_id
      FROM transformation_mappings
      WHERE (is_temporary IS NULL OR is_temporary = false)
    `;
    const transformationsParams = [];
    
    if (!isAdmin) {
      transformationsQuery += ` AND project_id = ANY($1)`;
      transformationsParams.push(accessibleProjectIds);
    }
    transformationsQuery += ` ORDER BY mapping_name`;
    
    // Fetch base data in parallel
    const [projectsResult, transformationsResult] = await Promise.all([
      pool.query(projectsQuery, projectsParams),
      pool.query(transformationsQuery, transformationsParams)
    ]);
    
    const response = {
      success: true,
      projects: projectsResult.rows,
      transformations: transformationsResult.rows,
      group: null,
      members: []
    };
    
    // If groupId provided (edit mode), fetch group details and members
    // Verify user has access to the group's project
    if (groupId) {
      const [groupResult, membersResult] = await Promise.all([
        pool.query(`
          SELECT mg.*, COUNT(mgm.id)::int as mapping_count
          FROM mapping_groups mg
          LEFT JOIN mapping_group_members mgm ON mg.id = mgm.group_id
          WHERE mg.id = $1
          GROUP BY mg.id
        `, [groupId]),
        pool.query(`
          SELECT mgm.*, tm.mapping_name, tm.file_name_pattern
          FROM mapping_group_members mgm
          JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
          WHERE mgm.group_id = $1
          ORDER BY mgm.execution_order ASC, mgm.id ASC
        `, [groupId])
      ]);
      
      if (groupResult.rows.length > 0) {
        const group = groupResult.rows[0];
        
        // Verify non-admin has access to this group's project
        if (!isAdmin && group.project_id && !accessibleProjectIds.includes(group.project_id)) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to this mapping group'
          });
        }
        
        response.group = {
          ...group,
          group_name: group.name,
          concurrency_limit: group.max_concurrency
        };
        response.members = membersResult.rows;
      }
    }
    
    res.json(response);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/mapping-groups/init-data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch init data'
    });
  }
});

module.exports = router;
