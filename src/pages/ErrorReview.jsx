import React, { useState, useEffect, useMemo } from 'react';
import { FiAlertTriangle, FiFilter, FiX, FiChevronDown, FiChevronUp, FiDownload, FiChevronRight, FiTrash2 } from 'react-icons/fi';
import { getProjects } from '../api/qualityRulesService';
import { bulkDeleteViolations } from '../api/errorReviewService';
import PageLayout from '../components/PageLayout';
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
    setSelectedIds([]); // Reset selection when tab changes
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

  // Handle checkbox selection
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

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedIds.length} violation record(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      const result = await bulkDeleteViolations(selectedIds);
      
      // Show success message
      if (result.success) {
        alert(`Successfully deleted ${result.deleted} violation record(s)`);
        setSelectedIds([]);
        
        // Refresh data
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
      return <div className="text-gray-500 italic">No record data available</div>;
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
      return <div className="loading-message">Loading violations...</div>;
    }

    if (error) {
      return <div className="error-message">{error}</div>;
    }

    if (violations.length === 0) {
      return <div className="empty-state">No violations found</div>;
    }

    const projectNames = Object.keys(groupedViolations).sort();

    return (
      <>
        {selectedIds.length > 0 && (
          <div className="bulk-actions-bar">
            <span className="selected-count">{selectedIds.length} violation(s) selected</span>
            <button
              className="bulk-delete-btn"
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
                <button className="project-expand-button">
                  {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                </button>
                <h3 className="project-name">{projectName}</h3>
                <span className="project-count">{projectViolations.length} violations</span>
              </div>
              
              {isExpanded && (
                <PageLayout.TableWrapper>
                  <table className="violations-table page-layout-table violations-details-table">
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
                        <tr className={`violation-row ${selectedIds.includes(violation.id) ? 'selected-row' : ''}`}>
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
                              className="expand-button"
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
                          <td>
                            <span className={`status-badge status-${violation.status}`}>
                              {violation.status || 'new'}
                            </span>
                          </td>
                        </tr>
                        {expandedRows.has(violation.id) && (
                          <tr className="expanded-row">
                            <td></td>
                            <td colSpan={activeTab === 'mapping-job' ? 11 : 10}>
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
                </PageLayout.TableWrapper>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <PageLayout
      title="Quality Violations"
      headerActions={
        <>
          <div className="download-dropdown">
            <button className="download-button">
              <FiDownload /> Download
            </button>
            <div className="download-menu">
              <button onClick={() => handleDownload('csv')}>Download as CSV</button>
              <button onClick={() => handleDownload('excel')}>Download as Excel</button>
            </div>
          </div>
          <button 
            className={`btn-secondary ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <FiFilter /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </>
      }
      filters={
        <PageLayout.Filters>
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
          
          {showFilters && (
            <>
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
                  limit: 10
                })}
              >
                <FiX /> Clear Filters
              </button>
            </>
          )}
        </PageLayout.Filters>
      }
    >
      {renderViolationsTable()}

      {violations.length > 0 && (
        <div className="pagination">
          <div className="pagination-controls">
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
          <div className="pagination-size-selector">
            <label>Rows per page:</label>
            <select 
              value={filters.limit} 
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="pagination-size-select"
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
    </PageLayout>
  );
};

export default ErrorReview;
