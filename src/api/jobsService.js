import { handleApiError, handleApiSuccess } from './apiUtils';
import { API_BASE_URL } from '../config';

/**
 * Get all jobs
 */
export const getJobs = async () => {
  try {
    console.log('Fetching jobs from API');
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required',
        data: [] // Return empty array to avoid breaking UI
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Get jobs response status:', response.status);
    return handleApiSuccess(response);
  } catch (error) {
    console.error('Exception in getJobs:', error);
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
    console.log('============== CREATING JOB ==============');
    console.log('Job data:', JSON.stringify(jobData, null, 2));
    
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      console.log('============== CREATE JOB FAILED (AUTH) ==============');
      return { 
        success: false, 
        message: 'Authentication required' 
      };
    }
    
    console.log('Token available, proceeding with request');
    console.log('API URL:', `${API_BASE_URL}/api/jobs`);
    
    // Ensure business_process_id is a number, not a string
    let processedData = {...jobData};
    if (typeof processedData.business_process_id === 'string') {
      const numericId = parseInt(processedData.business_process_id, 10);
      if (!isNaN(numericId)) {
        processedData.business_process_id = numericId;
        console.log('Converted business_process_id from string to number:', numericId);
      }
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(processedData),
      });
      
      console.log('Create job response status:', response.status);
      
      // For debugging: log the response text directly if there's an error
      if (!response.ok) {
        console.log('Response not OK, status:', response.status);
        try {
          const errorText = await response.text();
          console.error('Error response from server:', errorText);
          
          console.log('============== CREATE JOB FAILED (API ERROR) ==============');
          // Try to parse JSON if possible, otherwise return the text
          try {
            const errorJson = JSON.parse(errorText);
            return {
              success: false,
              status: response.status,
              message: errorJson.error || 'Failed to create job',
              details: errorJson
            };
          } catch (e) {
            return {
              success: false,
              status: response.status,
              message: errorText || 'Failed to create job'
            };
          }
        } catch (e) {
          console.error('Error reading error response:', e);
        }
      }
      
      const result = await handleApiSuccess(response);
      console.log('Job created successfully:', result);
      console.log('============== CREATE JOB SUCCEEDED ==============');
      return result;
    } catch (fetchError) {
      console.error('Fetch error in createJob:', fetchError);
      console.log('============== CREATE JOB FAILED (FETCH ERROR) ==============');
      return {
        success: false,
        message: `Network error: ${fetchError.message}`
      };
    }
  } catch (error) {
    console.error('Exception in createJob:', error);
    console.log('============== CREATE JOB FAILED (EXCEPTION) ==============');
    return handleApiError(error);
  }
};

/**
 * Update an existing job
 */
export const updateJob = async (jobId, jobData) => {
  try {
    console.log('Updating job with ID:', jobId, 'Data:', jobData);
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required' 
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(jobData),
    });
    
    console.log('Update job response status:', response.status);
    
    // For debugging: log the response text directly if there's an error
    if (!response.ok) {
      try {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        
        // Try to parse JSON if possible, otherwise return the text
        try {
          const errorJson = JSON.parse(errorText);
          return {
            success: false,
            status: response.status,
            message: errorJson.error || 'Failed to update job',
            details: errorJson
          };
        } catch (e) {
          return {
            success: false,
            status: response.status,
            message: errorText || 'Failed to update job'
          };
        }
      } catch (e) {
        console.error('Error reading error response:', e);
      }
    }
    
    return handleApiSuccess(response);
  } catch (error) {
    console.error('Exception in updateJob:', error);
    return handleApiError(error);
  }
};

/**
 * Delete a job
 */
export const deleteJob = async (jobId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return { 
        success: false, 
        message: 'Authentication required' 
      };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Delete job response status:', response.status);
    
    // Handle error responses
    if (!response.ok) {
      try {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        return {
          success: false,
          status: response.status,
          message: errorText || 'Failed to delete job'
        };
      } catch (e) {
        console.error('Error reading error response:', e);
      }
    }
    
    return handleApiSuccess(response);
  } catch (error) {
    console.error('Exception in deleteJob:', error);
    return handleApiError(error);
  }
};

/**
 * Start a job
 */
export const startJob = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/run`, {
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