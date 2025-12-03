import axios from 'axios';

const API_URL = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`
  };
};

export const getAlertPolicies = async () => {
  try {
    const response = await axios.get(`${API_URL}/alert-policies`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching alert policies:', error);
    throw error;
  }
};

export const getAlertPolicy = async (policyId) => {
  try {
    const response = await axios.get(`${API_URL}/alert-policies/${policyId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching alert policy:', error);
    throw error;
  }
};

export const createAlertPolicy = async (policy) => {
  try {
    const response = await axios.post(`${API_URL}/alert-policies`, policy, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error creating alert policy:', error);
    throw error;
  }
};

export const updateAlertPolicy = async (policyId, policy) => {
  try {
    const response = await axios.put(`${API_URL}/alert-policies/${policyId}`, policy, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error updating alert policy:', error);
    throw error;
  }
};

export const deleteAlertPolicy = async (policyId) => {
  try {
    const response = await axios.delete(`${API_URL}/alert-policies/${policyId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting alert policy:', error);
    throw error;
  }
};

export const getAlertPolicyRuns = async (policyId) => {
  try {
    const response = await axios.get(`${API_URL}/alert-policies/${policyId}/runs`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching alert policy runs:', error);
    throw error;
  }
};

export const getPolicyRecipients = async (policyId) => {
  try {
    const response = await axios.get(`${API_URL}/alert-policies/${policyId}/recipients`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching policy recipients:', error);
    throw error;
  }
};

export const addPolicyRecipient = async (policyId, recipient) => {
  try {
    const response = await axios.post(`${API_URL}/alert-policies/${policyId}/recipients`, recipient, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error adding policy recipient:', error);
    throw error;
  }
};

export const deletePolicyRecipient = async (policyId, recipientId) => {
  try {
    const response = await axios.delete(`${API_URL}/alert-policies/${policyId}/recipients/${recipientId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting policy recipient:', error);
    throw error;
  }
};

export const getEmailConnections = async () => {
  try {
    const response = await axios.get(`${API_URL}/email-connections`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching email connections:', error);
    throw error;
  }
};

export const createEmailConnection = async (connection) => {
  try {
    const response = await axios.post(`${API_URL}/email-connections`, connection, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error creating email connection:', error);
    throw error;
  }
};

export const testEmailConnection = async (connectionId, toEmail) => {
  try {
    const response = await axios.post(
      `${API_URL}/email-connections/${connectionId}/test`,
      { to_email: toEmail },
      { headers: getAuthHeaders() }
    );
    return response.data;
  } catch (error) {
    console.error('Error testing email connection:', error);
    throw error;
  }
};

export const updateEmailConnection = async (connectionId, connection) => {
  try {
    const response = await axios.put(`${API_URL}/email-connections/${connectionId}`, connection, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error updating email connection:', error);
    throw error;
  }
};

export const deleteEmailConnection = async (connectionId) => {
  try {
    const response = await axios.delete(`${API_URL}/email-connections/${connectionId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting email connection:', error);
    throw error;
  }
};

export const getAlertHistory = async () => {
  try {
    const response = await axios.get(`${API_URL}/alert-policies/history`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching alert history:', error);
    throw error;
  }
};

export const getFileAlerts = async (fileId) => {
  try {
    const response = await axios.get(`${API_URL}/files/${fileId}/alerts`, {
      headers: getAuthHeaders()
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching file alerts:', error);
    throw error;
  }
};