const express = require('express');
const router = express.Router();
const db = require('../db');
const xlsx = require('xlsx');
const { systemLogger } = require('../utils/logger');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

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
      file_id,
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
    const isAdmin = userHasAdminAccess(req.user);

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

    if (file_id) {
      whereConditions.push(`qrv.file_id = $${++paramCount}`);
      params.push(file_id);
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
      job_id,
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
    const isAdmin = userHasAdminAccess(req.user);

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

    if (job_id) {
      whereConditions.push(`qrv.job_id = $${++paramCount}`);
      params.push(job_id);
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

    // Shared join fragment — used by both count and data queries.
    // fad: fallback filename for VM jobs (synthetic file_id not in files table).
    // vme/vmd/vmd_sp: fallback sub-project for VM jobs (temp mapping deleted after execution).
    const joinFragment = `
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      LEFT JOIN transformation_jobs tj ON qrv.job_id = tj.job_id
      LEFT JOIN projects tj_p ON tj.project_id = tj_p.id
      LEFT JOIN users exec_user ON tj.executed_by = exec_user.id
      LEFT JOIN LATERAL (
        SELECT file_name FROM file_audit_details
        WHERE transformation_job_id = tj.id AND file_role = 'source'
        ORDER BY created_dt DESC
        LIMIT 1
      ) fad ON true
      LEFT JOIN visual_mapping_executions vme ON vme.job_id = tj.job_id
      LEFT JOIN visual_mapping_defs vmd ON vmd.id = vme.mapping_id
      LEFT JOIN projects vmd_sp ON vmd.sub_project_id = vmd_sp.id
      LEFT JOIN projects vd_sp ON (qrv.violation_details->>'_sub_project_id') IS NOT NULL
        AND vd_sp.id = (qrv.violation_details->>'_sub_project_id')::integer
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM quality_rule_violations qrv
      ${joinFragment}
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
        COALESCE(f.filename, fad.file_name, qrv.violation_details->>'_file_name') as filename,
        f.metadata as file_metadata,
        COALESCE(p.id, tj_p.id) as project_id,
        COALESCE(p.name, tj_p.name) as project_name,
        COALESCE(sp.id, vmd_sp.id, vd_sp.id) as sub_project_id,
        COALESCE(sp.name, vmd_sp.name, vd_sp.name) as sub_project_name,
        tj.mapping_name,
        tj.job_id as transformation_job_id,
        tj.start_time as job_start_time,
        exec_user.username as executed_by_username,
        exec_user.full_name as executed_by_fullname
      FROM quality_rule_violations qrv
      ${joinFragment}
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

/**
 * GET /file-upload-violations/groups
 * Return distinct files with violation counts — outer tier for collapsible UI
 */
router.get('/file-upload-violations/groups', async (req, res) => {
  try {
    const {
      project_id,
      rule_type,
      severity,
      status = 'all',
      page = 1,
      limit = 10,
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = parseInt(req.user.id);
    const isAdmin = userHasAdminAccess(req.user);

    let whereConditions = ['(qrv.job_id IS NULL OR qrv.job_id = \'\')'];
    let params = [];
    let paramCount = 0;

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
    const joinClause = `
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      INNER JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT qrv.file_id) AS total
      FROM quality_rule_violations qrv
      ${joinClause}
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        qrv.file_id,
        f.filename,
        f.created_at AS file_uploaded_at,
        DATE(f.created_at) AS upload_date,
        p.id AS project_id,
        p.name AS project_name,
        sp.id AS sub_project_id,
        sp.name AS sub_project_name,
        COUNT(*) AS violation_count,
        MAX(qrv.created_at) AS latest_violation_at
      FROM quality_rule_violations qrv
      ${joinClause}
      ${whereClause}
      GROUP BY qrv.file_id, f.filename, f.created_at, p.id, p.name, sp.id, sp.name
      ORDER BY DATE(f.created_at) DESC, f.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params.slice(0, -2)),
      db.query(dataQuery, params)
    ]);

    res.json({
      groups: dataResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching file upload violation groups:', error);
    res.status(500).json({ error: 'Failed to fetch file upload violation groups', details: error.message });
  }
});

