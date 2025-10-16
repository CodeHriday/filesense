const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { getJobStatus, cancelJob } = require('../services/jobExecutionEngine');

/**
 * GET /api/jobs/stats/summary
 * Get job statistics summary
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
        SUM(files_processed) as total_files,
        SUM(rows_read) as total_rows_read,
        SUM(rows_written) as total_rows_written,
        SUM(rows_failed) as total_rows_failed,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_seconds
      FROM transformation_jobs
      WHERE created_at >= $1
    `, [cutoffDate]);
    
    const anomalyResult = await pool.query(`
      SELECT 
        COUNT(*) as total_anomalies,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_anomalies
      FROM anomalies
      WHERE detected_at >= $1
    `, [cutoffDate]);
    
    res.json({
      period: `Last ${days} days`,
      jobs: statsResult.rows[0],
      anomalies: anomalyResult.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error getting job stats:', error);
    res.status(500).json({ error: 'Failed to get job statistics' });
  }
});

/**
 * GET /api/jobs
 * List all transformation jobs
 */
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      mappingId, 
      limit = 50, 
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    let query = `
      SELECT 
        tj.*,
        mg.name as mapping_group_name,
        nw.name as workflow_name,
        s.schedule_name
      FROM transformation_jobs tj
      LEFT JOIN mapping_group_executions mge ON tj.mapping_group_execution_id = mge.id
      LEFT JOIN mapping_groups mg ON mge.group_id = mg.id
      LEFT JOIN n_step_workflow_runs nwr ON tj.workflow_execution_id = nwr.id
      LEFT JOIN n_step_workflows nw ON nwr.workflow_id = nw.id
      LEFT JOIN schedules s ON tj.schedule_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND tj.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (mappingId) {
      query += ` AND tj.mapping_id = $${paramIndex}`;
      params.push(mappingId);
      paramIndex++;
    }
    
    // Validate sortBy to prevent SQL injection
    const allowedSortColumns = ['created_at', 'end_time', 'status', 'mapping_name'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY tj.${sortColumn} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(*) 
      FROM transformation_jobs tj
      LEFT JOIN mapping_group_executions mge ON tj.mapping_group_execution_id = mge.id
      LEFT JOIN mapping_groups mg ON mge.group_id = mg.id
      LEFT JOIN n_step_workflow_runs nwr ON tj.workflow_execution_id = nwr.id
      LEFT JOIN n_step_workflows nw ON nwr.workflow_id = nw.id
      LEFT JOIN schedules s ON tj.schedule_id = s.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;
    
    if (status) {
      countQuery += ` AND tj.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }
    
    if (mappingId) {
      countQuery += ` AND tj.mapping_id = $${countParamIndex}`;
      countParams.push(mappingId);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    systemLogger.error('Error listing jobs:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/jobs/:id
 * Get job details with logs
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const jobData = await getJobStatus(pool, id);
    
    res.json(jobData);
    
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    systemLogger.error('Error getting job:', error);
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

/**
 * GET /api/jobs/:id/logs
 * Get job logs only
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { level, limit = 100 } = req.query;
    
    let query = 'SELECT * FROM transformation_logs WHERE job_id = $1';
    const params = [id];
    
    if (level) {
      query += ' AND log_level = $2';
      params.push(level);
    }
    
    query += ' ORDER BY timestamp ASC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      jobId: id,
      logs: result.rows,
      total: result.rowCount
    });
    
  } catch (error) {
    systemLogger.error('Error getting job logs:', error);
    res.status(500).json({ error: 'Failed to get job logs' });
  }
});

/**
 * POST /api/jobs/:id/cancel
 * Cancel a running job
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updatedJob = await cancelJob(pool, id);
    
    res.json({
      message: 'Job cancelled successfully',
      job: updatedJob
    });
    
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Handle conflict error (job already in terminal state)
    if (error.statusCode === 409) {
      return res.status(409).json({ error: error.message });
    }
    
    systemLogger.error('Error cancelling job:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

/**
 * GET /api/jobs/:id/anomalies
 * Get anomalies detected for this job
 */
router.get('/:id/anomalies', async (req, res) => {
  try {
    const { id } = req.params;
    const { severity, status = 'open' } = req.query;
    
    let query = 'SELECT * FROM anomalies WHERE job_id = $1';
    const params = [id];
    let paramIndex = 2;
    
    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
    }
    
    query += ' ORDER BY detected_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      jobId: id,
      anomalies: result.rows,
      total: result.rowCount
    });
    
  } catch (error) {
    systemLogger.error('Error getting job anomalies:', error);
    res.status(500).json({ error: 'Failed to get job anomalies' });
  }
});

/**
 * GET /api/jobs/:id/metrics
 * Get profiling metrics for this job
 */
router.get('/:id/metrics', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM profiling_metrics WHERE job_id = $1 ORDER BY profiled_at DESC',
      [id]
    );
    
    res.json({
      jobId: id,
      metrics: result.rows,
      total: result.rowCount
    });
    
  } catch (error) {
    systemLogger.error('Error getting job metrics:', error);
    res.status(500).json({ error: 'Failed to get job metrics' });
  }
});

module.exports = router;
