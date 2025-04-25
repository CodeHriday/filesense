/**
 * Transformation Routes
 * 
 * Defines API routes for transformation operations.
 */

const express = require('express');
const router = express.Router();
const transformationController = require('../controllers/transformationController');
const { systemLogger } = require('../utils/logger');

// Middleware to log API requests
const logRequest = (req, res, next) => {
  const startTime = Date.now();
  
  // Log the request
  systemLogger.info('Transformation API request', {
    method: req.method,
    path: req.path,
    query: req.query,
    user: req.user?.id || 'anonymous'
  });
  
  // Intercept the response to log
  const originalSend = res.send;
  res.send = function(body) {
    const endTime = Date.now();
    
    // Log response metadata (not the body for privacy/security)
    systemLogger.info('Transformation API response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: endTime - startTime,
      user: req.user?.id || 'anonymous'
    });
    
    // Continue with the original send
    return originalSend.call(this, body);
  };
  
  next();
};

// Apply logging middleware to all routes
router.use(logRequest);

// Transformation CRUD routes
router.post('/', transformationController.createTransformation);
router.get('/', transformationController.getAllTransformations);
router.get('/:id', transformationController.getTransformationById);
router.put('/:id', transformationController.updateTransformation);
router.delete('/:id', transformationController.deleteTransformation);

// Transformation execution routes
router.post('/:id/execute', transformationController.executeTransformation);
router.get('/:id/executions', transformationController.getExecutionHistory);
router.get('/:id/executions/:executionId', transformationController.getExecutionDetails);

module.exports = router;