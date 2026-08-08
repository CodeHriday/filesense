/**
 * Notifications Routes
 * Routes for managing user notifications
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { query } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { authenticateToken } = require('../src/middleware/authenticate');

// Health check endpoint (no auth required for debugging)
router.get('/health', async (req, res) => {
  try {
    console.log('🔍 Notifications health check requested - NO AUTH REQUIRED');
    console.log('🔍 Request headers:', req.headers);
    

    
    // Test basic connection
    await query('SELECT NOW() as current_time');
    
    // Check if notifications table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications'
      );
    `);
    
    res.json({
      healthy: true,
      database_connected: true,
      notifications_table_exists: tableCheck.rows[0].exists,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(503).json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// All other routes require authentication
router.use(authenticateToken);

// GET /api/notifications - Get all notifications for current user
router.get('/', async (req, res) => {
  try {
    // Ensure request object is valid
    if (!req || typeof req.query === 'undefined') {
      systemLogger.error('Invalid request object in notifications route');
      return res.status(500).json({ 
        error: 'Internal server error'
      });
    }
    
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        error: 'Authentication required'
      });
    }
    
    const { unread_only } = req.query;
    
    // Test database connection and table existence
    try {
      await query('SELECT 1');
      console.log('✅ Database connection test successful');
      
      // Check if notifications table exists
      const tableCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'notifications'
        );
      `);
      
      if (!tableCheck.rows[0].exists) {
        console.error('❌ Notifications table does not exist');
        return res.status(503).json({ 
          error: 'Notifications table not found in database'
        });
      }
      
      console.log('✅ Notifications table exists');
    } catch (dbError) {
      console.error('❌ Database connection test failed:', dbError.message);
      return res.status(503).json({ 
        error: 'Database connection failed: ' + dbError.message
      });
    }
    
    let queryText = `
      SELECT *
      FROM notifications
      WHERE user_id = $1
    `;
    
    const params = [req.user.id];
    
    if (unread_only === 'true') {
      queryText += ` AND is_read = FALSE`;
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT 100`;
    
    const result = await query(queryText, params);
    
    res.json({
      success: true,
      notifications: result.rows
    });
    
  } catch (error) {
    systemLogger.error('Error fetching notifications', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to fetch notifications'
    });
  }
});

// GET /api/notifications/count - Get count of unread notifications
router.get('/count', async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as unread_count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      unread_count: parseInt(result.rows[0].unread_count)
    });
    
  } catch (error) {
    systemLogger.error('Error getting notification count', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to get notification count'
    });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    
    // Verify notification belongs to current user
    const checkResult = await query(
      `SELECT id FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, req.user.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Mark as read
    await query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [notificationId]
    );
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
    
  } catch (error) {
    systemLogger.error('Error marking notification as read', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to mark notification as read'
    });
  }
});

// PUT /api/notifications/:id/unread - Mark notification as unread
router.put('/:id/unread', async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    
    // Verify notification belongs to current user
    const checkResult = await query(
      `SELECT id FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, req.user.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Mark as unread
    await query(
      `UPDATE notifications 
       SET is_read = FALSE, read_at = NULL
       WHERE id = $1`,
      [notificationId]
    );
    
    res.json({
      success: true,
      message: 'Notification marked as unread'
    });
    
  } catch (error) {
    systemLogger.error('Error marking notification as unread', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to mark notification as unread'
    });
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    await query(
      `UPDATE notifications 
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
    
  } catch (error) {
    systemLogger.error('Error marking all notifications as read', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to mark all notifications as read'
    });
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    
    // Verify notification belongs to current user
    const checkResult = await query(
      `SELECT id FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, req.user.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Delete notification
    await query(
      `DELETE FROM notifications WHERE id = $1`,
      [notificationId]
    );
    
    res.json({
      success: true,
      message: 'Notification deleted'
    });
    
  } catch (error) {
    systemLogger.error('Error deleting notification', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to delete notification'
    });
  }
});

// POST /api/notifications - Create a notification (internal use or admin)
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      notification_type,
      title,
      message,
      entity_type,
      entity_id,
      action_url,
      metadata
    } = req.body;
    
    if (!user_id || !notification_type || !title || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: user_id, notification_type, title, message' 
      });
    }
    
    const result = await query(
      `INSERT INTO notifications (
        user_id, notification_type, title, message,
        entity_type, entity_id, action_url, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        user_id,
        notification_type,
        title,
        message,
        entity_type || null,
        entity_id || null,
        action_url || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    
    systemLogger.info('Notification created', { 
      notificationId: result.rows[0].id,
      userId: user_id,
      type: notification_type
    });
    
    res.json({
      success: true,
      notification: result.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error creating notification', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to create notification'
    });
  }
});

module.exports = router;
