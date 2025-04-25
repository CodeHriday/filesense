/**
 * Asynchronous Transformation Service
 * 
 * This service handles data transformations using worker threads for improved performance.
 * It integrates with the asyncProcessor module to run transformations in the background.
 */

const { executeTransformation, getTaskStatus } = require('../utils/asyncProcessor');
const { transformLogger } = require('../utils/logger');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Create and start a new transformation
 * 
 * @param {Object} transformationConfig - Configuration for the transformation
 * @param {number} userId - ID of the user creating the transformation
 * @returns {Object} - Task information
 */
async function createTransformation(transformationConfig, userId) {
  try {
    // Log the start of transformation creation
    transformLogger.info('Creating new transformation', { 
      userId, 
      name: transformationConfig.name,
      sourceFileId: transformationConfig.source_file_id
    });
    
    // Insert transformation record into database
    const result = await db.query(
      `INSERT INTO transformations 
      (name, description, config, created_by, status) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *`,
      [
        transformationConfig.name,
        transformationConfig.description,
        JSON.stringify(transformationConfig),
        userId,
        'pending'
      ]
    );
    
    const transformation = result.rows[0];
    transformLogger.info('Transformation created in database', { transformationId: transformation.id });
    
    // Start async execution
    const task = await executeTransformation({
      ...transformationConfig,
      transformationId: transformation.id
    });
    
    // Update the transformation with task ID
    await db.query(
      'UPDATE transformations SET task_id = $1, status = $2 WHERE id = $3',
      [task.id, 'running', transformation.id]
    );
    
    // Set up event listeners for task updates
    task.on('progress', async (progress) => {
      await db.query(
        'UPDATE transformations SET progress = $1 WHERE id = $2',
        [progress, transformation.id]
      );
      
      transformLogger.debug('Transformation progress updated', { 
        transformationId: transformation.id, 
        progress 
      });
    });
    
    task.on('completed', async (result) => {
      await db.query(
        'UPDATE transformations SET status = $1, result = $2, updated_at = NOW() WHERE id = $3',
        ['completed', JSON.stringify(result), transformation.id]
      );
      
      transformLogger.info('Transformation completed successfully', { 
        transformationId: transformation.id,
        rowsProcessed: result.rowsProcessed
      });
    });
    
    task.on('error', async (error) => {
      await db.query(
        'UPDATE transformations SET status = $1, error = $2, updated_at = NOW() WHERE id = $3',
        ['failed', error.message, transformation.id]
      );
      
      transformLogger.error('Transformation failed', { 
        transformationId: transformation.id,
        error: error.message
      });
    });
    
    return {
      transformationId: transformation.id,
      taskId: task.id,
      status: 'running'
    };
  } catch (error) {
    transformLogger.error('Error creating transformation', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get transformation status
 * 
 * @param {number} transformationId - Transformation ID
 * @returns {Object} - Transformation status
 */
async function getTransformationStatus(transformationId) {
  try {
    // Get transformation from database
    const result = await db.query(
      'SELECT * FROM transformations WHERE id = $1',
      [transformationId]
    );
    
    if (result.rows.length === 0) {
      transformLogger.warn('Transformation not found', { transformationId });
      throw new Error(`Transformation with ID ${transformationId} not found`);
    }
    
    const transformation = result.rows[0];
    
    // If there's a task ID, check the task status
    if (transformation.task_id) {
      const taskStatus = getTaskStatus(transformation.task_id);
      
      if (taskStatus) {
        // Return combined status
        return {
          transformationId: transformation.id,
          name: transformation.name,
          status: transformation.status,
          progress: transformation.progress,
          created_at: transformation.created_at,
          updated_at: transformation.updated_at,
          created_by: transformation.created_by,
          task: taskStatus
        };
      }
    }
    
    // Return just the transformation status if no task status is available
    return {
      transformationId: transformation.id,
      name: transformation.name,
      status: transformation.status,
      progress: transformation.progress || 0,
      created_at: transformation.created_at,
      updated_at: transformation.updated_at,
      created_by: transformation.created_by,
      result: transformation.result ? JSON.parse(transformation.result) : null,
      error: transformation.error
    };
  } catch (error) {
    transformLogger.error('Error getting transformation status', { 
      transformationId,
      error: error.message
    });
    throw error;
  }
}

/**
 * List user's transformations
 * 
 * @param {number} userId - User ID
 * @param {Object} options - Query options (limit, offset, etc.)
 * @returns {Array} - List of transformations
 */
async function listTransformations(userId, options = {}) {
  try {
    const { limit = 20, offset = 0, status } = options;
    
    let query = `
      SELECT id, name, description, status, progress, created_at, updated_at, created_by
      FROM transformations
      WHERE created_by = $1
    `;
    const queryParams = [userId];
    
    if (status) {
      query += ' AND status = $2';
      queryParams.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2);
    queryParams.push(limit, offset);
    
    const result = await db.query(query, queryParams);
    
    return result.rows;
  } catch (error) {
    transformLogger.error('Error listing transformations', { 
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a transformation
 * 
 * @param {number} transformationId - Transformation ID
 * @param {number} userId - User ID (for permission checking)
 * @returns {boolean} - Success indicator
 */
async function deleteTransformation(transformationId, userId) {
  try {
    // First, get the transformation to check permissions
    const checkResult = await db.query(
      'SELECT created_by FROM transformations WHERE id = $1',
      [transformationId]
    );
    
    if (checkResult.rows.length === 0) {
      transformLogger.warn('Transformation not found for deletion', { transformationId });
      throw new Error(`Transformation with ID ${transformationId} not found`);
    }
    
    const transformation = checkResult.rows[0];
    
    // Check if user can delete this transformation
    if (transformation.created_by !== userId) {
      transformLogger.warn('Unauthorized deletion attempt', { transformationId, userId });
      throw new Error('You do not have permission to delete this transformation');
    }
    
    // Delete the transformation
    await db.query(
      'DELETE FROM transformations WHERE id = $1',
      [transformationId]
    );
    
    transformLogger.info('Transformation deleted', { transformationId, userId });
    return true;
  } catch (error) {
    transformLogger.error('Error deleting transformation', { 
      transformationId,
      userId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createTransformation,
  getTransformationStatus,
  listTransformations,
  deleteTransformation
};