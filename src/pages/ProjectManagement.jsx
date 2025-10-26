import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ProjectManagement.css';

const API_BASE_URL = '/api';

function ProjectManagement() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent_id: null
  });

  const [memberFormData, setMemberFormData] = useState({
    user_id: ''
  });

  const [groupFormData, setGroupFormData] = useState({
    group_id: ''
  });

  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);

  useEffect(() => {
    fetchProjects();
    fetchAvailableUsers();
    fetchAvailableGroups();
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

  const fetchAvailableUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchAvailableGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableGroups(response.data);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
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
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/projects`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowCreateModal(false);
      setFormData({ name: '', description: '', parent_id: null });
      fetchProjects();
    } catch (err) {
      setError('Failed to create project');
      console.error(err);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_BASE_URL}/projects/${selectedProject.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowEditModal(false);
      setFormData({ name: '', description: '', parent_id: null });
      fetchProjects();
      if (selectedProject) {
        fetchProjectDetails(selectedProject.id);
      }
    } catch (err) {
      setError('Failed to update project');
      console.error(err);
    }
  };

  const handleDelete = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProjects();
      setSelectedProject(null);
    } catch (err) {
      if (err.response?.data?.resourceCounts) {
        alert(`Cannot delete project with existing resources:\n` +
              `Files: ${err.response.data.resourceCounts.file_count}\n` +
              `Workflows: ${err.response.data.resourceCounts.workflow_count}\n` +
              `Mappings: ${err.response.data.resourceCounts.mapping_count}`);
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

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the project?')) return;
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

  const handleRemoveGroup = async (groupId) => {
    if (!window.confirm('Remove this access group from the project?')) return;
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
      parent_id: project.parent_id
    });
    setShowEditModal(true);
  };

  return (
    <div className="project-management">
      <div className="page-header">
        <h1>Project Management</h1>
        <button className="btn-primary btn-create-project" onClick={() => setShowCreateModal(true)}>
          + Create Project
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters">
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
      </div>

      {loading ? (
        <div className="loading">Loading projects...</div>
      ) : (
        <div className="table-container">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Description</th>
                <th>Members</th>
                <th>Access Groups</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <div className="project-name">
                      {project.name}
                      {project.is_default && <span className="badge badge-default">DEFAULT</span>}
                    </div>
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
                  <td>{new Date(project.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-small" onClick={() => openEditModal(project)}>
                        Edit
                      </button>
                      {!project.is_default && (
                        <button className="btn-small btn-danger" onClick={() => handleDelete(project.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Project</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreate} style={{ padding: '1.5rem' }}>
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
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="3"
                  />
                </div>
              </form>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" onClick={handleCreate}>Create Project</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedProject && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Project - {selectedProject.name}</h2>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-content-sections">
                <form onSubmit={handleUpdate}>
                  <h3>Project Details</h3>
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
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows="3"
                    />
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <button type="submit" className="btn-primary">Update Details</button>
                  </div>
                </form>

              <hr style={{ margin: '1.5rem 0', border: '1px solid #ddd' }} />

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
                      {availableUsers.map((user) => (
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
                      {selectedProject.members?.map((member) => (
                        <tr key={member.user_id}>
                          <td>{member.full_name || member.username}</td>
                          <td><span className="role-badge">{member.role_name || member.role}</span></td>
                          <td>
                            <button
                              className="btn-small btn-danger"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!selectedProject.members || selectedProject.members.length === 0) && (
                        <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No members yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr style={{ margin: '1.5rem 0', border: '1px solid #ddd' }} />

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
                              onClick={() => handleRemoveGroup(group.group_id)}
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
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ProjectManagement;
