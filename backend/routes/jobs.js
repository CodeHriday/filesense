const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { getJobStatus, cancelJob } = require('../services/jobExecutionEngine');
const { 
  decodeCursor, 
  encodeCursor, 
  processCursorResults, 
  createPaginatedResponse 
} = require('../utils/cursorPagination');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * GET /api/jobs/stats/summary
 * Get job statistics summary - uses materialized views for enterprise performance
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { days = 30, projectId } = req.query;
    
    // Try to use materialized view first for faster response
    let usedMaterializedView = false;
    let statsResult, anomalyResult;
    
    try {
      // Check if materialized view exists and is fresh enough
      const mvCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM pg_matviews WHERE matviewname = 'mv_dashboard_summary'
        ) as exists
      `);
      
      if (mvCheck.rows[0].exists) {
        // Use materialized view for instant response
        const mvQuery = projectId
          ? `SELECT * FROM mv_dashboard_summary WHERE project_id = $1`
          : `SELECT * FROM mv_dashboard_summary WHERE project_id = 0`;
        
        const mvResult = await pool.query(mvQuery, projectId ? [projectId] : []);
        
        if (mvResult.rows.length > 0) {
          const row = mvResult.rows[0];
          statsResult = {
            rows: [{
              total_jobs: row.total_jobs,
              completed_jobs: row.completed_jobs,
              failed_jobs: row.failed_jobs,
              running_jobs: row.running_jobs,
              total_files: row.total_files,
              total_rows_read: row.total_records_processed,
              total_rows_written: row.total_records_processed,
              total_rows_failed: 0
            }]
          };
          anomalyResult = {
            rows: [{
              total_anomalies: row.total_anomalies,
              high_severity: row.critical_anomalies,
              medium_severity: 0,
              low_severity: 0,
              open_anomalies: row.total_anomalies
            }]
          };
          usedMaterializedView = true;
        }
      }
    } catch (mvError) {
      // Materialized view not available, fall back to live query
      systemLogger.debug('Materialized view not available, using live query', {
        error: mvError.message,
      });
    }
    
    // Fall back to live query if materialized view not used
    if (!usedMaterializedView) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
      
      statsResult = await pool.query(`
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
      
      anomalyResult = await pool.query(`
        SELECT 
          COUNT(*) as total_anomalies,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_anomalies
        FROM anomalies
        WHERE detected_at >= $1
      `, [cutoffDate]);
    }
    
    res.json({
      period: `Last ${days} days`,
      jobs: statsResult.rows[0],
      anomalies: anomalyResult.rows[0],
      source: usedMaterializedView ? 'materialized_view' : 'live_query'
    });
    
  } catch (error) {
    systemLogger.error('Error getting job stats:', error);
    res.status(500).json({ error: 'Failed to get job statistics' });
  }
});

/**
 * GET /api/jobs/v2
 * List jobs with cursor-based pagination for enterprise performance
 * Supports terabyte-scale datasets with constant-time pagination
 */
