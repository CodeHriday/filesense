/**
 * Transformations routes module
 * 
 * This module defines the API routes for transformation operations.
 */
const express = require('express');
const router = express.Router();
const transformationsController = require('../controllers/transformations');
const { authenticateToken, requirePermission } = require('../middleware/authenticate');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// GET /api/transformations - Get all transformations
router.get(
  '/',
  requirePermission('transformations:read'),
  transformationsController.getAllTransformations
);

// GET /api/transformations/:id - Get transformation by ID
router.get(
  '/:id',
  requirePermission('transformations:read'),
  transformationsController.getTransformationById
);

// POST /api/transformations - Create a new transformation
router.post(
  '/',
  requirePermission('transformations:write'),
  transformationsController.createTransformation
);

// PUT /api/transformations/:id - Update an existing transformation
router.put(
  '/:id',
  requirePermission('transformations:write'),
  transformationsController.updateTransformation
);

// DELETE /api/transformations/:id - Delete a transformation
router.delete(
  '/:id',
  requirePermission('transformations:write'),
  transformationsController.deleteTransformation
);

// POST /api/transformations/:id/execute - Execute a transformation
router.post(
  '/:id/execute',
  requirePermission('transformations:write'),
  transformationsController.executeTransformation
);

module.exports = router;