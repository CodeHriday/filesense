/**
 * Job Access Helper Functions
 * Validates user access to transformation jobs based on parent resource project membership
 */

const pool = require('../db');

/**
 * Validate user has access to a job's project via its parent transformation
 * @param {string} jobId - Job ID
 * @param {Object} user - Authenticated user object
 * @returns {Promise<number>} - Job's project_id if access is granted
 * @throws {Error} - If access denied or job not found
 */
async function validateJobAccess(jobId, user) {
  const { getUserProjects } = require('../middleware/requireProjectAccess');
  
  // Get job's project_id via transformation mapping
  const result = await pool.query(
    `SELECT tm.project_id 
     FROM transformation_jobs tj
     JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
     WHERE tj.job_id = $1`,
    [jobId]
  );
  
  if (result.rows.length === 0) {
    const error = new Error('Job not found');
    error.status = 404;
    throw error;
  }
  
  const jobProjectId = result.rows[0].project_id;
  
  // Check access (admins bypass)
  const isAdmin = user?.roles?.includes('Admin');
  if (!isAdmin) {
    const userProjects = await getUserProjects(user.id);
    const projectIds = userProjects.map(p => p.id);
    
    if (!projectIds.includes(jobProjectId)) {
      const error = new Error('You do not have access to this job');
      error.status = 403;
      throw error;
    }
  }
  
  return jobProjectId;
}

module.exports = {
  validateJobAccess
};
