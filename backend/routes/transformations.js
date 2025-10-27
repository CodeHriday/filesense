const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob, getJobStatus, cancelJob, createJob, updateJob, logJobExecution } = require('../services/jobExecutionEngine');
const { getMappingRules, saveMappingRules, validateRules } = require('../services/anomalyRulesEngine');
const { findMatchingFiles, countMatchingFiles } = require('../utils/filePatternMatcher');
const { validateSchemaConsistency } = require('../services/schemaService');
const authorizeProjectResource = require('../middleware/authorizeProjectResource');

/**
 * Validate variables array
 * Ensures variable names are valid, unique, and properly sequenced
 */
function validateVariables(variables) {
  if (!Array.isArray(variables)) {
    return { valid: false, errors: ['Variables must be an array'] };
  }
  
  const errors = [];
  const namesSeen = new Set();
  const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
  
  variables.forEach((variable, index) => {
    // Validate name exists and matches pattern
    if (!variable.name) {
      errors.push(`Variable at index ${index} has no name`);
    } else if (!namePattern.test(variable.name)) {
      errors.push(`Variable "${variable.name}" must start with a letter or underscore and contain only letters, numbers, and underscores`);
    } else if (namesSeen.has(variable.name)) {
      errors.push(`Duplicate variable name: "${variable.name}"`);
    } else {
      namesSeen.add(variable.name);
    }
    
    // Add sequence if not present
    if (variable.sequence === undefined) {
      variable.sequence = index;
    }
  });
  
  return { valid: errors.length === 0, errors };
}

