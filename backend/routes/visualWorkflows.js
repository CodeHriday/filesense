const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeVisualWorkflow } = require('../services/visualWorkflowExecutor');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

// Project-membership subquery used by non-admin scoping
const PROJECT_ACCESS_SUBQUERY = `(
  SELECT pm.project_id FROM project_members pm WHERE pm.user_id = $1
  UNION
  SELECT pag.project_id FROM access_group_members agm
  JOIN project_access_groups pag ON agm.group_id = pag.group_id
  WHERE agm.user_id = $1
)`;

router.get('/', async (req, res) => {
  try {
    const isAdmin = userHasAdminAccess(req.user);
    let result;

    if (isAdmin) {
      // Admins see all active workflows across all projects
      result = await pool.query(
        `SELECT 
          vw.id, vw.name, vw.description, vw.graph_data, 
          vw.created_at, vw.updated_at, vw.is_active,
          vw.project_id, vw.sub_project_id,
          p.name as project_name,
          sp.name as sub_project_name
         FROM visual_workflows vw
         LEFT JOIN projects p ON vw.project_id = p.id
         LEFT JOIN projects sp ON vw.sub_project_id = sp.id
         WHERE vw.is_active = true
         ORDER BY vw.created_at DESC`
      );
    } else {
      // Non-admins see workflows in projects they are a member of
      // (direct project_members or via access_group_members → project_access_groups)
      // plus any workflows they personally created (in case project_id is null)
      result = await pool.query(
        `SELECT 
          vw.id, vw.name, vw.description, vw.graph_data, 
          vw.created_at, vw.updated_at, vw.is_active,
          vw.project_id, vw.sub_project_id,
          p.name as project_name,
          sp.name as sub_project_name
         FROM visual_workflows vw
         LEFT JOIN projects p ON vw.project_id = p.id
         LEFT JOIN projects sp ON vw.sub_project_id = sp.id
         WHERE vw.is_active = true
         AND (
           vw.created_by = $1
           OR vw.project_id IN ${PROJECT_ACCESS_SUBQUERY}
         )
         ORDER BY vw.created_at DESC`,
        [req.user.id]
      );
    }

    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Failed to fetch visual workflows', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch visual workflows' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = userHasAdminAccess(req.user);
    let result;

    if (isAdmin) {
      result = await pool.query(
        `SELECT 
          vw.*,
          p.name as project_name,
          sp.name as sub_project_name
         FROM visual_workflows vw
         LEFT JOIN projects p ON vw.project_id = p.id
         LEFT JOIN projects sp ON vw.sub_project_id = sp.id
         WHERE vw.id = $1 AND vw.is_active = true`,
        [id]
      );
    } else {
      // Non-admins can open a workflow if they created it or belong to its project
      result = await pool.query(
        `SELECT 
          vw.*,
          p.name as project_name,
          sp.name as sub_project_name
         FROM visual_workflows vw
         LEFT JOIN projects p ON vw.project_id = p.id
         LEFT JOIN projects sp ON vw.sub_project_id = sp.id
         WHERE vw.id = $1 AND vw.is_active = true
         AND (
           vw.created_by = $2
           OR vw.project_id IN (
             SELECT pm.project_id FROM project_members pm WHERE pm.user_id = $2
             UNION
             SELECT pag.project_id FROM access_group_members agm
             JOIN project_access_groups pag ON agm.group_id = pag.group_id
             WHERE agm.user_id = $2
           )
         )`,
        [id, req.user.id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual workflow not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to fetch visual workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch visual workflow' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, graph_data, project_id, sub_project_id } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    const validation = validateGraph(graph_data);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await pool.query(
      `INSERT INTO visual_workflows (name, description, graph_data, project_id, sub_project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || '', JSON.stringify(graph_data), project_id || null, sub_project_id || null, req.user.id]
    );

    systemLogger.info('Created visual workflow', {
      workflowId: result.rows[0].id,
      name,
      projectId: project_id,
      userId: req.user.id
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to create visual workflow', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to create visual workflow' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, graph_data, project_id, sub_project_id } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    const validation = validateGraph(graph_data);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await pool.query(
      `UPDATE visual_workflows
       SET name = $1, description = $2, graph_data = $3, project_id = $4, sub_project_id = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND created_by = $7 AND is_active = true
       RETURNING *`,
      [name, description || '', JSON.stringify(graph_data), project_id || null, sub_project_id || null, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual workflow not found' });
    }

    systemLogger.info('Updated visual workflow', {
      workflowId: id,
      name,
      projectId: project_id,
      userId: req.user.id
    });

    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to update visual workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to update visual workflow' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE visual_workflows SET is_active = false WHERE id = $1 AND created_by = $2 RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual workflow not found' });
    }

    systemLogger.info('Deleted visual workflow', {
      workflowId: id,
      userId: req.user.id
    });

    res.json({ message: 'Visual workflow deleted successfully' });
  } catch (error) {
    systemLogger.error('Failed to delete visual workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to delete visual workflow' });
  }
});

router.post('/:id/execute', async (req, res) => {
  try {
    // Check if user has workflow:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('workflow:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to execute workflows. Contact your administrator.'
      });
    }
    
    const { id } = req.params;
    const { async: runAsync } = req.body; // Support async execution mode

    const workflowCheck = await pool.query(
      'SELECT id, name FROM visual_workflows WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (workflowCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Visual workflow not found' });
    }

    systemLogger.info('Starting visual workflow execution', {
      workflowId: id,
      userId: req.user.id,
      asyncMode: !!runAsync
    });

    // Check if there's already a running execution for this workflow
    const runningCheck = await pool.query(
      `SELECT id, execution_id FROM visual_workflow_executions 
       WHERE workflow_id = $1 AND status = 'running' 
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    
    if (runningCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Workflow is already executing',
        executionId: runningCheck.rows[0].execution_id,
        message: 'Please wait for the current execution to complete or check its status.'
      });
    }

    // Create executor instance to get execution ID immediately
    const { VisualWorkflowExecutor } = require('../services/visualWorkflowExecutor');
    const executor = new VisualWorkflowExecutor(parseInt(id), req.user.id);
    const executionId = executor.executionId;

    // Create an initial execution log record to track this run
    const runId = `wfrun-${Date.now()}`;
    await pool.query(
      `INSERT INTO visual_workflow_execution_logs 
       (workflow_id, run_id, run_name, started_at, status, logs, execution_id)
       VALUES ($1, $2, $3, NOW(), 'running', $4, $5)`,
      [id, runId, workflowCheck.rows[0].name, JSON.stringify([
        { timestamp: new Date().toISOString(), level: 'INFO', message: `Starting workflow execution: ${workflowCheck.rows[0].name}` }
      ]), executionId]
    );

    // Run execution in background (fire and forget)
    setImmediate(async () => {
      try {
        const result = await executor.execute();
        
        // Update the execution log with final results
        const finalLogs = [
          { timestamp: new Date().toISOString(), level: 'INFO', message: `Starting workflow execution: ${workflowCheck.rows[0].name}` },
          { timestamp: new Date().toISOString(), level: 'INFO', message: `Total nodes: ${result.summary?.totalNodes || 0}` }
        ];
        
        // Add node status logs
        if (result.summary?.nodeStatuses) {
          Object.entries(result.summary.nodeStatuses).forEach(([nodeId, status]) => {
            if (status.skipped) {
              finalLogs.push({ timestamp: new Date().toISOString(), level: 'INFO', message: `[SKIP] Node ${nodeId}: ${status.reason || 'Decorative node'}` });
            } else if (status.success) {
              finalLogs.push({ timestamp: new Date().toISOString(), level: 'INFO', message: `[SUCCESS] ${status.assetName || nodeId}: Completed` });
            } else {
              finalLogs.push({ timestamp: new Date().toISOString(), level: 'ERROR', message: `[FAILED] ${nodeId}: ${status.error || 'Unknown error'}` });
            }
          });
        }
        
        finalLogs.push({ 
          timestamp: new Date().toISOString(), 
          level: result.success ? 'INFO' : 'ERROR', 
          message: result.success 
            ? `Workflow completed successfully: ${result.summary?.successCount}/${result.summary?.totalNodes} nodes` 
            : `Workflow completed with errors: ${result.summary?.failedCount}/${result.summary?.totalNodes} failed`
        });
        
        await pool.query(
          `UPDATE visual_workflow_execution_logs 
           SET status = $1, logs = $2 
           WHERE workflow_id = $3 AND execution_id = $4`,
          [result.success ? 'success' : 'failed', JSON.stringify(finalLogs), id, executionId]
        );
        
        systemLogger.info('Background workflow execution completed', {
          workflowId: id,
          executionId,
          success: result.success
        });
      } catch (error) {
        // Update execution log with error
        await pool.query(
          `UPDATE visual_workflow_execution_logs 
           SET status = 'failed', logs = $1 
           WHERE workflow_id = $2 AND execution_id = $3`,
          [JSON.stringify([
            { timestamp: new Date().toISOString(), level: 'INFO', message: `Starting workflow execution: ${workflowCheck.rows[0].name}` },
            { timestamp: new Date().toISOString(), level: 'ERROR', message: `Execution failed: ${error.message}` }
          ]), id, executionId]
        );
        
        systemLogger.error('Background workflow execution failed', {
          workflowId: id,
          executionId,
          error: error.message
        });
      }
    });

    // Return immediately with execution ID
    res.json({
      message: 'Workflow execution started',
      workflowId: id,
      workflowName: workflowCheck.rows[0].name,
      executionId: executionId,
      runId: runId,
      status: 'running',
      async: true
    });

  } catch (error) {
    systemLogger.error('Failed to start visual workflow execution', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: error.message || 'Failed to execute visual workflow' });
  }
});

