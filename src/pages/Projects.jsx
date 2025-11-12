import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiFilePlus, FiSearch, FiChevronRight, FiChevronDown } from 'react-icons/fi';
import Pagination from '../components/Pagination';
import './ProjectManagement.css';

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
    <div className="project-management-container">
      <div className="page-title">
        <div>
          <h1>Projects</h1>
          <p className="page-sub">View projects and upload files</p>
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">{error}</div>
      )}

      <div className="toolbar">
        <div className="search">
          <FiSearch />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="control-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show Archived
          </label>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading projects...</div>
      ) : (
        <div className="card projects-card">
          <table className="table">
            <thead>
              <tr>
                <th className="expand-col"></th>
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
                  <td colSpan="8" className="empty-state">
                    No projects found
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((project) => (
                  <React.Fragment key={project.id}>
                    <tr>
                      <td className="expand">
                        {project.sub_projects && project.sub_projects.length > 0 && (
                          <button
                            onClick={() => toggleProjectExpansion(project.id)}
                            className="expand-toggle-btn"
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
                        <span className={`badge ${project.project_type === 'internal' ? 'badge--primary' : 'badge--secondary'}`}>
                          {project.project_type === 'internal' ? 'Internal' : 'External'}
                        </span>
                      </td>
                      <td>
                        {project.is_archived ? (
                          <span className="badge badge--muted">Archived</span>
                        ) : (
                          <span className="badge badge--success">Active</span>
                        )}
                      </td>
                      <td>{new Date(project.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="action-icon" 
                            onClick={() => navigate(`/upload?project_id=${project.id}`)}
                            title="Add File to Project"
                            aria-label={`Add file to project ${project.name}`}
                          >
                            <FiFilePlus size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedProjects.has(project.id) && project.sub_projects && project.sub_projects.length > 0 && (
                      project.sub_projects.map((subProject) => (
                        <tr 
                          key={`sub-${subProject.id}`}
                          className="sub-project-row"
                        >
                          <td></td>
                          <td>{subProject.id}</td>
                          <td className="sub-project-name">
                            <div className="sub-project-indent">
                              <span className="sub-project-arrow">→</span>
                              {subProject.name}
                            </div>
                          </td>
                          <td>{subProject.description || '-'}</td>
                          <td>
                            <span className={`badge ${subProject.project_type === 'internal' ? 'badge--primary' : 'badge--secondary'}`}>
                              {subProject.project_type === 'internal' ? 'Internal' : 'External'}
                            </span>
                          </td>
                          <td>
                            {subProject.is_archived ? (
                              <span className="badge badge--muted">Archived</span>
                            ) : (
                              <span className="badge badge--success">Active</span>
                            )}
                          </td>
                          <td>{new Date(subProject.created_at).toLocaleDateString()}</td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="action-icon" 
                                onClick={() => navigate(`/upload?project_id=${project.id}&sub_project_id=${subProject.id}`)}
                                title="Add File to Sub-Project"
                                aria-label={`Add file to sub-project ${subProject.name}`}
                              >
                                <FiFilePlus size={16} aria-hidden="true" />
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
