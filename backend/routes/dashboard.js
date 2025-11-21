const express = require('express');
const router = express.Router();
const { createCacheMiddleware } = require('../src/middleware/cache');

const dashboardCacheMiddleware = createCacheMiddleware({
  ttl: 120,
  keyGenerator: (req) => {
    const userId = req.user?.id || 'anonymous';
    const roles = req.user?.roles?.sort().join(':') || 'no-roles';
    const path = req.path || req.route?.path || 'unknown';
    const days = req.query?.days || '';
    return `dashboard:${path}:user:${userId}:roles:${roles}:days:${days}`;
  },
  shouldCache: (req, res) => res.statusCode === 200
});

/**
 * GET /api/dashboard/metrics
 * Get dashboard metrics for the current user
 */
router.get('/metrics', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];

    // Check if user is admin
    const isAdmin = userRoles.includes('Admin');

    // Get user's accessible projects
    let projectsQuery;
    let projectsParams;

    if (isAdmin) {
      // Admin sees all projects
      projectsQuery = 'SELECT COUNT(DISTINCT id) as count FROM projects';
      projectsParams = [];
    } else {
      // Non-admin: use optimized function for project access (direct + group membership)
      projectsQuery = `
        SELECT COUNT(DISTINCT p.id) as count
        FROM projects p
        WHERE p.id IN (SELECT project_id FROM get_user_projects($1))
      `;
      projectsParams = [userId];
    }

    const projectsResult = await pool.query(projectsQuery, projectsParams);
    const projectsCount = parseInt(projectsResult.rows[0]?.count || 0);

    // Get user's accessible files (through projects)
    let filesQuery;
    let filesParams;

    if (isAdmin) {
      // Admin sees all files
      filesQuery = 'SELECT COUNT(DISTINCT id) as count FROM files';
      filesParams = [];
    } else {
      // Non-admin: use optimized function for project access
      filesQuery = `
        SELECT COUNT(DISTINCT f.id) as count
        FROM files f
        WHERE f.project_id IN (SELECT project_id FROM get_user_projects($1))
      `;
      filesParams = [userId];
    }

    const filesResult = await pool.query(filesQuery, filesParams);
    const filesCount = parseInt(filesResult.rows[0]?.count || 0);

    // Get schedules count (from user's accessible projects)
    let schedulesQuery;
    let schedulesParams;

    if (isAdmin) {
      // Admin sees all schedules
      schedulesQuery = `
        SELECT COUNT(DISTINCT id) as count 
        FROM schedules 
        WHERE is_active = true
      `;
      schedulesParams = [];
    } else {
      // Non-admin: use optimized function for project access
      schedulesQuery = `
        SELECT COUNT(DISTINCT s.id) as count
        FROM schedules s
        WHERE s.is_active = true 
        AND s.project_id IN (SELECT project_id FROM get_user_projects($1))
      `;
      schedulesParams = [userId];
    }

    const schedulesResult = await pool.query(schedulesQuery, schedulesParams);
    const schedulesCount = parseInt(schedulesResult.rows[0]?.count || 0);

    // Get all jobs count (from user's accessible projects) - not just failed
    let jobsQuery;
    let jobsParams;

    if (isAdmin) {
      // Admin sees all jobs
      jobsQuery = `
        SELECT COUNT(DISTINCT id) as count 
        FROM transformation_jobs
      `;
      jobsParams = [];
    } else {
      // Non-admin: use optimized function for project access
      jobsQuery = `
        SELECT COUNT(DISTINCT tj.id) as count
        FROM transformation_jobs tj
        WHERE tj.project_id IN (SELECT project_id FROM get_user_projects($1))
      `;
      jobsParams = [userId];
    }

    const jobsResult = await pool.query(jobsQuery, jobsParams);
    const jobsCount = parseInt(jobsResult.rows[0]?.count || 0);

    // Get anomalies count from alerts (from user's accessible files)
    let anomaliesQuery;
    let anomaliesParams;

    if (isAdmin) {
      // Admin sees all anomalies
      anomaliesQuery = `
        SELECT COUNT(DISTINCT id) as count 
        FROM anomalies 
        WHERE status = 'active'
      `;
      anomaliesParams = [];
    } else {
      // Non-admin: use optimized function for project access
      anomaliesQuery = `
        SELECT COUNT(DISTINCT a.id) as count
        FROM anomalies a
        INNER JOIN files f ON a.file_id = f.file_id
        WHERE a.status = 'active' 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($1))
      `;
      anomaliesParams = [userId];
    }

    const anomaliesResult = await pool.query(anomaliesQuery, anomaliesParams);
    const anomaliesCount = parseInt(anomaliesResult.rows[0]?.count || 0);

    res.json({
      success: true,
      metrics: {
        projects: projectsCount,
        files: filesCount,
        schedules: schedulesCount,
        jobs: jobsCount,
        anomalies: anomaliesCount
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard metrics',
      details: error.message
    });
  }
});

