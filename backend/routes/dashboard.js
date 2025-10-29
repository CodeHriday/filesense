const express = require('express');
const router = express.Router();

/**
 * GET /api/dashboard/metrics
 * Get dashboard metrics for the current user
 */
router.get('/metrics', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const userId = req.user.id;
    const userRoles = req.user.roles || [];

    // Get user's accessible projects
    let projectsQuery;
    let projectsParams;

    // Check if user is admin
    const isAdmin = userRoles.includes('Admin');

    if (isAdmin) {
      // Admin sees all projects
      projectsQuery = 'SELECT COUNT(DISTINCT id) as count FROM projects';
      projectsParams = [];
    } else {
      // Non-admin: get projects through group membership
      projectsQuery = `
        SELECT COUNT(DISTINCT p.id) as count
        FROM projects p
        INNER JOIN group_projects gp ON p.id = gp.project_id
        INNER JOIN user_groups ug ON gp.group_id = ug.group_id
        WHERE ug.user_id = $1
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
      // Non-admin: get files from accessible projects
      filesQuery = `
        SELECT COUNT(DISTINCT f.id) as count
        FROM files f
        INNER JOIN group_projects gp ON f.project_id = gp.project_id
        INNER JOIN user_groups ug ON gp.group_id = ug.group_id
        WHERE ug.user_id = $1
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
      // Non-admin: get schedules from accessible projects
      schedulesQuery = `
        SELECT COUNT(DISTINCT s.id) as count
        FROM schedules s
        INNER JOIN group_projects gp ON s.project_id = gp.project_id
        INNER JOIN user_groups ug ON gp.group_id = ug.group_id
        WHERE ug.user_id = $1 AND s.is_active = true
      `;
      schedulesParams = [userId];
    }

    const schedulesResult = await pool.query(schedulesQuery, schedulesParams);
    const schedulesCount = parseInt(schedulesResult.rows[0]?.count || 0);

    // Get failed jobs count (from user's accessible projects)
    let failedJobsQuery;
    let failedJobsParams;

    if (isAdmin) {
      // Admin sees all failed jobs
      failedJobsQuery = `
        SELECT COUNT(DISTINCT id) as count 
        FROM transformation_jobs 
        WHERE status = 'failed'
      `;
      failedJobsParams = [];
    } else {
      // Non-admin: get failed jobs from accessible projects
      failedJobsQuery = `
        SELECT COUNT(DISTINCT tj.id) as count
        FROM transformation_jobs tj
        INNER JOIN group_projects gp ON tj.project_id = gp.project_id
        INNER JOIN user_groups ug ON gp.group_id = ug.group_id
        WHERE ug.user_id = $1 AND tj.status = 'failed'
      `;
      failedJobsParams = [userId];
    }

    const failedJobsResult = await pool.query(failedJobsQuery, failedJobsParams);
    const failedJobsCount = parseInt(failedJobsResult.rows[0]?.count || 0);

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
      // Non-admin: get anomalies from accessible files
      anomaliesQuery = `
        SELECT COUNT(DISTINCT a.id) as count
        FROM anomalies a
        INNER JOIN files f ON a.file_id = f.file_id
        INNER JOIN group_projects gp ON f.project_id = gp.project_id
        INNER JOIN user_groups ug ON gp.group_id = ug.group_id
        WHERE ug.user_id = $1 AND a.status = 'active'
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
        failedJobs: failedJobsCount,
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

module.exports = router;
