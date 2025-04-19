import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Business Processes API

/**
 * Get all business processes
 * @returns {Promise<Array>} List of business processes
 */
export const getBusinessProcesses = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/business-processes`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get a business process by ID
 * @param {string} id - Business process ID
 * @returns {Promise<Object>} Business process details
 */
export const getBusinessProcessById = async (id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/business-processes/${id}`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a new business process
 * @param {Object} processData - Business process data
 * @returns {Promise<Object>} Created business process
 */
export const createBusinessProcess = async (processData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/business-processes`, processData);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Update a business process
 * @param {string} id - Business process ID
 * @param {Object} processData - Updated business process data
 * @returns {Promise<Object>} Updated business process
 */
export const updateBusinessProcess = async (id, processData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/business-processes/${id}`, processData);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Delete a business process
 * @param {string} id - Business process ID
 * @returns {Promise<Object>} Result of deletion
 */
export const deleteBusinessProcess = async (id) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/business-processes/${id}`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};