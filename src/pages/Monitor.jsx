import React, { useState, useEffect } from 'react';
import { FiChevronDown, FiChevronRight, FiDownload } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatBytes, formatDate } from '../utils/formatters';
import axios from 'axios';
import './Monitor.css';

function Monitor() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // Fetch audit data on mount and when pagination changes
  useEffect(() => {
    fetchAuditData();
  }, [currentPage, pageSize]);
  
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
  
  const toggleRowExpansion = (auditId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(auditId)) {
      newExpanded.delete(auditId);
    } else {
      newExpanded.add(auditId);
    }
    setExpandedRows(newExpanded);
  };
  
  const totalPages = Math.ceil(totalRecords / pageSize);
  
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setExpandedRows(new Set()); // Collapse all rows when changing pages
    }
  };
  
  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page
    setExpandedRows(new Set());
  };
  
  const formatDuration = (ms) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };
  
  const getStatusClass = (status) => {
    if (!status) return 'status-unknown';
    const statusLower = status.toLowerCase();
    if (statusLower === 'success' || statusLower === 'completed') return 'status-success';
    if (statusLower === 'failed' || statusLower === 'error') return 'status-error';
    if (statusLower === 'processing' || statusLower === 'in_progress') return 'status-processing';
    return 'status-unknown';
  };
  
  const renderSchemaDetails = (audit) => {
    if (!audit.file_schema) return <div className="no-schema">No schema information available</div>;
    
    try {
      const schema = typeof audit.file_schema === 'string' 
        ? JSON.parse(audit.file_schema) 
        : audit.file_schema;
      
      return (
        <div className="schema-details">
          <div className="schema-info">
            <div className="schema-meta">
              <span className="schema-label">Schema Hash:</span>
              <span className="schema-value">{audit.schema_hash || 'N/A'}</span>
            </div>
            {audit.schema_diff && (
              <div className="schema-meta">
                <span className="schema-label">Schema Changed:</span>
                <span className="schema-value">{audit.schema_changed ? 'Yes' : 'No'}</span>
              </div>
            )}
          </div>
          
          {schema.columns && schema.columns.length > 0 && (
            <div className="schema-columns">
              <h4>Column Schema ({schema.columns.length} columns)</h4>
              <div className="schema-table">
                <div className="schema-table-header">
                  <div className="col">Column Name</div>
                  <div className="col">Type</div>
                  <div className="col">Nullable</div>
                </div>
                <div className="schema-table-body">
                  {schema.columns.map((col, idx) => (
                    <div className="schema-table-row" key={idx}>
                      <div className="col">{col.name}</div>
                      <div className="col">{col.type}</div>
                      <div className="col">{col.nullable !== false ? 'Yes' : 'No'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {audit.schema_diff && (
            <div className="schema-diff">
              <h4>Schema Changes</h4>
              <pre>{JSON.stringify(JSON.parse(audit.schema_diff), null, 2)}</pre>
            </div>
          )}
        </div>
      );
    } catch (e) {
      return <div className="schema-error">Error parsing schema: {e.message}</div>;
    }
  };
  
  return (
    <div className="monitor-container">
      <div className="monitor-header">
        <h1>File Audit Trail</h1>
        <div className="monitor-actions">
          <span className="total-records">{totalRecords} total records</span>
        </div>
      </div>
      
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <Card className="audit-trail-card">
            <div className="audit-table-container">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th className="expand-col"></th>
                    <th>Date</th>
                    <th>File Name</th>
                    <th>Source</th>
                    <th>Load Type</th>
                    <th>Schedule</th>
                    <th>Mapping Group</th>
                    <th>Mapping Name</th>
                    <th>File Type</th>
                    <th>Records</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>File Size</th>
                    <th>Columns</th>
                    <th>Encoding</th>
                    <th>User ID</th>
                    <th>Correlation ID</th>
                    <th>Load Step 1</th>
                    <th>Load Step 2</th>
                    <th>Load Step 3</th>
                    <th>Load Step 4</th>
                    <th>Load Step 5</th>
                    <th>Error Message</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.length === 0 ? (
                    <tr>
                      <td colSpan="23" className="no-data">No audit records found</td>
                    </tr>
                  ) : (
                    audits.map((audit) => (
                      <React.Fragment key={audit.id}>
                        <tr className="audit-row">
                          <td className="expand-col">
                            <button 
                              className="expand-btn"
                              onClick={() => toggleRowExpansion(audit.id)}
                              title="View schema details"
                            >
                              {expandedRows.has(audit.id) ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                          </td>
                          <td className="date-col">{formatDate(audit.created_dt)}</td>
                          <td className="file-name-col" title={audit.file_name}>{audit.file_name || '-'}</td>
                          <td>{audit.source || '-'}</td>
                          <td>{audit.load_type || '-'}</td>
                          <td>{audit.schedule_name || '-'}</td>
                          <td>{audit.mapping_group_name || '-'}</td>
                          <td>{audit.mapping_name || '-'}</td>
                          <td>{audit.file_type ? audit.file_type.toUpperCase() : '-'}</td>
                          <td className="number-col">{(audit.no_of_records_in_source || 0).toLocaleString()}</td>
                          <td>
                            <span className={`status-badge ${getStatusClass(audit.status)}`}>
                              {audit.status || 'unknown'}
                            </span>
                          </td>
                          <td>{formatDuration(audit.processing_duration_ms)}</td>
                          <td>{audit.file_size_bytes ? formatBytes(audit.file_size_bytes) : '-'}</td>
                          <td className="number-col">{audit.number_of_columns || '-'}</td>
                          <td>{audit.encoding || '-'}</td>
                          <td className="number-col">{audit.user_id || '-'}</td>
                          <td className="correlation-col" title={audit.correlation_id}>
                            {audit.correlation_id ? audit.correlation_id.substring(0, 8) + '...' : '-'}
                          </td>
                          <td>{audit.load_step_1 ? formatDate(audit.load_step_1) : '-'}</td>
                          <td>{audit.load_step_2 ? formatDate(audit.load_step_2) : '-'}</td>
                          <td>{audit.load_step_3 ? formatDate(audit.load_step_3) : '-'}</td>
                          <td>{audit.load_step_4 ? formatDate(audit.load_step_4) : '-'}</td>
                          <td>{audit.load_step_5 ? formatDate(audit.load_step_5) : '-'}</td>
                          <td className="error-col" title={audit.error_message}>
                            {audit.error_message ? audit.error_message.substring(0, 30) + '...' : '-'}
                          </td>
                        </tr>
                        {expandedRows.has(audit.id) && (
                          <tr className="expanded-row">
                            <td colSpan="23">
                              <div className="expanded-content">
                                <div className="expanded-section">
                                  <h3>Additional Details</h3>
                                  <div className="detail-grid">
                                    <div className="detail-item">
                                      <span className="detail-label">Audit ID:</span>
                                      <span className="detail-value">{audit.id}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">File ID:</span>
                                      <span className="detail-value">{audit.file_id || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">File Hash:</span>
                                      <span className="detail-value">{audit.file_hash || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">File Pattern:</span>
                                      <span className="detail-value">{audit.file_pattern || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Source Path:</span>
                                      <span className="detail-value">{audit.source_path || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">File Delimiter:</span>
                                      <span className="detail-value">{audit.file_delimiter || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">User Email:</span>
                                      <span className="detail-value">{audit.user_email || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">IP Address:</span>
                                      <span className="detail-value">{audit.ip_address || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Session ID:</span>
                                      <span className="detail-value">{audit.session_id || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Parent Audit ID:</span>
                                      <span className="detail-value">{audit.parent_audit_id || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Error Type:</span>
                                      <span className="detail-value">{audit.error_type || '-'}</span>
                                    </div>
                                    <div className="detail-item">
                                      <span className="detail-label">Created By:</span>
                                      <span className="detail-value">{audit.created_by || '-'}</span>
                                    </div>
                                  </div>
                                  
                                  {audit.load_step_1_path && (
                                    <div className="load-steps">
                                      <h4>Load Steps Details</h4>
                                      <div className="detail-grid">
                                        {audit.load_step_1_path && (
                                          <div className="detail-item">
                                            <span className="detail-label">Step 1 Path:</span>
                                            <span className="detail-value">{audit.load_step_1_path} ({audit.load_step_1_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_2_path && (
                                          <div className="detail-item">
                                            <span className="detail-label">Step 2 Path:</span>
                                            <span className="detail-value">{audit.load_step_2_path} ({audit.load_step_2_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_3_path && (
                                          <div className="detail-item">
                                            <span className="detail-label">Step 3 Path:</span>
                                            <span className="detail-value">{audit.load_step_3_path} ({audit.load_step_3_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_4_path && (
                                          <div className="detail-item">
                                            <span className="detail-label">Step 4 Path:</span>
                                            <span className="detail-value">{audit.load_step_4_path} ({audit.load_step_4_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                        {audit.load_step_5_path && (
                                          <div className="detail-item">
                                            <span className="detail-label">Step 5 Path:</span>
                                            <span className="detail-value">{audit.load_step_5_path} ({audit.load_step_5_rec_cnt || 0} records)</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {audit.error_message && (
                                    <div className="error-details">
                                      <h4>Error Details</h4>
                                      <pre>{audit.error_message}</pre>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="expanded-section">
                                  <h3>Schema Information</h3>
                                  {renderSchemaDetails(audit)}
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
          </Card>
          
          <div className="pagination-container">
            <div className="pagination-info">
              Showing {audits.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} records
            </div>
            
            <div className="pagination-controls">
              <div className="page-size-selector">
                <label>Rows per page:</label>
                <select value={pageSize} onChange={handlePageSizeChange}>
                  <option key="10" value="10">10</option>
                  <option key="25" value="25">25</option>
                  <option key="50" value="50">50</option>
                  <option key="100" value="100">100</option>
                </select>
              </div>
              
              <div className="page-buttons">
                <button 
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="pagination-btn"
                >
                  First
                </button>
                <button 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="pagination-btn"
                >
                  Previous
                </button>
                
                <span className="page-indicator">
                  Page {currentPage} of {totalPages || 1}
                </span>
                
                <button 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="pagination-btn"
                >
                  Next
                </button>
                <button 
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="pagination-btn"
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