/**
 * GET /api/dashboard/executive-metrics
 * Get executive-level strategic KPIs for C-suite dashboard
 * Returns 8 strategic metrics across 4 pillars:
 * - Data Health, Pipeline Reliability, Governance & Compliance, Adoption & Automation
 */
router.get('/executive-metrics', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes('Admin');
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    
    const timeRange = parseInt(req.query.days) || 30;
    const comparisonRange = timeRange;
    
    const now = new Date();
    const rangeStart = new Date(now.getTime() - timeRange * 24 * 60 * 60 * 1000);
    const comparisonStart = new Date(rangeStart.getTime() - comparisonRange * 24 * 60 * 60 * 1000);
    const sparklineStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let healthIndex = null, prevHealthIndex = null, currentCount = 0, prevCount = 0;
    let completedJobs = 0, totalJobs = 0, criticalAlerts = 0, highRiskPII = 0;
    let totalVendors = 0, compliantVendors = 0, totalFiles = 0, taggedFiles = 0;
    let activeTokens = 0, apiRequests = 0;
    let healthSparkline = [], throughputSparkline = [];

    if (isAdmin && !projectId) {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL
      `, [rangeStart]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL
      `, [comparisonStart, rangeStart]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1`, [rangeStart]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 AND f.created_at < $2`, [comparisonStart, rangeStart]);
      prevCount = parseInt(prevThroughput.rows[0]?.count || 0);

      const jobsResult = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) as total
        FROM transformation_jobs tj WHERE tj.created_at >= $1
      `, [rangeStart]);
      completedJobs = parseInt(jobsResult.rows[0]?.completed || 0);
      totalJobs = parseInt(jobsResult.rows[0]?.total || 0);

      const alertsResult = await pool.query(`
        SELECT COUNT(DISTINCT ae.id) as count FROM alert_events ae
        INNER JOIN alert_runs ar ON ae.run_id = ar.id
        INNER JOIN alert_policies ap ON ar.policy_id = ap.id
        WHERE ae.status IN ('OPEN', 'ACTIVE', 'TRIGGERED')
      `, []);
      criticalAlerts = parseInt(alertsResult.rows[0]?.count || 0);

      const piiResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as count FROM files f
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
      `, []);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.id) as total_vendors,
        COUNT(DISTINCT va.id) FILTER (WHERE EXISTS (SELECT 1 FROM files f WHERE f.project_id = va.project_id AND f.created_at >= $1)) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active'
      `, [rangeStart]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f WHERE f.created_at >= $1
      `, [rangeStart]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
      `, [rangeStart]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL GROUP BY f.created_at::date),
        daily_files AS (SELECT f.created_at::date as date, COUNT(*) as file_count FROM files f WHERE f.created_at >= $1 GROUP BY f.created_at::date)
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

    } else if (isAdmin && projectId) {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL AND f.project_id = $2
      `, [rangeStart, projectId]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL AND f.project_id = $3
      `, [comparisonStart, rangeStart, projectId]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 AND f.project_id = $2`, [rangeStart, projectId]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 AND f.project_id = $3`, [comparisonStart, rangeStart, projectId]);
      prevCount = parseInt(prevThroughput.rows[0]?.count || 0);

      const jobsResult = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) as total
        FROM transformation_jobs tj WHERE tj.created_at >= $1 AND tj.project_id = $2
      `, [rangeStart, projectId]);
      completedJobs = parseInt(jobsResult.rows[0]?.completed || 0);
      totalJobs = parseInt(jobsResult.rows[0]?.total || 0);

      const alertsResult = await pool.query(`
        SELECT COUNT(DISTINCT ae.id) as count FROM alert_events ae
        INNER JOIN alert_runs ar ON ae.run_id = ar.id
        INNER JOIN alert_policies ap ON ar.policy_id = ap.id
        WHERE ae.status IN ('OPEN', 'ACTIVE', 'TRIGGERED') AND ap.project_id = $1
      `, [projectId]);
      criticalAlerts = parseInt(alertsResult.rows[0]?.count || 0);

      const piiResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as count FROM files f
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND f.project_id = $1
      `, [projectId]);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.id) as total_vendors,
        COUNT(DISTINCT va.id) FILTER (WHERE EXISTS (SELECT 1 FROM files f WHERE f.project_id = va.project_id AND f.created_at >= $1)) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active'
      `, [rangeStart]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f WHERE f.created_at >= $1
      `, [rangeStart]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
      `, [rangeStart]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL GROUP BY f.created_at::date),
        daily_files AS (SELECT f.created_at::date as date, COUNT(*) as file_count FROM files f WHERE f.created_at >= $1 GROUP BY f.created_at::date)
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

    } else if (!isAdmin && !projectId) {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($3))
      `, [comparisonStart, rangeStart, userId]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`
        SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`
        SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($3))
      `, [comparisonStart, rangeStart, userId]);
      prevCount = parseInt(prevThroughput.rows[0]?.count || 0);

      const jobsResult = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) as total
        FROM transformation_jobs tj WHERE tj.created_at >= $1 
        AND tj.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      completedJobs = parseInt(jobsResult.rows[0]?.completed || 0);
      totalJobs = parseInt(jobsResult.rows[0]?.total || 0);

      const alertsResult = await pool.query(`
        SELECT COUNT(DISTINCT ae.id) as count FROM alert_events ae
        INNER JOIN alert_runs ar ON ae.run_id = ar.id
        INNER JOIN alert_policies ap ON ar.policy_id = ap.id
        WHERE ae.status IN ('OPEN', 'ACTIVE', 'TRIGGERED') 
        AND ap.project_id IN (SELECT project_id FROM get_user_projects($1))
      `, [userId]);
      criticalAlerts = parseInt(alertsResult.rows[0]?.count || 0);

      const piiResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as count FROM files f
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND f.project_id IN (SELECT project_id FROM get_user_projects($1))
      `, [userId]);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.id) as total_vendors,
        COUNT(DISTINCT va.id) FILTER (WHERE EXISTS (SELECT 1 FROM files f WHERE f.project_id = va.project_id AND f.created_at >= $1)) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active' 
        AND va.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f WHERE f.created_at >= $1 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
        AND (at.project_id IS NULL OR at.project_id IN (SELECT project_id FROM get_user_projects($2)))
      `, [rangeStart, userId]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) GROUP BY f.created_at::date),
        daily_files AS (SELECT f.created_at::date as date, COUNT(*) as file_count FROM files f WHERE f.created_at >= $1 AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) GROUP BY f.created_at::date)
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart, userId]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

    } else {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
        AND f.project_id = $2 AND f.project_id IN (SELECT project_id FROM get_user_projects($3))
      `, [rangeStart, projectId, userId]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL 
        AND f.project_id = $3 AND f.project_id IN (SELECT project_id FROM get_user_projects($4))
      `, [comparisonStart, rangeStart, projectId, userId]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`
        SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 
        AND f.project_id = $2 AND f.project_id IN (SELECT project_id FROM get_user_projects($3))
      `, [rangeStart, projectId, userId]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`
        SELECT COUNT(*) as count FROM files f WHERE f.created_at >= $1 AND f.created_at < $2 
        AND f.project_id = $3 AND f.project_id IN (SELECT project_id FROM get_user_projects($4))
      `, [comparisonStart, rangeStart, projectId, userId]);
      prevCount = parseInt(prevThroughput.rows[0]?.count || 0);

      const jobsResult = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) as total
        FROM transformation_jobs tj WHERE tj.created_at >= $1 
        AND tj.project_id = $2 AND tj.project_id IN (SELECT project_id FROM get_user_projects($3))
      `, [rangeStart, projectId, userId]);
      completedJobs = parseInt(jobsResult.rows[0]?.completed || 0);
      totalJobs = parseInt(jobsResult.rows[0]?.total || 0);

      const alertsResult = await pool.query(`
        SELECT COUNT(DISTINCT ae.id) as count FROM alert_events ae
        INNER JOIN alert_runs ar ON ae.run_id = ar.id
        INNER JOIN alert_policies ap ON ar.policy_id = ap.id
        WHERE ae.status IN ('OPEN', 'ACTIVE', 'TRIGGERED') 
        AND ap.project_id = $1 AND ap.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [projectId, userId]);
      criticalAlerts = parseInt(alertsResult.rows[0]?.count || 0);

      const piiResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as count FROM files f
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND f.project_id = $1 AND f.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [projectId, userId]);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.id) as total_vendors,
        COUNT(DISTINCT va.id) FILTER (WHERE EXISTS (SELECT 1 FROM files f WHERE f.project_id = va.project_id AND f.created_at >= $1)) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active' 
        AND va.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f WHERE f.created_at >= $1 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
        AND (at.project_id IS NULL OR at.project_id IN (SELECT project_id FROM get_user_projects($2)))
      `, [rangeStart, userId]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score FROM files f WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) GROUP BY f.created_at::date),
        daily_files AS (SELECT f.created_at::date as date, COUNT(*) as file_count FROM files f WHERE f.created_at >= $1 AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) GROUP BY f.created_at::date)
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart, userId]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);
    }

    const healthDelta = (healthIndex !== null && prevHealthIndex !== null) ? healthIndex - prevHealthIndex : 0;
    const throughputDelta = prevCount > 0 ? ((currentCount - prevCount) / prevCount * 100) : 0;
    const jobSuccessRate = totalJobs > 0 ? (completedJobs / totalJobs * 100) : 100;
    const vendorCompliance = totalVendors > 0 ? (compliantVendors / totalVendors * 100) : 100;
    const tagCoverage = totalFiles > 0 ? (taggedFiles / totalFiles * 100) : 0;

    res.json({
      success: true,
      timeRange: timeRange,
      metrics: {
        dataHealth: {
          index: healthIndex || 0,
          delta: parseFloat(healthDelta.toFixed(1)),
          trend: healthDelta >= 0 ? 'up' : 'down',
          status: healthIndex === null ? 'unknown' : healthIndex >= 90 ? 'excellent' : healthIndex >= 75 ? 'good' : healthIndex >= 60 ? 'warning' : 'critical',
          sparkline: healthSparkline,
          hasData: healthIndex !== null
        },
        fileThroughput: {
          count: currentCount,
          delta: parseFloat(throughputDelta.toFixed(1)),
          trend: throughputDelta >= 0 ? 'up' : 'down',
          previousPeriodCount: prevCount,
          sparkline: throughputSparkline
        },
        jobSuccessRate: {
          rate: parseFloat(jobSuccessRate.toFixed(1)),
          completedJobs: completedJobs,
          totalJobs: totalJobs,
          failedJobs: totalJobs - completedJobs,
          status: jobSuccessRate >= 95 ? 'excellent' : jobSuccessRate >= 80 ? 'good' : jobSuccessRate >= 60 ? 'warning' : 'critical'
        },
        criticalAlerts: {
          count: criticalAlerts,
          status: criticalAlerts === 0 ? 'excellent' : criticalAlerts <= 3 ? 'warning' : 'critical'
        },
        highRiskPII: {
          count: highRiskPII,
          status: highRiskPII === 0 ? 'excellent' : highRiskPII <= 5 ? 'warning' : 'critical'
        },
        vendorCompliance: {
          rate: parseFloat(vendorCompliance.toFixed(1)),
          compliantVendors: compliantVendors,
          totalVendors: totalVendors,
          status: vendorCompliance >= 90 ? 'excellent' : vendorCompliance >= 70 ? 'good' : vendorCompliance >= 50 ? 'warning' : 'critical'
        },
        governanceCoverage: {
          rate: parseFloat(tagCoverage.toFixed(1)),
          taggedFiles: taggedFiles,
          totalFiles: totalFiles,
          status: tagCoverage >= 80 ? 'excellent' : tagCoverage >= 60 ? 'good' : tagCoverage >= 40 ? 'warning' : 'critical'
        },
        apiUsage: {
          activeTokens: activeTokens,
          totalRequests: apiRequests,
          avgRequestsPerToken: activeTokens > 0 ? Math.round(apiRequests / activeTokens) : 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching executive metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch executive metrics',
      details: error.message
    });
  }
});

/**
 * GET /api/dashboard/project-health-scores
 * Calculate health scores for all accessible projects based on quality dimensions
 * Returns: Array of projects with health scores (0-100) calculated from quality metrics
 */
router.get('/project-health-scores', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes('Admin');

    let result;

    if (isAdmin) {
      result = await pool.query(`
        WITH project_quality AS (
          SELECT 
            p.id,
            p.name,
            p.project_type,
            COUNT(f.id) as total_files,
            AVG(f.quality_score) as avg_quality_score,
            COUNT(CASE WHEN f.quality_score >= 90 THEN 1 END) as excellent_files,
            COUNT(CASE WHEN f.quality_score < 70 THEN 1 END) as poor_files
          FROM projects p
          LEFT JOIN files f ON p.id = f.project_id
          GROUP BY p.id, p.name, p.project_type
        )
        SELECT 
          id,
          name,
          project_type,
          total_files,
          COALESCE(avg_quality_score, 0) as health_score,
          excellent_files,
          poor_files,
          CASE 
            WHEN COALESCE(avg_quality_score, 0) >= 90 THEN 'excellent'
            WHEN COALESCE(avg_quality_score, 0) >= 75 THEN 'good'
            WHEN COALESCE(avg_quality_score, 0) >= 60 THEN 'fair'
            ELSE 'poor'
          END as health_status
        FROM project_quality
        WHERE total_files > 0
        ORDER BY health_score DESC, name ASC
      `, []);
    } else {
      result = await pool.query(`
        WITH accessible_projects AS (
          SELECT project_id FROM get_user_projects($1)
        ),
        project_quality AS (
          SELECT 
            p.id,
            p.name,
            p.project_type,
            COUNT(f.id) as total_files,
            AVG(f.quality_score) as avg_quality_score,
            COUNT(CASE WHEN f.quality_score >= 90 THEN 1 END) as excellent_files,
            COUNT(CASE WHEN f.quality_score < 70 THEN 1 END) as poor_files
          FROM projects p
          INNER JOIN accessible_projects ap ON p.id = ap.project_id
          LEFT JOIN files f ON p.id = f.project_id
          GROUP BY p.id, p.name, p.project_type
        )
        SELECT 
          id,
          name,
          project_type,
          total_files,
          COALESCE(avg_quality_score, 0) as health_score,
          excellent_files,
          poor_files,
          CASE 
            WHEN COALESCE(avg_quality_score, 0) >= 90 THEN 'excellent'
            WHEN COALESCE(avg_quality_score, 0) >= 75 THEN 'good'
            WHEN COALESCE(avg_quality_score, 0) >= 60 THEN 'fair'
            ELSE 'poor'
          END as health_status
        FROM project_quality
        WHERE total_files > 0
        ORDER BY health_score DESC, name ASC
      `, [userId]);
    }

    const projectHealthScores = result.rows.map(row => ({
      projectId: row.id,
      projectName: row.name,
      projectType: row.project_type,
      healthScore: parseFloat(parseFloat(row.health_score || 0).toFixed(1)),
      healthStatus: row.health_status,
      totalFiles: parseInt(row.total_files),
      excellentFiles: parseInt(row.excellent_files),
      poorFiles: parseInt(row.poor_files)
    }));

    res.json({
      projects: projectHealthScores,
      totalProjects: projectHealthScores.length
    });

  } catch (error) {
    console.error('Error fetching project health scores:', error);
    res.status(500).json({
      error: 'Failed to fetch project health scores',
      details: error.message
    });
  }
});

/**
 * GET /api/dashboard/file-type-distribution
 * Get file type distribution across accessible projects
 * Supports optional project_id query parameter for filtering
 */
router.get('/file-type-distribution', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes('Admin');
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    let fileTypeQuery;
    let queryParams;

    if (isAdmin) {
      if (projectId) {
        fileTypeQuery = `
          SELECT 
            file_type,
            COUNT(*) as count,
            SUM(file_size::bigint) as total_size,
            AVG(quality_score) as avg_quality
          FROM files
          WHERE project_id = $1
          GROUP BY file_type
          ORDER BY count DESC
        `;
        queryParams = [projectId];
      } else {
        fileTypeQuery = `
          SELECT 
            file_type,
            COUNT(*) as count,
            SUM(file_size::bigint) as total_size,
            AVG(quality_score) as avg_quality
          FROM files
          GROUP BY file_type
          ORDER BY count DESC
        `;
        queryParams = [];
      }
    } else {
      if (projectId) {
        fileTypeQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            f.file_type,
            COUNT(*) as count,
            SUM(f.file_size::bigint) as total_size,
            AVG(f.quality_score) as avg_quality
          FROM files f
          INNER JOIN accessible_projects ap ON f.project_id = ap.project_id
          WHERE f.project_id = $2
          GROUP BY f.file_type
          ORDER BY count DESC
        `;
        queryParams = [userId, projectId];
      } else {
        fileTypeQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            f.file_type,
            COUNT(*) as count,
            SUM(f.file_size::bigint) as total_size,
            AVG(f.quality_score) as avg_quality
          FROM files f
          INNER JOIN accessible_projects ap ON f.project_id = ap.project_id
          GROUP BY f.file_type
          ORDER BY count DESC
        `;
        queryParams = [userId];
      }
    }

    const result = await pool.query(fileTypeQuery, queryParams);

    const totalFiles = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);

    const fileTypes = result.rows.map(row => ({
      fileType: row.file_type || 'unknown',
      count: parseInt(row.count),
      percentage: totalFiles > 0 ? parseFloat(((parseInt(row.count) / totalFiles) * 100).toFixed(1)) : 0,
      totalSize: parseInt(row.total_size || 0),
      avgQuality: parseFloat(parseFloat(row.avg_quality || 0).toFixed(1))
    }));

    res.json({
      fileTypes: fileTypes,
      totalFiles: totalFiles,
      projectId: projectId
    });

  } catch (error) {
    console.error('Error fetching file type distribution:', error);
    res.status(500).json({
      error: 'Failed to fetch file type distribution',
      details: error.message
    });
  }
});

module.exports = router;
