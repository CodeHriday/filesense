const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../src/middleware/authenticate');
const authorize = require('../middleware/authorize');
const createAuditMiddleware = require('../middleware/auditMiddleware');

// Helper middleware for common permission checks
const requirePermission = (permission) => authorize(permission);

module.exports = (dbPool, logger, auditService, retentionWorker) => {
  
  // ============================================================================
  // GET /api/retention-policies - List all retention policies
  // ============================================================================
  router.get('/', 
    authenticateToken, 
    requirePermission('settings:read'),
    async (req, res) => {
      try {
        const { enabled, storage_type } = req.query;
        
        let query = `
          SELECT 
            rp.*,
            u.username as created_by_name,
            COUNT(af.id) as archived_files_count,
            SUM(af.original_size_bytes) as total_bytes_archived
          FROM retention_policies rp
          LEFT JOIN users u ON rp.created_by = u.id
          LEFT JOIN archived_files af ON rp.id = af.policy_id AND af.is_deleted = false
          WHERE 1=1
        `;
        
        const params = [];
        
        if (enabled !== undefined) {
          params.push(enabled === 'true');
          query += ` AND rp.enabled = $${params.length}`;
        }
        
        if (storage_type) {
          params.push(storage_type);
          query += ` AND rp.archive_storage_type = $${params.length}`;
        }
        
        query += `
          GROUP BY rp.id, u.username
          ORDER BY rp.priority ASC, rp.name ASC
        `;
        
        const result = await dbPool.query(query, params);
        
        res.json({
          success: true,
          policies: result.rows,
          count: result.rows.length
        });
        
      } catch (error) {
        logger.error('Error fetching retention policies', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch retention policies'
        });
      }
    }
  );

  // ============================================================================
  // GET /api/retention-policies/:id - Get specific retention policy
  // ============================================================================
  router.get('/:id',
    authenticateToken,
    requirePermission('settings:read'),
    async (req, res) => {
      try {
        const { id } = req.params;
        
        const result = await dbPool.query(`
          SELECT 
            rp.*,
            u.username as created_by_name,
            u2.username as updated_by_name
          FROM retention_policies rp
          LEFT JOIN users u ON rp.created_by = u.id
          LEFT JOIN users u2 ON rp.updated_by = u2.id
          WHERE rp.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Retention policy not found'
          });
        }
        
        // Get policy execution stats
        const statsResult = await dbPool.query(`
          SELECT 
            COUNT(*) as total_runs,
            SUM(files_archived) as total_files_archived,
            SUM(total_bytes_archived) as total_bytes_archived,
            MAX(completed_at) as last_successful_run
          FROM retention_policy_runs
          WHERE policy_id = $1 AND status = 'completed'
        `, [id]);
        
        const policy = {
          ...result.rows[0],
          stats: statsResult.rows[0]
        };
        
        res.json({
          success: true,
          policy
        });
        
      } catch (error) {
        logger.error('Error fetching retention policy', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch retention policy'
        });
      }
    }
  );

  // ============================================================================
  // POST /api/retention-policies - Create new retention policy
  // ============================================================================
  router.post('/',
    authenticateToken,
    requirePermission('settings:write'),
    createAuditMiddleware(auditService, 'retention_policy', 'create'),
    async (req, res) => {
      try {
        const {
          name,
          description,
          enabled = true,
          retention_days,
          min_quality_score,
          max_file_size_mb,
          file_types,
          tags,
          access_pattern,
          custom_condition,
          archive_storage_type,
          archive_connection_id,
          archive_path_prefix,
          priority = 50,
          run_frequency = 'daily'
        } = req.body;
        
        // Validation
        if (!name || !archive_storage_type) {
          return res.status(400).json({
            success: false,
            error: 'Name and archive storage type are required'
          });
        }
        
        // Calculate next run time based on frequency
        let next_run_at = new Date();
        if (run_frequency === 'daily') {
          next_run_at.setDate(next_run_at.getDate() + 1);
        } else if (run_frequency === 'weekly') {
          next_run_at.setDate(next_run_at.getDate() + 7);
        } else if (run_frequency === 'monthly') {
          next_run_at.setMonth(next_run_at.getMonth() + 1);
        }
        
        const result = await dbPool.query(`
          INSERT INTO retention_policies (
            name, description, enabled, retention_days, min_quality_score,
            max_file_size_mb, file_types, tags, access_pattern, custom_condition,
            archive_storage_type, archive_connection_id, archive_path_prefix,
            priority, run_frequency, next_run_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING *
        `, [
          name, description, enabled, retention_days, min_quality_score,
          max_file_size_mb, file_types, tags, access_pattern, custom_condition,
          archive_storage_type, archive_connection_id, archive_path_prefix,
          priority, run_frequency, next_run_at, req.user.id
        ]);
        
        logger.info('Retention policy created', {
          policy_id: result.rows[0].id,
          name: result.rows[0].name,
          created_by: req.user.username
        });
        
        res.status(201).json({
          success: true,
          policy: result.rows[0],
          message: 'Retention policy created successfully'
        });
        
      } catch (error) {
        logger.error('Error creating retention policy', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to create retention policy'
        });
      }
    }
  );

  // ============================================================================
  // PUT /api/retention-policies/:id - Update retention policy
  // ============================================================================
  router.put('/:id',
    authenticateToken,
    requirePermission('settings:write'),
    createAuditMiddleware(auditService, 'retention_policy', 'update'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const {
          name,
          description,
          enabled,
          retention_days,
          min_quality_score,
          max_file_size_mb,
          file_types,
          tags,
          access_pattern,
          custom_condition,
          archive_storage_type,
          archive_connection_id,
          archive_path_prefix,
          priority,
          run_frequency
        } = req.body;
        
        const result = await dbPool.query(`
          UPDATE retention_policies
          SET 
            name = COALESCE($1, name),
            description = COALESCE($2, description),
            enabled = COALESCE($3, enabled),
            retention_days = COALESCE($4, retention_days),
            min_quality_score = COALESCE($5, min_quality_score),
            max_file_size_mb = COALESCE($6, max_file_size_mb),
            file_types = COALESCE($7, file_types),
            tags = COALESCE($8, tags),
            access_pattern = COALESCE($9, access_pattern),
            custom_condition = COALESCE($10, custom_condition),
            archive_storage_type = COALESCE($11, archive_storage_type),
            archive_connection_id = COALESCE($12, archive_connection_id),
            archive_path_prefix = COALESCE($13, archive_path_prefix),
            priority = COALESCE($14, priority),
            run_frequency = COALESCE($15, run_frequency),
            updated_by = $16
          WHERE id = $17
          RETURNING *
        `, [
          name, description, enabled, retention_days, min_quality_score,
          max_file_size_mb, file_types, tags, access_pattern, custom_condition,
          archive_storage_type, archive_connection_id, archive_path_prefix,
          priority, run_frequency, req.user.id, id
        ]);
        
        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Retention policy not found'
          });
        }
        
        logger.info('Retention policy updated', {
          policy_id: id,
          updated_by: req.user.username
        });
        
        res.json({
          success: true,
          policy: result.rows[0],
          message: 'Retention policy updated successfully'
        });
        
      } catch (error) {
        logger.error('Error updating retention policy', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to update retention policy'
        });
      }
    }
  );

  // ============================================================================
  // DELETE /api/retention-policies/:id - Delete retention policy
  // ============================================================================
  router.delete('/:id',
    authenticateToken,
    requirePermission('settings:write'),
    createAuditMiddleware(auditService, 'retention_policy', 'delete'),
    async (req, res) => {
      try {
        const { id } = req.params;
        
        // Check if policy has archived files
        const archiveCheck = await dbPool.query(`
          SELECT COUNT(*) as count
          FROM archived_files
          WHERE policy_id = $1 AND is_deleted = false
        `, [id]);
        
        if (parseInt(archiveCheck.rows[0].count) > 0) {
          return res.status(400).json({
            success: false,
            error: 'Cannot delete policy with active archived files. Please restore or permanently delete archived files first.'
          });
        }
        
        const result = await dbPool.query(`
          DELETE FROM retention_policies
          WHERE id = $1
          RETURNING *
        `, [id]);
        
        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Retention policy not found'
          });
        }
        
        logger.info('Retention policy deleted', {
          policy_id: id,
          deleted_by: req.user.username
        });
        
        res.json({
          success: true,
          message: 'Retention policy deleted successfully'
        });
        
      } catch (error) {
        logger.error('Error deleting retention policy', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to delete retention policy'
        });
      }
    }
  );

  // ============================================================================
  // POST /api/retention-policies/:id/execute - Manually execute a policy
  // ============================================================================
  router.post('/:id/execute',
    authenticateToken,
    requirePermission('settings:write'),
    async (req, res) => {
      try {
        const { id } = req.params;
        
        // Check if policy exists and is enabled
        const policyResult = await dbPool.query(`
          SELECT * FROM retention_policies WHERE id = $1
        `, [id]);
        
        if (policyResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Retention policy not found'
          });
        }
        
        const policy = policyResult.rows[0];
        
        if (!policy.enabled) {
          return res.status(400).json({
            success: false,
            error: 'Cannot execute disabled policy'
          });
        }
        
        logger.info('Manual retention policy execution started', {
          policy_id: id,
          policy_name: policy.name,
          executed_by: req.user.username
        });
        
        // Execute retention policy using the worker
        const result = await retentionWorker.executeManually(parseInt(id));
        
        logger.info('Retention policy execution completed', {
          policy_id: id,
          policy_name: policy.name,
          result
        });
        
        res.json({
          success: true,
          message: 'Retention policy executed successfully',
          filesEvaluated: result.filesEvaluated,
          filesMarkedForArchival: result.filesMarkedForArchival,
          bytesArchived: result.bytesArchived,
          duration_ms: result.duration_ms
        });
        
      } catch (error) {
        logger.error('Error executing retention policy', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to execute retention policy'
        });
      }
    }
  );

  // ============================================================================
  // GET /api/retention-policies/:id/runs - Get policy execution history
  // ============================================================================
  router.get('/:id/runs',
    authenticateToken,
    requirePermission('settings:read'),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        const result = await dbPool.query(`
          SELECT 
            rpr.*,
            u.username as executed_by_name
          FROM retention_policy_runs rpr
          LEFT JOIN users u ON rpr.executed_by = u.id
          WHERE rpr.policy_id = $1
          ORDER BY rpr.started_at DESC
          LIMIT $2 OFFSET $3
        `, [id, limit, offset]);
        
        const countResult = await dbPool.query(`
          SELECT COUNT(*) as total
          FROM retention_policy_runs
          WHERE policy_id = $1
        `, [id]);
        
        res.json({
          success: true,
          runs: result.rows,
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
        
      } catch (error) {
        logger.error('Error fetching policy runs', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch policy execution history'
        });
      }
    }
  );

  // ============================================================================
  // GET /api/retention-policies/archives - Get all archived files
  // ============================================================================
  router.get('/archives/list',
    authenticateToken,
    requirePermission('settings:read'),
    async (req, res) => {
      try {
        const { policy_id, status, start_date, end_date, limit = 100, offset = 0 } = req.query;
        
        let query = `
          SELECT 
            af.*,
            rp.name as policy_name,
            rp.description as policy_description,
            f.filename as original_filename,
            f.file_type,
            f.file_size as original_file_size,
            u.email as archived_by_email
          FROM archived_files af
          LEFT JOIN retention_policies rp ON af.policy_id = rp.id
          LEFT JOIN files f ON af.file_id = f.file_id
          LEFT JOIN users u ON af.archived_by = u.id
          WHERE af.is_deleted = false
        `;
        
        const params = [];
        let paramCounter = 1;

        if (policy_id) {
          params.push(policy_id);
          query += ` AND af.policy_id = $${paramCounter}`;
          paramCounter++;
        }

        if (status) {
          params.push(status);
          query += ` AND af.archive_status = $${paramCounter}`;
          paramCounter++;
        }

        if (start_date) {
          params.push(start_date);
          query += ` AND af.archived_at >= $${paramCounter}::timestamptz`;
          paramCounter++;
        }

        if (end_date) {
          params.push(end_date);
          query += ` AND af.archived_at <= $${paramCounter}::timestamptz`;
          paramCounter++;
        }

        query += ` ORDER BY af.archived_at DESC`;
        
        // Add pagination
        params.push(parseInt(limit), parseInt(offset));
        query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;

        const result = await dbPool.query(query, params);

        // Get total count
        let countQuery = `
          SELECT COUNT(*) as total
          FROM archived_files af
          WHERE af.is_deleted = false
        `;
        
        const countParams = [];
        let countParamCounter = 1;
        
        if (policy_id) {
          countParams.push(policy_id);
          countQuery += ` AND af.policy_id = $${countParamCounter}`;
          countParamCounter++;
        }

        if (status) {
          countParams.push(status);
          countQuery += ` AND af.archive_status = $${countParamCounter}`;
          countParamCounter++;
        }

        if (start_date) {
          countParams.push(start_date);
          countQuery += ` AND af.archived_at >= $${countParamCounter}::timestamptz`;
          countParamCounter++;
        }

        if (end_date) {
          countParams.push(end_date);
          countQuery += ` AND af.archived_at <= $${countParamCounter}::timestamptz`;
          countParamCounter++;
        }

        const countResult = await dbPool.query(countQuery, countParams);

        res.json({
          success: true,
          archives: result.rows,
          pagination: {
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].total)
          }
        });
      } catch (error) {
        logger.error('Error fetching archived files', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch archived files'
        });
      }
    }
  );

  // ============================================================================
  // GET /api/retention-policies/restorations - Get file restoration history
  // ============================================================================
  router.get('/restorations/history',
    authenticateToken,
    requirePermission('settings:read'),
    async (req, res) => {
      try {
        const { status, start_date, end_date, limit = 50, offset = 0 } = req.query;
        
        let query = `
          SELECT 
            fr.*,
            af.filename as archived_filename,
            af.archive_path,
            rp.name as policy_name,
            u.email as restored_by_email
          FROM file_restorations fr
          LEFT JOIN archived_files af ON fr.archived_file_id = af.id
          LEFT JOIN retention_policies rp ON af.policy_id = rp.id
          LEFT JOIN users u ON fr.restored_by = u.id
          WHERE 1=1
        `;
        
        const params = [];
        let paramCounter = 1;

        if (status) {
          params.push(status);
          query += ` AND fr.restoration_status = $${paramCounter}`;
          paramCounter++;
        }

        if (start_date) {
          params.push(start_date);
          query += ` AND fr.requested_at >= $${paramCounter}::timestamptz`;
          paramCounter++;
        }

        if (end_date) {
          params.push(end_date);
          query += ` AND fr.requested_at <= $${paramCounter}::timestamptz`;
          paramCounter++;
        }

        query += ` ORDER BY fr.requested_at DESC`;
        
        // Add pagination
        params.push(parseInt(limit), parseInt(offset));
        query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;

        const result = await dbPool.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM file_restorations WHERE 1=1`;
        const countParams = [];
        let countParamCounter = 1;
        
        if (status) {
          countParams.push(status);
          countQuery += ` AND restoration_status = $${countParamCounter}`;
          countParamCounter++;
        }

        if (start_date) {
          countParams.push(start_date);
          countQuery += ` AND requested_at >= $${countParamCounter}::timestamptz`;
          countParamCounter++;
        }

        if (end_date) {
          countParams.push(end_date);
          countQuery += ` AND requested_at <= $${countParamCounter}::timestamptz`;
          countParamCounter++;
        }

        const countResult = await dbPool.query(countQuery, countParams);

        res.json({
          success: true,
          restorations: result.rows,
          pagination: {
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].total)
          }
        });
      } catch (error) {
        logger.error('Error fetching file restorations', { error: error.message, stack: error.stack });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch restoration history'
        });
      }
    }
  );

  return router;
};
