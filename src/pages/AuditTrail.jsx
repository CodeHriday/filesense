import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch, FiFilter, FiDownload, FiEye, FiClock, FiUser, FiDatabase, FiArchive, FiTrash2, FiSettings, FiChevronLeft, FiChevronRight, FiX, FiCheckCircle, FiXCircle, FiActivity, FiAlertTriangle, FiGlobe, FiHash } from 'react-icons/fi';
import axios from 'axios';
import PageLayout from '../components/PageLayout';
import '../styles/global-page-styles.css';

const AuditTrail = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [summaryData, setSummaryData] = useState({ total: 0, successCount: 0, failureCount: 0, todayEvents: 0 });
  const [retentionSettings, setRetentionSettings] = useState({
    retention_days: 30,
    auto_archive_enabled: false,
    auto_delete_enabled: false
  });
  const [operationLoading, setOperationLoading] = useState(false);
  const [showRetentionPanel, setShowRetentionPanel] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  
  const [filters, setFilters] = useState({
    userId: '',
    entityType: '',
    actionType: '',
    startDate: '',
    endDate: '',
    statusFilter: 'all',
    datePreset: ''
  });
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const datePresets = [
    { label: 'Last Hour', value: 'last_hour' },
    { label: 'Last 24 Hours', value: 'last_24h' },
    { label: 'Last 7 Days', value: 'last_7d' },
    { label: 'Last 30 Days', value: 'last_30d' },
    { label: 'Custom', value: 'custom' }
  ];

  const formatLocalDateTime = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const applyDatePreset = (preset) => {
    const now = new Date();
    let startDate = '';
    
    switch (preset) {
      case 'last_hour':
        startDate = formatLocalDateTime(new Date(now.getTime() - 60 * 60 * 1000));
        break;
      case 'last_24h':
        startDate = formatLocalDateTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        break;
      case 'last_7d':
        startDate = formatLocalDateTime(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        break;
      case 'last_30d':
        startDate = formatLocalDateTime(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        break;
      default:
        break;
    }
    
    if (preset !== 'custom') {
      setFilters(prev => ({ ...prev, startDate, endDate: '', datePreset: preset }));
    } else {
      setFilters(prev => ({ ...prev, datePreset: preset }));
    }
  };

  const actionTypes = [
    'CREATE', 'UPDATE', 'DELETE', 'READ', 'UPLOAD', 'DOWNLOAD', 'EXECUTE', 'VIEW'
  ];

  const entityTypes = [
    'file', 'schedule', 'job_group', 'transformation', 'quality_check', 
    'profile', 'user', 'audit', 'dbt', 'project', 'sub_project', 'vendor',
    'notification', 'mapping_group', 'mapping', 'workflow', 'workflow_step',
    'dashboard', 'connection', 'authentication', 'role', 'permission', 'group',
    'lineage', 'badge', 'alert', 'governance_tag', 'policy', 'retention_policy',
    'ai', 'ml', 'anomaly', 'healing', 'cache', 'job', 'schema_history',
    'drop_location', 'error_review', 'file_insight', 'file_audit',
    'password_reset', 'admin', 'system', 'unknown'
  ];

  const formatEntityType = (entityType) => {
    if (!entityType) return 'N/A';
    if (entityType === 'unknown') return 'System';
    if (entityType === 'system') return 'System';
    return entityType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  useEffect(() => {
    const initializeAuditTrail = async () => {
      try {
        // Fetch retention settings first to determine date range
        const retentionResponse = await axios.get('/api/audit/retention-settings');
        const settings = retentionResponse.data;
        setRetentionSettings(settings);
        
        // Calculate startDate based on retention_days
        const retentionDays = settings.retention_days || 30;
        const startDate = formatLocalDateTime(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000));
        
        // Set initial filters with retention-based date range
        const initialFilters = {
          userId: '',
          entityType: '',
          actionType: '',
          startDate: startDate,
          endDate: '',
          statusFilter: 'all',
          datePreset: `last_${retentionDays}d`
        };
        setFilters(initialFilters);
        
        // Now fetch audit logs with retention-based date range
        await fetchAuditLogs(initialFilters);
        setInitialLoadComplete(true);
      } catch (error) {
        console.error('Error initializing audit trail:', error);
        // Fallback: fetch logs without date filter
        await fetchAuditLogs();
        setInitialLoadComplete(true);
      }
    };
    
    initializeAuditTrail();
    fetchStatistics();
    fetchSummary();
  }, []);

  const fetchAuditLogs = async (overrideFilters = null) => {
    setLoading(true);
    try {
      const activeFilters = overrideFilters || filters;
      const params = new URLSearchParams();
      if (activeFilters.userId) params.append('userId', activeFilters.userId);
      if (activeFilters.entityType) params.append('entityType', activeFilters.entityType);
      if (activeFilters.actionType) params.append('actionType', activeFilters.actionType);
      if (activeFilters.startDate) params.append('startDate', activeFilters.startDate);
      if (activeFilters.endDate) params.append('endDate', activeFilters.endDate);
      // No limit - fetch all records within date range (controlled by retention settings)

      const response = await axios.get(`/api/audit/logs?${params.toString()}`);
      setAuditLogs(response.data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await axios.get('/api/audit/statistics');
      setStatistics(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchRetentionSettings = async () => {
    try {
      const response = await axios.get('/api/audit/retention-settings');
      setRetentionSettings(response.data);
    } catch (error) {
      console.error('Error fetching retention settings:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await axios.get('/api/audit/summary');
      setSummaryData(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const handleUpdateRetentionSettings = async () => {
    try {
      setOperationLoading(true);
      await axios.put('/api/audit/retention-settings', retentionSettings);
      setConfirmMessage('Retention settings updated successfully');
      setShowConfirmModal(true);
      fetchRetentionSettings();
    } catch (error) {
      console.error('Error updating retention settings:', error);
      setConfirmMessage('Failed to update retention settings');
      setShowConfirmModal(true);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleArchiveRecords = async () => {
    if (!confirm(`Archive all records older than ${retentionSettings.retention_days} days?`)) {
      return;
    }

    try {
      setOperationLoading(true);
      const response = await axios.post('/api/audit/archive', {
        retention_days: retentionSettings.retention_days
      });
      alert(`Archived ${response.data.totalArchived} records successfully`);
      fetchStatistics();
    } catch (error) {
      console.error('Error archiving records:', error);
      alert('Failed to archive records');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteRecords = async () => {
    if (!confirm(`PERMANENTLY DELETE all records older than ${retentionSettings.retention_days} days? This cannot be undone.`)) {
      return;
    }

    try {
      setOperationLoading(true);
      const response = await axios.delete('/api/audit/cleanup', {
        data: {
          retention_days: retentionSettings.retention_days,
          delete_archived: false
        }
      });
      alert(`Deleted ${response.data.totalDeleted} records successfully`);
      fetchStatistics();
    } catch (error) {
      console.error('Error deleting records:', error);
      alert('Failed to delete records');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteArchivedRecords = async (archiveCutoffDays = 90) => {
    if (!confirm(`PERMANENTLY DELETE archived records older than ${archiveCutoffDays} days? This cannot be undone.`)) {
      return;
    }

    try {
      setOperationLoading(true);
      const response = await axios.delete('/api/audit/cleanup', {
        data: {
          delete_archived: true,
          archive_cutoff_days: archiveCutoffDays
        }
      });
      alert(`Deleted ${response.data.totalDeleted} archived records successfully`);
      fetchStatistics();
    } catch (error) {
      console.error('Error deleting archived records:', error);
      alert('Failed to delete archived records');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchAuditLogs();
  };

  const handleClearFilters = () => {
    // Reset to retention-based date range
    const retentionDays = retentionSettings.retention_days || 30;
    const startDate = formatLocalDateTime(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000));
    
    const clearedFilters = {
      userId: '',
      entityType: '',
      actionType: '',
      startDate: startDate,
      endDate: '',
      statusFilter: 'all',
      datePreset: `last_${retentionDays}d`
    };
    setFilters(clearedFilters);
    setCurrentPage(1);
    fetchAuditLogs(clearedFilters);
  };

  const filteredLogs = useMemo(() => {
    if (filters.statusFilter === 'all') return auditLogs;
    return auditLogs.filter(log => {
      if (filters.statusFilter === 'success') return log.status === 'SUCCESS';
      if (filters.statusFilter === 'failure') return log.status === 'FAILURE' || log.status === 'ERROR';
      return true;
    });
  }, [auditLogs, filters.statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.statusFilter]);

  const summaryStats = useMemo(() => {
    const total = auditLogs.length;
    const successCount = auditLogs.filter(log => log.status === 'SUCCESS').length;
    const failureCount = auditLogs.filter(log => log.status === 'FAILURE' || log.status === 'ERROR').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEvents = auditLogs.filter(log => new Date(log.timestamp) >= today).length;
    const actionBreakdown = auditLogs.reduce((acc, log) => {
      acc[log.action_type] = (acc[log.action_type] || 0) + 1;
      return acc;
    }, {});
    return { total, successCount, failureCount, todayEvents, actionBreakdown };
  }, [auditLogs]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const clampedPage = Math.min(currentPage, totalPages);
  const startIndex = (clampedPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleExport = async () => {
    try {
      const response = await axios.post('/api/audit/export', filters, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting audit logs:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${dateStr} ${timeStr}.${ms}`;
  };

  const getActionBadgeClass = (action) => {
    switch (action) {
      case 'CREATE': return 'gps-badge--success';
      case 'UPDATE': return 'gps-badge--info';
      case 'DELETE': return 'gps-badge--danger';
      case 'READ':
      case 'VIEW': return 'gps-badge--muted';
      case 'UPLOAD': return 'gps-badge--success';
      case 'DOWNLOAD': return 'gps-badge--info';
      case 'EXECUTE': return 'gps-badge--warning';
      default: return 'gps-badge--info';
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'SUCCESS') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 500, backgroundColor: '#dcfce7', color: '#166534' }}>
          <FiCheckCircle size={10} />
          Success
        </span>
      );
    } else if (status === 'FAILURE' || status === 'ERROR') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 500, backgroundColor: '#fee2e2', color: '#991b1b' }}>
          <FiXCircle size={10} />
          Failed
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 500, backgroundColor: '#f3f4f6', color: '#6b7280' }}>
        {status || 'N/A'}
      </span>
    );
  };

  const generateDescription = (log) => {
    const action = log.action_type?.toLowerCase() || 'performed action on';
    const entity = formatEntityType(log.entity_type);
    const name = log.entity_name || log.entity_id || '';
    
    if (log.operation) {
      return log.operation;
    }
    
    let desc = `${action.charAt(0).toUpperCase() + action.slice(1)}d ${entity}`;
    if (name) {
      desc += `: ${name.length > 30 ? name.substring(0, 30) + '...' : name}`;
    }
    return desc;
  };

  const renderDiff = (changes) => {
    if (!changes) return null;
    const changesObj = typeof changes === 'string' ? JSON.parse(changes) : changes;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(changesObj).map(([key, value]) => (
          <div key={key} style={{ fontSize: '11px' }}>
            <span style={{ fontWeight: 600, color: '#5f6368' }}>{key}:</span>
            <div style={{ marginLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {value.from !== undefined && (
                <div style={{ color: '#d93025' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>- </span>
                  {JSON.stringify(value.from)}
                </div>
              )}
              {value.to !== undefined && (
                <div style={{ color: '#34a853' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>+ </span>
                  {JSON.stringify(value.to)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <PageLayout
      title="Audit Trail"
      subtitle="Track all system activities and changes"
      headerActions={
        <button
          onClick={() => setShowRetentionPanel(!showRetentionPanel)}
          className="gps-btn gps-btn--secondary"
        >
          <FiSettings />
          {showRetentionPanel ? 'Hide' : 'Show'} Retention Management
        </button>
      }
    >

      {showRetentionPanel && (
        <>
          <div className="gps-section" style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '24px' }}>
            <div className="gps-section-header">
              <h2 className="gps-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiDatabase style={{ color: '#025043' }} />
                Audit Statistics
              </h2>
            </div>

            {statistics && (
              <div className="gps-table-container">
                <table className="gps-table">
                  <thead>
                    <tr>
                      <th>Table Name</th>
                      <th>Type</th>
                      <th>Record Count</th>
                      <th>Oldest Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(statistics).map(([table, data]) => {
                      const tableName = table.replace(/_/g, ' ').toUpperCase();
                      const isArchive = table.includes('archive');
                      
                      return (
                        <tr key={table}>
                          <td style={{ fontWeight: 500 }}>{tableName}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isArchive ? <FiArchive style={{ color: '#9aa0a6' }} /> : <FiDatabase style={{ color: '#025043' }} />}
                              <span>{isArchive ? 'Archive' : 'Active'}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{(data?.total_records || data?.count || 0).toLocaleString()}</td>
                          <td>{(data?.total_records > 0 || data?.count > 0) && data?.oldest_record ? new Date(data.oldest_record).toLocaleDateString() : 'N/A'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="gps-section" style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '24px' }}>
            <div className="gps-section-header">
              <h2 className="gps-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiSettings style={{ color: '#025043' }} />
                Retention Management
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div className="gps-form-group">
                <label htmlFor="retention-days" className="gps-label">Retention Period (days)</label>
                <select
                  id="retention-days"
                  className="gps-select"
                  value={retentionSettings.retention_days}
                  onChange={(e) => setRetentionSettings(prev => ({ ...prev, retention_days: parseInt(e.target.value) }))}
                >
                  <option value={7}>7 days</option>
                  <option value={15}>15 days</option>
                  <option value={23}>23 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <small className="gps-text-muted" style={{ fontSize: '9px', marginTop: '4px', display: 'block' }}>
                  Records older than this will be affected by archive/delete operations
                </small>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label className="gps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={retentionSettings.auto_archive_enabled}
                    onChange={(e) => setRetentionSettings(prev => ({ ...prev, auto_archive_enabled: e.target.checked }))}
                  />
                  <span>Enable automatic archiving</span>
                </label>

                <label className="gps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={retentionSettings.auto_delete_enabled}
                    onChange={(e) => setRetentionSettings(prev => ({ ...prev, auto_delete_enabled: e.target.checked }))}
                  />
                  <span>Enable automatic deletion</span>
                </label>

                <button
                  onClick={handleUpdateRetentionSettings}
                  disabled={operationLoading}
                  className="gps-btn gps-btn--primary"
                >
                  {operationLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>

            <div className="gps-divider"></div>
            
            <div>
              <h3 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>Manual Operations</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <button
                  onClick={handleArchiveRecords}
                  disabled={operationLoading}
                  className="gps-btn gps-btn--secondary"
                >
                  <FiArchive />
                  Archive Old Records
                </button>

                <button
                  onClick={handleDeleteRecords}
                  disabled={operationLoading}
                  className="gps-btn gps-btn--danger"
                >
                  <FiTrash2 />
                  Delete Old Records
                </button>

                <button
                  onClick={() => handleDeleteArchivedRecords(90)}
                  disabled={operationLoading}
                  className="gps-btn gps-btn--secondary"
                  style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                >
                  <FiTrash2 />
                  Delete Archived (90+ days)
                </button>
              </div>
              <small className="gps-text-muted" style={{ fontSize: '9px', marginTop: '12px', display: 'block' }}>
                All operations use the selected retention period. Archive operations move records to archive tables. Delete operations permanently remove records.
              </small>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FiActivity size={20} style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>Total Events</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>{summaryData.total.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FiCheckCircle size={20} style={{ color: '#16a34a' }} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>Successful</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#16a34a' }}>{summaryData.successCount.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FiAlertTriangle size={20} style={{ color: '#dc2626' }} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>Failed</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#dc2626' }}>{summaryData.failureCount.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FiClock size={20} style={{ color: '#d97706' }} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>Today</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#d97706' }}>{summaryData.todayEvents.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="gps-card" style={{ marginBottom: '24px' }}>
        <div className="gps-card-header" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="gps-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#374151', margin: 0 }}>
            <FiFilter style={{ color: '#6b7280' }} />
            Filters
          </h3>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['all', 'success', 'failure'].map(status => (
              <button
                key={status}
                onClick={() => handleFilterChange('statusFilter', status)}
                style={{
                  padding: '4px 12px',
                  fontSize: '10px',
                  fontWeight: 500,
                  border: '1px solid',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  backgroundColor: filters.statusFilter === status ? (status === 'success' ? '#dcfce7' : status === 'failure' ? '#fee2e2' : '#e0e7ff') : '#fff',
                  borderColor: filters.statusFilter === status ? (status === 'success' ? '#16a34a' : status === 'failure' ? '#dc2626' : '#4f46e5') : '#d1d5db',
                  color: filters.statusFilter === status ? (status === 'success' ? '#166534' : status === 'failure' ? '#991b1b' : '#4338ca') : '#6b7280'
                }}
              >
                {status === 'all' ? 'All' : status === 'success' ? 'Success' : 'Failed'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="filter-date-preset" style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Date Range</label>
            <select
              id="filter-date-preset"
              value={filters.datePreset}
              onChange={(e) => applyDatePreset(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}
            >
              <option value="">Select Range</option>
              {datePresets.map(preset => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="filter-user" style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>User</label>
            <input
              id="filter-user"
              type="text"
              placeholder="Search by user"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', color: '#374151' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="filter-action-type" style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Action Type</label>
            <select
              id="filter-action-type"
              value={filters.actionType}
              onChange={(e) => handleFilterChange('actionType', e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}
            >
              <option value="">All Actions</option>
              {actionTypes.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="filter-entity-type" style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Entity Type</label>
            <select
              id="filter-entity-type"
              value={filters.entityType}
              onChange={(e) => handleFilterChange('entityType', e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}
            >
              <option value="">All Entities</option>
              {entityTypes.map(entity => (
                <option key={entity} value={entity}>{formatEntityType(entity)}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="filter-start-date" style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Start Date</label>
            <input
              id="filter-start-date"
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => { handleFilterChange('startDate', e.target.value); handleFilterChange('datePreset', 'custom'); }}
              style={{ width: '100%', padding: '8px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', color: '#374151' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="filter-end-date" style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>End Date</label>
            <input
              id="filter-end-date"
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff', color: '#374151' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
          <button onClick={handleSearch} className="gps-btn gps-btn--primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FiSearch size={14} />
            Search
          </button>
          <button onClick={handleClearFilters} className="gps-btn gps-btn--secondary">
            Clear Filters
          </button>
          <button onClick={handleExport} className="gps-btn gps-btn--secondary" style={{ marginLeft: 'auto', borderColor: '#16a34a', color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FiDownload size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="gps-empty-state">
          <div className="gps-spinner"></div>
          <p style={{ marginTop: '16px' }}>Loading audit logs...</p>
        </div>
      ) : (
        <>
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Event ID</th>
                  <th style={{ width: '160px' }}>Timestamp</th>
                  <th style={{ width: '140px' }}>User</th>
                  <th style={{ width: '80px' }}>Action</th>
                  <th style={{ width: '100px' }}>Entity</th>
                  <th style={{ width: '80px' }}>Status</th>
                  <th>Description</th>
                  <th style={{ width: '60px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="gps-table-empty">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr key={log.audit_id} style={{ backgroundColor: log.status === 'FAILURE' || log.status === 'ERROR' ? '#fef2f2' : 'transparent' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiHash style={{ color: '#9aa0a6', flexShrink: 0, width: '10px', height: '10px' }} />
                          <span style={{ fontFamily: 'monospace', fontSize: '9px', color: '#6b7280' }}>
                            {log.audit_id?.toString().slice(-6) || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiClock style={{ color: '#9aa0a6', flexShrink: 0, width: '12px', height: '12px' }} />
                          <span style={{ fontSize: '10px' }}>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiUser style={{ color: '#9aa0a6', flexShrink: 0, width: '12px', height: '12px' }} />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '10px' }}>
                              {log.user_email || log.user_id || 'System'}
                            </div>
                            {log.user_role && (
                              <div style={{ fontSize: '9px', color: '#5f6368' }}>{log.user_role}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`gps-badge ${getActionBadgeClass(log.action_type)}`} style={{ fontSize: '9px' }}>
                          {log.action_type || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 500, color: '#374151' }}>
                            {formatEntityType(log.entity_type)}
                          </span>
                          {log.entity_id && (
                            <span style={{ fontSize: '8px', color: '#5f6368', fontFamily: 'monospace' }}>
                              {String(log.entity_id).length > 12 ? String(log.entity_id).slice(0, 12) + '...' : log.entity_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {getStatusBadge(log.status)}
                      </td>
                      <td>
                        <span style={{ fontSize: '10px', color: '#374151' }} title={generateDescription(log)}>
                          {generateDescription(log).length > 40 ? generateDescription(log).substring(0, 40) + '...' : generateDescription(log)}
                        </span>
                        {log.error_message && (
                          <div style={{ fontSize: '9px', color: '#dc2626', marginTop: '2px' }}>
                            {log.error_message.length > 50 ? log.error_message.substring(0, 50) + '...' : log.error_message}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="gps-icon-btn gps-icon-btn--view"
                          onClick={() => setSelectedLog(log)}
                          title="View details"
                        >
                          <FiEye />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredLogs.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#666' }}>
                Showing <span style={{ fontWeight: 600 }}>{startIndex + 1}</span> to{' '}
                <span style={{ fontWeight: 600 }}>{Math.min(endIndex, filteredLogs.length)}</span> of{' '}
                <span style={{ fontWeight: 600 }}>{filteredLogs.length}</span> results
                {filters.statusFilter !== 'all' && (
                  <span style={{ marginLeft: '8px', color: '#6b7280' }}>
                    (filtered from {auditLogs.length} total)
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label htmlFor="page-size-select" style={{ fontSize: '10px' }}>Show:</label>
                  <select
                    id="page-size-select"
                    className="gps-select"
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                    style={{ width: '80px' }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="gps-btn gps-btn--secondary"
                    onClick={() => handlePageChange(clampedPage - 1)}
                    disabled={clampedPage === 1}
                    style={{ padding: '4px 8px' }}
                  >
                    <FiChevronLeft />
                  </button>
                  <span style={{ padding: '4px 12px', fontSize: '10px' }}>
                    Page {clampedPage} of {totalPages}
                  </span>
                  <button
                    className="gps-btn gps-btn--secondary"
                    onClick={() => handlePageChange(clampedPage + 1)}
                    disabled={clampedPage >= totalPages}
                    style={{ padding: '4px 8px' }}
                  >
                    <FiChevronRight />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {selectedLog && (
        <div className="gps-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="gps-modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 className="gps-modal-title">Audit Log Details</h2>
                {getStatusBadge(selectedLog.status)}
              </div>
              <button className="gps-modal-close" onClick={() => setSelectedLog(null)}>
                <FiX />
              </button>
            </div>
            <div className="gps-modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Event ID</label>
                  <code style={{ fontSize: '11px', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                    {selectedLog.audit_id}
                  </code>
                </div>
                <div>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Timestamp</label>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 500 }}>{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>User</label>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 500 }}>{selectedLog.user_email || selectedLog.user_id || 'System'}</p>
                  {selectedLog.user_role && (
                    <p style={{ margin: 0, fontSize: '9px', color: '#6b7280' }}>Role: {selectedLog.user_role}</p>
                  )}
                </div>
                <div>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Action</label>
                  <span className={`gps-badge ${getActionBadgeClass(selectedLog.action_type)}`}>
                    {selectedLog.action_type}
                  </span>
                </div>
                <div>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Entity Type</label>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 500 }}>{formatEntityType(selectedLog.entity_type)}</p>
                </div>
                <div>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Entity ID</label>
                  <code style={{ fontSize: '10px', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {selectedLog.entity_id || 'N/A'}
                  </code>
                </div>
              </div>

              {selectedLog.entity_name && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#0369a1', marginBottom: '4px', display: 'block' }}>Entity Name</label>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 500, color: '#0c4a6e' }}>{selectedLog.entity_name}</p>
                </div>
              )}

              {selectedLog.operation && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#7c3aed', marginBottom: '4px', display: 'block' }}>Operation</label>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 500, color: '#581c87' }}>{selectedLog.operation}</p>
                </div>
              )}

              {selectedLog.error_message && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <label className="gps-label" style={{ fontSize: '10px', color: '#dc2626', marginBottom: '4px', display: 'block' }}>Error Message</label>
                  <p style={{ margin: 0, fontSize: '11px', color: '#991b1b' }}>{selectedLog.error_message}</p>
                </div>
              )}

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiGlobe size={12} />
                  Request Metadata
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="gps-label" style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px', display: 'block' }}>IP Address</label>
                    <code style={{ fontSize: '10px', backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                      {selectedLog.ip_address || 'N/A'}
                    </code>
                  </div>
                  <div>
                    <label className="gps-label" style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px', display: 'block' }}>API Endpoint</label>
                    <code style={{ fontSize: '10px', backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                      {selectedLog.api_endpoint || 'N/A'}
                    </code>
                  </div>
                  <div>
                    <label className="gps-label" style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px', display: 'block' }}>HTTP Method</label>
                    <code style={{ fontSize: '10px', backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                      {selectedLog.http_method || 'N/A'}
                    </code>
                  </div>
                </div>
              </div>

              {selectedLog.changes && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>Changes (Before/After)</h4>
                  <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', maxHeight: '250px', overflow: 'auto', border: '1px solid #e5e7eb' }}>
                    {renderDiff(selectedLog.changes)}
                  </div>
                </div>
              )}

              {selectedLog.metadata && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginTop: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>Additional Metadata</h4>
                  <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', maxHeight: '150px', overflow: 'auto', border: '1px solid #e5e7eb' }}>
                    <pre style={{ margin: 0, fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {typeof selectedLog.metadata === 'string' ? selectedLog.metadata : JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            <div className="gps-modal-footer">
              <button className="gps-btn gps-btn--secondary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="gps-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Notification</h2>
              <button className="gps-modal-close" onClick={() => setShowConfirmModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="gps-modal-body">
              <p>{confirmMessage}</p>
            </div>
            <div className="gps-modal-footer">
              <button className="gps-btn gps-btn--primary" onClick={() => setShowConfirmModal(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default AuditTrail;
