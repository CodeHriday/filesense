import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * Login user with username and password
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Response with user data and token
 */
export const login = async (username, password) => {
  try {
    // Make the base URL explicit for API calls
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { username, password });
    return response.data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Logout user
 * @returns {Promise<Object>} Response with success message
 */
export const logout = async () => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/logout`);
    return response.data;
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

/**
 * Get current user data
 * @returns {Promise<Object>} User data
 */
export const getCurrentUser = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/auth/me`);
    return response.data;
  } catch (error) {
    console.error('Get current user error:', error);
    throw error;
  }
};

/**
 * Get all users (admin only)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10)
 * @param {string} search - Search term to filter users (optional)
 * @returns {Promise<Object>} Object with users array and pagination info
 */
export const getAllUsers = async (page = 1, limit = 10, search = '') => {
  try {
    const params = { page, limit };
    if (search) {
      params.search = search;
    }
    const response = await axios.get(`${API_BASE_URL}/api/users`, { params });
    console.log('Get all users response:', response);
    return response.data;
  } catch (error) {
    console.error('Get all users error:', error);
    throw error;
  }
};

/**
 * Create new user (admin only)
 * @param {Object} userData - User data
 * @param {string} userData.username - Username
 * @param {string} userData.password - Password
 * @param {string} userData.email - Email
 * @param {string} userData.fullName - Full name
 * @param {Array<string>} userData.roles - Array of role names
 * @returns {Promise<Object>} Created user data
 */
export const createUser = async (userData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/users/register`, userData);
    return response.data;
  } catch (error) {
    console.error('Create user error:', error);
    throw error;
  }
};

/**
 * Update user data (admin only)
 * @param {number} userId - User ID to update
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object>} Updated user data
 */
export const updateUser = async (userId, userData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/users/${userId}`, userData);
    return response.data;
  } catch (error) {
    console.error('Update user error:', error);
    throw error;
  }
};

/**
 * Delete user (admin only)
 * @param {number} userId - User ID to delete
 * @returns {Promise<Object>} Response with success message
 */
export const deleteUser = async (userId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Delete user error:', error);
    throw error;
  }
};

/**
 * Get all roles (admin only)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10)
 * @returns {Promise<Object>} Object with roles array and pagination info
 */
export const getRoles = async (page = 1, limit = 10) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/roles`, {
      params: { page, limit }
    });
    return response.data;
  } catch (error) {
    console.error('Get roles error:', error);
    throw error;
  }
};

/**
 * Create a new role (admin only)
 * @param {Object} roleData - Role data
 * @param {string} roleData.name - Role name
 * @param {string} roleData.description - Role description
 * @param {Array<Object>} roleData.permissions - Array of permission objects
 * @returns {Promise<Object>} Created role data
 */
export const createRole = async (roleData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/roles`, roleData);
    return response.data;
  } catch (error) {
    console.error('Create role error:', error);
    throw error;
  }
};

/**
 * Update a role (admin only)
 * @param {number} roleId - Role ID to update
 * @param {Object} roleData - Updated role data
 * @returns {Promise<Object>} Updated role data
 */
export const updateRole = async (roleId, roleData) => {
  try {
    console.log(`Updating role with ID ${roleId}:`, roleData);
    const response = await axios.put(`${API_BASE_URL}/api/roles/${roleId}`, roleData);
    console.log('Role update response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Update role error:', error);
    console.error('Error details:', error.response?.data || 'No response data');
    console.error('URL used:', `${API_BASE_URL}/api/roles/${roleId}`);
    throw error;
  }
};

/**
 * Delete a role (admin only)
 * @param {number} roleId - Role ID to delete
 * @returns {Promise<Object>} Response with success message
 */
export const deleteRole = async (roleId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/roles/${roleId}`);
    return response.data;
  } catch (error) {
    console.error('Delete role error:', error);
    throw error;
  }
};

/**
 * Get all permissions (admin only)
 * @returns {Promise<Array>} Array of permission objects
 */
export const getPermissions = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/permissions`);
    return response.data;
  } catch (error) {
    console.error('Get permissions error:', error);
    throw error;
  }
};