import axios from 'axios';

const API_BASE_URL = '/api/error-review';

const cleanParams = (params) => {
  const cleaned = {};
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (value !== null && value !== undefined && value !== '') {
      cleaned[key] = value;
    }
  });
  return cleaned;
};

export const getViolations = async (filters = {}) => {
  const response = await axios.get(`${API_BASE_URL}/violations`, { params: cleanParams(filters) });
  return response.data;
};

export const getFileErrors = async (filters = {}) => {
  const response = await axios.get(`${API_BASE_URL}/file-errors`, { params: cleanParams(filters) });
  return response.data;
};

export const getMappingErrors = async (filters = {}) => {
  const response = await axios.get(`${API_BASE_URL}/mapping-errors`, { params: cleanParams(filters) });
  return response.data;
};

export const getErrorStatistics = async (projectId = null) => {
  const params = projectId ? { project_id: projectId } : {};
  const response = await axios.get(`${API_BASE_URL}/statistics`, { params });
  return response.data;
};

export const updateViolationStatus = async (violationId, status, resolution_notes = null) => {
  const response = await axios.patch(`${API_BASE_URL}/violations/${violationId}/status`, { 
    status,
    resolution_notes 
  });
  return response.data;
};

export const bulkUpdateViolationStatus = async (violationIds, status) => {
  const response = await axios.post(`${API_BASE_URL}/violations/bulk-update`, {
    violation_ids: violationIds,
    status
  });
  return response.data;
};
