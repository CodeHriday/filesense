const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Helper function to validate and parse project_id from query params
 */
function parseProjectId(projectId) {
  if (!projectId || (typeof projectId === 'string' && projectId.trim() === '')) {
    return null;
  }
  const parsed = parseInt(projectId, 10);
  return (Number.isInteger(parsed) && parsed > 0) ? parsed : null;
}

/**
 * GET /file-upload-violations
 * Fetch violations from direct file uploads (not from mapping jobs)
 */
router.get('/file-upload-violations', async (req, res) => {
  try {
    const {
      project_id,
      rule_type,
      severity,
      status = 'all',
      page = 1,
      limit = 50,
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = parseInt(req.user.id);
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.some(role => role.toLowerCase() === 'admin');

    let whereConditions = ['(qrv.job_id IS NULL OR qrv.job_id = \'\')'];
    let params = [];
    let paramCount = 0;

    // Access control - only show violations from projects user has access to
    if (!isAdmin) {
      whereConditions.push(`(
        p.id IN (
          SELECT project_id FROM project_members WHERE user_id = $${++paramCount}::integer
          UNION
          SELECT pag.project_id FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $${paramCount}::integer
        )
      )`);
      params.push(userId);
    }

    const validProjectId = parseProjectId(project_id);
    if (validProjectId) {
      whereConditions.push(`p.id = $${++paramCount}::integer`);
      params.push(validProjectId);
    }

    if (rule_type && rule_type !== 'all') {
      whereConditions.push(`qr.rule_type = $${++paramCount}`);
      params.push(rule_type);
    }

    if (severity && severity !== 'all') {
      whereConditions.push(`qrv.severity = $${++paramCount}`);
      params.push(severity);
    }

    if (status !== 'all') {
      whereConditions.push(`qrv.status = $${++paramCount}`);
      params.push(status);
    }

    if (search) {
      whereConditions.push(`(
        qr.rule_name ILIKE $${++paramCount} OR
        f.filename ILIKE $${paramCount} OR
        p.name ILIKE $${paramCount} OR
        qrv.violation_details::text ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      INNER JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        qrv.id,
        qrv.rule_id,
        qrv.file_id,
        qrv.row_number,
        qrv.column_name,
        qrv.expected_value,
        qrv.actual_value,
        qrv.violation_details,
        qrv.severity,
        qrv.status,
        qrv.record_snapshot,
        qrv.created_at,
        qr.rule_name,
        qr.rule_type,
        qr.description as rule_description,
        f.filename,
        f.metadata as file_metadata,
        p.id as project_id,
        p.name as project_name,
        sp.id as sub_project_id,
        sp.name as sub_project_name
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      INNER JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      ${whereClause}
      ORDER BY qrv.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params.slice(0, -2)),
      db.query(dataQuery, params)
    ]);

    res.json({
      violations: dataResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching file upload violations:', error);
    res.status(500).json({ error: 'Failed to fetch file upload violations', details: error.message });
  }
});

/**
 * GET /mapping-job-violations
 * Fetch violations from ETL mapping jobs
 */
router.get('/mapping-job-violations', async (req, res) => {
  try {
    const {
      project_id,
      rule_type,
      severity,
      status = 'all',
      page = 1,
      limit = 50,
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = parseInt(req.user.id);
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.some(role => role.toLowerCase() === 'admin');

    let whereConditions = ['qrv.job_id IS NOT NULL', 'qrv.job_id != \'\''];
    let params = [];
    let paramCount = 0;

    // Access control - only show violations from projects user has access to
    if (!isAdmin) {
      whereConditions.push(`(
        COALESCE(p.id, tj_p.id) IN (
          SELECT project_id FROM project_members WHERE user_id = $${++paramCount}::integer
          UNION
          SELECT pag.project_id FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $${paramCount}::integer
        )
      )`);
      params.push(userId);
    }

    const validProjectId = parseProjectId(project_id);
    if (validProjectId) {
      whereConditions.push(`COALESCE(p.id, tj_p.id) = $${++paramCount}::integer`);
      params.push(validProjectId);
    }

    if (rule_type && rule_type !== 'all') {
      whereConditions.push(`qr.rule_type = $${++paramCount}`);
      params.push(rule_type);
    }

    if (severity && severity !== 'all') {
      whereConditions.push(`qrv.severity = $${++paramCount}`);
      params.push(severity);
    }

    if (status !== 'all') {
      whereConditions.push(`qrv.status = $${++paramCount}`);
      params.push(status);
    }

    if (search) {
      whereConditions.push(`(
        qr.rule_name ILIKE $${++paramCount} OR
        tj.mapping_name ILIKE $${paramCount} OR
        f.filename ILIKE $${paramCount} OR
        p.name ILIKE $${paramCount} OR
        tj_p.name ILIKE $${paramCount} OR
        qrv.violation_details::text ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      LEFT JOIN transformation_jobs tj ON qrv.job_id = tj.job_id
      LEFT JOIN projects tj_p ON tj.project_id = tj_p.id
      LEFT JOIN users exec_user ON tj.executed_by = exec_user.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        qrv.id,
        qrv.rule_id,
        qrv.file_id,
        qrv.job_id,
        qrv.row_number,
        qrv.column_name,
        qrv.expected_value,
        qrv.actual_value,
        qrv.violation_details,
        qrv.severity,
        qrv.status,
        qrv.record_snapshot,
        qrv.created_at,
        qr.rule_name,
        qr.rule_type,
        qr.description as rule_description,
        f.filename,
        f.metadata as file_metadata,
        COALESCE(p.id, tj_p.id) as project_id,
        COALESCE(p.name, tj_p.name) as project_name,
        sp.id as sub_project_id,
        sp.name as sub_project_name,
        tj.mapping_name,
        tj.job_id as transformation_job_id,
        tj.start_time as job_start_time,
        exec_user.username as executed_by_username,
        exec_user.full_name as executed_by_fullname
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      LEFT JOIN transformation_jobs tj ON qrv.job_id = tj.job_id
      LEFT JOIN projects tj_p ON tj.project_id = tj_p.id
      LEFT JOIN users exec_user ON tj.executed_by = exec_user.id
      ${whereClause}
      ORDER BY qrv.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params.slice(0, -2)),
      db.query(dataQuery, params)
    ]);

    res.json({
      violations: dataResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching mapping job violations:', error);
    res.status(500).json({ error: 'Failed to fetch mapping job violations', details: error.message });
  }
});

/**
 * PATCH /violations/:id/status
 * Update violation status
 */
router.patch('/violations/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    const userId = req.user?.id;

    if (!['new', 'reviewed', 'acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    let query;
    let params;
    if (status === 'resolved') {
      query = `UPDATE quality_rule_violations 
               SET status = $1, 
                   resolution_notes = $2,
                   resolved_by = $3,
                   resolved_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP 
               WHERE id = $4 
               RETURNING *`;
      params = [status, resolution_notes || null, userId, id];
    } else {
      query = `UPDATE quality_rule_violations 
               SET status = $1, updated_at = CURRENT_TIMESTAMP 
               WHERE id = $2 
               RETURNING *`;
      params = [status, id];
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Violation not found' });
    }

    res.json({ violation: result.rows[0] });
  } catch (error) {
    console.error('Error updating violation status:', error);
    res.status(500).json({ error: 'Failed to update violation status' });
  }
});

/**
 * POST /violations/bulk-update
 * Bulk update violation status
 */
router.post('/violations/bulk-update', async (req, res) => {
  try {
    const { violation_ids, status } = req.body;

    if (!Array.isArray(violation_ids) || violation_ids.length === 0) {
      return res.status(400).json({ error: 'violation_ids must be a non-empty array' });
    }

    if (!['new', 'reviewed', 'acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const placeholders = violation_ids.map((_, i) => `$${i + 2}`).join(',');
    
    const result = await db.query(
      `UPDATE quality_rule_violations 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id IN (${placeholders})
       RETURNING id`,
      [status, ...violation_ids]
    );

    res.json({ 
      updated_count: result.rows.length,
      updated_ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error bulk updating violations:', error);
    res.status(500).json({ error: 'Failed to bulk update violations' });
  }
});

module.exports = router;
