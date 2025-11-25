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
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  useEffect(() => {
    fetchProjects();
  }, [searchTerm, showArchived]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showArchived]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
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

  const filteredProjects = projects.filter(project => {
    const term = searchTerm.toLowerCase();
    return (
      (project.name || '').toLowerCase().includes(term) ||
      (project.description || '').toLowerCase().includes(term)
    );
  });

  const totalItems = filteredProjects.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

  const toggleProjectExpansion = (projectId) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">View projects and upload files</p>
        </div>
      </div>

      {error && (
        <div className="page-alert page-alert-error" role="alert">
          {error}
          <button className="page-alert-close" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <div className="page-filters">
        <div className="page-filter-group">
          <FiSearch className="page-filter-icon" />
          <input
            type="text"
            className="page-filter-input"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <label className="page-filter-checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show Archived
        </label>
      </div>

      {loading ? (
        <div className="page-loading">Loading projects...</div>
      ) : (
        <div className="page-table-container">
          <table className="page-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}></th>
                <th>ID</th>
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
                  <td colSpan="8" className="page-table-empty">
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
                            className="expand-toggle"
                            onClick={() => toggleProjectExpansion(project.id)}
                            title={expandedProjects.has(project.id) ? 'Collapse sub-projects' : 'Expand sub-projects'}
                            aria-label={expandedProjects.has(project.id) ? 'Collapse sub-projects' : 'Expand sub-projects'}
                          >
                            {expandedProjects.has(project.id) ? (
                              <FiChevronDown size={18} />
                            ) : (
                              <FiChevronRight size={18} />
                            )}
                          </button>
                        )}
                      </td>
                      <td>{project.id}</td>
                      <td>{project.name}</td>
                      <td>{project.description || '-'}</td>
                      <td>
                        <span className={`badge ${project.project_type === 'internal' ? 'badge-internal' : 'badge-external'}`}>
                          {project.project_type === 'internal' ? 'Internal' : 'External'}
                        </span>
                      </td>
                      <td>
                        {project.is_archived ? (
                          <span className="badge badge-archived">Archived</span>
                        ) : (
                          <span className="badge badge-active">Active</span>
                        )}
                      </td>
                      <td>{new Date(project.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="action-btn action-btn-success" 
                            onClick={() => navigate(`/upload?project_id=${project.id}`)}
                            title="Add File to Project"
                            aria-label={`Add file to project ${project.name}`}
                          >
                            <FiFilePlus size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedProjects.has(project.id) && project.sub_projects && project.sub_projects.length > 0 && (
                      project.sub_projects.map((subProject) => (
                        <tr 
                          key={`sub-${subProject.id}`}
                          className="page-table-subrow"
                        >
                          <td></td>
                          <td>{subProject.id}</td>
                          <td className="page-table-subrow">
                            <div className="flex-center gap-8">
                              <span className="text-muted">→</span>
                              {subProject.name}
                            </div>
                          </td>
                          <td>{subProject.description || '-'}</td>
                          <td>
                            <span className={`badge ${subProject.project_type === 'internal' ? 'badge-internal' : 'badge-external'}`}>
                              {subProject.project_type === 'internal' ? 'Internal' : 'External'}
                            </span>
                          </td>
                          <td>
                            {subProject.is_archived ? (
                              <span className="badge badge-archived">Archived</span>
                            ) : (
                              <span className="badge badge-active">Active</span>
                            )}
                          </td>
                          <td>{new Date(subProject.created_at).toLocaleDateString()}</td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="action-btn action-btn-success" 
                                onClick={() => navigate(`/upload?project_id=${project.id}&sub_project_id=${subProject.id}`)}
                                title="Add File to Sub-Project"
                                aria-label={`Add file to sub-project ${subProject.name}`}
                              >
                                <FiFilePlus size={14} aria-hidden="true" />
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
