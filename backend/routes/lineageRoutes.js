/**
 * Lineage API Routes
 * Routes for file lineage and column-level PII tracking
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

/**
 * GET /api/lineage/:fileId/pii-columns
 * Retrieve column-level PII tracking through the lineage chain for a specific file
 * 
 * This endpoint traces PII columns from the source file through all transformations
 * to show how PII data flows and is transformed across the ETL pipeline.
 */
router.get('/:fileId/pii-columns', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { direction = 'both' } = req.query; // 'upstream', 'downstream', or 'both'
    
    // Get lineage records for the file
    const lineageQuery = `
      WITH RECURSIVE lineage_chain AS (
        -- Base case: direct lineage for the file
        SELECT 
          tl.id,
          tl.transformation_id,
          tl.mapping_id,
          tl.input_file_id,
          tl.output_file_id,
          tl.source_schema,
          tl.target_schema,
          tl.column_mappings,
          tl.created_at,
          1 as depth,
          CASE 
            WHEN tl.input_file_id = $1 THEN 'downstream'
            WHEN tl.output_file_id = $1 THEN 'upstream'
            ELSE 'unknown'
          END as direction
        FROM transformation_lineage tl
        WHERE tl.input_file_id = $1 OR tl.output_file_id = $1
        
        UNION ALL
        
        -- Recursive case: follow the chain
        SELECT 
          tl.id,
          tl.transformation_id,
          tl.mapping_id,
          tl.input_file_id,
          tl.output_file_id,
          tl.source_schema,
          tl.target_schema,
          tl.column_mappings,
          tl.created_at,
          lc.depth + 1,
          lc.direction
        FROM transformation_lineage tl
        INNER JOIN lineage_chain lc ON (
          (lc.direction = 'downstream' AND tl.input_file_id = lc.output_file_id) OR
          (lc.direction = 'upstream' AND tl.output_file_id = lc.input_file_id)
        )
        WHERE lc.depth < 10  -- Prevent infinite loops
      )
      SELECT * FROM lineage_chain
      ORDER BY depth, created_at DESC
    `;
    
    const result = await pool.query(lineageQuery, [fileId]);
    
    // Extract PII column information from column_mappings
    const piiLineage = result.rows.map(row => {
      const piiColumns = (row.column_mappings || []).filter(cm => cm.contains_pii);
      
      return {
        lineage_id: row.id,
        transformation_id: row.transformation_id,
        mapping_id: row.mapping_id,
        source_file_id: row.input_file_id,
        target_file_id: row.output_file_id,
        depth: row.depth,
        direction: row.direction,
        pii_columns: piiColumns.map(cm => ({
          source_column: cm.source_column,
          target_column: cm.target_column,
          pii_type: cm.pii_type,
          transformation_applied: cm.transformation_applied
        })),
        pii_count: piiColumns.length,
        total_columns: (row.column_mappings || []).length,
        created_at: row.created_at
      };
    });
    
    // Filter by direction if specified
    const filteredLineage = direction === 'both' 
      ? piiLineage 
      : piiLineage.filter(l => l.direction === direction);
    
    res.json({
      success: true,
      file_id: fileId,
      direction,
      lineage: filteredLineage,
      total_transformations: filteredLineage.length,
      total_pii_columns: filteredLineage.reduce((sum, l) => sum + l.pii_count, 0)
    });
    
  } catch (error) {
    systemLogger.error('Error retrieving PII column lineage', { 
      error: error.message, 
      fileId: req.params.fileId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve PII column lineage',
      details: error.message
    });
  }
});

/**
 * GET /api/lineage/:fileId/pii-impact
 * Trace PII data flow upstream and downstream to assess impact
 * 
 * This endpoint provides impact analysis showing all files and transformations
 * that contain or receive PII data related to the specified file.
 */
