/**
 * Authentication routes module
 * 
 * This module defines the API routes for authentication operations.
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authenticate');

// Public routes
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes (require authentication)
router.post('/logout-all', authenticateToken, authController.logoutAll);
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;