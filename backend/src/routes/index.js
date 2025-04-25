/**
 * API routes index module
 * 
 * This module sets up and exports all API routes.
 */
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
// Import other route files as needed
// const userRoutes = require('./user');
// const fileRoutes = require('./file');
// const transformationRoutes = require('./transformation');

// Root route for API health check
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Register route modules
router.use('/auth', authRoutes);
// Register other route modules as needed
// router.use('/users', userRoutes);
// router.use('/files', fileRoutes);
// router.use('/transformations', transformationRoutes);

module.exports = router;