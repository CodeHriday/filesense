const express = require('express');
const router = express.Router();
const { systemLogger } = require('../../backend/utils/logger');
const { authenticateToken } = require('../../backend/src/middleware/authenticate');
const { buildLineageGraph, getNodeDetails } = require('../services/lineageGraphService');
const { redisClient } = require('../../backend/config/redis');

/**
 * Lineage Graph API Routes
 * Provides visual lineage graph data for Data Governance → Lineage page
 */

/**
 * GET /api/lineage-graph/graph
 * Build and return a lineage graph starting from a root entity
 * Query params:
 *   - rootType: vendorAgreement|file|mapping|job
 *   - rootId: ID of the root entity
 *   - projectId: Project ID for authorization (optional)
 *   - depth: Maximum traversal depth (default: 3)
 *   - includeIncidents: Include quality violations (default: true)
 */
router.get('/graph', authenticateToken, async (req, res) => {
  try {
    const { rootType, rootId, projectId, depth = 3, includeIncidents = 'true' } = req.query;
    
    // Validate required parameters
    if (!rootType || !rootId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: rootType and rootId'
      });
    }
    
    // Validate root type
    const validRootTypes = ['vendorAgreement', 'file', 'mapping', 'job'];
    if (!validRootTypes.includes(rootType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid rootType. Must be one of: ${validRootTypes.join(', ')}`
      });
    }
    
    // Check cache first (10-minute TTL)
    const cacheKey = `lineage:graph:${rootType}:${rootId}:${projectId || 'all'}:${depth}:${includeIncidents}`;
    
    try {
      const cachedGraph = await redisClient.get(cacheKey);
      if (cachedGraph) {
        systemLogger.info('Returning cached lineage graph', { cacheKey });
        return res.json({
          success: true,
          ...JSON.parse(cachedGraph),
          cached: true
        });
      }
    } catch (cacheError) {
      systemLogger.warn('Redis cache read failed, continuing without cache', { error: cacheError.message });
    }
    
    // Build the graph
    const graph = await buildLineageGraph({
      rootType,
      rootId,
      projectId: projectId ? parseInt(projectId) : null,
      depth: parseInt(depth),
      includeIncidents: includeIncidents === 'true'
    });
    
    // Cache the result (10 minutes)
    try {
      await redisClient.setex(cacheKey, 600, JSON.stringify(graph));
    } catch (cacheError) {
      systemLogger.warn('Failed to cache lineage graph', { error: cacheError.message });
    }
    
    res.json({
      success: true,
      ...graph,
      cached: false
    });
    
  } catch (error) {
    systemLogger.error('Error building lineage graph', { 
      error: error.message, 
      stack: error.stack,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to build lineage graph',
      details: error.message
    });
  }
});

/**
 * GET /api/lineage-graph/node/:nodeId
 * Get detailed metadata for a specific node
 * Query params:
 *   - nodeType: vendorContract|sourceFile|transformation|job|derivedColumn|targetTable
 *   - projectId: Project ID for authorization (optional)
 */
/**
 * GET /api/lineage-graph/node-detail
 * Same as /node/:nodeId but accepts nodeId as a query parameter so that node
 * IDs containing slashes (e.g. "table-dp-de-target/rdm_ds_cwlk_ds.csv") are
 * never embedded in the URL path and cannot fragment Express routing.
 */
router.get('/node-detail', authenticateToken, async (req, res) => {
  try {
    const rawNodeId = req.query.nodeId;
    if (!rawNodeId) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: nodeId' });
    }
    const nodeId = decodeURIComponent(rawNodeId);
    const { nodeType, projectId } = req.query;

    if (!nodeType) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: nodeType' });
    }

    if (projectId) {
      const { getUserProjects } = require('../../backend/middleware/requireProjectAccess');
      const { userHasAllProjectAccess } = require('../../backend/utils/permissionHelpers');
      const isAdmin = userHasAllProjectAccess(req.user);
      if (!isAdmin) {
        const userProjects = await getUserProjects(req.user.id);
        const allowedIds = new Set(userProjects.map(p => p.id));
        if (!allowedIds.has(parseInt(projectId))) {
          return res.status(403).json({ success: false, error: 'Access denied: you do not have access to this project' });
        }
      }
    }

    const details = await getNodeDetails(nodeId, nodeType, projectId ? parseInt(projectId) : null);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }
    res.json({ success: true, node: { id: nodeId, type: nodeType, details } });
  } catch (error) {
    systemLogger.error('Error fetching node details', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch node details', details: error.message });
  }
});

/**
 * GET /api/lineage-graph/node/:nodeId
 * Get detailed metadata for a specific node.
 * Query params:
 *   - nodeType: vendorContract|sourceFile|transformation|job|derivedColumn|targetTable
 *   - projectId: Project ID for authorization (optional)
 */
router.get('/node/:nodeId', authenticateToken, async (req, res) => {
  try {
    const nodeId = req.params.nodeId;
    const { nodeType, projectId } = req.query;
    
    if (!nodeType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: nodeType'
      });
    }

    // Enforce project-level authorization when a projectId is supplied.
    // Admins (userHasAllProjectAccess) may access any project; other users may
    // only request details for projects they are members of.
    if (projectId) {
      const { getUserProjects } = require('../../backend/middleware/requireProjectAccess');
      const { userHasAllProjectAccess } = require('../../backend/utils/permissionHelpers');
      const isAdmin = userHasAllProjectAccess(req.user);
      if (!isAdmin) {
        const userProjects = await getUserProjects(req.user.id);
        const allowedIds = new Set(userProjects.map(p => p.id));
        if (!allowedIds.has(parseInt(projectId))) {
          return res.status(403).json({
            success: false,
            error: 'Access denied: you do not have access to this project'
          });
        }
      }
    }

    const details = await getNodeDetails(
      nodeId, 
      nodeType, 
      projectId ? parseInt(projectId) : null
    );
    
    if (!details) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }
    
    res.json({
      success: true,
      node: {
        id: nodeId,
        type: nodeType,
        details
      }
    });
    
  } catch (error) {
    systemLogger.error('Error fetching node details', { 
      error: error.message,
      nodeId: req.params.nodeId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch node details',
      details: error.message
    });
  }
});

/**
 * POST /api/lineage-graph/export
 * Export lineage graph in various formats (JSON, PNG, SVG)
 * Body:
 *   - graph: Graph object (nodes and edges)
 *   - format: json|png|svg (default: json)
 *   - filename: Optional filename
 */
router.post('/export', authenticateToken, async (req, res) => {
  try {
    const { graph, format = 'json', filename } = req.body;
    
    if (!graph || !graph.nodes || !graph.edges) {
      return res.status(400).json({
        success: false,
        error: 'Invalid graph object. Must contain nodes and edges.'
      });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `lineage-graph-${timestamp}`;
    
    switch (format) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename || defaultFilename}.json"`);
        res.json(graph);
        break;
        
      case 'svg':
      case 'png':
        // For SVG/PNG export, return graph data for client-side rendering
        // The frontend will use React Flow's export capabilities
        return res.status(501).json({
          success: false,
          error: 'SVG/PNG export is handled client-side. Use the frontend export functionality.'
        });
        
      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported export format: ${format}. Supported formats: json`
        });
    }
    
  } catch (error) {
    systemLogger.error('Error exporting lineage graph', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to export lineage graph',
      details: error.message
    });
  }
});

/**
 * GET /api/lineage-graph/filters
 * Get available filter options for lineage graph (projects, vendors, etc.)
 */
router.get('/filters', authenticateToken, async (req, res) => {
  try {
    const pool = require('../../backend/db');
    
    // Get available projects (user has access to)
    const projectsResult = await pool.query(`
      SELECT DISTINCT p.id, p.name as project_name
      FROM projects p
      ORDER BY p.name
      LIMIT 100
    `);
    
    // Get available vendors
    const vendorsResult = await pool.query(`
      SELECT DISTINCT v.id, v.vendor_name
      FROM vendors v
      WHERE v.status = 'active'
      ORDER BY v.vendor_name
      LIMIT 100
    `);
    
    // Get available vendor agreements
    const agreementsResult = await pool.query(`
      SELECT DISTINCT 
        va.id, 
        va.agreement_code,
        v.vendor_name
      FROM vendor_agreements va
      LEFT JOIN vendors v ON va.vendor_id = v.id
      WHERE va.status = 'active'
      ORDER BY va.agreement_code
      LIMIT 100
    `);
    
    // Get available source files
    const filesResult = await pool.query(`
      SELECT DISTINCT 
        f.id, 
        f.filename,
        f.file_type,
        f.created_at
      FROM files f
      WHERE f.file_role = 'source'
      ORDER BY f.created_at DESC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      filters: {
        projects: projectsResult.rows,
        vendors: vendorsResult.rows,
        agreements: agreementsResult.rows,
        files: filesResult.rows
      }
    });
    
  } catch (error) {
    systemLogger.error('Error fetching filter options', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch filter options',
      details: error.message
    });
  }
});

