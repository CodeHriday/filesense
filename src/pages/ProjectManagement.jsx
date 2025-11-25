import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { FiEdit2, FiTrash2, FiFolderPlus, FiChevronRight, FiChevronDown, FiFolder, FiRefreshCw } from 'react-icons/fi';
import ConfirmModal from '../components/ConfirmModal';
import SubProjectManagement from '../components/SubProjectManagement';
import EditSubProjectModal from '../components/EditSubProjectModal';
import PageLayout from '../components/PageLayout';
import './ProjectManagement.css';
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
    sub_projects: []
  });

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

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [showEditSubProjectModal, setShowEditSubProjectModal] = useState(false);
  const [selectedSubProject, setSelectedSubProject] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(null);

  const fetchProjects = useCallback(async () => {
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
  }, [searchTerm, showArchived]);

  useEffect(() => {
    fetchProjects();
    fetchAvailableUsers();
    fetchAvailableGroups();
  }, [fetchProjects]);

  const fetchAvailableUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/users?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // API returns users in response.data.users
      const users = response.data.users || response.data || [];
      setAvailableUsers(Array.isArray(users) ? users : []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setAvailableUsers([]);
    }
  };

  const fetchAvailableGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableGroups(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
      setAvailableGroups([]);
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

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
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
      if (err.response?.status === 429) {
        setError(err.response.data.message || 'Rate limit exceeded. Please try again later.');
      } else if (err.response?.status === 409) {
        setError('A project with this name already exists.');
      } else {
        setError(err.response?.data?.message || 'Failed to create project');
      }
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    
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
      setError('Failed to update project');
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
      project_type: project.project_type || 'internal'
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
      sub_projects: []
    });
    setSubProjectFormData({ name: '', description: '', is_active: true });
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
      sub_projects: []
    });
    setMemberFormData({ user_id: '' });
    setGroupFormData({ group_id: '' });
    setSelectedProject(null);
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
    <PageLayout
      title="Project Management"
      headerActions={
        <>
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
        </>
      }
      filters={
        <PageLayout.Filters>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show Archived
          </label>
        </PageLayout.Filters>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading projects...</div>
      ) : (
        <PageLayout.TableWrapper>
          <table className="projects-table page-layout-table">
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
                      <div className="project-name">
                        {project.sub_project_count > 0 && (
                          <button
                            onClick={() => toggleProjectExpansion(project.id)}
                            className="expand-toggle-btn"
                            aria-label={expandedProjects.has(project.id) ? 'Collapse sub-projects' : 'Expand sub-projects'}
                          >
                            {expandedProjects.has(project.id) ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                          </button>
                        )}
                        <Link 
                          to={`/file-catalog?project=${project.id}`}
                          className="project-name-link" 
                          style={{ color: '#4a90e2', textDecoration: 'none' }}
                        >
                          {project.name}
                        </Link>
                        {project.is_default && <span className="badge badge-default">DEFAULT</span>}
                        {project.sub_project_count > 0 && (
                          <span className="sub-project-count-badge">{project.sub_project_count} sub</span>
                        )}
                      </div>
                    </td>
                  <td>
                    <span className={`badge ${project.project_type === 'external' ? 'badge-external' : 'badge-internal'}`}>
                      {project.project_type === 'external' ? 'External' : 'Internal'}
                    </span>
                  </td>
                  <td>{project.description || '-'}</td>
                  <td>
                    <span className="count-badge">
                      {project.member_count !== undefined ? `${project.member_count} member${project.member_count !== 1 ? 's' : ''}` : '-'}
                    </span>
                  </td>
                  <td>
                    <span className="count-badge">
                      {project.group_count !== undefined ? `${project.group_count} group${project.group_count !== 1 ? 's' : ''}` : '-'}
                    </span>
                  </td>
                  <td>
                    {project.is_archived ? (
                      <span className="badge badge-archived">Archived</span>
                    ) : (
                      <span className="badge badge-active">Active</span>
                    )}
                  </td>
                  <td>{new Date(project.created_at).toLocaleString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        className="action-icon-btn project-btn" 
                        onClick={() => navigate(`/upload?project_id=${project.id}`)}
                        title="Add File to Project"
                        aria-label={`Add file to project ${project.name}`}
                      >
                        <FiFolderPlus aria-hidden="true" />
                      </button>
                      <button 
                        className="action-icon-btn edit-btn" 
                        onClick={() => openEditModal(project)}
                        title="Edit Project"
                        aria-label={`Edit project ${project.name}`}
                      >
                        <FiEdit2 aria-hidden="true" />
                      </button>
                      {!project.is_default && (
                        <button 
                          className="action-icon-btn delete-btn" 
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
                  <tr className="sub-project-row">
                    <td colSpan="8" style={{ padding: 0, backgroundColor: '#f9fafb' }}>
                      <div className="sub-projects-container">
                        <table className="sub-projects-nested-table">
                          <thead>
                            <tr>
                              <th style={{ paddingLeft: '3rem' }}>Sub-Project Name</th>
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
                                <td style={{ paddingLeft: '3rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FiFolder size={14} style={{ color: '#6b7280' }} />
                                    <Link 
                                      to={`/file-catalog?project=${project.id}&sub_project=${subProject.id}`}
                                      style={{ color: '#6b7280', textDecoration: 'none' }}
                                    >
                                      {subProject.name}
                                    </Link>
                                  </div>
                                </td>
                                <td>{subProject.file_count || 0}</td>
                                <td>{formatBytes(subProject.total_size || 0)}</td>
                                <td>
                                  <span className={`badge ${subProject.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                    {subProject.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td>{subProject.owner_name || '-'}</td>
                                <td>
                                  <div className="action-buttons">
                                    <button 
                                      className="action-icon-btn project-btn" 
                                      onClick={() => navigate(`/upload?project_id=${project.id}&sub_project_id=${subProject.id}`)}
                                      title="Add File to Sub-Project"
                                    >
                                      <FiFolderPlus size={14} />
                                    </button>
                                    <button 
                                      className="action-icon-btn edit-btn" 
                                      onClick={(e) => openEditSubProjectModal(project.id, subProject, e)}
                                      title="Edit Sub-Project"
                                    >
                                      <FiEdit2 size={14} />
                                    </button>
                                    <button 
                                      className="action-icon-btn delete-btn" 
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
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '1rem',
              padding: '1rem',
              borderTop: '1px solid #ddd'
            }}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: currentPage === 1 ? '#ddd' : '#4a90e2',
                  color: currentPage === 1 ? '#999' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>
              
              <span style={{ fontSize: '0.95rem', color: '#666' }}>
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: currentPage === totalPages ? '#ddd' : '#4a90e2',
                  color: currentPage === totalPages ? '#999' : 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          )}
        </PageLayout.TableWrapper>
      )}
    </PageLayout>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create New Project</h2>
              <button className="close-btn" onClick={handleCloseCreateModal}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreate}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Project Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Project Type *</label>
                    <select
                      value={formData.project_type}
                      onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                      required
                    >
                      <option value="internal">Internal</option>
                      <option value="external">External</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="3"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Add Members</label>
                    <select
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
                    <small style={{ color: '#666', fontSize: '0.7rem' }}>Hold Ctrl/Cmd to select multiple users</small>
                  </div>
                  <div className="form-group">
                    <label>Add Access Groups</label>
                    <select
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
                    <small style={{ color: '#666', fontSize: '0.7rem' }}>Hold Ctrl/Cmd to select multiple groups</small>
                  </div>
                </div>

                <hr style={{ margin: '1rem 0', border: '1px solid #ddd' }} />

                <div className="subprojects-create-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.8rem' }}>Sub-Projects</h3>
                    <button type="button" className="btn-primary btn-small" onClick={handleAddSubProject}>
                      <FiFolderPlus style={{ marginRight: '0.25rem' }} /> Add Sub-Project
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="Sub-project name"
                      value={subProjectFormData.name}
                      onChange={(e) => setSubProjectFormData({ ...subProjectFormData, name: e.target.value })}
                      style={{ padding: '0.4rem', fontSize: '0.75rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={subProjectFormData.description}
                      onChange={(e) => setSubProjectFormData({ ...subProjectFormData, description: e.target.value })}
                      style={{ padding: '0.4rem', fontSize: '0.75rem' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={subProjectFormData.is_active}
                        onChange={(e) => setSubProjectFormData({ ...subProjectFormData, is_active: e.target.checked })}
                        style={{ marginRight: '0.25rem' }}
                      />
                      Active
                    </label>
                  </div>

                  {formData.sub_projects.length > 0 && (
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f5f5f5' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Description</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Status</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.sub_projects.map((sp) => (
                          <tr key={sp.temp_id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>{sp.name}</td>
                            <td style={{ padding: '0.5rem', color: '#666' }}>{sp.description || '-'}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              <span className={`badge ${sp.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                {sp.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn-small btn-danger"
                                onClick={() => handleRemoveSubProject(sp.temp_id)}
                                style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
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
                    <p style={{ textAlign: 'center', color: '#999', fontSize: '0.75rem', padding: '1rem' }}>
                      No sub-projects added yet
                    </p>
                  )}
                </div>
              </form>
            </div>
            <div className="modal-actions">
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
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h2>Edit Project - {selectedProject.name}</h2>
              <button className="close-btn" onClick={handleCloseEditModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-content-sections">
                <form onSubmit={handleUpdate}>
                  <h3>Project Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label>Project Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Project Type *</label>
                      <select
                        value={formData.project_type}
                        onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                        required
                      >
                        <option value="internal">Internal</option>
                        <option value="external">External</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows="3"
                    />
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <button type="submit" className="btn-primary">Update Details</button>
                  </div>
                </form>

              <hr style={{ margin: '1rem 0', border: '1px solid #ddd' }} />

              <div className="members-section">
                <h3>Members</h3>
                <p className="section-note">Add users to grant them access to this project's resources. Their permissions are determined by their global role.</p>
                <form onSubmit={handleAddMember} className="add-member-form">
                  <div className="form-row">
                    <select
                      value={memberFormData.user_id}
                      onChange={(e) => setMemberFormData({ ...memberFormData, user_id: e.target.value })}
                      required
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
                    <button type="submit" className="btn-primary btn-small">Add Member</button>
                  </div>
                </form>

                <div className="scrollable-list">
                  <table className="compact-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Global Role</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group members by user_id to consolidate multiple roles
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
                                <span key={idx} className="role-badge" style={{ marginRight: '0.25rem' }}>
                                  {role}
                                </span>
                              ))}
                            </td>
                            <td>
                              <button
                                className="btn-small btn-danger"
                                onClick={() => openRemoveMemberConfirm(member.user_id, member.full_name || member.username)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ));
                      })()}
                      {(!selectedProject.members || selectedProject.members.length === 0) && (
                        <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No members yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr style={{ margin: '1rem 0', border: '1px solid #ddd' }} />

              <div className="groups-section">
                <h3>Access Groups</h3>
                <form onSubmit={handleAddGroup} className="add-group-form">
                  <div className="form-row">
                    <select
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
                    <button type="submit" className="btn-primary btn-small">Add Group</button>
                  </div>
                </form>

                <div className="scrollable-list">
                  <table className="compact-table">
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
                          <td><span className="badge badge-type">{group.group_type}</span></td>
                          <td>
                            <button
                              className="btn-small btn-danger"
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

              <hr style={{ margin: '1rem 0', border: '1px solid #ddd' }} />

              <div className="subprojects-section">
                <SubProjectManagement 
                  projectId={selectedProject.id} 
                  projectName={selectedProject.name} 
                />
              </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="gps-btn gps-btn--secondary" onClick={handleCloseEditModal}>
                Close
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
