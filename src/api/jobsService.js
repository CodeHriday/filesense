import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Jobs API

/**
 * Get all jobs
 * @returns {Promise<Array>} List of jobs
 */
export const getJobs = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/jobs`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get a single job by ID
 * @param {string|number} id - Job ID
 * @returns {Promise<Object>} Job with history
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
 * @param {string|number} id - Job ID
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
 * @param {string|number} id - Job ID
 * @returns {Promise<Object>} Response message
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
 * Run a job manually
 * @param {string|number} id - Job ID
 * @returns {Promise<Object>} Response with job history ID
 */
export const runJob = async (id) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/jobs/${id}/run`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};