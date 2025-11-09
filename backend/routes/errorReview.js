const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Helper function to validate and parse project_id from query params
 * @param {string|number} projectId - The project ID from query params
 * @returns {number|null} - Validated integer project ID or null if invalid
 */
function parseProjectId(projectId) {
  if (!projectId || (typeof projectId === 'string' && projectId.trim() === '')) {
    return null;
  }
  const parsed = parseInt(projectId, 10);
  return (Number.isInteger(parsed) && parsed > 0) ? parsed : null;
}

router.get('/violations', async (req, res) => {
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
    const userId = parseInt(req.user.id);  // Ensure userId is an integer
    const isAdmin = req.user.role === 'admin';

    let whereConditions = [];
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

    if (rule_type) {
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
        qrv.column_name ILIKE $${paramCount} OR
        qrv.violation_details::text ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files uf ON qrv.file_id = uf.file_id
      LEFT JOIN transformation_mappings tm ON qrv.job_id = tm.id
      LEFT JOIN projects p ON COALESCE(uf.project_id, tm.project_id) = p.id
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
        qrv.processing_action,
        qrv.record_snapshot,
        qrv.updated_at,
        qrv.resolved_by,
        qrv.resolved_at,
        qrv.resolution_notes,
        qrv.created_at,
        qr.rule_name,
        qr.rule_type,
        qr.description as rule_description,
        uf.file_name,
        uf.original_filename,
        tm.mapping_name as job_name,
        p.id as project_id,
        p.project_name,
        resolver.username as resolved_by_username
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files uf ON qrv.file_id = uf.file_id
      LEFT JOIN transformation_mappings tm ON qrv.job_id = tm.id
      LEFT JOIN projects p ON COALESCE(uf.project_id, tm.project_id) = p.id
      LEFT JOIN users resolver ON qrv.resolved_by = resolver.id
      ${whereClause}
      ORDER BY qrv.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    // DEBUG: Log the exact SQL query and params
    console.log('=== VIOLATIONS QUERY DEBUG ===');
    console.log('Count Query:', countQuery);
    console.log('Count Params:', params.slice(0, -2));
    console.log('Data Query:', dataQuery);
    console.log('Data Params:', params);
    console.log('=============================');

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
    console.error('Error fetching violations:', error);
    res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

router.get('/file-errors', async (req, res) => {
  try {
    const {
      project_id,
      error_type,
      severity,
      page = 1,
      limit = 50,
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = parseInt(req.user.id);  // Ensure userId is an integer
    const isAdmin = req.user.role === 'admin';

    let whereConditions = [];
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

    if (error_type && error_type !== 'all') {
      whereConditions.push(`fe.error_type = $${++paramCount}`);
      params.push(error_type);
    }

    if (severity && severity !== 'all') {
      whereConditions.push(`fe.severity = $${++paramCount}`);
      params.push(severity);
    }

    if (search) {
      whereConditions.push(`(
        uf.file_name ILIKE $${++paramCount} OR
        uf.original_filename ILIKE $${paramCount} OR
        fe.error_message ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM file_errors fe
      INNER JOIN files uf ON fe.file_id = uf.file_id
      LEFT JOIN projects p ON uf.project_id = p.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        fe.id,
        fe.file_id,
        fe.error_type,
        fe.severity,
        fe.row_number,
        fe.column_name,
        fe.error_message,
        fe.error_details,
        fe.status,
        fe.processing_action,
        fe.record_snapshot,
        fe.updated_at,
        fe.created_at,
        uf.file_name,
        uf.original_filename,
        p.id as project_id,
        p.project_name
      FROM file_errors fe
      INNER JOIN files uf ON fe.file_id = uf.file_id
      LEFT JOIN projects p ON uf.project_id = p.id
      ${whereClause}
      ORDER BY fe.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params.slice(0, -2)),
      db.query(dataQuery, params)
    ]);

    res.json({
      errors: dataResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching file errors:', error);
    res.status(500).json({ error: 'Failed to fetch file errors' });
  }
});

router.get('/mapping-errors', async (req, res) => {
  try {
    const {
      project_id,
      error_type,
      severity,
      page = 1,
      limit = 50,
      search = ''
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = parseInt(req.user.id);  // Ensure userId is an integer
    const isAdmin = req.user.role === 'admin';

    let whereConditions = [];
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

    if (error_type && error_type !== 'all') {
      whereConditions.push(`me.error_type = $${++paramCount}`);
      params.push(error_type);
    }

    if (severity && severity !== 'all') {
      whereConditions.push(`me.severity = $${++paramCount}`);
      params.push(severity);
    }

    if (search) {
      whereConditions.push(`(
        tm.mapping_name ILIKE $${++paramCount} OR
        me.error_message ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM mapping_job_errors me
      INNER JOIN transformation_mappings tm ON me.mapping_id = tm.id
      LEFT JOIN projects p ON tm.project_id = p.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        me.id,
        me.job_id,
        me.mapping_id,
        me.error_type,
        me.severity,
        me.row_number,
        me.column_name,
        me.error_message,
        me.error_details,
        me.status,
        me.processing_action,
        me.record_snapshot,
        me.updated_at,
        me.created_at,
        tm.mapping_name,
        p.id as project_id,
        p.project_name
      FROM mapping_job_errors me
      INNER JOIN transformation_mappings tm ON me.mapping_id = tm.id
      LEFT JOIN projects p ON tm.project_id = p.id
      ${whereClause}
      ORDER BY me.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;

    params.push(parseInt(limit), offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params.slice(0, -2)),
      db.query(dataQuery, params)
    ]);

    res.json({
      errors: dataResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching mapping errors:', error);
    res.status(500).json({ error: 'Failed to fetch mapping errors' });
  }
});

router.get('/statistics', async (req, res) => {
  try {
    const { project_id } = req.query;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let projectFilter = '';
    let params = [];

    if (!isAdmin) {
      projectFilter = `AND p.id IN (
        SELECT project_id FROM project_members WHERE user_id = $1
        UNION
        SELECT pag.project_id FROM project_access_groups pag
        INNER JOIN user_groups ug ON pag.group_id = ug.group_id
        WHERE ug.user_id = $1
      )`;
      params.push(userId);
    }

    // Validate and parse project_id using helper function
    const validProjectId = parseProjectId(project_id);
    if (validProjectId) {
      projectFilter += ` AND p.id = $${params.length + 1}::integer`;
      params.push(validProjectId);
    }

    const violationsQuery = `
      SELECT 
        COUNT(*) as total_violations,
        COUNT(CASE WHEN qrv.severity = 'critical' THEN 1 END) as critical_violations,
        COUNT(CASE WHEN qrv.severity = 'error' THEN 1 END) as error_violations,
        COUNT(CASE WHEN qrv.severity = 'warning' THEN 1 END) as warning_violations,
        COUNT(CASE WHEN qrv.status = 'new' THEN 1 END) as new_violations,
        COUNT(CASE WHEN qrv.status = 'reviewed' THEN 1 END) as reviewed_violations,
        COUNT(CASE WHEN qr.rule_type = 'completeness' THEN 1 END) as completeness_violations,
        COUNT(CASE WHEN qr.rule_type = 'validity' THEN 1 END) as validity_violations,
        COUNT(CASE WHEN qr.rule_type = 'consistency' THEN 1 END) as consistency_violations,
        COUNT(CASE WHEN qr.rule_type = 'uniqueness' THEN 1 END) as uniqueness_violations,
        COUNT(CASE WHEN qr.rule_type = 'freshness' THEN 1 END) as freshness_violations
      FROM quality_rule_violations qrv
      INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
      LEFT JOIN files uf ON qrv.file_id = uf.file_id
      LEFT JOIN transformation_mappings tm ON qrv.job_id = tm.id
      LEFT JOIN projects p ON COALESCE(uf.project_id, tm.project_id) = p.id
      WHERE 1=1 ${projectFilter}
    `;

    const fileErrorsQuery = `
      SELECT 
        COUNT(*) as total_file_errors,
        COUNT(CASE WHEN fe.severity = 'critical' THEN 1 END) as critical_file_errors,
        COUNT(CASE WHEN fe.severity = 'error' THEN 1 END) as error_file_errors,
        COUNT(CASE WHEN fe.severity = 'warning' THEN 1 END) as warning_file_errors
      FROM file_errors fe
      INNER JOIN files uf ON fe.file_id = uf.file_id
      LEFT JOIN projects p ON uf.project_id = p.id
      WHERE 1=1 ${projectFilter}
    `;

    const mappingErrorsQuery = `
      SELECT 
        COUNT(*) as total_mapping_errors,
        COUNT(CASE WHEN me.severity = 'critical' THEN 1 END) as critical_mapping_errors,
        COUNT(CASE WHEN me.severity = 'error' THEN 1 END) as error_mapping_errors,
        COUNT(CASE WHEN me.severity = 'warning' THEN 1 END) as warning_mapping_errors
      FROM mapping_job_errors me
      INNER JOIN transformation_mappings tm ON me.mapping_id = tm.id
      LEFT JOIN projects p ON tm.project_id = p.id
      WHERE 1=1 ${projectFilter}
    `;

    const [violationsResult, fileErrorsResult, mappingErrorsResult] = await Promise.all([
      db.query(violationsQuery, params),
      db.query(fileErrorsQuery, params),
      db.query(mappingErrorsQuery, params)
    ]);

    res.json({
      violations: violationsResult.rows[0],
      file_errors: fileErrorsResult.rows[0],
      mapping_errors: mappingErrorsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching error statistics:', error);
    res.status(500).json({ error: 'Failed to fetch error statistics' });
  }
});

router.patch('/violations/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    const userId = req.user?.id;

    if (!['new', 'reviewed', 'acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // If marking as resolved, capture resolver info
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
