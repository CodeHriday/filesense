/**
 * Admin Settings Routes
 * 
 * Provides endpoints for admin users to manage application-wide settings
 */

const express = require('express');
const router = express.Router();
const { getAllSettings, updateSetting } = require('../services/appSettingsService');
const { cleanupOldProfiles, getProfileStats } = require('../services/profileRetentionService');

/**
 * Get all application settings
 */
router.get('/settings', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const settings = await getAllSettings(pool);
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch settings',
      message: error.message 
    });
  }
});

/**
 * Update an application setting
 */
router.put('/settings/:key', async (req, res) => {
  const pool = req.app.locals.pool;
  const { key } = req.params;
  const { value } = req.body;
  
  // Validate setting key
  const validKeys = ['profile_retention_count'];
  if (!validKeys.includes(key)) {
    return res.status(400).json({ 
      error: 'Invalid setting key',
      message: `Valid keys are: ${validKeys.join(', ')}`
    });
  }
  
  // Validate value based on key
  if (key === 'profile_retention_count') {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1 || numValue > 100) {
      return res.status(400).json({ 
        error: 'Invalid value',
        message: 'Profile retention count must be between 1 and 100'
      });
    }
  }
  
  try {
    const setting = await updateSetting(pool, key, value);
    res.json({ 
      success: true,
      setting
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ 
      error: 'Failed to update setting',
      message: error.message 
    });
  }
});

/**
 * Get profile statistics per mapping
 */
router.get('/profile-stats', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const result = await getProfileStats(pool);
    if (result.success) {
      res.json({ stats: result.stats });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch profile stats',
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profile stats',
      message: error.message 
    });
  }
});

/**
 * Execute profile cleanup
 */
router.post('/cleanup-profiles', async (req, res) => {
  const pool = req.app.locals.pool;
  const { retentionCount } = req.body;
  
  try {
    const result = await cleanupOldProfiles(pool, retentionCount);
    
    if (result.success) {
      res.json({ 
        success: true,
        message: result.message,
        deletedCount: result.deletedCount,
        deletedByMapping: result.deletedByMapping
      });
    } else {
      res.status(500).json({ 
        error: 'Cleanup failed',
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error during profile cleanup:', error);
    res.status(500).json({ 
      error: 'Cleanup failed',
      message: error.message 
    });
  }
});

module.exports = router;
