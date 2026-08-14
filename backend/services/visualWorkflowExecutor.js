const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');
const { executeMappingGroup } = require('./mappingGroupExecutionEngine');
const { executeNStepWorkflow } = require('./nStepWorkflowExecutionEngine');
const { v4: uuidv4 } = require('uuid');

class VisualWorkflowExecutor {
  constructor(workflowId, userId) {
    this.workflowId = workflowId;
    this.userId = userId;
    this.executionResults = new Map();
    this.executionErrors = new Map();
    this.executionId = `VWFL-${Date.now()}-${uuidv4().substring(0, 8)}`;
    this.executionDbId = null; // Will be set after creating execution record
  }

  async execute() {
    const startTime = Date.now();
    
    try {
      const workflow = await this.loadWorkflow();
      
      if (!workflow) {
        throw new Error(`Visual workflow ${this.workflowId} not found`);
      }

      const { nodes, edges } = workflow.graph_data;
      
      // Create execution record
      const executionRecord = await pool.query(`
        INSERT INTO visual_workflow_executions 
        (workflow_id, execution_id, status, total_nodes, triggered_by, project_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        this.workflowId,
        this.executionId,
        'running',
        nodes.length,
        this.userId,
        workflow.project_id
      ]);
      
      this.executionDbId = executionRecord.rows[0].id;

      systemLogger.info('Starting visual workflow execution', {
        workflowId: this.workflowId,
        executionId: this.executionId,
        executionDbId: this.executionDbId,
        name: workflow.name,
        nodeCount: nodes.length,
        edgeCount: edges.length
      });
      
      if (nodes.length === 0) {
        await this.updateExecutionRecord('completed', startTime, {});
        systemLogger.warn('Visual workflow has no nodes to execute', { workflowId: this.workflowId });
        return { success: true, message: 'No nodes to execute', results: {}, executionId: this.executionId };
      }

      const executionOrder = this.topologicalSort(nodes, edges);
      
      systemLogger.info('Determined execution order', {
        workflowId: this.workflowId,
        executionId: this.executionId,
        executionOrder: executionOrder.map(n => ({ id: n.id, type: n.type, assetId: n.data?.assetId }))
      });

      // Always use smart parallel execution (respects dependencies)
      await this.executeSmartParallel(executionOrder, edges);

      const summary = this.generateExecutionSummary();
      
      // Update execution record with final status
      const finalStatus = summary.failedCount === 0 ? 'completed' : 'failed';
      await this.updateExecutionRecord(finalStatus, startTime, summary);
      
      systemLogger.info('Visual workflow execution completed', {
        workflowId: this.workflowId,
        executionId: this.executionId,
        summary
      });

      return {
        success: summary.failedCount === 0,
        executionId: this.executionId,
        executionDbId: this.executionDbId,
        summary,
        results: Object.fromEntries(this.executionResults),
        errors: Object.fromEntries(this.executionErrors)
      };

    } catch (error) {
      // Update execution record with error
      try {
        await this.updateExecutionRecord('failed', startTime, null, error.message);
      } catch (updateError) {
        systemLogger.error('Failed to update execution record on error', {
          workflowId: this.workflowId,
          executionId: this.executionId,
          updateError: updateError.message
        });
      }
      
      systemLogger.error('Visual workflow execution failed', {
        workflowId: this.workflowId,
        executionId: this.executionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  async updateExecutionRecord(status, startTime, summary = null, errorMessage = null) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    
    await pool.query(`
      UPDATE visual_workflow_executions
      SET status = $1,
          end_time = CURRENT_TIMESTAMP,
          duration_ms = $2,
          completed_nodes = $3,
          failed_nodes = $4,
          execution_summary = $5,
          error_message = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [
      status,
      durationMs,
      summary?.successCount || 0,
      summary?.failedCount || 0,
      summary ? JSON.stringify(summary) : null,
      errorMessage,
      this.executionDbId
    ]);
  }

  async loadWorkflow() {
    const result = await pool.query(
      'SELECT * FROM visual_workflows WHERE id = $1 AND is_active = true',
      [this.workflowId]
    );
    return result.rows[0];
  }

  topologicalSort(nodes, edges) {
    const graph = new Map();
    const inDegree = new Map();
    const nodeMap = new Map();

    nodes.forEach(node => {
      nodeMap.set(node.id, node);
      graph.set(node.id, []);
      inDegree.set(node.id, 0);
    });

    edges.forEach(edge => {
      if (graph.has(edge.source) && graph.has(edge.target)) {
        graph.get(edge.source).push(edge.target);
        inDegree.set(edge.target, inDegree.get(edge.target) + 1);
      }
    });

    const queue = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    const sorted = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      sorted.push(nodeMap.get(nodeId));

      const neighbors = graph.get(nodeId) || [];
      neighbors.forEach(neighborId => {
        inDegree.set(neighborId, inDegree.get(neighborId) - 1);
        if (inDegree.get(neighborId) === 0) {
          queue.push(neighborId);
        }
      });
    }

    if (sorted.length !== nodes.length) {
      const cycleNodes = nodes.filter(n => !sorted.includes(n));
      throw new Error(`Cycle detected in workflow graph. Nodes involved: ${cycleNodes.map(n => n.id).join(', ')}`);
    }

    return sorted;
  }

