import axios from 'axios';

const API_BASE = '/api/vendor-sla';

export const getSLAStatus = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.vendor_id) params.append('vendor_id', filters.vendor_id);
    if (filters.agreement_id) params.append('agreement_id', filters.agreement_id);
    if (filters.status_filter) params.append('status_filter', filters.status_filter);

    const response = await axios.get(`${API_BASE}/status?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching SLA status:', error);
    throw error;
  }
};

export const getSLAViolations = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.vendor_id) params.append('vendor_id', filters.vendor_id);
    if (filters.agreement_id) params.append('agreement_id', filters.agreement_id);
    if (filters.resolved !== undefined) params.append('resolved', filters.resolved);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await axios.get(`${API_BASE}/violations?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching SLA violations:', error);
    throw error;
  }
};

export const runManualSLACheck = async (agreementId) => {
  try {
    const response = await axios.post(`${API_BASE}/test-check`, {
      agreement_id: agreementId
    });
    return response.data;
  } catch (error) {
    console.error('Error running manual SLA check:', error);
    throw error;
  }
};

export const getSLASummary = async () => {
  try {
    const response = await axios.get(`${API_BASE}/summary`);
    return response.data;
  } catch (error) {
    console.error('Error fetching SLA summary:', error);
    throw error;
  }
};
