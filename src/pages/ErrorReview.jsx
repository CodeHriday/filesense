import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiXCircle, FiCheckCircle, FiAlertCircle, FiFilter, FiDownload, FiX } from 'react-icons/fi';
import { getViolations, getFileErrors, getMappingErrors, getErrorStatistics, updateViolationStatus, bulkUpdateViolationStatus } from '../api/errorReviewService';
import { getProjects } from '../api/qualityRulesService';
import '../styles/ErrorReview.css';

const ErrorRecords = () => {
  const [activeTab, setActiveTab] = useState('violations');
  const [violations, setViolations] = useState([]);
  const [fileErrors, setFileErrors] = useState([]);
  const [mappingErrors, setMappingErrors] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedViolations, setSelectedViolations] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [resolutionTarget, setResolutionTarget] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  
  const [filters, setFilters] = useState({
    project_id: '',
    rule_type: '',
    severity: 'all',
    status: 'all',
    error_type: 'all',
    search: '',
    page: 1,
    limit: 50
  });

  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });

  useEffect(() => {
    fetchData();
  }, [activeTab, filters]);

  useEffect(() => {
    fetchProjects();
    fetchStatistics();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchStatistics = async () => {
    try {
      const stats = await getErrorStatistics(filters.project_id || null);
      setStatistics(stats);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (activeTab === 'violations') {
        const data = await getViolations(filters);
        setViolations(data.violations || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
      } else if (activeTab === 'file-errors') {
        const data = await getFileErrors(filters);
        setFileErrors(data.errors || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
      } else if (activeTab === 'mapping-errors') {
        const data = await getMappingErrors(filters);
        setMappingErrors(data.errors || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
      }
      
      await fetchStatistics();
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1
    }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const handleStatusUpdate = async (violationId, newStatus) => {
    // If marking as resolved, show modal for resolution notes
    if (newStatus === 'resolved') {
      setResolutionTarget({ id: violationId, status: newStatus });
      setShowResolutionModal(true);
      return;
    }
    
    try {
      await updateViolationStatus(violationId, newStatus);
      await fetchData();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update violation status.');
    }
  };

  const handleResolutionSubmit = async () => {
    if (!resolutionTarget) return;
    
    try {
      await updateViolationStatus(resolutionTarget.id, resolutionTarget.status, resolutionNotes);
      setShowResolutionModal(false);
      setResolutionTarget(null);
      setResolutionNotes('');
      await fetchData();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update violation status.');
    }
  };

  const viewRecordSnapshot = (record) => {
    setSelectedSnapshot(record);
    setShowSnapshotModal(true);
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedViolations.length === 0) {
      setError('No violations selected.');
      return;
    }

    try {
      await bulkUpdateViolationStatus(selectedViolations, newStatus);
      setSelectedViolations([]);
      await fetchData();
    } catch (err) {
      console.error('Error bulk updating status:', err);
      setError('Failed to bulk update violation status.');
    }
  };

  const toggleViolationSelection = (violationId) => {
    setSelectedViolations(prev => 
      prev.includes(violationId)
        ? prev.filter(id => id !== violationId)
        : [...prev, violationId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedViolations.length === violations.length) {
      setSelectedViolations([]);
    } else {
      setSelectedViolations(violations.map(v => v.id));
    }
  };

  const exportToCSV = () => {
    let data = [];
    let headers = [];
    
    if (activeTab === 'violations') {
      headers = ['ID', 'Rule Name', 'Rule Type', 'Severity', 'Status', 'Column', 'Expected', 'Actual', 'Row Number', 'File/Job', 'Project', 'Created At'];
      data = violations.map(v => [
        v.id,
        v.rule_name,
        v.rule_type,
        v.severity,
        v.status,
        v.column_name,
        v.expected_value,
        v.actual_value,
        v.row_number,
        v.file_name || v.job_name || 'N/A',
        v.project_name || 'N/A',
        new Date(v.created_at).toLocaleString()
      ]);
    } else if (activeTab === 'file-errors') {
      headers = ['ID', 'Error Type', 'Severity', 'File', 'Column', 'Row Number', 'Message', 'Project', 'Created At'];
      data = fileErrors.map(e => [
        e.id,
        e.error_type,
        e.severity,
        e.original_filename || e.file_name,
        e.column_name || 'N/A',
        e.row_number || 'N/A',
        e.error_message,
        e.project_name || 'N/A',
        new Date(e.created_at).toLocaleString()
      ]);
    } else if (activeTab === 'mapping-errors') {
      headers = ['ID', 'Error Type', 'Severity', 'Mapping', 'Column', 'Row Number', 'Message', 'Project', 'Created At'];
      data = mappingErrors.map(e => [
        e.id,
        e.error_type,
        e.severity,
        e.mapping_name,
        e.column_name || 'N/A',
        e.row_number || 'N/A',
        e.error_message,
        e.project_name || 'N/A',
        new Date(e.created_at).toLocaleString()
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <FiXCircle className="severity-icon critical" />;
      case 'error':
        return <FiAlertCircle className="severity-icon error" />;
      case 'warning':
        return <FiAlertTriangle className="severity-icon warning" />;
      default:
        return <FiAlertCircle className="severity-icon" />;
    }
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      new: 'status-badge new',
      reviewed: 'status-badge reviewed',
      acknowledged: 'status-badge acknowledged',
      resolved: 'status-badge resolved'
    };
    
    return <span className={statusClasses[status] || 'status-badge'}>{status}</span>;
  };

  const getProcessingActionBadge = (action) => {
    if (!action) return null;
    
    const actionConfig = {
      log_continue: { label: 'Continued', className: 'processing-action continue', icon: '✓' },
      log_abort: { label: 'Aborted', className: 'processing-action abort', icon: '✗' }
    };
    
    const config = actionConfig[action];
    if (!config) return null;
    
    return (
      <span className={config.className} title={`Processing ${config.label}`}>
        {config.icon} {config.label}
      </span>
    );
  };

  const renderStatistics = () => {
    if (!statistics) return null;

    const { violations: violationStats, file_errors: fileErrorStats, mapping_errors: mappingErrorStats } = statistics;

    return (
      <div className="statistics-dashboard">
        <div className="stat-card">
          <h3>Quality Rule Violations</h3>
          <div className="stat-grid">
            <div className="stat-item">
              <span className="stat-label">Total</span>
              <span className="stat-value">{violationStats?.total_violations || 0}</span>
            </div>
            <div className="stat-item critical">
              <span className="stat-label">Critical</span>
              <span className="stat-value">{violationStats?.critical_violations || 0}</span>
            </div>
            <div className="stat-item error">
              <span className="stat-label">Errors</span>
              <span className="stat-value">{violationStats?.error_violations || 0}</span>
            </div>
            <div className="stat-item warning">
              <span className="stat-label">Warnings</span>
              <span className="stat-value">{violationStats?.warning_violations || 0}</span>
            </div>
          </div>
          <div className="stat-breakdown">
            <div><strong>New:</strong> {violationStats?.new_violations || 0}</div>
            <div><strong>Reviewed:</strong> {violationStats?.reviewed_violations || 0}</div>
          </div>
        </div>

        <div className="stat-card">
          <h3>File Upload Errors</h3>
          <div className="stat-grid">
            <div className="stat-item">
              <span className="stat-label">Total</span>
              <span className="stat-value">{fileErrorStats?.total_file_errors || 0}</span>
            </div>
            <div className="stat-item critical">
              <span className="stat-label">Critical</span>
              <span className="stat-value">{fileErrorStats?.critical_file_errors || 0}</span>
            </div>
            <div className="stat-item error">
              <span className="stat-label">Errors</span>
              <span className="stat-value">{fileErrorStats?.error_file_errors || 0}</span>
            </div>
            <div className="stat-item warning">
              <span className="stat-label">Warnings</span>
              <span className="stat-value">{fileErrorStats?.warning_file_errors || 0}</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <h3>ETL Job Errors</h3>
          <div className="stat-grid">
            <div className="stat-item">
              <span className="stat-label">Total</span>
              <span className="stat-value">{mappingErrorStats?.total_mapping_errors || 0}</span>
            </div>
            <div className="stat-item critical">
              <span className="stat-label">Critical</span>
              <span className="stat-value">{mappingErrorStats?.critical_mapping_errors || 0}</span>
            </div>
            <div className="stat-item error">
              <span className="stat-label">Errors</span>
              <span className="stat-value">{mappingErrorStats?.error_mapping_errors || 0}</span>
            </div>
            <div className="stat-item warning">
              <span className="stat-label">Warnings</span>
              <span className="stat-value">{mappingErrorStats?.warning_mapping_errors || 0}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFilters = () => {
    if (!showFilters) return null;

    return (
      <div className="filters-panel">
        <div className="filters-grid">
          <div className="filter-group">
            <label>Project</label>
            <select
              value={filters.project_id}
              onChange={(e) => handleFilterChange('project_id', e.target.value)}
              className="filter-select"
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.project_name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Severity</label>
            <select
              value={filters.severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
              className="filter-select"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
          </div>

          {activeTab === 'violations' && (
            <>
              <div className="filter-group">
                <label>Rule Type</label>
                <select
                  value={filters.rule_type}
                  onChange={(e) => handleFilterChange('rule_type', e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Types</option>
                  <option value="completeness">Completeness</option>
                  <option value="validity">Validity</option>
                  <option value="consistency">Consistency</option>
                  <option value="uniqueness">Uniqueness</option>
                  <option value="freshness">Freshness</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </>
          )}

          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search..."
              className="filter-input"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderViolationsTable = () => {
    if (violations.length === 0) {
      return <div className="no-data">No violations found</div>;
    }

    return (
      <div className="table-container">
        {selectedViolations.length > 0 && (
          <div className="bulk-actions">
            <span>{selectedViolations.length} violation(s) selected</span>
            <div className="bulk-action-buttons">
              <button onClick={() => handleBulkStatusUpdate('reviewed')} className="btn-sm">Mark as Reviewed</button>
              <button onClick={() => handleBulkStatusUpdate('acknowledged')} className="btn-sm">Mark as Acknowledged</button>
              <button onClick={() => handleBulkStatusUpdate('resolved')} className="btn-sm">Mark as Resolved</button>
            </div>
          </div>
        )}
        
        <table className="error-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedViolations.length === violations.length && violations.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Severity</th>
              <th>Rule</th>
              <th>Type</th>
              <th>Column</th>
              <th>Row</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Status</th>
              <th>Action</th>
              <th>File/Job</th>
              <th>Project</th>
              <th>Created</th>
              <th>Details</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {violations.map(violation => (
              <tr key={violation.id} className={selectedViolations.includes(violation.id) ? 'selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedViolations.includes(violation.id)}
                    onChange={() => toggleViolationSelection(violation.id)}
                  />
                </td>
                <td>{getSeverityIcon(violation.severity)}</td>
                <td>{violation.rule_name}</td>
                <td><span className="badge">{violation.rule_type}</span></td>
                <td>{violation.column_name || '-'}</td>
                <td>{violation.row_number || '-'}</td>
                <td className="truncate">{violation.expected_value || '-'}</td>
                <td className="truncate">{violation.actual_value || '-'}</td>
                <td>{getStatusBadge(violation.status)}</td>
                <td>{getProcessingActionBadge(violation.processing_action)}</td>
                <td className="truncate">{violation.file_name || violation.job_name || '-'}</td>
                <td>{violation.project_name || '-'}</td>
                <td>{new Date(violation.created_at).toLocaleDateString()}</td>
                <td>
                  {violation.record_snapshot && (
                    <button onClick={() => viewRecordSnapshot(violation.record_snapshot)} className="btn-sm">View</button>
                  )}
                </td>
                <td>
                  <select
                    value={violation.status}
                    onChange={(e) => handleStatusUpdate(violation.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFileErrorsTable = () => {
    if (fileErrors.length === 0) {
      return <div className="no-data">No file errors found</div>;
    }

    return (
      <div className="table-container">
        <table className="error-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Error Type</th>
              <th>File</th>
              <th>Column</th>
              <th>Row</th>
              <th>Message</th>
              <th>Project</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {fileErrors.map(error => (
              <tr key={error.id}>
                <td>{getSeverityIcon(error.severity)}</td>
                <td><span className="badge">{error.error_type}</span></td>
                <td className="truncate">{error.original_filename || error.file_name}</td>
                <td>{error.column_name || '-'}</td>
                <td>{error.row_number || '-'}</td>
                <td className="error-message">{error.error_message}</td>
                <td>{error.project_name || '-'}</td>
                <td>{new Date(error.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMappingErrorsTable = () => {
    if (mappingErrors.length === 0) {
      return <div className="no-data">No ETL job errors found</div>;
    }

    return (
      <div className="table-container">
        <table className="error-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Error Type</th>
              <th>Mapping</th>
              <th>Column</th>
              <th>Row</th>
              <th>Message</th>
              <th>Project</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {mappingErrors.map(error => (
              <tr key={error.id}>
                <td>{getSeverityIcon(error.severity)}</td>
                <td><span className="badge">{error.error_type}</span></td>
                <td className="truncate">{error.mapping_name}</td>
                <td>{error.column_name || '-'}</td>
                <td>{error.row_number || '-'}</td>
                <td className="error-message">{error.error_message}</td>
                <td>{error.project_name || '-'}</td>
                <td>{new Date(error.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, pagination.page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="pagination">
        <button
          onClick={() => handlePageChange(pagination.page - 1)}
          disabled={pagination.page === 1}
          className="pagination-btn"
        >
          Previous
        </button>
        
        {startPage > 1 && (
          <>
            <button onClick={() => handlePageChange(1)} className="pagination-btn">1</button>
            {startPage > 2 && <span className="pagination-ellipsis">...</span>}
          </>
        )}
        
        {pages.map(page => (
          <button
            key={page}
            onClick={() => handlePageChange(page)}
            className={`pagination-btn ${pagination.page === page ? 'active' : ''}`}
          >
            {page}
          </button>
        ))}
        
        {endPage < pagination.totalPages && (
          <>
            {endPage < pagination.totalPages - 1 && <span className="pagination-ellipsis">...</span>}
            <button onClick={() => handlePageChange(pagination.totalPages)} className="pagination-btn">
              {pagination.totalPages}
            </button>
          </>
        )}
        
        <button
          onClick={() => handlePageChange(pagination.page + 1)}
          disabled={pagination.page === pagination.totalPages}
          className="pagination-btn"
        >
          Next
        </button>
        
        <span className="pagination-info">
          Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
        </span>
      </div>
    );
  };

  return (
    <div className="error-review-container">
      <div className="error-review-header">
        <div>
          <h1>Error Records</h1>
          <p>Monitor and manage data quality violations and errors</p>
        </div>
        <div className="header-actions">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary ${showFilters ? 'active' : ''}`}
          >
            <FiFilter /> {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          <button onClick={exportToCSV} className="btn-secondary">
            <FiDownload /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-close">
            <FiX />
          </button>
        </div>
      )}

      {renderStatistics()}
      {renderFilters()}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'violations' ? 'active' : ''}`}
          onClick={() => setActiveTab('violations')}
        >
          Quality Rule Violations
          {statistics?.violations?.total_violations > 0 && (
            <span className="tab-badge">{statistics.violations.total_violations}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'file-errors' ? 'active' : ''}`}
          onClick={() => setActiveTab('file-errors')}
        >
          File Upload Errors
          {statistics?.file_errors?.total_file_errors > 0 && (
            <span className="tab-badge">{statistics.file_errors.total_file_errors}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'mapping-errors' ? 'active' : ''}`}
          onClick={() => setActiveTab('mapping-errors')}
        >
          ETL Job Errors
          {statistics?.mapping_errors?.total_mapping_errors > 0 && (
            <span className="tab-badge">{statistics.mapping_errors.total_mapping_errors}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {activeTab === 'violations' && renderViolationsTable()}
          {activeTab === 'file-errors' && renderFileErrorsTable()}
          {activeTab === 'mapping-errors' && renderMappingErrorsTable()}
          {renderPagination()}
        </>
      )}

      {showResolutionModal && (
        <div className="modal-overlay" onClick={() => setShowResolutionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Mark as Resolved</h2>
              <button className="modal-close" onClick={() => setShowResolutionModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Please provide a reason for marking this violation as resolved:</p>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Enter resolution notes..."
                rows={4}
                className="resolution-textarea"
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowResolutionModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleResolutionSubmit} className="btn-primary">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showSnapshotModal && (
        <div className="modal-overlay" onClick={() => setShowSnapshotModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Snapshot</h2>
              <button className="modal-close" onClick={() => setShowSnapshotModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <pre className="json-viewer">
                {JSON.stringify(selectedSnapshot, null, 2)}
              </pre>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowSnapshotModal(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorRecords;