/**
 * DELETE /api/lineage-graph/cache
 * Clear lineage graph cache (admin only)
 */
router.delete('/cache', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const userRoles = req.user?.roles || [];
    if (!userRoles.includes('Admin')) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Admin role required.'
      });
    }
    
    // Clear all lineage cache keys
    try {
      const keys = await redisClient.keys('lineage:graph:*');
      if (keys.length > 0) {
        await redisClient.del(...keys);
        systemLogger.info('Cleared lineage graph cache', { keyCount: keys.length });
      }
      
      res.json({
        success: true,
        message: `Cleared ${keys.length} cache entries`
      });
    } catch (cacheError) {
      systemLogger.warn('Redis cache clear failed', { error: cacheError.message });
      res.json({
        success: true,
        message: 'Cache clearing not available (Redis not connected)'
      });
    }
    
  } catch (error) {
    systemLogger.error('Error clearing cache', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      details: error.message
    });
  }
});

// ===========================================
// SAVED LINEAGE GRAPHS CRUD ENDPOINTS
// ===========================================

const pool = require('../../backend/db');

/**
 * GET /api/lineage-graph/saved
 * List all saved lineage graphs
 */
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const { projectId, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = `WHERE vlg.is_active = true`;
    const params = [];
    
    if (projectId) {
      params.push(parseInt(projectId));
      whereClause += ` AND vlg.project_id = $${params.length}`;
    }
    
    // Get total count first with a simple query
    const countQuery = `
      SELECT COUNT(*) 
      FROM visual_lineage_graphs vlg
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Main query with pagination
    const paginationParams = [...params, parseInt(limit), offset];
    const query = `
      SELECT 
        vlg.id,
        vlg.name,
        vlg.description,
        vlg.root_type,
        vlg.root_id,
        vlg.graph_config,
        vlg.created_by,
        vlg.created_at,
        vlg.updated_at,
        vlg.is_active,
        vlg.project_id,
        u.username as created_by_name,
        p.name as project_name,
        COALESCE(jsonb_array_length(vlg.graph_data->'nodes'), 0) as node_count,
        COALESCE(jsonb_array_length(vlg.graph_data->'edges'), 0) as edge_count
      FROM visual_lineage_graphs vlg
      LEFT JOIN users u ON vlg.created_by = u.id
      LEFT JOIN projects p ON vlg.project_id = p.id
      ${whereClause}
      ORDER BY vlg.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    
    const result = await pool.query(query, paginationParams);
    
    res.json({
      success: true,
      graphs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    systemLogger.error('Error listing saved lineage graphs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list saved lineage graphs',
      details: error.message
    });
  }
});

