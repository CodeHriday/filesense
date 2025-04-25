/**
 * Transformation Service
 * 
 * Handles all ETL and data transformation operations, including
 * mapping definitions, transformation execution, and lineage tracking.
 */

const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ServiceBase = require('./ServiceBase');
const { processTransformationAsync } = require('../utils/asyncProcessor');
const fileService = require('./FileService');

// Promisify fs functions
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

class TransformationService extends ServiceBase {
  constructor() {
    super();
    this.transformationTypes = {
      JOIN: 'join',
      FILTER: 'filter',
      AGGREGATE: 'aggregate',
      SORT: 'sort',
      MAP: 'map',
      SPLIT: 'split',
      MERGE: 'merge',
      LOOKUP: 'lookup',
      VALIDATE: 'validate',
      ENRICH: 'enrich',
      CUSTOM: 'custom'
    };
  }

  /**
   * Create a new transformation definition
   * 
   * @param {Object} transformationData - Transformation definition data
   * @returns {Promise<Object>} Created transformation
   */
  async createTransformation(transformationData) {
    const traceId = this.generateTraceId();
    this.logger.info('Creating transformation', { 
      name: transformationData.name,
      type: transformationData.type,
      traceId 
    });
    
    try {
      // Validate transformation data
      this.validateTransformationData(transformationData);
      
      // Generate a unique transformation ID
      const transformationId = transformationData.id || `transform_${Date.now()}`;
      
      // Insert into database
      const query = `
        INSERT INTO transformations (
          transformation_id,
          name,
          description,
          type,
          config,
          input_files,
          output_format,
          created_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `;
      
      const params = [
        transformationId,
        transformationData.name,
        transformationData.description || '',
        transformationData.type,
        JSON.stringify(transformationData.config || {}),
        JSON.stringify(transformationData.inputFiles || []),
        transformationData.outputFormat || 'csv',
        transformationData.createdBy || 2  // Default to admin user ID
      ];
      
      const result = await this.executeQuery(query, params);
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error creating transformation', { 
        error: error.message,
        stack: error.stack,
        traceId
      });
      throw error;
    }
  }

  /**
   * Get all transformations
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of transformations
   */
  async getAllTransformations(options = {}) {
    const { sortBy = 'created_at', sortOrder = 'DESC', limit = 100, offset = 0 } = options;
    const traceId = this.generateTraceId();
    
    this.logger.info('Fetching all transformations', { traceId });
    
    // Validate sort column to prevent SQL injection
    const validSortColumns = ['id', 'name', 'type', 'created_at', 'updated_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    
    // Validate sort order
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    const query = `
      SELECT * FROM transformations
      ORDER BY ${sortColumn} ${order}
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await this.executeQuery(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      this.logger.error('Error fetching transformations', { 
        error: error.message,
        traceId
      });
      throw error;
    }
  }

  /**
   * Get a transformation by ID
   * 
   * @param {string} transformationId - Transformation ID
   * @returns {Promise<Object>} Transformation data
   */
  async getTransformationById(transformationId) {
    const traceId = this.generateTraceId();
    this.logger.info('Fetching transformation by ID', { transformationId, traceId });
    
    let query;
    let params = [];
    
    // Check if transformationId can be converted to a number
    const idAsNumber = parseInt(transformationId);
    
    if (!isNaN(idAsNumber)) {
      // If it can be parsed as a number, search by both id and transformation_id
      query = `
        SELECT * FROM transformations 
        WHERE id = $1 OR transformation_id = $2
      `;
      params = [idAsNumber, transformationId];
    } else {
      // Otherwise just search by transformation_id
      query = `
        SELECT * FROM transformations 
        WHERE transformation_id = $1
      `;
      params = [transformationId];
    }
    
    try {
      const result = await this.executeQuery(query, params);
      
      if (result.rows.length === 0) {
        this.logger.warn('Transformation not found', { transformationId, traceId });
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error fetching transformation', { 
        error: error.message,
        transformationId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Update a transformation
   * 
   * @param {string} transformationId - Transformation ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated transformation
   */
  async updateTransformation(transformationId, updates) {
    const traceId = this.generateTraceId();
    this.logger.info('Updating transformation', { 
      transformationId, 
      traceId,
      fields: Object.keys(updates)
    });
    
    try {
      // Get existing transformation
      const existing = await this.getTransformationById(transformationId);
      
      if (!existing) {
        this.logger.warn('Transformation not found for update', { transformationId, traceId });
        return null;
      }
      
      // Validate updates
      if (updates.config) {
        // Validate config based on transformation type
        const type = updates.type || existing.type;
        this.validateTransformationConfig(type, updates.config);
      }
      
      // Build dynamic update query
      const setClauses = [];
      const queryParams = [];
      let paramCounter = 1;
      
      const updatableFields = [
        'name', 'description', 'type', 'config', 'input_files', 
        'output_format', 'enabled'
      ];
      
      for (const field of updatableFields) {
        if (updates[field] !== undefined) {
          if (field === 'config' || field === 'input_files') {
            setClauses.push(`${field} = $${paramCounter}`);
            queryParams.push(JSON.stringify(updates[field]));
          } else {
            setClauses.push(`${field} = $${paramCounter}`);
            queryParams.push(updates[field]);
          }
          paramCounter++;
        }
      }
      
      // Add updated_at
      setClauses.push('updated_at = NOW()');
      
      // Handle numeric or string transformationId
      const idAsNumber = parseInt(transformationId);
      let whereClause;
      
      if (!isNaN(idAsNumber)) {
        // If it can be parsed as a number, search by both
        whereClause = `WHERE transformation_id = $${paramCounter} OR id = $${paramCounter + 1}`;
        queryParams.push(transformationId, idAsNumber);
        paramCounter += 2;
      } else {
        // Otherwise just search by transformation_id
        whereClause = `WHERE transformation_id = $${paramCounter}`;
        queryParams.push(transformationId);
        paramCounter += 1;
      }
      
      const query = `
        UPDATE transformations
        SET ${setClauses.join(', ')}
        ${whereClause}
        RETURNING *
      `;
      
      const result = await this.executeQuery(query, queryParams);
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error updating transformation', { 
        error: error.message,
        transformationId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Delete a transformation
   * 
   * @param {string} transformationId - Transformation ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteTransformation(transformationId) {
    const traceId = this.generateTraceId();
    this.logger.info('Deleting transformation', { transformationId, traceId });
    
    try {
      // Delete within a transaction to maintain consistency
      await this.executeTransaction(async (client) => {
        // First, delete any execution history
        await client.query(
          'DELETE FROM transformation_executions WHERE transformation_id = $1',
          [transformationId]
        );
        
        // Then delete the transformation itself
        // Handle numeric or string ID
        const idAsNumber = parseInt(transformationId);
        
        if (!isNaN(idAsNumber)) {
          await client.query(
            'DELETE FROM transformations WHERE transformation_id = $1 OR id = $2',
            [transformationId, idAsNumber]
          );
        } else {
          await client.query(
            'DELETE FROM transformations WHERE transformation_id = $1',
            [transformationId]
          );
        }
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error deleting transformation', { 
        error: error.message,
        transformationId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Execute a transformation
   * 
   * @param {string} transformationId - Transformation ID
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result with task ID
   */
  async executeTransformation(transformationId, options = {}) {
    const traceId = this.generateTraceId();
    this.logger.info('Executing transformation', { transformationId, traceId });
    
    try {
      // Get transformation details
      const transformation = await this.getTransformationById(transformationId);
      
      if (!transformation) {
        throw new Error(`Transformation not found: ${transformationId}`);
      }
      
      // Create execution record
      const executionId = `exec_${Date.now()}`;
      
      const insertQuery = `
        INSERT INTO transformation_executions (
          execution_id,
          transformation_id,
          status,
          started_at,
          parameters,
          created_at
        )
        VALUES ($1, $2, $3, NOW(), $4, NOW())
        RETURNING *
      `;
      
      await this.executeQuery(insertQuery, [
        executionId,
        transformationId,
        'RUNNING',
        JSON.stringify(options.parameters || {})
      ]);
      
      // Start async processing
      const processingTask = processTransformationAsync({
        transformation,
        executionId,
        traceId,
        options,
        onComplete: async (result) => {
          // Update execution record when complete
          try {
            await this.updateExecutionStatus(
              executionId, 
              result.success ? 'COMPLETED' : 'FAILED',
              result
            );
          } catch (updateErr) {
            this.logger.error('Failed to update execution status', {
              error: updateErr.message,
              executionId,
              traceId
            });
          }
        }
      });
      
      // Return task information
      return {
        transformationId,
        executionId,
        taskId: processingTask.taskId,
        status: 'RUNNING'
      };
    } catch (error) {
      this.logger.error('Error executing transformation', { 
        error: error.message,
        stack: error.stack,
        transformationId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Update execution status
   * 
   * @param {string} executionId - Execution ID
   * @param {string} status - New status
   * @param {Object} result - Execution result
   * @returns {Promise<Object>} Updated execution record
   */
  async updateExecutionStatus(executionId, status, result = {}) {
    const traceId = this.generateTraceId();
    this.logger.info('Updating execution status', { 
      executionId, 
      status,
      traceId
    });
    
    const query = `
      UPDATE transformation_executions
      SET 
        status = $1,
        completed_at = CASE WHEN $1 IN ('COMPLETED', 'FAILED') THEN NOW() ELSE completed_at END,
        result = $2,
        updated_at = NOW()
      WHERE execution_id = $3
      RETURNING *
    `;
    
    try {
      const updateResult = await this.executeQuery(query, [
        status,
        JSON.stringify(result),
        executionId
      ]);
      
      return updateResult.rows[0];
    } catch (error) {
      this.logger.error('Error updating execution status', { 
        error: error.message,
        executionId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Get execution history for a transformation
   * 
   * @param {string} transformationId - Transformation ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Execution history
   */
  async getExecutionHistory(transformationId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const traceId = this.generateTraceId();
    
    this.logger.info('Fetching execution history', { transformationId, traceId });
    
    const query = `
      SELECT * FROM transformation_executions
      WHERE transformation_id = $1
      ORDER BY started_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.executeQuery(query, [transformationId, limit, offset]);
      return result.rows;
    } catch (error) {
      this.logger.error('Error fetching execution history', { 
        error: error.message,
        transformationId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Get execution details
   * 
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object>} Execution details
   */
  async getExecutionDetails(executionId) {
    const traceId = this.generateTraceId();
    this.logger.info('Fetching execution details', { executionId, traceId });
    
    const query = `
      SELECT e.*, t.name as transformation_name, t.type as transformation_type
      FROM transformation_executions e
      JOIN transformations t ON e.transformation_id = t.transformation_id
      WHERE e.execution_id = $1
    `;
    
    try {
      const result = await this.executeQuery(query, [executionId]);
      
      if (result.rows.length === 0) {
        this.logger.warn('Execution not found', { executionId, traceId });
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error fetching execution details', { 
        error: error.message,
        executionId,
        traceId
      });
      throw error;
    }
  }

  /**
   * Validate transformation data
   * 
   * @param {Object} data - Transformation data to validate
   * @throws {Error} If validation fails
   */
  validateTransformationData(data) {
    // Check required fields
    if (!data.name) {
      throw new Error('Transformation name is required');
    }
    
    if (!data.type) {
      throw new Error('Transformation type is required');
    }
    
    // Validate transformation type
    const validTypes = Object.values(this.transformationTypes);
    if (!validTypes.includes(data.type)) {
      throw new Error(`Invalid transformation type. Must be one of: ${validTypes.join(', ')}`);
    }
    
    // Validate configuration based on type
    if (data.config) {
      this.validateTransformationConfig(data.type, data.config);
    }
    
    // Validate input files
    if (data.inputFiles) {
      if (!Array.isArray(data.inputFiles)) {
        throw new Error('inputFiles must be an array');
      }
      
      if (data.inputFiles.length === 0) {
        throw new Error('At least one input file is required');
      }
    }
  }

  /**
   * Validate transformation configuration
   * 
   * @param {string} type - Transformation type
   * @param {Object} config - Configuration to validate
   * @throws {Error} If validation fails
   */
  validateTransformationConfig(type, config) {
    switch (type) {
      case this.transformationTypes.JOIN:
        if (!config.joinType) {
          throw new Error('Join type is required for JOIN transformations');
        }
        if (!config.joinColumns || !Array.isArray(config.joinColumns)) {
          throw new Error('Join columns must be specified as an array');
        }
        break;
        
      case this.transformationTypes.FILTER:
        if (!config.conditions || !Array.isArray(config.conditions)) {
          throw new Error('Filter conditions must be specified as an array');
        }
        break;
        
      case this.transformationTypes.AGGREGATE:
        if (!config.groupBy || !Array.isArray(config.groupBy)) {
          throw new Error('Group by columns must be specified as an array');
        }
        if (!config.aggregations || !Array.isArray(config.aggregations)) {
          throw new Error('Aggregations must be specified as an array');
        }
        break;
        
      case this.transformationTypes.MAP:
        if (!config.mappings || !Array.isArray(config.mappings)) {
          throw new Error('Column mappings must be specified as an array');
        }
        break;
        
      // Add validation for other transformation types as needed
    }
  }
}

module.exports = new TransformationService();