const express = require('express');
const router = express.Router();
const { createCacheMiddleware } = require('../src/middleware/cache');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

const dashboardCacheMiddleware = createCacheMiddleware({
  ttl: 120,
  keyGenerator: (req) => {
    const userId = req.user?.id || 'anonymous';
    const roles = req.user?.roles?.sort().join(':') || 'no-roles';
    const path = req.path || req.route?.path || 'unknown';
    const days = req.query?.days || '';
    const projectId = req.query?.project_id || 'all';
    const metric = req.query?.metric || 'all';
    const granularity = req.query?.granularity || 'daily';
    return `dashboard:${path}:user:${userId}:roles:${roles}:days:${days}:project:${projectId}:metric:${metric}:granularity:${granularity}`;
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
    const isAdmin = userHasAdminAccess(req.user);

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
    const isAdmin = userHasAdminAccess(req.user);
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
    
    let projectsCount = 0, schedulesCount = 0, mappingJobsCount = 0;
    let governanceTagsCount = 0, policiesCount = 0, lineageCount = 0;
    let vendorAgreementsCount = 0, internalUsersCount = 0, externalUsersCount = 0;
    let rolesCount = 0, externalConnectionsCount = 0, internalConnectionsCount = 0;
    let slaBreaches = 0, missingFiles = 0, lateFiles = 0;

    const platformMetricsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM projects) as projects_count,
        (SELECT COUNT(*) FROM schedules WHERE is_active = true) as schedules_count,
        (SELECT COUNT(DISTINCT id) FROM transformation_mappings) as mapping_jobs_count,
        (SELECT COUNT(*) FROM governance_tags) as governance_tags_count,
        (SELECT COUNT(*) FROM governance_policies) as policies_count,
        (SELECT COUNT(*) FROM transformation_lineage) as lineage_count,
        (SELECT COUNT(*) FROM vendors) as vendors_count,
        (SELECT COUNT(*) FROM vendor_agreements WHERE status = 'active') as vendor_agreements_count,
        (SELECT COUNT(*) FROM users WHERE vendor_id IS NULL) as internal_users_count,
        (SELECT COUNT(*) FROM users WHERE vendor_id IS NOT NULL) as external_users_count,
        (SELECT COUNT(*) FROM roles) as roles_count,
        (SELECT COUNT(*) FROM storage_connections WHERE (is_deleted = false OR is_deleted IS NULL)) as external_connections_count,
        (SELECT 0) as internal_connections_count
    `, []);
    projectsCount = parseInt(platformMetricsResult.rows[0]?.projects_count || 0);
    schedulesCount = parseInt(platformMetricsResult.rows[0]?.schedules_count || 0);
    mappingJobsCount = parseInt(platformMetricsResult.rows[0]?.mapping_jobs_count || 0);
    governanceTagsCount = parseInt(platformMetricsResult.rows[0]?.governance_tags_count || 0);
    policiesCount = parseInt(platformMetricsResult.rows[0]?.policies_count || 0);
    lineageCount = parseInt(platformMetricsResult.rows[0]?.lineage_count || 0);
    vendorAgreementsCount = parseInt(platformMetricsResult.rows[0]?.vendor_agreements_count || 0);
    internalUsersCount = parseInt(platformMetricsResult.rows[0]?.internal_users_count || 0);
    externalUsersCount = parseInt(platformMetricsResult.rows[0]?.external_users_count || 0);
    rolesCount = parseInt(platformMetricsResult.rows[0]?.roles_count || 0);
    externalConnectionsCount = parseInt(platformMetricsResult.rows[0]?.external_connections_count || 0);
    internalConnectionsCount = parseInt(platformMetricsResult.rows[0]?.internal_connections_count || 0);

    if (isAdmin && !projectId) {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [comparisonStart, rangeStart]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [comparisonStart, rangeStart]);
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
        SELECT COUNT(DISTINCT f.id) as count 
        FROM files f
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, []);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.vendor_id) as total_vendors,
        COUNT(DISTINCT va.vendor_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.project_id = va.project_id AND f.created_at >= $1 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
        )) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active'
      `, [rangeStart]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at 
        LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
        AND (f.id IS NULL OR fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (
          SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        ),
        daily_files AS (
          SELECT f.created_at::date as date, COUNT(*) as file_count 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        )
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

      const slaResult = await pool.query(`
        WITH sla_agreements AS (
          SELECT va.id, va.file_name, va.frequency, va.alert_threshold_minutes, va.project_id, va.created_at,
                 CASE 
                   WHEN va.frequency = 'daily' THEN INTERVAL '1 day'
                   WHEN va.frequency = 'weekly' THEN INTERVAL '7 days'
                   WHEN va.frequency = 'monthly' THEN INTERVAL '30 days'
                   WHEN va.frequency = 'quarterly' THEN INTERVAL '90 days'
                   ELSE INTERVAL '1 day'
                 END as expected_interval
          FROM vendor_agreements va
          WHERE va.sla_enabled = true AND va.status = 'active'
        ),
        latest_uploads AS (
          SELECT f.project_id, f.filename, MAX(f.created_at) as last_upload
          FROM files f
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE (fad.file_role IS NULL OR fad.file_role = 'source')
          GROUP BY f.project_id, f.filename
        ),
        sla_checks AS (
          SELECT 
            sa.id,
            sa.file_name,
            sa.expected_interval,
            sa.alert_threshold_minutes,
            lu.last_upload,
            CASE 
              WHEN lu.last_upload IS NULL THEN 'missing'
              WHEN lu.last_upload < (NOW() - sa.expected_interval - (sa.alert_threshold_minutes || ' minutes')::interval) THEN 'late'
              ELSE 'ok'
            END as sla_status
          FROM sla_agreements sa
          LEFT JOIN latest_uploads lu ON sa.project_id = lu.project_id 
            AND (lu.filename LIKE REPLACE(sa.file_name, '*', '%') OR lu.filename = sa.file_name)
        )
        SELECT 
          COUNT(*) FILTER (WHERE sla_status IN ('missing', 'late')) as total_breaches,
          COUNT(*) FILTER (WHERE sla_status = 'missing') as missing_count,
          COUNT(*) FILTER (WHERE sla_status = 'late') as late_count
        FROM sla_checks
      `, []);
      slaBreaches = parseInt(slaResult.rows[0]?.total_breaches || 0);
      missingFiles = parseInt(slaResult.rows[0]?.missing_count || 0);
      lateFiles = parseInt(slaResult.rows[0]?.late_count || 0);

    } else if (isAdmin && projectId) {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL AND f.project_id = $2 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, projectId]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL AND f.project_id = $3 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [comparisonStart, rangeStart, projectId]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.project_id = $2 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, projectId]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 AND f.project_id = $3 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [comparisonStart, rangeStart, projectId]);
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
        SELECT COUNT(DISTINCT f.id) as count 
        FROM files f
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND f.project_id = $1 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [projectId]);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.vendor_id) as total_vendors,
        COUNT(DISTINCT va.vendor_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.project_id = va.project_id AND f.created_at >= $1 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
        )) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active' AND va.project_id = $2
      `, [rangeStart, projectId]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.project_id = $2 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, projectId]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at 
        LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api' AND f.project_id = $2
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
        AND (f.id IS NULL OR fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, projectId]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (
          SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL AND f.project_id = $2 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        ),
        daily_files AS (
          SELECT f.created_at::date as date, COUNT(*) as file_count 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 AND f.project_id = $2 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        )
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart, projectId]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

    } else if (!isAdmin && !projectId) {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, userId]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($3)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [comparisonStart, rangeStart, userId]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, userId]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($3)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
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
        SELECT COUNT(DISTINCT f.id) as count 
        FROM files f
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND f.project_id IN (SELECT project_id FROM get_user_projects($1)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [userId]);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.vendor_id) as total_vendors,
        COUNT(DISTINCT va.vendor_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.project_id = va.project_id AND f.created_at >= $1 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
        )) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active' 
        AND va.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, userId]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at 
        LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
        AND (at.project_id IS NULL OR at.project_id IN (SELECT project_id FROM get_user_projects($2))) 
        AND (f.id IS NULL OR fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, userId]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (
          SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
          AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        ),
        daily_files AS (
          SELECT f.created_at::date as date, COUNT(*) as file_count 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 
          AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        )
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart, userId]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

    } else {
      const healthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
        AND f.project_id = $2 AND f.project_id IN (SELECT project_id FROM get_user_projects($3)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, projectId, userId]);
      healthIndex = healthResult.rows[0]?.sample_size > 0 ? parseFloat(healthResult.rows[0]?.health_index || 0) : null;

      const prevHealthResult = await pool.query(`
        SELECT ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index, COUNT(*) as sample_size
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 AND f.quality_score IS NOT NULL 
        AND f.project_id = $3 AND f.project_id IN (SELECT project_id FROM get_user_projects($4)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [comparisonStart, rangeStart, projectId, userId]);
      prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0 ? parseFloat(prevHealthResult.rows[0]?.health_index || 0) : null;

      const currentThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 
        AND f.project_id = $2 AND f.project_id IN (SELECT project_id FROM get_user_projects($3)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, projectId, userId]);
      currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

      const prevThroughput = await pool.query(`
        SELECT COUNT(*) as count 
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 AND f.created_at < $2 
        AND f.project_id = $3 AND f.project_id IN (SELECT project_id FROM get_user_projects($4)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
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
        SELECT COUNT(DISTINCT f.id) as count 
        FROM files f
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.contains_pii = true AND f.data_classification IN ('Confidential', 'PHI', 'PII')
        AND (f.quality_score < 90 OR EXISTS (SELECT 1 FROM quality_rule_violations qrv WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')))
        AND f.project_id = $1 AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [projectId, userId]);
      highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

      const vendorResult = await pool.query(`
        SELECT COUNT(DISTINCT va.vendor_id) as total_vendors,
        COUNT(DISTINCT va.vendor_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.project_id = va.project_id AND f.created_at >= $1 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
        )) as compliant_vendors
        FROM vendor_agreements va WHERE va.status = 'active' 
        AND va.project_id IN (SELECT project_id FROM get_user_projects($2))
      `, [rangeStart, userId]);
      totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
      compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);

      const govResult = await pool.query(`
        SELECT COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (WHERE EXISTS (SELECT 1 FROM column_governance_tag_assignments cgta WHERE cgta.file_id = f.file_id AND cgta.tag_id IS NOT NULL)) as tagged_files
        FROM files f 
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE f.created_at >= $1 
        AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
        AND (fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, userId]);
      totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
      taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);

      const apiResult = await pool.query(`
        SELECT COUNT(DISTINCT at.id) as active_tokens, COUNT(DISTINCT f.id) as total_requests
        FROM api_tokens at 
        LEFT JOIN files f ON f.created_at >= $1 AND f.metadata->>'upload_method' = 'api'
        LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
        WHERE at.is_active = true AND at.revoked_at IS NULL AND (at.expires_at IS NULL OR at.expires_at > NOW())
        AND (at.project_id IS NULL OR at.project_id IN (SELECT project_id FROM get_user_projects($2))) 
        AND (f.id IS NULL OR fad.file_role IS NULL OR fad.file_role != 'target')
      `, [rangeStart, userId]);
      activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
      apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

      const sparklineResult = await pool.query(`
        WITH date_series AS (SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date as date),
        daily_health AS (
          SELECT f.created_at::date as date, ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 AND f.quality_score IS NOT NULL 
          AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        ),
        daily_files AS (
          SELECT f.created_at::date as date, COUNT(*) as file_count 
          FROM files f 
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.created_at >= $1 
          AND f.project_id IN (SELECT project_id FROM get_user_projects($2)) 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.created_at::date
        )
        SELECT ds.date, COALESCE(dh.health_score, 0) as health_score, COALESCE(df.file_count, 0) as file_count
        FROM date_series ds LEFT JOIN daily_health dh ON ds.date = dh.date LEFT JOIN daily_files df ON ds.date = df.date ORDER BY ds.date
      `, [sparklineStart, userId]);
      healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
      throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);
    }

    const healthDelta = (healthIndex !== null && prevHealthIndex !== null) ? healthIndex - prevHealthIndex : 0;
    const throughputDelta = prevCount > 0 ? ((currentCount - prevCount) / prevCount * 100) : 0;
    const jobSuccessRate = totalJobs > 0 ? (completedJobs / totalJobs * 100) : 100;
    const vendorCompliance = Math.min(100, totalVendors > 0 ? (compliantVendors / totalVendors * 100) : 100);
    const tagCoverage = totalFiles > 0 ? (taggedFiles / totalFiles * 100) : 0;

    res.json({
      success: true,
      timeRange: timeRange,
      metrics: {
        totalFiles: currentCount,
        dataHealth: {
          index: healthIndex || 0,
          delta: parseFloat(healthDelta.toFixed(1)),
          trend: healthDelta >= 0 ? 'up' : 'down',
          status: healthIndex === null ? 'unknown' : healthIndex >= 90 ? 'excellent' : healthIndex >= 75 ? 'good' : healthIndex >= 60 ? 'warning' : 'critical',
          sparkline: healthSparkline,
          hasData: healthIndex !== null
        },
        dataHealthIndex: {
          value: healthIndex || 0,
          delta: parseFloat(healthDelta.toFixed(1)),
          status: healthIndex === null ? 'unknown' : healthIndex >= 90 ? 'excellent' : healthIndex >= 75 ? 'good' : healthIndex >= 60 ? 'warning' : 'critical'
        },
        fileThroughput: {
          count: currentCount,
          delta: parseFloat(throughputDelta.toFixed(1)),
          trend: throughputDelta >= 0 ? 'up' : 'down',
          previousPeriodCount: prevCount,
          sparkline: throughputSparkline
        },
        throughputTrend: {
          currentPeriodCount: currentCount,
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
        },
        slaBreaches: {
          count: slaBreaches,
          missingFiles: missingFiles,
          lateFiles: lateFiles,
          status: slaBreaches === 0 ? 'excellent' : slaBreaches <= 3 ? 'warning' : 'critical'
        },
        platformOverview: {
          projects: projectsCount,
          schedules: schedulesCount,
          mappingJobs: mappingJobsCount,
          governanceTags: governanceTagsCount,
          policies: policiesCount,
          lineageTrackedFiles: lineageCount,
          vendors: totalVendors,
          vendorAgreements: vendorAgreementsCount,
          internalUsers: internalUsersCount,
          externalUsers: externalUsersCount,
          roles: rolesCount,
          externalConnections: externalConnectionsCount,
          internalConnections: internalConnectionsCount,
          slaBreaches: slaBreaches
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
    const isAdmin = userHasAdminAccess(req.user);

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
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE (fad.file_role IS NULL OR fad.file_role != 'target')
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
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE (fad.file_role IS NULL OR fad.file_role != 'target')
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
    const isAdmin = userHasAdminAccess(req.user);
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    let fileTypeQuery;
    let queryParams;

    if (isAdmin && projectId) {
        fileTypeQuery = `
          SELECT 
            f.file_type,
            COUNT(*) as count,
            SUM(f.file_size::bigint) as total_size,
            AVG(f.quality_score) as avg_quality
          FROM files f
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.project_id = $1 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.file_type
          ORDER BY count DESC
        `;
        queryParams = [projectId];
      } else if(isAdmin && !projectId) {
        fileTypeQuery = `
          SELECT 
            f.file_type,
            COUNT(*) as count,
            SUM(f.file_size::bigint) as total_size,
            AVG(f.quality_score) as avg_quality
          FROM files f
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.file_type
          ORDER BY count DESC
        `;
        queryParams = [];
      } else if(!isAdmin && projectId) {
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
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE f.project_id = $2 
          AND (fad.file_role IS NULL OR fad.file_role != 'target')
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
          LEFT JOIN file_audit_details fad ON f.file_id = fad.file_id
          WHERE (fad.file_role IS NULL OR fad.file_role != 'target')
          GROUP BY f.file_type
          ORDER BY count DESC
        `;
        queryParams = [userId];
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

/**
 * GET /api/dashboard/job-trend
 * Get daily job execution trend (passed/failed) for last 30 days
 */
router.get('/job-trend', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userHasAdminAccess(req.user);
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    const validDays = Math.min(Math.max(days, 1), 365);

    let jobTrendQuery;
    let queryParams;

    if (isAdmin && projectId) {
        jobTrendQuery = `
          SELECT 
            DATE(start_time) as date,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as passed,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
          FROM transformation_jobs
          WHERE start_time >= CURRENT_DATE - INTERVAL '1 day' * $1
          AND project_id = $2
          GROUP BY DATE(start_time)
          ORDER BY DATE(start_time)
        `;
        queryParams = [validDays, projectId];
      } else if(isAdmin && !projectId) {
        jobTrendQuery = `
          SELECT 
            DATE(start_time) as date,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as passed,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
          FROM transformation_jobs
          WHERE start_time >= CURRENT_DATE - INTERVAL '1 day' * $1
          GROUP BY DATE(start_time)
          ORDER BY DATE(start_time)
        `;
        queryParams = [validDays];
    } else if(!isAdmin && projectId) {
        jobTrendQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            DATE(tj.start_time) as date,
            COUNT(CASE WHEN tj.status = 'completed' THEN 1 END) as passed,
            COUNT(CASE WHEN tj.status = 'failed' THEN 1 END) as failed
          FROM transformation_jobs tj
          INNER JOIN accessible_projects ap ON tj.project_id = ap.project_id
          WHERE tj.start_time >= CURRENT_DATE - INTERVAL '1 day' * $2
          AND tj.project_id = $3
          GROUP BY DATE(tj.start_time)
          ORDER BY DATE(tj.start_time)
        `;
        queryParams = [userId, validDays, projectId];
      } else {
        jobTrendQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            DATE(tj.start_time) as date,
            COUNT(CASE WHEN tj.status = 'completed' THEN 1 END) as passed,
            COUNT(CASE WHEN tj.status = 'failed' THEN 1 END) as failed
          FROM transformation_jobs tj
          INNER JOIN accessible_projects ap ON tj.project_id = ap.project_id
          WHERE tj.start_time >= CURRENT_DATE - INTERVAL '1 day' * $2
          GROUP BY DATE(tj.start_time)
          ORDER BY DATE(tj.start_time)
        `;
        queryParams = [userId, validDays];
      }

    const result = await pool.query(jobTrendQuery, queryParams);

    const jobTrend = result.rows.map(row => ({
      date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
      passed: parseInt(row.passed || 0),
      failed: parseInt(row.failed || 0)
    }));

    res.json({
      jobTrend: jobTrend,
      projectId: projectId
    });

  } catch (error) {
    console.error('Error fetching job trend:', error);
    res.status(500).json({
      error: 'Failed to fetch job trend',
      details: error.message
    });
  }
});

/**
 * GET /api/dashboard/schema-drift-trend
 * Get daily schema drift detection trend for last 30 days
 */
router.get('/schema-drift-trend', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userHasAdminAccess(req.user);
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    let driftTrendQuery;
    let queryParams;

    if (isAdmin && projectId) {
        driftTrendQuery = `
          SELECT 
            DATE(a.detected_at) as date,
            COUNT(*) as drift_count
          FROM anomalies a
          INNER JOIN files f ON a.file_id = f.file_id
          WHERE a.detected_at >= CURRENT_DATE - INTERVAL '30 days'
          AND a.anomaly_type = 'schema_drift'
          AND f.project_id = $1
          GROUP BY DATE(a.detected_at)
          ORDER BY DATE(a.detected_at)
        `;
        queryParams = [projectId];
      } else if(isAdmin && !projectId) {
        driftTrendQuery = `
          SELECT 
            DATE(detected_at) as date,
            COUNT(*) as drift_count
          FROM anomalies
          WHERE detected_at >= CURRENT_DATE - INTERVAL '30 days'
          AND anomaly_type = 'schema_drift'
          GROUP BY DATE(detected_at)
          ORDER BY DATE(detected_at)
        `;
        queryParams = [];
    } else if(!isAdmin && projectId) {
        driftTrendQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            DATE(a.detected_at) as date,
            COUNT(*) as drift_count
          FROM anomalies a
          INNER JOIN files f ON a.file_id = f.file_id
          INNER JOIN accessible_projects ap ON f.project_id = ap.project_id
          WHERE a.detected_at >= CURRENT_DATE - INTERVAL '30 days'
          AND a.anomaly_type = 'schema_drift'
          AND f.project_id = $2
          GROUP BY DATE(a.detected_at)
          ORDER BY DATE(a.detected_at)
        `;
        queryParams = [userId, projectId];
      } else {
        driftTrendQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            DATE(a.detected_at) as date,
            COUNT(*) as drift_count
          FROM anomalies a
          INNER JOIN files f ON a.file_id = f.file_id
          INNER JOIN accessible_projects ap ON f.project_id = ap.project_id
          WHERE a.detected_at >= CURRENT_DATE - INTERVAL '30 days'
          AND a.anomaly_type = 'schema_drift'
          GROUP BY DATE(a.detected_at)
          ORDER BY DATE(a.detected_at)
        `;
        queryParams = [userId];
    }

    const result = await pool.query(driftTrendQuery, queryParams);

    const driftTrend = result.rows.map(row => ({
      date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
      count: parseInt(row.drift_count || 0)
    }));

    res.json({
      driftTrend: driftTrend,
      projectId: projectId
    });

  } catch (error) {
    console.error('Error fetching schema drift trend:', error);
    res.status(500).json({
      error: 'Failed to fetch schema drift trend',
      details: error.message
    });
  }
});

/**
 * GET /api/dashboard/quality-violations-trend
 * Get daily quality violation counts grouped by quality dimension for last 30 days
 */
router.get('/quality-violations-trend', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userHasAdminAccess(req.user);
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;

    let violationsTrendQuery;
    let queryParams;

    if (isAdmin && projectId) {
        violationsTrendQuery = `
          SELECT 
            DATE(qrv.created_at) as date,
            qr.rule_type as dimension,
            COUNT(*) as violation_count
          FROM quality_rule_violations qrv
          INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
          INNER JOIN files f ON qrv.file_id = f.file_id
          WHERE qrv.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND f.project_id = $1
          AND qr.rule_type IN ('completeness', 'uniqueness', 'validity', 'consistency', 'accuracy')
          GROUP BY DATE(qrv.created_at), qr.rule_type
          ORDER BY DATE(qrv.created_at), qr.rule_type
        `;
        queryParams = [projectId];
      } else if(isAdmin && !projectId) {
        violationsTrendQuery = `
          SELECT 
            DATE(qrv.created_at) as date,
            qr.rule_type as dimension,
            COUNT(*) as violation_count
          FROM quality_rule_violations qrv
          INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
          WHERE qrv.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND qr.rule_type IN ('completeness', 'uniqueness', 'validity', 'consistency', 'accuracy')
          GROUP BY DATE(qrv.created_at), qr.rule_type
          ORDER BY DATE(qrv.created_at), qr.rule_type
        `;
        queryParams = [];
    } else if(!isAdmin && projectId) {
        violationsTrendQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            DATE(qrv.created_at) as date,
            qr.rule_type as dimension,
            COUNT(*) as violation_count
          FROM quality_rule_violations qrv
          INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
          INNER JOIN files f ON qrv.file_id = f.file_id
          INNER JOIN accessible_projects ap ON f.project_id = ap.project_id
          WHERE qrv.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND f.project_id = $2
          AND qr.rule_type IN ('completeness', 'uniqueness', 'validity', 'consistency', 'accuracy')
          GROUP BY DATE(qrv.created_at), qr.rule_type
          ORDER BY DATE(qrv.created_at), qr.rule_type
        `;
        queryParams = [userId, projectId];
      } else {
        violationsTrendQuery = `
          WITH accessible_projects AS (
            SELECT project_id FROM get_user_projects($1)
          )
          SELECT 
            DATE(qrv.created_at) as date,
            qr.rule_type as dimension,
            COUNT(*) as violation_count
          FROM quality_rule_violations qrv
          INNER JOIN quality_rules qr ON qrv.rule_id = qr.id
          INNER JOIN files f ON qrv.file_id = f.file_id
          INNER JOIN accessible_projects ap ON f.project_id = ap.project_id
          WHERE qrv.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND qr.rule_type IN ('completeness', 'uniqueness', 'validity', 'consistency', 'accuracy')
          GROUP BY DATE(qrv.created_at), qr.rule_type
          ORDER BY DATE(qrv.created_at), qr.rule_type
        `;
        queryParams = [userId];
    }

    const result = await pool.query(violationsTrendQuery, queryParams);

    // Transform rows into structured format
    const violationsTrend = result.rows.map(row => ({
      date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
      dimension: row.dimension,
      count: parseInt(row.violation_count || 0)
    }));

    res.json({
      violationsTrend: violationsTrend,
      projectId: projectId
    });

  } catch (error) {
    console.error('Error fetching quality violations trend:', error);
    res.status(500).json({
      error: 'Failed to fetch quality violations trend',
      details: error.message
    });
  }
});

/**
 * GET /api/dashboard/metric-trends
 * Get historical trend data for headline metrics (15-day daily + aggregated weekly/monthly for last 16 instances)
 * Supports: dataHealth, totalFiles, vendorCompliance, governanceCoverage, criticalAlerts, jobSuccess
 */
router.get('/metric-trends', dashboardCacheMiddleware, async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const userId = parseInt(req.user.id, 10);
    const userRoles = req.user.roles || [];
    const isAdmin = userHasAdminAccess(req.user);
    const metricType = req.query.metric || 'all';
    const granularity = req.query.granularity || 'daily';
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    
    const trends = {};

    // Total Files Trend - files uploaded per day
    if (metricType === 'all' || metricType === 'totalFiles') {
      let filesQuery;
      let queryParams = [];
      
      if (granularity === 'daily') {
        if (isAdmin && !projectId) {
          filesQuery = `
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM files
            WHERE created_at >= CURRENT_DATE - INTERVAL '15 days'
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
          `;
        } else if (isAdmin && projectId) {
          filesQuery = `
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM files
            WHERE created_at >= CURRENT_DATE - INTERVAL '15 days'
            AND project_id = $1
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
          `;
          queryParams = [projectId];
        } else {
          filesQuery = `
            SELECT DATE(f.created_at) as date, COUNT(*) as count
            FROM files f
            WHERE f.created_at >= CURRENT_DATE - INTERVAL '15 days'
            AND f.project_id IN (SELECT project_id FROM get_user_projects($1))
            ${projectId ? 'AND f.project_id = $2' : ''}
            GROUP BY DATE(f.created_at)
            ORDER BY DATE(f.created_at)
          `;
          queryParams = projectId ? [userId, projectId] : [userId];
        }
      } else if (granularity === 'weekly') {
        if (isAdmin && !projectId) {
          filesQuery = `
            SELECT DATE_TRUNC('week', created_at)::date as date, COUNT(*) as count
            FROM files
            WHERE created_at >= CURRENT_DATE - INTERVAL '16 weeks'
            GROUP BY DATE_TRUNC('week', created_at)
            ORDER BY DATE_TRUNC('week', created_at)
            LIMIT 16
          `;
        } else {
          filesQuery = `
            SELECT DATE_TRUNC('week', f.created_at)::date as date, COUNT(*) as count
            FROM files f
            WHERE f.created_at >= CURRENT_DATE - INTERVAL '16 weeks'
            ${isAdmin ? '' : 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))'}
            ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
            GROUP BY DATE_TRUNC('week', f.created_at)
            ORDER BY DATE_TRUNC('week', f.created_at)
            LIMIT 16
          `;
          queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
        }
      } else if (granularity === 'monthly') {
        if (isAdmin && !projectId) {
          filesQuery = `
            SELECT DATE_TRUNC('month', created_at)::date as date, COUNT(*) as count
            FROM files
            WHERE created_at >= CURRENT_DATE - INTERVAL '16 months'
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at)
            LIMIT 16
          `;
        } else {
          filesQuery = `
            SELECT DATE_TRUNC('month', f.created_at)::date as date, COUNT(*) as count
            FROM files f
            WHERE f.created_at >= CURRENT_DATE - INTERVAL '16 months'
            ${isAdmin ? '' : 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))'}
            ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
            GROUP BY DATE_TRUNC('month', f.created_at)
            ORDER BY DATE_TRUNC('month', f.created_at)
            LIMIT 16
          `;
          queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
        }
      }
      
      const filesResult = await pool.query(filesQuery, queryParams);
      trends.totalFiles = filesResult.rows.map(row => ({
        date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
        value: parseInt(row.count || 0)
      }));
    }

    // Data Health Trend - average quality score per day from profiling_metrics
    if (metricType === 'all' || metricType === 'dataHealth') {
      let healthQuery;
      let queryParams = [];
      
      if (granularity === 'daily') {
        if (isAdmin && !projectId) {
          healthQuery = `
            SELECT DATE(pm.profiled_at) as date, 
                   ROUND(AVG(COALESCE(pm.completeness_score, 0) + COALESCE(pm.validity_score, 0)) / 2, 1) as avg_health
            FROM profiling_metrics pm
            WHERE pm.profiled_at >= CURRENT_DATE - INTERVAL '15 days'
            GROUP BY DATE(pm.profiled_at)
            ORDER BY DATE(pm.profiled_at)
          `;
        } else if (isAdmin && projectId) {
          healthQuery = `
            SELECT DATE(pm.profiled_at) as date, 
                   ROUND(AVG(COALESCE(pm.completeness_score, 0) + COALESCE(pm.validity_score, 0)) / 2, 1) as avg_health
            FROM profiling_metrics pm
            INNER JOIN files f ON pm.file_id = f.file_id
            WHERE pm.profiled_at >= CURRENT_DATE - INTERVAL '15 days'
            AND f.project_id = $1
            GROUP BY DATE(pm.profiled_at)
            ORDER BY DATE(pm.profiled_at)
          `;
          queryParams = [projectId];
        } else {
          healthQuery = `
            SELECT DATE(pm.profiled_at) as date, 
                   ROUND(AVG(COALESCE(pm.completeness_score, 0) + COALESCE(pm.validity_score, 0)) / 2, 1) as avg_health
            FROM profiling_metrics pm
            INNER JOIN files f ON pm.file_id = f.file_id
            WHERE pm.profiled_at >= CURRENT_DATE - INTERVAL '15 days'
            AND f.project_id IN (SELECT project_id FROM get_user_projects($1))
            ${projectId ? 'AND f.project_id = $2' : ''}
            GROUP BY DATE(pm.profiled_at)
            ORDER BY DATE(pm.profiled_at)
          `;
          queryParams = projectId ? [userId, projectId] : [userId];
        }
      } else if (granularity === 'weekly') {
        healthQuery = `
          SELECT DATE_TRUNC('week', pm.profiled_at)::date as date,
                 ROUND(AVG(COALESCE(pm.completeness_score, 0) + COALESCE(pm.validity_score, 0)) / 2, 1) as avg_health
          FROM profiling_metrics pm
          ${(!isAdmin || projectId) ? 'INNER JOIN files f ON pm.file_id = f.file_id' : ''}
          WHERE pm.profiled_at >= CURRENT_DATE - INTERVAL '16 weeks'
          ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('week', pm.profiled_at)
          ORDER BY DATE_TRUNC('week', pm.profiled_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      } else if (granularity === 'monthly') {
        healthQuery = `
          SELECT DATE_TRUNC('month', pm.profiled_at)::date as date,
                 ROUND(AVG(COALESCE(pm.completeness_score, 0) + COALESCE(pm.validity_score, 0)) / 2, 1) as avg_health
          FROM profiling_metrics pm
          ${(!isAdmin || projectId) ? 'INNER JOIN files f ON pm.file_id = f.file_id' : ''}
          WHERE pm.profiled_at >= CURRENT_DATE - INTERVAL '16 months'
          ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('month', pm.profiled_at)
          ORDER BY DATE_TRUNC('month', pm.profiled_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      }
      
      const healthResult = await pool.query(healthQuery, queryParams);
      trends.dataHealth = healthResult.rows.map(row => ({
        date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
        value: parseFloat(row.avg_health || 0)
      }));
    }

    // Job Success Rate Trend
    if (metricType === 'all' || metricType === 'jobSuccess') {
      let jobQuery;
      let queryParams = [];
      
      if (granularity === 'daily') {
        if (isAdmin && !projectId) {
          jobQuery = `
            SELECT DATE(created_at) as date,
                   COUNT(*) FILTER (WHERE status = 'completed') as completed,
                   COUNT(*) as total
            FROM transformation_jobs
            WHERE created_at >= CURRENT_DATE - INTERVAL '15 days'
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
          `;
        } else {
          jobQuery = `
            SELECT DATE(tj.created_at) as date,
                   COUNT(*) FILTER (WHERE tj.status = 'completed') as completed,
                   COUNT(*) as total
            FROM transformation_jobs tj
            WHERE tj.created_at >= CURRENT_DATE - INTERVAL '15 days'
            ${!isAdmin ? 'AND tj.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
            ${projectId ? `AND tj.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
            GROUP BY DATE(tj.created_at)
            ORDER BY DATE(tj.created_at)
          `;
          queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
        }
      } else if (granularity === 'weekly') {
        jobQuery = `
          SELECT DATE_TRUNC('week', tj.created_at)::date as date,
                 COUNT(*) FILTER (WHERE tj.status = 'completed') as completed,
                 COUNT(*) as total
          FROM transformation_jobs tj
          WHERE tj.created_at >= CURRENT_DATE - INTERVAL '16 weeks'
          ${!isAdmin ? 'AND tj.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND tj.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('week', tj.created_at)
          ORDER BY DATE_TRUNC('week', tj.created_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      } else if (granularity === 'monthly') {
        jobQuery = `
          SELECT DATE_TRUNC('month', tj.created_at)::date as date,
                 COUNT(*) FILTER (WHERE tj.status = 'completed') as completed,
                 COUNT(*) as total
          FROM transformation_jobs tj
          WHERE tj.created_at >= CURRENT_DATE - INTERVAL '16 months'
          ${!isAdmin ? 'AND tj.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND tj.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('month', tj.created_at)
          ORDER BY DATE_TRUNC('month', tj.created_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      }
      
      const jobResult = await pool.query(jobQuery, queryParams);
      trends.jobSuccess = jobResult.rows.map(row => ({
        date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
        value: row.total > 0 ? Math.round((parseInt(row.completed || 0) / parseInt(row.total)) * 100) : 0,
        completed: parseInt(row.completed || 0),
        total: parseInt(row.total || 0)
      }));
    }

    // Critical Alerts Trend
    if (metricType === 'all' || metricType === 'criticalAlerts') {
      let alertQuery;
      let queryParams = [];
      
      if (granularity === 'daily') {
        if (isAdmin && !projectId) {
          alertQuery = `
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM anomalies
            WHERE created_at >= CURRENT_DATE - INTERVAL '15 days'
            AND severity IN ('critical', 'high')
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
          `;
        } else {
          alertQuery = `
            SELECT DATE(a.created_at) as date, COUNT(*) as count
            FROM anomalies a
            INNER JOIN files f ON a.file_id = f.file_id
            WHERE a.created_at >= CURRENT_DATE - INTERVAL '15 days'
            AND a.severity IN ('critical', 'high')
            ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
            ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
            GROUP BY DATE(a.created_at)
            ORDER BY DATE(a.created_at)
          `;
          queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
        }
      } else if (granularity === 'weekly') {
        alertQuery = `
          SELECT DATE_TRUNC('week', a.created_at)::date as date, COUNT(*) as count
          FROM anomalies a
          ${(!isAdmin || projectId) ? 'INNER JOIN files f ON a.file_id = f.file_id' : ''}
          WHERE a.created_at >= CURRENT_DATE - INTERVAL '16 weeks'
          AND a.severity IN ('critical', 'high')
          ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('week', a.created_at)
          ORDER BY DATE_TRUNC('week', a.created_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      } else if (granularity === 'monthly') {
        alertQuery = `
          SELECT DATE_TRUNC('month', a.created_at)::date as date, COUNT(*) as count
          FROM anomalies a
          ${(!isAdmin || projectId) ? 'INNER JOIN files f ON a.file_id = f.file_id' : ''}
          WHERE a.created_at >= CURRENT_DATE - INTERVAL '16 months'
          AND a.severity IN ('critical', 'high')
          ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('month', a.created_at)
          ORDER BY DATE_TRUNC('month', a.created_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      }
      
      const alertResult = await pool.query(alertQuery, queryParams);
      trends.criticalAlerts = alertResult.rows.map(row => ({
        date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
        value: parseInt(row.count || 0)
      }));
    }

    // Governance Coverage Trend - using column_governance_tag_assignments with assigned_at
    if (metricType === 'all' || metricType === 'governanceCoverage') {
      let govQuery;
      let queryParams = [];
      
      if (granularity === 'daily') {
        if (isAdmin && !projectId) {
          govQuery = `
            WITH daily_tags AS (
              SELECT DATE(cgta.assigned_at) as date,
                     COUNT(DISTINCT cgta.file_id) as tagged_files
              FROM column_governance_tag_assignments cgta
              WHERE cgta.assigned_at >= CURRENT_DATE - INTERVAL '15 days'
              GROUP BY DATE(cgta.assigned_at)
            )
            SELECT date, tagged_files
            FROM daily_tags
            ORDER BY date
          `;
        } else {
          govQuery = `
            SELECT DATE(cgta.assigned_at) as date,
                   COUNT(DISTINCT cgta.file_id) as tagged_files
            FROM column_governance_tag_assignments cgta
            INNER JOIN files f ON cgta.file_id = f.file_id
            WHERE cgta.assigned_at >= CURRENT_DATE - INTERVAL '15 days'
            ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
            ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
            GROUP BY DATE(cgta.assigned_at)
            ORDER BY DATE(cgta.assigned_at)
          `;
          queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
        }
      } else if (granularity === 'weekly') {
        govQuery = `
          SELECT DATE_TRUNC('week', cgta.assigned_at)::date as date,
                 COUNT(DISTINCT cgta.file_id) as tagged_files
          FROM column_governance_tag_assignments cgta
          ${(!isAdmin || projectId) ? 'INNER JOIN files f ON cgta.file_id = f.file_id' : ''}
          WHERE cgta.assigned_at >= CURRENT_DATE - INTERVAL '16 weeks'
          ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('week', cgta.assigned_at)
          ORDER BY DATE_TRUNC('week', cgta.assigned_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      } else if (granularity === 'monthly') {
        govQuery = `
          SELECT DATE_TRUNC('month', cgta.assigned_at)::date as date,
                 COUNT(DISTINCT cgta.file_id) as tagged_files
          FROM column_governance_tag_assignments cgta
          ${(!isAdmin || projectId) ? 'INNER JOIN files f ON cgta.file_id = f.file_id' : ''}
          WHERE cgta.assigned_at >= CURRENT_DATE - INTERVAL '16 months'
          ${!isAdmin ? 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))' : ''}
          ${projectId ? `AND f.project_id = ${isAdmin ? '$1' : '$2'}` : ''}
          GROUP BY DATE_TRUNC('month', cgta.assigned_at)
          ORDER BY DATE_TRUNC('month', cgta.assigned_at)
          LIMIT 16
        `;
        queryParams = isAdmin ? (projectId ? [projectId] : []) : (projectId ? [userId, projectId] : [userId]);
      }
      
      const govResult = await pool.query(govQuery, queryParams);
      trends.governanceCoverage = govResult.rows.map(row => ({
        date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
        value: parseInt(row.tagged_files || 0)
      }));
    }

    // Vendor Compliance Trend
    if (metricType === 'all' || metricType === 'vendorCompliance') {
      let vendorQuery;
      
      if (granularity === 'daily') {
        vendorQuery = `
          SELECT DATE(created_at) as date,
                 COUNT(*) FILTER (WHERE status = 'active') as compliant,
                 COUNT(*) as total
          FROM vendor_agreements
          WHERE created_at >= CURRENT_DATE - INTERVAL '15 days'
          GROUP BY DATE(created_at)
          ORDER BY DATE(created_at)
        `;
      } else if (granularity === 'weekly') {
        vendorQuery = `
          SELECT DATE_TRUNC('week', created_at)::date as date,
                 COUNT(*) FILTER (WHERE status = 'active') as compliant,
                 COUNT(*) as total
          FROM vendor_agreements
          WHERE created_at >= CURRENT_DATE - INTERVAL '16 weeks'
          GROUP BY DATE_TRUNC('week', created_at)
          ORDER BY DATE_TRUNC('week', created_at)
          LIMIT 16
        `;
      } else if (granularity === 'monthly') {
        vendorQuery = `
          SELECT DATE_TRUNC('month', created_at)::date as date,
                 COUNT(*) FILTER (WHERE status = 'active') as compliant,
                 COUNT(*) as total
          FROM vendor_agreements
          WHERE created_at >= CURRENT_DATE - INTERVAL '16 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY DATE_TRUNC('month', created_at)
          LIMIT 16
        `;
      }
      
      const vendorResult = await pool.query(vendorQuery);
      trends.vendorCompliance = vendorResult.rows.map(row => ({
        date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
        value: row.total > 0 ? Math.round((parseInt(row.compliant || 0) / parseInt(row.total)) * 100) : 100,
        compliant: parseInt(row.compliant || 0),
        total: parseInt(row.total || 0)
      }));
    }

    res.json({
      success: true,
      trends,
      granularity,
      metricType,
      projectId
    });

  } catch (error) {
    console.error('Error fetching metric trends:', error);
    res.status(500).json({
      error: 'Failed to fetch metric trends',
      details: error.message
    });
  }
});

module.exports = router;
