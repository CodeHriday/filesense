const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const authorizeProjectResource = require('../middleware/authorizeProjectResource');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Alert Policy API Routes
 * Handles CRUD operations for alert policies and recipients
 */

// Get all alert policies (filtered by user's accessible projects)
router.get('/', async (req, res) => {
  try {
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    const isAdmin = userHasAdminAccess(req.user);
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        return res.json({
          success: true,
          policies: []
        });
      }
    }
    
    let query = `
      SELECT 
        ap.*,
        p.name as project_name,
        COUNT(DISTINCT apr.id)::int as recipient_count,
        COUNT(DISTINCT ar.id)::int as alert_run_count
      FROM alert_policies ap
      LEFT JOIN projects p ON ap.project_id = p.id
      LEFT JOIN alert_policy_recipients apr ON ap.id = apr.policy_id
      LEFT JOIN alert_runs ar ON ap.id = ar.policy_id
    `;
    
    if (!isAdmin && projectIds.length > 0) {
      query += ` WHERE ap.project_id = ANY($1)`;
    }
    
    query += ` GROUP BY ap.id, p.name ORDER BY ap.created_at DESC`;
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      policies: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching alert policies', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert policies'
    });
  }
});

// Get a single alert policy by ID
router.get('/:id', 
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:read']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const policyResult = await pool.query(`
      SELECT 
        ap.*,
        p.name as project_name
      FROM alert_policies ap
      LEFT JOIN projects p ON ap.project_id = p.id
      WHERE ap.id = $1
    `, [id]);
    
    if (policyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert policy not found'
      });
    }
    
    // Get recipients
    const recipientsResult = await pool.query(`
      SELECT 
        apr.*,
        u.email as user_email,
        u.full_name as user_name
      FROM alert_policy_recipients apr
      LEFT JOIN users u ON apr.user_id = u.id
      WHERE apr.policy_id = $1
      ORDER BY apr.created_at ASC
    `, [id]);
    
    const policy = policyResult.rows[0];
    policy.recipients = recipientsResult.rows;
    
    res.json({
      success: true,
      policy
    });
  } catch (error) {
    systemLogger.error('Error fetching alert policy', { 
      policyId: req.params.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert policy'
    });
  }
});

// Create a new alert policy
router.post('/',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:create']
  }),
  async (req, res) => {
  try {
    const {
      name,
      description,
      project_id,
      entity_type,
      entity_id,
      trigger_events,
      consolidate_alerts,
      consolidation_window_minutes,
      email_connection_id,
      is_active
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Policy name is required'
      });
    }
    
    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }
    
    if (!entity_type) {
      return res.status(400).json({
        success: false,
        error: 'Entity type is required (job, workflow, mapping_group, schedule)'
      });
    }
    
    if (!trigger_events || !Array.isArray(trigger_events) || trigger_events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one trigger event is required'
      });
    }
    
    // Insert policy
    const result = await pool.query(`
      INSERT INTO alert_policies (
        name, 
        description, 
        project_id, 
        entity_type, 
        entity_id,
        trigger_events,
        consolidate_alerts,
        consolidation_window_minutes,
        email_connection_id,
        is_active,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name,
      description || null,
      project_id,
      entity_type,
      entity_id || null,
      JSON.stringify(trigger_events),
      consolidate_alerts !== false,
      consolidation_window_minutes || 60,
      email_connection_id || null,
      is_active !== false,
      req.user.id
    ]);
    
    systemLogger.info('Alert policy created', {
      policyId: result.rows[0].id,
      name,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      policy: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error creating alert policy', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create alert policy'
    });
  }
});

