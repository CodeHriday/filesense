import React, { useState, useEffect } from 'react';
import { FiChevronDown, FiChevronRight, FiDownload } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatBytes, formatDate } from '../utils/formatters';
import axios from 'axios';
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
  
  useEffect(() => {
    if (activeTab === 'file-audit') {
      fetchAuditData();
    } else if (activeTab === 'bulk-profiling') {
      fetchBulkJobs();
    }
  }, [currentPage, pageSize, activeTab]);
  
  const fetchAuditData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const offset = (currentPage - 1) * pageSize;
      
      const response = await axios.get('/api/file-audit', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: pageSize,
          offset: offset
        }
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
  
  const fetchBulkJobs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const offset = (currentPage - 1) * pageSize;
      
      const response = await axios.get('/api/bulk-profiling/jobs', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: pageSize,
          offset: offset
        }
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
      </div>
      
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="gps-alert-danger">{error}</div>
      ) : (
        <>
          {activeTab === 'file-audit' && (
          <div className="gps-table-container">
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
          
          <div className="gps-pagination-container">
            <div className="gps-results-info">
              Showing {(activeTab === 'file-audit' ? audits.length : bulkJobs.length) > 0 ? ((currentPage - 1) * pageSize) + 1 : 0} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} records
            </div>
            
            <div className="gps-pagination-controls">
              <div className="gps-page-size-selector">
                <label>Rows per page:</label>
                <select value={pageSize} onChange={handlePageSizeChange} className="gps-filter-select">
                  <option key="10" value="10">10</option>
                  <option key="25" value="25">25</option>
                  <option key="50" value="50">50</option>
                  <option key="100" value="100">100</option>
                </select>
              </div>
              
              <div className="gps-page-buttons">
                <button 
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="gps-btn-secondary"
                >
                  First
                </button>
                <button 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="gps-btn-secondary"
                >
                  Previous
                </button>
                
                <span className="gps-page-indicator">
                  Page {currentPage} of {totalPages || 1}
                </span>
                
                <button 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="gps-btn-secondary"
                >
                  Next
                </button>
                <button 
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="gps-btn-secondary"
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
