import React, { useState, useEffect } from 'react';
import { FiSearch, FiFilter, FiDownload, FiEye, FiClock, FiUser, FiDatabase, FiArchive, FiTrash2, FiSettings, FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
import axios from 'axios';
import PageLayout from '../components/PageLayout';
import '../styles/global-page-styles.css';

const AuditTrail = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [statistics, setStatistics] = useState(null);
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
    limit: 50
  });

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
    fetchAuditLogs();
    fetchStatistics();
    fetchRetentionSettings();
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.actionType) params.append('actionType', filters.actionType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('limit', filters.limit);

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
    setFilters({
      userId: '',
      entityType: '',
      actionType: '',
      startDate: '',
      endDate: '',
      limit: 50
    });
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(auditLogs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLogs = auditLogs.slice(startIndex, endIndex);

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
      default: return 'gps-badge--info';
    }
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
                          <td style={{ fontWeight: 600 }}>{data?.count ? data.count.toLocaleString() : '0'}</td>
                          <td>{data?.oldest_record ? new Date(data.oldest_record).toLocaleDateString() : 'N/A'}</td>
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

      <div className="gps-section" style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '24px' }}>
        <div className="gps-section-header" style={{ marginBottom: '16px' }}>
          <h2 className="gps-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiFilter style={{ color: '#666' }} />
            Filters
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div className="gps-form-group">
            <label htmlFor="filter-user-id" className="gps-label">User Id</label>
            <input
              id="filter-user-id"
              type="text"
              placeholder="Enter user ID"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              className="gps-input"
            />
          </div>

          <div className="gps-form-group">
            <label htmlFor="filter-action-type" className="gps-label">Action Type</label>
            <select
              id="filter-action-type"
              value={filters.actionType}
              onChange={(e) => handleFilterChange('actionType', e.target.value)}
              className="gps-select"
            >
              <option value="">All Actions</option>
              {actionTypes.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div className="gps-form-group">
            <label htmlFor="filter-entity-type" className="gps-label">Entity Type</label>
            <select
              id="filter-entity-type"
              value={filters.entityType}
              onChange={(e) => handleFilterChange('entityType', e.target.value)}
              className="gps-select"
            >
              <option value="">All Entities</option>
              {entityTypes.map(entity => (
                <option key={entity} value={entity}>{formatEntityType(entity)}</option>
              ))}
            </select>
          </div>

          <div className="gps-form-group">
            <label htmlFor="filter-start-date" className="gps-label">Start Date</label>
            <input
              id="filter-start-date"
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="gps-input"
            />
          </div>

          <div className="gps-form-group">
            <label htmlFor="filter-end-date" className="gps-label">End Date</label>
            <input
              id="filter-end-date"
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="gps-input"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleSearch} className="gps-btn gps-btn--primary">
            <FiSearch />
            Search
          </button>
          <button onClick={handleClearFilters} className="gps-btn gps-btn--secondary">
            Clear Filters
          </button>
          <button onClick={handleExport} className="gps-btn gps-btn--secondary" style={{ marginLeft: 'auto', borderColor: '#16a34a', color: '#16a34a' }}>
            <FiDownload />
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
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Entity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="gps-table-empty">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr key={log.audit_id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiClock style={{ color: '#9aa0a6', flexShrink: 0, width: '12px', height: '12px' }} />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiUser style={{ color: '#9aa0a6', flexShrink: 0, width: '12px', height: '12px' }} />
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {log.user_email || log.user_id || 'System'}
                            </div>
                            {log.user_role && (
                              <div style={{ fontSize: '9px', color: '#5f6368' }}>{log.user_role}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className={`gps-badge ${getActionBadgeClass(log.action_type)}`}>
                            {formatEntityType(log.entity_type)}
                          </span>
                          {log.entity_id && (
                            <span style={{ fontSize: '8px', color: '#5f6368', fontFamily: 'monospace' }}>
                              {log.entity_id}
                            </span>
                          )}
                        </div>
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

          {auditLogs.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#666' }}>
                Showing <span style={{ fontWeight: 600 }}>{startIndex + 1}</span> to{' '}
                <span style={{ fontWeight: 600 }}>{Math.min(endIndex, auditLogs.length)}</span> of{' '}
                <span style={{ fontWeight: 600 }}>{auditLogs.length}</span> results
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
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    style={{ padding: '4px 8px' }}
                  >
                    <FiChevronLeft />
                  </button>
                  <span style={{ padding: '4px 12px', fontSize: '10px' }}>
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    className="gps-btn gps-btn--secondary"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
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
          <div className="gps-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Audit Log Details</h2>
              <button className="gps-modal-close" onClick={() => setSelectedLog(null)}>
                <FiX />
              </button>
            </div>
            <div className="gps-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="selected-timestamp" className="gps-label">Timestamp</label>
                  <p id="selected-timestamp" style={{ margin: 0, fontSize: '10px' }}>{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <label htmlFor="selected-user" className="gps-label">User</label>
                  <p id="selected-user" style={{ margin: 0, fontSize: '10px' }}>{selectedLog.user_email || selectedLog.user_id || 'System'}</p>
                </div>
                <div>
                  <label htmlFor="selected-entity-type" className="gps-label">Entity Type</label>
                  <p id="selected-entity-type" style={{ margin: 0, fontSize: '10px' }}>{formatEntityType(selectedLog.entity_type)}</p>
                </div>
                <div>
                  <label htmlFor="selected-action-type" className="gps-label">Action Type</label>
                  <span id="selected-action-type" className={`gps-badge ${getActionBadgeClass(selectedLog.action_type)}`}>
                    {selectedLog.action_type}
                  </span>
                </div>
              </div>
              
              {selectedLog.entity_id && (
                <div style={{ marginBottom: '16px' }}>
                  <label htmlFor="selected-entity-id" className="gps-label">Entity Id</label>
                  <code id="selected-entity-id" style={{ fontSize: '10px', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
                    {selectedLog.entity_id}
                  </code>
                </div>
              )}

              {selectedLog.changes && (
                <div>
                  <label htmlFor="selected-changes" className="gps-label">Changes</label>
                  <div id="selected-changes" style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', maxHeight: '300px', overflow: 'auto' }}>
                    {renderDiff(selectedLog.changes)}
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
