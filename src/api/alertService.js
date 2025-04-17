import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export const getAlertRules = async () => {
  try {
    const response = await axios.get(`${API_URL}/alerts`);
    return response.data;
  } catch (error) {
    console.error('Error fetching alert rules:', error);
    throw error;
  }
};

export const createAlertRule = async (rule) => {
  try {
    const response = await axios.post(`${API_URL}/alerts`, rule);
    return response.data;
  } catch (error) {
    console.error('Error creating alert rule:', error);
    throw error;
  }
};

export const updateAlertRule = async (ruleId, rule) => {
  try {
    const response = await axios.put(`${API_URL}/alerts/${ruleId}`, rule);
    return response.data;
  } catch (error) {
    console.error('Error updating alert rule:', error);
    throw error;
  }
};

export const deleteAlertRule = async (ruleId) => {
  try {
    const response = await axios.delete(`${API_URL}/alerts/${ruleId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting alert rule:', error);
    throw error;
  }
};

export const getAlertHistory = async () => {
  try {
    const response = await axios.get(`${API_URL}/alerts/history`);
    return response.data;
  } catch (error) {
    console.error('Error fetching alert history:', error);
    throw error;
  }
};

export const getFileAlerts = async (fileId) => {
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/alerts`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file alerts:', error);
    throw error;
  }
};