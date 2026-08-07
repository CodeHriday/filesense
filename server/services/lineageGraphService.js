const { systemLogger } = require('../../backend/utils/logger');
const pool = require('../../backend/db');

/**
 * Lineage Graph Service
 * Builds visual lineage graphs for Data Governance page
 * Traverses: vendor_agreements → file_catalog → etl_mappings → etl_jobs → derived columns
 */

/**
 * Build a comprehensive lineage graph starting from a root entity
 * @param {Object} options - Graph building options
 * @param {string} options.rootType - Type of root entity ('vendorAgreement', 'file', 'mapping', 'job')
 * @param {string|number} options.rootId - ID of root entity
 * @param {number} options.projectId - Project ID for authorization
 * @param {number} options.depth - Maximum depth to traverse (default: 3)
 * @param {Object} options.filters - Optional filters (fileType, status, etc.)
 * @param {boolean} options.includeIncidents - Include quality violations overlay (default: true)
 * @returns {Promise<Object>} Graph object with nodes and edges
 */
async function buildLineageGraph({ rootType, rootId, projectId, depth = 3, filters = {}, includeIncidents = true }) {
  try {
    const nodes = [];
    const edges = [];
    const visited = new Set();
    
    systemLogger.info('Building lineage graph', { rootType, rootId, projectId, depth });
    
    // Start traversal based on root type
    switch (rootType) {
      case 'vendorAgreement':
        await traverseFromVendorAgreement(rootId, projectId, nodes, edges, visited, depth, filters);
        break;
      case 'file':
        await traverseFromFile(rootId, projectId, nodes, edges, visited, depth, filters);
        break;
      case 'mapping':
        await traverseFromMapping(rootId, projectId, nodes, edges, visited, depth, filters);
        break;
      case 'job':
        await traverseFromJob(rootId, projectId, nodes, edges, visited, depth, filters);
        break;
      default:
        throw new Error(`Unknown root type: ${rootType}`);
    }
    
    // Find and add workflows that contain the mapping jobs in this graph
    // Collect both numeric IDs and string mapping_ids for comprehensive matching
    const transformationNodes = nodes.filter(n => n.type === 'transformation');
    const mappingData = transformationNodes.map(n => ({
      id: n.metadata?.id,
      mappingId: n.metadata?.mappingId,
      name: n.label
    })).filter(d => d.id || d.mappingId);
    
    if (mappingData.length > 0) {
      await findWorkflowsForMappings(mappingData, projectId, nodes, edges, visited);
    }
    
    // Deduplicate nodes by type + label (ensures same-named mappings appear only once)
    const { deduplicatedNodes, deduplicatedEdges } = deduplicateNodes(nodes, edges);
    
    // Enrich with incident data if requested
    if (includeIncidents) {
      await enrichWithIncidents(deduplicatedNodes);
    }
    
    systemLogger.info('Lineage graph built successfully', {
      originalNodeCount: nodes.length,
      deduplicatedNodeCount: deduplicatedNodes.length,
      edgeCount: deduplicatedEdges.length
    });
    
    return {
      nodes: deduplicatedNodes,
      edges: deduplicatedEdges,
      metadata: {
        rootType,
        rootId,
        projectId,
        depth,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    systemLogger.error('Error building lineage graph', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Deduplicate nodes by type + label
 * When multiple nodes have the same type and label, keep only one and redirect all edges
 * This ensures same-named mappings/jobs appear only once in the graph
 */
function deduplicateNodes(nodes, edges) {
  // Create a map of type+label -> canonical node
  const nodesByTypeLabel = new Map();
  const nodeIdMapping = new Map(); // oldId -> canonicalId
  
  for (const node of nodes) {
    const key = `${node.type}:${node.label}`;
    
    if (!nodesByTypeLabel.has(key)) {
      // First occurrence - this becomes the canonical node
      nodesByTypeLabel.set(key, node);
      nodeIdMapping.set(node.id, node.id);
    } else {
      // Duplicate - map this node's ID to the canonical node's ID
      const canonicalNode = nodesByTypeLabel.get(key);
      nodeIdMapping.set(node.id, canonicalNode.id);
      
      // Merge metadata arrays (like source files) if present
      if (node.metadata && canonicalNode.metadata) {
        // Merge source file references
        if (node.metadata.sourceFiles) {
          canonicalNode.metadata.sourceFiles = [
            ...(canonicalNode.metadata.sourceFiles || []),
            ...node.metadata.sourceFiles
          ];
        }
      }
    }
  }
  
  // Create deduplicated nodes array
  const deduplicatedNodes = Array.from(nodesByTypeLabel.values());
  
  // Update edges to point to canonical nodes and deduplicate edges
  const edgeSet = new Set();
  const deduplicatedEdges = [];
  
  for (const edge of edges) {
    const newSource = nodeIdMapping.get(edge.source) || edge.source;
    const newTarget = nodeIdMapping.get(edge.target) || edge.target;
    
    // Create a unique edge key to prevent duplicate edges
    const edgeKey = `${newSource}->${newTarget}`;
    
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      deduplicatedEdges.push({
        ...edge,
        id: `${newSource}-to-${newTarget}`,
        source: newSource,
        target: newTarget
      });
    }
  }
  
  return { deduplicatedNodes, deduplicatedEdges };
}

/**
 * Traverse lineage starting from vendor agreement
 */
async function traverseFromVendorAgreement(agreementId, projectId, nodes, edges, visited, depth, filters) {
  if (depth < 0) return;
  
  const nodeId = `vendor-${agreementId}`;
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  
  // Get vendor agreement details
  const agreementResult = await pool.query(`
    SELECT 
      va.*,
      v.vendor_name,
      v.vendor_type
    FROM vendor_agreements va
    LEFT JOIN vendors v ON va.vendor_id = v.id
    WHERE va.id = $1
  `, [agreementId]);
  
  if (agreementResult.rows.length === 0) return;
  
  const agreement = agreementResult.rows[0];
  
  // Add vendor agreement node
  nodes.push({
    id: nodeId,
    type: 'vendorContract',
    label: agreement.agreement_code || `Agreement ${agreementId}`,
    metadata: {
      id: agreement.id,
      agreementCode: agreement.agreement_code,
      vendorName: agreement.vendor_name,
      vendorType: agreement.vendor_type,
      effectiveFrom: agreement.effective_from,
      effectiveTo: agreement.effective_to,
      dropLocation: agreement.drop_location_path,
      primaryContact: agreement.primary_contact_name,
      contactEmail: agreement.primary_contact_email,
      status: agreement.status
    }
  });
  
  // Find files associated with this vendor agreement
  const filesResult = await pool.query(`
    SELECT DISTINCT
      f.id,
      f.filename,
      f.file_type,
      f.file_size,
      f.created_at as upload_date,
      f.processing_step as status,
      f.file_id as storage_path,
      f.project_id
    FROM files f
    WHERE f.vendor_agreement_id = $1
      AND ($2::integer IS NULL OR f.project_id = $2)
    ORDER BY f.created_at DESC
    LIMIT 100
  `, [agreementId, projectId]);
  
  // Group files by filename to handle multiple versions
  const filesByName = new Map();
  for (const file of filesResult.rows) {
    if (!filesByName.has(file.filename)) {
      filesByName.set(file.filename, []);
    }
    filesByName.get(file.filename).push(file);
  }
  
  // Traverse each file group (only latest version per filename)
  for (const [filename, versions] of filesByName.entries()) {
    const latestFile = versions[0]; // Already sorted by created_at DESC
    const versionCount = versions.length;
    
    // Pass version count to traverseFromFile via a map
    await traverseFromFile(latestFile.id, projectId, nodes, edges, visited, depth - 1, filters, versionCount);
    
    // Add edge from vendor agreement to file
    edges.push({
      id: `${nodeId}-to-file-${latestFile.id}`,
      source: nodeId,
      target: `file-${latestFile.id}`,
      relationship: 'SOURCE_OF',
      label: 'provides'
    });
  }
}

/**
 * Traverse lineage starting from file
 */
async function traverseFromFile(fileId, projectId, nodes, edges, visited, depth, filters, versionCount = 1) {
  if (depth < 0) return;
  
  const nodeId = `file-${fileId}`;
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  
  // Get file details with PII metadata
  const fileResult = await pool.query(`
    SELECT 
      f.*,
      va.agreement_code,
      va.id as vendor_agreement_id
    FROM files f
    LEFT JOIN vendor_agreements va ON f.vendor_agreement_id = va.id
    WHERE f.id = $1
      AND ($2::integer IS NULL OR f.project_id = $2)
  `, [fileId, projectId]);
  
  if (fileResult.rows.length === 0) return;
  
  const file = fileResult.rows[0];
  
  // Get PII columns for this file
  const piiColumnsResult = await pool.query(`
    SELECT DISTINCT cta.column_name
    FROM column_governance_tag_assignments cta
    WHERE cta.file_id = $1 AND cta.tag_id = 'tag_pii'
    ORDER BY cta.column_name
  `, [file.file_id]);
  
  const piiColumns = piiColumnsResult.rows.map(row => row.column_name);
  
  // Add file node
  nodes.push({
    id: nodeId,
    type: 'sourceFile',
    label: file.filename,
    metadata: {
      id: file.id,
      fileName: file.filename,
      fileType: file.file_type,
      fileSize: file.file_size,
      uploadDate: file.created_at,
      status: file.processing_step,
      storagePath: file.file_id,
      projectId: file.project_id,
      vendorAgreementCode: file.agreement_code,
      checksum: file.checksum,
      rowCount: file.row_count,
      containsPii: file.contains_pii || false,
      dataClassification: file.data_classification,
      piiColumns: piiColumns,
      versionCount: versionCount
    }
  });
  
  // Find ETL mappings that use this file as input
  // Extract basename from filename and match against pattern
  // Exact patterns (no *) must match basename exactly, wildcard patterns (* -> %) use LIKE
  const basename = file.filename.includes('/') 
    ? file.filename.substring(file.filename.lastIndexOf('/') + 1)
    : file.filename;
    
  systemLogger.info('Matching file to mappings', { filename: file.filename, basename });
    
  const mappingsResult = await pool.query(`
    SELECT DISTINCT
      tm.id,
      tm.mapping_id,
      tm.mapping_name,
      tm.source_file_pattern,
      tm.target_table_name,
      tm.field_mappings,
      tm.status,
      tm.project_id,
      tm.description
    FROM transformation_mappings tm
    WHERE (
      (
        -- Exact pattern match (no wildcard) - basename must match exactly
        tm.source_file_pattern NOT LIKE '%*%'
        AND $1 = tm.source_file_pattern
      )
      OR
      (
        -- Wildcard pattern match - use LIKE with % replacement
        tm.source_file_pattern LIKE '%*%'
        AND $1 LIKE REPLACE(tm.source_file_pattern, '*', '%')
      )
    )
      AND ($2::integer IS NULL OR tm.project_id = $2)
      AND tm.status != 'deleted'
    LIMIT 50
  `, [basename, projectId]);
  
  systemLogger.info('Matched mappings', { 
    filename: basename, 
    matchedCount: mappingsResult.rows.length,
    mappings: mappingsResult.rows.map(m => ({ name: m.mapping_name, pattern: m.source_file_pattern }))
  });
  
  // Traverse each mapping
  for (const mapping of mappingsResult.rows) {
    await traverseFromMapping(mapping.mapping_id, projectId, nodes, edges, visited, depth - 1, filters);
    
    // Add edge from file to mapping
    edges.push({
      id: `${nodeId}-to-mapping-${mapping.mapping_id}`,
      source: nodeId,
      target: `mapping-${mapping.mapping_id}`,
      relationship: 'TRANSFORMED_BY',
      label: 'transformed by'
    });
  }

  // VM fallback: visual mapping jobs delete their transformation_mappings row
  // immediately after execution, so the query above finds nothing for them.
  // file_audit_details is written permanently during execution with
  // mapping_name = '[VM] <mapping_name>' and file_role = 'source', giving us
  // a durable link from source file → visual_mapping_defs.
  try {
    const vmAuditResult = await pool.query(`
      SELECT DISTINCT
        vmd.id              AS vm_id,
        vmd.name            AS vm_name,
        vmd.graph_data,
        vmd.project_id,
        vmd.last_executed_at,
        vmd.execution_count
      FROM file_audit_details fad
      JOIN visual_mapping_defs vmd
        ON vmd.name = REPLACE(fad.mapping_name, '[VM] ', '')
       AND vmd.is_active = true
      WHERE fad.file_role = 'source'
        AND fad.mapping_name LIKE '[VM] %'
        AND (
          fad.file_name = $1
          OR fad.file_name LIKE $2
        )
        AND ($3::integer IS NULL OR vmd.project_id = $3)
      ORDER BY vmd.id
    `, [basename, `%/${basename}`, projectId]);

    systemLogger.info('VM fallback: visual mapping audit lookup', {
      filename: basename,
      vmCount: vmAuditResult.rows.length,
      vmNames: vmAuditResult.rows.map(r => r.vm_name)
    });

    for (const vmDef of vmAuditResult.rows) {
      // Stable mapping_id: 'vm-{id}-synthetic'
      // The 'vm-' prefix lets findWorkflowsForMappings extract vm_id via split('-')[1]
      // and match against visual workflow nodes; '-synthetic' satisfies the
      // startsWith('vm-{id}-') pattern check used when linking workflow edges.
      const vmMappingId = `vm-${vmDef.vm_id}-synthetic`;
      const vmNodeId = `mapping-${vmMappingId}`;

      if (visited.has(vmNodeId)) {
        // Mapping node already in graph (e.g. another source file at same depth).
        // Still wire the edge from this file if it is not already there.
        const dupeEdgeId = `${nodeId}-to-${vmNodeId}`;
        if (!edges.some(e => e.id === dupeEdgeId)) {
          edges.push({
            id: dupeEdgeId,
            source: nodeId,
            target: vmNodeId,
            relationship: 'TRANSFORMED_BY',
            label: 'transformed by'
          });
        }
        continue;
      }
      visited.add(vmNodeId);

      // Parse graph_data to extract source pattern and target file info.
      // Config lives at node.data.config (confirmed in visualMappingCompiler.js).
      const graphNodes = vmDef.graph_data?.nodes || [];
      const sourceConfigNode = graphNodes.find(n => n.type === 'sourceConfig');
      const targetRulesNode  = graphNodes.find(n => n.type === 'targetRules');

      const sourcePattern  = sourceConfigNode?.data?.config?.filePattern
                          || sourceConfigNode?.config?.filePattern
                          || '*';
      const targetFileName = targetRulesNode?.data?.config?.fileName
                          || targetRulesNode?.config?.fileName
                          || null;
      const targetFileFormat = targetRulesNode?.data?.config?.fileFormat
                            || targetRulesNode?.config?.fileFormat
                            || 'csv';

      // Fetch execution stats from the most recent completed VM execution.
      // visual_mapping_executions.rows_processed is the primary row count;
      // transformation_jobs (joined via transformation_job_id) carries the
      // separate rows_read / rows_written breakdown when available.
      let vmExecStats = null;
      try {
        const vmExecResult = await pool.query(`
          SELECT
            vme.completed_at,
            vme.rows_processed,
            tj.rows_read,
            tj.rows_written
          FROM visual_mapping_executions vme
          LEFT JOIN transformation_jobs tj
            ON tj.job_id = vme.transformation_job_id
          WHERE vme.mapping_id = $1
            AND vme.status = 'completed'
          ORDER BY vme.completed_at DESC
          LIMIT 1
        `, [vmDef.vm_id]);
        if (vmExecResult.rows.length > 0) {
          vmExecStats = vmExecResult.rows[0];
        }
      } catch (_vmExecErr) { /* non-fatal — stats are optional enrichment */ }

      const vmRowsRead    = vmExecStats?.rows_read    ?? null;
      const vmRowsWritten = vmExecStats?.rows_written ?? vmExecStats?.rows_processed ?? null;
      const vmLastRun     = vmExecStats?.completed_at ?? vmDef.last_executed_at ?? null;

      // Add transformation node
      nodes.push({
        id: vmNodeId,
        type: 'transformation',
        label: `[VM] ${vmDef.vm_name}`,
        metadata: {
          id: null,                        // no transformation_mappings row
          mappingId: vmMappingId,
          mappingName: `[VM] ${vmDef.vm_name}`,
          description: null,
          sourcePattern: sourcePattern,
          targetTable: null,
          status: 'active',
          projectId: vmDef.project_id,
          fieldMappingsCount: 0,
          derivedColumnsCount: 0,
          lastExecutedAt: vmLastRun,
          executionCount: vmDef.execution_count,
          rowsRead: vmRowsRead,
          rowsWritten: vmRowsWritten,
          isVisualMapping: true,
          visualMappingId: vmDef.vm_id,
          visualMappingName: vmDef.vm_name
        }
      });

      // Edge: source file → transformation
      edges.push({
        id: `${nodeId}-to-${vmNodeId}`,
        source: nodeId,
        target: vmNodeId,
        relationship: 'TRANSFORMED_BY',
        label: 'transformed by'
      });

      // Add target file node when we know the filename from targetRules config
      if (targetFileName) {
        const targetNodeId = `target-file-${targetFileName}`;

        if (!visited.has(targetNodeId)) {
          visited.add(targetNodeId);

          // Derive a single canonical display name — extension appended exactly
          // once regardless of whether config.fileName already includes it.
          const targetLabel = targetFileName.endsWith(`.${targetFileFormat}`)
            ? targetFileName
            : `${targetFileName}.${targetFileFormat}`;
          // Base name without extension used as a secondary lookup term so the
          // files table is matched whether it stores 'file.csv' or 'file'.
          const targetBaseName = targetLabel.slice(0, targetLabel.lastIndexOf('.')) || targetLabel;

          // Attempt to resolve a real file_id so the drawer can navigate to
          // the target file's profile page.
          let resolvedFileId = null;
          try {
            const existingFileResult = await pool.query(`
              SELECT file_id FROM files
              WHERE file_role = 'target'
                AND ($1::integer IS NULL OR project_id = $1)
                AND (filename = $2 OR filename = $3)
              ORDER BY created_at DESC
              LIMIT 1
            `, [vmDef.project_id, targetLabel, targetBaseName]);
            if (existingFileResult.rows.length > 0) {
              resolvedFileId = existingFileResult.rows[0].file_id;
            }
          } catch (_) { /* non-fatal */ }

          nodes.push({
            id: targetNodeId,
            type: 'targetFile',
            label: targetLabel,
            metadata: {
              fileName: targetFileName,
              fileFormat: targetFileFormat,
              file_id: resolvedFileId,
              mappingId: vmMappingId,
              mappingName: `[VM] ${vmDef.vm_name}`,
              projectId: vmDef.project_id,
              lastRun: vmLastRun,
              rowsWritten: vmRowsWritten,
              rowsRead: vmRowsRead,
              containsPii: false,
              dataClassification: null,
              piiColumns: []
            }
          });
        }

        // Edge: transformation → target file (guard against duplicates)
        const targetEdgeId = `${vmNodeId}-to-${targetNodeId}`;
        if (!edges.some(e => e.id === targetEdgeId)) {
          edges.push({
            id: targetEdgeId,
            source: vmNodeId,
            target: targetNodeId,
            relationship: 'OUTPUTS_TO',
            label: 'outputs to'
          });
        }
      }
    }
  } catch (vmFallbackErr) {
    // Non-fatal: a VM fallback failure must not break the rest of the graph
    systemLogger.warn('VM fallback query failed, skipping visual mapping discovery', {
      filename: basename,
      error: vmFallbackErr.message
    });
  }
}

/**
 * Traverse lineage starting from ETL mapping
 */
async function traverseFromMapping(mappingId, projectId, nodes, edges, visited, depth, filters) {
  if (depth < 0) return;
  
  const nodeId = `mapping-${mappingId}`;
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  
  // Get mapping details
  const mappingResult = await pool.query(`
    SELECT *
    FROM transformation_mappings
    WHERE mapping_id = $1
      AND ($2::integer IS NULL OR project_id = $2)
  `, [mappingId, projectId]);
  
  if (mappingResult.rows.length === 0) return;
  
  const mapping = mappingResult.rows[0];
  
  // Parse field mappings to extract derived columns
  const fieldMappings = mapping.field_mappings || [];
  const derivedColumns = extractDerivedColumns(fieldMappings);
  
  // Add mapping node
  nodes.push({
    id: nodeId,
    type: 'transformation',
    label: mapping.mapping_name,
    metadata: {
      id: mapping.id,
      mappingId: mapping.mapping_id,
      mappingName: mapping.mapping_name,
      description: mapping.description,
      sourcePattern: mapping.source_file_pattern,
      targetTable: mapping.target_table_name,
      status: mapping.status,
      projectId: mapping.project_id,
      fieldMappingsCount: fieldMappings.length,
      derivedColumnsCount: derivedColumns.length,
      createdAt: mapping.created_at,
      lastExecutedAt: mapping.last_executed_at
    },
    derivedColumns // Store derived columns for expansion
  });
  
  // Add derived column nodes if they exist
  for (const derivedCol of derivedColumns) {
    const colNodeId = `${nodeId}-col-${derivedCol.target_field}`;
    
    nodes.push({
      id: colNodeId,
      type: 'derivedColumn',
      label: derivedCol.target_field,
      metadata: {
        columnName: derivedCol.target_field,
        expression: derivedCol.expression,
        transformationType: derivedCol.transformation_type,
        sourceFields: derivedCol.source_fields,
        mappingId: mapping.mapping_id,
        mappingName: mapping.mapping_name
      }
    });
    
    // Add edge from mapping to derived column
    edges.push({
      id: `${nodeId}-to-${colNodeId}`,
      source: nodeId,
      target: colNodeId,
      relationship: 'DERIVES',
      label: 'derives'
    });
  }
  
  // Fetch the most recent successful job's stats to enrich the target node.
  // Job instance nodes are intentionally NOT added to the graph — the lineage
  // graph shows logical data flow (Source → Mapping → Target), not execution
  // history. Job stats are surfaced as metadata on the target node instead.
  let lastJobStats = null;
  try {
    const lastJobResult = await pool.query(`
      SELECT
        tj.end_time,
        tj.rows_written,
        tj.rows_read,
        f.contains_pii,
        f.data_classification,
        f.file_id AS target_file_id
      FROM transformation_jobs tj
      LEFT JOIN file_audit_details fad
        ON fad.transformation_job_id = tj.id AND fad.file_role = 'target'
      LEFT JOIN files f ON fad.file_id = f.file_id
      WHERE tj.mapping_id = $1
        AND tj.status = 'completed'
      ORDER BY tj.end_time DESC
      LIMIT 1
    `, [mappingId]);
    if (lastJobResult.rows.length > 0) {
      lastJobStats = lastJobResult.rows[0];
    }
  } catch (err) {
    // Non-fatal: job stats are optional enrichment only
  }

  // Always derive the target node from mapping configuration so the graph
  // shows the logical output regardless of whether any job has run.
  const targetFileName = mapping.target_file_name;
  const targetFileFormat = mapping.target_file_format;
  const targetTableName = mapping.target_table_name;

  if (targetFileName) {
    const targetNodeId = `target-file-${targetFileName}`;

    if (!visited.has(targetNodeId)) {
      visited.add(targetNodeId);

      // Look up whether this output file exists in the files table so the
      // frontend can navigate to its profile page with a valid file_id.
      // Prefer the file_id found through the job audit chain; fall back to a
      // filename match scoped to the mapping's project.
      let resolvedFileId = lastJobStats?.target_file_id || null;
      if (!resolvedFileId) {
        try {
          const resolvedProjectId = mapping.project_id || projectId;
          const nameWithFormat = targetFileFormat
            ? `${targetFileName}.${targetFileFormat}`
            : null;
          const existingFileResult = await pool.query(`
            SELECT file_id FROM files
            WHERE file_role = 'target'
              AND ($1::integer IS NULL OR project_id = $1)
              AND (
                ($2 IS NOT NULL AND filename = $2)
                OR filename = $3
              )
            ORDER BY created_at DESC
            LIMIT 1
          `, [resolvedProjectId, nameWithFormat, targetFileName]);
          if (existingFileResult.rows.length > 0) {
            resolvedFileId = existingFileResult.rows[0].file_id;
          }
        } catch (err) {
          // Non-fatal
        }
      }

      nodes.push({
        id: targetNodeId,
        type: 'targetFile',
        label: `${targetFileName}${targetFileFormat ? '.' + targetFileFormat : ''}`,
        metadata: {
          fileName: targetFileName,
          fileFormat: targetFileFormat,
          file_id: resolvedFileId,
          mappingId: mapping.mapping_id,
          mappingName: mapping.mapping_name,
          projectId: mapping.project_id || projectId || null,
          // Runtime stats from the most recent successful job run
          lastRun: lastJobStats?.end_time || null,
          rowsWritten: lastJobStats?.rows_written || null,
          rowsRead: lastJobStats?.rows_read || null,
          containsPii: lastJobStats?.contains_pii || false,
          dataClassification: lastJobStats?.data_classification || null,
          piiColumns: []
        }
      });
    }

    edges.push({
      id: `${nodeId}-to-${targetNodeId}`,
      source: nodeId,
      target: targetNodeId,
      relationship: 'OUTPUTS_TO',
      label: 'outputs to'
    });
  } else if (targetTableName) {
    const targetNodeId = `table-${targetTableName}`;

    if (!visited.has(targetNodeId)) {
      visited.add(targetNodeId);

      nodes.push({
        id: targetNodeId,
        type: 'targetTable',
        label: targetTableName,
        metadata: {
          tableName: targetTableName,
          mappingId: mapping.mapping_id,
          mappingName: mapping.mapping_name,
          // Runtime stats from the most recent successful job run
          lastRun: lastJobStats?.end_time || null,
          rowsWritten: lastJobStats?.rows_written || null,
          rowsRead: lastJobStats?.rows_read || null,
          containsPii: lastJobStats?.contains_pii || false,
          dataClassification: lastJobStats?.data_classification || null,
          piiColumns: []
        }
      });
    }

    edges.push({
      id: `${nodeId}-to-${targetNodeId}`,
      source: nodeId,
      target: targetNodeId,
      relationship: 'OUTPUTS_TO',
      label: 'outputs to'
    });
  }
}

/**
 * Traverse lineage starting from job execution
 */
async function traverseFromJob(jobId, projectId, nodes, edges, visited, depth, filters) {
  if (depth < 0) return;
  
  const nodeId = `job-${jobId}`;
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  
  // Get job details
  const jobResult = await pool.query(`
    SELECT 
      tj.*,
      tm.mapping_name,
      tm.target_table_name
    FROM transformation_jobs tj
    LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
    WHERE tj.job_id = $1
  `, [jobId]);
  
  if (jobResult.rows.length === 0) {
    // Not in transformation_jobs — check if this is a visual mapping execution ID.
    // Visual mapping executions are stored in visual_mapping_executions, not
    // transformation_jobs, so the standard lookup above finds nothing for them.
    await traverseFromVmJobExecution(jobId, projectId, nodes, edges, visited, depth, filters, nodeId);
    return;
  }
  
  const job = jobResult.rows[0];
  
  // Add job node
  nodes.push({
    id: nodeId,
    type: 'job',
    label: `Job ${job.job_id}`,
    metadata: {
      id: job.id,
      jobId: job.job_id,
      mappingId: job.mapping_id,
      mappingName: job.mapping_name,
      status: job.status,
      startTime: job.start_time,
      endTime: job.end_time,
      durationMs: job.duration_ms,
      rowsRead: job.rows_read,
      rowsWritten: job.rows_written,
      rowsFailed: job.rows_failed,
      errorMessage: job.error_message
    }
  });
  
  // Find target file created by this job
  const targetFileResult = await pool.query(`
    SELECT f.*
    FROM files f
    WHERE f.file_id LIKE $1
      AND f.file_role = 'target'
    LIMIT 1
  `, [`transformed_${job.job_id}%`]);
  
  if (targetFileResult.rows.length > 0) {
    const targetFile = targetFileResult.rows[0];
    const targetNodeId = `target-${targetFile.id}`;
    
    if (!visited.has(targetNodeId)) {
      visited.add(targetNodeId);
      
      // Get PII columns for target file
      const targetPiiColumnsResult = await pool.query(`
        SELECT DISTINCT cta.column_name
        FROM column_governance_tag_assignments cta
        WHERE cta.file_id = $1 AND cta.tag_id = 'tag_pii'
        ORDER BY cta.column_name
      `, [targetFile.file_id]);
      
      const targetPiiColumns = targetPiiColumnsResult.rows.map(row => row.column_name);
      
      nodes.push({
        id: targetNodeId,
        type: 'targetTable',
        label: targetFile.filename || job.target_table_name,
        metadata: {
          id: targetFile.id,
          fileName: targetFile.filename,
          tableName: job.target_table_name,
          fileType: targetFile.file_type,
          lastUpdated: targetFile.created_at,
          rowsWritten: targetFile.row_count || job.rows_written,
          containsPii: targetFile.contains_pii || false,
          dataClassification: targetFile.data_classification,
          piiColumns: targetPiiColumns
        }
      });
    }
    
    // Add edge from job to target file
    edges.push({
      id: `${nodeId}-to-${targetNodeId}`,
      source: nodeId,
      target: targetNodeId,
      relationship: 'OUTPUT_TO',
      label: 'outputs to'
    });
  } else if (job.target_table_name) {
    // Fallback to target table name if no file found
    const targetNodeId = `table-${job.target_table_name}`;
    
    if (!visited.has(targetNodeId)) {
      visited.add(targetNodeId);
      
      nodes.push({
        id: targetNodeId,
        type: 'targetTable',
        label: job.target_table_name,
        metadata: {
          tableName: job.target_table_name,
          lastUpdated: job.end_time,
          rowsWritten: job.rows_written,
          containsPii: false,
          dataClassification: null,
          piiColumns: []
        }
      });
    }
    
    // Add edge from job to target table
    edges.push({
      id: `${nodeId}-to-${targetNodeId}`,
      source: nodeId,
      target: targetNodeId,
      relationship: 'OUTPUT_TO',
      label: 'outputs to'
    });
  }
}

/**
 * Fallback handler for traverseFromJob when the jobId is a visual_mapping_executions.id
 * rather than a transformation_jobs.job_id.
 *
 * Visual mapping executions delete their transformation_mappings row after execution, so
 * they cannot be looked up via transformation_jobs.  Instead we query
 * visual_mapping_executions joined to visual_mapping_defs to reconstruct the same
 * transformation node shape produced by the file-traversal VM fallback, with execution
 * stats (rowsRead / rowsWritten / lastRun) populated from the execution record.
 *
 * @param {string|number} vmExecId - visual_mapping_executions.id
 * @param {number}        projectId
 * @param {Array}         nodes
 * @param {Array}         edges
 * @param {Set}           visited
 * @param {number}        depth
 * @param {Object}        filters
 * @param {string}        jobNodeId - the `job-{vmExecId}` node id already reserved by the caller
 */
async function traverseFromVmJobExecution(vmExecId, projectId, nodes, edges, visited, depth, filters, jobNodeId) {
  try {
    const vmExecResult = await pool.query(`
      SELECT
        vme.id            AS exec_id,
        vme.mapping_id    AS vm_id,
        vme.status,
        vme.completed_at,
        vme.rows_processed,
        vme.transformation_job_id,
        vmd.name          AS vm_name,
        vmd.graph_data,
        vmd.project_id,
        vmd.last_executed_at,
        vmd.execution_count,
        tj.rows_read,
        tj.rows_written
      FROM visual_mapping_executions vme
      JOIN visual_mapping_defs vmd ON vmd.id = vme.mapping_id
      LEFT JOIN transformation_jobs tj ON tj.job_id = vme.transformation_job_id
      WHERE vme.id = $1
        AND ($2::integer IS NULL OR vmd.project_id = $2)
    `, [vmExecId, projectId]);

    if (vmExecResult.rows.length === 0) {
      systemLogger.info('traverseFromJob: no transformation_job or VM execution found', { jobId: vmExecId });
      return;
    }

    const vmExec = vmExecResult.rows[0];

    const vmRowsRead    = vmExec.rows_read    ?? null;
    const vmRowsWritten = vmExec.rows_written ?? vmExec.rows_processed ?? null;
    const vmLastRun     = vmExec.completed_at ?? vmExec.last_executed_at ?? null;

    // Build a stable mapping_id and node id consistent with the file-traversal VM path
    // so deduplication and findWorkflowsForMappings work correctly for mixed graphs.
    const vmMappingId = `vm-${vmExec.vm_id}-synthetic`;
    const vmNodeId    = `mapping-${vmMappingId}`;

    systemLogger.info('traverseFromJob: found VM execution', {
      execId: vmExec.exec_id,
      vmId: vmExec.vm_id,
      vmName: vmExec.vm_name,
      vmRowsRead,
      vmRowsWritten,
      vmLastRun
    });

    // Parse graph_data for source pattern and target file info
    const graphNodes      = vmExec.graph_data?.nodes || [];
    const sourceConfigNode = graphNodes.find(n => n.type === 'sourceConfig');
    const targetRulesNode  = graphNodes.find(n => n.type === 'targetRules');

    const sourcePattern  = sourceConfigNode?.data?.config?.filePattern
                        || sourceConfigNode?.config?.filePattern
                        || '*';
    const targetFileName = targetRulesNode?.data?.config?.fileName
                        || targetRulesNode?.config?.fileName
                        || null;
    const targetFileFormat = targetRulesNode?.data?.config?.fileFormat
                          || targetRulesNode?.config?.fileFormat
                          || 'csv';

    if (!visited.has(vmNodeId)) {
      visited.add(vmNodeId);

      nodes.push({
        id: vmNodeId,
        type: 'transformation',
        label: `[VM] ${vmExec.vm_name}`,
        metadata: {
          id: null,                          // no transformation_mappings row
          mappingId: vmMappingId,
          mappingName: `[VM] ${vmExec.vm_name}`,
          description: null,
          sourcePattern,
          targetTable: null,
          status: 'active',
          projectId: vmExec.project_id,
          fieldMappingsCount: 0,
          derivedColumnsCount: 0,
          lastExecutedAt: vmLastRun,
          executionCount: vmExec.execution_count,
          rowsRead: vmRowsRead,
          rowsWritten: vmRowsWritten,
          isVisualMapping: true,
          visualMappingId: vmExec.vm_id,
          visualMappingName: vmExec.vm_name
        }
      });
    }

    // Edge: the reserved job node → transformation node (makes the execution root visible)
    // The jobNodeId (`job-{vmExecId}`) was already added to visited by traverseFromJob;
    // we re-use it as a proxy execution node pointing at the transformation node.
    nodes.push({
      id: jobNodeId,
      type: 'job',
      label: `VM Execution ${vmExec.exec_id}`,
      metadata: {
        id: vmExec.exec_id,
        jobId: vmExec.exec_id,
        mappingId: vmMappingId,
        mappingName: `[VM] ${vmExec.vm_name}`,
        status: vmExec.status,
        startTime: null,
        endTime: vmExec.completed_at,
        rowsRead: vmRowsRead,
        rowsWritten: vmRowsWritten,
        isVisualMappingExecution: true,
        visualMappingId: vmExec.vm_id
      }
    });

    edges.push({
      id: `${jobNodeId}-to-${vmNodeId}`,
      source: jobNodeId,
      target: vmNodeId,
      relationship: 'EXECUTED_BY',
      label: 'executed by'
    });

    // Add target file node when we know it from the VM definition
    if (targetFileName) {
      const targetNodeId = `target-file-${targetFileName}`;

      if (!visited.has(targetNodeId)) {
        visited.add(targetNodeId);

        // Derive a single canonical display name — extension appended exactly
        // once regardless of whether config.fileName already includes it.
        const targetLabel = targetFileName.endsWith(`.${targetFileFormat}`)
          ? targetFileName
          : `${targetFileName}.${targetFileFormat}`;
        // Base name without extension used as a secondary lookup term.
        const targetBaseName = targetLabel.slice(0, targetLabel.lastIndexOf('.')) || targetLabel;

        let resolvedFileId = null;
        try {
          const existingFileResult = await pool.query(`
            SELECT file_id FROM files
            WHERE file_role = 'target'
              AND ($1::integer IS NULL OR project_id = $1)
              AND (filename = $2 OR filename = $3)
            ORDER BY created_at DESC
            LIMIT 1
          `, [vmExec.project_id, targetLabel, targetBaseName]);
          if (existingFileResult.rows.length > 0) {
            resolvedFileId = existingFileResult.rows[0].file_id;
          }
        } catch (_) { /* non-fatal */ }

        nodes.push({
          id: targetNodeId,
          type: 'targetFile',
          label: targetLabel,
          metadata: {
            fileName: targetFileName,
            fileFormat: targetFileFormat,
            file_id: resolvedFileId,
            mappingId: vmMappingId,
            mappingName: `[VM] ${vmExec.vm_name}`,
            projectId: vmExec.project_id,
            lastRun: vmLastRun,
            rowsWritten: vmRowsWritten,
            rowsRead: vmRowsRead,
            containsPii: false,
            dataClassification: null,
            piiColumns: []
          }
        });
      }

      const targetEdgeId = `${vmNodeId}-to-${targetNodeId}`;
      if (!edges.some(e => e.id === targetEdgeId)) {
        edges.push({
          id: targetEdgeId,
          source: vmNodeId,
          target: targetNodeId,
          relationship: 'OUTPUTS_TO',
          label: 'outputs to'
        });
      }
    }
  } catch (vmJobErr) {
    systemLogger.warn('traverseFromJob: VM execution fallback failed', {
      vmExecId,
      error: vmJobErr.message
    });
  }
}

/**
 * Find and add visual workflows that contain the given mapping jobs
 * Scans visual_workflows table to find workflows where the mapping appears in graph_data nodes
 * @param {Array} mappingData - Array of {id, mappingId, name} objects
 */
async function findWorkflowsForMappings(mappingData, projectId, nodes, edges, visited) {
  if (!mappingData || mappingData.length === 0) return;
  
  // Create lookup sets for fast matching
  const numericIds = new Set(mappingData.map(d => d.id).filter(Boolean).map(id => Number(id)));
  const stringIds = new Set(mappingData.map(d => d.mappingId).filter(Boolean));
  const names = new Set(mappingData.map(d => d.name).filter(Boolean));
  
  // Extract visual mapping IDs from mapping_id format: vm-{visualMappingId}-{timestamp}
  // This is how workflows reference mappings (by visual mapping ID)
  const visualMappingIds = new Set();
  for (const d of mappingData) {
    if (d.mappingId && d.mappingId.startsWith('vm-')) {
      const parts = d.mappingId.split('-');
      if (parts.length >= 2) {
        visualMappingIds.add(Number(parts[1]));
      }
    }
  }
  
  // Also extract clean names (without [VM] prefix) for matching workflow node labels
  const cleanNames = new Set();
  for (const d of mappingData) {
    if (d.name) {
      // Remove [VM] prefix if present
      const cleanName = d.name.replace(/^\[VM\]\s*/, '');
      cleanNames.add(cleanName);
    }
  }
  
  systemLogger.info('Finding workflows for mappings', {
    numericIdCount: numericIds.size,
    stringIdCount: stringIds.size,
    nameCount: names.size,
    visualMappingIdCount: visualMappingIds.size,
    visualMappingIds: Array.from(visualMappingIds),
    cleanNames: Array.from(cleanNames),
    mappingData: mappingData
  });
  
  // Query visual_workflows to find any that contain these mappings
  const workflowsResult = await pool.query(`
    SELECT 
      vw.id,
      vw.name,
      vw.description,
      vw.graph_data,
      vw.execution_mode,
      vw.project_id,
      vw.created_at,
      vw.updated_at,
      p.name as project_name
    FROM visual_workflows vw
    LEFT JOIN projects p ON vw.project_id = p.id
    WHERE vw.is_active = true
      AND ($1::integer IS NULL OR vw.project_id = $1)
  `, [projectId]);
  
  systemLogger.info('Checking workflows for mapping matches', {
    workflowCount: workflowsResult.rows.length
  });
  
  for (const workflow of workflowsResult.rows) {
    const graphData = workflow.graph_data || {};
    const workflowNodes = graphData.nodes || [];
    
    // Check if any workflow node references one of our mappings
    const matchingMappings = [];
    
    for (const wfNode of workflowNodes) {
      const assetType = wfNode.data?.assetType;
      const assetId = wfNode.data?.assetId;
      const assetLabel = wfNode.data?.label;
      
      // Check if this is a mapping job node (various asset types used)
      const isMappingType = ['mapping_job', 'job', 'transformation_mapping', 'mapping'].includes(assetType);
      
      if (isMappingType && assetId) {
        // Match by numeric ID (transformation_mappings.id)
        if (numericIds.has(Number(assetId))) {
          matchingMappings.push({ assetId, matchType: 'numericId' });
          continue;
        }
        // Match by string mapping_id
        if (stringIds.has(String(assetId))) {
          matchingMappings.push({ assetId, matchType: 'stringId' });
          continue;
        }
        // Match by visual mapping ID (workflows store assetId as the visual mapping ID from vm-{id}-{timestamp})
        if (visualMappingIds.has(Number(assetId))) {
          matchingMappings.push({ assetId, matchType: 'visualMappingId' });
          continue;
        }
        // Match by name (exact match including [VM] prefix)
        if (assetLabel && names.has(assetLabel)) {
          matchingMappings.push({ assetId, matchType: 'name', name: assetLabel });
          continue;
        }
        // Match by clean name (workflow might store label without [VM] prefix)
        if (assetLabel && cleanNames.has(assetLabel)) {
          matchingMappings.push({ assetId, matchType: 'cleanName', name: assetLabel });
          continue;
        }
      }
    }
    
    if (matchingMappings.length > 0) {
      systemLogger.info('Found matching workflow', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        matchingMappings
      });
      
      const workflowNodeId = `workflow-${workflow.id}`;
      
      if (!visited.has(workflowNodeId)) {
        visited.add(workflowNodeId);
        
        // Add workflow node
        nodes.push({
          id: workflowNodeId,
          type: 'workflow',
          label: workflow.name,
          metadata: {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            executionMode: workflow.execution_mode,
            projectId: workflow.project_id,
            projectName: workflow.project_name,
            createdAt: workflow.created_at,
            updatedAt: workflow.updated_at,
            nodeCount: workflowNodes.length,
            edgeCount: (graphData.edges || []).length
          }
        });
      }
      
      // Add edges from transformation nodes to the workflow
      // Find the transformation nodes that match
      for (const match of matchingMappings) {
        // Find the corresponding node in our lineage graph
        let lineageNode = nodes.find(n => {
          if (n.type !== 'transformation') return false;
          
          // Match by numeric ID
          if (n.metadata?.id === Number(match.assetId)) return true;
          
          // Match by string mapping_id
          if (n.metadata?.mappingId === String(match.assetId)) return true;
          
          // Match by name
          if (match.name && n.label === match.name) return true;
          
          // For visualMappingId match, check if mappingId contains the pattern vm-{assetId}-
          if (match.matchType === 'visualMappingId') {
            const vmPattern = `vm-${match.assetId}-`;
            if (n.metadata?.mappingId && n.metadata.mappingId.startsWith(vmPattern)) {
              return true;
            }
          }
          
          // For cleanName match, check the clean name
          if (match.matchType === 'cleanName') {
            const cleanLabel = n.label?.replace(/^\[VM\]\s*/, '');
            if (cleanLabel === match.name) return true;
          }
          
          return false;
        });
        
        if (lineageNode) {
          const edgeId = `${lineageNode.id}-to-${workflowNodeId}`;
          const edgeExists = edges.some(e => e.id === edgeId);
          
          if (!edgeExists) {
            edges.push({
              id: edgeId,
              source: lineageNode.id,
              target: workflowNodeId,
              relationship: 'PART_OF',
              label: 'part of'
            });
          }
        } else {
          systemLogger.info('Could not find lineage node for workflow edge', { match, workflowId: workflow.id });
        }
      }
    }
  }
}

/**
 * Extract derived columns from field mappings
 * Identifies columns with transformations (not direct mapping)
 */
function extractDerivedColumns(fieldMappings) {
  if (!Array.isArray(fieldMappings)) return [];
  
  const derivedColumns = [];
  
  for (const mapping of fieldMappings) {
    const transformationType = mapping.transformation_type || mapping.type;
    
    // Skip direct mappings or mappings without transformation type
    if (!transformationType || transformationType === 'direct' || transformationType === 'copy') {
      continue;
    }
    
    // Build expression based on transformation type
    let expression = '';
    const sourceFields = Array.isArray(mapping.source_field) 
      ? mapping.source_field 
      : [mapping.source_field].filter(Boolean);
    
    switch (transformationType) {
      case 'concat':
        expression = `CONCAT(${sourceFields.join(', ')})`;
        if (mapping.delimiter) {
          expression = `CONCAT_WS('${mapping.delimiter}', ${sourceFields.join(', ')})`;
        }
        break;
      case 'substring':
        expression = `SUBSTRING(${mapping.source_field}, ${mapping.start_position}, ${mapping.length})`;
        break;
      case 'uppercase':
        expression = `UPPER(${mapping.source_field})`;
        break;
      case 'lowercase':
        expression = `LOWER(${mapping.source_field})`;
        break;
      case 'trim':
        expression = `TRIM(${mapping.source_field})`;
        break;
      case 'replace':
        expression = `REPLACE(${mapping.source_field}, '${mapping.search_value}', '${mapping.replace_value}')`;
        break;
      case 'date_format':
        expression = `DATE_FORMAT(${mapping.source_field}, '${mapping.target_format}')`;
        break;
      case 'lookup':
      case 'rdm_crosswalk_lookup':
        expression = `LOOKUP(${mapping.source_field}, '${mapping.lookup_table || mapping.crosswalk_name}')`;
        break;
      case 'rdm_dataset_join':
        expression = `JOIN(${mapping.source_field}, '${mapping.dataset_name}')`;
        break;
      case 'conditional':
        expression = mapping.condition || `IF(${mapping.source_field}, ...)`;
        break;
      case 'default_value':
        expression = `COALESCE(${mapping.source_field}, '${mapping.default_value}')`;
        break;
      case 'custom':
      case 'expression':
        expression = mapping.expression || mapping.custom_expression || '';
        break;
      default:
        expression = `${transformationType.toUpperCase()}(${sourceFields.join(', ')})`;
    }
    
    derivedColumns.push({
      target_field: mapping.target_field || mapping.target_column,
      source_fields: sourceFields,
      transformation_type: transformationType,
      expression: expression || `${transformationType}(${sourceFields.join(', ')})`
    });
  }
  
  return derivedColumns;
}

/**
 * Enrich nodes with quality violation incidents
 */
async function enrichWithIncidents(nodes) {
  try {
    // Get all file IDs and job IDs from nodes
    const fileIds = nodes.filter(n => n.type === 'sourceFile').map(n => n.metadata.id);
    const jobIds = nodes.filter(n => n.type === 'job').map(n => n.metadata.jobId);
    
    if (fileIds.length === 0 && jobIds.length === 0) return;
    
    // Query quality violations for these entities
    const violationsResult = await pool.query(`
      SELECT 
        qrv.file_id,
        qrv.job_id,
        qrv.severity,
        COUNT(*) as violation_count,
        qr.rule_name,
        qr.rule_type
      FROM quality_rule_violations qrv
      LEFT JOIN quality_rules qr ON qrv.rule_id = qr.id
      WHERE (qrv.file_id = ANY($1) OR qrv.job_id = ANY($2))
        AND qrv.status != 'resolved'
      GROUP BY qrv.file_id, qrv.job_id, qrv.severity, qr.rule_name, qr.rule_type
    `, [fileIds.length > 0 ? fileIds : [null], jobIds.length > 0 ? jobIds : [null]]);
    
    // Build incident map
    const incidentMap = new Map();
    
    for (const row of violationsResult.rows) {
      const key = row.file_id ? `file-${row.file_id}` : `job-${row.job_id}`;
      
      if (!incidentMap.has(key)) {
        incidentMap.set(key, {
          totalViolations: 0,
          criticalCount: 0,
          warningCount: 0,
          violations: []
        });
      }
      
      const incidents = incidentMap.get(key);
      incidents.totalViolations += parseInt(row.violation_count);
      
      if (row.severity === 'critical' || row.severity === 'error') {
        incidents.criticalCount += parseInt(row.violation_count);
      } else {
        incidents.warningCount += parseInt(row.violation_count);
      }
      
      incidents.violations.push({
        ruleName: row.rule_name,
        ruleType: row.rule_type,
        severity: row.severity,
        count: parseInt(row.violation_count)
      });
    }
    
    // Enrich nodes with incident data
    for (const node of nodes) {
      if (incidentMap.has(node.id)) {
        node.incidents = incidentMap.get(node.id);
        node.hasIncidents = true;
      }
    }
    
  } catch (error) {
    systemLogger.error('Error enriching with incidents', { error: error.message });
    // Non-fatal - continue without incident data
  }
}

/**
 * Get detailed metadata for a specific node
 */
async function getNodeDetails(nodeId, nodeType, projectId) {
  try {
    switch (nodeType) {
      case 'vendorContract':
        const agreementId = nodeId.replace('vendor-', '');
        const agreementResult = await pool.query(`
          SELECT 
            va.*,
            v.vendor_name,
            v.vendor_type,
            v.address,
            v.contact_email,
            COUNT(DISTINCT f.id) as file_count
          FROM vendor_agreements va
          LEFT JOIN vendors v ON va.vendor_id = v.id
          LEFT JOIN files f ON f.vendor_agreement_id = va.id
          WHERE va.id = $1
          GROUP BY va.id, v.id
        `, [agreementId]);
        return agreementResult.rows[0] || null;
        
      case 'sourceFile':
        const fileId = nodeId.replace('file-', '');
        const fileResult = await pool.query(`
          SELECT 
            f.*,
            va.agreement_code,
            COUNT(DISTINCT qrv.id) as violation_count
          FROM files f
          LEFT JOIN vendor_agreements va ON f.vendor_agreement_id = va.id
          LEFT JOIN quality_rule_violations qrv ON qrv.file_id = f.id::text AND qrv.status != 'resolved'
          WHERE f.id = $1::integer
          GROUP BY f.id, va.agreement_code
        `, [fileId]);
        
        if (fileResult.rows.length === 0) return null;
        
        const fileData = fileResult.rows[0];
        
        // Get PII columns for this file
        const piiColumnsResult = await pool.query(`
          SELECT DISTINCT cta.column_name
          FROM column_governance_tag_assignments cta
          WHERE cta.file_id = $1 AND cta.tag_id = 'tag_pii'
          ORDER BY cta.column_name
        `, [fileData.file_id]);
        
        fileData.pii_columns = piiColumnsResult.rows.map(row => row.column_name);
        
        // Get column metadata with governance tags
        const columnsResult = await pool.query(`
          SELECT 
            fc.column_name,
            fc.column_type,
            fc.column_index,
            fc.null_count,
            fc.unique_count,
            fc.min_value,
            fc.max_value,
            fc.most_frequent_value,
            fc.top_values,
            COALESCE(
              (SELECT array_agg(DISTINCT cta.tag_id) 
               FROM column_governance_tag_assignments cta 
               WHERE cta.file_id = $1 AND cta.column_name = fc.column_name),
              ARRAY[]::text[]
            ) as governance_tags
          FROM file_columns fc
          WHERE fc.file_id = $1
          ORDER BY fc.column_index
        `, [fileData.file_id]);
        
        fileData.columns = columnsResult.rows;
        
        return fileData;
        
      case 'transformation': {
        const mappingId = nodeId.replace('mapping-', '');

        // VM synthetic mappings have IDs like 'vm-{vmId}-synthetic'.
        // They have no transformation_mappings row; query visual_mapping_defs
        // and visual_mapping_executions directly for stats.
        if (mappingId.startsWith('vm-')) {
          const vmIdStr = mappingId.split('-')[1];
          const vmId = Number(vmIdStr);
          if (!isNaN(vmId)) {
            const vmDetailResult = await pool.query(`
              SELECT
                vmd.id            AS vm_id,
                vmd.name          AS vm_name,
                vmd.project_id,
                vmd.last_executed_at,
                vmd.execution_count,
                vmd.graph_data,
                vme.completed_at,
                vme.rows_processed,
                tj.rows_read,
                tj.rows_written
              FROM visual_mapping_defs vmd
              LEFT JOIN LATERAL (
                SELECT completed_at, rows_processed, transformation_job_id
                FROM visual_mapping_executions
                WHERE mapping_id = vmd.id AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
              ) vme ON true
              LEFT JOIN transformation_jobs tj
                ON tj.job_id = vme.transformation_job_id
              WHERE vmd.id = $1
                AND ($2::integer IS NULL OR vmd.project_id = $2)
            `, [vmId, projectId]);

            if (vmDetailResult.rows.length === 0) return null;
            const vm = vmDetailResult.rows[0];

            // Extract field mappings from expression nodes in graph_data so
            // the drawer can display source → target column pairs.
            //
            // Expression node config stores entries under 'fieldMappings' (camelCase
            // container) with snake_case entry keys. The transformation operation is
            // stored as 'transformation' (e.g. 'none', 'UPPER', 'LOWER', 'TRIM', etc.).
            // The drawer distinguishes regular (direct/rename) from derived (everything
            // else), so 'none' is normalised to 'direct'.
            let vmFieldMappings = [];
            try {
              const graphNodes = vm.graph_data?.nodes || [];
              for (const gNode of graphNodes) {
                if (gNode.type === 'expression') {
                  const config = gNode.data?.config || gNode.config || {};
                  // The modal saves entries under camelCase 'fieldMappings'; fall
                  // back to snake_case 'field_mappings' for forward-compatibility.
                  const fms = config.fieldMappings || config.field_mappings || [];
                  if (Array.isArray(fms)) {
                    for (const fm of fms) {
                      if (fm.include === false) continue; // excluded by user

                      const sourceField = fm.source_field || fm.sourceField || '';
                      const targetField = fm.target_field || fm.targetField || '';
                      // 'transformation' is the modal's operation key; fall back to
                      // transformation_type / transformationType for compatibility.
                      const rawOp = fm.transformation || fm.transformation_type || fm.transformationType || 'none';
                      const transformationType = rawOp === 'none' ? 'direct' : rawOp;

                      const entry = {
                        source_field: sourceField,
                        target_field: targetField,
                        transformation_type: transformationType,
                        data_type: fm.data_type || fm.dataType || 'string'
                      };

                      // Derived (non-direct) mappings: populate source_fields and
                      // expression so the drawer can render them in the Derived
                      // Columns section with meaningful context.
                      if (transformationType !== 'direct' && transformationType !== 'rename') {
                        entry.source_fields = sourceField ? [sourceField] : [];
                        const params = fm.transformation_params || {};
                        const paramValues = Object.entries(params)
                          .filter(([, v]) => v !== null && v !== undefined && v !== '')
                          .map(([, v]) => v);
                        entry.expression = paramValues.length > 0
                          ? `${transformationType}(${sourceField}, ${paramValues.join(', ')})`
                          : `${transformationType}(${sourceField})`;
                      }

                      vmFieldMappings.push(entry);
                    }
                  }
                }
              }
            } catch (_fmErr) { /* non-fatal — field mappings are informational */ }

            return {
              id: vm.vm_id,
              mapping_id: mappingId,
              mapping_name: `[VM] ${vm.vm_name}`,
              is_visual_mapping: true,
              project_id: vm.project_id,
              execution_count: vm.execution_count,
              last_executed_at: vm.completed_at || vm.last_executed_at,
              rows_read: vm.rows_read ?? null,
              rows_written: vm.rows_written ?? vm.rows_processed ?? null,
              status: 'active',
              field_mappings: vmFieldMappings
            };
          }
        }

        const mappingResult = await pool.query(`
          SELECT 
            tm.*,
            COUNT(DISTINCT tj.id) as execution_count,
            MAX(tj.end_time) as last_execution
          FROM transformation_mappings tm
          LEFT JOIN transformation_jobs tj ON tm.mapping_id = tj.mapping_id
          WHERE tm.mapping_id = $1
          GROUP BY tm.id
        `, [mappingId]);
        return mappingResult.rows[0] || null;
      }
        
      case 'job':
        const jobId = nodeId.replace('job-', '');
        const jobResult = await pool.query(`
          SELECT 
            tj.*,
            tm.mapping_name,
            COUNT(DISTINCT qrv.id) as violation_count
          FROM transformation_jobs tj
          LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
          LEFT JOIN quality_rule_violations qrv ON qrv.job_id = tj.job_id AND qrv.status != 'resolved'
          WHERE tj.job_id = $1
          GROUP BY tj.id, tm.mapping_name
        `, [jobId]);
        return jobResult.rows[0] || null;
        
      case 'targetFile':
        // Target files are synthetic nodes created from mapping configuration
        // Extract file name from nodeId (format: target-file-{filename})
        const targetFileName = nodeId.replace('target-file-', '');

        // Step 1: fetch the mapping record first so we have its project_id and
        // mapping_id — both needed to scope every subsequent DB query to the
        // correct project and prevent cross-project data leakage when multiple
        // projects share the same mapping_name or target_file_name.
        const mappingForTargetResult = await pool.query(`
          SELECT
            id,
            project_id,
            target_file_name,
            target_file_format,
            mapping_name,
            mapping_id,
            field_mappings
          FROM transformation_mappings
          WHERE target_file_name = $1
            AND ($2::integer IS NULL OR project_id = $2)
          ORDER BY id DESC
          LIMIT 1
        `, [targetFileName, projectId]);

        const mappingRow = mappingForTargetResult.rows[0] || null;

        if (mappingRow) {
          const mapping = mappingRow;

          // Step 2: search the Processed File Catalog (file_audit_details) to find
          // the actual output file produced by this mapping. The output filename
          // often differs from target_file_name (e.g. it carries a path prefix or
          // a different base name assigned at execution time). Matching by exact
          // mapping_id through the job chain is the safest link; mapping_name within
          // the same project is a secondary fallback for cases where the job record
          // is absent from file_audit_details.
          //
          // Both branches are hard-scoped to f.project_id = mapping.project_id to
          // prevent cross-project data exposure even when mapping names collide.
          if (mapping.mapping_name && mapping.project_id) {
            try {
              const auditFileResult = await pool.query(`
                SELECT f.*
                FROM file_audit_details fad
                JOIN files f ON fad.file_id = f.file_id
                LEFT JOIN transformation_jobs tj
                  ON fad.transformation_job_id = tj.id
                WHERE fad.file_role = 'target'
                  AND f.file_id IS NOT NULL
                  AND f.project_id = $3
                  AND (
                    -- Primary: exact mapping identity through the job chain
                    tj.mapping_id = $1
                    OR
                    -- Secondary: mapping_name match within the same project only
                    fad.mapping_name = $2
                  )
                ORDER BY fad.id DESC
                LIMIT 1
              `, [mapping.mapping_id, mapping.mapping_name, mapping.project_id]);

              if (auditFileResult.rows.length > 0) {
                // Real output file found — return it so the drawer can build a
                // working /profile/{file_id} redirect. Merge mapping identifiers
                // so the drawer can still display mapping_name / mapping_id.
                return {
                  ...auditFileResult.rows[0],
                  mapping_name: mapping.mapping_name,
                  mapping_id: mapping.mapping_id,
                };
              }
            } catch (auditLookupErr) {
              // Non-fatal: fall through to synthetic response below
              systemLogger.warn('targetFile audit lookup failed, using synthetic fallback', {
                mappingName: mapping.mapping_name,
                error: auditLookupErr.message,
              });
            }
          }

          // Parse field_mappings to extract target columns
          let columns = [];
          if (mapping.field_mappings) {
            let fieldMappings = mapping.field_mappings;
            if (typeof fieldMappings === 'string') {
              try {
                fieldMappings = JSON.parse(fieldMappings);
              } catch (e) {
                fieldMappings = [];
              }
            }
            if (Array.isArray(fieldMappings)) {
              columns = fieldMappings.map((fm, index) => ({
                column_name: fm.target_field || fm.targetField,
                column_type: fm.target_type || fm.targetType || 'string',
                column_index: index,
                precision: fm.precision || null,
                scale: fm.scale || null,
                governance_tags: []
              }));
            }
          }
          
          return {
            filename: `${mapping.target_file_name}.${mapping.target_file_format || 'csv'}`,
            file_format: mapping.target_file_format,
            mapping_name: mapping.mapping_name,
            mapping_id: mapping.mapping_id,
            is_synthetic: true,
            description: 'This target file will be created when the mapping is executed',
            columns: columns
          };
        }

        // VM fallback: the transformation_mappings row was deleted after
        // execution, so find the VM definition by inspecting graph_data directly.
        // file_audit_details does not reliably carry target-role VM records, so
        // we query visual_mapping_defs.graph_data (JSONB) instead.
        //
        // Three filename variants are checked so this works regardless of whether
        // config.fileName is stored with or without a file extension:
        //   1. Exact match  (config.fileName === targetFileName)
        //   2. Base + format match  (config.fileName + '.' + config.fileFormat === targetFileName)
        //   3. Stripped match  (config.fileName === targetFileName without extension)
        try {
          const baseNameOnly = targetFileName.replace(/\.[^.]+$/, '');
          const vmForTargetResult = await pool.query(`
            SELECT
              vmd.id            AS vm_id,
              vmd.name          AS vm_name,
              vmd.project_id,
              vmd.last_executed_at,
              vmd.execution_count,
              -- Extract orderedColumns from the targetRules node so the drawer
              -- can render the Columns section without a separate query.
              -- orderedColumns is a JSON array of column name strings saved by
              -- TargetRulesModal: config.orderedColumns = columns.map(c => c.name)
              (
                SELECT COALESCE(
                  n->'data'->'config'->'orderedColumns',
                  n->'config'->'orderedColumns'
                )
                FROM jsonb_array_elements(vmd.graph_data->'nodes') AS n
                WHERE n->>'type' = 'targetRules'
                LIMIT 1
              ) AS ordered_columns
            FROM visual_mapping_defs vmd
            WHERE vmd.is_active = true
              AND ($2::integer IS NULL OR vmd.project_id = $2)
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(vmd.graph_data->'nodes') AS n
                WHERE n->>'type' = 'targetRules'
                  AND (
                    -- 1. Exact filename match
                    COALESCE(n->'data'->'config'->>'fileName',
                             n->'config'->>'fileName') = $1
                    OR
                    -- 2. Base name + format match (config stores name without extension)
                    COALESCE(n->'data'->'config'->>'fileName',
                             n->'config'->>'fileName')
                      || '.'
                      || COALESCE(n->'data'->'config'->>'fileFormat',
                                  n->'config'->>'fileFormat', '')
                      = $1
                    OR
                    -- 3. Extension-stripped match (config stores name with extension)
                    COALESCE(n->'data'->'config'->>'fileName',
                             n->'config'->>'fileName') = $3
                  )
              )
            LIMIT 1
          `, [targetFileName, projectId, baseNameOnly]);

          if (vmForTargetResult.rows.length > 0) {
            const vm = vmForTargetResult.rows[0];

            // Fetch execution stats
            const vmExecForTargetResult = await pool.query(`
              SELECT
                vme.completed_at,
                vme.rows_processed,
                tj.rows_read,
                tj.rows_written
              FROM visual_mapping_executions vme
              LEFT JOIN transformation_jobs tj
                ON tj.job_id = vme.transformation_job_id
              WHERE vme.mapping_id = $1
                AND vme.status = 'completed'
              ORDER BY vme.completed_at DESC
              LIMIT 1
            `, [vm.vm_id]);

            // Build columns array from orderedColumns config.
            // orderedColumns is a JSON array of column name strings; column types
            // are not stored in graph_data, so we default to 'string'.
            let columns = [];
            try {
              const rawCols = vm.ordered_columns;
              if (Array.isArray(rawCols) && rawCols.length > 0) {
                columns = rawCols.map((name, idx) => ({
                  column_name: typeof name === 'string' ? name : String(name),
                  column_type: 'string',
                  column_index: idx,
                  governance_tags: []
                }));
              }
            } catch (_colErr) { /* non-fatal — columns are informational */ }

            // Enrich columns with real governance tags written by the VM execution.
            // Look up the output file in the files table by filename + project, then
            // join column_governance_tag_assignments to get tags per column name.
            if (columns.length > 0) {
              try {
                // The target filename may be stored with or without a path prefix.
                const fileRecordResult = await pool.query(`
                  SELECT f.file_id
                  FROM files f
                  WHERE ($1::integer IS NULL OR f.project_id = $1)
                    AND (f.filename = $2 OR f.filename LIKE '%/' || $2)
                  ORDER BY f.created_at DESC
                  LIMIT 1
                `, [vm.project_id, targetFileName]);

                if (fileRecordResult.rows.length > 0) {
                  const fileStringId = fileRecordResult.rows[0].file_id;
                  const tagsResult = await pool.query(`
                    SELECT cta.column_name,
                           array_agg(DISTINCT cta.tag_id) AS governance_tags
                    FROM column_governance_tag_assignments cta
                    WHERE cta.file_id = $1
                    GROUP BY cta.column_name
                  `, [fileStringId]);

                  if (tagsResult.rows.length > 0) {
                    const tagsByColumn = new Map(
                      tagsResult.rows.map(r => [r.column_name, r.governance_tags])
                    );
                    columns = columns.map(col => ({
                      ...col,
                      governance_tags: tagsByColumn.get(col.column_name) || []
                    }));
                  }
                }
              } catch (_tagErr) {
                systemLogger.warn('VM target file governance tag lookup failed', {
                  targetFileName,
                  error: _tagErr.message
                });
              }
            }

            const exec = vmExecForTargetResult.rows[0] || null;
            return {
              filename: targetFileName,
              mapping_name: `[VM] ${vm.vm_name}`,
              mapping_id: `vm-${vm.vm_id}-synthetic`,
              is_visual_mapping: true,
              is_synthetic: true,
              project_id: vm.project_id,
              last_run: exec?.completed_at || vm.last_executed_at,
              rows_written: exec?.rows_written ?? exec?.rows_processed ?? null,
              rows_read: exec?.rows_read ?? null,
              description: 'Output file produced by a visual mapping job',
              columns
            };
          }
        } catch (vmTargetErr) {
          systemLogger.warn('VM fallback for targetFile details failed', {
            targetFileName,
            error: vmTargetErr.message
          });
        }

        return null;
        
      case 'targetTable':
        // Target tables are synthetic nodes
        const targetTableName = nodeId.replace('table-', '');
        
        const mappingForTableResult = await pool.query(`
          SELECT 
            target_table_name,
            mapping_name,
            mapping_id
          FROM transformation_mappings
          WHERE target_table_name = $1
          LIMIT 1
        `, [targetTableName]);
        
        if (mappingForTableResult.rows.length > 0) {
          const mapping = mappingForTableResult.rows[0];
          return {
            table_name: mapping.target_table_name,
            mapping_name: mapping.mapping_name,
            mapping_id: mapping.mapping_id,
            is_synthetic: true,
            description: 'This target table will be populated when the mapping is executed'
          };
        }
        return null;
        
      case 'workflow':
        // Visual workflows
        const workflowId = nodeId.replace('workflow-', '');
        const workflowResult = await pool.query(`
          SELECT 
            vw.*,
            p.name as project_name,
            (
              SELECT COUNT(*) FROM jsonb_array_elements(vw.graph_data->'nodes')
            ) as node_count
          FROM visual_workflows vw
          LEFT JOIN projects p ON vw.project_id = p.id
          WHERE vw.id = $1
        `, [workflowId]);
        return workflowResult.rows[0] || null;
        
      case 'grouped':
        // Grouped nodes contain multiple child nodes - return summary info
        // The nodeId format is like "group-{pattern}" or contains child IDs in metadata
        return {
          id: nodeId,
          type: 'grouped',
          is_grouped: true,
          description: 'This is a grouped node containing multiple similar items. Click "Expand" to see individual items.'
        };
        
      default:
        return null;
    }
  } catch (error) {
    systemLogger.error('Error getting node details', { nodeId, nodeType, error: error.message });
    throw error;
  }
}

module.exports = {
  buildLineageGraph,
  getNodeDetails,
  extractDerivedColumns
};
