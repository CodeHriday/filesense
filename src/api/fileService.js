import axios from 'axios';

const API_URL = '/api';

/**
 * Test the API connection by making a simple request
 */
export const testApiConnection = async () => {
  try {
    console.log('Testing API connection...');
    const response = await axios.get(`${API_URL}/health`);
    console.log('API connection successful:', response.status, response.data);
    return response.data;
  } catch (error) {
    console.error('API connection failed:', error);
    throw new Error('API connection failed. Please try again later.');
  }
};

/**
 * Get the file catalog
 */
export const getFileCatalog = async () => {
  try {
    console.log('Fetching file catalog...');
    
    // First test API connection to ensure backend is available
    const connectionStatus = await testApiConnection();
    console.log('API connection successful, proceeding with file catalog fetch');
    
    const response = await axios.get(`${API_URL}/files`);
    console.log('File catalog fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching file catalog:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file catalog');
  }
};

/**
 * Get file details by ID
 */
export const getFileDetails = async (fileId) => {
  // Validate fileId before making the request
  if (!fileId) {
    console.error('Error fetching file details: No file ID provided');
    return Promise.reject(new Error('No file ID provided'));
  }
  
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file details for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file details');
  }
};

/**
 * Get file profile by ID
 */
export const getFileProfile = async (fileId) => {
  // Validate fileId before making the request
  if (!fileId) {
    console.error('Error fetching file profile: No file ID provided');
    return Promise.reject(new Error('No file ID provided'));
  }
  
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/profile`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file profile for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file profile');
  }
};

/**
 * Get file quality metrics by ID
 */
export const getFileQuality = async (fileId) => {
  // Validate fileId before making the request
  if (!fileId) {
    console.error('Error fetching file quality: No file ID provided');
    return Promise.reject(new Error('No file ID provided'));
  }
  
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/quality`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file quality for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file quality metrics');
  }
};

/**
 * Check if a file is a duplicate based on its hash
 */
export const checkDuplicateFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(`${API_URL}/files/check-duplicate`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error checking for duplicate file:', error);
    throw new Error(error.response?.data?.message || 'Failed to check for duplicate file');
  }
};

/**
 * Delete a file by ID
 */
export const deleteFile = async (fileId) => {
  try {
    const response = await axios.delete(`${API_URL}/files/${fileId}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to delete file');
  }
};

/**
 * Upload a file with progress tracking
 */
export const uploadFile = async (file, progressCallback) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(`${API_URL}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        if (progressCallback && typeof progressCallback === 'function') {
          progressCallback(percentCompleted);
        }
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload file');
  }
};

/**
 * Run quality checks on a file
 */
export const runQualityCheck = async (fileId, rules = null) => {
  try {
    const response = await axios.post(`${API_URL}/files/${fileId}/quality/run`, { rules });
    return response.data;
  } catch (error) {
    console.error(`Error running quality checks for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to run quality checks');
  }
};

/**
 * Get file preview data by ID
 */
export const getFilePreview = async (fileId, limit = 100) => {
  // Validate fileId before making the request
  if (!fileId) {
    console.error('Error fetching file preview: No file ID provided');
    return Promise.reject(new Error('No file ID provided'));
  }
  
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/preview?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file preview for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file preview');
  }
};