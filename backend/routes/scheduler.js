const express = require('express');
const router = express.Router();
const { systemLogger } = require('../utils/logger');
const pool = require('../db');
const {
  createSchedule,
  getEntitySchedules,
  updateSchedule,
  deleteSchedule,
  processDueSchedules
} = require('../services/cronSchedulerService');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Helper function to get project_id for a scheduled entity
 */
async function getEntityProjectId(entity_type, entity_id) {
  let query, table;
  
  switch (entity_type) {
    case 'mapping':
      // table = 'transformation_mappings';
      query = 'SELECT project_id FROM transformation_mappings WHERE mapping_id = $1';
      break;
    case 'mapping_group':
      // table = 'mapping_groups';
      query = 'SELECT project_id FROM mapping_groups WHERE id = $1';
      break;
    case 'workflow':
      // Check both n_step_workflows and visual_workflows
      query = `
        SELECT project_id FROM n_step_workflows WHERE id = $1
        UNION ALL
        SELECT project_id FROM visual_workflows WHERE id = $1
      `;
      break;
    case 'vendor_agreement_expiration':
      return null;
    case 'bulk_profiling':
      return null;
    default:
      throw new Error(`Unsupported entity_type: ${entity_type}`);
  }
  
  const result = await pool.query(query, [entity_id]);
  
  if (result.rows.length === 0) {
    const error = new Error(`${entity_type} not found`);
    error.status = 404;
    throw error;
  }
  
  return result.rows[0].project_id;
}

/**
 * Helper function to validate user has access to entity's project
 */
async function validateEntityProjectAccess(entity_type, entity_id, user) {
  const { getUserProjects } = require('../middleware/requireProjectAccess');
  
  // Get entity's project_id
  const entityProjectId = await getEntityProjectId(entity_type, entity_id);
  
  // System-level schedules (project_id = null) require admin access
  if (entityProjectId === null) {
    const isAdmin = userHasAdminAccess(user);
    if (!isAdmin) {
      const error = new Error('Only administrators can manage system-level schedules');
      error.status = 403;
      throw error;
    }
    return null;
  }
  
  // Check access (admins bypass)
  const isAdmin = user?.roles?.includes('Admin');
  if (!isAdmin) {
    const userProjects = await getUserProjects(user.id);
    const projectIds = userProjects.map(p => p.id);
    
    if (!projectIds.includes(entityProjectId)) {
      const error = new Error(`You do not have access to this ${entity_type}`);
      error.status = 403;
      throw error;
    }
  }
  
  return entityProjectId;
}

/**
 * Helper function to validate user has access to a schedule's entity project
 */
async function validateScheduleAccess(schedule_id, user) {
  // Get schedule to find its entity_type and entity_id
  const scheduleResult = await pool.query(
    'SELECT entity_type, entity_id FROM schedules WHERE id = $1',
    [schedule_id]
  );
  
  if (scheduleResult.rows.length === 0) {
    const error = new Error('Schedule not found');
    error.status = 404;
    throw error;
  }
  
  const { entity_type, entity_id } = scheduleResult.rows[0];
  
  // Validate access to the entity's project
  return await validateEntityProjectAccess(entity_type, entity_id, user);
}

/**
 * Enhanced Scheduler API Routes
 * Supports cron expressions and multiple schedules per entity
 */