  async executeSmartParallel(nodes, edges) {
    const graph = new Map();
    const completed = new Set();

    nodes.forEach(node => {
      graph.set(node.id, []);
    });

    edges.forEach(edge => {
      if (graph.has(edge.source)) {
        graph.get(edge.source).push(edge.target);
      }
    });

    const canExecute = (nodeId) => {
      const dependencies = edges
        .filter(e => e.target === nodeId)
        .map(e => e.source);
      
      return dependencies.every(depId => completed.has(depId));
    };

    const executeLevel = async () => {
      const readyNodes = nodes.filter(node => 
        !completed.has(node.id) && canExecute(node.id)
      );

      if (readyNodes.length === 0) {
        return false;
      }

      systemLogger.info('Executing batch of independent nodes in parallel', {
        workflowId: this.workflowId,
        batchSize: readyNodes.length,
        nodeIds: readyNodes.map(n => n.id)
      });

      await Promise.all(
        readyNodes.map(async (node) => {
          await this.executeNode(node);
          completed.add(node.id);
        })
      );

      return true;
    };

    while (completed.size < nodes.length) {
      const hasMore = await executeLevel();
      if (!hasMore && completed.size < nodes.length) {
        throw new Error('Unable to complete execution - possible cycle or missing dependencies');
      }
    }
  }

  async executeNode(node) {
    const { type, data } = node;
    const assetId = data?.assetId;
    const assetType = data?.assetType || type; // Support both assetType and type fields

    // Handle decorative Start/Stop nodes - they have no execution logic
    if (assetType === 'start' || assetType === 'stop' || type === 'start' || type === 'stop') {
      systemLogger.info('Skipping decorative node (no execution needed)', {
        workflowId: this.workflowId,
        nodeId: node.id,
        type,
        assetType,
        label: data?.label
      });
      this.executionResults.set(node.id, {
        success: true,
        type: assetType || type,
        skipped: true,
        reason: 'Decorative node - no execution required'
      });
      return;
    }

    if (!assetId) {
      const error = `Node ${node.id} missing asset ID`;
      systemLogger.error('Node validation failed', { 
        workflowId: this.workflowId,
        nodeId: node.id,
        error,
        nodeData: data,
        nodeType: type
      });
      this.executionErrors.set(node.id, error);
      return;
    }

    try {
      systemLogger.info('Starting node execution', {
        workflowId: this.workflowId,
        nodeId: node.id,
        type,
        assetType,
        assetId,
        label: data?.label
      });

      let result;

      // Support both old and new node type naming
      const nodeType = assetType || type;
      
      switch (nodeType) {
        case 'transformation_mapping':
        case 'mapping':
        case 'job':
        case 'mapping_job': // Backward compatibility
          systemLogger.debug('Executing mapping node', { nodeId: node.id, mappingId: assetId });
          result = await this.executeMapping(assetId);
          break;
        
        case 'mapping_group':
        case 'job_group': // Backward compatibility
          systemLogger.debug('Executing mapping group node', { nodeId: node.id, groupId: assetId });
          result = await this.executeMappingGroup(assetId);
          break;
        
        case 'workflow':
          systemLogger.debug('Executing workflow node', { nodeId: node.id, workflowId: assetId });
          result = await this.executeWorkflow(assetId);
          break;
        
        default:
          throw new Error(`Unknown node type: ${nodeType}. Supported types: transformation_mapping, mapping, job, mapping_job, mapping_group, job_group, workflow`);
      }

      this.executionResults.set(node.id, result);

      systemLogger.info('Node execution completed successfully', {
        workflowId: this.workflowId,
        nodeId: node.id,
        type,
        assetType,
        assetId,
        label: data?.label,
        success: result.success,
        resultType: result.type
      });

    } catch (error) {
      systemLogger.error('Node execution failed with error', {
        workflowId: this.workflowId,
        nodeId: node.id,
        type,
        assetType,
        assetId,
        label: data?.label,
        error: error.message,
        errorStack: error.stack,
        errorName: error.name
      });
      this.executionErrors.set(node.id, {
        message: error.message,
        stack: error.stack,
        nodeId: node.id,
        assetId,
        assetType
      });
    }
  }

