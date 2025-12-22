const express = require('express');
const router = express.Router();
const FileInsightsService = require('../services/fileInsightsService');
const { systemLogger } = require('../utils/logger');
const cacheService = require('../services/cacheService');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * File Insights API Routes
 * Provides time-series metrics and analytics for file patterns
 * Uses caching for performance with 5-minute TTL
 */

module.exports = (dbPool, authenticate) => {
  const insightsService = new FileInsightsService(dbPool);
  const CACHE_TTL = 5 * 60; // 5 minutes

  /**
   * GET /api/insights/file-patterns
   * Get list of all file patterns with summary statistics
   */
  router.get('/file-patterns', authenticate, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      const cacheKey = `insights:patterns:${limit}:${offset}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      const patterns = await insightsService.getFilePatterns(limit, offset);
      
      const response = {
        success: true,
        patterns,
        pagination: {
          limit,
          offset,
          count: patterns.length
        }
      };
      
      // Cache the response
      await cacheService.set(cacheKey, response, CACHE_TTL);
      
      res.json(response);
    } catch (error) {
      systemLogger.error('Error fetching file patterns', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch file patterns'
      });
    }
  });

  /**
   * GET /api/insights/file-patterns/:pattern/metrics
   * Get time-series metrics for a specific file pattern
   * Query params:
   *   - granularity: daily|weekly|monthly (default: daily)
   *   - range: number of days to look back (default: 30)
   */
  router.get('/file-patterns/:pattern/metrics', authenticate, async (req, res) => {
    try {
      const pattern = decodeURIComponent(req.params.pattern);
      const granularity = req.query.granularity || 'daily';
      const range = parseInt(req.query.range) || 30;
      
      // Validate granularity
      if (!['daily', 'weekly', 'monthly'].includes(granularity)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid granularity. Must be daily, weekly, or monthly'
        });
      }
      
      // Convert range shortcuts (e.g., "7d", "12w", "18m", "5y")
      let rangeInDays = range;
      if (typeof req.query.range === 'string') {
        const match = req.query.range.match(/^(\d+)([dwmy])$/);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2];
          
          switch (unit) {
            case 'd': rangeInDays = value; break;
            case 'w': rangeInDays = value * 7; break;
            case 'm': rangeInDays = value * 30; break;
            case 'y': rangeInDays = value * 365; break;
          }
        }
      }
      
      // Cap at 18 months (548 days)
      rangeInDays = Math.min(rangeInDays, 548);
      
      const cacheKey = `insights:metrics:${pattern}:${granularity}:${rangeInDays}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      const metrics = await insightsService.getPatternMetrics(pattern, granularity, rangeInDays);
      
      const response = {
        success: true,
        pattern,
        granularity,
        range_days: rangeInDays,
        metrics
      };
      
      // Cache the response
      await cacheService.set(cacheKey, response, CACHE_TTL);
      
      res.json(response);
    } catch (error) {
      systemLogger.error('Error fetching pattern metrics', { 
        pattern: req.params.pattern,
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pattern metrics'
      });
    }
  });

  /**
   * GET /api/insights/file-patterns/:pattern/alerts
   * Get alerts for a specific file pattern
   */
  router.get('/file-patterns/:pattern/alerts', authenticate, async (req, res) => {
    try {
      const pattern = decodeURIComponent(req.params.pattern);
      const limit = parseInt(req.query.limit) || 50;
      
      const alerts = await insightsService.getPatternAlerts(pattern, limit);
      
      res.json({
        success: true,
        pattern,
        alerts
      });
    } catch (error) {
      systemLogger.error('Error fetching pattern alerts', { 
        pattern: req.params.pattern,
        error: error.message 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pattern alerts'
      });
    }
  });

  /**
   * POST /api/insights/aggregate
   * Trigger daily metrics aggregation (admin only)
   * Body:
   *   - date: optional date to aggregate (default: today)
   */
  router.post('/aggregate', authenticate, async (req, res) => {
    try {
      // Check if user has admin role
      if (!userHasAdminAccess(req.user)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions. Admin role required.'
        });
      }
      
      const targetDate = req.body.date ? new Date(req.body.date) : new Date();
      
      const result = await insightsService.aggregateDailyMetrics(targetDate);
      
      res.json(result);
    } catch (error) {
      systemLogger.error('Error aggregating metrics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to aggregate metrics'
      });
    }
  });

  /**
   * POST /api/insights/cleanup
   * Clean up records older than 18 months (admin only)
   */
  router.post('/cleanup', authenticate, async (req, res) => {
    try {
      // Check if user has admin role
      if (!userHasAdminAccess(req.user)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions. Admin role required.'
        });
      }
      
      const result = await insightsService.cleanupOldRecords();
      
      res.json(result);
    } catch (error) {
      systemLogger.error('Error cleaning up old records', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to clean up old records'
      });
    }
  });

  /**
   * GET /api/insights/stats
   * Get overall insights statistics
   */
  router.get('/stats', authenticate, async (req, res) => {
    try {
      const stats = await dbPool.query(`
        SELECT 
          COUNT(DISTINCT file_pattern) as total_patterns,
          COUNT(*) as total_daily_metrics,
          SUM(file_count) as total_files_tracked,
          SUM(alert_count) as total_alerts,
          MIN(metric_date) as earliest_date,
          MAX(metric_date) as latest_date
        FROM file_pattern_metrics
      `);
      
      res.json({
        success: true,
        stats: stats.rows[0]
      });
    } catch (error) {
      systemLogger.error('Error fetching insights stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch insights stats'
      });
    }
  });

  return router;
};
