import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Groups API

/**
 * Get all groups
 * @returns {Promise<Array>} List of groups
 */
export const getGroups = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/groups`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get user's groups
 * @returns {Promise<Array>} List of user's groups
 */
export const getUserGroups = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/user/groups`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};