// Create a schedule
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/schedules - Request body:', JSON.stringify(req.body, null, 2));
    
    let {
      entity_type,
      entity_id,
      schedule_name,
      schedule_type,
      cron_expression,
      interval_value,
      interval_unit,
      timezone = 'UTC',
      sub_project_id,
      created_by,
      enabled
    } = req.body;
    
    console.log('Extracted fields:', { entity_type, entity_id, schedule_type, cron_expression, enabled });
    
    // Map 'enabled' to 'is_active' if present (frontend uses 'enabled')
    const is_active = enabled !== undefined ? enabled : true;
    
    // Validate required fields
    if (!entity_type || !entity_id || !schedule_type) {
      console.log('Validation failed - missing fields:', { 
        entity_type: !!entity_type, 
        entity_id: !!entity_id, 
        schedule_type: !!schedule_type 
      });
      return res.status(400).json({
        success: false,
        error: 'entity_type, entity_id, and schedule_type are required'
      });
    }
    
    if (!['mapping', 'mapping_group', 'workflow'].includes(entity_type)) {
      return res.status(400).json({
        success: false,
        error: 'entity_type must be "mapping", "mapping_group", or "workflow"'
      });
    }
    
    if (!['cron', 'interval'].includes(schedule_type)) {
      return res.status(400).json({
        success: false,
        error: 'schedule_type must be "cron" or "interval"'
      });
    }
    
    // Validate cron expression if schedule_type is cron
    if (schedule_type === 'cron' && !cron_expression) {
      return res.status(400).json({
        success: false,
        error: 'cron_expression is required for cron schedule type'
      });
    }
    
    // Validate interval fields if schedule_type is interval
    if (schedule_type === 'interval' && (!interval_value || !interval_unit)) {
      return res.status(400).json({
        success: false,
        error: 'interval_value and interval_unit are required for interval schedule type'
      });
    }
    
    // Validate user has access to the entity's project
    const entityProjectId = await validateEntityProjectAccess(entity_type, entity_id, req.user);
    
    const result = await createSchedule({
      entity_type,
      entity_id,
      schedule_name,
      schedule_type,
      cron_expression,
      interval_value,
      interval_unit,
      timezone,
      project_id: entityProjectId,
      sub_project_id: sub_project_id || null,
      created_by: created_by || (req.user ? req.user.id : null), // Use authenticated user ID
      is_active
    });
    
    // Map is_active to enabled in response
    if (result.schedule && result.schedule.is_active !== undefined) {
      result.schedule.enabled = result.schedule.is_active;
    }
    
    res.status(201).json(result);
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error creating schedule', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create schedule'
    });
  }
});

// Get all schedules (filtered by user's accessible projects)
router.get('/', async (req, res) => {
  try {
    const pool = require('../db');
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    // Get user's accessible projects
    const isAdmin = userHasAdminAccess(req.user);
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        // User has no project access, return empty list
        return res.json([]);
      }
    }
    
    let query = `
      SELECT s.id as schedule_id,
             s.entity_type,
             s.entity_id,
             s.project_id,
             s.schedule_name,
             s.schedule_type,
             s.cron_expression,
             s.interval_value,
             s.interval_unit,
             s.timezone,
             s.is_active as enabled,
             s.last_run,
             s.next_run,
             s.created_at,
             s.updated_at,
             CASE 
               WHEN s.entity_type = 'mapping' THEN tm.mapping_name
               WHEN s.entity_type = 'mapping_group' THEN mg.name
               WHEN s.entity_type = 'workflow' THEN COALESCE(nw.name, vw.name)
             END as entity_name,
             p.name as project_name
      FROM schedules s
      LEFT JOIN transformation_mappings tm ON s.entity_type = 'mapping' AND s.entity_id = tm.mapping_id
      LEFT JOIN mapping_groups mg ON s.entity_type = 'mapping_group' AND s.entity_id = CAST(mg.id AS TEXT)
      LEFT JOIN n_step_workflows nw ON s.entity_type = 'workflow' AND s.entity_id = CAST(nw.id AS TEXT)
      LEFT JOIN visual_workflows vw ON s.entity_type = 'workflow' AND s.entity_id = CAST(vw.id AS TEXT)
      LEFT JOIN projects p ON s.project_id = p.id
    `;
    
    // Filter by project membership (unless admin)
    if (!isAdmin && projectIds.length > 0) {
      query += ` WHERE s.project_id = ANY($1)`;
    }
    
    query += ` ORDER BY s.created_at DESC`;
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Error fetching all schedules', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedules'
    });
  }
});