// Get execution status by execution ID
router.get('/:id/execution-status/:executionId', async (req, res) => {
  try {
    const { id, executionId } = req.params;
    
    // Check execution logs table for the run
    const logResult = await pool.query(
      `SELECT run_id, run_name, started_at, status, logs, execution_id
       FROM visual_workflow_execution_logs
       WHERE workflow_id = $1 AND execution_id = $2`,
      [id, executionId]
    );
    
    if (logResult.rows.length > 0) {
      const row = logResult.rows[0];
      return res.json({
        executionId: row.execution_id,
        runId: row.run_id,
        runName: row.run_name,
        startedAt: row.started_at,
        status: row.status,
        logs: row.logs || [],
        isComplete: row.status !== 'running'
      });
    }
    
    // Also check the visual_workflow_executions table for more details
    const execResult = await pool.query(
      `SELECT * FROM visual_workflow_executions
       WHERE workflow_id = $1 AND execution_id = $2`,
      [id, executionId]
    );
    
    if (execResult.rows.length > 0) {
      const exec = execResult.rows[0];
      return res.json({
        executionId: exec.execution_id,
        status: exec.status,
        startTime: exec.start_time,
        endTime: exec.end_time,
        durationMs: exec.duration_ms,
        totalNodes: exec.total_nodes,
        completedNodes: exec.completed_nodes,
        failedNodes: exec.failed_nodes,
        summary: exec.execution_summary,
        errorMessage: exec.error_message,
        isComplete: exec.status !== 'running'
      });
    }
    
    res.status(404).json({ error: 'Execution not found' });
  } catch (error) {
    systemLogger.error('Failed to get execution status', {
      error: error.message,
      workflowId: req.params.id,
      executionId: req.params.executionId,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get execution status' });
  }
});

// Check for any running executions for a workflow
router.get('/:id/running-execution', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check execution logs for running status
    const logResult = await pool.query(
      `SELECT run_id, run_name, started_at, status, logs, execution_id
       FROM visual_workflow_execution_logs
       WHERE workflow_id = $1 AND status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
      [id]
    );
    
    if (logResult.rows.length > 0) {
      const row = logResult.rows[0];
      return res.json({
        hasRunningExecution: true,
        executionId: row.execution_id,
        runId: row.run_id,
        runName: row.run_name,
        startedAt: row.started_at,
        logs: row.logs || []
      });
    }
    
    res.json({ hasRunningExecution: false });
  } catch (error) {
    systemLogger.error('Failed to check running execution', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to check running execution' });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const { graph_data } = req.body;

    if (!graph_data) {
      return res.status(400).json({ error: 'graph_data is required' });
    }

    const validation = validateGraph(graph_data);
    
    res.json(validation);
  } catch (error) {
    systemLogger.error('Failed to validate graph', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to validate graph' });
  }
});

router.get('/:id/execution-logs', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT id, run_id, run_name, started_at, status, logs, created_at
       FROM visual_workflow_execution_logs
       WHERE workflow_id = $1
       ORDER BY started_at DESC
       LIMIT 10`,
      [id]
    );
    
    // Return ISO timestamps for consistent client-side formatting
    const runs = result.rows.map(row => ({
      id: row.run_id,
      name: row.run_name,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : '',
      status: row.status === 'completed' ? 'success' : row.status,
      logs: row.logs || []
    }));
    
    res.json({ runs });
  } catch (error) {
    systemLogger.error('Failed to fetch workflow execution logs', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch execution logs' });
  }
});

router.post('/:id/execution-logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { runId, runName, startedAt, status, logs } = req.body;
    
    if (!runId || !runName) {
      return res.status(400).json({ error: 'runId and runName are required' });
    }
    
    const workflowIdInt = parseInt(id, 10);
    if (isNaN(workflowIdInt)) {
      return res.status(400).json({ error: 'Invalid workflow ID' });
    }
    
    const existingRun = await pool.query(
      `SELECT id FROM visual_workflow_execution_logs WHERE workflow_id = $1 AND run_id = $2`,
      [workflowIdInt, runId]
    );
    
    if (existingRun.rows.length > 0) {
      await pool.query(
        `UPDATE visual_workflow_execution_logs
         SET run_name = $1, status = $2, logs = $3
         WHERE workflow_id = $4 AND run_id = $5`,
        [runName, status || 'completed', JSON.stringify(logs || []), workflowIdInt, runId]
      );
    } else {
      await pool.query(
        `INSERT INTO visual_workflow_execution_logs (workflow_id, run_id, run_name, started_at, status, logs)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workflowIdInt, runId, runName, startedAt ? new Date(startedAt) : new Date(), status || 'running', JSON.stringify(logs || [])]
      );
      
      await pool.query(
        `DELETE FROM visual_workflow_execution_logs
         WHERE workflow_id = $1 AND id NOT IN (
           SELECT id FROM visual_workflow_execution_logs
           WHERE workflow_id = $1
           ORDER BY started_at DESC
           LIMIT 10
         )`,
        [workflowIdInt]
      );
    }
    
    res.json({ success: true, message: 'Execution log saved' });
  } catch (error) {
    systemLogger.error('Failed to save workflow execution log', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to save execution log' });
  }
});

function validateGraph(graphData) {
  const { nodes, edges } = graphData;

  if (!Array.isArray(nodes)) {
    return { valid: false, error: 'nodes must be an array' };
  }

  if (!Array.isArray(edges)) {
    return { valid: false, error: 'edges must be an array' };
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      return { valid: false, error: `Edge references non-existent source node: ${edge.source}` };
    }
    if (!nodeIds.has(edge.target)) {
      return { valid: false, error: `Edge references non-existent target node: ${edge.target}` };
    }
  }

  const duplicateAssets = findDuplicateAssets(nodes);
  if (duplicateAssets.length > 0) {
    return { 
      valid: false, 
      error: `Duplicate assets found: ${duplicateAssets.join(', ')}`,
      duplicates: duplicateAssets
    };
  }

  const cycleCheck = detectCycle(nodes, edges);
  if (!cycleCheck.valid) {
    return cycleCheck;
  }

  return { valid: true };
}

function findDuplicateAssets(nodes) {
  const assetMap = new Map();
  const duplicates = [];

  for (const node of nodes) {
    const assetKey = `${node.type}-${node.data?.assetId}`;
    if (assetMap.has(assetKey)) {
      duplicates.push(assetKey);
    } else {
      assetMap.set(assetKey, true);
    }
  }

  return duplicates;
}

function detectCycle(nodes, edges) {
  const graph = new Map();
  const visited = new Set();
  const recStack = new Set();

  nodes.forEach(node => {
    graph.set(node.id, []);
  });

  edges.forEach(edge => {
    if (graph.has(edge.source)) {
      graph.get(edge.source).push(edge.target);
    }
  });

  const dfs = (nodeId, path = []) => {
    if (recStack.has(nodeId)) {
      return { 
        hasCycle: true, 
        cycle: [...path, nodeId]
      };
    }

    if (visited.has(nodeId)) {
      return { hasCycle: false };
    }

    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const result = dfs(neighbor, [...path]);
      if (result.hasCycle) {
        return result;
      }
    }

    recStack.delete(nodeId);
    return { hasCycle: false };
  };

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      const result = dfs(node.id);
      if (result.hasCycle) {
        return {
          valid: false,
          error: `Cycle detected in graph: ${result.cycle.join(' → ')}`,
          cycle: result.cycle
        };
      }
    }
  }

  return { valid: true };
}

module.exports = router;
