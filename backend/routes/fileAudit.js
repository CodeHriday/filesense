const express = require('express');
const router = express.Router();
const {
  captureFileAudit,
  captureFileSchema,
  getFileAuditHistory,
  getAuditRecords,
  cleanupOldAudits
} = require('../services/fileAuditService');

/**
 * POST /api/file-audit
 * Capture file audit details
 */
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const auditData = req.body;

  // Add user context from request
  auditData.userId = req.user?.id;
  auditData.userEmail = req.user?.email;
  auditData.ipAddress = req.ip || req.connection.remoteAddress;
  auditData.sessionId = req.session?.id;

  try {
    const result = await captureFileAudit(pool, auditData, {
      parentAuditId: auditData.parentAuditId
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        error: 'Failed to capture audit',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Audit capture error:', error);
    res.status(500).json({
      error: 'Failed to capture audit',
      details: error.message
    });
  }
});

/**
 * POST /api/file-audit/schema
 * Capture or update file schema
 */
router.post('/schema', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const schemaData = req.body;

  // Add user context
  schemaData.createdBy = req.user?.id;

  try {
    const result = await captureFileSchema(pool, schemaData);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        error: 'Failed to capture schema',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Schema capture error:', error);
    res.status(500).json({
      error: 'Failed to capture schema',
      details: error.message
    });
  }
});

/**
 * GET /api/file-audit/:auditId/logs
 * Get execution logs for a specific audit record
 */
router.get('/:auditId/logs', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const { auditId } = req.params;
  const { limit = 100 } = req.query;

  try {
    // First, get the audit record to find the related correlation_id
    const auditResult = await pool.query(
      'SELECT id, correlation_id, transformation_job_id FROM file_audit_details WHERE id = $1',
      [auditId]
    );

    if (auditResult.rows.length === 0) {
      return res.status(404).json({ error: 'Audit record not found' });
    }

    const audit = auditResult.rows[0];
    const correlationId = audit.correlation_id;

    // Fetch logs using correlation_id which matches job_id in transformation_logs
    let logs = [];
    if (correlationId) {
      const logsResult = await pool.query(
        `SELECT 
          timestamp,
          log_level as level,
          message,
          log_details as metadata
        FROM transformation_logs 
        WHERE job_id = $1 
        ORDER BY timestamp ASC 
        LIMIT $2`,
        [correlationId, parseInt(limit)]
      );
      logs = logsResult.rows;
    }

    res.json({
      auditId: auditId,
      jobId: correlationId,
      logs: logs,
      total: logs.length
    });

  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      error: 'Failed to fetch audit logs',
      details: error.message
    });
  }
});

/**
 * GET /api/file-audit/:fileId
 * Get audit history for a specific file
 */
