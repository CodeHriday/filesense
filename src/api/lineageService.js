import axios from 'axios';

const API_URL = '/api'; // Base URL for API calls

/**
 * Get all file lineage relationships
 * @returns {Promise<Array>} Array of lineage relationships
 */
export const getLineages = async () => {
  try {
    const response = await axios.get(`${API_URL}/lineage`);
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