router.get('/v2', async (req, res) => {
  try {
    const { 
      status, 
      mappingId,
      projectId,
      cursor,
      limit = 50, 
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    const pageLimit = Math.min(parseInt(limit) || 50, 100);
    
    // Get user's accessible projects
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const projectIds = userProjects.map(p => p.id);
    
    const isAdmin = userHasAdminAccess(req.user);
    
    if (projectIds.length === 0 && !isAdmin) {
      return res.json(createPaginatedResponse([], null, false, { total: 0 }));
    }
    
    // Decode cursor
    const cursorValues = decodeCursor(cursor);
    
    // Build query with cursor support
    let query = `
      SELECT 
        tj.id,
        tj.mapping_id,
        tj.mapping_name,
        tj.status,
        tj.created_at,
        tj.start_time,
        tj.end_time,
        tj.records_processed,
        tj.records_failed,
        tj.error_message,
        tj.execution_type,
        tj.jira_issue_key,
        mg.name as mapping_group_name,
        COALESCE(nw.name, vw.name) as workflow_name,
        tm.project_id,
        p.name as project_name
      FROM transformation_jobs tj
      LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      LEFT JOIN projects p ON tm.project_id = p.id
      LEFT JOIN mapping_group_executions mge ON tj.mapping_group_execution_id = mge.id
      LEFT JOIN mapping_groups mg ON mge.group_id = mg.id
      LEFT JOIN n_step_workflow_runs nwr ON tj.workflow_execution_id = nwr.id
      LEFT JOIN n_step_workflows nw ON nwr.workflow_id = nw.id
      LEFT JOIN visual_workflow_executions vwe ON tj.visual_workflow_execution_id = vwe.id
      LEFT JOIN visual_workflows vw ON vwe.workflow_id = vw.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Project access filter
    if (!isAdmin) {
      query += ` AND tm.project_id = ANY($${paramIndex}::integer[])`;
      params.push(projectIds);
      paramIndex++;
    }
    
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
    
    if (projectId) {
      query += ` AND tm.project_id = $${paramIndex}`;
      params.push(parseInt(projectId));
      paramIndex++;
    }
    
    // Cursor-based pagination
    const sortColumn = ['created_at', 'end_time', 'status'].includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const operator = order === 'DESC' ? '<' : '>';
    
    if (cursorValues) {
      query += ` AND (
        tj.${sortColumn} ${operator} $${paramIndex}
        OR (tj.${sortColumn} = $${paramIndex} AND tj.id ${operator} $${paramIndex + 1})
      )`;
      params.push(cursorValues.sortValue, cursorValues.cursorId);
    }
    
    query += ` ORDER BY tj.${sortColumn} ${order}, tj.id ${order}`;
    query += ` LIMIT ${pageLimit + 1}`; // Fetch one extra to check for more pages
    
    const result = await pool.query(query, params);
    
    // Process results with cursor
    const { items, nextCursor, hasMore } = processCursorResults(
      result.rows,
      pageLimit,
      sortColumn,
      'id'
    );
    
    res.json(createPaginatedResponse(items, nextCursor, hasMore, {
      sortBy: sortColumn,
      sortOrder: order
    }));
    
  } catch (error) {
    systemLogger.error('Error listing jobs (v2):', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/jobs
 * List all transformation jobs (filtered by user's accessible projects)
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
    
    // Get user's accessible projects
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const projectIds = userProjects.map(p => p.id);
    
    // Admin bypass check
    const isAdmin = userHasAdminAccess(req.user);
    
    // If user has no projects and is not admin, return empty list
    if (projectIds.length === 0 && !isAdmin) {
      return res.json({
        jobs: [],
        total: 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }
    
    let query = `
      SELECT 
        tj.*,
        mg.name as mapping_group_name,
        COALESCE(nw.name, vw.name) as workflow_name,
        s.id as schedule_id,
        s.schedule_name,
        s.schedule_type,
        s.cron_expression,
        s.interval_value,
        s.interval_unit,
        tm.project_id,
        p.name as project_name
      FROM transformation_jobs tj
      LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      LEFT JOIN projects p ON tm.project_id = p.id
      LEFT JOIN mapping_group_executions mge ON tj.mapping_group_execution_id = mge.id
      LEFT JOIN mapping_groups mg ON mge.group_id = mg.id
      LEFT JOIN n_step_workflow_runs nwr ON tj.workflow_execution_id = nwr.id
      LEFT JOIN n_step_workflows nw ON nwr.workflow_id = nw.id
      LEFT JOIN visual_workflow_executions vwe ON tj.visual_workflow_execution_id = vwe.id
      LEFT JOIN visual_workflows vw ON vwe.workflow_id = vw.id
      LEFT JOIN schedules s ON tj.schedule_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filter by user's accessible projects (admins bypass)
    if (!isAdmin) {
      query += ` AND tm.project_id = ANY($${paramIndex}::integer[])`;
      params.push(projectIds);
      paramIndex++;
    }
    
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
      LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      LEFT JOIN mapping_group_executions mge ON tj.mapping_group_execution_id = mge.id
      LEFT JOIN mapping_groups mg ON mge.group_id = mg.id
      LEFT JOIN n_step_workflow_runs nwr ON tj.workflow_execution_id = nwr.id
      LEFT JOIN n_step_workflows nw ON nwr.workflow_id = nw.id
      LEFT JOIN schedules s ON tj.schedule_id = s.id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;
    
    // Filter by user's accessible projects (admins bypass)
    if (!isAdmin) {
      countQuery += ` AND tm.project_id = ANY($${countParamIndex}::integer[])`;
      countParams.push(projectIds);
      countParamIndex++;
    }
    
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
    
    // Validate user has access to this job's project
    const { validateJobAccess } = require('../utils/jobAccessHelpers');
    await validateJobAccess(id, req.user);
    
    const jobData = await getJobStatus(pool, id);
    
    res.json(jobData.job);
    
  } catch (error) {
    // Handle access control errors
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    
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
    
    // Validate user has access to this job's project
    const { validateJobAccess } = require('../utils/jobAccessHelpers');
    await validateJobAccess(id, req.user);
    
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
    // Handle access control errors
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    
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
    // Check if user has jobs:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('jobs:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to cancel jobs. Contact your administrator.'
      });
    }
    
    const { id } = req.params;
    
    // Validate user has access to this job's project
    const { validateJobAccess } = require('../utils/jobAccessHelpers');
    await validateJobAccess(id, req.user);
    
    const updatedJob = await cancelJob(pool, id);
    
    res.json({
      message: 'Job cancelled successfully',
      job: updatedJob
    });
    
  } catch (error) {
    // Handle access control errors
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    
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
    
    // Validate user has access to this job's project
    const { validateJobAccess } = require('../utils/jobAccessHelpers');
    await validateJobAccess(id, req.user);
    
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
    // Handle access control errors
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    
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
    
    // Validate user has access to this job's project
    const { validateJobAccess } = require('../utils/jobAccessHelpers');
    await validateJobAccess(id, req.user);
    
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
    // Handle access control errors
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    
    systemLogger.error('Error getting job metrics:', error);
    res.status(500).json({ error: 'Failed to get job metrics' });
  }
});

