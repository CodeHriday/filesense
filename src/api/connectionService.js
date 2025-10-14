import axios from 'axios';

const API_URL = '/api';

/**
 * Get all connections
 * 
 * @param {Object} options - Optional parameters
 * @returns {Promise<Array>} - Array of connections
 */
export const getConnections = async (options = {}) => {
  const { limit, source } = options;
  let url = `${API_URL}/connections`;
  
  // Add query parameters if provided
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit);
  if (source) params.append('source', source);
  
  if (params.toString()) {
    url += `?${params.toString()}`;
  }
  
  const response = await axios.get(url);
  return response.data;
};

/**
 * Get a connection by ID
 * 
 * @param {number} id - Connection ID
 * @returns {Promise<Object>} - Connection object
 */
export const getConnectionById = async (id) => {
  const response = await axios.get(`${API_URL}/connections/${id}`);
  return response.data;
};

/**
 * Create a new connection
 * 
 * @param {Object} connectionData - Connection data
 * @returns {Promise<Object>} - Created connection
 */
export const createConnection = async (connectionData) => {
  const response = await axios.post(`${API_URL}/connections`, connectionData);
  return response.data;
};

/**
 * Update an existing connection
 * 
 * @param {number} id - Connection ID
 * @param {Object} connectionData - Updated connection data
 * @returns {Promise<Object>} - Updated connection
 */
export const updateConnection = async (id, connectionData) => {
  const response = await axios.put(`${API_URL}/connections/${id}`, connectionData);
  return response.data;
};

/**
 * Delete a connection
 * 
 * @param {number} id - Connection ID
 * @returns {Promise<Object>} - Success response
 */
export const deleteConnection = async (id) => {
  const response = await axios.delete(`${API_URL}/connections/${id}`);
  return response.data;
};

/**
 * Test a saved connection by ID (fetches encrypted credentials from database)
 * 
 * @param {number} id - Connection ID
 * @returns {Promise<Object>} - Test result
 */
export const testSavedConnection = async (id) => {
  const response = await axios.get(`${API_URL}/connections/${id}/test`);
  return response.data;
};

/**
 * Test a saved connection with form updates (merges form data with saved credentials)
 * 
 * @param {number} id - Connection ID
 * @param {Object} formData - Form data with updates
 * @returns {Promise<Object>} - Test result
 */
export const testConnectionWithUpdates = async (id, formData) => {
  const response = await axios.post(`${API_URL}/connections/${id}/test`, formData);
  return response.data;
};

/**
 * Test a connection configuration (for new connections before saving)
 * 
 * @param {Object} connectionData - Connection configuration to test
 * @returns {Promise<Object>} - Test result
 */
export const testConnection = async (connectionData) => {
  const response = await axios.post(`${API_URL}/connections/test`, connectionData);
  return response.data;
};
