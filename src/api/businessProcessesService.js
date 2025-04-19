import { handleApiError, handleApiSuccess } from './apiUtils';
import { API_BASE_URL } from '../config';

/**
 * Get all business processes
 */
export const getBusinessProcesses = async () => {
  try {
    console.log('Fetching business processes from API');
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required', 
        data: [] // Return empty array to avoid breaking UI
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/business-processes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Get business processes response status:', response.status);
    
    if (!response.ok) {
      try {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        return {
          success: false,
          status: response.status,
          message: 'Failed to fetch business processes',
          data: [] // Return empty array to avoid breaking UI
        };
      } catch (e) {
        console.error('Error reading error response:', e);
      }
    }
    
    return handleApiSuccess(response);
  } catch (error) {
    console.error('Exception in getBusinessProcesses:', error);
    return handleApiError(error);
  }
};

/**
 * Get a specific business process
 */
export const getBusinessProcess = async (processId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/business-processes/${processId}`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get business processes for a specific group
 */
export const getGroupBusinessProcesses = async (groupId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/business-processes`);
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a new business process
 */
export const createBusinessProcess = async (processData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/business-processes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(processData),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Update an existing business process
 */
export const updateBusinessProcess = async (processId, processData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/business-processes/${processId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(processData),
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Delete a business process
 */
export const deleteBusinessProcess = async (processId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/business-processes/${processId}`, {
      method: 'DELETE',
    });
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};