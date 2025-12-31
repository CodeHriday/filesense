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
 * Get the file catalog initialization data (batch endpoint)
 * Returns { files: Array, totalCount: number, projects: Array, subProjects: Array }
 */
export const getFileCatalogInitData = async () => {
  try {
    console.log('Fetching file catalog init data...');
    const response = await axios.get(`${API_URL}/files/init-data`);
    console.log('File catalog init data fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching file catalog init data:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch file catalog');
  }
};

/**
 * Get the file catalog
 * Returns { files: Array, totalCount: number }
 */
export const getFileCatalog = async () => {
  try {
    console.log('Fetching file catalog...');
    
    // First test API connection to ensure backend is available
    const connectionStatus = await testApiConnection();
    console.log('API connection successful, proceeding with file catalog fetch');
    
    const response = await axios.get(`${API_URL}/files`);
    console.log('File catalog fetch successful:', response.data);
    
    // Handle both old format (array) and new format ({ files, totalCount })
    if (Array.isArray(response.data)) {
      return { files: response.data, totalCount: response.data.length };
    }
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
export const uploadFile = async (file, progressCallback, owner = null, projectId = null, replaceFileId = null, subProjectId = null, qualityRuleIds = null, agreementId = null, vendorAgreementFileSchemaId = null, fileHash = null, delimiter = null, headerConfig = null, fixedWidthSchema = null, archivePassword = null) => {
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
    // Optimize: Pass pre-calculated hash to avoid redundant file read on server
    if (fileHash) {
      const hashes = {};
      hashes[file.name] = fileHash;
      formData.append('fileHashes', JSON.stringify(hashes));
    }
    // Pass delimiter for delimited files
    if (delimiter) {
      formData.append('delimiter', delimiter);
    }
    // Pass header configuration for files without headers
    if (headerConfig) {
      formData.append('headerConfig', JSON.stringify(headerConfig));
    }
    // Pass fixed-width schema for .dat files
    if (fixedWidthSchema) {
      formData.append('fixedWidthSchema', JSON.stringify(fixedWidthSchema));
    }
    // Pass archive password for password-protected archives (one-time use, not stored)
    if (archivePassword) {
      console.log('[DIAGNOSTIC] Appending archive_password to FormData');
      formData.append('archive_password', archivePassword);
    }
    
    console.log('[DIAGNOSTIC] FormData contents before upload:', {
      hasFile: formData.has('files'),
      hasPassword: formData.has('archive_password'),
      hasProjectId: formData.has('project_id')
    });
    
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
    // Preserve the full error structure from backend (validation errors contain error, message, details, hint)
    throw error;
  }
};

/**
 * Upload multiple files in a single batch request with progress tracking
 */
export const uploadFilesBatch = async (files, progressCallback, owner = null, projectId = null, subProjectId = null, qualityRuleIds = null, agreementId = null, fileHashes = null, delimiter = null, headerConfig = null, fixedWidthSchema = null, archivePassword = null) => {
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
    // Optimize: Pass pre-calculated hashes to avoid redundant file reads on server
    if (fileHashes && Object.keys(fileHashes).length > 0) {
      formData.append('fileHashes', JSON.stringify(fileHashes));
    }
    // Pass delimiter for delimited files
    if (delimiter) {
      formData.append('delimiter', delimiter);
    }
    // Pass header configuration for files without headers
    if (headerConfig) {
      formData.append('headerConfig', JSON.stringify(headerConfig));
    }
    // Pass fixed-width schema for .dat files
    if (fixedWidthSchema) {
      formData.append('fixedWidthSchema', JSON.stringify(fixedWidthSchema));
    }
    // Pass archive password for password-protected archives (one-time use, not stored)
    if (archivePassword) {
      formData.append('archive_password', archivePassword);
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
    // Preserve the full error structure from backend (validation errors contain error, message, details, hint)
    throw error;
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

/**
 * Submit password for a password-protected archive and retry processing
 */
export const submitFilePassword = async (fileId, password) => {
  if (!fileId || !password) {
    throw new Error('File ID and password are required');
  }
  
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.post(`${API_URL}/files/${encodedFileId}/password`, { password });
    return response.data;
  } catch (error) {
    console.error(`Error submitting password for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to submit password');
  }
};

/**
 * Retry processing a failed file
 */
export const retryFileProcessing = async (fileId) => {
  if (!fileId) {
    throw new Error('File ID is required');
  }
  
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.post(`${API_URL}/files/${encodedFileId}/retry`);
    return response.data;
  } catch (error) {
    console.error(`Error retrying file processing for ${fileId}:`, error);
    throw new Error(error.response?.data?.message || 'Failed to retry file processing');
  }
};