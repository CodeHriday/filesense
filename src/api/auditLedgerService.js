import axios from 'axios';

const API_BASE = '/api/audit-ledger';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const getAuditLedgerEntries = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.tenantId) params.append('tenant_id', filters.tenantId);
  if (filters.jobId) params.append('job_id', filters.jobId);
  if (filters.correlationId) params.append('correlation_id', filters.correlationId);
  if (filters.actorId) params.append('actor_id', filters.actorId);
  if (filters.actionType) params.append('action_type', filters.actionType);
  if (filters.actionCategory) params.append('action_category', filters.actionCategory);
  if (filters.entityType) params.append('entity_type', filters.entityType);
  if (filters.entityId) params.append('entity_id', filters.entityId);
  if (filters.logLevel) params.append('log_level', filters.logLevel);
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.limit) params.append('limit', filters.limit);
  if (filters.offset) params.append('offset', filters.offset);
  
  const response = await axios.get(`${API_BASE}?${params.toString()}`, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const getAuditLedgerByJobId = async (jobId, options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.append('limit', options.limit);
  if (options.offset) params.append('offset', options.offset);
  
  const response = await axios.get(`${API_BASE}/job/${encodeURIComponent(jobId)}?${params.toString()}`, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const getAuditLedgerByCorrelationId = async (correlationId, options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.append('limit', options.limit);
  if (options.offset) params.append('offset', options.offset);
  
  const response = await axios.get(`${API_BASE}/correlation/${encodeURIComponent(correlationId)}?${params.toString()}`, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const verifyAuditLedger = async (options = {}) => {
  const response = await axios.post(`${API_BASE}/verify`, {
    tenant_id: options.tenantId || 'default',
    start_sequence: options.startSequence || 1,
    end_sequence: options.endSequence || null
  }, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const getVerificationHistory = async (tenantId = 'default', limit = 50) => {
  const response = await axios.get(`${API_BASE}/verification-history?tenant_id=${tenantId}&limit=${limit}`, {
    headers: getAuthHeaders()
  });
  return response.data;
};

export const exportAuditLedgerByJob = async (jobId, format = 'json', includeVerification = false) => {
  const response = await axios.get(
    `${API_BASE}/export/job/${encodeURIComponent(jobId)}?format=${format}&include_verification=${includeVerification}`,
    {
      headers: getAuthHeaders(),
      responseType: format === 'csv' ? 'blob' : 'blob'
    }
  );
  return response.data;
};

export const exportAuditLedgerByCorrelation = async (correlationId, format = 'json', includeVerification = false) => {
  const response = await axios.get(
    `${API_BASE}/export/correlation/${encodeURIComponent(correlationId)}?format=${format}&include_verification=${includeVerification}`,
    {
      headers: getAuthHeaders(),
      responseType: 'blob'
    }
  );
  return response.data;
};

export const getAuditLedgerStats = async (tenantId = 'default') => {
  const response = await axios.get(`${API_BASE}/stats?tenant_id=${tenantId}`, {
    headers: getAuthHeaders()
  });
  return response.data;
};
