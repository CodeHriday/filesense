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
  
  // Find jobs that executed this mapping
  const jobsResult = await pool.query(`
    SELECT 
      tj.id,
      tj.job_id,
      tj.status,
      tj.start_time,
      tj.end_time,
      tj.duration_ms,
      tj.rows_read,
      tj.rows_written,
      tj.rows_failed,
      tj.error_message
    FROM transformation_jobs tj
    WHERE tj.mapping_id = $1
    ORDER BY tj.start_time DESC
    LIMIT 10
  `, [mappingId]);
  
  // Traverse most recent successful job
  const successfulJob = jobsResult.rows.find(j => j.status === 'completed');
  if (successfulJob) {
    await traverseFromJob(successfulJob.job_id, projectId, nodes, edges, visited, depth - 1, filters);
    
    // Add edge from mapping to job
    edges.push({
      id: `${nodeId}-to-job-${successfulJob.job_id}`,
      source: nodeId,
      target: `job-${successfulJob.job_id}`,
      relationship: 'EXECUTED_BY',
      label: 'executed by'
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
  
  if (jobResult.rows.length === 0) return;
  
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
  
  systemLogger.info('Finding workflows for mappings', {
    numericIdCount: numericIds.size,
    stringIdCount: stringIds.size,
    nameCount: names.size,
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
        // Match by numeric ID
        if (numericIds.has(Number(assetId))) {
          matchingMappings.push({ assetId, matchType: 'numericId' });
          continue;
        }
        // Match by string mapping_id
        if (stringIds.has(String(assetId))) {
          matchingMappings.push({ assetId, matchType: 'stringId' });
          continue;
        }
        // Match by name
        if (assetLabel && names.has(assetLabel)) {
          matchingMappings.push({ assetId, matchType: 'name', name: assetLabel });
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
        const lineageNode = nodes.find(n => 
          n.type === 'transformation' && 
          (n.metadata?.id === Number(match.assetId) || 
           n.metadata?.mappingId === String(match.assetId) ||
           n.label === match.name)
        );
        
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
        
        return fileData;
        
      case 'transformation':
        const mappingId = nodeId.replace('mapping-', '');
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
