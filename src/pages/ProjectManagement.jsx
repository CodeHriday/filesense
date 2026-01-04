import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEdit2, FiTrash2, FiFolderPlus, FiChevronRight, FiChevronDown, FiFolder, FiRefreshCw, FiSearch } from 'react-icons/fi';
import ConfirmModal from '../components/ConfirmModal';
import SubProjectManagement from '../components/SubProjectManagement';
import EditSubProjectModal from '../components/EditSubProjectModal';
import '../styles/global-page-styles.css';

const API_BASE_URL = '/api';

function ProjectManagement() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent_id: null,
    project_type: 'internal',
    member_ids: [],
    group_ids: [],
    sub_projects: [],
    drop_location_connection_id: '',
    drop_location_bucket: '',
    drop_location_prefix: ''
  });

  const [storageConnections, setStorageConnections] = useState([]);

  const [memberFormData, setMemberFormData] = useState({
    user_id: ''
  });

  const [groupFormData, setGroupFormData] = useState({
    group_id: ''
  });

  const [subProjectFormData, setSubProjectFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });

  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    action: null,
    title: '',
    message: '',
    data: null
  });

  // Modal-specific validation errors (displayed inside modal, not background)
  const [modalErrors, setModalErrors] = useState({
    name: '',
    general: ''
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [showEditSubProjectModal, setShowEditSubProjectModal] = useState(false);
  const [selectedSubProject, setSelectedSubProject] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(null);

  const fetchInitData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (showArchived) params.append('archived', 'true');

      const [projectsResponse, connectionsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/projects/init-data?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/storage-connections`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] }))
      ]);
      
      setProjects(projectsResponse.data.projects || []);
      setAvailableUsers(projectsResponse.data.users || []);
      setAvailableGroups(projectsResponse.data.groups || []);
      setStorageConnections(connectionsResponse.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch projects');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, showArchived]);

  useEffect(() => {
    fetchInitData();
  }, [fetchInitData]);

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

  const fetchProjectDetails = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedProject(response.data);
    } catch (err) {
      setError('Failed to fetch project details');
      console.error(err);
    }
  };

  // Validate project name: only letters, numbers, hyphens, and underscores
  const validateProjectName = (name) => {
    if (!name || name.trim() === '') {
      return 'Project name is required';
    }
    // Allow letters, numbers, hyphens, underscores, and spaces
    const validPattern = /^[a-zA-Z0-9\-_\s]+$/;
    if (!validPattern.test(name)) {
      return 'Project name can only contain letters, numbers, hyphens (-), underscores (_), and spaces';
    }
    return '';
  };

  // Handle project name change with validation
  const handleProjectNameChange = (e) => {
    const value = e.target.value;
    // Sanitize input: only allow valid characters
    const sanitized = value.replace(/[^a-zA-Z0-9\-_\s]/g, '');
    setFormData({ ...formData, name: sanitized });
    
    // Clear error when user starts typing valid characters
    if (modalErrors.name && validateProjectName(sanitized) === '') {
      setModalErrors(prev => ({ ...prev, name: '' }));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    // Validate project name
    const nameError = validateProjectName(formData.name);
    if (nameError) {
      setModalErrors(prev => ({ ...prev, name: nameError, general: '' }));
      return;
    }
    
    setIsCreating(true);
    setModalErrors({ name: '', general: '' });
    
    try {
      const token = localStorage.getItem('token');
      const array = new Uint8Array(5);
      crypto.getRandomValues(array);
      const idempotencyKey = `${Date.now()}-${Array.from(array, byte => byte.toString(36)).join('')}`;
      
      await axios.post(`${API_BASE_URL}/projects`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey
        }
      });
      
      // Refresh project list before closing modal
      await fetchProjects();
      handleCloseCreateModal();
    } catch (err) {
      // Show errors inside the modal instead of background
      if (err.response?.status === 429) {
        setModalErrors(prev => ({ ...prev, general: err.response.data.message || 'Rate limit exceeded. Please try again later.' }));
      } else if (err.response?.status === 409) {
        setModalErrors(prev => ({ ...prev, name: 'A project with this name already exists.' }));
      } else {
        setModalErrors(prev => ({ ...prev, general: err.response?.data?.message || 'Failed to create project' }));
      }
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    // Validate project name
    const nameError = validateProjectName(formData.name);
    if (nameError) {
      setModalErrors(prev => ({ ...prev, name: nameError, general: '' }));
      return;
    }
    
    setIsCreating(true);
    setModalErrors({ name: '', general: '' });
    
    try {
      const token = localStorage.getItem('token');
      const projectId = selectedProject.id;
      await axios.put(`${API_BASE_URL}/projects/${projectId}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh project list before closing modal
      await fetchProjects();
      handleCloseEditModal();
    } catch (err) {
      // Show errors inside the modal instead of background
      if (err.response?.status === 409) {
        setModalErrors(prev => ({ ...prev, name: 'A project with this name already exists.' }));
      } else {
        setModalErrors(prev => ({ ...prev, general: err.response?.data?.message || 'Failed to update project' }));
      }
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const executeDeleteProject = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh project list after deletion
      await fetchProjects();
      setSelectedProject(null);
    } catch (err) {
      if (err.response?.data?.error) {
        alert(err.response.data.error);
      } else {
        setError('Failed to delete project');
      }
      console.error(err);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/projects/${selectedProject.id}/members`,
        memberFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMemberFormData({ user_id: '' });
      fetchProjectDetails(selectedProject.id);
      fetchProjects(); // Refresh the projects list to update member count
    } catch (err) {
      setError('Failed to add member');
      console.error(err);
    }
  };

  const executeRemoveMember = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_BASE_URL}/projects/${selectedProject.id}/members/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchProjectDetails(selectedProject.id);
      fetchProjects(); // Refresh the projects list to update member count
    } catch (err) {
      setError('Failed to remove member');
      console.error(err);
    }
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/projects/${selectedProject.id}/groups`,
        groupFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGroupFormData({ group_id: '' });
      fetchProjectDetails(selectedProject.id);
      fetchProjects(); // Refresh the projects list
    } catch (err) {
      setError('Failed to add access group');
      console.error(err);
    }
  };

  const executeRemoveGroup = async (groupId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_BASE_URL}/projects/${selectedProject.id}/groups/${groupId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchProjectDetails(selectedProject.id);
      fetchProjects(); // Refresh the projects list
    } catch (err) {
      setError('Failed to remove access group');
      console.error(err);
    }
  };

  const openEditModal = async (project) => {
    await fetchProjectDetails(project.id);
    setFormData({
      name: project.name,
      description: project.description || '',
      parent_id: project.parent_id,
      project_type: project.project_type || 'internal',
      is_active: project.is_active !== false, // default to true if undefined
      drop_location_connection_id: project.drop_location_connection_id || '',
      drop_location_bucket: project.drop_location_bucket || '',
      drop_location_prefix: project.drop_location_prefix || ''
    });
    setShowEditModal(true);
  };

  const handleAddSubProject = () => {
    if (!subProjectFormData.name.trim()) {
      alert('Sub-project name is required');
      return;
    }
    setFormData({
      ...formData,
      sub_projects: [...formData.sub_projects, { ...subProjectFormData, temp_id: Date.now() }]
    });
    setSubProjectFormData({ name: '', description: '', is_active: true });
  };

  const handleRemoveSubProject = (tempId) => {
    setFormData({
      ...formData,
      sub_projects: formData.sub_projects.filter(sp => sp.temp_id !== tempId)
    });
  };

  const handleCloseCreateModal = () => {
    setFormData({ 
      name: '', 
      description: '', 
      parent_id: null, 
      project_type: 'internal', 
      member_ids: [], 
      group_ids: [],
      sub_projects: [],
      drop_location_connection_id: '',
      drop_location_bucket: '',
      drop_location_prefix: ''
    });
    setSubProjectFormData({ name: '', description: '', is_active: true });
    setModalErrors({ name: '', general: '' });
    setShowCreateModal(false);
  };

  const handleCloseEditModal = () => {
    setFormData({ 
      name: '', 
      description: '', 
      parent_id: null, 
      project_type: 'internal', 
      member_ids: [], 
      group_ids: [],
      sub_projects: [],
      drop_location_connection_id: '',
      drop_location_bucket: '',
      drop_location_prefix: ''
    });
    setMemberFormData({ user_id: '' });
    setGroupFormData({ group_id: '' });
    setSelectedProject(null);
    setModalErrors({ name: '', general: '' });
    setShowEditModal(false);
  };

  const openDeleteProjectConfirm = (project) => {
    setConfirmModal({
      isOpen: true,
      action: 'deleteProject',
      title: 'Delete Project',
      message: `Are you sure you want to delete "${project.name}"? This cannot be undone.`,
      data: { projectId: project.id }
    });
  };

  const openRemoveMemberConfirm = (userId, userName) => {
    setConfirmModal({
      isOpen: true,
      action: 'removeMember',
      title: 'Remove Member',
      message: `Remove ${userName} from the project?`,
      data: { userId }
    });
  };

  const openRemoveGroupConfirm = (groupId, groupName) => {
    setConfirmModal({
      isOpen: true,
      action: 'removeGroup',
      title: 'Remove Access Group',
      message: `Remove ${groupName} from the project?`,
      data: { groupId }
    });
  };

  const handleConfirmAction = async () => {
    const { action, data } = confirmModal;
    
    if (action === 'deleteProject') {
      await executeDeleteProject(data.projectId);
    } else if (action === 'removeMember') {
      await executeRemoveMember(data.userId);
    } else if (action === 'removeGroup') {
      await executeRemoveGroup(data.groupId);
    }
    
    setConfirmModal({ isOpen: false, action: null, title: '', message: '', data: null });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ isOpen: false, action: null, title: '', message: '', data: null });
  };

  const toggleProjectExpansion = (projectId) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const openEditSubProjectModal = (projectId, subProject, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setCurrentProjectId(projectId);
    setSelectedSubProject(subProject);
    setShowEditSubProjectModal(true);
  };

  const closeEditSubProjectModal = () => {
    setShowEditSubProjectModal(false);
    setSelectedSubProject(null);
    setCurrentProjectId(null);
  };

  const handleSubProjectUpdate = async () => {
    await fetchProjects();
  };

  const handleDeleteSubProject = async (projectId, subProject, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    if (!confirm(`Are you sure you want to delete the sub-project "${subProject.name}"?\n\nThis action cannot be undone. The sub-project must not contain any files.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/projects/${projectId}/sub-projects/${subProject.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchProjects();
    } catch (err) {
      if (err.response?.data?.message) {
        alert(err.response.data.message);
      } else {
        setError('Failed to delete sub-project');
      }
      console.error(err);
    }
  };

  const totalPages = Math.ceil(projects.length / pageSize);
  const displayedProjects = projects.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Project Management</h1>
          <p className="gps-page-subtitle">Manage projects and access control</p>
        </div>
        <div className="gps-header-actions">
          <button 
            className="gps-btn gps-btn--secondary" 
            onClick={fetchProjects}
            disabled={loading}
            title="Refresh project list"
          >
            <FiRefreshCw size={16} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
          <button className="gps-btn gps-btn--primary" onClick={() => setShowCreateModal(true)}>
            + Create Project
          </button>
        </div>
      </div>

      <div className="gps-filters">
        <div className="gps-search-container">
          <FiSearch className="gps-search-icon" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="gps-search-input"
          />
        </div>
        <label className="gps-checkbox-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show Archived
        </label>
      </div>

      {error && <div className="gps-alert gps-alert--error">{error}</div>}

      {loading ? (
        <div className="gps-loading">Loading projects...</div>
      ) : (
        <div className="gps-table-container">
          <table className="gps-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Project Type</th>
                <th>Description</th>
                <th>Members</th>
                <th>Access Groups</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedProjects.map((project) => (
                <React.Fragment key={project.id}>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {project.sub_project_count > 0 && (
                          <button
                            onClick={() => toggleProjectExpansion(project.id)}
                            className="gps-icon-btn"
                            style={{ padding: '0.15rem' }}
                            aria-label={expandedProjects.has(project.id) ? 'Collapse sub-projects' : 'Expand sub-projects'}
                          >
                            {expandedProjects.has(project.id) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                          </button>
                        )}
                        <Link 
                          to={`/file-catalog?project=${project.id}`}
                          className="gps-link"
                        >
                          {project.name}
                        </Link>
                        {project.is_default && <span className="gps-badge gps-badge--secondary">DEFAULT</span>}
                        {project.sub_project_count > 0 && (
                          <span className="gps-badge gps-badge--info">{project.sub_project_count} sub</span>
                        )}
                      </div>
                    </td>
                  <td>
                    <span className={`gps-badge ${project.project_type === 'external' ? 'gps-badge--external' : 'gps-badge--internal'}`}>
                      {project.project_type === 'external' ? 'External' : 'Internal'}
                    </span>
                  </td>
                  <td>{project.description || '-'}</td>
                  <td>
                    <span className="gps-badge gps-badge--info">
                      {project.member_count !== undefined ? `${project.member_count} member${project.member_count !== 1 ? 's' : ''}` : '-'}
                    </span>
                  </td>
                  <td>
                    <span className="gps-badge gps-badge--info">
                      {project.group_count !== undefined ? `${project.group_count} group${project.group_count !== 1 ? 's' : ''}` : '-'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {project.is_active === false ? (
                        <span className="gps-badge gps-badge--archived">Inactive</span>
                      ) : (
                        <span className="gps-badge gps-badge--active">Active</span>
                      )}
                      {project.is_archived && (
                        <span className="gps-badge gps-badge--warning">Archived</span>
                      )}
                    </div>
                  </td>
                  <td>{new Date(project.created_at).toLocaleString()}</td>
                  <td>
                    <div className="gps-action-buttons">
                      <button 
                        className="gps-icon-btn gps-icon-btn--success" 
                        onClick={() => navigate(`/upload?project_id=${project.id}`)}
                        title="Add File to Project"
                        aria-label={`Add file to project ${project.name}`}
                      >
                        <FiFolderPlus aria-hidden="true" />
                      </button>
                      <button 
                        className="gps-icon-btn gps-icon-btn--edit" 
                        onClick={() => openEditModal(project)}
                        title="Edit Project"
                        aria-label={`Edit project ${project.name}`}
                      >
                        <FiEdit2 aria-hidden="true" />
                      </button>
                      {!project.is_default && (
                        <button 
                          className="gps-icon-btn gps-icon-btn--delete" 
                          onClick={() => openDeleteProjectConfirm(project)}
                          title="Delete Project"
                          aria-label={`Delete project ${project.name}`}
                        >
                          <FiTrash2 aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedProjects.has(project.id) && project.sub_projects && project.sub_projects.length > 0 && (
                  <tr>
                    <td colSpan="8" style={{ padding: 0, backgroundColor: '#f9fafb' }}>
                      <div style={{ padding: '0.5rem 1rem' }}>
                        <table className="gps-table" style={{ marginBottom: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ paddingLeft: '2rem' }}>Sub-Project Name</th>
                              <th>Files</th>
                              <th>Size</th>
                              <th>Status</th>
                              <th>Owner</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {project.sub_projects.map((subProject) => (
                              <tr key={subProject.id}>
                                <td style={{ paddingLeft: '2rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FiFolder size={14} style={{ color: '#6b7280' }} />
                                    <Link 
                                      to={`/file-catalog?project=${project.id}&sub_project=${subProject.id}`}
                                      className="gps-link"
                                    >
                                      {subProject.name}
                                    </Link>
                                  </div>
                                </td>
                                <td>{subProject.file_count || 0}</td>
                                <td>{formatBytes(subProject.total_size || 0)}</td>
                                <td>
                                  <span className={`gps-badge ${subProject.is_active ? 'gps-badge--active' : 'gps-badge--archived'}`}>
                                    {subProject.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>{subProject.owner_name || '-'}</td>
                                <td>
                                  <div className="gps-action-buttons">
                                    <button 
                                      className="gps-icon-btn gps-icon-btn--success" 
                                      onClick={() => navigate(`/upload?project_id=${project.id}&sub_project_id=${subProject.id}`)}
                                      title="Add File to Sub-Project"
                                    >
                                      <FiFolderPlus size={14} />
                                    </button>
                                    <button 
                                      className="gps-icon-btn gps-icon-btn--edit" 
                                      onClick={(e) => openEditSubProjectModal(project.id, subProject, e)}
                                      title="Edit Sub-Project"
                                    >
                                      <FiEdit2 size={14} />
                                    </button>
                                    <button 
                                      className="gps-icon-btn gps-icon-btn--delete" 
                                      onClick={(e) => handleDeleteSubProject(project.id, subProject, e)}
                                      title="Delete Sub-Project"
                                    >
                                      <FiTrash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {projects.length > 0 && (
            <div className="gps-pagination">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="gps-btn gps-btn--secondary"
              >
                Previous
              </button>
              
              <span className="gps-pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="gps-btn gps-btn--secondary"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>

      {showCreateModal && (
        <div className="gps-modal-overlay">
          <div className="gps-modal gps-modal--large">
            <div className="gps-modal-header">
              <h2>Create New Project</h2>
              <button className="gps-modal-close" onClick={handleCloseCreateModal}>×</button>
            </div>
            <div className="gps-modal-body">
              <form onSubmit={handleCreate}>
                {modalErrors.general && (
                  <div className="gps-alert gps-alert--error" style={{ marginBottom: '1rem' }}>
                    {modalErrors.general}
                  </div>
                )}
                <div className="gps-form-grid gps-form-grid--2col">
                  <div className="gps-form-group">
                    <label htmlFor="create-project-name" className="gps-form-label">Project Name *</label>
                    <input
                      id="create-project-name"
                      type="text"
                      className={`gps-form-input ${modalErrors.name ? 'gps-form-input--error' : ''}`}
                      value={formData.name}
                      onChange={handleProjectNameChange}
                      required
                    />
                    {modalErrors.name && (
                      <span className="gps-form-error">{modalErrors.name}</span>
                    )}
                  </div>
                  <div className="gps-form-group">
                    <label htmlFor="create-project-type" className="gps-form-label">Project Type *</label>
                    <select
                      id="create-project-type"
                      className="gps-form-select"
                      value={formData.project_type}
                      onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                      required
                    >
                      <option value="internal">Internal</option>
                      <option value="external">External</option>
                    </select>
                  </div>
                </div>
                <div className="gps-form-group">
                  <label htmlFor="create-project-description" className="gps-form-label">Description</label>
                  <textarea
                    id="create-project-description"
                    className="gps-form-input"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="3"
                  />
                </div>
                <div className="gps-form-grid gps-form-grid--2col">
                  <div className="gps-form-group">
                    <label htmlFor="create-member-ids" className="gps-form-label">Add Members</label>
                    <select
                      id="create-member-ids"
                      className="gps-form-select"
                      multiple
                      value={formData.member_ids}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                        setFormData({ ...formData, member_ids: selected });
                      }}
                      style={{ minHeight: '100px' }}
                    >
                      {availableUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || user.username} ({user.email})
                        </option>
                      ))}
                    </select>
                    <span className="gps-form-hint">Hold Ctrl/Cmd to select multiple users</span>
                  </div>
                  <div className="gps-form-group">
                    <label htmlFor="create-group-ids" className="gps-form-label">Add Access Groups</label>
                    <select
                      id="create-group-ids"
                      className="gps-form-select"
                      multiple
                      value={formData.group_ids}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                        setFormData({ ...formData, group_ids: selected });
                      }}
                      style={{ minHeight: '100px' }}
                    >
                      {availableGroups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <span className="gps-form-hint">Hold Ctrl/Cmd to select multiple groups</span>
                  </div>
                </div>

                <hr className="gps-divider" />

                <div className="gps-section">
                  <div className="gps-section-header">
                    <h3 className="gps-section-title">File Drop Location (S3)</h3>
                  </div>
                  <p className="gps-form-hint" style={{ marginBottom: '12px' }}>
                    Configure where files uploaded to this project will be stored. Required for internal projects.
                  </p>
                  <div className="gps-form-grid gps-form-grid--3col">
                    <div className="gps-form-group">
                      <label htmlFor="create-drop-connection" className="gps-form-label">Storage Connection</label>
                      <select
                        id="create-drop-connection"
                        className="gps-form-select"
                        value={formData.drop_location_connection_id}
                        onChange={(e) => setFormData({ ...formData, drop_location_connection_id: e.target.value })}
                      >
                        <option value="">-- Select Connection --</option>
                        {storageConnections.map(conn => (
                          <option key={conn.connection_id} value={conn.connection_id}>
                            {conn.name} ({conn.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="gps-form-group">
                      <label htmlFor="create-drop-bucket" className="gps-form-label">Bucket Name</label>
                      <input
                        id="create-drop-bucket"
                        type="text"
                        className="gps-form-input"
                        placeholder="e.g., my-data-bucket"
                        value={formData.drop_location_bucket}
                        onChange={(e) => setFormData({ ...formData, drop_location_bucket: e.target.value })}
                      />
                    </div>
                    <div className="gps-form-group">
                      <label htmlFor="create-drop-prefix" className="gps-form-label">Folder Prefix</label>
                      <input
                        id="create-drop-prefix"
                        type="text"
                        className="gps-form-input"
                        placeholder="e.g., uploads/project-name/"
                        value={formData.drop_location_prefix}
                        onChange={(e) => setFormData({ ...formData, drop_location_prefix: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <hr className="gps-divider" />

                <div className="gps-section">
                  <div className="gps-section-header">
                    <h3 className="gps-section-title">Sub-Projects</h3>
                    <button type="button" className="gps-btn gps-btn--primary gps-btn--small" onClick={handleAddSubProject}>
                      <FiFolderPlus style={{ marginRight: '0.25rem' }} /> Add Sub-Project
                    </button>
                  </div>

                  <div className="gps-form-grid gps-form-grid--3col" style={{ marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      className="gps-form-input"
                      placeholder="Sub-project name"
                      value={subProjectFormData.name}
                      onChange={(e) => setSubProjectFormData({ ...subProjectFormData, name: e.target.value })}
                    />
                    <input
                      type="text"
                      className="gps-form-input"
                      placeholder="Description (optional)"
                      value={subProjectFormData.description}
                      onChange={(e) => setSubProjectFormData({ ...subProjectFormData, description: e.target.value })}
                    />
                    <label className="gps-checkbox-label">
                      <input
                        type="checkbox"
                        checked={subProjectFormData.is_active}
                        onChange={(e) => setSubProjectFormData({ ...subProjectFormData, is_active: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>

                  {formData.sub_projects.length > 0 && (
                    <table className="gps-table gps-table--compact">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Description</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.sub_projects.map((sp) => (
                          <tr key={sp.temp_id}>
                            <td>{sp.name}</td>
                            <td style={{ color: '#666' }}>{sp.description || '-'}</td>
                            <td>
                              <span className={`gps-badge ${sp.is_active ? 'gps-badge--active' : 'gps-badge--archived'}`}>
                                {sp.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="gps-btn gps-btn--danger gps-btn--small"
                                onClick={() => handleRemoveSubProject(sp.temp_id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {formData.sub_projects.length === 0 && (
                    <p className="gps-empty-message">
                      No sub-projects added yet
                    </p>
                  )}
                </div>
              </form>
            </div>
            <div className="gps-modal-footer">
              <button type="button" className="gps-btn gps-btn--secondary" onClick={handleCloseCreateModal} disabled={isCreating}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="gps-btn gps-btn--primary" 
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedProject && (
        <div className="gps-modal-overlay">
          <div className="gps-modal gps-modal--large">
            <div className="gps-modal-header">
              <h2>Edit Project - {selectedProject.name}</h2>
              <button className="gps-modal-close" onClick={handleCloseEditModal}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-modal-sections">
                <form onSubmit={handleUpdate}>
                  {modalErrors.general && (
                    <div className="gps-alert gps-alert--error" style={{ marginBottom: '1rem' }}>
                      {modalErrors.general}
                    </div>
                  )}
                  <h3 className="gps-section-title">Project Details</h3>
                  <div className="gps-form-grid gps-form-grid--2col">
                    <div className="gps-form-group">
                      <label htmlFor="edit-project-name" className="gps-form-label">Project Name *</label>
                      <input
                        id="edit-project-name"
                        type="text"
                        className={`gps-form-input ${modalErrors.name ? 'gps-form-input--error' : ''}`}
                        value={formData.name}
                        onChange={handleProjectNameChange}
                        required
                      />
                      {modalErrors.name && (
                        <span className="gps-form-error">{modalErrors.name}</span>
                      )}
                    </div>
                    <div className="gps-form-group">
                      <label htmlFor="edit-project-type" className="gps-form-label">Project Type *</label>
                      <select
                        id="edit-project-type"
                        className="gps-form-select"
                        value={formData.project_type}
                        onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                        required
                      >
                        <option value="internal">Internal</option>
                        <option value="external">External</option>
                      </select>
                    </div>
                  </div>
                  <div className="gps-form-group">
                    <label htmlFor="edit-project-description" className="gps-form-label">Description</label>
                    <textarea
                      id="edit-project-description"
                      className="gps-form-input"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows="3"
                    />
                  </div>

                  <div className="gps-form-group" style={{ marginTop: '1rem' }}>
                    <label className="gps-form-label">Project Status</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <label className="gps-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.is_active !== false}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          style={{ width: '1.25rem', height: '1.25rem' }}
                        />
                        <span style={{ fontWeight: formData.is_active !== false ? 600 : 400, color: formData.is_active !== false ? '#059669' : '#6b7280' }}>
                          {formData.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </label>
                    </div>
                    {formData.is_active === false && (
                      <div className="gps-alert gps-alert--warning" style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem' }}>
                        Inactive projects cannot receive new file uploads or run jobs. Existing data remains accessible.
                      </div>
                    )}
                  </div>

                  <h4 className="gps-section-title" style={{ marginTop: '16px', marginBottom: '8px' }}>File Drop Location (S3)</h4>
                  <p className="gps-form-hint" style={{ marginBottom: '12px' }}>
                    Configure where files uploaded to this project will be stored.
                  </p>
                  <div className="gps-form-grid gps-form-grid--3col">
                    <div className="gps-form-group">
                      <label htmlFor="edit-drop-connection" className="gps-form-label">Storage Connection</label>
                      <select
                        id="edit-drop-connection"
                        className="gps-form-select"
                        value={formData.drop_location_connection_id}
                        onChange={(e) => setFormData({ ...formData, drop_location_connection_id: e.target.value })}
                      >
                        <option value="">-- Select Connection --</option>
                        {storageConnections.map(conn => (
                          <option key={conn.connection_id} value={conn.connection_id}>
                            {conn.name} ({conn.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="gps-form-group">
                      <label htmlFor="edit-drop-bucket" className="gps-form-label">Bucket Name</label>
                      <input
                        id="edit-drop-bucket"
                        type="text"
                        className="gps-form-input"
                        placeholder="e.g., my-data-bucket"
                        value={formData.drop_location_bucket}
                        onChange={(e) => setFormData({ ...formData, drop_location_bucket: e.target.value })}
                      />
                    </div>
                    <div className="gps-form-group">
                      <label htmlFor="edit-drop-prefix" className="gps-form-label">Folder Prefix</label>
                      <input
                        id="edit-drop-prefix"
                        type="text"
                        className="gps-form-input"
                        placeholder="e.g., uploads/project-name/"
                        value={formData.drop_location_prefix}
                        onChange={(e) => setFormData({ ...formData, drop_location_prefix: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem' }}>
                    <button type="submit" className="gps-btn gps-btn--primary">Update Details</button>
                  </div>
                </form>

              <hr className="gps-divider" />

              <div className="gps-section">
                <h3 className="gps-section-title">Members</h3>
                <p className="gps-form-hint" style={{ marginBottom: '0.75rem' }}>Add users to grant them access to this project's resources. Their permissions are determined by their global role.</p>
                <form onSubmit={handleAddMember}>
                  <div className="gps-form-row">
                    <select
                      className="gps-form-select"
                      value={memberFormData.user_id}
                      onChange={(e) => setMemberFormData({ ...memberFormData, user_id: e.target.value })}
                      required
                      style={{ flex: 1 }}
                    >
                      <option value="">Select User</option>
                      {availableUsers
                        .filter(user => !selectedProject.members?.some(member => member.user_id === user.id))
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.username} ({user.email})
                          </option>
                        ))}
                    </select>
                    <button type="submit" className="gps-btn gps-btn--primary gps-btn--small">Add Member</button>
                  </div>
                </form>

                <div className="gps-scrollable-list">
                  <table className="gps-table gps-table--compact">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Global Role</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const groupedMembers = selectedProject.members?.reduce((acc, member) => {
                          const existing = acc.find(m => m.user_id === member.user_id);
                          if (existing) {
                            existing.roles.push(member.role_name || member.role);
                          } else {
                            acc.push({
                              user_id: member.user_id,
                              username: member.username,
                              full_name: member.full_name,
                              roles: [member.role_name || member.role]
                            });
                          }
                          return acc;
                        }, []);

                        return groupedMembers?.map((member) => (
                          <tr key={member.user_id}>
                            <td>{member.full_name || member.username}</td>
                            <td>
                              {member.roles.map((role, idx) => (
                                <span key={idx} className="gps-badge gps-badge--info" style={{ marginRight: '0.25rem' }}>
                                  {role}
                                </span>
                              ))}
                            </td>
                            <td>
                              <button
                                className="gps-btn gps-btn--danger gps-btn--small"
                                onClick={() => openRemoveMemberConfirm(member.user_id, member.full_name || member.username)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ));
                      })()}
                      {(!selectedProject.members || selectedProject.members.length === 0) && (
                        <tr><td colSpan="3" className="gps-empty-cell">No members yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr className="gps-divider" />

              <div className="gps-section">
                <h3 className="gps-section-title">Access Groups</h3>
                <form onSubmit={handleAddGroup}>
                  <div className="gps-form-row">
                    <select
                      className="gps-form-select"
                      value={groupFormData.group_id}
                      onChange={(e) => setGroupFormData({ ...groupFormData, group_id: e.target.value })}
                      required
                      style={{ flex: 1 }}
                    >
                      <option value="">Select Access Group</option>
                      {availableGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="gps-btn gps-btn--primary gps-btn--small">Add Group</button>
                  </div>
                </form>

                <div className="gps-scrollable-list">
                  <table className="gps-table gps-table--compact">
                    <thead>
                      <tr>
                        <th>Group Name</th>
                        <th>Type</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProject.access_groups?.map((group) => (
                        <tr key={group.group_id}>
                          <td>{group.group_name}</td>
                          <td><span className="gps-badge gps-badge--info">{group.group_type}</span></td>
                          <td>
                            <button
                              className="gps-btn gps-btn--danger gps-btn--small"
                              onClick={() => openRemoveGroupConfirm(group.group_id, group.group_name)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!selectedProject.access_groups || selectedProject.access_groups.length === 0) && (
                        <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No access groups yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr className="gps-divider" />

              <div className="gps-section">
                <SubProjectManagement 
                  projectId={selectedProject.id} 
                  projectName={selectedProject.name} 
                />
              </div>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button type="button" className="gps-btn gps-btn--secondary" onClick={handleCloseEditModal}>
                Close
              </button>
              <button type="button" className="gps-btn gps-btn--primary" onClick={handleUpdate}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        onConfirm={handleConfirmAction}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirm"
        cancelText="Cancel"
        variant="danger"
      />

      <EditSubProjectModal
        show={showEditSubProjectModal}
        onClose={closeEditSubProjectModal}
        projectId={currentProjectId}
        subProject={selectedSubProject}
        onUpdate={handleSubProjectUpdate}
      />
    </>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default ProjectManagement;