router.get('/:fileId/pii-impact', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { maxDepth = 5 } = req.query;
    
    // Get upstream and downstream PII impact
    const impactQuery = `
      WITH RECURSIVE pii_impact AS (
        -- Base case: direct lineage with PII columns
        SELECT 
          tl.id,
          tl.transformation_id,
          tl.mapping_id,
          tl.input_file_id,
          tl.output_file_id,
          tl.column_mappings,
          1 as depth,
          CASE 
            WHEN tl.input_file_id = $1 THEN 'downstream'
            ELSE 'upstream'
          END as flow_direction,
          ARRAY[tl.id] as path
        FROM transformation_lineage tl
        WHERE (tl.input_file_id = $1 OR tl.output_file_id = $1)
          AND jsonb_array_length(tl.column_mappings) > 0
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(tl.column_mappings) AS cm
            WHERE (cm->>'contains_pii')::boolean = true
          )
        
        UNION ALL
        
        -- Recursive case: follow PII flow
        SELECT 
          tl.id,
          tl.transformation_id,
          tl.mapping_id,
          tl.input_file_id,
          tl.output_file_id,
          tl.column_mappings,
          pi.depth + 1,
          pi.flow_direction,
          pi.path || tl.id
        FROM transformation_lineage tl
        INNER JOIN pii_impact pi ON (
          (pi.flow_direction = 'downstream' AND tl.input_file_id = pi.output_file_id) OR
          (pi.flow_direction = 'upstream' AND tl.output_file_id = pi.input_file_id)
        )
        WHERE pi.depth < $2
          AND NOT tl.id = ANY(pi.path)  -- Prevent cycles
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(tl.column_mappings) AS cm
            WHERE (cm->>'contains_pii')::boolean = true
          )
      )
      SELECT DISTINCT ON (id)
        pi.*,
        tm.mapping_name,
        tm.project_id
      FROM pii_impact pi
      LEFT JOIN transformation_mappings tm ON pi.mapping_id = tm.mapping_id
      ORDER BY id, depth
    `;
    
    const result = await pool.query(impactQuery, [fileId, parseInt(maxDepth)]);
    
    // Organize impact by direction
    const upstreamImpact = result.rows.filter(r => r.flow_direction === 'upstream');
    const downstreamImpact = result.rows.filter(r => r.flow_direction === 'downstream');
    
    // Extract unique files impacted
    const impactedFiles = new Set();
    result.rows.forEach(row => {
      impactedFiles.add(row.input_file_id);
      impactedFiles.add(row.output_file_id);
    });
    
    // Extract PII columns for each transformation
    const transformations = result.rows.map(row => {
      const piiColumns = (row.column_mappings || []).filter(cm => cm.contains_pii);
      
      return {
        transformation_id: row.transformation_id,
        mapping_id: row.mapping_id,
        mapping_name: row.mapping_name,
        project_id: row.project_id,
        source_file_id: row.input_file_id,
        target_file_id: row.output_file_id,
        depth: row.depth,
        flow_direction: row.flow_direction,
        pii_columns: piiColumns.map(cm => ({
          source_column: cm.source_column,
          target_column: cm.target_column,
          pii_type: cm.pii_type,
          transformation_applied: cm.transformation_applied
        }))
      };
    });
    
    res.json({
      success: true,
      file_id: fileId,
      impact_summary: {
        total_transformations: transformations.length,
        total_files_impacted: impactedFiles.size - 1, // Exclude the source file
        upstream_transformations: upstreamImpact.length,
        downstream_transformations: downstreamImpact.length,
        max_depth_reached: Math.max(...transformations.map(t => t.depth), 0)
      },
      upstream: transformations.filter(t => t.flow_direction === 'upstream'),
      downstream: transformations.filter(t => t.flow_direction === 'downstream')
    });
    
  } catch (error) {
    systemLogger.error('Error analyzing PII impact', { 
      error: error.message, 
      fileId: req.params.fileId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze PII impact',
      details: error.message
    });
  }
});

/**
 * GET /api/lineage
 * Get all lineage records with PII summary data
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        tl.*,
        tm.mapping_name,
        tm.project_id,
        tm.source_file_pattern,
        tm.target_file_name,
        tm.target_file_format,
        tm.source_owner,
        tm.target_owner,
        tm.target_file_path,
        tm.vendor_agreement_id,
        va.drop_location_path AS vendor_drop_path,
        va.agreement_code AS vendor_agreement_code,
        va.primary_contact_name AS vendor_contact_name,
        va.primary_contact_email AS vendor_contact_email,
        COALESCE(
          (SELECT COUNT(*)::int 
           FROM jsonb_array_elements(tl.column_mappings) AS cm 
           WHERE (cm->>'contains_pii')::boolean = true),
          0
        ) AS pii_column_count,
        COALESCE(
          (SELECT array_agg(DISTINCT cm->>'pii_type')
           FROM jsonb_array_elements(tl.column_mappings) AS cm
           WHERE (cm->>'contains_pii')::boolean = true
             AND cm->>'pii_type' IS NOT NULL),
          ARRAY[]::text[]
        ) AS pii_types
      FROM transformation_lineage tl
      LEFT JOIN transformation_mappings tm ON tl.mapping_id = tm.mapping_id
      LEFT JOIN vendor_agreements va ON tm.vendor_agreement_id = va.id
      ORDER BY tl.created_at DESC
      LIMIT 100
    `);
    
    // Transform the results to include proper source/target metadata
    const transformedRows = result.rows.map(row => {
      // Determine source metadata based on whether it's a vendor agreement
      const isVendorSource = !!row.vendor_agreement_id;
      
      let sourceOwner, sourcePath, agreementName;
      
      if (isVendorSource) {
        // Vendor agreement source: use vendor contact and drop location
        sourceOwner = row.vendor_contact_name || row.vendor_contact_email || null;
        sourcePath = row.vendor_drop_path || null;
        agreementName = row.vendor_agreement_code || null;
      } else {
        // Regular connection source: use mapping source owner and extract path from pattern
        sourceOwner = row.source_owner || null;
        // Extract path from source_file_pattern (everything before the filename)
        if (row.source_file_pattern) {
          const lastSlash = row.source_file_pattern.lastIndexOf('/');
          sourcePath = lastSlash !== -1 ? row.source_file_pattern.substring(0, lastSlash) : null;
        } else {
          sourcePath = null;
        }
        agreementName = null;
      }
      
      return {
        ...row,
        // Use pattern/filenames for display names
        source_filename: row.source_file_pattern || row.input_file_id,
        target_filename: row.target_file_name || row.output_file_id,
        // Source metadata (vendor agreement OR regular connection)
        source_owner: sourceOwner,
        source_path: sourcePath,
        agreement_name: agreementName,
        // Target metadata (always from mapping)
        target_owner: row.target_owner || null,
        target_path: row.target_file_path || null
      };
    });
    
    // Prevent browser caching to ensure fresh data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json({
      success: true,
      transformation_lineage: transformedRows,
      manual_lineage: [], // Placeholder for future manual lineage
      total: transformedRows.length
    });
    
  } catch (error) {
    systemLogger.error('Error fetching lineage', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lineage',
      details: error.message
    });
  }
});

module.exports = router;
