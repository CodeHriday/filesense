const express = require('express');
const router = express.Router();
const { systemLogger } = require('../utils/logger');
const cacheService = require('../services/cacheService');

/**
 * Quality Rules API Routes
 * Provides CRUD operations for data quality rule definitions
 * Supports 5 rule types: completeness, validity, consistency, uniqueness, freshness
 */

module.exports = (dbPool, authenticate) => {
  const CACHE_TTL = 5 * 60; // 5 minutes
  const CACHE_PREFIX = 'quality_rules';

  /**
   * GET /api/quality-rules
   * Get all quality rules with optional filtering
   * Query params:
   *   - project_id: filter by project
   *   - rule_type: filter by type (completeness, validity, etc.)
   *   - enabled: filter by enabled status (true/false)
   *   - limit: pagination limit (default: 100)
   *   - offset: pagination offset (default: 0)
   */
  router.get('/', authenticate, async (req, res) => {
    try {
      const {
        project_id,
        rule_type,
        enabled,
        limit = 100,
        offset = 0
      } = req.query;

      const cacheKey = `${CACHE_PREFIX}:list:${project_id || 'all'}:${rule_type || 'all'}:${enabled || 'all'}:${limit}:${offset}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Build query with filters
      let query = `
        SELECT 
          qr.*,
          u.username as created_by_username
        FROM quality_rules qr
        LEFT JOIN users u ON qr.created_by = u.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (project_id) {
        query += ` AND (qr.project_id = $${paramIndex} OR qr.project_id IS NULL)`;
        params.push(project_id);
        paramIndex++;
      }

      if (rule_type) {
        query += ` AND qr.rule_type = $${paramIndex}`;
        params.push(rule_type);
        paramIndex++;
      }

      if (enabled !== undefined) {
        query += ` AND qr.enabled = $${paramIndex}`;
        params.push(enabled === 'true');
        paramIndex++;
      }

      query += ` ORDER BY qr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await dbPool.query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM quality_rules WHERE 1=1';
      const countParams = [];
      let countParamIndex = 1;

      if (project_id) {
        countQuery += ` AND (project_id = $${countParamIndex} OR project_id IS NULL)`;
        countParams.push(project_id);
        countParamIndex++;
      }

      if (rule_type) {
        countQuery += ` AND rule_type = $${countParamIndex}`;
        countParams.push(rule_type);
        countParamIndex++;
      }

      if (enabled !== undefined) {
        countQuery += ` AND enabled = $${countParamIndex}`;
        countParams.push(enabled === 'true');
      }

      const countResult = await dbPool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      const response = {
        success: true,
        rules: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total,
          hasMore: parseInt(offset) + result.rows.length < total
        }
      };

      // Cache the response
      await cacheService.set(cacheKey, response, CACHE_TTL);

      res.json(response);
    } catch (error) {
      systemLogger.error('Error fetching quality rules', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch quality rules'
      });
    }
  });

  /**
   * GET /api/quality-rules/:id
   * Get a specific quality rule by ID
   */
  router.get('/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const cacheKey = `${CACHE_PREFIX}:detail:${id}`;

      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const result = await dbPool.query(
        `SELECT 
          qr.*,
          u.username as created_by_username
        FROM quality_rules qr
        LEFT JOIN users u ON qr.created_by = u.id
        WHERE qr.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Quality rule not found'
        });
      }

      const response = {
        success: true,
        rule: result.rows[0]
      };

      // Cache the response
      await cacheService.set(cacheKey, response, CACHE_TTL);

      res.json(response);
    } catch (error) {
      systemLogger.error('Error fetching quality rule', { id: req.params.id, error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch quality rule'
      });
    }
  });

  /**
   * POST /api/quality-rules
   * Create a new quality rule
   * Body: { rule_name, rule_type, description, column_name, rule_config, severity, project_id }
   */
  router.post('/', authenticate, async (req, res) => {
    try {
      const {
        rule_name,
        rule_type,
        description,
        column_name,
        rule_config,
        severity = 'warning',
        project_id
      } = req.body;

      // Validate required fields
      if (!rule_name || !rule_type || !rule_config) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: rule_name, rule_type, rule_config'
        });
      }

      // Validate rule_type
      const validRuleTypes = ['completeness', 'validity', 'consistency', 'uniqueness', 'freshness'];
      if (!validRuleTypes.includes(rule_type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid rule_type. Must be one of: ${validRuleTypes.join(', ')}`
        });
      }

      // Validate severity
      const validSeverities = ['critical', 'error', 'warning'];
      if (!validSeverities.includes(severity)) {
        return res.status(400).json({
          success: false,
          error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`
        });
      }

      const result = await dbPool.query(
        `INSERT INTO quality_rules 
        (rule_name, rule_type, description, column_name, rule_config, severity, project_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [rule_name, rule_type, description, column_name, JSON.stringify(rule_config), severity, project_id, req.user.id]
      );

      // Invalidate cache
      await cacheService.invalidate(`${CACHE_PREFIX}:*`);

      systemLogger.info('Quality rule created', { 
        id: result.rows[0].id,
        rule_name,
        rule_type,
        created_by: req.user.id
      });

      res.status(201).json({
        success: true,
        rule: result.rows[0]
      });
    } catch (error) {
      systemLogger.error('Error creating quality rule', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create quality rule'
      });
    }
  });

  /**
   * PUT /api/quality-rules/:id
   * Update an existing quality rule
   * Body: { rule_name, rule_type, description, column_name, rule_config, severity, enabled }
   */
  router.put('/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        rule_name,
        rule_type,
        description,
        column_name,
        rule_config,
        severity,
        enabled
      } = req.body;

      // Check if rule exists
      const existingRule = await dbPool.query('SELECT * FROM quality_rules WHERE id = $1', [id]);
      if (existingRule.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Quality rule not found'
        });
      }

      // Validate rule_type if provided
      if (rule_type) {
        const validRuleTypes = ['completeness', 'validity', 'consistency', 'uniqueness', 'freshness'];
        if (!validRuleTypes.includes(rule_type)) {
          return res.status(400).json({
            success: false,
            error: `Invalid rule_type. Must be one of: ${validRuleTypes.join(', ')}`
          });
        }
      }

      // Validate severity if provided
      if (severity) {
        const validSeverities = ['critical', 'error', 'warning'];
        if (!validSeverities.includes(severity)) {
          return res.status(400).json({
            success: false,
            error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`
          });
        }
      }

      // Build update query dynamically
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (rule_name !== undefined) {
        updates.push(`rule_name = $${paramIndex}`);
        params.push(rule_name);
        paramIndex++;
      }

      if (rule_type !== undefined) {
        updates.push(`rule_type = $${paramIndex}`);
        params.push(rule_type);
        paramIndex++;
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }

      if (column_name !== undefined) {
        updates.push(`column_name = $${paramIndex}`);
        params.push(column_name);
        paramIndex++;
      }

      if (rule_config !== undefined) {
        updates.push(`rule_config = $${paramIndex}`);
        params.push(JSON.stringify(rule_config));
        paramIndex++;
      }

      if (severity !== undefined) {
        updates.push(`severity = $${paramIndex}`);
        params.push(severity);
        paramIndex++;
      }

      if (enabled !== undefined) {
        updates.push(`enabled = $${paramIndex}`);
        params.push(enabled);
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      // Always update updated_at
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      params.push(id);
      const query = `
        UPDATE quality_rules 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await dbPool.query(query, params);

      // Invalidate cache
      await cacheService.invalidate(`${CACHE_PREFIX}:*`);

      systemLogger.info('Quality rule updated', { 
        id,
        updated_by: req.user.id
      });

      res.json({
        success: true,
        rule: result.rows[0]
      });
    } catch (error) {
      systemLogger.error('Error updating quality rule', { id: req.params.id, error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update quality rule'
      });
    }
  });

  /**
   * DELETE /api/quality-rules/:id
   * Delete a quality rule (also deletes associated violations via CASCADE)
   */
  router.delete('/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;

      // Check if rule exists
      const existingRule = await dbPool.query('SELECT * FROM quality_rules WHERE id = $1', [id]);
      if (existingRule.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Quality rule not found'
        });
      }

      // Delete the rule (CASCADE will delete associated violations)
      await dbPool.query('DELETE FROM quality_rules WHERE id = $1', [id]);

      // Invalidate cache
      await cacheService.invalidate(`${CACHE_PREFIX}:*`);

      systemLogger.info('Quality rule deleted', { 
        id,
        deleted_by: req.user.id
      });

      res.json({
        success: true,
        message: 'Quality rule deleted successfully'
      });
    } catch (error) {
      systemLogger.error('Error deleting quality rule', { id: req.params.id, error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to delete quality rule'
      });
    }
  });

  /**
   * GET /api/quality-rules/violations/summary
   * Get summary statistics of quality rule violations
   * Query params:
   *   - project_id: filter by project
   *   - rule_id: filter by specific rule
   *   - severity: filter by severity
   *   - days: number of days to look back (default: 30)
   */
  router.get('/violations/summary', authenticate, async (req, res) => {
    try {
      const {
        project_id,
        rule_id,
        severity,
        days = 30
      } = req.query;

      const cacheKey = `${CACHE_PREFIX}:violations:summary:${project_id || 'all'}:${rule_id || 'all'}:${severity || 'all'}:${days}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      let query = `
        SELECT 
          COUNT(*) as total_violations,
          qr.rule_type,
          qr.severity,
          COUNT(DISTINCT COALESCE(qrv.file_id, qrv.job_id)) as affected_entities
        FROM quality_rule_violations qrv
        JOIN quality_rules qr ON qrv.rule_id = qr.id
        WHERE qrv.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      `;
      const params = [];
      let paramIndex = 1;

      if (project_id) {
        query += ` AND qr.project_id = $${paramIndex}`;
        params.push(project_id);
        paramIndex++;
      }

      if (rule_id) {
        query += ` AND qrv.rule_id = $${paramIndex}`;
        params.push(rule_id);
        paramIndex++;
      }

      if (severity) {
        query += ` AND qrv.severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }

      query += ` GROUP BY qr.rule_type, qr.severity ORDER BY total_violations DESC`;

      const result = await dbPool.query(query, params);

      const response = {
        success: true,
        summary: result.rows,
        period_days: parseInt(days)
      };

      // Cache the response
      await cacheService.set(cacheKey, response, CACHE_TTL);

      res.json(response);
    } catch (error) {
      systemLogger.error('Error fetching violations summary', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch violations summary'
      });
    }
  });

  return router;
};