/**
 * GET /api/lineage-graph/saved/:id
 * Get a specific saved lineage graph
 */
router.get('/saved/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        vlg.*,
        u.username as created_by_name,
        p.name as project_name
      FROM visual_lineage_graphs vlg
      LEFT JOIN users u ON vlg.created_by = u.id
      LEFT JOIN projects p ON vlg.project_id = p.id
      WHERE vlg.id = $1 AND vlg.is_active = true
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved lineage graph not found'
      });
    }
    
    res.json({
      success: true,
      graph: result.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error fetching saved lineage graph', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved lineage graph',
      details: error.message
    });
  }
});

/**
 * POST /api/lineage-graph/saved
 * Create a new saved lineage graph
 */
router.post('/saved', authenticateToken, async (req, res) => {
  try {
    const { name, description, rootType, rootId, graphConfig, graphData, projectId } = req.body;
    const userId = req.user?.id;
    
    if (!name || !rootType || !rootId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, rootType, rootId'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO visual_lineage_graphs 
        (name, description, root_type, root_id, graph_config, graph_data, created_by, project_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      name,
      description || null,
      rootType,
      parseInt(rootId),
      graphConfig || { depth: 3, includeIncidents: true },
      graphData || { nodes: [], edges: [] },
      userId,
      projectId ? parseInt(projectId) : null
    ]);
    
    systemLogger.info('Created saved lineage graph', { id: result.rows[0].id, name, userId });
    
    res.json({
      success: true,
      graph: result.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error creating saved lineage graph', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create saved lineage graph',
      details: error.message
    });
  }
});

