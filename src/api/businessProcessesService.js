import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Get all business processes accessible to the user
export const getBusinessProcesses = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/business-processes`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Get a specific business process by ID
export const getBusinessProcessById = async (processId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/business-processes/${processId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Create a new business process
export const createBusinessProcess = async (processData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/business-processes`, processData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Update an existing business process
export const updateBusinessProcess = async (processId, processData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/business-processes/${processId}`, processData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Delete a business process
export const deleteBusinessProcess = async (processId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/business-processes/${processId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Get jobs for a specific business process
export const getBusinessProcessJobs = async (processId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/business-processes/${processId}/jobs`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Add a job to a business process
export const addJobToBusinessProcess = async (processId, jobData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/business-processes/${processId}/jobs`, jobData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Remove a job from a business process
export const removeJobFromBusinessProcess = async (processId, jobId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/business-processes/${processId}/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};