import axios from 'axios';

const API_URL = '/api'; // Base URL for API calls

/**
 * Get all file lineage relationships
 * @returns {Promise<Array>} Array of lineage relationships
 */
export const getLineages = async () => {
  try {
    const response = await axios.get(`${API_URL}/lineage`, {
      params: {
        _t: Date.now() // Cache-busting timestamp to force fresh data
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching lineage data:', error);
    throw error;
  }
};

/**
 * Get lineage relationships for a specific file
 * @param {string} fileId - The file ID to get lineage for
 * @returns {Promise<Array>} Array of lineage relationships
 */
export const getFileLineage = async (fileId) => {
  try {
    const response = await axios.get(`${API_URL}/lineage/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file lineage:', error);
    throw error;
  }
};

/**
 * Get impact analysis for a file (traces lineage recursively)
 * @param {string} fileId - The file ID to analyze
 * @param {string} [direction='downstream'] - The direction of analysis ('upstream' or 'downstream')
 * @param {number} [depth=5] - Maximum depth of the impact analysis
 * @returns {Promise<Object>} Impact analysis results with graph structure
 */
export const getImpactAnalysis = async (fileId, direction = 'downstream', depth = 5) => {
  try {
    const response = await axios.get(`${API_URL}/lineage/${fileId}/impact`, {
      params: { direction, depth }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching impact analysis:', error);
    throw error;
  }
};

/**
 * Create a new lineage relationship
 * @param {Object} lineageData - Lineage data
 * @param {string} lineageData.source_file_id - Source file ID
 * @param {string} lineageData.target_file_id - Target file ID
 * @param {string} lineageData.relationship_type - Type of relationship
 * @param {Object} [lineageData.transformation_details] - Details about the transformation
 * @returns {Promise<Object>} Created lineage relationship
 */
export const createLineage = async (lineageData) => {
  try {
    const response = await axios.post(`${API_URL}/lineage`, lineageData);
    return response.data;
  } catch (error) {
    console.error('Error creating lineage relationship:', error);
    throw error;
  }
};

/**
 * Update an existing lineage relationship
 * @param {number} id - Lineage relationship ID
 * @param {Object} lineageData - Updated lineage data
 * @returns {Promise<Object>} Updated lineage relationship
 */
export const updateLineage = async (id, lineageData) => {
  try {
    const response = await axios.put(`${API_URL}/lineage/${id}`, lineageData);
    return response.data;
  } catch (error) {
    console.error('Error updating lineage relationship:', error);
    throw error;
  }
};

/**
 * Delete a lineage relationship
 * @param {number} id - Lineage relationship ID
 * @returns {Promise<Object>} Response data
 */
export const deleteLineage = async (id) => {
  try {
    const response = await axios.delete(`${API_URL}/lineage/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting lineage relationship:', error);
    throw error;
  }
};

/**
 * Bulk delete multiple lineage records
 * @param {Array<number>} lineageIds - Array of lineage record IDs to delete
 * @returns {Promise<Object>} Response data with deletion summary
 */
export const bulkDeleteLineage = async (lineageIds) => {
  try {
    const response = await axios.post(`${API_URL}/lineage/bulk-delete`, {
      lineageIds
    });
    return response.data;
  } catch (error) {
    console.error('Error bulk deleting lineage records:', error);
    throw error;
  }
};

/**
 * Scan and populate lineage from existing transformation jobs
 * @returns {Promise<Object>} Summary of created, skipped, and error counts
 */
export const scanAndPopulateLineage = async () => {
  try {
    const response = await axios.post(`${API_URL}/lineage/scan-and-populate`);
    return response.data;
  } catch (error) {
    console.error('Error scanning and populating lineage:', error);
    throw error;
  }
};

/**
 * Get column-level PII tracking through lineage chain for a specific file
 * @param {string} fileId - The file ID to analyze
 * @param {string} [direction='both'] - Direction of lineage ('upstream', 'downstream', or 'both')
 * @returns {Promise<Object>} PII column tracking data
 */
export const getPIIColumns = async (fileId, direction = 'both') => {
  try {
    const response = await axios.get(`${API_URL}/lineage/${fileId}/pii-columns`, {
      params: { direction }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching PII columns:', error);
    throw error;
  }
};

/**
 * Get PII impact analysis for a specific file
 * @param {string} fileId - The file ID to analyze
 * @param {number} [maxDepth=10] - Maximum depth of impact analysis
 * @returns {Promise<Object>} PII impact analysis data
 */
export const getPIIImpact = async (fileId, maxDepth = 10) => {
  try {
    const response = await axios.get(`${API_URL}/lineage/${fileId}/pii-impact`, {
      params: { maxDepth }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching PII impact:', error);
    throw error;
  }
};