/**
 * GET /api/jobs/:id/profiling
 * Get comprehensive profiling data for transformation job (source + target files with columns)
 */
router.get('/:id/profiling', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate user has access to this job's project
    const { validateJobAccess } = require('../utils/jobAccessHelpers');
    await validateJobAccess(id, req.user);
    
    // Get job to find correlation_id
    const jobResult = await pool.query(
      'SELECT correlation_id FROM transformation_jobs WHERE job_id = $1',
      [id]
    );
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const correlationId = jobResult.rows[0].correlation_id;
    
    if (!correlationId) {
      return res.status(404).json({ error: 'No profiling data available for this job' });
    }
    
    // Get files for this correlation_id (source and target)
    const filesResult = await pool.query(`
      SELECT 
        f.*,
        pm.value_distributions
      FROM files f
      LEFT JOIN profiling_metrics pm ON f.file_id = pm.file_id AND f.file_role = pm.file_role
      WHERE f.correlation_id = $1
      ORDER BY f.file_role DESC
    `, [correlationId]);
    
    // Get column stats for each file
    const source = filesResult.rows.find(f => f.file_role === 'source');
    const target = filesResult.rows.find(f => f.file_role === 'target');
    
    // Fetch column stats for source
    let sourceColumns = [];
    if (source) {
      const sourceColumnsResult = await pool.query(`
        SELECT * FROM file_columns 
        WHERE file_id = $1 AND file_role = 'source'
        ORDER BY column_index
      `, [source.file_id]);
      sourceColumns = sourceColumnsResult.rows;
    }
    
    // Fetch column stats for target
    let targetColumns = [];
    if (target) {
      const targetColumnsResult = await pool.query(`
        SELECT * FROM file_columns 
        WHERE file_id = $1 AND file_role = 'target'
        ORDER BY column_index
      `, [target.file_id]);
      targetColumns = targetColumnsResult.rows;
    }
    
    res.json({
      jobId: id,
      correlationId,
      source: source ? {
        ...source,
        column_stats: sourceColumns
      } : null,
      target: target ? {
        ...target,
        column_stats: targetColumns
      } : null
    });
    
  } catch (error) {
    // Handle access control errors
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    
    systemLogger.error('Error getting job profiling data:', error);
    res.status(500).json({ error: 'Failed to get job profiling data' });
  }
});

/**
 * GET /api/jobs/:id/full
 * Batch endpoint to get complete job details including logs, anomalies, and metrics
 * Replaces 4 separate API calls: job, logs, anomalies, metrics
 * Used by ETLJobDetails page for efficient data loading
 */
router.get('/:id/full', async (req, res) => {
  try {
    const { id } = req.params;
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE id = $1 OR correlation_id = $1',
      [id]
    );
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = jobResult.rows[0];
    
    const isAdmin = userHasAdminAccess(req.user);
    if (!isAdmin && job.project_id) {
      const userProjects = await getUserProjects(req.user.id);
      const projectIds = userProjects.map(p => p.id);
      
      if (!projectIds.includes(job.project_id)) {
        return res.status(403).json({ error: 'Access denied to this job' });
      }
    }
    
    const [logsResult, anomaliesResult, metricsResult] = await Promise.all([
      pool.query(`
        SELECT id, job_id,
               log_level, log_level AS level,
               message,
               log_details, log_details AS details,
               timestamp, timestamp AS created_at
        FROM transformation_logs
        WHERE job_id = $1
        ORDER BY timestamp ASC
        LIMIT 1000
      `, [job.job_id]),
      pool.query(`
        SELECT id, anomaly_type, severity, description, detected_at, status
        FROM anomalies
        WHERE job_id = $1
        ORDER BY detected_at DESC
      `, [job.id]),
      pool.query(`
        SELECT metric_name, metric_value, recorded_at
        FROM job_metrics
        WHERE job_id = $1
        ORDER BY recorded_at ASC
      `, [job.id])
    ]);
    
    res.json({
      success: true,
      job,
      logs: logsResult.rows,
      anomalies: anomaliesResult.rows,
      metrics: metricsResult.rows
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/jobs/:id/full', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

module.exports = router;