  async executeMapping(mappingId) {
    // First, try to find as a visual mapping (from visual_mapping_defs)
    // These are the mappings shown in the workflow builder sidebar
    const visualMappingResult = await pool.query(
      'SELECT * FROM visual_mapping_defs WHERE id = $1 AND is_active = true',
      [mappingId]
    );

    if (visualMappingResult.rows.length > 0) {
      // It's a visual mapping - execute using the visual mapping execution flow
      const visualMapping = visualMappingResult.rows[0];
      
      systemLogger.info('Executing visual mapping from workflow', {
        workflowId: this.workflowId,
        visualMappingId: mappingId,
        visualMappingName: visualMapping.name
      });
      
      // Import the visual mapping compiler
      const visualMappingCompiler = require('./visualMappingCompiler');
      
      // Parse graph data if needed
      let graphData = visualMapping.graph_data;
      if (typeof graphData === 'string') {
        graphData = JSON.parse(graphData);
      }
      visualMapping.graph_data = graphData;
      
      // Compile the visual mapping
      const compilationResult = visualMappingCompiler.compile(visualMapping);
      
      if (!compilationResult.success) {
        throw new Error(`Visual mapping compilation failed: ${compilationResult.errors?.join(', ') || 'Unknown error'}`);
      }
      
      // Extract the compiled transformation mapping
      const transformationMapping = compilationResult.transformationMapping;
      
      // Create a temporary transformation mapping for execution (same flow as route handler)
      const tempMappingId = `vm-${mappingId}-${Date.now()}`;
      
      // Handle source exclusivity constraint
      const vendorAgreementId = transformationMapping.vendor_agreement_id || null;
      const sourceConnectionId = vendorAgreementId ? null : transformationMapping.source_connection_id;
      
      // Determine RDM lookup settings
      const hasRdmConfigArrays = (transformationMapping.rdm_dataset_configs?.length > 0) || 
                                  (transformationMapping.rdm_crosswalk_configs?.length > 0);
      const hasRdmConfig = hasRdmConfigArrays || 
                           !!(transformationMapping.rdm_dataset_config || transformationMapping.rdm_crosswalk_config);
      const hasRdmNodes = visualMapping.graph_data?.nodes?.some(n => n.type === 'rdmLookup') || false;
      const rdmLookupEnabled = hasRdmConfig || hasRdmNodes;
      
      // Prepare RDM configs for storage
      const rdmDatasetConfigsToStore = transformationMapping.rdm_dataset_configs?.length > 0 
        ? transformationMapping.rdm_dataset_configs 
        : (transformationMapping.rdm_dataset_config ? [transformationMapping.rdm_dataset_config] : null);
      const rdmCrosswalkConfigsToStore = transformationMapping.rdm_crosswalk_configs?.length > 0 
        ? transformationMapping.rdm_crosswalk_configs 
        : (transformationMapping.rdm_crosswalk_config ? [transformationMapping.rdm_crosswalk_config] : null);
      
      // Insert temporary transformation mapping
      const transformResult = await pool.query(
        `INSERT INTO transformation_mappings (
          mapping_id, mapping_name, description, project_id, sub_project_id,
          source_connection_id, file_path, source_file_pattern,
          target_connection_id, target_file_path, target_file_name, target_file_format,
          field_mappings, variables, pii_columns,
          rdm_lookup_enabled, rdm_dataset_config, rdm_crosswalk_config,
          schema_drift_handling, violation_handling,
          created_by, is_visual_mapping, visual_mapping_id, is_temporary,
          vendor_agreement_id,
          source_catalog, join_specs, has_multi_source_join, primary_source_node_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, true, $22, true, $23, $24, $25, $26, $27
        ) RETURNING id`,
        [
          tempMappingId,
          `[VM] ${transformationMapping.name || visualMapping.name}`,
          transformationMapping.description || visualMapping.description,
          transformationMapping.project_id || visualMapping.project_id,
          transformationMapping.sub_project_id || visualMapping.sub_project_id,
          sourceConnectionId,
          transformationMapping.source_file_path,
          transformationMapping.source_file_pattern || '*',
          transformationMapping.target_connection_id,
          transformationMapping.target_file_path,
          transformationMapping.target_file_name,
          transformationMapping.target_file_format || 'csv',
          JSON.stringify(transformationMapping.field_mappings || []),
          JSON.stringify(transformationMapping.variables || {}),
          JSON.stringify(transformationMapping.pii_columns || []),
          rdmLookupEnabled,
          rdmDatasetConfigsToStore ? JSON.stringify(rdmDatasetConfigsToStore) : null,
          rdmCrosswalkConfigsToStore ? JSON.stringify(rdmCrosswalkConfigsToStore) : null,
          transformationMapping.schema_drift_handling || 'warn',
          transformationMapping.violation_handling || 'continue',
          this.userId,
          mappingId,
          vendorAgreementId,
          JSON.stringify(transformationMapping.source_catalog || []),
          JSON.stringify(transformationMapping.join_specs || []),
          transformationMapping.has_multi_source_join || false,
          transformationMapping.primary_source_node_id || null
        ]
      );
      
      const transformationDbId = transformResult.rows[0].id;

      // Persist DQ rule associations so the job engine enforces them.
      // qualityRuleIds comes from targetRules.selectedQualityRules + expression node dqRuleAssignments.
      const qualityRuleIds = transformationMapping.quality_rule_ids || [];
      if (qualityRuleIds.length > 0) {
        for (const ruleId of qualityRuleIds) {
          await pool.query(
            `INSERT INTO transformation_quality_rules (mapping_id, quality_rule_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [transformationDbId, ruleId]
          );
        }
        systemLogger.info('Inserted DQ rule associations for VM temp mapping', {
          transformationDbId,
          ruleCount: qualityRuleIds.length
        });
      }

      systemLogger.info('Created temp transformation mapping for workflow execution', {
        workflowId: this.workflowId,
        tempMappingId,
        transformationDbId,
        visualMappingId: mappingId
      });
      
      // Execute using the job execution engine
      let jobResult;
      try {
        jobResult = await executeTransformationJob(pool, tempMappingId, this.userId, {
          visualWorkflowExecutionId: this.executionDbId,
          visualMappingNodes: visualMapping.graph_data.nodes,
          visualMappingEdges: visualMapping.graph_data.edges,
          nodeExecutionMap: transformationMapping.node_execution_map,
          executionOrder: compilationResult.executionOrder,
          skipInternalCleanup: true
        });
      } finally {
        // Always clean up temporary transformation mapping
        await pool.query(
          `DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true`,
          [tempMappingId]
        );
      }
      
      return {
        success: true,
        type: 'visual_mapping',
        assetId: mappingId,
        assetName: visualMapping.name,
        jobId: jobResult.jobId,
        rowsWritten: jobResult.rowsWritten
      };
    }
    
    // Fall back to transformation_mappings table (legacy mappings)
    const mappingResult = await pool.query(
      'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
      [mappingId]
    );

    if (mappingResult.rows.length === 0) {
      throw new Error(`Mapping ${mappingId} not found in visual_mapping_defs or transformation_mappings`);
    }

    const mapping = mappingResult.rows[0];
    
    // Execute transformation job with visual workflow execution ID
    const jobResult = await executeTransformationJob(pool, mappingId, this.userId, {
      visualWorkflowExecutionId: this.executionDbId
    });
    
    return {
      success: true,
      type: 'mapping',
      assetId: mappingId,
      assetName: mapping.mapping_name,
      jobId: jobResult.job_id
    };
  }

  async executeMappingGroup(mappingGroupId) {
    const groupResult = await pool.query(
      'SELECT * FROM mapping_groups WHERE id = $1',
      [mappingGroupId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error(`Mapping group ${mappingGroupId} not found`);
    }

    const group = groupResult.rows[0];
    
    const result = await executeMappingGroup(mappingGroupId, this.userId);
    
    return {
      success: true,
      type: 'mapping_group',
      assetId: mappingGroupId,
      assetName: group.name,
      executedMappings: result.executedMappings || 0
    };
  }

  async executeWorkflow(workflowId) {
    // First, try to find it as a visual workflow
    const visualWorkflowResult = await pool.query(
      'SELECT * FROM visual_workflows WHERE id = $1 AND is_active = true',
      [workflowId]
    );

    if (visualWorkflowResult.rows.length > 0) {
      // It's a visual workflow - execute it recursively
      const visualWorkflow = visualWorkflowResult.rows[0];
      
      systemLogger.info('Executing nested visual workflow', {
        parentWorkflowId: this.workflowId,
        nestedWorkflowId: workflowId,
        nestedWorkflowName: visualWorkflow.name
      });
      
      const nestedExecutor = new VisualWorkflowExecutor(workflowId, this.userId);
      const result = await nestedExecutor.execute();
      
      return {
        success: result.success,
        type: 'visual_workflow',
        assetId: workflowId,
        assetName: visualWorkflow.name,
        nestedResult: result
      };
    }

    // If not a visual workflow, try n-step workflow
    const nStepWorkflowResult = await pool.query(
      'SELECT * FROM workflows WHERE id = $1',
      [workflowId]
    );

    if (nStepWorkflowResult.rows.length > 0) {
      const nStepWorkflow = nStepWorkflowResult.rows[0];
      
      systemLogger.info('Executing nested n-step workflow', {
        parentWorkflowId: this.workflowId,
        nestedWorkflowId: workflowId,
        nestedWorkflowName: nStepWorkflow.name
      });
      
      const result = await executeNStepWorkflow(workflowId, this.userId);
      
      return {
        success: true,
        type: 'n_step_workflow',
        assetId: workflowId,
        assetName: nStepWorkflow.name,
        result
      };
    }

    throw new Error(`Workflow ${workflowId} not found in visual_workflows or workflows table`);
  }

  generateExecutionSummary() {
    const totalNodes = this.executionResults.size + this.executionErrors.size;
    const successCount = this.executionResults.size;
    const failedCount = this.executionErrors.size;

    // Build detailed node status map
    const nodeStatuses = {};
    
    // Add successful nodes
    for (const [nodeId, result] of this.executionResults.entries()) {
      nodeStatuses[nodeId] = {
        status: 'completed',
        success: result.success,
        type: result.type,
        assetId: result.assetId,
        assetName: result.assetName,
        jobId: result.jobId,
        executedMappings: result.executedMappings
      };
    }
    
    // Add failed nodes
    for (const [nodeId, error] of this.executionErrors.entries()) {
      nodeStatuses[nodeId] = {
        status: 'failed',
        success: false,
        error: typeof error === 'string' ? error : error.message,
        errorDetails: typeof error === 'object' ? error : null
      };
    }

    return {
      totalNodes,
      successCount,
      failedCount,
      successRate: totalNodes > 0 ? (successCount / totalNodes * 100).toFixed(2) : 0,
      nodeStatuses  // Include detailed per-node execution status
    };
  }
}

async function executeVisualWorkflow(workflowId, userId) {
  const executor = new VisualWorkflowExecutor(workflowId, userId);
  return await executor.execute();
}

module.exports = {
  VisualWorkflowExecutor,
  executeVisualWorkflow
};
