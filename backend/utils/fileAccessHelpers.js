/**
 * File Access Helper Functions
 * Validates user access to files based on project membership
 */

const pool = require('../db');
const { userHasAdminAccess } = require('./permissionHelpers');

/**
 * Validate user has access to a file's project
 * @param {string} fileId - File ID
 * @param {Object} user - Authenticated user object
 * @returns {Promise<number>} - File's project_id if access is granted
 * @throws {Error} - If access denied or file not found
 */
async function validateFileAccess(fileId, user) {
  const { getUserProjects } = require('../middleware/requireProjectAccess');
  
  // Get file's project_id
  const result = await pool.query(
    'SELECT project_id FROM files WHERE file_id = $1',
    [fileId]
  );
  
  if (result.rows.length === 0) {
    const error = new Error('File not found');
    error.status = 404;
    throw error;
  }
  
  const fileProjectId = result.rows[0].project_id;
  
  // Check access (admin-level access bypasses)
  const isAdmin = userHasAdminAccess(user);
  if (!isAdmin) {
    const userProjects = await getUserProjects(user.id);
    const projectIds = userProjects.map(p => p.id);
    
    if (!projectIds.includes(fileProjectId)) {
      const error = new Error('You do not have access to this file');
      error.status = 403;
      throw error;
    }
  }
  
  return fileProjectId;
}

/**
 * Validate user has access to multiple files' projects
 * @param {string[]} fileIds - Array of file IDs
 * @param {Object} user - Authenticated user object
 * @returns {Promise<boolean>} - True if all files accessible
 * @throws {Error} - If access denied to any file
 */
async function validateBulkFileAccess(fileIds, user) {
  const { getUserProjects } = require('../middleware/requireProjectAccess');
  
  // Get project_ids for all files
  const result = await pool.query(
    'SELECT file_id, project_id FROM files WHERE file_id = ANY($1)',
    [fileIds]
  );
  
  if (result.rows.length !== fileIds.length) {
    const error = new Error('One or more files not found');
    error.status = 404;
    throw error;
  }
  
  // Check access (admin-level access bypasses)
  const isAdmin = userHasAdminAccess(user);
  if (!isAdmin) {
    const userProjects = await getUserProjects(user.id);
    const projectIds = userProjects.map(p => p.id);
    
    // Check if all files belong to accessible projects
    const inaccessibleFiles = result.rows.filter(
      file => !projectIds.includes(file.project_id)
    );
    
    if (inaccessibleFiles.length > 0) {
      const error = new Error(
        `You do not have access to ${inaccessibleFiles.length} file(s)`
      );
      error.status = 403;
      throw error;
    }
  }
  
  return true;
}

module.exports = {
  validateFileAccess,
  validateBulkFileAccess
};
