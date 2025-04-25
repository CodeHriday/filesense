/**
 * Transformation Controller
 * 
 * Handles API endpoints for managing data transformations
 */

const asyncTransformationService = require('../services/asyncTransformationService');
const { apiLogger } = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Create a new transformation
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createTransformation(req, res) {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      apiLogger.warn('Validation error in create transformation', { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { body: transformationConfig } = req;
    const userId = req.user.id;
    
    apiLogger.info('Creating transformation', { userId, transformName: transformationConfig.name });
    
    // Create transformation
    const result = await asyncTransformationService.createTransformation(transformationConfig, userId);
    
    res.status(201).json({
      message: 'Transformation created successfully',
      ...result
    });
  } catch (error) {
    apiLogger.error('Error creating transformation', { error: error.message });
    res.status(500).json({ error: 'Failed to create transformation', message: error.message });
  }
}

/**
 * Get transformation status
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getTransformationStatus(req, res) {
  try {
    const { id } = req.params;
    
    apiLogger.info('Getting transformation status', { transformationId: id });
    
    // Get transformation status
    const status = await asyncTransformationService.getTransformationStatus(id);
    
    res.json(status);
  } catch (error) {
    apiLogger.error('Error getting transformation status', { 
      transformationId: req.params.id,
      error: error.message 
    });
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.status(500).json({ error: 'Failed to get transformation status', message: error.message });
  }
}

/**
 * List user's transformations
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function listTransformations(req, res) {
  try {
    const userId = req.user.id;
    const { limit, offset, status } = req.query;
    
    apiLogger.info('Listing transformations', { userId, limit, offset, status });
    
    // List transformations
    const transformations = await asyncTransformationService.listTransformations(userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      status
    });
    
    res.json(transformations);
  } catch (error) {
    apiLogger.error('Error listing transformations', { error: error.message });
    res.status(500).json({ error: 'Failed to list transformations', message: error.message });
  }
}

/**
 * Delete a transformation
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteTransformation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    apiLogger.info('Deleting transformation', { transformationId: id, userId });
    
    // Delete transformation
    await asyncTransformationService.deleteTransformation(id, userId);
    
    res.json({ message: 'Transformation deleted successfully' });
  } catch (error) {
    apiLogger.error('Error deleting transformation', { 
      transformationId: req.params.id,
      error: error.message 
    });
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    if (error.message.includes('permission')) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    res.status(500).json({ error: 'Failed to delete transformation', message: error.message });
  }
}

module.exports = {
  createTransformation,
  getTransformationStatus,
  listTransformations,
  deleteTransformation
};