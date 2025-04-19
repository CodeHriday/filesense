import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Get all jobs accessible to the user
export const getJobs = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Get a specific job by ID
export const getJobById = async (jobId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Create a new job
export const createJob = async (jobData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/jobs`, jobData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Update an existing job
export const updateJob = async (jobId, jobData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/jobs/${jobId}`, jobData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Delete a job
export const deleteJob = async (jobId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Run a job manually
export const runJob = async (jobId, runParams = {}) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/jobs/${jobId}/run`, runParams, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Get job run history
export const getJobRunHistory = async (jobId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/runs`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Get job run details
export const getJobRunDetails = async (jobId, runId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/runs/${runId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Update job schedule
export const updateJobSchedule = async (jobId, scheduleSettings) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/jobs/${jobId}/schedule`, scheduleSettings, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};