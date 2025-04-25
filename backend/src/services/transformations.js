/**
 * Transformations service module
 * 
 * This module provides business logic for handling data transformations,
 * including creating, retrieving, updating, and deleting transformations.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { asyncHandler } = require('../middleware/error-handler');

/**
 * Get all transformations
 * @returns {Promise<Array>} Array of transformation objects
 */
const getAllTransformations = async () => {
  try {
    const result = await db.query(
      'SELECT * FROM transformations ORDER BY created_at DESC',
      []
    );
    return result.rows;
  } catch (error) {
    console.error('Error in getAllTransformations:', error);
    throw new Error('Failed to fetch transformations');
  }
};

/**
 * Get a transformation by ID
 * @param {string} id - Transformation ID
 * @returns {Promise<Object>} Transformation object
 */
const getTransformationById = async (id) => {
  try {
    const result = await db.query(
      'SELECT * FROM transformations WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      const error = new Error('Transformation not found');
      error.status = 404;
      throw error;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error(`Error in getTransformationById (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Create a new transformation
 * @param {Object} transformationData - Transformation data
 * @returns {Promise<Object>} Created transformation object
 */
const createTransformation = async (transformationData) => {
  const {
    name,
    description,
    source_file_id,
    target_file_id,
    transform_type,
    transform_config,
    status
  } = transformationData;
  
  // Generate a unique ID
  const id = uuidv4();
  
  try {
    const result = await db.query(
      `INSERT INTO transformations (
        id, name, description, source_file_id, target_file_id,
        transform_type, transform_config, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *`,
      [
        id,
        name,
        description,
        source_file_id,
        target_file_id,
        transform_type,
        JSON.stringify(transform_config),
        status || 'created'
      ]
    );
    
    // Create lineage entry if both source and target file IDs are provided
    if (source_file_id && target_file_id) {
      await createLineageEntry(source_file_id, target_file_id, id);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error in createTransformation:', error);
    throw new Error('Failed to create transformation');
  }
};

/**
 * Update an existing transformation
 * @param {string} id - Transformation ID
 * @param {Object} transformationData - Updated transformation data
 * @returns {Promise<Object>} Updated transformation object
 */
const updateTransformation = async (id, transformationData) => {
  const {
    name,
    description,
    source_file_id,
    target_file_id,
    transform_type,
    transform_config,
    status
  } = transformationData;
  
  try {
    // First, check if the transformation exists
    const existingTransformation = await getTransformationById(id);
    
    // Prepare the update query with only the fields that are provided
    let updateQuery = 'UPDATE transformations SET updated_at = NOW()';
    const queryParams = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updateQuery += `, name = $${paramIndex++}`;
      queryParams.push(name);
    }
    
    if (description !== undefined) {
      updateQuery += `, description = $${paramIndex++}`;
      queryParams.push(description);
    }
    
    if (source_file_id !== undefined) {
      updateQuery += `, source_file_id = $${paramIndex++}`;
      queryParams.push(source_file_id);
    }
    
    if (target_file_id !== undefined) {
      updateQuery += `, target_file_id = $${paramIndex++}`;
      queryParams.push(target_file_id);
    }
    
    if (transform_type !== undefined) {
      updateQuery += `, transform_type = $${paramIndex++}`;
      queryParams.push(transform_type);
    }
    
    if (transform_config !== undefined) {
      updateQuery += `, transform_config = $${paramIndex++}`;
      queryParams.push(JSON.stringify(transform_config));
    }
    
    if (status !== undefined) {
      updateQuery += `, status = $${paramIndex++}`;
      queryParams.push(status);
    }
    
    // Add the WHERE clause and RETURNING *
    updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
    queryParams.push(id);
    
    const result = await db.query(updateQuery, queryParams);
    
    // If the source or target file ID changed, update the lineage
    if ((source_file_id && source_file_id !== existingTransformation.source_file_id) ||
        (target_file_id && target_file_id !== existingTransformation.target_file_id)) {
      await updateLineageEntry(
        source_file_id || existingTransformation.source_file_id,
        target_file_id || existingTransformation.target_file_id,
        id
      );
    }
    
    return result.rows[0];
  } catch (error) {
    console.error(`Error in updateTransformation (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Delete a transformation
 * @param {string} id - Transformation ID
 * @returns {Promise<boolean>} True if deletion was successful
 */
const deleteTransformation = async (id) => {
  try {
    // First, check if the transformation exists
    await getTransformationById(id);
    
    // Delete the lineage entry associated with this transformation
    await db.query(
      'DELETE FROM file_lineage WHERE transformation_id = $1',
      [id]
    );
    
    // Delete the transformation
    const result = await db.query(
      'DELETE FROM transformations WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Transformation not found or already deleted');
    }
    
    return true;
  } catch (error) {
    console.error(`Error in deleteTransformation (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Create a lineage entry to link source and target files
 * @param {string} sourceFileId - Source file ID
 * @param {string} targetFileId - Target file ID
 * @param {string} transformationId - Transformation ID
 * @returns {Promise<void>}
 */
const createLineageEntry = async (sourceFileId, targetFileId, transformationId) => {
  try {
    await db.query(
      `INSERT INTO file_lineage (
        source_file_id, target_file_id, transformation_id, created_at
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (source_file_id, target_file_id) 
      DO UPDATE SET transformation_id = $3, updated_at = NOW()`,
      [sourceFileId, targetFileId, transformationId]
    );
  } catch (error) {
    console.error('Error creating lineage entry:', error);
    // Don't throw, just log the error
  }
};

/**
 * Update a lineage entry
 * @param {string} sourceFileId - Source file ID
 * @param {string} targetFileId - Target file ID
 * @param {string} transformationId - Transformation ID
 * @returns {Promise<void>}
 */
const updateLineageEntry = async (sourceFileId, targetFileId, transformationId) => {
  try {
    // Delete existing lineage entries for this transformation
    await db.query(
      'DELETE FROM file_lineage WHERE transformation_id = $1',
      [transformationId]
    );
    
    // Create a new lineage entry
    await createLineageEntry(sourceFileId, targetFileId, transformationId);
  } catch (error) {
    console.error('Error updating lineage entry:', error);
    // Don't throw, just log the error
  }
};

/**
 * Execute a transformation
 * @param {string} id - Transformation ID
 * @returns {Promise<Object>} Updated transformation object
 */
const executeTransformation = async (id) => {
  try {
    const transformation = await getTransformationById(id);
    
    // Update status to 'running'
    await db.query(
      'UPDATE transformations SET status = $1, updated_at = NOW() WHERE id = $2',
      ['running', id]
    );
    
    // TODO: Implement actual transformation logic based on transform_type
    // This would typically be handled by a background job or worker
    // For now, we'll just simulate a successful transformation
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update status to 'completed'
    const result = await db.query(
      'UPDATE transformations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['completed', id]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error(`Error in executeTransformation (ID: ${id}):`, error);
    
    // Update status to 'failed'
    try {
      await db.query(
        'UPDATE transformations SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', id]
      );
    } catch (updateError) {
      console.error('Error updating transformation status to failed:', updateError);
    }
    
    throw error;
  }
};

// Export service functions
module.exports = {
  getAllTransformations,
  getTransformationById,
  createTransformation,
  updateTransformation,
  deleteTransformation,
  executeTransformation
};