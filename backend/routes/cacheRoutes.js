/**
 * Cache Management Routes
 * 
 * Endpoints for cache monitoring and management:
 * - GET /api/cache/stats - Get cache statistics
 * - DELETE /api/cache/flush - Clear all cache entries
 * - DELETE /api/cache/invalidate/:pattern - Invalidate specific cache pattern
 */

const express = require('express');
const router = express.Router();
const cacheService = require('../services/cacheService');
const { systemLogger } = require('../utils/logger');
const authenticateToken = require('../middleware/authenticate');

/**
 * Get cache statistics
 * GET /api/cache/stats
 * Requires authentication
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await cacheService.getStats();
    
    res.json({
      success: true,
      cache: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    systemLogger?.error?.('Error fetching cache stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cache statistics'
    });
  }
});

/**
 * Flush all cache entries
 * DELETE /api/cache/flush
 * Requires authentication
 */
router.delete('/flush', authenticateToken, async (req, res) => {
  try {
    await cacheService.flush();
    
    systemLogger?.info?.('Cache flushed via API');
    
    res.json({
      success: true,
      message: 'Cache flushed successfully'
    });
  } catch (error) {
    systemLogger?.error?.('Error flushing cache', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to flush cache'
    });
  }
});

/**
 * Invalidate specific cache pattern
 * DELETE /api/cache/invalidate/:pattern
 * Requires authentication
 */
router.delete('/invalidate/:pattern', authenticateToken, async (req, res) => {
  try {
    const { pattern } = req.params;
    
    await cacheService.delPattern(pattern);
    
    systemLogger?.info?.('Cache pattern invalidated via API', { pattern });
    
    res.json({
      success: true,
      message: `Cache pattern '${pattern}' invalidated successfully`
    });
  } catch (error) {
    systemLogger?.error?.('Error invalidating cache pattern', { 
      pattern: req.params.pattern,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache pattern'
    });
  }
});

module.exports = router;