// Update an alert policy
router.put('/:id',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:update']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      entity_type,
      entity_id,
      trigger_events,
      consolidate_alerts,
      consolidation_window_minutes,
      email_connection_id,
      is_active
    } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }
    
    if (entity_type !== undefined) {
      updates.push(`entity_type = $${paramCount}`);
      values.push(entity_type);
      paramCount++;
    }
    
    if (entity_id !== undefined) {
      updates.push(`entity_id = $${paramCount}`);
      values.push(entity_id);
      paramCount++;
    }
    
    if (trigger_events !== undefined) {
      updates.push(`trigger_events = $${paramCount}`);
      values.push(JSON.stringify(trigger_events));
      paramCount++;
    }
    
    if (consolidate_alerts !== undefined) {
      updates.push(`consolidate_alerts = $${paramCount}`);
      values.push(consolidate_alerts);
      paramCount++;
    }
    
    if (consolidation_window_minutes !== undefined) {
      updates.push(`consolidation_window_minutes = $${paramCount}`);
      values.push(consolidation_window_minutes);
      paramCount++;
    }
    
    if (email_connection_id !== undefined) {
      updates.push(`email_connection_id = $${paramCount}`);
      values.push(email_connection_id);
      paramCount++;
    }
    
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE alert_policies
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert policy not found'
      });
    }
    
    systemLogger.info('Alert policy updated', {
      policyId: id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      policy: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error updating alert policy', { 
      policyId: req.params.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update alert policy'
    });
  }
});

// Delete an alert policy
router.delete('/:id',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:delete']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM alert_policies WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert policy not found'
      });
    }
    
    systemLogger.info('Alert policy deleted', {
      policyId: id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error deleting alert policy', { 
      policyId: req.params.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete alert policy'
    });
  }
});

// Add a recipient to an alert policy
router.post('/:id/recipients',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:update']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, email, delivery_method } = req.body;
    
    // Validate: must provide either user_id or email
    if (!user_id && !email) {
      return res.status(400).json({
        success: false,
        error: 'Either user_id or email is required'
      });
    }
    
    // Check if recipient already exists
    const existingQuery = user_id
      ? 'SELECT * FROM alert_policy_recipients WHERE policy_id = $1 AND user_id = $2'
      : 'SELECT * FROM alert_policy_recipients WHERE policy_id = $1 AND email = $2';
    
    const existingParams = user_id ? [id, user_id] : [id, email];
    const existing = await pool.query(existingQuery, existingParams);
    
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Recipient already exists for this policy'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO alert_policy_recipients (
        policy_id,
        user_id,
        email,
        delivery_method
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      id,
      user_id || null,
      email || null,
      delivery_method || 'email'
    ]);
    
    systemLogger.info('Recipient added to alert policy', {
      policyId: id,
      recipientId: result.rows[0].id,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      recipient: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error adding recipient to alert policy', { 
      policyId: req.params.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to add recipient'
    });
  }
});

// Get recipients for an alert policy
router.get('/:id/recipients',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:read']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        apr.*,
        u.email as user_email,
        u.full_name as user_name
      FROM alert_policy_recipients apr
      LEFT JOIN users u ON apr.user_id = u.id
      WHERE apr.policy_id = $1
      ORDER BY apr.created_at ASC
    `, [id]);
    
    res.json({
      success: true,
      recipients: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching recipients', { 
      policyId: req.params.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recipients'
    });
  }
});

// Remove a recipient from an alert policy
router.delete('/:id/recipients/:recipientId',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:update']
  }),
  async (req, res) => {
  try {
    const { id, recipientId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM alert_policy_recipients WHERE id = $1 AND policy_id = $2 RETURNING *',
      [recipientId, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Recipient not found'
      });
    }
    
    systemLogger.info('Recipient removed from alert policy', {
      policyId: id,
      recipientId,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error removing recipient', { 
      policyId: req.params.id,
      recipientId: req.params.recipientId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove recipient'
    });
  }
});

// Get alert runs/history for a policy
router.get('/:id/runs',
  authorizeProjectResource({
    resourceType: 'alert_policy',
    requiredPermissions: ['alert_policy:read']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        ar.*,
        COUNT(DISTINCT ae.id)::int as event_count
      FROM alert_runs ar
      LEFT JOIN alert_events ae ON ar.id = ae.run_id
      WHERE ar.policy_id = $1
      GROUP BY ar.id
      ORDER BY ar.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), parseInt(offset)]);
    
    res.json({
      success: true,
      runs: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching alert runs', { 
      policyId: req.params.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert runs'
    });
  }
});

module.exports = router;