/**
 * GET /api/transformations
 * List all transformation mappings (filtered by user's accessible projects)
 */
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    // Get user's accessible projects
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        // User has no project access, return empty list
        return res.json({
          mappings: [],
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
      }
    }
    
    let query = `
      SELECT 
        tm.*,
        sc.name as source_connection_name,
        tc.name as target_connection_name,
        p.name as project_name
      FROM transformation_mappings tm
      LEFT JOIN transform_connections sc ON tm.source_connection_id = sc.id
      LEFT JOIN transform_connections tc ON tm.target_connection_id = tc.id
      LEFT JOIN projects p ON tm.project_id = p.id
    `;
    const params = [];
    const whereClauses = [];
    
    // Filter by project membership (unless admin)
    if (!isAdmin && projectIds.length > 0) {
      whereClauses.push(`tm.project_id = ANY($${params.length + 1})`);
      params.push(projectIds);
    }
    
    if (status) {
      whereClauses.push(`tm.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }
    
    query += ' ORDER BY tm.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count with same filtering
    let countQuery = 'SELECT COUNT(*) FROM transformation_mappings';
    const countParams = [];
    const countWhereClauses = [];
    
    if (!isAdmin && projectIds.length > 0) {
      countWhereClauses.push(`project_id = ANY($${countParams.length + 1})`);
      countParams.push(projectIds);
    }
    
    if (status) {
      countWhereClauses.push(`status = $${countParams.length + 1}`);
      countParams.push(status);
    }
    
    if (countWhereClauses.length > 0) {
      countQuery += ' WHERE ' + countWhereClauses.join(' AND ');
    }
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      mappings: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    systemLogger.error('Error listing transformations:', error);
    res.status(500).json({ error: 'Failed to list transformations' });
  }
});

/**
 * GET /api/transformations/:id
 * Get a specific transformation mapping
 */
router.get('/:id', 
  authorizeProjectResource({
    resourceType: 'transformation',
    requiredPermissions: ['transformation:read']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation mapping not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    systemLogger.error('Error getting transformation:', error);
    res.status(500).json({ error: 'Failed to get transformation' });
  }
});

/**
 * POST /api/transformations
 * Create a new transformation mapping
 */
router.post('/',
  authorizeProjectResource({
    resourceType: 'transformation',
    requiredPermissions: ['transformation:create'],
    getProjectId: async (req) => {
      // For POST, project_id is required - no defaults allowed for security
      if (!req.body.project_id) {
        throw new Error('project_id is required');
      }
      return parseInt(req.body.project_id, 10);
    }
  }),
  async (req, res) => {
    try {
      systemLogger.info('POST /api/transformations called', { body: req.body });
    
    const {
      mapping_name,
      source_connection_id,
      vendor_agreement_id,
      source_type = 'files',
      file_path = '',
      file_name_pattern,
      source_file_pattern,
      target_connection_id,
      target_table_name,
      target_file_name,
      target_file_format = 'csv',
      field_mappings = [],
      variables = [],
      anomaly_rules = null,
      status = 'draft'
    } = req.body;
    
    const actualFilePattern = file_name_pattern || source_file_pattern;
    
    systemLogger.info('Extracted fields', { 
      mapping_name, 
      source_connection_id,
      vendor_agreement_id,
      source_type,
      file_path,
      file_name_pattern: actualFilePattern,
      target_connection_id,
      target_table_name,
      field_mappings_count: field_mappings?.length,
      anomaly_rules_type: typeof anomaly_rules
    });
    
    // Validation - ensure mutual exclusivity
    if (source_connection_id && vendor_agreement_id) {
      systemLogger.warn('Both source_connection_id and vendor_agreement_id provided');
      return res.status(400).json({ 
        error: 'Cannot specify both source_connection_id and vendor_agreement_id. Please select only one.' 
      });
    }
    
    if (!source_connection_id && !vendor_agreement_id) {
      systemLogger.warn('Neither source_connection_id nor vendor_agreement_id provided');
      return res.status(400).json({ 
        error: 'Either source_connection_id or vendor_agreement_id must be provided' 
      });
    }
    
    // Validation
    if (!mapping_name || !actualFilePattern) {
      systemLogger.warn('Missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields: mapping_name, file_name_pattern' 
      });
    }
    
    // Resolve connection from vendor agreement if needed
    let actualSourceConnectionId = source_connection_id;
    if (vendor_agreement_id) {
      const agreementResult = await pool.query(
        'SELECT vendor_connection_id FROM vendor_agreements WHERE id = $1 AND approval_status = $2 AND is_locked = TRUE',
        [vendor_agreement_id, 'fully_approved']
      );
      
      if (agreementResult.rows.length === 0) {
        return res.status(400).json({ 
          error: 'Vendor agreement not found or not approved. Please select an approved and locked vendor agreement.' 
        });
      }
      
      actualSourceConnectionId = agreementResult.rows[0].vendor_connection_id;
      
      if (!actualSourceConnectionId) {
        return res.status(400).json({ 
          error: 'Vendor agreement does not have an associated vendor connection. Please contact your administrator.' 
        });
      }
      
      systemLogger.info('Resolved connection from vendor agreement', { 
        vendor_agreement_id, 
        vendor_connection_id: actualSourceConnectionId 
      });
    }
    
    // Validate source connection exists in transform_connections
    const sourceConnCheck = await pool.query(
      'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
      [actualSourceConnectionId]
    );
    
    if (sourceConnCheck.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Source connection not found. Please select a valid source connection.' 
      });
    }
    
    // Validate target connection exists (if provided)
    if (target_connection_id) {
      const targetConnCheck = await pool.query(
        'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
        [target_connection_id]
      );
      
      if (targetConnCheck.rows.length === 0) {
        return res.status(400).json({ 
          error: 'Target connection not found. Please select a valid target connection.' 
        });
      }
    }
    
    // Validate variables if provided
    if (variables && variables.length > 0) {
      const validation = validateVariables(variables);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid variables', 
          details: validation.errors 
        });
      }
    }
    
    // Validate anomaly rules if provided
    if (anomaly_rules) {
      const validation = validateRules(anomaly_rules);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid anomaly rules', 
          details: validation.errors 
        });
      }
    }
    
    const mappingId = `MAP-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const projectId = req.projectId; // Set by authorization middleware, no fallback allowed
    
    const result = await pool.query(`
      INSERT INTO transformation_mappings (
        mapping_id, mapping_name, source_connection_id, vendor_agreement_id, source_type, file_path,
        file_name_pattern, source_file_pattern, target_connection_id, target_table_name,
        target_file_path, target_file_name, target_file_format,
        field_mappings, variables, anomaly_rules, status, created_by, project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      mappingId, mapping_name, actualSourceConnectionId, vendor_agreement_id, source_type, file_path,
      actualFilePattern, actualFilePattern, target_connection_id, target_table_name,
      req.body.target_file_path, target_file_name, target_file_format,
      JSON.stringify(field_mappings), JSON.stringify(variables), JSON.stringify(anomaly_rules), status, req.user?.id || null, projectId
    ]);
    
    systemLogger.info('Transformation mapping created', { mappingId, mapping_name });
    
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    systemLogger.error('Error creating transformation:', error);
    res.status(500).json({ error: 'Failed to create transformation' });
  }
});

/**
 * PUT /api/transformations/:id
 * Update a transformation mapping
 */
router.put('/:id',
  authorizeProjectResource({
    resourceType: 'transformation',
    requiredPermissions: ['transformation:update']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const {
      mapping_name,
      source_connection_id,
      vendor_agreement_id,
      source_type,
      file_path,
      file_name_pattern,
      source_file_pattern,
      target_connection_id,
      target_table_name,
      target_file_name,
      target_file_format,
      field_mappings,
      variables,
      anomaly_rules,
      status
    } = req.body;
    
    const actualFilePattern = file_name_pattern || source_file_pattern;
    
    // Validate mutual exclusivity if both are being updated
    if (source_connection_id !== undefined && vendor_agreement_id !== undefined) {
      if (source_connection_id && vendor_agreement_id) {
        return res.status(400).json({ 
          error: 'Cannot specify both source_connection_id and vendor_agreement_id. Please select only one.' 
        });
      }
    }
    
    // Validate variables if provided
    if (variables !== undefined && variables.length > 0) {
      const validation = validateVariables(variables);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid variables', 
          details: validation.errors 
        });
      }
    }
    
    // Validate anomaly rules if provided
    if (anomaly_rules) {
      const validation = validateRules(anomaly_rules);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid anomaly rules', 
          details: validation.errors 
        });
      }
    }
    
    // Resolve and validate vendor agreement if provided
    let resolvedSourceConnectionId = source_connection_id;
    if (vendor_agreement_id !== undefined && vendor_agreement_id) {
      const agreementResult = await pool.query(
        'SELECT vendor_connection_id FROM vendor_agreements WHERE id = $1 AND approval_status = $2 AND is_locked = TRUE',
        [vendor_agreement_id, 'fully_approved']
      );
      
      if (agreementResult.rows.length === 0) {
        return res.status(400).json({ 
          error: 'Vendor agreement not found or not approved. Please select an approved and locked vendor agreement.' 
        });
      }
      
      resolvedSourceConnectionId = agreementResult.rows[0].vendor_connection_id;
      
      if (!resolvedSourceConnectionId) {
        return res.status(400).json({ 
          error: 'Vendor agreement does not have an associated vendor connection. Please contact your administrator.' 
        });
      }
      
      systemLogger.info('Resolved connection from vendor agreement for update', { 
        vendor_agreement_id, 
        vendor_connection_id: resolvedSourceConnectionId 
      });
    }
    
    // Validate source connection exists (if being updated)
    if (resolvedSourceConnectionId !== undefined && resolvedSourceConnectionId) {
      const sourceConnCheck = await pool.query(
        'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
        [resolvedSourceConnectionId]
      );
      
      if (sourceConnCheck.rows.length === 0) {
        return res.status(400).json({ 
          error: 'Source connection not found. Please select a valid source connection.' 
        });
      }
    }
    
    // Validate target connection exists (if being updated)
    if (target_connection_id !== undefined) {
      const targetConnCheck = await pool.query(
        'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
        [target_connection_id]
      );
      
      if (targetConnCheck.rows.length === 0) {
        return res.status(400).json({ 
          error: 'Target connection not found. Please select a valid target connection.' 
        });
      }
    }
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (mapping_name !== undefined) {
      updates.push(`mapping_name = $${paramIndex}`);
      values.push(mapping_name);
      paramIndex++;
    }
    if (resolvedSourceConnectionId !== undefined) {
      updates.push(`source_connection_id = $${paramIndex}`);
      values.push(resolvedSourceConnectionId);
      paramIndex++;
    }
    if (vendor_agreement_id !== undefined) {
      updates.push(`vendor_agreement_id = $${paramIndex}`);
      values.push(vendor_agreement_id);
      paramIndex++;
    }
    if (source_type !== undefined) {
      updates.push(`source_type = $${paramIndex}`);
      values.push(source_type);
      paramIndex++;
    }
    if (file_path !== undefined) {
      updates.push(`file_path = $${paramIndex}`);
      values.push(file_path);
      paramIndex++;
    }
    if (actualFilePattern !== undefined) {
      updates.push(`file_name_pattern = $${paramIndex}`);
      values.push(actualFilePattern);
      paramIndex++;
      updates.push(`source_file_pattern = $${paramIndex}`);
      values.push(actualFilePattern);
      paramIndex++;
    }
    if (target_connection_id !== undefined) {
      updates.push(`target_connection_id = $${paramIndex}`);
      values.push(target_connection_id);
      paramIndex++;
    }
    if (target_table_name !== undefined) {
      updates.push(`target_table_name = $${paramIndex}`);
      values.push(target_table_name);
      paramIndex++;
    }
    if (req.body.target_file_path !== undefined) {
      updates.push(`target_file_path = $${paramIndex}`);
      values.push(req.body.target_file_path);
      paramIndex++;
    }
    if (target_file_name !== undefined) {
      updates.push(`target_file_name = $${paramIndex}`);
      values.push(target_file_name);
      paramIndex++;
    }
    if (target_file_format !== undefined) {
      updates.push(`target_file_format = $${paramIndex}`);
      values.push(target_file_format);
      paramIndex++;
    }
    if (field_mappings !== undefined) {
      updates.push(`field_mappings = $${paramIndex}`);
      values.push(JSON.stringify(field_mappings));
      paramIndex++;
    }
    if (variables !== undefined) {
      updates.push(`variables = $${paramIndex}`);
      values.push(JSON.stringify(variables));
      paramIndex++;
    }
    if (anomaly_rules !== undefined) {
      updates.push(`anomaly_rules = $${paramIndex}`);
      values.push(JSON.stringify(anomaly_rules));
      paramIndex++;
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    
    const query = `
      UPDATE transformation_mappings
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE mapping_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation mapping not found' });
    }
    
    systemLogger.info('Transformation mapping updated', { mappingId: id });
    
    res.json(result.rows[0]);
    
  } catch (error) {
    systemLogger.error('Error updating transformation:', error);
    res.status(500).json({ error: 'Failed to update transformation' });
  }
});

