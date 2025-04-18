import axios from 'axios';

/**
 * Login user with username and password
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Response with user data and token
 */
export const login = async (username, password) => {
  try {
    // Make the base URL explicit for API calls
    const response = await axios.post('http://localhost:3000/api/auth/login', { username, password });
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
    const response = await axios.post('http://localhost:3000/api/auth/logout');
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
    const response = await axios.get('/api/auth/me');
    return response.data;
  } catch (error) {
    console.error('Get current user error:', error);
    throw error;
  }
};

/**
 * Get all users (admin only)
 * @returns {Promise<Array>} Array of user objects
 */
export const getAllUsers = async () => {
  try {
    const response = await axios.get('/api/users');
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
    const response = await axios.post('/api/auth/register', userData);
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
    const response = await axios.put(`/api/users/${userId}`, userData);
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
    const response = await axios.delete(`/api/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Delete user error:', error);
    throw error;
  }
};

/**
 * Get all roles (admin only)
 * @returns {Promise<Array>} Array of role objects
 */
export const getRoles = async () => {
  try {
    const response = await axios.get('/api/roles');
    return response.data;
  } catch (error) {
    console.error('Get roles error:', error);
    throw error;
  }
};

/**
 * Get all permissions (admin only)
 * @returns {Promise<Array>} Array of permission objects
 */
export const getPermissions = async () => {
  try {
    const response = await axios.get('/api/permissions');
    return response.data;
  } catch (error) {
    console.error('Get permissions error:', error);
    throw error;
  }
};