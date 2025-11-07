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
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.get(`${API_URL}/files/${encodedFileId}`);
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
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.get(`${API_URL}/files/${encodedFileId}/profile`);
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
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.get(`${API_URL}/files/${encodedFileId}/quality`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file quality for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file quality metrics');
  }
};

/**
 * Check if a file is a duplicate based on its hash
 */
export const checkDuplicateFile = async (file, projectId = null) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (projectId) {
      formData.append('project_id', projectId);
    }
    
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
 * Get schema history for a file
 */
export const getFileSchemaHistory = async (fileId) => {
  // Validate fileId before making the request
  if (!fileId) {
    console.error('Error fetching schema history: No file ID provided');
    return Promise.reject(new Error('No file ID provided'));
  }
  
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.get(`${API_URL}/files/${encodedFileId}/schema-history`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching schema history for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch schema history');
  }
};

/**
 * Delete a file by ID
 */
export const deleteFile = async (fileId) => {
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.delete(`${API_URL}/files/${encodedFileId}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to delete file');
  }
};

/**
 * Delete multiple files by IDs
 */
export const bulkDeleteFiles = async (fileIds) => {
  try {
    const response = await axios.post(`${API_URL}/files/bulk-delete`, { fileIds });
    return response.data;
  } catch (error) {
    console.error('Error bulk deleting files:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete files');
  }
};

/**
 * Upload a file with progress tracking
 */
export const uploadFile = async (file, progressCallback, owner = null, projectId = null, replaceFileId = null, subProjectId = null, qualityRuleIds = null, agreementId = null, vendorAgreementFileSchemaId = null) => {
  try {
    const formData = new FormData();
    formData.append('files', file);
    if (owner) {
      formData.append('owner', owner);
    }
    if (projectId) {
      formData.append('project_id', projectId);
    }
    if (subProjectId) {
      formData.append('sub_project_id', subProjectId);
    }
    if (replaceFileId) {
      formData.append('replace_file_id', replaceFileId);
    }
    if (qualityRuleIds && qualityRuleIds.length > 0) {
      formData.append('quality_rule_ids', JSON.stringify(qualityRuleIds));
    }
    if (agreementId) {
      formData.append('agreement_id', agreementId);
    }
    if (vendorAgreementFileSchemaId) {
      formData.append('vendor_agreement_file_schema_id', vendorAgreementFileSchemaId);
    }
    
    const response = await axios.post(`${API_URL}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (progressCallback && typeof progressCallback === 'function') {
          progressCallback(progressEvent);
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
 * Upload multiple files in a single batch request with progress tracking
 */
export const uploadFilesBatch = async (files, progressCallback, owner = null, projectId = null, subProjectId = null, qualityRuleIds = null, agreementId = null) => {
  try {
    const formData = new FormData();
    
    // Append all files with 'files' field name (backend expects array)
    files.forEach(file => {
      formData.append('files', file);
    });
    
    if (owner) {
      formData.append('owner', owner);
    }
    if (projectId) {
      formData.append('project_id', projectId);
    }
    if (subProjectId) {
      formData.append('sub_project_id', subProjectId);
    }
    if (qualityRuleIds && qualityRuleIds.length > 0) {
      formData.append('quality_rule_ids', JSON.stringify(qualityRuleIds));
    }
    if (agreementId) {
      formData.append('agreement_id', agreementId);
    }
    
    const response = await axios.post(`${API_URL}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (progressCallback && typeof progressCallback === 'function') {
          progressCallback(progressEvent);
        }
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading files:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload files');
  }
};

/**
 * Run quality checks on a file
 */
export const runQualityCheck = async (fileId, rules = null) => {
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.post(`${API_URL}/files/${encodedFileId}/quality/check`, { rules });
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
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.get(`${API_URL}/files/${encodedFileId}/preview?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file preview for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file preview');
  }
};