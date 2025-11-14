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
    
    // Get time range from query params (default: 30 days)
    const timeRange = parseInt(req.query.days) || 30;
    const comparisonRange = timeRange; // Compare to previous period of same length
    
    const now = new Date();
    const rangeStart = new Date(now.getTime() - timeRange * 24 * 60 * 60 * 1000);
    const comparisonStart = new Date(rangeStart.getTime() - comparisonRange * 24 * 60 * 60 * 1000);

    // Build project filter for non-admin users
    const projectFilter = isAdmin 
      ? '' 
      : 'AND f.project_id IN (SELECT project_id FROM get_user_projects($1))';
    const projectParams = isAdmin ? [] : [userId];

    // ========== 1. DATA HEALTH INDEX ==========
    // Average quality score from files table
    const healthQuery = `
      SELECT 
        ROUND(AVG(COALESCE(quality_score, 0))::numeric, 1) as health_index,
        COUNT(*) as sample_size
      FROM files f
      WHERE f.created_at >= $${isAdmin ? '1' : '2'}
      AND f.quality_score IS NOT NULL
      ${projectFilter}
    `;
    const healthParams = isAdmin ? [rangeStart] : [userId, rangeStart];
    const healthResult = await pool.query(healthQuery, healthParams);
    const healthIndex = healthResult.rows[0]?.sample_size > 0 
      ? parseFloat(healthResult.rows[0]?.health_index || 0) 
      : null;

    // Get previous period for comparison
    const prevHealthResult = await pool.query(healthQuery.replace('>= $' + (isAdmin ? '1' : '2'), 
      `>= $${isAdmin ? '1' : '2'} AND f.created_at < $${isAdmin ? '2' : '3'}`), 
      isAdmin ? [comparisonStart, rangeStart] : [userId, comparisonStart, rangeStart]);
    const prevHealthIndex = prevHealthResult.rows[0]?.sample_size > 0
      ? parseFloat(prevHealthResult.rows[0]?.health_index || 0)
      : null;
    const healthDelta = (healthIndex !== null && prevHealthIndex !== null) 
      ? healthIndex - prevHealthIndex 
      : 0;

    // ========== 2. FILE THROUGHPUT ==========
    // Count of files uploaded in current period vs previous period
    const throughputQuery = `
      SELECT COUNT(*) as count
      FROM files f
      WHERE f.created_at >= $${isAdmin ? '1' : '2'}
      ${projectFilter}
    `;
    const currentThroughput = await pool.query(throughputQuery, isAdmin ? [rangeStart] : [userId, rangeStart]);
    const currentCount = parseInt(currentThroughput.rows[0]?.count || 0);

    const prevThroughputQuery = throughputQuery.replace('>= $' + (isAdmin ? '1' : '2'), 
      `>= $${isAdmin ? '1' : '2'} AND f.created_at < $${isAdmin ? '2' : '3'}`);
    const prevThroughput = await pool.query(prevThroughputQuery, 
      isAdmin ? [comparisonStart, rangeStart] : [userId, comparisonStart, rangeStart]);
    const prevCount = parseInt(prevThroughput.rows[0]?.count || 0);
    const throughputDelta = prevCount > 0 ? ((currentCount - prevCount) / prevCount * 100) : 0;

    // ========== 3. ETL JOB SUCCESS RATE ==========
    // Percentage of completed jobs vs total jobs
    const jobsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM transformation_jobs tj
      WHERE tj.created_at >= $${isAdmin ? '1' : '2'}
      ${isAdmin ? '' : 'AND tj.project_id IN (SELECT project_id FROM get_user_projects($1))'}
    `;
    const jobsResult = await pool.query(jobsQuery, isAdmin ? [rangeStart] : [rangeStart, userId]);
    const completedJobs = parseInt(jobsResult.rows[0]?.completed || 0);
    const totalJobs = parseInt(jobsResult.rows[0]?.total || 0);
    const jobSuccessRate = totalJobs > 0 ? (completedJobs / totalJobs * 100) : 100;

    // ========== 4. ACTIVE CRITICAL ALERTS ==========
    // Count of open/active alert events
    const alertsQuery = `
      SELECT COUNT(DISTINCT ae.id) as count
      FROM alert_events ae
      INNER JOIN alert_runs ar ON ae.run_id = ar.id
      INNER JOIN alert_policies ap ON ar.policy_id = ap.id
      WHERE ae.status IN ('OPEN', 'ACTIVE', 'TRIGGERED')
      ${isAdmin ? '' : 'AND ap.project_id IN (SELECT project_id FROM get_user_projects($1))'}
    `;
    const alertsResult = await pool.query(alertsQuery, isAdmin ? [] : [userId]);
    const criticalAlerts = parseInt(alertsResult.rows[0]?.count || 0);

    // ========== 5. HIGH-RISK PII EXPOSURE ==========
    // Files with PII/PHI classification AND quality issues
    const piiQuery = `
      SELECT COUNT(DISTINCT f.id) as count
      FROM files f
      WHERE f.contains_pii = true
      AND f.data_classification IN ('Confidential', 'PHI', 'PII')
      AND (
        f.quality_score < 90 
        OR EXISTS (
          SELECT 1 FROM quality_rule_violations qrv 
          WHERE qrv.file_id = f.file_id AND qrv.severity IN ('high', 'critical')
        )
      )
      ${projectFilter}
    `;
    const piiResult = await pool.query(piiQuery, projectParams);
    const highRiskPII = parseInt(piiResult.rows[0]?.count || 0);

    // ========== 6. VENDOR SLA COMPLIANCE ==========
    // Percentage of vendors meeting upload SLA (using current timeRange)
    const vendorQuery = `
      SELECT 
        COUNT(DISTINCT va.id) as total_vendors,
        COUNT(DISTINCT va.id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM files f 
            WHERE f.project_id = va.project_id 
            AND f.created_at >= $${isAdmin ? '1' : '2'}
          )
        ) as compliant_vendors
      FROM vendor_agreements va
      WHERE va.status = 'active'
      ${isAdmin ? '' : 'AND va.project_id IN (SELECT project_id FROM get_user_projects($1))'}
    `;
    const vendorResult = await pool.query(vendorQuery, isAdmin ? [rangeStart] : [userId, rangeStart]);
    const totalVendors = parseInt(vendorResult.rows[0]?.total_vendors || 0);
    const compliantVendors = parseInt(vendorResult.rows[0]?.compliant_vendors || 0);
    const vendorCompliance = totalVendors > 0 ? (compliantVendors / totalVendors * 100) : 100;

    // ========== 7. GOVERNANCE TAG COVERAGE ==========
    // Percentage of files with governance tags
    const govQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_files,
        COUNT(DISTINCT f.id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM column_governance_tag_assignments cgta 
            WHERE cgta.file_id = f.file_id 
            AND cgta.tag_id IS NOT NULL
          )
        ) as tagged_files
      FROM files f
      WHERE f.created_at >= $${isAdmin ? '1' : '2'}
      ${projectFilter}
    `;
    const govResult = await pool.query(govQuery, isAdmin ? [rangeStart] : [userId, rangeStart]);
    const totalFiles = parseInt(govResult.rows[0]?.total_files || 0);
    const taggedFiles = parseInt(govResult.rows[0]?.tagged_files || 0);
    const tagCoverage = totalFiles > 0 ? (taggedFiles / totalFiles * 100) : 0;

    // ========== 8. API USAGE ==========
    // Active API tokens and upload volume
    const apiQuery = `
      SELECT 
        COUNT(DISTINCT at.id) as active_tokens,
        COUNT(DISTINCT f.id) as total_requests
      FROM api_tokens at
      LEFT JOIN files f ON f.created_at >= $1
        AND f.metadata->>'upload_method' = 'api'
      WHERE at.is_active = true
      AND at.revoked_at IS NULL
      AND (at.expires_at IS NULL OR at.expires_at > NOW())
      ${isAdmin ? '' : 'AND (at.project_id IS NULL OR at.project_id IN (SELECT project_id FROM get_user_projects($2)))'}
    `;
    const apiResult = await pool.query(apiQuery, isAdmin ? [rangeStart] : [rangeStart, userId]);
    const activeTokens = parseInt(apiResult.rows[0]?.active_tokens || 0);
    const apiRequests = parseInt(apiResult.rows[0]?.total_requests || 0);

    // ========== SPARKLINE DATA (7-day daily breakdown) ==========
    // Generate sparklines for Data Health Index and File Throughput
    const sparklineQuery = `
      WITH date_series AS (
        SELECT generate_series(
          $${isAdmin ? '1' : '2'}::date,
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      ),
      daily_health AS (
        SELECT 
          f.created_at::date as date,
          ROUND(AVG(COALESCE(f.quality_score, 0))::numeric, 1) as health_score
        FROM files f
        WHERE f.created_at >= $${isAdmin ? '1' : '2'}
        AND f.quality_score IS NOT NULL
        ${projectFilter}
        GROUP BY f.created_at::date
      ),
      daily_files AS (
        SELECT 
          f.created_at::date as date,
          COUNT(*) as file_count
        FROM files f
        WHERE f.created_at >= $${isAdmin ? '1' : '2'}
        ${projectFilter}
        GROUP BY f.created_at::date
      )
      SELECT 
        ds.date,
        COALESCE(dh.health_score, 0) as health_score,
        COALESCE(df.file_count, 0) as file_count
      FROM date_series ds
      LEFT JOIN daily_health dh ON ds.date = dh.date
      LEFT JOIN daily_files df ON ds.date = df.date
      ORDER BY ds.date
    `;
    const sparklineStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sparklineResult = await pool.query(sparklineQuery, 
      isAdmin ? [sparklineStart] : [userId, sparklineStart]);
    
    const healthSparkline = sparklineResult.rows.map(r => parseFloat(r.health_score) || 0);
    const throughputSparkline = sparklineResult.rows.map(r => parseInt(r.file_count) || 0);

    // Log calculated values for debugging
    console.log('=== EXECUTIVE METRICS DEBUG ===');
    console.log('Time Range:', timeRange, 'days');
    console.log('Range Start:', rangeStart);
    console.log('User ID:', userId, 'Is Admin:', isAdmin);
    console.log('Data Health Index:', healthIndex);
    console.log('File Count (current):', currentCount);
    console.log('ETL Jobs (completed/total):', completedJobs, '/', totalJobs);
    console.log('Vendor Compliance:', vendorCompliance, '(', compliantVendors, '/', totalVendors, ')');
    console.log('================================');

    // Return all metrics with sparklines
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

module.exports = router;
