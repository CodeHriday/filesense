const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../src/middleware/authenticate');
const { compareSchemas, generateSchemaHash } = require('../services/schemaService');
const { systemLogger } = require('../utils/logger');

/**
 * Get schema history for a file
 * Returns current schema, previous schema, and comparison
 * GET /api/files/:fileId/schema-history
 */
router.get('/:fileId/schema-history', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const pool = req.app.locals.pool;

    // Get all schema snapshots for this file, ordered by most recent first
    const schemasResult = await pool.query(`
      SELECT 
        id,
        file_id,
        file_name,
        file_pattern,
        schema_definition,
        schema_hash,
        row_count,
        column_count,
        captured_at
      FROM file_schemas
      WHERE file_id = $1
      ORDER BY captured_at DESC
      LIMIT 10
    `, [fileId]);

    if (schemasResult.rows.length === 0) {
      return res.json({
        hasHistory: false,
        message: 'No schema history found for this file',
        current: null,
        previous: null,
        comparison: null
      });
    }

    const schemas = schemasResult.rows;
    const currentSchema = schemas[0];
    
    // Get drift action from transformation mapping if this file is a transformation output
    let driftAction = null;
    let transformationJobId = null;
    
    const jobResult = await pool.query(`
      SELECT tj.job_id, tm.drift_action, tj.created_at
      FROM transformation_jobs tj
      JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      WHERE tj.correlation_id = (
        SELECT correlation_id FROM files WHERE file_id = $1
      )
      ORDER BY tj.created_at DESC
      LIMIT 1
    `, [fileId]);
    
    if (jobResult.rows.length > 0) {
      driftAction = jobResult.rows[0].drift_action;
      transformationJobId = jobResult.rows[0].job_id;
    }

    // If only one schema, return it without comparison
    if (schemas.length === 1) {
      return res.json({
        hasHistory: true,
        hasPrevious: false,
        current: {
          id: currentSchema.id,
          fileName: currentSchema.file_name,
          filePattern: currentSchema.file_pattern,
          schema: currentSchema.schema_definition,
          schemaHash: currentSchema.schema_hash,
          rowCount: currentSchema.row_count,
          columnCount: currentSchema.column_count,
          capturedAt: currentSchema.captured_at
        },
        previous: null,
        comparison: null,
        driftAction,
        transformationJobId,
        totalSnapshots: 1
      });
    }

    const previousSchema = schemas[1];

    // Compare current and previous schemas
    const comparison = compareSchemas(
      previousSchema.schema_definition,
      currentSchema.schema_definition
    );

    res.json({
      hasHistory: true,
      hasPrevious: true,
      current: {
        id: currentSchema.id,
        fileName: currentSchema.file_name,
        filePattern: currentSchema.file_pattern,
        schema: currentSchema.schema_definition,
        schemaHash: currentSchema.schema_hash,
        rowCount: currentSchema.row_count,
        columnCount: currentSchema.column_count,
        capturedAt: currentSchema.captured_at
      },
      previous: {
        id: previousSchema.id,
        fileName: previousSchema.file_name,
        filePattern: previousSchema.file_pattern,
        schema: previousSchema.schema_definition,
        schemaHash: previousSchema.schema_hash,
        rowCount: previousSchema.row_count,
        columnCount: previousSchema.column_count,
        capturedAt: previousSchema.captured_at
      },
      comparison: {
        isIdentical: comparison.isIdentical,
        hasChanges: !comparison.isIdentical,
        addedColumns: comparison.addedColumns,
        removedColumns: comparison.removedColumns,
        modifiedColumns: comparison.modifiedColumns,
        reorderedColumns: comparison.reorderedColumns,
        columnCountMismatch: comparison.columnCountMismatch
      },
      driftAction,
      transformationJobId,
      totalSnapshots: schemas.length,
      allSnapshots: schemas.map(s => ({
        id: s.id,
        capturedAt: s.captured_at,
        schemaHash: s.schema_hash,
        columnCount: s.column_count,
        rowCount: s.row_count
      }))
    });

  } catch (error) {
    systemLogger.error('Error fetching schema history:', error);
    res.status(500).json({
      error: 'Failed to fetch schema history',
      message: error.message
    });
  }
});

module.exports = router;
