import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Get all job groups
export const getJobGroups = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/job-groups`);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Get job group by ID
export const getJobGroupById = async (id) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/job-groups/${id}`);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Create a new job group
export const createJobGroup = async (groupData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/job-groups`, groupData);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Update an existing job group
export const updateJobGroup = async (id, groupData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/job-groups/${id}`, groupData);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Delete a job group
export const deleteJobGroup = async (id) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/job-groups/${id}`);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Get jobs in a specific group
export const getJobsInGroup = async (groupId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/job-groups/${groupId}/jobs`);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Add a job to a group
export const addJobToGroup = async (groupId, jobId) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/job-groups/${groupId}/jobs`, { job_id: jobId });
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};

// Remove a job from a group
export const removeJobFromGroup = async (groupId, jobId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/job-groups/${groupId}/jobs/${jobId}`);
    return handleApiSuccess(response);
  } catch (error) {
    console.error("API Error:", error);
    return handleApiError(error);
  }
};