import React, { useState, useEffect } from 'react';
import { FiChevronDown, FiChevronRight, FiDownload, FiShield, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatBytes, formatDate } from '../utils/formatters';
import axios from 'axios';
import { getAuditLedgerEntries, verifyAuditLedger, exportAuditLedgerByJob, getAuditLedgerStats } from '../api/auditLedgerService';
import '../styles/global-page-styles.css';
import './Monitor.css';

function Monitor() {
  const [activeTab, setActiveTab] = useState('file-audit');
  const [audits, setAudits] = useState([]);
  const [bulkJobs, setBulkJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [auditLogs, setAuditLogs] = useState({});
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerStats, setLedgerStats] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({
    logLevel: '',
    actionType: '',
    jobId: ''
  });
  
  const [auditFilters, setAuditFilters] = useState({
    status: '',
    mappingName: '',
    jobId: ''
  });
  
  const [bulkFilters, setBulkFilters] = useState({
    status: '',
    jobName: ''
  });
  
  useEffect(() => {
    if (activeTab === 'file-audit') {
      fetchAuditData();
    } else if (activeTab === 'bulk-profiling') {
      fetchBulkJobs();
    } else if (activeTab === 'audit-ledger') {
      fetchLedgerData();
    }
  }, [currentPage, pageSize, activeTab]);
  
  const fetchAuditData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const offset = (currentPage - 1) * pageSize;
      
      const params = {
        limit: pageSize,
        offset: offset
      };
      
      if (auditFilters.status) params.status = auditFilters.status;
      if (auditFilters.mappingName) params.mappingName = auditFilters.mappingName;
      if (auditFilters.jobId) params.correlationId = auditFilters.jobId;
      
      const response = await axios.get('/api/file-audit', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      
      setAudits(response.data.audits || []);
      setTotalRecords(response.data.total || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching audit data:', err);
      setError('Failed to load audit trail. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAuditFilterChange = (key, value) => {
    setAuditFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const applyAuditFilters = () => {
    setCurrentPage(1);
    fetchAuditData();
  };
  
  const clearAuditFilters = () => {
    setAuditFilters({ status: '', mappingName: '', jobId: '' });
    setCurrentPage(1);
    setTimeout(() => fetchAuditData(), 0);
  };
  
  const hasActiveAuditFilters = auditFilters.status || auditFilters.mappingName || auditFilters.jobId;
  
  const handleBulkFilterChange = (key, value) => {
    setBulkFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const applyBulkFilters = () => {
    setCurrentPage(1);
    fetchBulkJobs();
  };
  
  const clearBulkFilters = () => {
    setBulkFilters({ status: '', jobName: '' });
    setCurrentPage(1);
    setTimeout(() => fetchBulkJobs(), 0);
  };
  
  const hasActiveBulkFilters = bulkFilters.status || bulkFilters.jobName;
  
  const fetchBulkJobs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const offset = (currentPage - 1) * pageSize;
      
      const params = {
        limit: pageSize,
        offset: offset
      };
      
      if (bulkFilters.status) params.status = bulkFilters.status;
      if (bulkFilters.jobName) params.jobName = bulkFilters.jobName;
      
      const response = await axios.get('/api/bulk-profiling/jobs', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      
      setBulkJobs(response.data.jobs || []);
      setTotalRecords(response.data.total || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching bulk profiling jobs:', err);
      setError('Failed to load bulk profiling jobs. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchLedgerData = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      
      const filters = {
        limit: pageSize,
        offset: offset
      };
      
      if (ledgerFilters.logLevel) filters.logLevel = ledgerFilters.logLevel;
      if (ledgerFilters.actionType) filters.actionType = ledgerFilters.actionType;
      if (ledgerFilters.jobId) filters.jobId = ledgerFilters.jobId;
      
      const [entriesResult, statsResult] = await Promise.all([
        getAuditLedgerEntries(filters),
        getAuditLedgerStats()
      ]);
      
      setLedgerEntries(entriesResult.entries || []);
      setTotalRecords(entriesResult.total || 0);
      setLedgerStats(statsResult.stats || null);
      setError(null);
    } catch (err) {
      console.error('Error fetching audit ledger:', err);
      setError('Failed to load immutable audit ledger. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerifyLedger = async () => {
    try {
      setVerifying(true);
      const result = await verifyAuditLedger();
      setVerificationResult(result);
    } catch (err) {
      console.error('Error verifying ledger:', err);
      setVerificationResult({ success: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  };
  
  const handleExportLedger = async (jobId, format) => {
    try {
      const blob = await exportAuditLedgerByJob(jobId, format, true);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_ledger_${jobId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting ledger:', err);
    }
  };
  
  const handleLedgerFilterChange = (key, value) => {
    setLedgerFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };
  
  const applyLedgerFilters = () => {
    fetchLedgerData();
  };
  
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setExpandedRows(new Set());
  };
  
  const toggleRowExpansion = async (auditId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(auditId)) {
      newExpanded.delete(auditId);
    } else {
      newExpanded.add(auditId);
      
      if (!auditLogs[auditId]) {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get(`/api/file-audit/${auditId}/logs`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setAuditLogs(prev => ({
            ...prev,
            [auditId]: response.data.logs || []
          }));
        } catch (err) {
          console.error('Error fetching audit logs:', err);
          setAuditLogs(prev => ({
            ...prev,
            [auditId]: []
          }));
        }
      }
    }
    setExpandedRows(newExpanded);
  };
  
  const totalPages = Math.ceil(totalRecords / pageSize);
  
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setExpandedRows(new Set());
    }
  };
  
  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value));
    setCurrentPage(1);
    setExpandedRows(new Set());
  };
  
  const formatDuration = (ms) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };
  
  const getStatusBadgeClass = (status, skippedFiles = 0) => {
    if (!status) return 'gps-badge gps-badge--pending';
    const statusLower = status.toLowerCase();
    if (statusLower === 'success' || statusLower === 'completed') {
      return skippedFiles > 0 ? 'gps-badge gps-badge--warning' : 'gps-badge gps-badge--success';
    }
    if (statusLower === 'failed' || statusLower === 'error') return 'gps-badge gps-badge--danger';
    if (statusLower === 'processing' || statusLower === 'in_progress') return 'gps-badge gps-badge--info';
    return 'gps-badge gps-badge--pending';
  };
  
  const renderSchemaDetails = (audit) => {
    if (!audit.file_schema) return <div className="gps-empty-state" style={{ padding: '16px' }}>No schema information available</div>;
    
    try {
      const schema = typeof audit.file_schema === 'string' 
        ? JSON.parse(audit.file_schema) 
        : audit.file_schema;
      
      return (
        <div>
          <div className="gps-detail-grid" style={{ marginBottom: '16px' }}>
            <div className="gps-detail-item">
              <span className="gps-detail-label">Schema Hash:</span>
              <span className="gps-detail-value" style={{ wordBreak: 'break-all' }}>{audit.schema_hash || 'N/A'}</span>
            </div>
            {audit.schema_diff && (
              <div className="gps-detail-item">
                <span className="gps-detail-label">Schema Changed:</span>
                <span className="gps-detail-value">{audit.schema_changed ? 'Yes' : 'No'}</span>
              </div>
            )}
          </div>
          
          {schema.columns && schema.columns.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <h4 className="gps-expanded-section-title" style={{ fontSize: '11px', marginBottom: '12px' }}>Column Schema ({schema.columns.length} columns)</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table className="gps-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Column Name</th>
                      <th>Type</th>
                      <th>Nullable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schema.columns.map((col, idx) => (
                      <tr key={idx}>
                        <td>{col.name}</td>
                        <td>{col.type}</td>
                        <td>{col.nullable !== false ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {audit.schema_diff && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <h4 className="gps-expanded-section-title" style={{ fontSize: '11px' }}>Schema Changes</h4>
              <pre style={{ background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', fontSize: '10px', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'Inter, monospace' }}>{JSON.stringify(JSON.parse(audit.schema_diff), null, 2)}</pre>
            </div>
          )}
        </div>
      );
    } catch (e) {
      return <div className="gps-alert-danger" style={{ padding: '12px', margin: 0 }}>Error parsing schema: {e.message}</div>;
    }
  };
  
  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Data Observatory Monitor</h1>
          <p className="gps-page-subtitle">Monitor file audit logs and bulk profiling jobs</p>
        </div>
        <div className="gps-results-info">
          {totalRecords} total records
        </div>
      </div>
      
      <div className="gps-tabs">
        <button
          onClick={() => handleTabChange('file-audit')}
          className={`gps-tab ${activeTab === 'file-audit' ? 'gps-tab--active' : ''}`}
        >
          File Audit Logs
        </button>
        <button
          onClick={() => handleTabChange('bulk-profiling')}
          className={`gps-tab ${activeTab === 'bulk-profiling' ? 'gps-tab--active' : ''}`}
        >
          Bulk Profiling Jobs
        </button>
        <button
          onClick={() => handleTabChange('audit-ledger')}
          className={`gps-tab ${activeTab === 'audit-ledger' ? 'gps-tab--active' : ''}`}
        >
          <FiShield style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Immutable Audit Ledger
        </button>
      </div>
      
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="gps-alert-danger">{error}</div>
      ) : (
        <>
          {activeTab === 'file-audit' && (
          <div className="gps-table-container">
            <div className="monitor-filter-bar">
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Filter by Job ID..."
                  value={auditFilters.jobId}
                  onChange={(e) => handleAuditFilterChange('jobId', e.target.value)}
                  className="monitor-filter-input"
                />
                <input
                  type="text"
                  placeholder="Filter by Mapping Name..."
                  value={auditFilters.mappingName}
                  onChange={(e) => handleAuditFilterChange('mappingName', e.target.value)}
                  className="monitor-filter-input"
                />
                <div className="filter-divider" />
                <select
                  value={auditFilters.status}
                  onChange={(e) => handleAuditFilterChange('status', e.target.value)}
                  className="monitor-filter-select"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="running">Running</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="filter-actions">
                <button onClick={applyAuditFilters} className="monitor-btn-apply">
                  Apply Filters
                </button>
                {hasActiveAuditFilters && (
                  <button onClick={clearAuditFilters} className="monitor-btn-clear">
                    Clear
                  </button>
                )}
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="gps-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Job ID</th>
                    <th>Date</th>
                    <th>Mapping Name</th>
                    <th>Project</th>
                    <th>File Name</th>
                    <th>File Type</th>
                    <th>File Size</th>
                    <th>Encoding</th>
                    <th>Columns</th>
                    <th>Records</th>
                    <th>Source</th>
                    <th>Load Type</th>
                    <th>Workflow</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>User ID</th>
                    <th>Load Step 1 Path</th>
                    <th>Load Step 1 Records</th>
                    <th>Schema Validation</th>
                    <th>Error Message</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.length === 0 ? (
                    <tr>
                      <td colSpan="22">
                        <div className="gps-empty-state">
                          <p>No audit records found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    audits.map((audit) => (
                      <React.Fragment key={audit.id}>
                        <tr>
                          <td>
                            <button 
                              className="gps-icon-btn"
                              onClick={() => toggleRowExpansion(audit.id)}
                              title="View schema details"
                            >
                              {expandedRows.has(audit.id) ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                          </td>
                          <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={audit.correlation_id}>
                            {audit.correlation_id ? audit.correlation_id.substring(0, 8) + '...' : '-'}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDate(audit.created_dt)}</td>
                          <td>{audit.mapping_name || '-'}</td>
                          <td>{audit.project_name || 'Default Project'}</td>
                          <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={audit.file_name}>{audit.file_name || '-'}</td>
                          <td>{audit.file_type ? audit.file_type.toUpperCase() : '-'}</td>
                          <td>{audit.file_size_bytes ? formatBytes(audit.file_size_bytes) : '-'}</td>
                          <td>{audit.encoding || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{audit.number_of_columns || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{(audit.no_of_records_in_source || 0).toLocaleString()}</td>
                          <td>{audit.source || '-'}</td>
                          <td>{audit.load_type || '-'}</td>
                          <td>{audit.workflow_name || '-'}</td>
                          <td>{audit.schedule_name || '-'}</td>
                          <td>
                            <span className={getStatusBadgeClass(audit.status)}>
                              {audit.status || 'unknown'}
                            </span>
                          </td>
                          <td>{formatDuration(audit.processing_duration_ms)}</td>
                          <td style={{ textAlign: 'right' }}>{audit.user_id || '-'}</td>
                          <td title={audit.load_step_1_path}>{audit.load_step_1_path || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{(audit.load_step_1_rec_cnt || 0).toLocaleString()}</td>
                          <td>
                            {audit.schema_validation ? (
                              <span className={`gps-badge ${
                                audit.schema_validation === 'Pass' ? 'gps-badge--success' : 
                                audit.schema_validation === 'Fail' ? 'gps-badge--danger' : 
                                'gps-badge--pending'
                              }`}>
                                {audit.schema_validation}
                              </span>
                            ) : (
                              <span className="gps-badge gps-badge--pending">N/A</span>
                            )}
                          </td>
                          <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={audit.error_message}>
                            {audit.error_message ? audit.error_message.substring(0, 30) + '...' : '-'}
                          </td>
                        </tr>
                        {expandedRows.has(audit.id) && (
                          <tr className="gps-subrow">
                            <td colSpan="22">
                              <div className="gps-expanded-content" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                <div className="gps-expanded-section">
                                  <h3 className="gps-expanded-section-title">Additional Details</h3>
                                  <div className="gps-detail-grid">
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Audit Id:</span>
                                      <span className="gps-detail-value">{audit.id}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">File Id:</span>
                                      <span className="gps-detail-value">{audit.file_id || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">File Hash:</span>
                                      <span className="gps-detail-value">{audit.file_hash || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">File Pattern:</span>
                                      <span className="gps-detail-value">{audit.file_pattern || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Source Path:</span>
                                      <span className="gps-detail-value">{audit.source_path || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">File Delimiter:</span>
                                      <span className="gps-detail-value">{audit.file_delimiter || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">User Email:</span>
                                      <span className="gps-detail-value">{audit.user_email || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Ip Address:</span>
                                      <span className="gps-detail-value">{audit.ip_address || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Session Id:</span>
                                      <span className="gps-detail-value">{audit.session_id || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Parent Audit Id:</span>
                                      <span className="gps-detail-value">{audit.parent_audit_id || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Error Type:</span>
                                      <span className="gps-detail-value">{audit.error_type || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Created By:</span>
                                      <span className="gps-detail-value">{audit.created_by || '-'}</span>
                                    </div>
                                  </div>
                                  
                                  {audit.load_step_1_path && (
                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                                      <h4 className="gps-expanded-section-title" style={{ fontSize: '11px' }}>Load Steps Details</h4>
                                      <div className="gps-detail-grid">
                                        {audit.load_step_1_path && (
                                          <div className="gps-detail-item">
                                            <span className="gps-detail-label">Step 1 Path:</span>
                                            <span className="gps-detail-value">{audit.load_step_1_path} ({audit.load_step_1_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_3_path && (
                                          <div className="gps-detail-item">
                                            <span className="gps-detail-label">Step 3 Path:</span>
                                            <span className="gps-detail-value">{audit.load_step_3_path} ({audit.load_step_3_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_4_path && (
                                          <div className="gps-detail-item">
                                            <span className="gps-detail-label">Step 4 Path:</span>
                                            <span className="gps-detail-value">{audit.load_step_4_path} ({audit.load_step_4_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_5_path && (
                                          <div className="gps-detail-item">
                                            <span className="gps-detail-label">Step 5 Path:</span>
                                            <span className="gps-detail-value">{audit.load_step_5_path} ({audit.load_step_5_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {audit.error_message && (
                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                                      <h4 className="gps-expanded-section-title" style={{ fontSize: '11px' }}>Error Details</h4>
                                      <pre style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', fontSize: '10px', color: '#991b1b', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'Inter, monospace' }}>{audit.error_message}</pre>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="gps-expanded-section">
                                  <h3 className="gps-expanded-section-title">Schema Information</h3>
                                  {renderSchemaDetails(audit)}
                                </div>
                                
                                <div className="gps-expanded-section logs-section">
                                  <h3 className="gps-expanded-section-title">Execution Logs</h3>
                                  <div className="logs-container">
                                    {auditLogs[audit.id] && auditLogs[audit.id].length > 0 ? (
                                      <pre className="logs-display">
                                        {auditLogs[audit.id].map((log, idx) => (
                                          <div key={idx} className={`log-entry log-${log.level?.toLowerCase() || 'info'}`}>
                                            <span className="log-timestamp">{log.timestamp}</span>
                                            <span className="log-level">[{log.level || 'INFO'}]</span>
                                            <span className="log-message">{log.message}</span>
                                          </div>
                                        ))}
                                      </pre>
                                    ) : (
                                      <div className="no-logs">No execution logs available</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
          
          {activeTab === 'bulk-profiling' && (
          <div className="gps-table-container">
            <div className="monitor-filter-bar">
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Filter by Job Name..."
                  value={bulkFilters.jobName}
                  onChange={(e) => handleBulkFilterChange('jobName', e.target.value)}
                  className="monitor-filter-input"
                />
                <div className="filter-divider" />
                <select
                  value={bulkFilters.status}
                  onChange={(e) => handleBulkFilterChange('status', e.target.value)}
                  className="monitor-filter-select"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="running">Running</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="filter-actions">
                <button onClick={applyBulkFilters} className="monitor-btn-apply">
                  Apply Filters
                </button>
                {hasActiveBulkFilters && (
                  <button onClick={clearBulkFilters} className="monitor-btn-clear">
                    Clear
                  </button>
                )}
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="gps-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Job Name</th>
                    <th>Project</th>
                    <th>Connection</th>
                    <th>S3 Path</th>
                    <th>Status</th>
                    <th>Frequency</th>
                    <th>Progress</th>
                    <th>Total Files</th>
                    <th>Successful</th>
                    <th>Failed</th>
                    <th>Skipped</th>
                    <th>Created</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkJobs.length === 0 ? (
                    <tr>
                      <td colSpan="15">
                        <div className="gps-empty-state">
                          <p>No bulk profiling jobs found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    bulkJobs.map((job) => (
                      <React.Fragment key={job.id}>
                        <tr>
                          <td>
                            <button 
                              className="gps-icon-btn"
                              onClick={() => toggleRowExpansion(job.id)}
                              title="View job details"
                            >
                              {expandedRows.has(job.id) ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                          </td>
                          <td>{job.job_name}</td>
                          <td>{job.project_name || 'N/A'}</td>
                          <td>{job.connection_name || 'N/A'}</td>
                          <td title={job.s3_path}>{job.s3_path}</td>
                          <td>
                            <span className={getStatusBadgeClass(job.status, job.skipped_files || 0)}>
                              {job.status}
                            </span>
                          </td>
                          <td>{job.frequency || 'Ad-hoc'}</td>
                          <td>
                            {job.total_files > 0 ? 
                              `${Math.round((job.processed_files / job.total_files) * 100)}%` : 
                              '0%'}
                          </td>
                          <td style={{ textAlign: 'right' }}>{job.total_files}</td>
                          <td style={{ textAlign: 'right' }}>{job.successful_files}</td>
                          <td style={{ textAlign: 'right' }}>{job.failed_files}</td>
                          <td style={{ textAlign: 'right' }}>{job.skipped_files || 0}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDate(job.created_at)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{job.started_at ? formatDate(job.started_at) : '-'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{job.completed_at ? formatDate(job.completed_at) : '-'}</td>
                        </tr>
                        {expandedRows.has(job.id) && (
                          <tr className="gps-subrow">
                            <td colSpan="15">
                              <div className="expanded-content">
                                <div className="expanded-section">
                                  <h3>Job Configuration</h3>
                                  <div className="detail-grid">
                                    <div className="detail-item">
                                      <span className="detail-label">Job ID:</span>
                                      <span className="detail-value">{job.id}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">File Pattern:</span>
                                      <span className="detail-value">{job.file_pattern || '*'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Recursive:</span>
                                      <span className="detail-value">{job.recursive ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Duplicate Handling:</span>
                                      <span className="detail-value">{job.duplicate_handling}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Processed Files:</span>
                                      <span className="detail-value">{job.processed_files} / {job.total_files}</span>
                                    </div>
                                  </div>
                                  
                                  {job.error_message && (
                                    <div className="error-details">
                                      <h4>Error Details</h4>
                                      <pre>{job.error_message}</pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
          
          {activeTab === 'audit-ledger' && (
          <div className="gps-table-container">
            <div className="monitor-filter-bar">
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Filter by Job ID..."
                  value={ledgerFilters.jobId}
                  onChange={(e) => handleLedgerFilterChange('jobId', e.target.value)}
                  className="monitor-filter-input"
                />
                <div className="filter-divider" />
                <select
                  value={ledgerFilters.logLevel}
                  onChange={(e) => handleLedgerFilterChange('logLevel', e.target.value)}
                  className="monitor-filter-select"
                >
                  <option value="">All Levels</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>
              <div className="filter-actions">
                <button onClick={applyLedgerFilters} className="monitor-btn-apply">
                  Apply Filters
                </button>
                {(ledgerFilters.jobId || ledgerFilters.logLevel) && (
                  <button onClick={() => { setLedgerFilters({ logLevel: '', actionType: '', jobId: '' }); setCurrentPage(1); fetchLedgerData(); }} className="monitor-btn-clear">
                    Clear
                  </button>
                )}
                <div className="filter-divider" />
                <button 
                  onClick={handleVerifyLedger} 
                  disabled={verifying}
                  className="monitor-btn-verify"
                  title="Verify the integrity of the audit chain"
                >
                  <FiShield />
                  {verifying ? 'Verifying...' : 'Verify Chain'}
                </button>
                
                {verificationResult && (
                  <span className={`verification-badge ${verificationResult.verified ? 'success' : 'danger'}`}>
                    {verificationResult.verified ? (
                      <><FiCheck /> Verified ({verificationResult.entriesVerified})</>
                    ) : (
                      <><FiAlertTriangle /> Chain Broken</>
                    )}
                  </span>
                )}
              </div>
            </div>
            
            {ledgerStats && (
              <div className="monitor-stats-bar">
                <div><strong>Total Entries:</strong> <span>{parseInt(ledgerStats.total_entries || 0).toLocaleString()}</span></div>
                <div><strong>Unique Jobs:</strong> <span>{parseInt(ledgerStats.unique_jobs || 0).toLocaleString()}</span></div>
                <div><strong>Unique Actors:</strong> <span>{parseInt(ledgerStats.unique_actors || 0).toLocaleString()}</span></div>
                <div><strong>Current Sequence:</strong> <span>{ledgerStats.sequence?.current_sequence || 0}</span></div>
              </div>
            )}
            
            <div style={{ overflowX: 'auto' }}>
              <table className="gps-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Sequence</th>
                    <th>Timestamp</th>
                    <th>Job ID</th>
                    <th>Level</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Message</th>
                    <th>Actor</th>
                    <th>Record Hash</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan="11">
                        <div className="gps-empty-state">
                          <FiShield style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }} />
                          <p>No immutable audit ledger entries found</p>
                          <p style={{ fontSize: '12px', opacity: 0.7 }}>Entries are automatically created when jobs execute</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((entry) => (
                      <React.Fragment key={entry.id}>
                        <tr>
                          <td>
                            <button 
                              className="gps-icon-btn"
                              onClick={() => toggleRowExpansion(entry.id)}
                              title="View entry details"
                            >
                              {expandedRows.has(entry.id) ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{entry.sequence_number}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.event_timestamp)}</td>
                          <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.job_id}>
                            {entry.job_id ? entry.job_id.substring(0, 12) + '...' : '-'}
                          </td>
                          <td>
                            <span className={`gps-badge ${
                              entry.log_level === 'ERROR' ? 'gps-badge--danger' :
                              entry.log_level === 'WARN' ? 'gps-badge--warning' :
                              'gps-badge--info'
                            }`}>
                              {entry.log_level}
                            </span>
                          </td>
                          <td>{entry.action_type}</td>
                          <td>{entry.entity_type || '-'}</td>
                          <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.message}>
                            {entry.message}
                          </td>
                          <td>{entry.actor_email || entry.actor_id || '-'}</td>
                          <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace', fontSize: '10px' }} title={entry.record_hash}>
                            {entry.record_hash ? entry.record_hash.substring(0, 8) + '...' : '-'}
                          </td>
                          <td>
                            {entry.job_id && (
                              <button
                                className="gps-icon-btn"
                                onClick={() => handleExportLedger(entry.job_id, 'json')}
                                title="Export job audit trail"
                              >
                                <FiDownload />
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedRows.has(entry.id) && (
                          <tr className="gps-subrow">
                            <td colSpan="11">
                              <div className="gps-expanded-content" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div className="gps-expanded-section">
                                  <h3 className="gps-expanded-section-title">Entry Details</h3>
                                  <div className="gps-detail-grid">
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Entry ID:</span>
                                      <span className="gps-detail-value" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{entry.entry_id}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Sequence Number:</span>
                                      <span className="gps-detail-value">{entry.sequence_number}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Correlation ID:</span>
                                      <span className="gps-detail-value">{entry.correlation_id || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Entity Name:</span>
                                      <span className="gps-detail-value">{entry.entity_name || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Actor IP:</span>
                                      <span className="gps-detail-value">{entry.actor_ip || '-'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Actor Role:</span>
                                      <span className="gps-detail-value">{entry.actor_role || '-'}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="gps-expanded-section">
                                  <h3 className="gps-expanded-section-title">Cryptographic Verification</h3>
                                  <div className="gps-detail-grid">
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Previous Hash:</span>
                                      <span className="gps-detail-value" style={{ fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all' }}>{entry.prev_hash || 'GENESIS (First Entry)'}</span>
                                    </div>
                                    <div className="gps-detail-item">
                                      <span className="gps-detail-label">Record Hash:</span>
                                      <span className="gps-detail-value" style={{ fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all' }}>{entry.record_hash}</span>
                                    </div>
                                  </div>
                                  
                                  {entry.payload && (
                                    <div style={{ marginTop: '12px' }}>
                                      <h4 className="gps-expanded-section-title" style={{ fontSize: '11px' }}>Payload Data</h4>
                                      <pre style={{ 
                                        background: '#f8f9fa', 
                                        border: '1px solid #e2e8f0', 
                                        borderRadius: '6px', 
                                        padding: '12px', 
                                        fontSize: '10px', 
                                        overflow: 'auto', 
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: '200px',
                                        fontFamily: 'monospace'
                                      }}>
                                        {JSON.stringify(entry.payload, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
          
          <div className="monitor-pagination">
            <div className="monitor-pagination-info">
              Showing <strong>{(activeTab === 'file-audit' ? audits.length : activeTab === 'bulk-profiling' ? bulkJobs.length : ledgerEntries.length) > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}</strong> to <strong>{Math.min(currentPage * pageSize, totalRecords)}</strong> of <strong>{totalRecords.toLocaleString()}</strong> records
            </div>
            
            <div className="monitor-pagination-controls">
              <div className="monitor-page-size">
                <label>Rows per page:</label>
                <select value={pageSize} onChange={handlePageSizeChange}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              
              <div className="monitor-page-buttons">
                <button 
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="monitor-page-btn"
                >
                  First
                </button>
                <button 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="monitor-page-btn"
                >
                  Previous
                </button>
                
                <span className="monitor-page-indicator">
                  Page {currentPage} of {totalPages || 1}
                </span>
                
                <button 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="monitor-page-btn"
                >
                  Next
                </button>
                <button 
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="monitor-page-btn"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Monitor;
