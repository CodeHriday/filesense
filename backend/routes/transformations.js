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
    const {
      mapping_name,
      source_connection_id,
      source_file_pattern,
      target_connection_id,
      target_table,
      field_mappings = [],
      anomaly_rules = null,
      status = 'draft'
    } = req.body;
    
    // Validation
    if (!mapping_name || !source_connection_id || !source_file_pattern) {
      return res.status(400).json({ 
        error: 'Missing required fields: mapping_name, source_connection_id, source_file_pattern' 
      });
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
        mapping_id, mapping_name, source_connection_id, source_file_pattern,
        target_connection_id, target_table, field_mappings, anomaly_rules,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      mappingId, mapping_name, source_connection_id, source_file_pattern,
      target_connection_id, target_table, JSON.stringify(field_mappings),
      JSON.stringify(anomaly_rules), status, req.user?.id || 'system'
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
      source_file_pattern,
      target_connection_id,
      target_table,
      field_mappings,
      anomaly_rules,
      status
    } = req.body;
    
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
    if (source_file_pattern !== undefined) {
      updates.push(`source_file_pattern = $${paramIndex}`);
      values.push(source_file_pattern);
      paramIndex++;
    }
    if (target_connection_id !== undefined) {
      updates.push(`target_connection_id = $${paramIndex}`);
      values.push(target_connection_id);
      paramIndex++;
    }
    if (target_table !== undefined) {
      updates.push(`target_table = $${paramIndex}`);
      values.push(target_table);
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
    
    // Find matching files
    const matchingFiles = await findMatchingFiles(pool, source_file_pattern, { 
      connectionId: source_connection_id,
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
