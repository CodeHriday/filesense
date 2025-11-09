/**
 * Vendor Agreement File Schema Routes
 * Routes for managing multiple file patterns and schemas per vendor agreement
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { requirePermission } = require('../middleware/vendorPermissions');
const { matchesPattern } = require('../utils/filePatternMatcher');

/**
 * GET /api/vendor-agreements/:agreementId/file-schemas
 * List all file schemas for a vendor agreement
 */
router.get('/:agreementId/file-schemas', requirePermission('vendor_agreements:read'), async (req, res) => {
  try {
    const { agreementId } = req.params;
    const { includeInactive } = req.query;
    
    let query = `
      SELECT 
        vafs.*,
        u1.username as created_by_name,
        u2.username as updated_by_name
      FROM vendor_agreement_file_schemas vafs
      LEFT JOIN users u1 ON vafs.created_by = u1.id
      LEFT JOIN users u2 ON vafs.updated_by = u2.id
      WHERE vafs.vendor_agreement_id = $1
    `;
    
    const params = [agreementId];
    
    // Filter by active status unless explicitly requesting inactive
    if (includeInactive !== 'true') {
      query += ' AND vafs.is_active = TRUE';
    }
    
    query += ' ORDER BY vafs.priority ASC, vafs.id ASC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      fileSchemas: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    systemLogger.error('Error fetching file schemas', { error: error.message, agreementId: req.params.agreementId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch file schemas',
      details: error.message
    });
  }
});

/**
 * GET /api/vendor-agreements/:agreementId/file-schemas/:schemaId
 * Get a specific file schema by ID
 */
