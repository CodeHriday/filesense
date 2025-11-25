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
      <div className="page-header">
        <h1>Projects</h1>
        <p>View projects and upload files</p>
      </div>

      {error && (
        <div className="error-message" role="alert">{error}</div>
      )}

      <div className="filters-section" style={{ marginBottom: '1.5rem' }}>
        <div className="search-bar" style={{ position: 'relative', width: '300px' }}>
          <FiSearch style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        <div className="filter-options">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
        <div className="table-container">
          <table className="data-table">
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
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
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
                            onClick={() => toggleProjectExpansion(project.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              display: 'flex',
                              alignItems: 'center',
                              color: '#666'
                            }}
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
                        <span className={`badge badge-${project.project_type === 'internal' ? 'success' : 'info'}`}>
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
                            className="btn-icon" 
                            onClick={() => navigate(`/upload?project_id=${project.id}`)}
                            title="Add File to Project"
                            aria-label={`Add file to project ${project.name}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#28a745' }}
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
                          style={{ backgroundColor: '#f9fafb' }}
                        >
                          <td></td>
                          <td>{subProject.id}</td>
                          <td style={{ paddingLeft: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ color: '#9ca3af' }}>→</span>
                              {subProject.name}
                            </div>
                          </td>
                          <td>{subProject.description || '-'}</td>
                          <td>
                            <span className={`badge badge-${subProject.project_type === 'internal' ? 'success' : 'info'}`}>
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
                                className="btn-icon" 
                                onClick={() => navigate(`/upload?project_id=${project.id}&sub_project_id=${subProject.id}`)}
                                title="Add File to Sub-Project"
                                aria-label={`Add file to sub-project ${subProject.name}`}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#28a745' }}
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