/**
 * DELETE /api/transformations/:id
 * Delete a transformation mapping
 */
router.delete('/:id',
  authorizeProjectResource({
    resourceType: 'transformation',
    requiredPermissions: ['transformation:delete']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM transformation_mappings WHERE mapping_id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation mapping not found' });
    }
    
    systemLogger.info('Transformation mapping deleted', { mappingId: id });
    
    res.json({ message: 'Transformation mapping deleted successfully' });
    
  } catch (error) {
    systemLogger.error('Error deleting transformation:', error);
    res.status(500).json({ error: 'Failed to delete transformation' });
  }
});

/**
 * POST /api/transformations/:id/execute
 * Execute a transformation mapping
 */
router.post('/:id/execute',
  authorizeProjectResource({
    resourceType: 'transformation',
    requiredPermissions: ['transformation:execute']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const {
      runSchemaValidation = true,
      runProfilingChecks = true,
      dryRun = false
    } = req.body;
    
    const userId = req.user?.id || 'system';
    
    systemLogger.info('Starting transformation job execution', { mappingId: id, userId });
    
    // Create job record immediately
    const job = await createJob(pool, id, userId);
    
    systemLogger.info('Transformation job created and queued', { jobId: job.job_id, mappingId: id });
    
    // Log job start immediately to ensure it appears in logs
    await logJobExecution(pool, job.job_id, 'info', 'Job queued for execution', { 
      mappingId: id, 
      userId,
      options: { runSchemaValidation, runProfilingChecks, dryRun }
    });
    
    // Start job execution asynchronously in the background with robust error handling
    // Use setImmediate to ensure it runs after response is sent
    setImmediate(() => {
      (async () => {
        try {
          const result = await executeTransformationJob(pool, id, userId, {
            runSchemaValidation,
            runProfilingChecks,
            dryRun,
            existingJob: job
          });
          systemLogger.info('Transformation job completed', { 
            jobId: result.jobId, 
            mappingId: id, 
            status: result.status,
            filesProcessed: result.filesProcessed 
          });
        } catch (error) {
          systemLogger.error('Transformation job failed during execution', { 
            jobId: job.job_id,
            mappingId: id, 
            error: error.message, 
            stack: error.stack 
          });
          
          // Update job status to failed and log error
          try {
            await updateJob(pool, job.job_id, {
              status: 'failed',
              error_message: error.message,
              end_time: new Date()
            });
            await logJobExecution(pool, job.job_id, 'error', `Job execution failed: ${error.message}`, {
              error: error.stack
            });
          } catch (updateError) {
            systemLogger.error('Failed to update job after error', { 
              jobId: job.job_id, 
              updateError: updateError.message 
            });
          }
        }
      })();
    });
    
    // Return job info immediately
    res.status(202).json({ 
      message: 'Job execution started',
      jobId: job.job_id,
      mappingId: id,
      status: 'running'
    });
    
  } catch (error) {
    systemLogger.error('Error starting job execution:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start job execution',
      details: error.stack
    });
  }
});