router.get('/:agreementId/file-schemas/:schemaId', requirePermission('vendor_agreements:read'), async (req, res) => {
  try {
    const { agreementId, schemaId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        vafs.*,
        u1.username as created_by_name,
        u2.username as updated_by_name
       FROM vendor_agreement_file_schemas vafs
       LEFT JOIN users u1 ON vafs.created_by = u1.id
       LEFT JOIN users u2 ON vafs.updated_by = u2.id
       WHERE vafs.id = $1 AND vafs.vendor_agreement_id = $2`,
      [schemaId, agreementId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'File schema not found'
      });
    }
    
    res.json({
      success: true,
      fileSchema: result.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error fetching file schema', { error: error.message, schemaId: req.params.schemaId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch file schema',
      details: error.message
    });
  }
});

/**
 * POST /api/vendor-agreements/:agreementId/file-schemas
 * Create a new file schema for a vendor agreement
 */
router.post('/:agreementId/file-schemas', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const { agreementId } = req.params;
    const { 
      file_name_pattern, 
      file_description, 
      schema, 
      priority = 0,
      is_active = true,
      contains_pii = false,
      data_classification = null,
      file_type = null,
      quality_rule_ids = [],
      column_metadata = {}
    } = req.body;
    
    // Validate required fields
    if (!file_name_pattern) {
      return res.status(400).json({
        success: false,
        error: 'file_name_pattern is required'
      });
    }
    
    if (!schema || !Array.isArray(schema) || schema.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'schema is required and must be a non-empty array'
      });
    }
    
    // Validate schema structure
    for (const col of schema) {
      if (!col.column_name || !col.data_type) {
        return res.status(400).json({
          success: false,
          error: 'Each schema column must have column_name and data_type'
        });
      }
    }
    
    // Validate data_classification if provided
    const validClassifications = ['Public', 'Internal', 'Confidential', 'Highly Confidential'];
    if (data_classification && !validClassifications.includes(data_classification)) {
      return res.status(400).json({
        success: false,
        error: `Invalid data_classification. Must be one of: ${validClassifications.join(', ')}`
      });
    }
    
    // Validate file_type if provided
    const validFileTypes = ['csv', 'json', 'xml', 'xlsx', 'parquet'];
    if (file_type && !validFileTypes.includes(file_type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid file_type. Must be one of: ${validFileTypes.join(', ')}`
      });
    }
    
    // Verify vendor agreement exists
    const agreementCheck = await pool.query(
      'SELECT id FROM vendor_agreements WHERE id = $1',
      [agreementId]
    );
    
    if (agreementCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Vendor agreement not found'
      });
    }
    
    // Insert file schema
    const result = await pool.query(
      `INSERT INTO vendor_agreement_file_schemas (
        vendor_agreement_id,
        file_name_pattern,
        file_description,
        schema,
        priority,
        is_active,
        contains_pii,
        data_classification,
        file_type,
        quality_rule_ids,
        column_metadata,
        created_by,
        updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        agreementId,
        file_name_pattern,
        file_description,
        JSON.stringify(schema),
        priority,
        is_active,
        contains_pii,
        data_classification,
        file_type,
        JSON.stringify(quality_rule_ids),
        JSON.stringify(column_metadata),
        req.user.id,
        req.user.id
      ]
    );
    
    systemLogger.info('File schema created', { 
      schemaId: result.rows[0].id, 
      agreementId,
      pattern: file_name_pattern,
      userId: req.user.id 
    });
    
    res.status(201).json({
      success: true,
      fileSchema: result.rows[0],
      message: 'File schema created successfully'
    });
    
  } catch (error) {
    systemLogger.error('Error creating file schema', { error: error.message, agreementId: req.params.agreementId });
    res.status(500).json({
      success: false,
      error: 'Failed to create file schema',
      details: error.message
    });
  }
});

/**
 * PUT /api/vendor-agreements/:agreementId/file-schemas
 * Bulk replace all file schemas for an agreement (atomic operation)
 * Deletes all existing schemas and creates new ones in a single transaction
 */
router.put('/:agreementId/file-schemas', requirePermission('vendor_agreements:write'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { agreementId } = req.params;
    const { fileSchemas } = req.body;
    
    if (!Array.isArray(fileSchemas)) {
      return res.status(400).json({
        success: false,
        error: 'fileSchemas must be an array'
      });
    }
    
    // Verify vendor agreement exists
    const agreementCheck = await client.query(
      'SELECT id FROM vendor_agreements WHERE id = $1',
      [agreementId]
    );
    
    if (agreementCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Vendor agreement not found'
      });
    }
    
    await client.query('BEGIN');
    
    // Delete all existing file schemas for this agreement
    await client.query(
      'DELETE FROM vendor_agreement_file_schemas WHERE vendor_agreement_id = $1',
      [agreementId]
    );
    
    systemLogger.info('Deleted existing file schemas', { agreementId, userId: req.user.id });
    
    // Insert new file schemas
    const createdSchemas = [];
    for (const schema of fileSchemas) {
      const {
        file_name_pattern,
        file_description,
        schema: schemaDefinition,
        priority = 0,
        is_active = true,
        contains_pii = false,
        data_classification = null,
        file_type = null,
        quality_rule_ids = [],
        column_metadata = {}
      } = schema;
      
      // Validate required fields
      if (!file_name_pattern) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Each file schema must have a file_name_pattern'
        });
      }
      
      if (!schemaDefinition || !Array.isArray(schemaDefinition) || schemaDefinition.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Each file schema must have a valid schema definition array'
        });
      }
      
      const result = await client.query(
        `INSERT INTO vendor_agreement_file_schemas (
          vendor_agreement_id,
          file_name_pattern,
          file_description,
          schema,
          priority,
          is_active,
          contains_pii,
          data_classification,
          file_type,
          quality_rule_ids,
          column_metadata,
          created_by,
          updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          agreementId,
          file_name_pattern,
          file_description,
          JSON.stringify(schemaDefinition),
          priority,
          is_active,
          contains_pii,
          data_classification,
          file_type,
          JSON.stringify(quality_rule_ids),
          JSON.stringify(column_metadata),
          req.user.id,
          req.user.id
        ]
      );
      
      createdSchemas.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    systemLogger.info('Bulk replaced file schemas', { 
      agreementId,
      count: createdSchemas.length,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      fileSchemas: createdSchemas,
      message: `Successfully replaced file schemas (${createdSchemas.length} schemas created)`
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error bulk replacing file schemas', { 
      error: error.message, 
      agreementId: req.params.agreementId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to bulk replace file schemas',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/vendor-agreements/:agreementId/file-schemas/:schemaId
 * Update an existing file schema
 */
router.put('/:agreementId/file-schemas/:schemaId', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const { agreementId, schemaId } = req.params;
    const { 
      file_name_pattern, 
      file_description, 
      schema, 
      priority,
      is_active,
      contains_pii,
      data_classification,
      file_type,
      quality_rule_ids,
      column_metadata
    } = req.body;
    
    // Verify file schema exists and belongs to this agreement
    const existingCheck = await pool.query(
      'SELECT id FROM vendor_agreement_file_schemas WHERE id = $1 AND vendor_agreement_id = $2',
      [schemaId, agreementId]
    );
    
    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'File schema not found'
      });
    }
    
    // Validate data_classification if provided
    const validClassifications = ['Public', 'Internal', 'Confidential', 'Highly Confidential'];
    if (data_classification !== undefined && data_classification !== null && !validClassifications.includes(data_classification)) {
      return res.status(400).json({
        success: false,
        error: `Invalid data_classification. Must be one of: ${validClassifications.join(', ')}`
      });
    }
    
    // Validate file_type if provided
    const validFileTypes = ['csv', 'json', 'xml', 'xlsx', 'parquet'];
    if (file_type !== undefined && file_type !== null && !validFileTypes.includes(file_type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid file_type. Must be one of: ${validFileTypes.join(', ')}`
      });
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (file_name_pattern !== undefined) {
      updates.push(`file_name_pattern = $${paramIndex++}`);
      values.push(file_name_pattern);
    }
    
    if (file_description !== undefined) {
      updates.push(`file_description = $${paramIndex++}`);
      values.push(file_description);
    }
    
    if (schema !== undefined) {
      if (!Array.isArray(schema) || schema.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'schema must be a non-empty array'
        });
      }
      
      // Validate schema structure
      for (const col of schema) {
        if (!col.column_name || !col.data_type) {
          return res.status(400).json({
            success: false,
            error: 'Each schema column must have column_name and data_type'
          });
        }
      }
      
      updates.push(`schema = $${paramIndex++}`);
      values.push(JSON.stringify(schema));
    }
    
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    
    if (contains_pii !== undefined) {
      updates.push(`contains_pii = $${paramIndex++}`);
      values.push(contains_pii);
    }
    
    if (data_classification !== undefined) {
      updates.push(`data_classification = $${paramIndex++}`);
      values.push(data_classification);
    }
    
    if (file_type !== undefined) {
      updates.push(`file_type = $${paramIndex++}`);
      values.push(file_type);
    }
    
    if (quality_rule_ids !== undefined) {
      updates.push(`quality_rule_ids = $${paramIndex++}`);
      values.push(JSON.stringify(quality_rule_ids));
    }
    
    if (column_metadata !== undefined) {
      updates.push(`column_metadata = $${paramIndex++}`);
      values.push(JSON.stringify(column_metadata));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    // Add updated_by and updated_at
    updates.push(`updated_by = $${paramIndex++}`);
    values.push(req.user.id);
    
    // Add WHERE clause parameters
    values.push(schemaId);
    values.push(agreementId);
    
    const query = `
      UPDATE vendor_agreement_file_schemas 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND vendor_agreement_id = $${paramIndex++}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    systemLogger.info('File schema updated', { 
      schemaId, 
      agreementId,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      fileSchema: result.rows[0],
      message: 'File schema updated successfully'
    });
    
  } catch (error) {
    systemLogger.error('Error updating file schema', { error: error.message, schemaId: req.params.schemaId });
    res.status(500).json({
      success: false,
      error: 'Failed to update file schema',
      details: error.message
    });
  }
});

