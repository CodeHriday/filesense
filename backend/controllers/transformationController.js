/**
 * Transformation Controller
 * 
 * Handles HTTP requests for transformation operations
 * and delegates business logic to the transformation service.
 */

const transformationService = require('../services/TransformationService');
const { systemLogger } = require('../utils/logger');

/**
 * Create a new transformation
 */
async function createTransformation(req, res) {
  try {
    const transformationData = req.body;
    
    // Add audit information
    transformationData.createdBy = req.user?.id || 2; // Default to admin if no user
    
    const result = await transformationService.createTransformation(transformationData);
    res.status(201).json(result);
  } catch (error) {
    systemLogger.error('Error in createTransformation controller', { 
      error: error.message,
      stack: error.stack,
      user: req.user?.id
    });
    
    res.status(400).json({ 
      error: 'Failed to create transformation',
      message: error.message
    });
  }
}

/**
 * Get all transformations
 */
async function getAllTransformations(req, res) {
  try {
    const options = {
      sortBy: req.query.sortBy || 'created_at',
      sortOrder: req.query.sortOrder || 'DESC',
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };
    
    const transformations = await transformationService.getAllTransformations(options);
    res.json(transformations);
  } catch (error) {
    systemLogger.error('Error in getAllTransformations controller', { 
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch transformations',
      message: error.message
    });
  }
}

/**
 * Get a transformation by ID
 */
async function getTransformationById(req, res) {
  try {
    const transformationId = req.params.id;
    const transformation = await transformationService.getTransformationById(transformationId);
    
    if (!transformation) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json(transformation);
  } catch (error) {
    systemLogger.error('Error in getTransformationById controller', { 
      error: error.message,
      stack: error.stack,
      transformationId: req.params.id
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch transformation',
      message: error.message
    });
  }
}

/**
 * Update a transformation
 */
async function updateTransformation(req, res) {
  try {
    const transformationId = req.params.id;
    const updates = req.body;
    
    const updatedTransformation = await transformationService.updateTransformation(
      transformationId,
      updates
    );
    
    if (!updatedTransformation) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json(updatedTransformation);
  } catch (error) {
    systemLogger.error('Error in updateTransformation controller', { 
      error: error.message,
      stack: error.stack,
      transformationId: req.params.id
    });
    
    res.status(400).json({ 
      error: 'Failed to update transformation',
      message: error.message
    });
  }
}

/**
 * Delete a transformation
 */
async function deleteTransformation(req, res) {
  try {
    const transformationId = req.params.id;
    const success = await transformationService.deleteTransformation(transformationId);
    
    if (!success) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json({ message: 'Transformation deleted successfully' });
  } catch (error) {
    systemLogger.error('Error in deleteTransformation controller', { 
      error: error.message,
      stack: error.stack,
      transformationId: req.params.id
    });
    
    res.status(500).json({ 
      error: 'Failed to delete transformation',
      message: error.message
    });
  }
}

/**
 * Execute a transformation
 */
async function executeTransformation(req, res) {
  try {
    const transformationId = req.params.id;
    const options = {
      parameters: req.body.parameters || {},
      userId: req.user?.id || 2, // Default to admin if no user
    };
    
    const result = await transformationService.executeTransformation(transformationId, options);
    res.json(result);
  } catch (error) {
    systemLogger.error('Error in executeTransformation controller', { 
      error: error.message,
      stack: error.stack,
      transformationId: req.params.id
    });
    
    res.status(500).json({ 
      error: 'Failed to execute transformation',
      message: error.message
    });
  }
}

/**
 * Get execution history for a transformation
 */
async function getExecutionHistory(req, res) {
  try {
    const transformationId = req.params.id;
    const options = {
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0
    };
    
    const history = await transformationService.getExecutionHistory(transformationId, options);
    res.json(history);
  } catch (error) {
    systemLogger.error('Error in getExecutionHistory controller', { 
      error: error.message,
      stack: error.stack,
      transformationId: req.params.id
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch execution history',
      message: error.message
    });
  }
}

/**
 * Get execution details
 */
async function getExecutionDetails(req, res) {
  try {
    const executionId = req.params.executionId;
    const details = await transformationService.getExecutionDetails(executionId);
    
    if (!details) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json(details);
  } catch (error) {
    systemLogger.error('Error in getExecutionDetails controller', { 
      error: error.message,
      stack: error.stack,
      executionId: req.params.executionId
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch execution details',
      message: error.message
    });
  }
}

module.exports = {
  createTransformation,
  getAllTransformations,
  getTransformationById,
  updateTransformation,
  deleteTransformation,
  executeTransformation,
  getExecutionHistory,
  getExecutionDetails
};