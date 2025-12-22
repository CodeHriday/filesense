import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiEdit2, FiTrash2, FiSearch } from 'react-icons/fi';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/global-page-styles.css';

const API_BASE_URL = '/api';

function GroupManagement() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [groupTypeFilter, setGroupTypeFilter] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    group_type: 'MANUAL',
    idp_sync_enabled: false,
    member_ids: [],
    role_ids: []
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

  // Debounce search term (2.5 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 2500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchGroups();
    fetchAvailableUsers();
    fetchAvailableRoles();
    fetchAvailableProjects();
  }, [debouncedSearchTerm, groupTypeFilter]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
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
      const response = await axios.get(`${API_BASE_URL}/users?limit=1000`, {
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
      setFormData({ name: '', description: '', group_type: 'MANUAL', idp_sync_enabled: false, member_ids: [], role_ids: [] });
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
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Group Management</h1>
          <p className="gps-page-subtitle">Manage access groups and their members</p>
        </div>
        <div className="gps-header-actions">
          <button className="gps-btn gps-btn--primary" onClick={() => setShowCreateModal(true)}>
            + Create Group
          </button>
        </div>
      </div>

      {error && <div className="gps-alert gps-alert--error">{error}</div>}

      <div className="gps-filters">
        <div className="gps-search-container">
          <FiSearch className="gps-search-icon" />
          <input
            type="text"
            placeholder="Search groups..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="gps-search-input"
          />
        </div>
        <select
          value={groupTypeFilter}
          onChange={(e) => setGroupTypeFilter(e.target.value)}
          className="gps-filter-select"
        >
          <option value="">All Types</option>
          <option value="MANUAL">Manual</option>
          <option value="STANDARD">Standard</option>
          <option value="DYNAMIC">Dynamic</option>
        </select>
      </div>

      {loading ? (
        <div className="gps-loading">Loading groups...</div>
      ) : (
        <div className="gps-table-container">
          <table className="gps-table">
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
                    <span className="gps-cell-primary">{group.name}</span>
                  </td>
                  <td>{group.description || '-'}</td>
                  <td>
                    <span className={`gps-badge gps-badge--${group.group_type === 'MANUAL' ? 'info' : group.group_type === 'STANDARD' ? 'success' : 'warning'}`}>
                      {group.group_type}
                    </span>
                  </td>
                  <td>
                    {group.sync_enabled ? (
                      <span className="gps-badge gps-badge--success">Enabled</span>
                    ) : (
                      <span className="gps-badge gps-badge--secondary">Disabled</span>
                    )}
                  </td>
                  <td>
                    <span className="gps-cell-secondary">
                      {group.member_count !== undefined ? `${group.member_count} member${group.member_count !== 1 ? 's' : ''}` : '-'}
                    </span>
                  </td>
                  <td className="gps-cell-secondary">{new Date(group.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="gps-action-buttons">
                      <button 
                        className="gps-icon-btn gps-icon-btn--edit" 
                        onClick={() => openEditModal(group)}
                        title="Edit group"
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="gps-icon-btn gps-icon-btn--delete" 
                        onClick={() => handleDelete(group.id)}
                        title="Delete group"
                      >
                        <FiTrash2 />
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
        <div className="gps-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Create New Group</h2>
              <button className="gps-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="gps-modal-body">
              <form onSubmit={handleCreate}>
                <div className="gps-form-group">
                  <label htmlFor="create-group-name" className="gps-form-label">Group Name *</label>
                  <input
                    id="create-group-name"
                    type="text"
                    className="gps-form-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="gps-form-group">
                  <label htmlFor="create-group-description" className="gps-form-label">Description</label>
                  <textarea
                    id="create-group-description"
                    className="gps-form-textarea"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="3"
                  />
                </div>
                <div className="gps-form-group">
                  <label htmlFor="create-group-type" className="gps-form-label">Group Type</label>
                  <select
                    id="create-group-type"
                    className="gps-form-select"
                    value={formData.group_type}
                    onChange={(e) => setFormData({ ...formData, group_type: e.target.value })}
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="STANDARD">Standard</option>
                    <option value="DYNAMIC">Dynamic</option>
                  </select>
                </div>
                <div className="gps-form-group">
                  <label className="gps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.idp_sync_enabled}
                      onChange={(e) => setFormData({ ...formData, idp_sync_enabled: e.target.checked })}
                    />
                    Enable IdP Sync
                  </label>
                </div>
                <div className="gps-form-row">
                  <div className="gps-form-group">
                    <label htmlFor="create-add-members" className="gps-form-label">Add Members</label>
                      <select
                        id="create-add-members"
                        multiple
                        className="gps-form-select"
                        value={formData.member_ids}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                          setFormData({ ...formData, member_ids: selected });
                        }}
                        style={{ minHeight: '120px' }}
                      >
                      {availableUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || user.username} ({user.email})
                        </option>
                      ))}
                    </select>
                    <small className="gps-form-hint">Hold Ctrl/Cmd to select multiple users</small>
                  </div>
                  <div className="gps-form-group">
                    <label htmlFor="create-assign-roles" className="gps-form-label">Assign Roles</label>
                    <select
                      id="create-assign-roles"
                      multiple
                      className="gps-form-select"
                      value={formData.role_ids}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                        setFormData({ ...formData, role_ids: selected });
                      }}
                      style={{ minHeight: '120px' }}
                    >
                      {availableRoles.map(role => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <small className="gps-form-hint">Hold Ctrl/Cmd to select multiple roles</small>
                  </div>
                </div>
              </form>
            </div>
            <div className="gps-modal-footer">
              <button type="button" className="gps-btn gps-btn--secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="gps-btn gps-btn--primary" onClick={handleCreate}>Create Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedGroup && (
        <div className="gps-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="gps-modal gps-modal--large" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Edit Group - {selectedGroup.name}</h2>
              <button className="gps-modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-modal-sections">
                <form onSubmit={handleUpdate}>
                  <h3 className="gps-section-header">Group Details</h3>
                  <div className="gps-form-group">
                    <label htmlFor="edit-group-name" className="gps-form-label">Group Name *</label>
                    <input
                      id="edit-group-name"
                      type="text"
                      className="gps-form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="gps-form-group">
                    <label htmlFor="edit-group-description" className="gps-form-label">Description</label>
                    <textarea
                      id="edit-group-description"
                      className="gps-form-textarea"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows="3"
                    />
                  </div>
                  <div className="gps-form-group">
                    <label className="gps-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.idp_sync_enabled}
                        onChange={(e) => setFormData({ ...formData, idp_sync_enabled: e.target.checked })}
                      />
                      Enable IdP Sync
                    </label>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <button type="submit" className="gps-btn gps-btn--primary">Update Details</button>
                  </div>
                </form>

              <hr className="gps-divider" />

              <div className="gps-section">
                <h3 className="gps-section-header">Members</h3>
                <form onSubmit={handleAddMember} className="gps-inline-form">
                  <div className="gps-form-row">
                    <select
                      className="gps-form-select"
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
                    <button type="submit" className="gps-btn gps-btn--primary gps-btn--sm">Add Member</button>
                  </div>
                </form>

                <div className="gps-scrollable-list">
                  <table className="gps-table gps-table--compact">
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
                          <td><span className="gps-badge gps-badge--info">{member.source}</span></td>
                          <td>
                            <button
                              className="gps-btn gps-btn--danger gps-btn--sm"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!selectedGroup.members || selectedGroup.members.length === 0) && (
                        <tr><td colSpan="3" className="gps-empty-message">No members yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button type="button" className="gps-btn gps-btn--secondary" onClick={() => setShowEditModal(false)}>
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