/**
 * POST /api/transformations/validate-pattern
 * Validate file pattern and check schema consistency (without mapping ID)
 */
router.post('/validate-pattern', async (req, res) => {
  try {
    const { source_file_pattern, source_connection_id } = req.body;
    
    if (!source_file_pattern) {
      return res.status(400).json({ error: 'File pattern is required' });
    }
    
    if (!source_connection_id) {
      return res.status(400).json({ error: 'Connection is required for pattern validation' });
    }
    
    // Validate connection ID is a valid integer
    const connectionId = parseInt(source_connection_id);
    if (isNaN(connectionId) || connectionId <= 0) {
      return res.status(400).json({ 
        error: 'Invalid connection ID. Please select a valid connection.' 
      });
    }
    
    const { listAndFilterFiles } = require('../utils/cloudStorageFileList');
    
    try {
      const cloudFiles = await listAndFilterFiles(pool, connectionId, source_file_pattern);
      
      // Format cloud files to match expected structure
      const matchingFiles = cloudFiles.map(f => ({
        filename: f.filename,
        rowCount: null, // Row count not available from cloud listing
        size: f.size,
        lastModified: f.lastModified,
        source: f.source
      }));
      
      if (matchingFiles.length === 0) {
        return res.json({
          valid: true,
          matchCount: 0,
          message: 'No files match the pattern in the selected connection',
          samples: []
        });
      }
      
      res.json({
        valid: true,
        matchCount: matchingFiles.length,
        message: `Found ${matchingFiles.length} matching file(s)`,
        samples: matchingFiles.slice(0, 10)
      });
    } catch (cloudError) {
      systemLogger.error('Error listing files from cloud storage:', cloudError);
      return res.status(500).json({ 
        error: `Failed to list files from connection: ${cloudError.message}` 
      });
    }
    
  } catch (error) {
    systemLogger.error('Error validating pattern:', error);
    res.status(500).json({ error: 'Failed to validate pattern' });
  }
});

