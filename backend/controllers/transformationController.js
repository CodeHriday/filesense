/**
 * Transformation Controller
 * 
 * Handles HTTP requests for transformation operations
 * and delegates business logic to the transformation service.
 */

const transformationService = require('../services/TransformationService');
const { systemLogger } = require('../utils/logger');
const { asyncHandler } = require('../utils/errorHelpers');
const { NotFoundError, ValidationError, TransformationError } = require('../errors');

/**
 * Create a new transformation
 */
const createTransformation = asyncHandler(async (req, res) => {
  const transformationData = req.body;
  
  // Add audit information
  transformationData.createdBy = req.user?.id || 2; // Default to admin if no user
  
  const result = await transformationService.createTransformation(transformationData);
  res.status(201).json(result);
});

/**
 * Get all transformations
 */
const getAllTransformations = asyncHandler(async (req, res) => {
  const options = {
    sortBy: req.query.sortBy || 'created_at',
    sortOrder: req.query.sortOrder || 'DESC',
    limit: parseInt(req.query.limit) || 100,
    offset: parseInt(req.query.offset) || 0
  };
  
  const transformations = await transformationService.getAllTransformations(options);
  res.json(transformations);
});

/**
 * Get a transformation by ID
 */
const getTransformationById = asyncHandler(async (req, res) => {
  const transformationId = req.params.id;
  const transformation = await transformationService.getTransformationById(transformationId);
  
  if (!transformation) {
    // Use our NotFoundError from the service layer
    // The service should throw this error, but we'll handle the case if it doesn't
    throw new NotFoundError(
      'Transformation not found',
      'transformation',
      transformationId
    );
  }
  
  res.json(transformation);
});

/**
 * Update a transformation
 */
const updateTransformation = asyncHandler(async (req, res) => {
  const transformationId = req.params.id;
  const updates = req.body;
  
  const updatedTransformation = await transformationService.updateTransformation(
    transformationId, 
    updates
  );
  
  if (!updatedTransformation) {
    throw new NotFoundError(
      'Transformation not found',
      'transformation',
      transformationId
    );
  }
  
  res.json(updatedTransformation);
});

/**
 * Delete a transformation
 */
const deleteTransformation = asyncHandler(async (req, res) => {
  const transformationId = req.params.id;
  const success = await transformationService.deleteTransformation(transformationId);
  
  if (!success) {
    throw new NotFoundError(
      'Transformation not found',
      'transformation',
      transformationId
    );
  }
  
  res.json({ message: 'Transformation deleted successfully' });
});

/**
 * Execute a transformation
 */
const executeTransformation = asyncHandler(async (req, res) => {
  // Check if user has transformation:execute permission
  if (!req.user || !req.user.permissions || !req.user.permissions.includes('transformation:execute')) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'You do not have permission to execute transformations. Contact your administrator.'
    });
  }
  
  const transformationId = req.params.id;
  const options = {
    parameters: (req.body && req.body.parameters) ? req.body.parameters : {},
    userId: req.user?.id || 2, // Default to admin if no user
  };
  
  const result = await transformationService.executeTransformation(transformationId, options);
  res.json(result);
});

/**
 * Get execution history for a transformation
 */
const getExecutionHistory = asyncHandler(async (req, res) => {
  const transformationId = req.params.id;
  const options = {
    limit: parseInt(req.query.limit) || 20,
    offset: parseInt(req.query.offset) || 0
  };
  
  const history = await transformationService.getExecutionHistory(transformationId, options);
  res.json(history);
});

/**
 * Get execution details
 */
const getExecutionDetails = asyncHandler(async (req, res) => {
  const executionId = req.params.executionId;
  const details = await transformationService.getExecutionDetails(executionId);
  
  if (!details) {
    throw new NotFoundError(
      'Execution not found',
      'transformation_execution',
      executionId
    );
  }
  
  res.json(details);
});

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