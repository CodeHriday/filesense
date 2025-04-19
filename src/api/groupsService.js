import axios from 'axios';
import { API_BASE_URL } from '../config';
import { handleApiError, handleApiSuccess } from './apiUtils';

// Get all groups available to the user
export const getGroups = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/groups`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Get groups that the current user is a member of
export const getUserGroups = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/user/groups`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Create a new group
export const createGroup = async (groupData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/groups`, groupData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Update an existing group
export const updateGroup = async (groupId, groupData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/api/groups/${groupId}`, groupData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Delete a group
export const deleteGroup = async (groupId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Add users to a group
export const addUsersToGroup = async (groupId, userIds) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/groups/${groupId}/users`, { userIds }, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

// Remove a user from a group
export const removeUserFromGroup = async (groupId, userId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/groups/${groupId}/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};