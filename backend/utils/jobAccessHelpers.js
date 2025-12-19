/**
 * Job Access Helper Functions
 * Validates user access to transformation jobs based on parent resource project membership
 */

const pool = require('../db');
const { userHasAdminAccess } = require('./permissionHelpers');

/**
 * Validate user has access to a job's project via its parent transformation
 * @param {string} jobId - Job ID
 * @param {Object} user - Authenticated user object
 * @returns {Promise<number>} - Job's project_id if access is granted
 * @throws {Error} - If access denied or job not found
 */
async function validateJobAccess(jobId, user) {
  const { getUserProjects } = require('../middleware/requireProjectAccess');
  
  // First check if job exists
  const jobCheck = await pool.query(
    `SELECT tj.job_id, tj.mapping_id, tj.project_id as job_project_id
     FROM transformation_jobs tj
     WHERE tj.job_id = $1`,
    [jobId]
  );
  
  if (jobCheck.rows.length === 0) {
    const error = new Error('Job not found');
    error.status = 404;
    throw error;
  }
  
  const job = jobCheck.rows[0];
  
  // Try to get project_id from job directly first, then from mapping if available
  let jobProjectId = job.job_project_id;
  
  if (!jobProjectId && job.mapping_id) {
    const mappingResult = await pool.query(
      `SELECT project_id FROM transformation_mappings WHERE mapping_id = $1`,
      [job.mapping_id]
    );
    if (mappingResult.rows.length > 0) {
      jobProjectId = mappingResult.rows[0].project_id;
    }
  }
  
  // Check access (admin-level access bypasses)
  const isAdmin = userHasAdminAccess(user);
  if (!isAdmin && jobProjectId) {
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
