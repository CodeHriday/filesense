import { handleApiError, handleApiSuccess } from './apiUtils';
import { API_BASE_URL } from '../config';

/**
 * Get all schedules
 */
export const getSchedules = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required', 
        data: [] // Return empty array to avoid breaking UI
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/schedules`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Get schedules for a specific job
 */
export const getJobSchedules = async (jobId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required', 
        data: [] // Return empty array to avoid breaking UI
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/schedules`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Create a new schedule
 */
export const createSchedule = async (scheduleData) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(scheduleData),
    });
    
    if (!response.ok) {
      try {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        return {
          success: false,
          status: response.status,
          message: errorText || 'Failed to create schedule'
        };
      } catch (e) {
        console.error('Error reading error response:', e);
      }
    }
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Update an existing schedule
 */
export const updateSchedule = async (scheduleId, scheduleData) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(scheduleData),
    });
    
    if (!response.ok) {
      try {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        return {
          success: false,
          status: response.status,
          message: errorText || 'Failed to update schedule'
        };
      } catch (e) {
        console.error('Error reading error response:', e);
      }
    }
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Delete a schedule
 */
export const deleteSchedule = async (scheduleId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      try {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        return {
          success: false,
          status: response.status,
          message: errorText || 'Failed to delete schedule'
        };
      } catch (e) {
        console.error('Error reading error response:', e);
      }
    }
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Enable a schedule
 */
export const enableSchedule = async (scheduleId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}/enable`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Disable a schedule
 */
export const disableSchedule = async (scheduleId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required'
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}/disable`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return handleApiSuccess(response);
  } catch (error) {
    return handleApiError(error);
  }
};