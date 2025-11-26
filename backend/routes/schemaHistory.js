const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../src/middleware/authenticate');
const { compareSchemas, generateSchemaHash } = require('../services/schemaService');
const { systemLogger } = require('../utils/logger');

/**
 * Get schema history for a file (cross-upload tracking by logical file group)
 * Returns current schema, previous schema, and comparison across all uploads
 * GET /api/files/:fileId/schema-history
 */
router.get('/:fileId/schema-history', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const pool = req.app.locals.pool;

    // First, get the logical_file_id and vendor_agreement_id for this file
    const fileResult = await pool.query(`
      SELECT logical_file_id, filename, project_id, vendor_agreement_id
      FROM files
      WHERE file_id = $1
    `, [fileId]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The specified file does not exist'
      });
    }

    const logicalFileId = fileResult.rows[0].logical_file_id;
    const currentFilename = fileResult.rows[0].filename;
    const vendorAgreementId = fileResult.rows[0].vendor_agreement_id;

    // For contract validation uploads, fetch the expected schema from vendor_agreement_file_schemas
    let contractSchema = null;
    let contractComparison = null;
    let isContractUpload = false;

    if (vendorAgreementId) {
      isContractUpload = true;
      
      // Find matching file pattern in agreement schema by filename match
      // First try exact pattern matching, then fall back to latest if no match
      const contractSchemaResult = await pool.query(`
        WITH pattern_matches AS (
          SELECT 
            vafs.id,
            vafs.file_name_pattern as file_pattern,
            vafs.schema as expected_schema,
            vafs.contains_pii,
            vafs.data_classification,
            vafs.file_type,
            vafs.quality_rule_ids,
            v.vendor_name,
            va.agreement_code as agreement_name,
            CASE 
              WHEN $2 ~ vafs.file_name_pattern THEN 1
              ELSE 0
            END as pattern_priority,
            vafs.created_at
          FROM vendor_agreement_file_schemas vafs
          JOIN vendor_agreements va ON vafs.vendor_agreement_id = va.id
          LEFT JOIN vendors v ON va.vendor_id = v.id
          WHERE vafs.vendor_agreement_id = $1
        )
        SELECT * FROM pattern_matches
        ORDER BY pattern_priority DESC, created_at DESC
        LIMIT 1
      `, [vendorAgreementId, currentFilename]);

      if (contractSchemaResult.rows.length > 0) {
        const schemaRecord = contractSchemaResult.rows[0];
        
        // Only set contract schema if pattern matched (priority=1) or if it's the only schema
        // This prevents incorrect comparisons against unrelated schemas
        const patternMatched = schemaRecord.pattern_priority === 1;
        
        contractSchema = {
          id: schemaRecord.id,
          filePattern: schemaRecord.file_pattern,
          schema: {
            columns: schemaRecord.expected_schema
          },
          vendorName: schemaRecord.vendor_name,
          agreementName: schemaRecord.agreement_name,
          containsPii: schemaRecord.contains_pii,
          dataClassification: schemaRecord.data_classification,
          fileType: schemaRecord.file_type,
          qualityRuleIds: schemaRecord.quality_rule_ids,
          patternMatched
        };
        
        // Log warning if no pattern matched (fallback to latest)
        if (!patternMatched) {
          systemLogger.warn('No matching contract schema pattern found, using latest', {
            fileId,
            filename: currentFilename,
            vendorAgreementId,
            selectedPattern: schemaRecord.file_pattern
          });
        }
      } else {
        // No contract schema found for this agreement
        systemLogger.warn('Contract upload detected but no schema found', {
          fileId,
          filename: currentFilename,
          vendorAgreementId
        });
      }
    }

    // Get all schema snapshots for this logical file group (all uploads of same file)
    // This gives us cross-upload schema history
    const schemasResult = await pool.query(`
      SELECT 
        fs.id,
        fs.file_id,
        fs.file_name,
        fs.file_pattern,
        fs.schema_definition,
        fs.schema_hash,
        fs.row_count,
        fs.column_count,
        fs.captured_at,
        fs.logical_file_id,
        f.filename as actual_filename,
        f.created_at as file_upload_date
      FROM file_schemas fs
      LEFT JOIN files f ON fs.file_id = f.file_id
      WHERE fs.logical_file_id = $1
      ORDER BY fs.captured_at DESC
      LIMIT 20
    `, [logicalFileId]);

    if (schemasResult.rows.length === 0) {
      return res.json({
        hasHistory: false,
        message: 'No schema history found for this file',
        current: null,
        previous: null,
        comparison: null,
        logicalFileId
      });
    }

    const schemas = schemasResult.rows;
    const currentSchema = schemas[0];
    
    // Get drift action from transformation mapping if this file is a transformation output
    let driftAction = null;
    let transformationJobId = null;
    
    const jobResult = await pool.query(`
      SELECT tj.job_id, tm.schema_drift_handling, tj.created_at
      FROM transformation_jobs tj
      JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      WHERE tj.correlation_id = (
        SELECT correlation_id FROM files WHERE file_id = $1
      )
      ORDER BY tj.created_at DESC
      LIMIT 1
    `, [fileId]);
    
    if (jobResult.rows.length > 0) {
      driftAction = jobResult.rows[0].schema_drift_handling;
      transformationJobId = jobResult.rows[0].job_id;
    }

    // Get logical file group metadata
    const logicalFileResult = await pool.query(`
      SELECT 
        canonical_name,
        has_schema_changes,
        upload_count,
        first_upload_at,
        last_upload_at,
        last_schema_change_at
      FROM logical_file_groups
      WHERE logical_file_id = $1
    `, [logicalFileId]);

    const logicalFileInfo = logicalFileResult.rows[0] || {
      canonical_name: currentFilename,
      has_schema_changes: false,
      upload_count: schemas.length,
      first_upload_at: null,
      last_upload_at: null,
      last_schema_change_at: null
    };

    // If only one schema, return it without previous upload comparison
    // BUT still include contract comparison if this is a contract upload
    if (schemas.length === 1) {
      // For contract uploads, compare current schema with contract schema
      if (isContractUpload && contractSchema) {
        contractComparison = compareSchemas(
          contractSchema.schema,
          currentSchema.schema_definition
        );
      }

      return res.json({
        hasHistory: true,
        hasPrevious: false,
        current: {
          id: currentSchema.id,
          fileId: currentSchema.file_id,
          fileName: currentSchema.file_name,
          actualFilename: currentSchema.actual_filename,
          filePattern: currentSchema.file_pattern,
          schema: currentSchema.schema_definition,
          schemaHash: currentSchema.schema_hash,
          rowCount: currentSchema.row_count,
          columnCount: currentSchema.column_count,
          capturedAt: currentSchema.captured_at,
          fileUploadDate: currentSchema.file_upload_date
        },
        previous: null,
        comparison: null,
        isContractUpload,
        contractSchema,
        contractComparison: contractComparison ? {
          isIdentical: contractComparison.isIdentical,
          hasChanges: !contractComparison.isIdentical,
          addedColumns: contractComparison.addedColumns,
          removedColumns: contractComparison.removedColumns,
          modifiedColumns: contractComparison.modifiedColumns,
          reorderedColumns: contractComparison.reorderedColumns,
          columnCountMismatch: contractComparison.columnCountMismatch
        } : null,
        driftAction,
        transformationJobId,
        totalSnapshots: 1,
        logicalFileId,
        canonicalName: logicalFileInfo.canonical_name,
        hasSchemaChanged: logicalFileInfo.has_schema_changes,
        totalUploads: logicalFileInfo.upload_count,
        firstUploadAt: logicalFileInfo.first_upload_at,
        lastUploadAt: logicalFileInfo.last_upload_at,
        lastSchemaChangeAt: logicalFileInfo.last_schema_change_at
      });
    }

    const previousSchema = schemas[1];

    // Compare current and previous schemas (cross-upload comparison)
    const comparison = compareSchemas(
      previousSchema.schema_definition,
      currentSchema.schema_definition
    );

    // For contract uploads, also compare current schema with contract schema
    if (isContractUpload && contractSchema) {
      contractComparison = compareSchemas(
        contractSchema.schema,
        currentSchema.schema_definition
      );
    }

    res.json({
      hasHistory: true,
      hasPrevious: true,
      current: {
        id: currentSchema.id,
        fileId: currentSchema.file_id,
        fileName: currentSchema.file_name,
        actualFilename: currentSchema.actual_filename,
        filePattern: currentSchema.file_pattern,
        schema: currentSchema.schema_definition,
        schemaHash: currentSchema.schema_hash,
        rowCount: currentSchema.row_count,
        columnCount: currentSchema.column_count,
        capturedAt: currentSchema.captured_at,
        fileUploadDate: currentSchema.file_upload_date
      },
      previous: {
        id: previousSchema.id,
        fileId: previousSchema.file_id,
        fileName: previousSchema.file_name,
        actualFilename: previousSchema.actual_filename,
        filePattern: previousSchema.file_pattern,
        schema: previousSchema.schema_definition,
        schemaHash: previousSchema.schema_hash,
        rowCount: previousSchema.row_count,
        columnCount: previousSchema.column_count,
        capturedAt: previousSchema.captured_at,
        fileUploadDate: previousSchema.file_upload_date
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
      isContractUpload,
      contractSchema,
      contractComparison: contractComparison ? {
        isIdentical: contractComparison.isIdentical,
        hasChanges: !contractComparison.isIdentical,
        addedColumns: contractComparison.addedColumns,
        removedColumns: contractComparison.removedColumns,
        modifiedColumns: contractComparison.modifiedColumns,
        reorderedColumns: contractComparison.reorderedColumns,
        columnCountMismatch: contractComparison.columnCountMismatch
      } : null,
      driftAction,
      transformationJobId,
      totalSnapshots: schemas.length,
      logicalFileId,
      canonicalName: logicalFileInfo.canonical_name,
      hasSchemaChanged: logicalFileInfo.has_schema_changes,
      totalUploads: logicalFileInfo.upload_count,
      firstUploadAt: logicalFileInfo.first_upload_at,
      lastUploadAt: logicalFileInfo.last_upload_at,
      lastSchemaChangeAt: logicalFileInfo.last_schema_change_at,
      allSnapshots: schemas.map(s => ({
        id: s.id,
        fileId: s.file_id,
        actualFilename: s.actual_filename,
        capturedAt: s.captured_at,
        fileUploadDate: s.file_upload_date,
        schemaHash: s.schema_hash,
        columnCount: s.column_count,
        rowCount: s.row_count,
        schema: s.schema_definition
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