/**
 * DELETE /api/vendor-agreements/:agreementId/file-schemas/:schemaId
 * Delete a file schema (soft delete by setting is_active = false)
 */
router.delete('/:agreementId/file-schemas/:schemaId', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const { agreementId, schemaId } = req.params;
    const { hardDelete } = req.query;
    
    // Verify file schema exists and belongs to this agreement
    const existingCheck = await pool.query(
      'SELECT id FROM vendor_agreement_file_schemas WHERE id = $1 AND vendor_agreement_id = $2',
      [schemaId, agreementId]
    );
    
    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'File schema not found'
      });
    }
    
    if (hardDelete === 'true') {
      // Hard delete
      await pool.query(
        'DELETE FROM vendor_agreement_file_schemas WHERE id = $1 AND vendor_agreement_id = $2',
        [schemaId, agreementId]
      );
      
      systemLogger.info('File schema hard deleted', { 
        schemaId, 
        agreementId,
        userId: req.user.id 
      });
    } else {
      // Soft delete
      await pool.query(
        `UPDATE vendor_agreement_file_schemas 
         SET is_active = FALSE, updated_by = $1
         WHERE id = $2 AND vendor_agreement_id = $3`,
        [req.user.id, schemaId, agreementId]
      );
      
      systemLogger.info('File schema soft deleted', { 
        schemaId, 
        agreementId,
        userId: req.user.id 
      });
    }
    
    res.json({
      success: true,
      message: 'File schema deleted successfully'
    });
    
  } catch (error) {
    systemLogger.error('Error deleting file schema', { error: error.message, schemaId: req.params.schemaId });
    res.status(500).json({
      success: false,
      error: 'Failed to delete file schema',
      details: error.message
    });
  }
});

/**
 * POST /api/vendor-agreements/:agreementId/file-schemas/test-pattern
 * Test a file name pattern against a given file name
 */
router.post('/:agreementId/file-schemas/test-pattern', requirePermission('vendor_agreements:read'), async (req, res) => {
  try {
    const { pattern, fileName } = req.body;
    
    if (!pattern || !fileName) {
      return res.status(400).json({
        success: false,
        error: 'pattern and fileName are required'
      });
    }
    
    const matches = matchesPattern(fileName, pattern);
    
    res.json({
      success: true,
      matches,
      pattern,
      fileName
    });
    
  } catch (error) {
    systemLogger.error('Error testing pattern', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to test pattern',
      details: error.message
    });
  }
});

module.exports = router;
