// This service will handle all API calls related to alerts

const API_URL = '/api';

// Get all alert rules
export const getAlertRules = async () => {
  try {
    const response = await fetch(`${API_URL}/alerts/rules`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch alert rules');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching alert rules:', error);
    throw error;
  }
};

// Create a new alert rule
export const createAlertRule = async (rule) => {
  try {
    const response = await fetch(`${API_URL}/alerts/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create alert rule');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating alert rule:', error);
    throw error;
  }
};

// Update an existing alert rule
export const updateAlertRule = async (ruleId, rule) => {
  try {
    const response = await fetch(`${API_URL}/alerts/rules/${ruleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update alert rule');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating alert rule:', error);
    throw error;
  }
};

// Delete an alert rule
export const deleteAlertRule = async (ruleId) => {
  try {
    const response = await fetch(`${API_URL}/alerts/rules/${ruleId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete alert rule');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting alert rule:', error);
    throw error;
  }
};

// Get alert history
export const getAlertHistory = async () => {
  try {
    const response = await fetch(`${API_URL}/alerts/history`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch alert history');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching alert history:', error);
    throw error;
  }
};

// Get alert notifications for a specific file
export const getFileAlerts = async (fileId) => {
  try {
    const response = await fetch(`${API_URL}/files/${fileId}/alerts`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch file alerts');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching file alerts:', error);
    throw error;
  }
};