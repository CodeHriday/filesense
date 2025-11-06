import React, { useState, useEffect } from 'react';
import { FiSearch, FiFilter, FiDownload, FiEye, FiClock, FiUser, FiActivity, FiDatabase, FiArchive, FiTrash2, FiSettings, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import '../styles/AuditTrail.css';

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
    const us = '000';
    return `${dateStr} ${timeStr}.${ms}${us}`;
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'SUCCESS': return 'badge-success';
      case 'FAILURE': return 'badge-error';
      case 'PARTIAL': return 'badge-warning';
      default: return 'badge-info';
    }
  };

  const getActionBadgeClass = (action) => {
    switch (action) {
      case 'CREATE': return 'action-tag-create';
      case 'UPDATE': return 'action-tag-update';
      case 'DELETE': return 'action-tag-delete';
      case 'READ':
      case 'VIEW': return 'action-tag-read';
      default: return 'action-tag';
    }
  };

  const renderDiff = (changes) => {
    if (!changes) return null;
    
    const changesObj = typeof changes === 'string' ? JSON.parse(changes) : changes;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(changesObj).map(([key, value]) => (
          <div key={key} style={{ fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: '#5f6368' }}>{key}:</span>
            <div style={{ marginLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {value.from !== undefined && (
                <div style={{ color: '#d93025' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>- </span>
                  {JSON.stringify(value.from)}
                </div>
              )}
              {value.to !== undefined && (
                <div style={{ color: '#34a853' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>+ </span>
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
    <div className="audit-trail-container">
      <div className="audit-trail-header">
        <h1>Audit Trail</h1>
        <div className="header-actions">
          <button
            onClick={() => setShowRetentionPanel(!showRetentionPanel)}
            className="btn-purple"
          >
            <FiSettings />
            {showRetentionPanel ? 'Hide' : 'Show'} Retention Management
          </button>
        </div>
      </div>

      {showRetentionPanel && (
        <>
          <div className="card">
            <div className="card-header">
              <FiDatabase style={{ color: '#5e35b1' }} />
              <h2 className="card-title">Audit Statistics</h2>
            </div>

            {statistics && (
              <div style={{ overflowX: 'auto' }}>
                <table className="audit-table">
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
                              {isArchive ? <FiArchive style={{ color: '#9aa0a6' }} /> : <FiDatabase style={{ color: '#1a73e8' }} />}
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

          <div className="card retention-panel">
            <div className="card-header">
              <FiSettings style={{ color: '#5e35b1' }} />
              <h2 className="card-title">Retention Management</h2>
            </div>

            <div className="grid-2" style={{ marginBottom: '24px' }}>
              <div className="form-group">
                <label className="form-label">
                  Retention Period (days)
                </label>
                <select
                  value={retentionSettings.retention_days}
                  onChange={(e) => setRetentionSettings(prev => ({ ...prev, retention_days: parseInt(e.target.value) }))}
                  className="form-select"
                >
                  <option value={7}>7 days</option>
                  <option value={15}>15 days</option>
                  <option value={23}>23 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <p className="form-hint">
                  Records older than this will be affected by archive/delete operations
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={retentionSettings.auto_archive_enabled}
                    onChange={(e) => setRetentionSettings(prev => ({ ...prev, auto_archive_enabled: e.target.checked }))}
                  />
                  <span style={{ fontSize: '13px', color: '#5f6368' }}>Enable automatic archiving</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={retentionSettings.auto_delete_enabled}
                    onChange={(e) => setRetentionSettings(prev => ({ ...prev, auto_delete_enabled: e.target.checked }))}
                  />
                  <span style={{ fontSize: '13px', color: '#5f6368' }}>Enable automatic deletion</span>
                </label>

                <button
                  onClick={handleUpdateRetentionSettings}
                  disabled={operationLoading}
                  className="btn-purple"
                >
                  {operationLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>

            <div className="retention-divider"></div>
            
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#202124', marginBottom: '16px' }}>Manual Operations</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <button
                  onClick={handleArchiveRecords}
                  disabled={operationLoading}
                  className="btn-primary"
                >
                  <FiArchive />
                  Archive Old Records
                </button>

                <button
                  onClick={handleDeleteRecords}
                  disabled={operationLoading}
                  className="btn-danger"
                >
                  <FiTrash2 />
                  Delete Old Records
                </button>

                <button
                  onClick={() => handleDeleteArchivedRecords(90)}
                  disabled={operationLoading}
                  className="btn-warning"
                >
                  <FiTrash2 />
                  Delete Archived (90+ days)
                </button>
              </div>
              <p className="form-hint" style={{ marginTop: '12px' }}>
                All operations use the selected retention period. Archive operations move records to archive tables. Delete operations permanently remove records.
              </p>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-header" style={{ justifyContent: 'flex-start' }}>
          <FiFilter style={{ color: '#5f6368' }} />
          <h2 className="card-title">Filters</h2>
        </div>

        <div className="grid-3" style={{ marginBottom: '16px' }}>
          <div className="form-group">
            <label className="form-label">User ID</label>
            <input
              type="text"
              placeholder="Enter user ID"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Action Type</label>
            <select
              value={filters.actionType}
              onChange={(e) => handleFilterChange('actionType', e.target.value)}
              className="form-select"
            >
              <option value="">All Actions</option>
              {actionTypes.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Entity Type</label>
            <select
              value={filters.entityType}
              onChange={(e) => handleFilterChange('entityType', e.target.value)}
              className="form-select"
            >
              <option value="">All Entities</option>
              {entityTypes.map(entity => (
                <option key={entity} value={entity}>{formatEntityType(entity)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">End Date</label>
            <input
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleSearch} className="btn-primary">
            <FiSearch />
            Search
          </button>
          <button onClick={handleClearFilters} className="btn-secondary">
            Clear Filters
          </button>
          <button onClick={handleExport} className="btn-success" style={{ marginLeft: 'auto' }}>
            <FiDownload />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card audit-trail-loading">
          <div className="loading-spinner"></div>
          <p style={{ marginTop: '16px' }}>Loading audit logs...</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="audit-table">
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
                    <td colSpan="4" className="no-data-message">
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
                            <div style={{ fontWeight: 500, color: '#202124' }}>
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
                          <span className="entity-tag">
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
                          className="action-icon-btn view-btn"
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
            <div className="pagination-container">
              <div className="pagination-info">
                Showing{' '}
                <span style={{ fontWeight: 600 }}>{startIndex + 1}</span> to{' '}
                <span style={{ fontWeight: 600 }}>{Math.min(endIndex, auditLogs.length)}</span> of{' '}
                <span style={{ fontWeight: 600 }}>{auditLogs.length}</span> results
              </div>
              
              <div className="pagination-controls">
                <div className="page-size-selector">
                  <label>Show:</label>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="pagination-btn"
                >
                  <FiChevronLeft />
                  Previous
                </button>
                
                <span style={{ padding: '0 12px', color: '#5f6368', fontSize: '14px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="pagination-btn"
                >
                  Next
                  <FiChevronRight />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-container" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Notification</h3>
              <button className="close-modal-btn" onClick={() => setShowConfirmModal(false)}>
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <p style={{ fontSize: '14px', color: '#202124', margin: 0 }}>{confirmMessage}</p>
            </div>
            
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowConfirmModal(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Audit Log Details</h3>
              <button className="close-modal-btn" onClick={() => setSelectedLog(null)}>
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="details-list">
                <div className="detail-item">
                  <div className="detail-label">Timestamp</div>
                  <div className="detail-value">{formatTimestamp(selectedLog.timestamp)}</div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">User</div>
                  <div className="detail-value">
                    {selectedLog.user_email || selectedLog.user_id || 'System'}
                    {selectedLog.user_role && (
                      <span style={{ display: 'block', fontSize: '12px', color: '#5f6368', marginTop: '4px' }}>
                        Role: {selectedLog.user_role}
                      </span>
                    )}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">Entity Type</div>
                  <div className="detail-value">
                    <span className="entity-tag">{formatEntityType(selectedLog.entity_type)}</span>
                  </div>
                </div>

                {selectedLog.entity_id && (
                  <div className="detail-item">
                    <div className="detail-label">Entity ID</div>
                    <div className="detail-value" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {selectedLog.entity_id}
                    </div>
                  </div>
                )}

                {selectedLog.ip_address && (
                  <div className="detail-item">
                    <div className="detail-label">IP Address</div>
                    <div className="detail-value" style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                      {selectedLog.ip_address}
                    </div>
                  </div>
                )}

                {selectedLog.user_agent && (
                  <div className="detail-item">
                    <div className="detail-label">User Agent</div>
                    <div className="detail-value" style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                      {selectedLog.user_agent}
                    </div>
                  </div>
                )}

                {selectedLog.description && (
                  <div className="detail-item">
                    <div className="detail-label">Description</div>
                    <div className="detail-value">{selectedLog.description}</div>
                  </div>
                )}

                {selectedLog.changes && (
                  <div className="detail-item">
                    <div className="detail-label">Changes</div>
                    <div className="detail-value">
                      {renderDiff(selectedLog.changes)}
                    </div>
                  </div>
                )}

                {selectedLog.metadata && (
                  <div className="detail-item">
                    <div className="detail-label">Metadata</div>
                    <div className="detail-value">
                      <div className="metadata-container">
                        <pre className="metadata-json">{JSON.stringify(typeof selectedLog.metadata === 'string' ? JSON.parse(selectedLog.metadata) : selectedLog.metadata, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
