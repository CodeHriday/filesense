import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './GroupManagement.css';

const API_BASE_URL = '/api';

function GroupManagement() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupTypeFilter, setGroupTypeFilter] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    group_type: 'MANUAL',
    idp_sync_enabled: false
  });

  const [memberFormData, setMemberFormData] = useState({
    user_id: '',
    source: 'MANUAL'
  });

  const [roleFormData, setRoleFormData] = useState({
    role_id: '',
    project_id: null
  });

  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);

  useEffect(() => {
    fetchGroups();
    fetchAvailableUsers();
    fetchAvailableRoles();
    fetchAvailableProjects();
  }, [searchTerm, groupTypeFilter]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (groupTypeFilter) params.append('group_type', groupTypeFilter);

      const response = await axios.get(`${API_BASE_URL}/groups?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGroups(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch groups');
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

  const fetchAvailableRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/users/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableRoles(response.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const fetchAvailableProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableProjects(response.data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const fetchGroupDetails = async (groupId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedGroup(response.data);
    } catch (err) {
      setError('Failed to fetch group details');
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/groups`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowCreateModal(false);
      setFormData({ name: '', description: '', group_type: 'MANUAL', idp_sync_enabled: false });
      fetchGroups();
    } catch (err) {
      setError('Failed to create group');
      console.error(err);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_BASE_URL}/groups/${selectedGroup.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowEditModal(false);
      setFormData({ name: '', description: '', group_type: 'MANUAL', idp_sync_enabled: false });
      fetchGroups();
      if (selectedGroup) {
        fetchGroupDetails(selectedGroup.id);
      }
    } catch (err) {
      setError('Failed to update group');
      console.error(err);
    }
  };

  const handleDelete = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchGroups();
      setSelectedGroup(null);
    } catch (err) {
      setError('Failed to delete group');
      console.error(err);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/groups/${selectedGroup.id}/members`,
        memberFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMemberFormData({ user_id: '', source: 'MANUAL' });
      fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      setError('Failed to add member');
      console.error(err);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the group?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_BASE_URL}/groups/${selectedGroup.id}/members/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      setError('Failed to remove member');
      console.error(err);
    }
  };

  const handleAssignRole = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/groups/${selectedGroup.id}/roles`,
        roleFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRoleFormData({ role_id: '', project_id: null });
      fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Role already assigned to this group');
      } else {
        setError('Failed to assign role');
      }
      console.error(err);
    }
  };

  const handleRemoveRole = async (roleId, projectId) => {
    if (!window.confirm('Remove this role from the group?')) return;
    try {
      const token = localStorage.getItem('token');
      const params = projectId ? `?project_id=${projectId}` : '';
      await axios.delete(
        `${API_BASE_URL}/groups/${selectedGroup.id}/roles/${roleId}${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      setError('Failed to remove role');
      console.error(err);
    }
  };

  const openEditModal = (group) => {
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      group_type: group.group_type,
      idp_sync_enabled: group.idp_sync_enabled || false
    });
    setShowEditModal(true);
  };

  const openMembersModal = async (group) => {
    await fetchGroupDetails(group.id);
    setShowMembersModal(true);
  };

  const openRolesModal = async (group) => {
    await fetchGroupDetails(group.id);
    setShowRolesModal(true);
  };

  return (
    <div className="group-management">
      <div className="page-header">
        <h1>Group Management</h1>
        <button className="btn-primary btn-create-group" onClick={() => setShowCreateModal(true)}>
          + Create Group
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters">
        <input
          type="text"
          placeholder="Search groups..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <select
          value={groupTypeFilter}
          onChange={(e) => setGroupTypeFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Types</option>
          <option value="MANUAL">Manual</option>
          <option value="STANDARD">Standard</option>
          <option value="DYNAMIC">Dynamic</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading groups...</div>
      ) : (
        <div className="table-container">
          <table className="groups-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Description</th>
                <th>Type</th>
                <th>IdP Sync</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <strong>{group.name}</strong>
                  </td>
                  <td>{group.description || '-'}</td>
                  <td>
                    <span className={`badge badge-${group.group_type.toLowerCase()}`}>
                      {group.group_type}
                    </span>
                  </td>
                  <td>
                    {group.idp_sync_enabled ? (
                      <span className="sync-badge">Enabled</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Disabled</span>
                    )}
                  </td>
                  <td>{new Date(group.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-small" onClick={() => openMembersModal(group)}>
                        Members
                      </button>
                      <button className="btn-small" onClick={() => openRolesModal(group)}>
                        Roles
                      </button>
                      <button className="btn-small" onClick={() => openEditModal(group)}>
                        Edit
                      </button>
                      <button className="btn-small btn-danger" onClick={() => handleDelete(group.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Group</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Group Name *</label>
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
              <div className="form-group">
                <label>Group Type</label>
                <select
                  value={formData.group_type}
                  onChange={(e) => setFormData({ ...formData, group_type: e.target.value })}
                >
                  <option value="MANUAL">Manual</option>
                  <option value="STANDARD">Standard</option>
                  <option value="DYNAMIC">Dynamic</option>
                </select>
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.idp_sync_enabled}
                    onChange={(e) => setFormData({ ...formData, idp_sync_enabled: e.target.checked })}
                  />
                  Enable IdP Sync
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Group</h2>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="form-group">
                <label>Group Name *</label>
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
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.idp_sync_enabled}
                    onChange={(e) => setFormData({ ...formData, idp_sync_enabled: e.target.checked })}
                  />
                  Enable IdP Sync
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">Update Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Members - {selectedGroup.name}</h2>
              <button className="close-btn" onClick={() => setShowMembersModal(false)}>×</button>
            </div>
            <div className="members-content">
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
                  <button type="submit" className="btn-primary">Add Member</button>
                </div>
              </form>

              <table className="members-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Source</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.members?.map((member) => (
                    <tr key={member.user_id}>
                      <td>{member.full_name || member.username}</td>
                      <td>{member.email}</td>
                      <td><span className="source-badge">{member.source}</span></td>
                      <td>{new Date(member.created_at).toLocaleDateString()}</td>
                      <td>
                        {member.source === 'MANUAL' && (
                          <button
                            className="btn-small btn-danger"
                            onClick={() => handleRemoveMember(member.user_id)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Roles Modal */}
      {showRolesModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowRolesModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Roles - {selectedGroup.name}</h2>
              <button className="close-btn" onClick={() => setShowRolesModal(false)}>×</button>
            </div>
            <div className="members-content">
              <form onSubmit={handleAssignRole} className="add-member-form">
                <div className="form-row">
                  <select
                    value={roleFormData.role_id}
                    onChange={(e) => setRoleFormData({ ...roleFormData, role_id: e.target.value })}
                    required
                  >
                    <option value="">Select Role</option>
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={roleFormData.project_id || ''}
                    onChange={(e) => setRoleFormData({ ...roleFormData, project_id: e.target.value || null })}
                  >
                    <option value="">Global (All Projects)</option>
                    {availableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-primary">Assign Role</button>
                </div>
              </form>

              <table className="members-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Project Scope</th>
                    <th>Assigned</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.roles?.map((roleAssignment) => (
                    <tr key={`${roleAssignment.role_id}-${roleAssignment.project_id || 'global'}`}>
                      <td><span className="role-badge">{roleAssignment.role_name}</span></td>
                      <td>{roleAssignment.project_id ? `Project #${roleAssignment.project_id}` : 'Global'}</td>
                      <td>{new Date(roleAssignment.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="btn-small btn-danger"
                          onClick={() => handleRemoveRole(roleAssignment.role_id, roleAssignment.project_id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupManagement;
