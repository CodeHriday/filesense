import axios from 'axios';

const API_URL = '/api';

export const getQualityRules = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.project_id) params.append('project_id', filters.project_id);
    if (filters.rule_type) params.append('rule_type', filters.rule_type);
    if (filters.enabled !== undefined) params.append('enabled', filters.enabled);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await axios.get(`${API_URL}/quality-rules?${params}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching quality rules:', error);
    throw error;
  }
};

export const getQualityRule = async (ruleId) => {
  try {
    const response = await axios.get(`${API_URL}/quality-rules/${ruleId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching quality rule:', error);
    throw error;
  }
};

export const createQualityRule = async (ruleData) => {
  try {
    const response = await axios.post(`${API_URL}/quality-rules`, ruleData);
    return response.data;
  } catch (error) {
    console.error('Error creating quality rule:', error);
    throw error;
  }
};

export const updateQualityRule = async (ruleId, ruleData) => {
  try {
    const response = await axios.put(`${API_URL}/quality-rules/${ruleId}`, ruleData);
    return response.data;
  } catch (error) {
    console.error('Error updating quality rule:', error);
    throw error;
  }
};

export const deleteQualityRule = async (ruleId) => {
  try {
    const response = await axios.delete(`${API_URL}/quality-rules/${ruleId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting quality rule:', error);
    throw error;
  }
};

export const getViolationsSummary = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.project_id) params.append('project_id', filters.project_id);
    if (filters.rule_id) params.append('rule_id', filters.rule_id);
    if (filters.severity) params.append('severity', filters.severity);
    if (filters.days) params.append('days', filters.days);

    const response = await axios.get(`${API_URL}/quality-rules/violations/summary?${params}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching violations summary:', error);
    throw error;
  }
};

export const getProjects = async () => {
  try {
    const response = await axios.get(`${API_URL}/projects`);
    return response.data;
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
};

export const getFileQualityRules = async (fileId) => {
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.get(`${API_URL}/files/${encodedFileId}/quality-rules`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file quality rules:', error);
    throw error;
  }
};

export const assignFileQualityRules = async (fileId, ruleIds) => {
  try {
    const encodedFileId = encodeURIComponent(fileId);
    const response = await axios.post(`${API_URL}/files/${encodedFileId}/quality-rules`, {
      rule_ids: ruleIds
    });
    return response.data;
  } catch (error) {
    console.error('Error assigning quality rules to file:', error);
    throw error;
  }
};
