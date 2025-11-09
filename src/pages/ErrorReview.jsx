import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiFilter, FiX, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { getProjects } from '../api/qualityRulesService';
import '../styles/ErrorReview.css';

const API_BASE = '/api/error-review';

const ErrorReview = () => {
  const [activeTab, setActiveTab] = useState('file-upload');
  const [violations, setViolations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState({
    project_id: '',
    rule_type: 'all',
    severity: 'all',
    status: 'all',
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
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchViolations();
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

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getSeverityBadge = (severity) => {
    const severityColors = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      error: 'bg-orange-100 text-orange-800 border-orange-300',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-blue-100 text-blue-800 border-blue-300'
    };
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${severityColors[severity] || 'bg-gray-100 text-gray-800 border-gray-300'}`}>
        {severity?.toUpperCase() || 'UNKNOWN'}
      </span>
    );
  };

  const renderViolationDetails = (violation) => {
    const details = violation.violation_details || {};
    
    return (
      <div className="violation-details-compact">
        <div className="detail-item">
          <span className="detail-label">Rule:</span>
          <span className="detail-value">{violation.rule_name || '-'}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Column:</span>
          <span className="detail-value">{violation.column_name || '-'}</span>
        </div>
        {violation.row_number && (
          <div className="detail-item">
            <span className="detail-label">Row #:</span>
            <span className="detail-value">{violation.row_number}</span>
          </div>
        )}
        {violation.expected_value && (
          <div className="detail-item">
            <span className="detail-label">Expected:</span>
            <span className="detail-value">{violation.expected_value}</span>
          </div>
        )}
        {violation.actual_value && (
          <div className="detail-item">
            <span className="detail-label">Actual:</span>
            <span className="detail-value">{violation.actual_value}</span>
          </div>
        )}
      </div>
    );
  };

  const renderFullRecord = (recordSnapshot) => {
    if (!recordSnapshot || typeof recordSnapshot !== 'object') {
      return <div className="text-gray-500 italic">No record data available</div>;
    }

    return (
      <div className="record-snapshot">
        <div className="record-snapshot-header">Full Record Data:</div>
        <div className="record-snapshot-content">
          {Object.entries(recordSnapshot).map(([key, value]) => (
            <div key={key} className="record-field">
              <span className="record-field-key">{key}:</span>
              <span className="record-field-value">{value !== null && value !== undefined ? String(value) : 'null'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderViolationsTable = () => {
    if (loading) {
      return <div className="loading-message">Loading violations...</div>;
    }

    if (error) {
      return <div className="error-message">{error}</div>;
    }

    if (violations.length === 0) {
      return <div className="empty-state">No violations found</div>;
    }

    return (
      <div className="violations-table-container">
        <table className="violations-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Project</th>
              <th>Sub-Project</th>
              <th>Filename</th>
              <th>Violation Details</th>
              <th>Severity</th>
              <th>Created Date</th>
              {activeTab === 'mapping-job' && <th>Executed By</th>}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((violation) => (
              <React.Fragment key={violation.id}>
                <tr className="violation-row">
                  <td>
                    <button 
                      className="expand-button"
                      onClick={() => toggleRowExpansion(violation.id)}
                      title="View full record"
                    >
                      {expandedRows.has(violation.id) ? <FiChevronUp /> : <FiChevronDown />}
                    </button>
                  </td>
                  <td>{violation.project_name || '-'}</td>
                  <td>{violation.sub_project_name || '-'}</td>
                  <td className="filename-cell">{violation.filename || '-'}</td>
                  <td>{renderViolationDetails(violation)}</td>
                  <td>{getSeverityBadge(violation.severity)}</td>
                  <td>{formatDate(violation.created_at)}</td>
                  {activeTab === 'mapping-job' && (
                    <td>{violation.executed_by_fullname || violation.executed_by_username || '-'}</td>
                  )}
                  <td>
                    <span className={`status-badge status-${violation.status}`}>
                      {violation.status || 'new'}
                    </span>
                  </td>
                </tr>
                {expandedRows.has(violation.id) && (
                  <tr className="expanded-row">
                    <td></td>
                    <td colSpan={activeTab === 'mapping-job' ? 8 : 7}>
                      {renderFullRecord(violation.record_snapshot)}
                      {activeTab === 'mapping-job' && violation.mapping_name && (
                        <div className="mapping-info">
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
    );
  };

  return (
    <div className="error-review-container">
      <div className="error-review-header">
        <div className="header-left">
          <FiAlertTriangle className="header-icon" />
          <h1>Data Violations</h1>
        </div>
        <button 
          className="filter-toggle-button"
          onClick={() => setShowFilters(!showFilters)}
        >
          <FiFilter /> {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Project</label>
            <select 
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
          </div>

          <div className="filter-group">
            <label>Rule Type</label>
            <select 
              value={filters.rule_type} 
              onChange={(e) => handleFilterChange('rule_type', e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="completeness">Completeness</option>
              <option value="validity">Validity</option>
              <option value="consistency">Consistency</option>
              <option value="uniqueness">Uniqueness</option>
              <option value="freshness">Freshness</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Severity</label>
            <select 
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
          </div>

          <div className="filter-group">
            <label>Status</label>
            <select 
              value={filters.status} 
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="filter-group filter-search">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search violations..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>

          <button 
            className="clear-filters-button"
            onClick={() => setFilters({
              project_id: '',
              rule_type: 'all',
              severity: 'all',
              status: 'all',
              search: '',
              page: 1,
              limit: 50
            })}
          >
            <FiX /> Clear Filters
          </button>
        </div>
      )}

      <div className="tabs-container">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'file-upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('file-upload')}
          >
            File Upload Violations
            {activeTab === 'file-upload' && (
              <span className="tab-count">{pagination.total}</span>
            )}
          </button>
          <button 
            className={`tab ${activeTab === 'mapping-job' ? 'active' : ''}`}
            onClick={() => setActiveTab('mapping-job')}
          >
            Mapping Job Violations
            {activeTab === 'mapping-job' && (
              <span className="tab-count">{pagination.total}</span>
            )}
          </button>
        </div>
      </div>

      <div className="violations-content">
        {renderViolationsTable()}
      </div>

      {violations.length > 0 && (
        <div className="pagination">
          <button 
            onClick={() => handlePageChange(filters.page - 1)}
            disabled={filters.page <= 1}
            className="pagination-button"
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <button 
            onClick={() => handlePageChange(filters.page + 1)}
            disabled={filters.page >= pagination.totalPages}
            className="pagination-button"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ErrorReview;
