import { handleApiError, handleApiSuccess } from './apiUtils';
import { API_BASE_URL } from '../config';

/**
 * Get all jobs
 */
export const getJobs = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get a specific job
 */
export const getJob = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get jobs for a specific business process
 */
export const getBusinessProcessJobs = async (processId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/business-processes/${processId}/jobs`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a new job
 */
export const createJob = async (jobData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobData),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Update an existing job
 */
export const updateJob = async (jobId, jobData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobData),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Delete a job
 */
export const deleteJob = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      method: 'DELETE',
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Start a job
 */
export const startJob = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/start`, {
      method: 'POST',
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Stop a job
 */
export const stopJob = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/stop`, {
      method: 'POST',
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get job logs
 */
export const getJobLogs = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/logs`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};