/**
 * PUT /api/lineage-graph/saved/:id
 * Update a saved lineage graph
 */
router.put('/saved/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, graphConfig, graphData } = req.body;
    
    const updates = [];
    const params = [id];
    let paramIndex = 2;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (graphConfig !== undefined) {
      updates.push(`graph_config = $${paramIndex++}`);
      params.push(graphConfig);
    }
    if (graphData !== undefined) {
      updates.push(`graph_data = $${paramIndex++}`);
      params.push(graphData);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    const result = await pool.query(`
      UPDATE visual_lineage_graphs 
      SET ${updates.join(', ')}
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved lineage graph not found'
      });
    }
    
    systemLogger.info('Updated saved lineage graph', { id });
    
    res.json({
      success: true,
      graph: result.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error updating saved lineage graph', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to update saved lineage graph',
      details: error.message
    });
  }
});

/**
 * DELETE /api/lineage-graph/saved/:id
 * Soft delete a saved lineage graph
 */
router.delete('/saved/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE visual_lineage_graphs 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = true
      RETURNING id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved lineage graph not found'
      });
    }
    
    systemLogger.info('Deleted saved lineage graph', { id });
    
    res.json({
      success: true,
      message: 'Lineage graph deleted successfully'
    });
    
  } catch (error) {
    systemLogger.error('Error deleting saved lineage graph', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to delete saved lineage graph',
      details: error.message
    });
  }
});

/**
 * POST /api/lineage-graph/saved/:id/refresh
 * Refresh a saved lineage graph with fresh data
 */
router.post('/saved/:id/refresh', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the saved graph
    const graphResult = await pool.query(`
      SELECT * FROM visual_lineage_graphs WHERE id = $1 AND is_active = true
    `, [id]);
    
    if (graphResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved lineage graph not found'
      });
    }
    
    const savedGraph = graphResult.rows[0];
    const config = savedGraph.graph_config || { depth: 3, includeIncidents: true };
    
    // Build fresh graph data
    const freshGraph = await buildLineageGraph({
      rootType: savedGraph.root_type,
      rootId: savedGraph.root_id,
      projectId: savedGraph.project_id,
      depth: config.depth || 3,
      includeIncidents: config.includeIncidents !== false
    });
    
    // Update the saved graph with fresh data
    const updateResult = await pool.query(`
      UPDATE visual_lineage_graphs 
      SET graph_data = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, { nodes: freshGraph.nodes, edges: freshGraph.edges }]);
    
    systemLogger.info('Refreshed saved lineage graph', { id });
    
    res.json({
      success: true,
      graph: updateResult.rows[0],
      freshData: freshGraph
    });
    
  } catch (error) {
    systemLogger.error('Error refreshing saved lineage graph', { error: error.message, id: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to refresh saved lineage graph',
      details: error.message
    });
  }
});

module.exports = router;
