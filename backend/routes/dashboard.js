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
      // Non-admin: get projects through BOTH direct membership AND group membership
      projectsQuery = `
        SELECT COUNT(DISTINCT p.id) as count
        FROM projects p
        WHERE p.id IN (
          -- Direct project membership
          SELECT project_id FROM project_members WHERE user_id = $1
          UNION
          -- Group-based project membership
          SELECT pag.project_id 
          FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $1
        )
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
      // Non-admin: get files from accessible projects (both direct and group-based)
      filesQuery = `
        SELECT COUNT(DISTINCT f.id) as count
        FROM files f
        WHERE f.project_id IN (
          -- Direct project membership
          SELECT project_id FROM project_members WHERE user_id = $1
          UNION
          -- Group-based project membership
          SELECT pag.project_id 
          FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $1
        )
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
      // Non-admin: get schedules from accessible projects (both direct and group-based)
      schedulesQuery = `
        SELECT COUNT(DISTINCT s.id) as count
        FROM schedules s
        WHERE s.is_active = true AND s.project_id IN (
          -- Direct project membership
          SELECT project_id FROM project_members WHERE user_id = $1
          UNION
          -- Group-based project membership
          SELECT pag.project_id 
          FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $1
        )
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
      // Non-admin: get jobs from accessible projects (both direct and group-based)
      jobsQuery = `
        SELECT COUNT(DISTINCT tj.id) as count
        FROM transformation_jobs tj
        WHERE tj.project_id IN (
          -- Direct project membership
          SELECT project_id FROM project_members WHERE user_id = $1
          UNION
          -- Group-based project membership
          SELECT pag.project_id 
          FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $1
        )
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
      // Non-admin: get anomalies from accessible files (both direct and group-based project access)
      anomaliesQuery = `
        SELECT COUNT(DISTINCT a.id) as count
        FROM anomalies a
        INNER JOIN files f ON a.file_id = f.id
        WHERE a.status = 'active' AND f.project_id IN (
          -- Direct project membership
          SELECT project_id FROM project_members WHERE user_id = $1
          UNION
          -- Group-based project membership
          SELECT pag.project_id 
          FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE ug.user_id = $1
        )
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

module.exports = router;
