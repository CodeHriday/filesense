const express = require('express');
const router = express.Router();

module.exports = (dbPool, logger) => {
  /**
   * GET /api/ml/anomalies
   * Get anomalies with optional filtering
   */
  router.get('/anomalies', async (req, res) => {
    try {
      const { severity, status, anomaly_type, limit = 100 } = req.query;
      
      let query = `
        SELECT 
          id,
          anomaly_id,
          file_id,
          file_name,
          mapping_id,
          job_id,
          anomaly_type,
          severity,
          title,
          description,
          anomaly_details,
          expected_value,
          actual_value,
          deviation_percentage,
          status,
          resolved_at,
          resolved_by,
          resolution_notes,
          detected_at,
          created_at
        FROM anomalies
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 1;
      
      if (severity) {
        query += ` AND severity = $${paramCount}`;
        params.push(severity);
        paramCount++;
      }
      
      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }
      
      if (anomaly_type) {
        query += ` AND anomaly_type = $${paramCount}`;
        params.push(anomaly_type);
        paramCount++;
      }
      
      query += ` ORDER BY detected_at DESC LIMIT $${paramCount}`;
      params.push(parseInt(limit));
      
      const result = await dbPool.query(query, params);
      
      res.json({
        success: true,
        anomalies: result.rows
      });
      
    } catch (err) {
      logger.error('Error fetching anomalies:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch anomalies',
        details: err.message
      });
    }
  });

  /**
   * GET /api/ml/anomalies/statistics
   * Get anomaly statistics
   */
  router.get('/anomalies/statistics', async (req, res) => {
    try {
      // Get counts by status
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM anomalies
        GROUP BY status
      `;
      const statusResult = await dbPool.query(statusQuery);
      
      const by_status = {};
      statusResult.rows.forEach(row => {
        by_status[row.status] = parseInt(row.count);
      });
      
      // Get counts by severity for open anomalies
      const severityQuery = `
        SELECT severity, COUNT(*) as count
        FROM anomalies
        WHERE status = 'open'
        GROUP BY severity
      `;
      const severityResult = await dbPool.query(severityQuery);
      
      const by_severity = {};
      severityResult.rows.forEach(row => {
        by_severity[row.severity] = parseInt(row.count);
      });
      
      // Get counts by type for open anomalies
      const typeQuery = `
        SELECT anomaly_type, COUNT(*) as count
        FROM anomalies
        WHERE status = 'open'
        GROUP BY anomaly_type
        ORDER BY count DESC
        LIMIT 10
      `;
      const typeResult = await dbPool.query(typeQuery);
      
      const by_type = {};
      typeResult.rows.forEach(row => {
        by_type[row.anomaly_type] = parseInt(row.count);
      });
      
      res.json({
        success: true,
        by_status,
        by_severity,
        by_type,
        total_open: by_status.open || 0,
        total_resolved: by_status.resolved || 0
      });
      
    } catch (err) {
      logger.error('Error fetching anomaly statistics:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        details: err.message
      });
    }
  });

  /**
   * POST /api/ml/anomalies/:anomaly_id/resolve
   * Resolve an anomaly
   */
  router.post('/anomalies/:anomaly_id/resolve', async (req, res) => {
    try {
      const { anomaly_id } = req.params;
      const { resolution_notes } = req.body;
      
      if (!resolution_notes || !resolution_notes.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Resolution notes are required'
        });
      }
      
      const userId = req.user?.userId || req.user?.id || 'system';
      
      const query = `
        UPDATE anomalies
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = $1,
            resolution_notes = $2
        WHERE anomaly_id = $3
        RETURNING *
      `;
      
      const result = await dbPool.query(query, [userId, resolution_notes, anomaly_id]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Anomaly not found'
        });
      }
      
      logger.info('Anomaly resolved', {
        anomalyId: anomaly_id,
        resolvedBy: userId
      });
      
      res.json({
        success: true,
        anomaly: result.rows[0]
      });
      
    } catch (err) {
      logger.error('Error resolving anomaly:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve anomaly',
        details: err.message
      });
    }
  });

  /**
   * GET /api/ml/anomalies/file/:file_id
   * Get anomalies for a specific file
   */
  router.get('/anomalies/file/:file_id', async (req, res) => {
    try {
      const { file_id } = req.params;
      const { status } = req.query;
      
      let query = `
        SELECT 
          id,
          anomaly_id,
          file_id,
          file_name,
          mapping_id,
          job_id,
          anomaly_type,
          severity,
          title,
          description,
          anomaly_details,
          expected_value,
          actual_value,
          deviation_percentage,
          status,
          resolved_at,
          resolved_by,
          resolution_notes,
          detected_at,
          created_at
        FROM anomalies
        WHERE file_id = $1
      `;
      
      const params = [file_id];
      
      if (status) {
        query += ` AND status = $2`;
        params.push(status);
      }
      
      query += ` ORDER BY detected_at DESC`;
      
      const result = await dbPool.query(query, params);
      
      res.json({
        success: true,
        anomalies: result.rows
      });
      
    } catch (err) {
      logger.error('Error fetching file anomalies:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch file anomalies',
        details: err.message
      });
    }
  });

  return router;
};
