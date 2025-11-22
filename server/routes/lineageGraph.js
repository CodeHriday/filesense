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
router.get('/node/:nodeId', authenticateToken, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { nodeType, projectId } = req.query;
    
    if (!nodeType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: nodeType'
      });
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
      SELECT DISTINCT p.id, p.project_name
      FROM projects p
      ORDER BY p.project_name
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
    
    res.json({
      success: true,
      filters: {
        projects: projectsResult.rows,
        vendors: vendorsResult.rows,
        agreements: agreementsResult.rows
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

module.exports = router;
