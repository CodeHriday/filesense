const express = require('express');
const router = express.Router();
const { systemLogger } = require('../utils/logger');
const {
  createSchedule,
  getEntitySchedules,
  updateSchedule,
  deleteSchedule,
  processDueSchedules
} = require('../services/cronSchedulerService');

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
    
    const result = await createSchedule({
      entity_type,
      entity_id,
      schedule_name,
      schedule_type,
      cron_expression,
      interval_value,
      interval_unit,
      timezone,
      created_by: created_by || (req.user ? req.user.id : null), // Use authenticated user ID
      is_active
    });
    
    // Map is_active to enabled in response
    if (result.schedule && result.schedule.is_active !== undefined) {
      result.schedule.enabled = result.schedule.is_active;
    }
    
    res.status(201).json(result);
  } catch (error) {
    systemLogger.error('Error creating schedule', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create schedule'
    });
  }
});

// Get all schedules
router.get('/', async (req, res) => {
  try {
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
               WHEN s.entity_type = 'workflow' THEN nw.name
             END as entity_name,
             p.name as project_name
      FROM schedules s
      LEFT JOIN transformation_mappings tm ON s.entity_type = 'mapping' AND s.entity_id = tm.mapping_id
      LEFT JOIN mapping_groups mg ON s.entity_type = 'mapping_group' AND s.entity_id = CAST(mg.id AS TEXT)
      LEFT JOIN n_step_workflows nw ON s.entity_type = 'workflow' AND s.entity_id = CAST(nw.id AS TEXT)
      LEFT JOIN projects p ON s.project_id = p.id
      ORDER BY s.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Error fetching all schedules', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedules'
    });
  }
});

// Get all active schedules (must be before /:id to avoid conflict)
router.get('/active', async (req, res) => {
  try {
    const pool = require('../db');
    
    const result = await pool.query(`
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
      ORDER BY s.next_run ASC
    `);
    
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
               WHEN s.entity_type = 'workflow' THEN nw.name
             END as entity_name
      FROM schedules s
      LEFT JOIN transformation_mappings tm ON s.entity_type = 'mapping' AND s.entity_id = tm.mapping_id
      LEFT JOIN mapping_groups mg ON s.entity_type = 'mapping_group' AND s.entity_id = CAST(mg.id AS TEXT)
      LEFT JOIN n_step_workflows nw ON s.entity_type = 'workflow' AND s.entity_id = CAST(nw.id AS TEXT)
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
    
    // Remove id from updates if present
    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.schedule_id;
    
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
    const pool = require('../db');
    
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
    
    const result = await deleteSchedule(parseInt(id));
    
    res.json(result);
  } catch (error) {
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
