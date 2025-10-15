const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob, getJobStatus, cancelJob } = require('../services/jobExecutionEngine');
const { getMappingRules, saveMappingRules, validateRules } = require('../services/anomalyRulesEngine');
const { findMatchingFiles, countMatchingFiles } = require('../utils/filePatternMatcher');
const { validateSchemaConsistency } = require('../services/schemaService');

/**
 * GET /api/transformations
 * List all transformation mappings
 */
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM transformation_mappings';
    const params = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM transformation_mappings';
    const countParams = [];
    
    if (status) {
      countQuery += ' WHERE status = $1';
      countParams.push(status);
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
router.get('/:id', async (req, res) => {
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
router.post('/', async (req, res) => {
  try {
    systemLogger.info('POST /api/transformations called', { body: req.body });
    
    const {
      mapping_name,
      source_connection_id,
      source_type = 'files',
      file_path = '',
      file_name_pattern,
      source_file_pattern,
      target_connection_id,
      target_table_name,
      field_mappings = [],
      anomaly_rules = null,
      status = 'draft'
    } = req.body;
    
    const actualFilePattern = file_name_pattern || source_file_pattern;
    
    systemLogger.info('Extracted fields', { 
      mapping_name, 
      source_connection_id,
      source_type,
      file_path,
      file_name_pattern: actualFilePattern,
      target_connection_id,
      target_table_name,
      field_mappings_count: field_mappings?.length,
      anomaly_rules_type: typeof anomaly_rules
    });
    
    // Validation
    if (!mapping_name || !source_connection_id || !actualFilePattern) {
      systemLogger.warn('Missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields: mapping_name, source_connection_id, file_name_pattern' 
      });
    }
    
    // Validate source connection exists in transform_connections
    const sourceConnCheck = await pool.query(
      'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
      [source_connection_id]
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
    
    const result = await pool.query(`
      INSERT INTO transformation_mappings (
        mapping_id, mapping_name, source_connection_id, source_type, file_path,
        file_name_pattern, source_file_pattern, target_connection_id, target_table_name, 
        field_mappings, anomaly_rules, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      mappingId, mapping_name, source_connection_id, source_type, file_path,
      actualFilePattern, actualFilePattern, target_connection_id, target_table_name, 
      JSON.stringify(field_mappings), JSON.stringify(anomaly_rules), status, req.user?.id || null
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
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      mapping_name,
      source_connection_id,
      source_type,
      file_path,
      file_name_pattern,
      source_file_pattern,
      target_connection_id,
      target_table_name,
      field_mappings,
      anomaly_rules,
      status
    } = req.body;
    
    const actualFilePattern = file_name_pattern || source_file_pattern;
    
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
    
    // Validate source connection exists (if being updated)
    if (source_connection_id !== undefined) {
      const sourceConnCheck = await pool.query(
        'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
        [source_connection_id]
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
    if (source_connection_id !== undefined) {
      updates.push(`source_connection_id = $${paramIndex}`);
      values.push(source_connection_id);
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
    if (field_mappings !== undefined) {
      updates.push(`field_mappings = $${paramIndex}`);
      values.push(JSON.stringify(field_mappings));
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
router.delete('/:id', async (req, res) => {
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
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      runSchemaValidation = true,
      runProfilingChecks = true,
      dryRun = false
    } = req.body;
    
    const userId = req.user?.id || 'system';
    
    // Execute job asynchronously
    executeTransformationJob(pool, id, userId, {
      runSchemaValidation,
      runProfilingChecks,
      dryRun
    }).catch(error => {
      systemLogger.error('Async job execution error:', error);
    });
    
    // Return immediately with job info
    res.status(202).json({ 
      message: 'Job execution started',
      mappingId: id
    });
    
  } catch (error) {
    systemLogger.error('Error starting job execution:', error);
    res.status(500).json({ error: 'Failed to start job execution' });
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
