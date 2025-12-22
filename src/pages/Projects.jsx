import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiFilePlus, FiSearch, FiChevronRight, FiChevronDown } from 'react-icons/fi';
import Pagination from '../components/Pagination';

const API_BASE_URL = '/api';

function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  // Debounce search term (2.5 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 2500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchProjects();
  }, [debouncedSearchTerm, showArchived]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, showArchived]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
      if (showArchived) params.append('archived', 'true');

      const response = await axios.get(`${API_BASE_URL}/projects?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch projects');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Server-side search already applied, client-side pagination on results
  const totalItems = projects.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedProjects = projects.slice(startIndex, endIndex);

  const toggleProjectExpansion = (projectId) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value));
    setCurrentPage(1);
  };

  const pageSizeStyles = {
    wrapper: {
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginBottom: '8px',
    },
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    label: {
      fontFamily: "'Inter', sans-serif",
      fontSize: '11px',
      color: '#6b7280',
      fontWeight: '500',
    },
    select: {
      fontFamily: "'Inter', sans-serif",
      fontSize: '11px',
      padding: '6px 28px 6px 10px',
      border: '1px solid #cbd5e0',
      borderRadius: '6px',
      backgroundColor: '#ffffff',
      color: '#1a202c',
      cursor: 'pointer',
      appearance: 'none',
      WebkitAppearance: 'none',
    },
  };

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Projects</h1>
          <p className="gps-page-subtitle">View projects and upload files</p>
        </div>
      </div>

      {error && (
        <div className="gps-alert gps-alert--error" role="alert">{error}</div>
      )}

      <div className="gps-filters">
        <div className="gps-search-container">
          <FiSearch className="gps-search-icon" />
          <input
            type="text"
            className="gps-search-input"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <label className="gps-filter-checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show Archived
        </label>
      </div>

      {loading ? (
        <div className="gps-loading">Loading projects...</div>
      ) : (
        <div className="gps-table-container">
          <table className="gps-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Id</th>
                <th>Name</th>
                <th>Description</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProjects.length === 0 ? (
                <tr>
                  <td colSpan="8" className="gps-table-empty">
                    No projects found
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((project) => (
                  <React.Fragment key={project.id}>
                    <tr>
                      <td>
                        {project.sub_projects && project.sub_projects.length > 0 && (
                          <button
                            className="gps-expand-btn"
                            onClick={() => toggleProjectExpansion(project.id)}
                            title={expandedProjects.has(project.id) ? 'Collapse sub-projects' : 'Expand sub-projects'}
                            aria-label={expandedProjects.has(project.id) ? 'Collapse sub-projects' : 'Expand sub-projects'}
                          >
                            {expandedProjects.has(project.id) ? (
                              <FiChevronDown size={16} />
                            ) : (
                              <FiChevronRight size={16} />
                            )}
                          </button>
                        )}
                      </td>
                      <td>{project.id}</td>
                      <td>{project.name}</td>
                      <td>{project.description || '-'}</td>
                      <td>
                        <span className={`gps-badge gps-badge--${project.project_type === 'internal' ? 'internal' : 'external'}`}>
                          {project.project_type === 'internal' ? 'Internal' : 'External'}
                        </span>
                      </td>
                      <td>
                        {project.is_archived ? (
                          <span className="gps-badge gps-badge--archived">Archived</span>
                        ) : (
                          <span className="gps-badge gps-badge--active">Active</span>
                        )}
                      </td>
                      <td>{new Date(project.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="gps-action-buttons">
                          <button 
                            className="gps-action-btn"
                            onClick={() => navigate(`/upload?project_id=${project.id}`)}
                            title="Add File to Project"
                            aria-label={`Add file to project ${project.name}`}
                          >
                            <FiFilePlus size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedProjects.has(project.id) && project.sub_projects && project.sub_projects.length > 0 && (
                      project.sub_projects.map((subProject) => (
                        <tr 
                          key={`sub-${subProject.id}`}
                          className="gps-subrow"
                        >
                          <td></td>
                          <td>{subProject.id}</td>
                          <td style={{ paddingLeft: '2rem' }}>
                            <div className="gps-flex-center gps-gap-1">
                              <span className="gps-text-muted">→</span>
                              {subProject.name}
                            </div>
                          </td>
                          <td>{subProject.description || '-'}</td>
                          <td>
                            <span className={`gps-badge gps-badge--${subProject.project_type === 'internal' ? 'internal' : 'external'}`}>
                              {subProject.project_type === 'internal' ? 'Internal' : 'External'}
                            </span>
                          </td>
                          <td>
                            {subProject.is_archived ? (
                              <span className="gps-badge gps-badge--archived">Archived</span>
                            ) : (
                              <span className="gps-badge gps-badge--active">Active</span>
                            )}
                          </td>
                          <td>{new Date(subProject.created_at).toLocaleDateString()}</td>
                          <td>
                            <div className="gps-action-buttons">
                              <button 
                                className="gps-action-btn"
                                onClick={() => navigate(`/upload?project_id=${project.id}&sub_project_id=${subProject.id}`)}
                                title="Add File to Sub-Project"
                                aria-label={`Add file to sub-project ${subProject.name}`}
                              >
                                <FiFilePlus size={12} aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Page Size Selector */}
      {!loading && projects.length > 0 && (
        <div style={pageSizeStyles.wrapper}>
          <div style={pageSizeStyles.container}>
            <label style={pageSizeStyles.label}>Rows per page:</label>
            <select style={pageSizeStyles.select} value={pageSize} onChange={handlePageSizeChange}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={pageSize}
          totalItems={totalItems}
        />
      )}
    </div>
  );
}

export default Projects;
