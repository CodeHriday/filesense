import { handleApiError, handleApiSuccess } from './apiUtils';
import { API_BASE_URL } from '../config';

/**
 * Get all groups
 */
export const getGroups = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get groups for current user
 */
export const getUserGroups = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/user`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a new group
 */
export const createGroup = async (groupData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupData),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Update an existing group
 */
export const updateGroup = async (groupId, groupData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupData),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Delete a group
 */
export const deleteGroup = async (groupId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
      method: 'DELETE',
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Add user to group
 */
export const addUserToGroup = async (groupId, userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Remove user from group
 */
export const removeUserFromGroup = async (groupId, userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/users/${userId}`, {
      method: 'DELETE',
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get users in a group
 */
export const getGroupUsers = async (groupId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/users`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};