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
    
    const response = await axios.get(`${API_URL}/node/${nodeId}`, { params });
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