/**
 * GET /mapping-job-violations/groups
 * Return distinct mapping jobs with violation counts — outer tier for collapsible UI
 */
router.get('/mapping-job-violations/groups', async (req, res) => {
  try {
    const {
      project_id,
      rule_type,
      severity,
      status = 'all',
      page = 1,
      limit = 10,
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = parseInt(req.user.id);
    const isAdmin = userHasAdminAccess(req.user);

    let whereConditions = ['qrv.job_id IS NOT NULL', 'qrv.job_id != \'\''];
    let params = [];
    let paramCount = 0;

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
        p.name ILIKE $${paramCount} OR
        tj_p.name ILIKE $${paramCount} OR
        qrv.violation_details::text ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    const joinClause = `
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      LEFT JOIN transformation_jobs tj ON qrv.job_id = tj.job_id
      LEFT JOIN projects tj_p ON tj.project_id = tj_p.id
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT qrv.job_id) AS total
      FROM quality_rule_violations qrv
      ${joinClause}
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        qrv.job_id,
        tj.mapping_name,
        tj.start_time AS job_start_time,
        DATE(tj.start_time) AS job_date,
        COALESCE(p.id, tj_p.id) AS project_id,
        COALESCE(p.name, tj_p.name) AS project_name,
        MIN(sp.id) AS sub_project_id,
        MIN(sp.name) AS sub_project_name,
        COUNT(*) AS violation_count,
        MAX(qrv.created_at) AS latest_violation_at
      FROM quality_rule_violations qrv
      ${joinClause}
      ${whereClause}
      GROUP BY qrv.job_id, tj.mapping_name, tj.start_time, COALESCE(p.id, tj_p.id), COALESCE(p.name, tj_p.name)
      ORDER BY DATE(tj.start_time) DESC NULLS LAST, tj.start_time DESC NULLS LAST
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params.slice(0, -2)),
      db.query(dataQuery, params)
    ]);

    res.json({
      groups: dataResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching mapping job violation groups:', error);
    res.status(500).json({ error: 'Failed to fetch mapping job violation groups', details: error.message });
  }
});

/**
 * GET /file-upload-violations/download
 * Download file upload violations as CSV or Excel
 */
router.get('/file-upload-violations/download', async (req, res) => {
  try {
    const {
      project_id,
      file_id,
      label,
      rule_type,
      severity,
      status = 'all',
      format = 'csv',
      search = ''
    } = req.query;

    const userId = parseInt(req.user.id);
    const userRoles = req.user.roles || [];
    const isAdmin = userHasAdminAccess(req.user);

    let whereConditions = ['(qrv.job_id IS NULL OR qrv.job_id = \'\')'];
    let params = [];
    let paramCount = 0;

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

    if (file_id) {
      whereConditions.push(`qrv.file_id = $${++paramCount}`);
      params.push(file_id);
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.name AS project,
        sp.name AS sub_project,
        f.filename AS file_name,
        qr.rule_type,
        qr.rule_name,
        qrv.row_number,
        qrv.column_name,
        qrv.expected_value,
        qrv.actual_value,
        qrv.severity,
        qrv.status,
        qrv.record_snapshot,
        qrv.created_at,
        NULL AS created_by,
        NULL AS file_owner,
        NULL AS source_path,
        NULL AS target_path
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      INNER JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      ${whereClause}
      ORDER BY qrv.created_at DESC
    `;

    const result = await db.query(query, params);
    const violations = result.rows;

    // Build a safe download filename: use label hint when scoped to one file
    const safeLabel = label
      ? label.split('/').pop().replace(/[^\w.\-]/g, '_')
      : null;
    const baseFilename = safeLabel || 'file-upload-violations';

    if (format === 'excel') {
      const ws = xlsx.utils.json_to_sheet(violations.map(v => ({
        Project: v.project || '',
        'Sub-Project': v.sub_project || '',
        'File Name': v.file_name || '',
        'Rule Type': v.rule_type || '',
        'Rule Name': v.rule_name || '',
        'Row Number': v.row_number || '',
        'Column Name': v.column_name || '',
        'Expected Value': v.expected_value || '',
        'Actual Value': v.actual_value || '',
        Severity: v.severity || '',
        Status: v.status || '',
        'Record Snapshot': v.record_snapshot ? JSON.stringify(v.record_snapshot) : '',
        'Created Date': v.created_at ? new Date(v.created_at).toISOString() : '',
        'Created By': v.created_by || '',
        'File Owner': v.file_owner || '',
        'Source Path': v.source_path || '',
        'Target Path': v.target_path || ''
      })));
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'File Upload Violations');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}-violations.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } else {
      const csv = [
        ['Project', 'Sub-Project', 'File Name', 'Rule Type', 'Rule Name', 'Row Number', 'Column Name', 'Expected Value', 'Actual Value', 'Severity', 'Status', 'Record Snapshot', 'Created Date', 'Created By', 'File Owner', 'Source Path', 'Target Path'],
        ...violations.map(v => [
          v.project || '', v.sub_project || '', v.file_name || '', v.rule_type || '',
          v.rule_name || '', v.row_number || '', v.column_name || '', v.expected_value || '',
          v.actual_value || '', v.severity || '', v.status || '',
          v.record_snapshot ? JSON.stringify(v.record_snapshot) : '',
          v.created_at ? new Date(v.created_at).toISOString() : '',
          v.created_by || '', v.file_owner || '', v.source_path || '', v.target_path || ''
        ])
      ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}-violations.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    }
  } catch (error) {
    console.error('Error downloading file upload violations:', error);
    res.status(500).json({ error: 'Failed to download violations' });
  }
});