// Get all active schedules (filtered by user's accessible projects)
router.get('/active', async (req, res) => {
  try {
    const pool = require('../db');
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
          schedules: []
        });
      }
    }
    
    let query = `
      SELECT s.*, 
             CASE 
               WHEN s.entity_type = 'mapping' THEN tm.name
               WHEN s.entity_type = 'mapping_group' THEN mg.name
               WHEN s.entity_type = 'workflow' THEN bp.name
             END as entity_name
      FROM schedules s
      LEFT JOIN transformation_mappings tm ON s.entity_type = 'mapping' AND s.entity_id = CAST(tm.id AS TEXT)
      LEFT JOIN mapping_groups mg ON s.entity_type = 'mapping_group' AND s.entity_id = CAST(mg.id AS TEXT)
      LEFT JOIN business_processes bp ON s.entity_type = 'workflow' AND s.entity_id = CAST(bp.id AS TEXT)
      WHERE s.is_active = true
    `;
    
    // Filter by project membership (unless admin)
    if (!isAdmin && projectIds.length > 0) {
      query += ` AND s.project_id = ANY($1)`;
    }
    
    query += ` ORDER BY s.next_run ASC`;
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      schedules: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching active schedules', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active schedules'
    });
  }
});

/**
 * GET /api/schedules/init-data
 * Batch endpoint to get all data needed for SchedulerForm page in a single call
 * Replaces 5 separate API calls: transformations, mapping-groups, n-step-workflows, visual-workflows, projects
 * Permission-aware: Filters data based on user's project access
 * MUST be defined before /:id route to avoid Express matching 'init-data' as an id
 */
router.get('/init-data', async (req, res) => {
  try {
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const { userHasAdminAccess } = require('../utils/permissionHelpers');
    
    const isAdmin = userHasAdminAccess(req.user);
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        return res.json({
          success: true,
          transformations: [],
          mappingGroups: [],
          nStepWorkflows: [],
          visualWorkflows: [],
          projects: []
        });
      }
    }
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    
    let mappingsQuery = `
      SELECT mapping_id, mapping_name, project_id, sub_project_id, created_at
      FROM transformation_mappings
      WHERE 1=1
    `;
    let groupsQuery = `
      SELECT id, name, description, project_id, sub_project_id, created_at
      FROM mapping_groups
      WHERE 1=1
    `;
    let nStepQuery = `
      SELECT id, name, description, project_id, sub_project_id, created_at
      FROM n_step_workflows
      WHERE 1=1
    `;
    let visualQuery = `
      SELECT id, name, project_id, sub_project_id, created_at
      FROM visual_workflows
      WHERE is_active = true OR is_active IS NULL
    `;
    let projectsQuery = `
      SELECT id, name, description, project_type, parent_id, created_at
      FROM projects
      WHERE parent_id IS NULL
    `;
    
    if (!isAdmin && projectIds.length > 0) {
      mappingsQuery += ` AND project_id = ANY($1)`;
      groupsQuery += ` AND project_id = ANY($1)`;
      nStepQuery += ` AND project_id = ANY($1)`;
      visualQuery += ` AND project_id = ANY($1)`;
      projectsQuery += ` AND id = ANY($1)`;
    }
    
    mappingsQuery += ` ORDER BY mapping_name`;
    groupsQuery += ` ORDER BY name`;
    nStepQuery += ` ORDER BY name`;
    visualQuery += ` ORDER BY name`;
    projectsQuery += ` ORDER BY name`;
    
    const [mappingsResult, groupsResult, nStepResult, visualResult, projectsResult] = await Promise.all([
      pool.query(mappingsQuery, params),
      pool.query(groupsQuery, params),
      pool.query(nStepQuery, params),
      pool.query(visualQuery, params),
      pool.query(projectsQuery, params)
    ]);
    
    res.json({
      success: true,
      transformations: mappingsResult.rows,
      mappingGroups: groupsResult.rows,
      nStepWorkflows: nStepResult.rows,
      visualWorkflows: visualResult.rows,
      projects: projectsResult.rows
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/schedules/init-data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch init data'
    });
  }
});

