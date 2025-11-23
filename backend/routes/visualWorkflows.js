const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeVisualWorkflow } = require('../services/visualWorkflowExecutor');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, graph_data, created_at, updated_at, is_active
       FROM visual_workflows
       WHERE created_by = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [req.user.id]
    );

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
    
    const result = await pool.query(
      `SELECT * FROM visual_workflows WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [id, req.user.id]
    );

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
    const { name, description, graph_data } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    const validation = validateGraph(graph_data);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await pool.query(
      `INSERT INTO visual_workflows (name, description, graph_data, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description || '', JSON.stringify(graph_data), req.user.id]
    );

    systemLogger.info('Created visual workflow', {
      workflowId: result.rows[0].id,
      name,
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
    const { name, description, graph_data } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    const validation = validateGraph(graph_data);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await pool.query(
      `UPDATE visual_workflows
       SET name = $1, description = $2, graph_data = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND created_by = $5 AND is_active = true
       RETURNING *`,
      [name, description || '', JSON.stringify(graph_data), id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual workflow not found' });
    }

    systemLogger.info('Updated visual workflow', {
      workflowId: id,
      name,
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

    const workflowCheck = await pool.query(
      'SELECT id, name FROM visual_workflows WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (workflowCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Visual workflow not found' });
    }

    systemLogger.info('Starting visual workflow execution', {
      workflowId: id,
      userId: req.user.id
    });

    const result = await executeVisualWorkflow(parseInt(id), req.user.id);

    res.json({
      message: 'Visual workflow execution completed',
      workflowId: id,
      workflowName: workflowCheck.rows[0].name,
      ...result
    });

  } catch (error) {
    systemLogger.error('Failed to execute visual workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: error.message || 'Failed to execute visual workflow' });
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
