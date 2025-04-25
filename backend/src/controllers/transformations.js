/**
 * Transformations controller module
 * 
 * This module handles HTTP requests for transformation endpoints.
 */
const transformationsService = require('../services/transformations');
const { asyncHandler } = require('../middleware/error-handler');

/**
 * Get all transformations
 * @route GET /api/transformations
 * @access Authenticated
 */
const getAllTransformations = asyncHandler(async (req, res) => {
  const transformations = await transformationsService.getAllTransformations();
  res.json(transformations);
});

/**
 * Get a single transformation by ID
 * @route GET /api/transformations/:id
 * @access Authenticated
 */
const getTransformationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transformation = await transformationsService.getTransformationById(id);
  res.json(transformation);
});

/**
 * Create a new transformation
 * @route POST /api/transformations
 * @access Authenticated
 */
const createTransformation = asyncHandler(async (req, res) => {
  const transformationData = req.body;
  
  // Validate required fields
  if (!transformationData.name) {
    return res.status(400).json({ 
      error: 'Validation error',
      message: 'Transformation name is required'
    });
  }
  
  if (!transformationData.transform_type) {
    return res.status(400).json({ 
      error: 'Validation error',
      message: 'Transformation type is required'
    });
  }
  
  // Create the transformation
  const newTransformation = await transformationsService.createTransformation(transformationData);
  
  res.status(201).json(newTransformation);
});

/**
 * Update an existing transformation
 * @route PUT /api/transformations/:id
 * @access Authenticated
 */
const updateTransformation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transformationData = req.body;
  
  const updatedTransformation = await transformationsService.updateTransformation(id, transformationData);
  
  res.json(updatedTransformation);
});

/**
 * Delete a transformation
 * @route DELETE /api/transformations/:id
 * @access Authenticated
 */
const deleteTransformation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await transformationsService.deleteTransformation(id);
  
  res.status(204).end();
});

/**
 * Execute a transformation
 * @route POST /api/transformations/:id/execute
 * @access Authenticated
 */
const executeTransformation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await transformationsService.executeTransformation(id);
  
  res.json(result);
});

module.exports = {
  getAllTransformations,
  getTransformationById,
  createTransformation,
  updateTransformation,
  deleteTransformation,
  executeTransformation
};