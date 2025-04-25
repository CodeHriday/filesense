/**
 * Transformation Repository module
 * 
 * This module handles database access for transformation operations.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * Find all transformations with optional filtering
 * @param {Object} filters - Filter parameters (status, type, etc.)
 * @returns {Promise<Array>} Array of transformation objects
 */
const findAll = async (filters = {}) => {
  try {
    // Start building the query
    let queryText = 'SELECT * FROM transformations';
    const queryParams = [];
    
    // Apply filters if provided
    if (Object.keys(filters).length > 0) {
      const filterClauses = [];
      let paramIndex = 1;
      
      // Filter by status
      if (filters.status) {
        filterClauses.push(`status = $${paramIndex++}`);
        queryParams.push(filters.status);
      }
      
      // Filter by transform_type
      if (filters.transform_type) {
        filterClauses.push(`transform_type = $${paramIndex++}`);
        queryParams.push(filters.transform_type);
      }
      
      // Filter by source_file_id
      if (filters.source_file_id) {
        filterClauses.push(`source_file_id = $${paramIndex++}`);
        queryParams.push(filters.source_file_id);
      }
      
      // Filter by target_file_id
      if (filters.target_file_id) {
        filterClauses.push(`target_file_id = $${paramIndex++}`);
        queryParams.push(filters.target_file_id);
      }
      
      // Filter by name (partial match)
      if (filters.name) {
        filterClauses.push(`name ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.name}%`);
      }
      
      // Add WHERE clause if we have filters
      if (filterClauses.length > 0) {
        queryText += ' WHERE ' + filterClauses.join(' AND ');
      }
    }
    
    // Add ordering
    queryText += ' ORDER BY created_at DESC';
    
    // Add pagination if provided
    if (filters.limit) {
      queryText += ` LIMIT $${queryParams.length + 1}`;
      queryParams.push(parseInt(filters.limit));
      
      if (filters.offset) {
        queryText += ` OFFSET $${queryParams.length + 1}`;
        queryParams.push(parseInt(filters.offset));
      }
    }
    
    const result = await db.query(queryText, queryParams);
    return result.rows;
  } catch (error) {
    console.error('Error in transformationRepository.findAll:', error);
    throw new Error('Failed to fetch transformations');
  }
};

/**
 * Find a transformation by ID
 * @param {string} id - Transformation ID
 * @returns {Promise<Object>} Transformation object
 */