// Get all schedules for an entity
router.get('/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    
    if (!['mapping', 'mapping_group', 'workflow'].includes(entityType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid entity type'
      });
    }
    
    const result = await getEntitySchedules(entityType, entityId);
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching entity schedules', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedules'
    });
  }
});

// Get a single schedule by ID (must be after /active and /:entityType/:entityId)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if ID is numeric
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid schedule ID'
      });
    }
    
    const pool = require('../db');
    
    const result = await pool.query(`
      SELECT s.id as schedule_id,
             s.entity_type,
             s.entity_id,
             s.schedule_name,
             s.schedule_type,
             s.cron_expression,
             s.interval_value,
             s.interval_unit,
             s.timezone,
             s.is_active as enabled,
             s.last_run,
             s.next_run,
             s.created_at,
             s.updated_at,
             CASE 
               WHEN s.entity_type = 'mapping' THEN tm.mapping_name
               WHEN s.entity_type = 'mapping_group' THEN mg.name
               WHEN s.entity_type = 'workflow' THEN COALESCE(nw.name, vw.name)
             END as entity_name
      FROM schedules s
      LEFT JOIN transformation_mappings tm ON s.entity_type = 'mapping' AND s.entity_id = tm.mapping_id
      LEFT JOIN mapping_groups mg ON s.entity_type = 'mapping_group' AND s.entity_id = CAST(mg.id AS TEXT)
      LEFT JOIN n_step_workflows nw ON s.entity_type = 'workflow' AND s.entity_id = CAST(nw.id AS TEXT)
      LEFT JOIN visual_workflows vw ON s.entity_type = 'workflow' AND s.entity_id = CAST(vw.id AS TEXT)
      WHERE s.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Error fetching schedule', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule'
    });
  }
});

// Update a schedule
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Validate user has access to the schedule's entity project
    await validateScheduleAccess(id, req.user);
    
    // Remove id from updates if present
    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.schedule_id;
    
    // Always ensure project_id matches the entity (current or updated)
    // Fetch current schedule to get entity info
    const scheduleResult = await pool.query(
      'SELECT entity_type, entity_id FROM schedules WHERE id = $1',
      [id]
    );
    
    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    const currentSchedule = scheduleResult.rows[0];
    
    // Determine final entity (use updated values if provided, otherwise current)
    const finalEntityType = updates.entity_type || currentSchedule.entity_type;
    const finalEntityId = updates.entity_id || currentSchedule.entity_id;
    
    // Get and set the correct project_id from the entity
    const entityProjectId = await getEntityProjectId(finalEntityType, finalEntityId);
    updates.project_id = entityProjectId;
    
    // Map 'enabled' to 'is_active' if present
    if ('enabled' in updates) {
      updates.is_active = updates.enabled;
      delete updates.enabled;
    }
    
    const result = await updateSchedule(parseInt(id), updates);
    
    // Map is_active back to enabled in response
    const response = result.schedule || result;
    if (response.is_active !== undefined) {
      response.enabled = response.is_active;
    }
    
    res.json(result);
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error updating schedule', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update schedule'
    });
  }
});

// Toggle schedule active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate user has access to the schedule's entity project
    await validateScheduleAccess(id, req.user);
    
    const result = await pool.query(`
      UPDATE schedules
      SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }
    
    systemLogger.info('Schedule toggled', { 
      scheduleId: id, 
      isActive: result.rows[0].is_active 
    });
    
    res.json({
      success: true,
      schedule: result.rows[0]
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error toggling schedule', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to toggle schedule'
    });
  }
});

// Delete a schedule
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate user has access to the schedule's entity project
    await validateScheduleAccess(id, req.user);
    
    const result = await deleteSchedule(parseInt(id));
    
    res.json(result);
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error deleting schedule', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete schedule'
    });
  }
});

// Manually trigger schedule processing (admin endpoint)
router.post('/process-due', async (req, res) => {
  try {
    const result = await processDueSchedules();
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error processing due schedules', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to process due schedules'
    });
  }
});

module.exports = router;
