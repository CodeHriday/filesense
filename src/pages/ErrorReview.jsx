import React, { useState, useEffect, useMemo } from 'react';
import { FiAlertTriangle, FiFilter, FiX, FiChevronDown, FiChevronUp, FiDownload, FiChevronRight, FiTrash2, FiSearch } from 'react-icons/fi';
import { getProjects } from '../api/qualityRulesService';
import { bulkDeleteViolations } from '../api/errorReviewService';
import '../styles/global-page-styles.css';
import '../styles/ErrorReview.css';

const API_BASE = '/api/error-review';

const ErrorReview = () => {
  const [activeTab, setActiveTab] = useState('file-upload');
  const [violations, setViolations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState({
    project_id: '',
    rule_type: 'all',
    severity: 'all',
    status: 'all',
    search: '',
    page: 1,
    limit: 10
  });

  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchViolations();
    setSelectedIds([]);
  }, [activeTab, filters]);

  const fetchProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchViolations = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const endpoint = activeTab === 'file-upload' 
        ? `${API_BASE}/file-upload-violations` 
        : `${API_BASE}/mapping-job-violations`;
      
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all' && value !== '') {
          params.append(key, value);
        }
      });

      const response = await fetch(`${endpoint}?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setViolations(data.violations || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 });
    } catch (err) {
      console.error('Error fetching violations:', err);
      setError(`Failed to load violations: ${err.message}`);
      setViolations([]);
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

  const handleDownload = async (format) => {
    try {
      const endpoint = activeTab === 'file-upload' 
        ? `${API_BASE}/file-upload-violations/download` 
        : `${API_BASE}/mapping-job-violations/download`;
      
      const params = new URLSearchParams();
      params.append('format', format);
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all' && value !== '' && key !== 'page' && key !== 'limit') {
          params.append(key, value);
        }
      });

      const response = await fetch(`${endpoint}?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'excel' 
        ? `${activeTab}-violations.xlsx` 
        : `${activeTab}-violations.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading violations:', err);
      alert(`Failed to download violations: ${err.message}`);
    }
  };

  const toggleProjectExpansion = (projectName) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectName)) {
        newSet.delete(projectName);
      } else {
        newSet.add(projectName);
      }
      return newSet;
    });
  };

  const toggleRowExpansion = (violationId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(violationId)) {
        newSet.delete(violationId);
      } else {
        newSet.add(violationId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = violations.map(v => v.id);
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (violationId, e) => {
    e.stopPropagation();
    if (selectedIds.includes(violationId)) {
      setSelectedIds(selectedIds.filter(id => id !== violationId));
    } else {
      setSelectedIds([...selectedIds, violationId]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedIds.length} violation record(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      const result = await bulkDeleteViolations(selectedIds);
      
      if (result.success) {
        alert(`Successfully deleted ${result.deleted} violation record(s)`);
        setSelectedIds([]);
        fetchViolations();
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      const errorMsg = error.response?.data?.error || 'Failed to delete violation records';
      alert(`Error: ${errorMsg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getSeverityBadge = (severity) => {
    const severityClasses = {
      critical: 'gps-badge gps-badge-danger',
      high: 'gps-badge gps-badge-warning',
      error: 'gps-badge gps-badge-warning',
      warning: 'gps-badge gps-badge-info',
      low: 'gps-badge gps-badge-secondary'
    };
    
    return (
      <span className={severityClasses[severity] || 'gps-badge gps-badge-secondary'}>
        {severity?.toUpperCase() || 'UNKNOWN'}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      new: 'gps-badge gps-badge-info',
      reviewed: 'gps-badge gps-badge-primary',
      acknowledged: 'gps-badge gps-badge-warning',
      resolved: 'gps-badge gps-badge-success'
    };
    
    return (
      <span className={statusClasses[status] || 'gps-badge gps-badge-secondary'}>
        {status || 'new'}
      </span>
    );
  };

  const groupedViolations = useMemo(() => {
    const groups = {};
    violations.forEach(violation => {
      const projectKey = violation.project_name || 'Unknown Project';
      if (!groups[projectKey]) {
        groups[projectKey] = [];
      }
      groups[projectKey].push(violation);
    });
    return groups;
  }, [violations]);

  const renderFullRecord = (recordSnapshot) => {
    if (!recordSnapshot || typeof recordSnapshot !== 'object') {
      return <div className="gps-text-muted" style={{ fontStyle: 'italic' }}>No record data available</div>;
    }

    return (
      <div className="quality-violations-record-snapshot">
        <div className="quality-violations-record-header">Full Record Data:</div>
        <div className="quality-violations-record-content">
          {Object.entries(recordSnapshot).map(([key, value]) => (
            <div key={key} className="quality-violations-record-field">
              <span className="quality-violations-record-field-key">{key}:</span>
              <span className="quality-violations-record-field-value">{value !== null && value !== undefined ? String(value) : 'null'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderViolationsTable = () => {
    if (loading) {
      return <div className="gps-empty-state">Loading violations...</div>;
    }

    if (error) {
      return <div className="gps-alert gps-alert-danger">{error}</div>;
    }

    if (violations.length === 0) {
      return <div className="gps-empty-state"><p>No violations found</p></div>;
    }

    const projectNames = Object.keys(groupedViolations).sort();

    return (
      <>
        {selectedIds.length > 0 && (
          <div className="quality-violations-bulk-actions-bar">
            <span className="quality-violations-selected-count">{selectedIds.length} violation(s) selected</span>
            <button
              className="gps-btn-danger"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              <FiTrash2 />
              {isDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.length})`}
            </button>
          </div>
        )}
        
        {projectNames.map((projectName) => {
          const projectViolations = groupedViolations[projectName];
          const isExpanded = expandedProjects.has(projectName);
          
          return (
            <div key={projectName} className="quality-violations-project-group">
              <div className="quality-violations-project-header" onClick={() => toggleProjectExpansion(projectName)}>
                <button className="gps-icon-btn" style={{ border: 'none', background: 'none' }}>
                  {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                </button>
                <h3 className="project-name">{projectName}</h3>
                <span className="gps-badge gps-badge-info">{projectViolations.length} violations</span>
              </div>
              
              {isExpanded && (
                <div className="gps-table-container">
                  <table className="gps-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            onChange={handleSelectAll}
                            checked={violations.length > 0 && selectedIds.length === violations.length}
                            title="Select all"
                          />
                        </th>
                        <th style={{ width: '40px' }}></th>
                        <th>Sub-Project</th>
                        <th>Filename</th>
                        <th>Rule</th>
                        <th>Column</th>
                        <th>Row #</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Severity</th>
                        <th>Created Date</th>
                        {activeTab === 'mapping-job' && <th>Executed By</th>}
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectViolations.map((violation) => (
                        <React.Fragment key={violation.id}>
                          <tr className={selectedIds.includes(violation.id) ? 'selected-row' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(violation.id)}
                                onChange={(e) => handleSelectRow(violation.id, e)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td>
                              <button 
                                className="gps-icon-btn"
                                onClick={() => toggleRowExpansion(violation.id)}
                                title="View full record"
                              >
                                {expandedRows.has(violation.id) ? <FiChevronUp /> : <FiChevronDown />}
                              </button>
                            </td>
                            <td>{violation.sub_project_name || '-'}</td>
                            <td className="filename-cell">{violation.filename || '-'}</td>
                            <td>{violation.rule_name || '-'}</td>
                            <td>{violation.column_name || '-'}</td>
                            <td>{violation.row_number || '-'}</td>
                            <td>{violation.expected_value || '-'}</td>
                            <td>{violation.actual_value || '-'}</td>
                            <td>{getSeverityBadge(violation.severity)}</td>
                            <td>{formatDate(violation.created_at)}</td>
                            {activeTab === 'mapping-job' && (
                              <td>{violation.executed_by_fullname || violation.executed_by_username || '-'}</td>
                            )}
                            <td>{getStatusBadge(violation.status)}</td>
                          </tr>
                          {expandedRows.has(violation.id) && (
                            <tr className="expanded-row">
                              <td></td>
                              <td colSpan={activeTab === 'mapping-job' ? 12 : 11}>
                                {renderFullRecord(violation.record_snapshot)}
                                {activeTab === 'mapping-job' && violation.mapping_name && (
                                  <div className="quality-violations-mapping-info">
                                    <strong>Mapping:</strong> {violation.mapping_name}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Quality Violations</h1>
          <p className="gps-page-subtitle">Review and manage data quality rule violations</p>
        </div>
        <div className="gps-page-header-right" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="download-dropdown">
            <button className="gps-btn-primary">
              <FiDownload /> Download
            </button>
            <div className="download-menu">
              <button onClick={() => handleDownload('csv')}>Download as CSV</button>
              <button onClick={() => handleDownload('excel')}>Download as Excel</button>
            </div>
          </div>
          <button 
            className={`gps-btn-secondary ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <FiFilter /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      <div className="gps-tabs">
        <button 
          className={`gps-tab ${activeTab === 'file-upload' ? 'gps-tab--active' : ''}`}
          onClick={() => setActiveTab('file-upload')}
        >
          File Upload Violations
          {activeTab === 'file-upload' && (
            <span className="gps-tab-count">{pagination.total}</span>
          )}
        </button>
        <button 
          className={`gps-tab ${activeTab === 'mapping-job' ? 'gps-tab--active' : ''}`}
          onClick={() => setActiveTab('mapping-job')}
        >
          Mapping Job Violations
          {activeTab === 'mapping-job' && (
            <span className="gps-tab-count">{pagination.total}</span>
          )}
        </button>
      </div>
      
      {showFilters && (
        <div className="gps-filters">
          <select 
            className="gps-filter-select"
            value={filters.project_id} 
            onChange={(e) => handleFilterChange('project_id', e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <select 
            className="gps-filter-select"
            value={filters.rule_type} 
            onChange={(e) => handleFilterChange('rule_type', e.target.value)}
          >
            <option value="all">All Rule Types</option>
            <option value="completeness">Completeness</option>
            <option value="validity">Validity</option>
            <option value="consistency">Consistency</option>
            <option value="uniqueness">Uniqueness</option>
            <option value="freshness">Freshness</option>
          </select>

          <select 
            className="gps-filter-select"
            value={filters.severity} 
            onChange={(e) => handleFilterChange('severity', e.target.value)}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="low">Low</option>
          </select>

          <select 
            className="gps-filter-select"
            value={filters.status} 
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>

          <div className="gps-search-container">
            <FiSearch className="gps-search-icon" />
            <input
              type="text"
              className="gps-search-input"
              placeholder="Search violations..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>

          <button 
            className="gps-btn-danger"
            onClick={() => setFilters({
              project_id: '',
              rule_type: 'all',
              severity: 'all',
              status: 'all',
              search: '',
              page: 1,
              limit: 10
            })}
          >
            <FiX /> Clear Filters
          </button>
        </div>
      )}

      <div className="gps-results-info">
        Showing {violations.length} violations (Page {pagination.page} of {pagination.totalPages || 1}, {pagination.total} total)
      </div>

      {renderViolationsTable()}

      {violations.length > 0 && (
        <div className="gps-pagination">
          <div className="gps-pagination-controls">
            <button 
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={filters.page <= 1}
              className="gps-btn-secondary"
            >
              Previous
            </button>
            <span className="gps-pagination-info">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <button 
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={filters.page >= pagination.totalPages}
              className="gps-btn-secondary"
            >
              Next
            </button>
          </div>
          <div className="gps-pagination-size">
            <label>Rows per page:</label>
            <select 
              value={filters.limit} 
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="gps-filter-select"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorReview;