const findById = async (id) => {
  try {
    const query = 'SELECT * FROM transformations WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      const error = new Error('Transformation not found');
      error.status = 404;
      throw error;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error(`Error in transformationRepository.findById (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Create a new transformation
 * @param {Object} transformationData - Transformation data
 * @returns {Promise<Object>} Created transformation object
 */
const create = async (transformationData) => {
  const {
    name,
    description,
    source_file_id,
    target_file_id,
    transform_type,
    transform_config,
    status = 'created'
  } = transformationData;
  
  // Generate a unique ID
  const id = uuidv4();
  
  try {
    // Use a transaction for atomicity
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Insert the transformation
      const insertQuery = `
        INSERT INTO transformations (
          id, name, description, source_file_id, target_file_id,
          transform_type, transform_config, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `;
      
      const insertResult = await client.query(insertQuery, [
        id,
        name,
        description,
        source_file_id,
        target_file_id,
        transform_type,
        JSON.stringify(transform_config),
        status
      ]);
      
      // If source and target file IDs are provided, create a lineage entry
      if (source_file_id && target_file_id) {
        const lineageQuery = `
          INSERT INTO file_lineage (
            source_file_id, target_file_id, transformation_id, created_at
          ) VALUES ($1, $2, $3, NOW())
          ON CONFLICT (source_file_id, target_file_id) 
          DO UPDATE SET transformation_id = $3, updated_at = NOW()
        `;
        
        await client.query(lineageQuery, [source_file_id, target_file_id, id]);
      }
      
      await client.query('COMMIT');
      return insertResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in transformationRepository.create:', error);
    throw new Error('Failed to create transformation');
  }
};

/**
 * Update an existing transformation
 * @param {string} id - Transformation ID
 * @param {Object} transformationData - Updated transformation data
 * @returns {Promise<Object>} Updated transformation object
 */
const update = async (id, transformationData) => {
  try {
    // First, check if the transformation exists
    const existingTransformation = await findById(id);
    
    // Use a transaction for atomicity
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Prepare the update query with only the fields that are provided
      let updateQuery = 'UPDATE transformations SET updated_at = NOW()';
      const queryParams = [];
      let paramIndex = 1;
      
      // Build dynamic SET clause based on provided fields
      const updateFields = ['name', 'description', 'source_file_id', 'target_file_id', 'transform_type', 'status'];
      
      for (const field of updateFields) {
        if (transformationData[field] !== undefined) {
          updateQuery += `, ${field} = $${paramIndex++}`;
          queryParams.push(transformationData[field]);
        }
      }
      
      // Handle the transform_config object specially
      if (transformationData.transform_config !== undefined) {
        updateQuery += `, transform_config = $${paramIndex++}`;
        queryParams.push(JSON.stringify(transformationData.transform_config));
      }
      
      // Add the WHERE clause and RETURNING *
      updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
      queryParams.push(id);
      
      const updateResult = await client.query(updateQuery, queryParams);
      
      // If the source or target file ID changed, update the lineage
      const newSourceFileId = transformationData.source_file_id || existingTransformation.source_file_id;
      const newTargetFileId = transformationData.target_file_id || existingTransformation.target_file_id;
      
      if ((transformationData.source_file_id && transformationData.source_file_id !== existingTransformation.source_file_id) ||
          (transformationData.target_file_id && transformationData.target_file_id !== existingTransformation.target_file_id)) {
        
        // Delete existing lineage entry
        await client.query(
          'DELETE FROM file_lineage WHERE transformation_id = $1',
          [id]
        );
        
        // Create a new lineage entry if both source and target file IDs are provided
        if (newSourceFileId && newTargetFileId) {
          await client.query(
            `INSERT INTO file_lineage (
              source_file_id, target_file_id, transformation_id, created_at
            ) VALUES ($1, $2, $3, NOW())
            ON CONFLICT (source_file_id, target_file_id) 
            DO UPDATE SET transformation_id = $3, updated_at = NOW()`,
            [newSourceFileId, newTargetFileId, id]
          );
        }
      }
      
      await client.query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error in transformationRepository.update (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Delete a transformation
 * @param {string} id - Transformation ID
 * @returns {Promise<boolean>} True if deletion was successful
 */
const remove = async (id) => {
  try {
    // Use a transaction for atomicity
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // First, delete the lineage entry associated with this transformation
      await client.query(
        'DELETE FROM file_lineage WHERE transformation_id = $1',
        [id]
      );
      
      // Delete the transformation
      const result = await client.query(
        'DELETE FROM transformations WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Transformation not found or already deleted');
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error in transformationRepository.remove (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Update transformation status
 * @param {string} id - Transformation ID
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated transformation object
 */
const updateStatus = async (id, status) => {
  try {
    const query = 'UPDATE transformations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
    const result = await db.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      const error = new Error('Transformation not found');
      error.status = 404;
      throw error;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error(`Error in transformationRepository.updateStatus (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Count transformations with optional filtering
 * @param {Object} filters - Filter parameters (status, type, etc.)
 * @returns {Promise<number>} Count of matching transformations
 */
const count = async (filters = {}) => {
  try {
    // Start building the query
    let queryText = 'SELECT COUNT(*) FROM transformations';
    const queryParams = [];
    
    // Apply filters if provided
    if (Object.keys(filters).length > 0) {
      const filterClauses = [];
      let paramIndex = 1;
      
      // Filter by status
      if (filters.status) {
        filterClauses.push(`status = $${paramIndex++}`);
        queryParams.push(filters.status);
      }
      
      // Filter by transform_type
      if (filters.transform_type) {
        filterClauses.push(`transform_type = $${paramIndex++}`);
        queryParams.push(filters.transform_type);
      }
      
      // Filter by source_file_id
      if (filters.source_file_id) {
        filterClauses.push(`source_file_id = $${paramIndex++}`);
        queryParams.push(filters.source_file_id);
      }
      
      // Filter by target_file_id
      if (filters.target_file_id) {
        filterClauses.push(`target_file_id = $${paramIndex++}`);
        queryParams.push(filters.target_file_id);
      }
      
      // Add WHERE clause if we have filters
      if (filterClauses.length > 0) {
        queryText += ' WHERE ' + filterClauses.join(' AND ');
      }
    }
    
    const result = await db.query(queryText, queryParams);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error in transformationRepository.count:', error);
    throw new Error('Failed to count transformations');
  }
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
  updateStatus,
  count
};