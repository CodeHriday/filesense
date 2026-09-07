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
        sub_project_id,
        rule_type,
        enabled,
        limit = 100,
        offset = 0
      } = req.query;

      const cacheKey = `${CACHE_PREFIX}:list:${project_id || 'all'}:${sub_project_id || 'all'}:${rule_type || 'all'}:${enabled || 'all'}:${limit}:${offset}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Build query with filters
      let query = `
        SELECT 
          qr.*,
          u.username as created_by_username,
          p.name as project_name,
          sp.name as sub_project_name
        FROM quality_rules qr
        LEFT JOIN users u ON qr.created_by = u.id
        LEFT JOIN projects p ON qr.project_id = p.id
        LEFT JOIN projects sp ON qr.sub_project_id = sp.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (project_id && sub_project_id) {
        // If both project and sub-project specified, get rules for both levels
        query += ` AND (
          (qr.project_id = $${paramIndex} AND qr.sub_project_id IS NULL) 
          OR qr.sub_project_id = $${paramIndex + 1}
          OR qr.project_id IS NULL
        )`;
        params.push(project_id, sub_project_id);
        paramIndex += 2;
      } else if (project_id) {
        // Only project specified: get project-level and global rules
        query += ` AND (qr.project_id = $${paramIndex} OR qr.project_id IS NULL)`;
        params.push(project_id);
        paramIndex++;
      } else if (sub_project_id) {
        // Only sub-project specified: get sub-project-level and global rules
        query += ` AND (qr.sub_project_id = $${paramIndex} OR qr.project_id IS NULL)`;
        params.push(sub_project_id);
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

      if (project_id && sub_project_id) {
        countQuery += ` AND (
          (project_id = $${countParamIndex} AND sub_project_id IS NULL) 
          OR sub_project_id = $${countParamIndex + 1}
          OR project_id IS NULL
        )`;
        countParams.push(project_id, sub_project_id);
        countParamIndex += 2;
      } else if (project_id) {
        countQuery += ` AND (project_id = $${countParamIndex} OR project_id IS NULL)`;
        countParams.push(project_id);
        countParamIndex++;
      } else if (sub_project_id) {
        countQuery += ` AND (sub_project_id = $${countParamIndex} OR project_id IS NULL)`;
        countParams.push(sub_project_id);
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
   * GET /api/quality-rules/init-data
   * Batch endpoint for QualityRules page - returns rules, projects, and violations summary
   * Replaces 3 separate API calls: quality-rules, projects, violations/summary
   * Permission-aware: Filters data based on user's project access
   * NOTE: This route MUST be defined before /:id to avoid being matched as an ID
   */
  router.get('/init-data', authenticate, async (req, res) => {
    try {
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const { userHasAdminAccess } = require('../utils/permissionHelpers');
      
      const {
        project_id,
        sub_project_id,
        rule_type,
        enabled,
        limit = 100,
        offset = 0,
        days = 30
      } = req.query;
      
      const isAdmin = userHasAdminAccess(req.user);
      let accessibleProjectIds = [];
      
      if (!isAdmin) {
        const userProjects = await getUserProjects(req.user.id);
        accessibleProjectIds = userProjects.map(p => p.id);
        
        if (accessibleProjectIds.length === 0) {
          return res.json({
            rules: [],
            pagination: { total: 0, limit: parseInt(limit), offset: parseInt(offset), pages: 1 },
            projects: [],
            summary: []
          });
        }
      }
      
      let rulesQuery = `
        SELECT 
          qr.*,
          u.username as created_by_username,
          p.name as project_name,
          sp.name as sub_project_name
        FROM quality_rules qr
        LEFT JOIN users u ON qr.created_by = u.id
        LEFT JOIN projects p ON qr.project_id = p.id
        LEFT JOIN projects sp ON qr.sub_project_id = sp.id
        WHERE 1=1
      `;
      const rulesParams = [];
      let rulesParamIndex = 1;

      if (!isAdmin && accessibleProjectIds.length > 0) {
        rulesQuery += ` AND (qr.project_id = ANY($${rulesParamIndex}) OR qr.project_id IS NULL)`;
        rulesParams.push(accessibleProjectIds);
        rulesParamIndex++;
      }

      if (project_id && sub_project_id) {
        rulesQuery += ` AND (
          (qr.project_id = $${rulesParamIndex} AND qr.sub_project_id IS NULL) 
          OR qr.sub_project_id = $${rulesParamIndex + 1}
          OR qr.project_id IS NULL
        )`;
        rulesParams.push(project_id, sub_project_id);
        rulesParamIndex += 2;
      } else if (project_id) {
        rulesQuery += ` AND (qr.project_id = $${rulesParamIndex} OR qr.project_id IS NULL)`;
        rulesParams.push(project_id);
        rulesParamIndex++;
      } else if (sub_project_id) {
        rulesQuery += ` AND (qr.sub_project_id = $${rulesParamIndex} OR qr.project_id IS NULL)`;
        rulesParams.push(sub_project_id);
        rulesParamIndex++;
      }

      if (rule_type) {
        rulesQuery += ` AND qr.rule_type = $${rulesParamIndex}`;
        rulesParams.push(rule_type);
        rulesParamIndex++;
      }

      if (enabled !== undefined && enabled !== '') {
        rulesQuery += ` AND qr.enabled = $${rulesParamIndex}`;
        rulesParams.push(enabled === 'true');
        rulesParamIndex++;
      }

      rulesQuery += ` ORDER BY qr.created_at DESC LIMIT $${rulesParamIndex} OFFSET $${rulesParamIndex + 1}`;
      rulesParams.push(parseInt(limit), parseInt(offset));
      
      let countQuery = 'SELECT COUNT(*) FROM quality_rules WHERE 1=1';
      const countParams = [...rulesParams.slice(0, -2)];
      
      let projectsQuery = `
        SELECT id, name, description, project_type, parent_id, created_at
        FROM projects
        WHERE 1=1
      `;
      const projectsParams = [];
      
      if (!isAdmin && accessibleProjectIds.length > 0) {
        projectsQuery += ` AND id = ANY($1)`;
        projectsParams.push(accessibleProjectIds);
      }
      projectsQuery += ` ORDER BY name`;
      
      let summaryQuery;
      let summaryParams;
      
      if (!isAdmin && accessibleProjectIds.length > 0) {
        summaryQuery = `
          SELECT 
            qr.id as rule_id,
            qr.rule_name as rule_name,
            qr.rule_type,
            COUNT(qrv.id) as total_violations
          FROM quality_rules qr
          LEFT JOIN quality_rule_violations qrv ON qr.id = qrv.rule_id
            AND qrv.created_at >= NOW() - INTERVAL '1 day' * $1
          WHERE qr.project_id = ANY($2) OR qr.project_id IS NULL
          GROUP BY qr.id, qr.rule_name, qr.rule_type
          ORDER BY total_violations DESC
          LIMIT 50
        `;
        summaryParams = [parseInt(days), accessibleProjectIds];
      } else {
        summaryQuery = `
          SELECT 
            qr.id as rule_id,
            qr.rule_name as rule_name,
            qr.rule_type,
            COUNT(qrv.id) as total_violations
          FROM quality_rules qr
          LEFT JOIN quality_rule_violations qrv ON qr.id = qrv.rule_id
            AND qrv.created_at >= NOW() - INTERVAL '1 day' * $1
          GROUP BY qr.id, qr.rule_name, qr.rule_type
          ORDER BY total_violations DESC
          LIMIT 50
        `;
        summaryParams = [parseInt(days)];
      }

      const [rulesResult, countResult, projectsResult, summaryResult] = await Promise.all([
        dbPool.query(rulesQuery, rulesParams),
        dbPool.query(countQuery.replace('SELECT COUNT(*) FROM quality_rules WHERE 1=1', 
          `SELECT COUNT(*) FROM quality_rules qr WHERE 1=1 ${rulesQuery.split('WHERE 1=1')[1].split('ORDER BY')[0]}`), 
          countParams.length > 0 ? countParams : undefined),
        dbPool.query(projectsQuery, projectsParams.length > 0 ? projectsParams : undefined),
        dbPool.query(summaryQuery, summaryParams)
      ]);
      
      const total = parseInt(countResult.rows[0]?.count || rulesResult.rows.length);

      res.json({
        rules: rulesResult.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / parseInt(limit))
        },
        projects: projectsResult.rows,
        summary: summaryResult.rows
      });
    } catch (error) {
      systemLogger.error('Error in GET /api/quality-rules/init-data', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch quality rules data'
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
        project_id,
        sub_project_id
      } = req.body;

      // Validate required fields
      if (!rule_name || !rule_type || !rule_config) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: rule_name, rule_type, rule_config'
        });
      }

      // Validate rule_type
      const validRuleTypes = ['completeness', 'validity', 'consistency', 'uniqueness', 'freshness', 'record_count', 'validity_check', 'length_check', 'range_check', 'date_format', 'timestamp_format'];
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
        (rule_name, rule_type, description, column_name, rule_config, severity, project_id, sub_project_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [rule_name, rule_type, description, column_name, JSON.stringify(rule_config), severity, project_id, sub_project_id, req.user.id]
      );

      // Invalidate cache
      await cacheService.delPattern(`${CACHE_PREFIX}:*`);

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
        enabled,
        project_id,
        sub_project_id
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
        const validRuleTypes = ['completeness', 'validity', 'consistency', 'uniqueness', 'freshness', 'record_count', 'validity_check', 'length_check', 'range_check', 'date_format', 'timestamp_format'];
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

      if (project_id !== undefined) {
        updates.push(`project_id = $${paramIndex}`);
        params.push(project_id);
        paramIndex++;
      }

      if (sub_project_id !== undefined) {
        updates.push(`sub_project_id = $${paramIndex}`);
        params.push(sub_project_id);
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
      await cacheService.delPattern(`${CACHE_PREFIX}:*`);

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
      await cacheService.delPattern(`${CACHE_PREFIX}:*`);

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

  /**
   * GET /api/quality-rules/configurations
   * Get quality rule configurations (error handling strategies)
   * Query params:
   *   - file_id: filter by file
   *   - rule_id: filter by rule
   *   - enabled: filter by enabled status
   */
  router.get('/configurations', authenticate, async (req, res) => {
    try {
      const { file_id, rule_id, enabled } = req.query;

      let query = `
        SELECT 
          qrc.*,
          qr.rule_name,
          qr.rule_type,
          qr.description as rule_description,
          u.username as created_by_username
        FROM quality_rule_configurations qrc
        LEFT JOIN quality_rules qr ON qrc.rule_id = qr.id
        LEFT JOIN users u ON qrc.created_by = u.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (file_id) {
        query += ` AND qrc.file_id = $${paramIndex}`;
        params.push(file_id);
        paramIndex++;
      }

      if (rule_id) {
        query += ` AND qrc.rule_id = $${paramIndex}`;
        params.push(parseInt(rule_id));
        paramIndex++;
      }

      if (enabled !== undefined) {
        query += ` AND qrc.enabled = $${paramIndex}`;
        params.push(enabled === 'true');
        paramIndex++;
      }

      query += ` ORDER BY qrc.created_at DESC`;

      const result = await dbPool.query(query, params);

      res.json({
        success: true,
        configurations: result.rows,
        total: result.rows.length
      });
    } catch (error) {
      systemLogger.error('Error fetching quality rule configurations', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch quality rule configurations'
      });
    }
  });

  /**
   * POST /api/quality-rules/configurations
   * Create or update quality rule configuration
   * Body:
   *   - file_id: file identifier
   *   - rule_id: quality rule ID
   *   - error_action: 'log_continue' or 'log_abort'
   *   - apply_to: 'file_upload', 'etl_job', or 'both' (default: 'both')
   *   - enabled: boolean (default: true)
   */
  router.post('/configurations', authenticate, async (req, res) => {
    try {
      const { file_id, rule_id, error_action, apply_to = 'both', enabled = true } = req.body;
      const user_id = req.user?.id;

      // Validation
      if (!file_id || !rule_id) {
        return res.status(400).json({
          success: false,
          error: 'file_id and rule_id are required'
        });
      }

      if (!['log_continue', 'log_abort'].includes(error_action)) {
        return res.status(400).json({
          success: false,
          error: 'error_action must be either "log_continue" or "log_abort"'
        });
      }

      if (!['file_upload', 'etl_job', 'both'].includes(apply_to)) {
        return res.status(400).json({
          success: false,
          error: 'apply_to must be "file_upload", "etl_job", or "both"'
        });
      }

      // Verify rule exists
      const ruleCheck = await dbPool.query(
        'SELECT id FROM quality_rules WHERE id = $1',
        [rule_id]
      );

      if (ruleCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Quality rule not found'
        });
      }

      // Insert or update configuration (upsert)
      const query = `
        INSERT INTO quality_rule_configurations 
          (file_id, rule_id, error_action, apply_to, enabled, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (file_id, rule_id) 
        DO UPDATE SET
          error_action = EXCLUDED.error_action,
          apply_to = EXCLUDED.apply_to,
          enabled = EXCLUDED.enabled,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await dbPool.query(query, [
        file_id,
        rule_id,
        error_action,
        apply_to,
        enabled,
        user_id
      ]);

      // Invalidate cache for affected files and rules
      await cacheService.delPattern(`${CACHE_PREFIX}:*`);

      res.status(201).json({
        success: true,
        configuration: result.rows[0],
        message: 'Quality rule configuration saved successfully'
      });
    } catch (error) {
      systemLogger.error('Error saving quality rule configuration', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to save quality rule configuration'
      });
    }
  });

  /**
   * DELETE /api/quality-rules/configurations/:id
   * Delete a quality rule configuration
   */
  router.delete('/configurations/:id', authenticate, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await dbPool.query(
        'DELETE FROM quality_rule_configurations WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Configuration not found'
        });
      }

      // Invalidate cache
      await cacheService.invalidatePattern(`${CACHE_PREFIX}:*`);

      res.json({
        success: true,
        message: 'Configuration deleted successfully'
      });
    } catch (error) {
      systemLogger.error('Error deleting quality rule configuration', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to delete configuration'
      });
    }
  });

  return router;
};
