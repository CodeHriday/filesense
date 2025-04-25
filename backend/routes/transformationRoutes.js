/**
 * Transformation API Routes
 * 
 * Defines the API endpoints for transformation operations
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const transformationController = require('../controllers/transformationController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();

// Middleware to check if user is authenticated
router.use(authenticate);

/**
 * @route  GET /api/transformations
 * @desc   Get list of transformations for the user
 * @access Private
 */
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a positive integer'),
    query('status').optional().isIn(['pending', 'running', 'completed', 'failed']).withMessage('Invalid status')
  ],
  authorize('transformations:read'),
  transformationController.listTransformations
);

/**
 * @route  POST /api/transformations
 * @desc   Create a new transformation
 * @access Private
 */
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Name is required').trim(),
    body('description').optional().trim(),
    body('source_file_id').notEmpty().withMessage('Source file ID is required'),
    body('target_file_id').optional(),
    body('transformations').isArray().withMessage('Transformations must be an array'),
    body('transformations.*.type').notEmpty().withMessage('Transformation type is required'),
    body('transformations.*.field').optional(),
    body('fileType').notEmpty().withMessage('File type is required')
  ],
  authorize('transformations:write'),
  transformationController.createTransformation
);

/**
 * @route  GET /api/transformations/:id
 * @desc   Get transformation status
 * @access Private
 */
router.get(
  '/:id',
  [
    param('id').isInt().withMessage('Transformation ID must be an integer')
  ],
  authorize('transformations:read'),
  transformationController.getTransformationStatus
);

/**
 * @route  DELETE /api/transformations/:id
 * @desc   Delete a transformation
 * @access Private
 */
router.delete(
  '/:id',
  [
    param('id').isInt().withMessage('Transformation ID must be an integer')
  ],
  authorize('transformations:write'),
  transformationController.deleteTransformation
);

module.exports = router;