router.get('/:fileId', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const { fileId } = req.params;
  const { limit, offset, includeSchema } = req.query;

  try {
    const result = await getFileAuditHistory(pool, fileId, {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      includeSchema: includeSchema !== 'false'
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        error: 'Failed to fetch audit history',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Fetch audit history error:', error);
    res.status(500).json({
      error: 'Failed to fetch audit history',
      details: error.message
    });
  }
});

/**
 * GET /api/file-audit/unique-mappings
 * Get all unique mapping names for dropdown filters (efficient query)
 */
router.get('/unique-mappings', async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User authentication is required to access mapping data'
    });
  }

  const pool = req.app.locals.pool || req.app.get('db');
  const { load_type, file_role } = req.query;

  try {
    // Check if user has all-project access
    const { getUserProjects, userHasAllProjectAccess } = require('../middleware/requireProjectAccess');
    const isAdmin = userHasAllProjectAccess(req.user);
    
    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (load_type) {
      conditions.push(`fad.load_type = $${paramIndex}`);
      params.push(load_type);
      paramIndex++;
    }

    if (file_role) {
      conditions.push(`fad.file_role = $${paramIndex}`);
      params.push(file_role);
      paramIndex++;
    }

    // Apply project-level access control for non-admins
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      if (userProjects.length === 0) {
        return res.json({ success: true, mappings: [], projects: [] });
      }
      const projectIds = userProjects.map(p => p.id);
      conditions.push(`f.project_id = ANY($${paramIndex})`);
      params.push(projectIds);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get unique mappings
    const mappingsQuery = `
      SELECT DISTINCT COALESCE(fad.mapping_name, tm.mapping_name) as mapping_name
      FROM file_audit_details fad
      LEFT JOIN files f ON fad.file_id = f.file_id
      LEFT JOIN transformation_jobs tj ON fad.transformation_job_id = tj.id
      LEFT JOIN transformation_mappings tm ON tj.mapping_id = CAST(tm.id AS VARCHAR)
      ${whereClause}
      ORDER BY mapping_name
    `;
    const mappingsResult = await pool.query(mappingsQuery, params);
    const mappings = mappingsResult.rows
      .filter(r => r.mapping_name)
      .map(r => r.mapping_name);

    // Get unique projects
    const projectsQuery = `
      SELECT DISTINCT f.project_id, p.name as project_name
      FROM file_audit_details fad
      LEFT JOIN files f ON fad.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      ${whereClause}
      ORDER BY p.name
    `;
    const projectsResult = await pool.query(projectsQuery, params);
    const projects = projectsResult.rows
      .filter(r => r.project_id && r.project_name)
      .map(r => ({ id: r.project_id, name: r.project_name }));

    res.json({ success: true, mappings, projects });
  } catch (error) {
    console.error('Error fetching unique mappings:', error);
    res.status(500).json({
      error: 'Failed to fetch mappings',
      details: error.message
    });
  }
});

/**
 * GET /api/file-audit
 * Get all audit records with filters
 */
router.get('/', async (req, res) => {
  // Ensure authentication is present
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User authentication is required to access audit records'
    });
  }

  const pool = req.app.locals.pool || req.app.get('db');
  const {
    startDate,
    endDate,
    status,
    source,
    fileType,
    correlationId,
    load_type,
    file_role,
    search,
    limit,
    offset
  } = req.query;

  try {
    const result = await getAuditRecords(pool, {
      startDate,
      endDate,
      status,
      source,
      fileType,
      correlationId,
      loadType: load_type,
      fileRole: file_role,
      search,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      userId: req.user.id, // Pass user info for project filtering (guaranteed to exist)
      userRoles: req.user.roles || [],
      userPermissions: req.user.permissions || [] // Pass permissions for admin-equivalent role check
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        error: 'Failed to fetch audit records',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Fetch audit records error:', error);
    res.status(500).json({
      error: 'Failed to fetch audit records',
      details: error.message
    });
  }
});

/**
 * DELETE /api/file-audit/correlation/:correlationId
 * Delete all profiling results (source and target) for a specific correlation ID
 */
router.delete('/correlation/:correlationId', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const { correlationId } = req.params;

  try {
    // Delete all audit records with this correlation_id (both source and target)
    const result = await pool.query(
      'DELETE FROM file_audit_details WHERE correlation_id = $1 RETURNING id',
      [correlationId]
    );

    res.json({
      success: true,
      message: 'Profiling results deleted successfully',
      deletedCount: result.rowCount
    });

  } catch (error) {
    console.error('Delete profiling results error:', error);
    res.status(500).json({
      error: 'Failed to delete profiling results',
      details: error.message
    });
  }
});

/**
 * DELETE /api/file-audit/cleanup
 * Clean up old audit records based on retention policy
 */
router.delete('/cleanup', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');

  try {
    const result = await cleanupOldAudits(pool);

    if (result.success) {
      res.json({
        message: 'Cleanup completed successfully',
        deletedCount: result.deletedCount
      });
    } else {
      res.status(500).json({
        error: 'Cleanup failed',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      details: error.message
    });
  }
});

module.exports = router;
