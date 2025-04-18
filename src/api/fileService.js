import axios from 'axios';

// Use relative URL for API calls in the same domain
const API_URL = '/api';

// Test ping function to check API connectivity
export const testApiConnection = async () => {
  try {
    console.log('Testing API connection...');
    // Use our health check endpoint which should be more reliable
    const response = await axios.get(`${API_URL}/health`);
    console.log('API connection successful:', response.status, response.data);
    return { 
      success: true, 
      status: response.status,
      data: response.data 
    };
  } catch (error) {
    console.error('API connection test failed:', error);
    return { 
      success: false, 
      error: error.message,
      status: error.response?.status,
      details: error.toJSON()
    };
  }
};

export const uploadFile = async (file) => {
  try {
    // First test the API connection
    const connectionTest = await testApiConnection();
    if (!connectionTest.success) {
      console.error('Cannot upload file - API connection test failed:', connectionTest);
      throw new Error(`API connection test failed: ${connectionTest.error}`);
    }
    
    console.log('API connection successful, proceeding with file upload');
    
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    const response = await axios.post(`${API_URL}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // Add timeout and show upload progress
      timeout: 30000, // 30 seconds
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`Upload progress: ${percentCompleted}%`);
      }
    });
    
    console.log('Upload response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    console.error('Error details:', error.toJSON ? error.toJSON() : error);
    if (error.response) {
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
      console.error('Error response headers:', error.response.headers);
    } else if (error.request) {
      console.error('Error request:', error.request);
    }
    throw error;
  }
};

export const getFileCatalog = async () => {
  try {
    const response = await axios.get(`${API_URL}/files`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file catalog:', error);
    throw error;
  }
};

export const getFileDetails = async (fileId) => {
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file details:', error);
    throw error;
  }
};

export const getFileProfile = async (fileId) => {
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/profile`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file profile:', error);
    throw error;
  }
};

export const getFileQuality = async (fileId) => {
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/quality`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file quality data:', error);
    throw error;
  }
};

export const runQualityCheck = async (fileId, rules = []) => {
  try {
    const response = await axios.post(`${API_URL}/files/${fileId}/quality-check`, { 
      rules,
      anomalyDetection: true,
      calculateReliabilityScore: true
    });
    return response.data;
  } catch (error) {
    console.error('Error running quality check:', error);
    throw error;
  }
};

export const deleteFile = async (fileId) => {
  try {
    const response = await axios.delete(`${API_URL}/files/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};