const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Alert History API Routes
 * Global view of all alert runs and events across all policies
 */

// Get all alert runs (filtered by user's accessible projects)
router.get('/runs', async (req, res) => {
  try {
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const { limit = 50, offset = 0, policy_id, status, entity_type, start_date, end_date } = req.query;
    
    const isAdmin = userHasAdminAccess(req.user);
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        return res.json({
          success: true,
          runs: [],
          total: 0
        });
      }
    }
    
    let conditions = [];
    let params = [];
    let paramIndex = 1;
    
    if (!isAdmin && projectIds.length > 0) {
      conditions.push(`ap.project_id = ANY($${paramIndex})`);
      params.push(projectIds);
      paramIndex++;
    }
    
    if (policy_id) {
      conditions.push(`ar.policy_id = $${paramIndex}`);
      params.push(parseInt(policy_id));
      paramIndex++;
    }
    
    if (status) {
      conditions.push(`ar.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    
    if (entity_type) {
      conditions.push(`EXISTS (
        SELECT 1 FROM alert_events ae 
        WHERE ae.run_id = ar.id AND ae.entity_type = $${paramIndex}
      )`);
      params.push(entity_type);
      paramIndex++;
    }
    
    if (start_date) {
      conditions.push(`ar.created_at >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
    }
    
    if (end_date) {
      conditions.push(`ar.created_at <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const countQuery = `
      SELECT COUNT(DISTINCT ar.id) as total
      FROM alert_runs ar
      LEFT JOIN alert_policies ap ON ar.policy_id = ap.id
      ${whereClause}
    `;
    
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    const dataQuery = `
      SELECT 
        ar.*,
        ap.name as policy_name,
        ap.entity_type as policy_entity_type,
        ap.project_id,
        p.name as project_name,
        sc.name as email_connection_name,
        COUNT(DISTINCT ae.id)::int as event_count,
        json_agg(DISTINCT jsonb_build_object(
          'entity_type', ae.entity_type,
          'entity_id', ae.entity_id,
          'event_type', ae.event_type,
          'status', ae.status
        )) as events_summary
      FROM alert_runs ar
      LEFT JOIN alert_policies ap ON ar.policy_id = ap.id
      LEFT JOIN projects p ON ap.project_id = p.id
      LEFT JOIN storage_connections sc ON ar.email_connection_id = sc.connection_id
      LEFT JOIN alert_events ae ON ar.id = ae.run_id
      ${whereClause}
      GROUP BY ar.id, ap.name, ap.entity_type, ap.project_id, p.name, sc.name
      ORDER BY ar.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(dataQuery, params);
    
    res.json({
      success: true,
      runs: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    systemLogger.error('Error fetching alert runs', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert runs'
    });
  }
});

// Get events for a specific alert run
router.get('/runs/:run_id/events', async (req, res) => {
  try {
    const { run_id } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    const runCheckQuery = `
      SELECT ar.id, ar.policy_id, ap.project_id
      FROM alert_runs ar
      LEFT JOIN alert_policies ap ON ar.policy_id = ap.id
      WHERE ar.id = $1
    `;
    
    const runCheck = await pool.query(runCheckQuery, [parseInt(run_id)]);
    
    if (runCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert run not found'
      });
    }
    
    const isAdmin = userHasAdminAccess(req.user);
    
    if (!isAdmin) {
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(req.user.id);
      const projectIds = userProjects.map(p => p.id);
      
      if (!projectIds.includes(runCheck.rows[0].project_id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this alert run'
        });
      }
    }
    
    const eventsQuery = `
      SELECT ae.*
      FROM alert_events ae
      WHERE ae.run_id = $1
      ORDER BY ae.occurred_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(eventsQuery, [parseInt(run_id), parseInt(limit), parseInt(offset)]);
    
    res.json({
      success: true,
      events: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching alert events', { 
      run_id: req.params.run_id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert events'
    });
  }
});

// Get delivery attempts/metadata for a specific alert run
router.get('/runs/:run_id/delivery-details', async (req, res) => {
  try {
    const { run_id } = req.params;
    
    const runQuery = `
      SELECT 
        ar.*,
        ap.name as policy_name,
        ap.project_id,
        p.name as project_name,
        sc.name as email_connection_name,
        sc.provider_type
      FROM alert_runs ar
      LEFT JOIN alert_policies ap ON ar.policy_id = ap.id
      LEFT JOIN projects p ON ap.project_id = p.id
      LEFT JOIN storage_connections sc ON ar.email_connection_id = sc.connection_id
      WHERE ar.id = $1
    `;
    
    const runResult = await pool.query(runQuery, [parseInt(run_id)]);
    
    if (runResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alert run not found'
      });
    }
    
    const isAdmin = userHasAdminAccess(req.user);
    
    if (!isAdmin) {
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(req.user.id);
      const projectIds = userProjects.map(p => p.id);
      
      if (!projectIds.includes(runResult.rows[0].project_id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this alert run'
        });
      }
    }
    
    const recipientsQuery = `
      SELECT 
        apr.id,
        apr.recipient_type,
        apr.user_id,
        apr.email,
        u.username,
        u.email as user_email
      FROM alert_policy_recipients apr
      LEFT JOIN users u ON apr.user_id = u.id
      WHERE apr.policy_id = $1
    `;
    
    const recipientsResult = await pool.query(recipientsQuery, [runResult.rows[0].policy_id]);
    
    const attachmentsQuery = `
      SELECT *
      FROM alert_attachments
      WHERE run_id = $1
      ORDER BY created_at DESC
    `;
    
    const attachmentsResult = await pool.query(attachmentsQuery, [parseInt(run_id)]);
    
    res.json({
      success: true,
      run: runResult.rows[0],
      recipients: recipientsResult.rows,
      attachments: attachmentsResult.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching delivery details', { 
      run_id: req.params.run_id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch delivery details'
    });
  }
});

module.exports = router;