/**
 * GET /mapping-job-violations/download
 * Download mapping job violations as CSV or Excel
 */
router.get('/mapping-job-violations/download', async (req, res) => {
  try {
    const {
      project_id,
      job_id,
      label,
      rule_type,
      severity,
      status = 'all',
      format = 'csv',
      search = ''
    } = req.query;

    const userId = parseInt(req.user.id);
    const userRoles = req.user.roles || [];
    const isAdmin = userHasAdminAccess(req.user);

    let whereConditions = ['qrv.job_id IS NOT NULL', 'qrv.job_id != \'\''];
    let params = [];
    let paramCount = 0;

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

    if (job_id) {
      whereConditions.push(`qrv.job_id = $${++paramCount}`);
      params.push(job_id);
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        COALESCE(p.name, tj_p.name) AS project,
        sp.name AS sub_project,
        COALESCE(f.filename, tj.mapping_name) AS file_name,
        tj.mapping_name,
        qr.rule_type,
        qr.rule_name,
        qrv.row_number,
        qrv.column_name,
        qrv.expected_value,
        qrv.actual_value,
        qrv.severity,
        qrv.status,
        qrv.record_snapshot,
        qrv.created_at,
        u.username AS created_by,
        tm.source_owner AS file_owner,
        COALESCE(tm.file_path, '') AS source_path,
        COALESCE(tm.target_file_path, '') AS target_path
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files f ON qrv.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN projects sp ON f.sub_project_id = sp.id
      LEFT JOIN transformation_jobs tj ON qrv.job_id = tj.job_id
      LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      LEFT JOIN projects tj_p ON tj.project_id = tj_p.id
      LEFT JOIN users u ON tj.executed_by = u.id
      ${whereClause}
      ORDER BY qrv.created_at DESC
    `;

    const result = await db.query(query, params);
    const violations = result.rows;

    // Build a safe download filename: use label hint when scoped to one job
    const safeLabel = label
      ? label.replace(/[^\w.\-]/g, '_')
      : null;
    const baseFilename = safeLabel || 'mapping-job-violations';

    if (format === 'excel') {
      const ws = xlsx.utils.json_to_sheet(violations.map(v => ({
        Project: v.project || '',
        'Sub-Project': v.sub_project || '',
        'File Name': v.file_name || '',
        'Rule Type': v.rule_type || '',
        'Rule Name': v.rule_name || '',
        'Row Number': v.row_number || '',
        'Column Name': v.column_name || '',
        'Expected Value': v.expected_value || '',
        'Actual Value': v.actual_value || '',
        Severity: v.severity || '',
        Status: v.status || '',
        'Record Snapshot': v.record_snapshot ? JSON.stringify(v.record_snapshot) : '',
        'Created Date': v.created_at ? new Date(v.created_at).toISOString() : '',
        'Created By': v.created_by || '',
        'File Owner': v.file_owner || '',
        'Source Path': v.source_path || '',
        'Target Path': v.target_path || ''
      })));
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Mapping Job Violations');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}-violations.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } else {
      const csv = [
        ['Project', 'Sub-Project', 'File Name', 'Rule Type', 'Rule Name', 'Row Number', 'Column Name', 'Expected Value', 'Actual Value', 'Severity', 'Status', 'Record Snapshot', 'Created Date', 'Created By', 'File Owner', 'Source Path', 'Target Path'],
        ...violations.map(v => [
          v.project || '', v.sub_project || '', v.file_name || '', v.rule_type || '',
          v.rule_name || '', v.row_number || '', v.column_name || '', v.expected_value || '',
          v.actual_value || '', v.severity || '', v.status || '',
          v.record_snapshot ? JSON.stringify(v.record_snapshot) : '',
          v.created_at ? new Date(v.created_at).toISOString() : '',
          v.created_by || '', v.file_owner || '', v.source_path || '', v.target_path || ''
        ])
      ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}-violations.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    }
  } catch (error) {
    console.error('Error downloading mapping job violations:', error);
    res.status(500).json({ error: 'Failed to download violations' });
  }
});

/**
 * POST /bulk-delete
 * Delete multiple quality rule violations at once
 * Request body: { violationIds: [id1, id2, id3, ...] }
 * Requires quality:write or violations:delete permission
 */
router.post('/bulk-delete', async (req, res) => {
  try {
    // Check for required permissions
    const userPermissions = req.user?.permissions || [];
    const userRoles = req.user?.roles || [];
    const isAdmin = userHasAdminAccess(req.user);
    
    const hasPermission = isAdmin || 
                         userPermissions.includes('quality:write') || 
                         userPermissions.includes('violations:delete');
    
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. You need admin role, quality:write, or violations:delete permission to delete violations.'
      });
    }
    
    const { violationIds } = req.body;
    
    // Validate input
    if (!violationIds || !Array.isArray(violationIds) || violationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No violation IDs provided. Please provide an array of violation IDs to delete.'
      });
    }
    
    // Validate and sanitize IDs - convert all to integers
    const sanitizedIds = violationIds.map(id => {
      const numId = Number(id);
      if (isNaN(numId) || !Number.isInteger(numId) || numId <= 0) {
        throw new Error(`Invalid violation ID: ${id}`);
      }
      return numId;
    });
    
    // Delete the violation records with sanitized integer IDs
    const result = await db.query(
      'DELETE FROM quality_rule_violations WHERE id = ANY($1) RETURNING id',
      [sanitizedIds]
    );
    
    const deletedCount = result.rowCount;
    const notFoundCount = violationIds.length - deletedCount;
    
    systemLogger.info('Bulk violation deletion completed', {
      userId: req.user.id,
      username: req.user.username,
      requested: violationIds.length,
      deleted: deletedCount,
      notFound: notFoundCount,
      violationIds: sanitizedIds
    });
    
    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} violation record(s)`,
      deleted: deletedCount,
      notFound: notFoundCount,
      total: violationIds.length
    });
    
  } catch (error) {
    systemLogger.error('Error during bulk violation deletion', { 
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete violation records',
      details: error.message
    });
  }
});

module.exports = router;
