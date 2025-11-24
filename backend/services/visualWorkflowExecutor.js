const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');
const { executeMappingGroup } = require('./mappingGroupExecutionEngine');
const { executeNStepWorkflow } = require('./nStepWorkflowExecutionEngine');

class VisualWorkflowExecutor {
  constructor(workflowId, userId) {
    this.workflowId = workflowId;
    this.userId = userId;
    this.executionResults = new Map();
    this.executionErrors = new Map();
  }

  async execute() {
    try {
      const workflow = await this.loadWorkflow();
      
      if (!workflow) {
        throw new Error(`Visual workflow ${this.workflowId} not found`);
      }

      systemLogger.info('Starting visual workflow execution', {
        workflowId: this.workflowId,
        name: workflow.name,
        nodeCount: workflow.graph_data.nodes.length,
        edgeCount: workflow.graph_data.edges.length
      });

      const { nodes, edges } = workflow.graph_data;
      
      if (nodes.length === 0) {
        systemLogger.warn('Visual workflow has no nodes to execute', { workflowId: this.workflowId });
        return { success: true, message: 'No nodes to execute', results: {} };
      }

      const executionOrder = this.topologicalSort(nodes, edges);
      
      systemLogger.info('Determined execution order', {
        workflowId: this.workflowId,
        executionOrder: executionOrder.map(n => ({ id: n.id, type: n.type, assetId: n.data?.assetId }))
      });

      // Always use smart parallel execution (respects dependencies)
      await this.executeSmartParallel(executionOrder, edges);

      const summary = this.generateExecutionSummary();
      
      systemLogger.info('Visual workflow execution completed', {
        workflowId: this.workflowId,
        summary
      });

      return {
        success: summary.failedCount === 0,
        summary,
        results: Object.fromEntries(this.executionResults),
        errors: Object.fromEntries(this.executionErrors)
      };

    } catch (error) {
      systemLogger.error('Visual workflow execution failed', {
        workflowId: this.workflowId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
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

    if (!assetId) {
      const error = `Node ${node.id} missing asset ID`;
      systemLogger.error(error, { node });
      this.executionErrors.set(node.id, error);
      return;
    }

    try {
      systemLogger.info('Executing node', {
        nodeId: node.id,
        type,
        assetType,
        assetId
      });

      let result;

      // Support both old and new node type naming
      const nodeType = assetType || type;
      
      switch (nodeType) {
        case 'transformation_mapping':
        case 'mapping':
        case 'job':
        case 'mapping_job': // Backward compatibility
          result = await this.executeMapping(assetId);
          break;
        
        case 'mapping_group':
        case 'job_group': // Backward compatibility
          result = await this.executeMappingGroup(assetId);
          break;
        
        case 'workflow':
          result = await this.executeWorkflow(assetId);
          break;
        
        default:
          throw new Error(`Unknown node type: ${nodeType}`);
      }

      this.executionResults.set(node.id, result);

      systemLogger.info('Node execution completed', {
        nodeId: node.id,
        type,
        assetType,
        assetId,
        success: result.success
      });

    } catch (error) {
      systemLogger.error('Node execution failed', {
        nodeId: node.id,
        type,
        assetType,
        assetId,
        error: error.message
      });
      this.executionErrors.set(node.id, error.message);
    }
  }

  async executeMapping(mappingId) {
    const mappingResult = await pool.query(
      'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
      [mappingId]
    );

    if (mappingResult.rows.length === 0) {
      throw new Error(`Mapping ${mappingId} not found`);
    }

    const mapping = mappingResult.rows[0];
    
    // Execute transformation job with proper parameters
    const jobResult = await executeTransformationJob(pool, mappingId, this.userId, {
      workflowExecutionId: null  // Visual workflows don't have execution IDs yet
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

    return {
      totalNodes,
      successCount,
      failedCount,
      successRate: totalNodes > 0 ? (successCount / totalNodes * 100).toFixed(2) : 0
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
