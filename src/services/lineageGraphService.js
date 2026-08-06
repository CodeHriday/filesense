import axios from 'axios';

const API_URL = '/api/lineage-graph';

/**
 * Frontend service for Visual Lineage Graph API
 */

/**
 * Build and fetch lineage graph
 * @param {Object} params
 * @param {string} params.rootType - vendorAgreement|file|mapping|job
 * @param {string|number} params.rootId - ID of root entity
 * @param {number} params.projectId - Optional project ID filter
 * @param {number} params.depth - Maximum traversal depth (default: 3)
 * @param {boolean} params.includeIncidents - Include quality violations (default: true)
 * @returns {Promise<Object>} Graph data with nodes and edges
 */
export const fetchLineageGraph = async (params) => {
  try {
    const response = await axios.get(`${API_URL}/graph`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching lineage graph:', error);
    throw error;
  }
};

/**
 * Get detailed metadata for a specific node
 * @param {string} nodeId - Node ID
 * @param {string} nodeType - Node type
 * @param {number} projectId - Optional project ID
 * @returns {Promise<Object>} Node details
 */
export const fetchNodeDetails = async (nodeId, nodeType, projectId = null) => {
  try {
    const params = { nodeType };
    if (projectId) params.projectId = projectId;
    
    // Pass nodeId as a query param so slashes in node IDs (e.g. target table
    // names like "dp-de-target/file.csv") never fragment the URL path.
    params.nodeId = encodeURIComponent(nodeId);
    const response = await axios.get(`${API_URL}/node-detail`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching node details:', error);
    throw error;
  }
};

/**
 * Export lineage graph
 * @param {Object} graph - Graph object with nodes and edges
 * @param {string} format - Export format (json|png|svg)
 * @param {string} filename - Optional filename
 * @returns {Promise<Blob>} Export file blob
 */
export const exportLineageGraph = async (graph, format = 'json', filename = null) => {
  try {
    const response = await axios.post(`${API_URL}/export`, {
      graph,
      format,
      filename
    }, {
      responseType: format === 'json' ? 'json' : 'blob'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error exporting lineage graph:', error);
    throw error;
  }
};

/**
 * Get available filter options (projects, vendors, agreements)
 * @returns {Promise<Object>} Filter options
 */
export const fetchFilterOptions = async () => {
  try {
    const response = await axios.get(`${API_URL}/filters`);
    return response.data;
  } catch (error) {
    console.error('Error fetching filter options:', error);
    throw error;
  }
};

/**
 * Clear lineage graph cache (admin only)
 * @returns {Promise<Object>} Success response
 */
export const clearLineageCache = async () => {
  try {
    const response = await axios.delete(`${API_URL}/cache`);
    return response.data;
  } catch (error) {
    console.error('Error clearing lineage cache:', error);
    throw error;
  }
};

// ===========================================
// SAVED LINEAGE GRAPHS CRUD FUNCTIONS
// ===========================================

/**
 * List all saved lineage graphs
 * @param {Object} params - Query parameters
 * @param {number} params.projectId - Optional project filter
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @returns {Promise<Object>} List of saved graphs with pagination
 */
export const fetchSavedLineageGraphs = async (params = {}) => {
  try {
    const response = await axios.get(`${API_URL}/saved`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching saved lineage graphs:', error);
    throw error;
  }
};

/**
 * Get a specific saved lineage graph
 * @param {number} id - Graph ID
 * @returns {Promise<Object>} Saved graph data
 */
export const fetchSavedLineageGraph = async (id) => {
  try {
    const response = await axios.get(`${API_URL}/saved/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching saved lineage graph:', error);
    throw error;
  }
};

/**
 * Create a new saved lineage graph
 * @param {Object} data - Graph data
 * @param {string} data.name - Graph name
 * @param {string} data.description - Optional description
 * @param {string} data.rootType - Root entity type
 * @param {number} data.rootId - Root entity ID
 * @param {Object} data.graphConfig - Graph configuration (depth, includeIncidents)
 * @param {Object} data.graphData - Graph nodes and edges
 * @param {number} data.projectId - Optional project ID
 * @returns {Promise<Object>} Created graph
 */
export const createSavedLineageGraph = async (data) => {
  try {
    const response = await axios.post(`${API_URL}/saved`, data);
    return response.data;
  } catch (error) {
    console.error('Error creating saved lineage graph:', error);
    throw error;
  }
};

/**
 * Update a saved lineage graph
 * @param {number} id - Graph ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated graph
 */
export const updateSavedLineageGraph = async (id, data) => {
  try {
    const response = await axios.put(`${API_URL}/saved/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating saved lineage graph:', error);
    throw error;
  }
};

/**
 * Delete a saved lineage graph
 * @param {number} id - Graph ID
 * @returns {Promise<Object>} Success response
 */
export const deleteSavedLineageGraph = async (id) => {
  try {
    const response = await axios.delete(`${API_URL}/saved/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting saved lineage graph:', error);
    throw error;
  }
};

/**
 * Refresh a saved lineage graph with fresh data
 * @param {number} id - Graph ID
 * @returns {Promise<Object>} Refreshed graph with fresh data
 */
export const refreshSavedLineageGraph = async (id) => {
  try {
    const response = await axios.post(`${API_URL}/saved/${id}/refresh`);
    return response.data;
  } catch (error) {
    console.error('Error refreshing saved lineage graph:', error);
    throw error;
  }
};
