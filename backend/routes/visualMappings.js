const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

/**
 * GET /api/visual-mappings
 * List all visual mappings (filtered by user's accessible projects)
 */
router.get('/', async (req, res) => {
  try {
    const { project_id, sub_project_id, is_active = true } = req.query;
    
    // Get user's accessible projects
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const projectIds = userProjects.map(p => p.id);
    
    // Admin bypass check
    const isAdmin = req.user?.roles?.includes('Admin');
    
    let query = `
      SELECT 
        vm.id, vm.name, vm.description, vm.graph_data, vm.canvas_state,
        vm.created_at, vm.updated_at, vm.is_active,
        vm.last_executed_at, vm.execution_count,
        vm.project_id, vm.sub_project_id,
        p.name as project_name,
        sp.name as sub_project_name,
        u.username as created_by_username
      FROM visual_mapping_defs vm
      LEFT JOIN projects p ON vm.project_id = p.id
      LEFT JOIN projects sp ON vm.sub_project_id = sp.id
      LEFT JOIN users u ON vm.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filter by accessible projects (admins bypass)
    if (!isAdmin && projectIds.length > 0) {
      query += ` AND vm.project_id = ANY($${paramIndex}::integer[])`;
      params.push(projectIds);
      paramIndex++;
    }
    
    if (project_id) {
      query += ` AND vm.project_id = $${paramIndex}`;
      params.push(parseInt(project_id));
      paramIndex++;
    }
    
    if (sub_project_id) {
      query += ` AND vm.sub_project_id = $${paramIndex}`;
      params.push(parseInt(sub_project_id));
      paramIndex++;
    }
    
    if (is_active !== undefined) {
      query += ` AND vm.is_active = $${paramIndex}`;
      params.push(is_active === 'true' || is_active === true);
      paramIndex++;
    }
    
    query += ` ORDER BY vm.updated_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Parse JSON fields for each mapping
    const mappings = result.rows.map(mapping => {
      if (typeof mapping.graph_data === 'string') {
        mapping.graph_data = JSON.parse(mapping.graph_data);
      }
      if (typeof mapping.canvas_state === 'string') {
        mapping.canvas_state = JSON.parse(mapping.canvas_state);
      }
      return mapping;
    });
    
    res.json(mappings);
  } catch (error) {
    systemLogger.error('Failed to fetch visual mappings', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch visual mappings' });
  }
});

/**
 * GET /api/visual-mappings/:id
 * Get a specific visual mapping
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        vm.*,
        p.name as project_name,
        sp.name as sub_project_name,
        u.username as created_by_username
       FROM visual_mapping_defs vm
       LEFT JOIN projects p ON vm.project_id = p.id
       LEFT JOIN projects sp ON vm.sub_project_id = sp.id
       LEFT JOIN users u ON vm.created_by = u.id
       WHERE vm.id = $1 AND vm.is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }

    // Check project access and parse JSON fields
    const mapping = result.rows[0];
    if (typeof mapping.graph_data === 'string') {
      mapping.graph_data = JSON.parse(mapping.graph_data);
    }
    if (typeof mapping.canvas_state === 'string') {
      mapping.canvas_state = JSON.parse(mapping.canvas_state);
    }
    if (mapping.project_id) {
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(req.user.id);
      const hasAccess = userProjects.some(p => p.id === mapping.project_id) || req.user?.roles?.includes('Admin');
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this visual mapping' });
      }
    }

    res.json(mapping);
  } catch (error) {
    systemLogger.error('Failed to fetch visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch visual mapping' });
  }
});

/**
 * POST /api/visual-mappings
 * Create a new visual mapping
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, graph_data, canvas_state, project_id, sub_project_id } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    // Validate graph structure
    if (!graph_data.nodes || !Array.isArray(graph_data.nodes)) {
      return res.status(400).json({ error: 'graph_data must contain a nodes array' });
    }
    if (!graph_data.edges || !Array.isArray(graph_data.edges)) {
      return res.status(400).json({ error: 'graph_data must contain an edges array' });
    }

    const result = await pool.query(
      `INSERT INTO visual_mapping_defs (name, description, graph_data, canvas_state, project_id, sub_project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name, 
        description || '', 
        JSON.stringify(graph_data), 
        JSON.stringify(canvas_state || { zoom: 1, position: [0, 0] }), 
        project_id || null, 
        sub_project_id || null, 
        req.user.id
      ]
    );

    systemLogger.info('Created visual mapping', {
      mappingId: result.rows[0].id,
      name,
      projectId: project_id,
      userId: req.user.id
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to create visual mapping', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to create visual mapping' });
  }
});

/**
 * PUT /api/visual-mappings/:id
 * Update an existing visual mapping
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, graph_data, canvas_state, project_id, sub_project_id } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    // Validate graph structure
    if (!graph_data.nodes || !Array.isArray(graph_data.nodes)) {
      return res.status(400).json({ error: 'graph_data must contain a nodes array' });
    }
    if (!graph_data.edges || !Array.isArray(graph_data.edges)) {
      return res.status(400).json({ error: 'graph_data must contain an edges array' });
    }

    const result = await pool.query(
      `UPDATE visual_mapping_defs
       SET name = $1, description = $2, graph_data = $3, canvas_state = $4, 
           project_id = $5, sub_project_id = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND is_active = true
       RETURNING *`,
      [
        name, 
        description || '', 
        JSON.stringify(graph_data), 
        JSON.stringify(canvas_state || { zoom: 1, position: [0, 0] }),
        project_id || null, 
        sub_project_id || null, 
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }

    systemLogger.info('Updated visual mapping', {
      mappingId: id,
      name,
      projectId: project_id,
      userId: req.user.id
    });

    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to update visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to update visual mapping' });
  }
});

/**
 * DELETE /api/visual-mappings/:id
 * Soft delete a visual mapping
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE visual_mapping_defs SET is_active = false, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }

    systemLogger.info('Deleted visual mapping', {
      mappingId: id,
      userId: req.user.id
    });

    res.json({ message: 'Visual mapping deleted successfully' });
  } catch (error) {
    systemLogger.error('Failed to delete visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to delete visual mapping' });
  }
});

/**
 * POST /api/visual-mappings/:id/execute
 * Execute a visual mapping
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the mapping
    const mappingResult = await pool.query(
      'SELECT * FROM visual_mapping_defs WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (mappingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }
    
    const mapping = mappingResult.rows[0];
    
    // Create execution record
    const executionId = `VMEXEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await pool.query(
      `INSERT INTO visual_mapping_executions (execution_id, mapping_id, status, triggered_by)
       VALUES ($1, $2, 'pending', $3)`,
      [executionId, id, req.user.id]
    );
    
    // Execute the mapping (will be implemented in compilation service)
    // For now, return the execution ID
    systemLogger.info('Visual mapping execution requested', {
      mappingId: id,
      executionId,
      userId: req.user.id
    });
    
    res.json({
      message: 'Visual mapping execution started',
      execution_id: executionId,
      mapping_id: id
    });
  } catch (error) {
    systemLogger.error('Failed to execute visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to execute visual mapping' });
  }
});

/**
 * GET /api/visual-mappings/:id/executions
 * Get execution history for a visual mapping
 */
router.get('/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT 
        vme.*,
        u.username as triggered_by_username
       FROM visual_mapping_executions vme
       LEFT JOIN users u ON vme.triggered_by = u.id
       WHERE vme.mapping_id = $1
       ORDER BY vme.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Failed to fetch execution history', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch execution history' });
  }
});

module.exports = router;
