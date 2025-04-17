import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export const uploadFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(`${API_URL}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
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
    const response = await axios.post(`${API_URL}/files/${fileId}/quality-check`, { rules });
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