/**
 * POST /api/transformations/extract-schema
 * Extract schema from cloud storage files
 */
router.post('/extract-schema', async (req, res) => {
  try {
    const { source_connection_id, source_type, file_path = '', file_name_pattern, file_pattern } = req.body;
    
    if (!source_connection_id) {
      return res.status(400).json({ error: 'Source connection is required' });
    }
    
    const actualPattern = file_name_pattern || file_pattern;
    if (!actualPattern) {
      return res.status(400).json({ error: 'File name/pattern is required' });
    }
    
    const { extractSchemaFromCloud } = require('../services/schemaService');
    
    // Build full file path pattern: file_path + file_name_pattern
    // Ensure exactly one separator between path and pattern
    let fullPattern;
    if (file_path) {
      const normalizedPath = file_path.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
      fullPattern = normalizedPath ? `${normalizedPath}/${actualPattern}` : actualPattern;
    } else {
      fullPattern = actualPattern;
    }
    
    const schema = await extractSchemaFromCloud(pool, source_connection_id, fullPattern);
    
    res.json({
      schema: schema,
      message: `Extracted schema with ${schema.length} fields`
    });
    
  } catch (error) {
    systemLogger.error('Error extracting schema:', error);
    res.status(500).json({ error: error.message || 'Failed to extract schema' });
  }
});

/**
 * POST /api/transformations/:id/validate-pattern
 * Validate file pattern and check schema consistency (with mapping ID)
 */
router.post('/:id/validate-pattern', async (req, res) => {
  try {
    const { id } = req.params;
    const { filePattern, connectionId } = req.body;
    
    if (!filePattern) {
      return res.status(400).json({ error: 'File pattern is required' });
    }
    
    // Find matching files
    const matchingFiles = await findMatchingFiles(pool, filePattern, { 
      connectionId,
      limit: 10 
    });
    
    if (matchingFiles.length === 0) {
      return res.json({
        valid: true,
        matchCount: 0,
        message: 'No files match the pattern',
        samples: []
      });
    }
    
    // Validate schema consistency
    const fileIds = matchingFiles.map(f => f.file_id);
    const schemaValidation = await validateSchemaConsistency(pool, fileIds);
    
    res.json({
      valid: schemaValidation.isConsistent,
      matchCount: matchingFiles.length,
      message: schemaValidation.message,
      samples: matchingFiles.slice(0, 5).map(f => ({
        fileId: f.file_id,
        filename: f.filename,
        rowCount: f.row_count
      })),
      schemaConsistent: schemaValidation.isConsistent,
      inconsistencies: schemaValidation.inconsistencies || []
    });
    
  } catch (error) {
    systemLogger.error('Error validating pattern:', error);
    res.status(500).json({ error: 'Failed to validate pattern' });
  }
});

module.exports = router;
