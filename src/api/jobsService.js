import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Jobs API

/**
 * Get all jobs
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} List of jobs
 */
export const getJobs = async (params = {}) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs`, { params });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get jobs by business process ID
 * @param {string} processId - Business process ID
 * @returns {Promise<Array>} List of jobs
 */
export const getJobsByProcessId = async (processId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/business-processes/${processId}/jobs`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get a job by ID
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Job details
 */
export const getJobById = async (id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs/${id}`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a new job
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} Created job
 */
export const createJob = async (jobData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/jobs`, jobData);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Update a job
 * @param {string} id - Job ID
 * @param {Object} jobData - Updated job data
 * @returns {Promise<Object>} Updated job
 */
export const updateJob = async (id, jobData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/jobs/${id}`, jobData);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Delete a job
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Result of deletion
 */
export const deleteJob = async (id) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/jobs/${id}`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Run a job
 * @param {string} id - Job ID
 * @param {Object} options - Run options
 * @returns {Promise<Object>} Job run result
 */
export const runJob = async (id, options = {}) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/jobs/${id}/run`, options);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get job run history
 * @param {string} id - Job ID
 * @returns {Promise<Array>} Job run history
 */
export const getJobRunHistory = async (id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs/${id}/history`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get job status
 * @param {string} id - Job ID
 * @returns {Promise<Object>} Job status
 */
export const getJobStatus = async (id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs/${id}/status`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};