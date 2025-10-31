import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ConfirmModal from '../components/ConfirmModal';
import './GroupManagement.css';

const API_BASE_URL = '/api';

function GroupManagement() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
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
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

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
      setAvailableUsers(response.data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setAvailableUsers([]);
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
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this group?',
      action: async () => {
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
      }
    });
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
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Remove this member from the group?',
      action: async () => {
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
      }
    });
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
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Remove this role from the group?',
      action: async () => {
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
      }
    });
  };

  const openEditModal = async (group) => {
    await fetchGroupDetails(group.id);
    setFormData({
      name: group.name,
      description: group.description || '',
      group_type: group.group_type,
      idp_sync_enabled: group.sync_enabled || false
    });
    setShowEditModal(true);
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
                <th>Members</th>
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
                    {group.sync_enabled ? (
                      <span className="sync-badge">Enabled</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Disabled</span>
                    )}
                  </td>
                  <td>
                    <span className="count-badge">
                      {group.member_count !== undefined ? `${group.member_count} member${group.member_count !== 1 ? 's' : ''}` : '-'}
                    </span>
                  </td>
                  <td>{new Date(group.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
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
            <div className="modal-body">
              <form onSubmit={handleCreate} style={{ padding: '1.5rem' }}>
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
              </form>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" onClick={handleCreate}>Create Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Group - {selectedGroup.name}</h2>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-content-sections">
                <form onSubmit={handleUpdate}>
                  <h3>Group Details</h3>
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
                  <div style={{ marginTop: '1rem' }}>
                    <button type="submit" className="btn-primary">Update Details</button>
                  </div>
                </form>

              <hr style={{ margin: '1.5rem 0', border: '1px solid #ddd' }} />

              <div className="members-section">
                <h3>Members</h3>
                <form onSubmit={handleAddMember} className="add-member-form">
                  <div className="form-row">
                    <select
                      value={memberFormData.user_id}
                      onChange={(e) => setMemberFormData({ ...memberFormData, user_id: e.target.value })}
                      required
                      style={{ flex: 1 }}
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
                        <th>Source</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.members?.map((member) => (
                        <tr key={member.user_id}>
                          <td>{member.full_name || member.username}</td>
                          <td><span className="badge badge-source">{member.source}</span></td>
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
                      {(!selectedGroup.members || selectedGroup.members.length === 0) && (
                        <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No members yet</td></tr>
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

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="danger"
      />
    </div>
  );
}

export default GroupManagement;
