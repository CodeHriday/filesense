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
  const pool = req.app.get('db');
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
  const pool = req.app.get('db');
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
 * GET /api/file-audit/:fileId
 * Get audit history for a specific file
 */
router.get('/:fileId', async (req, res) => {
  const pool = req.app.get('db');
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
  const pool = req.app.get('db');
  const {
    startDate,
    endDate,
    status,
    source,
    fileType,
    correlationId,
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
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
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
 * DELETE /api/file-audit/cleanup
 * Clean up old audit records based on retention policy
 */
router.delete('/cleanup', async (req, res) => {
  const pool = req.app.get('db');

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
