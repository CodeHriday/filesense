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
      userRoles: req.user.roles || []
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
