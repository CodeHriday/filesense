import React, { useState, useEffect } from 'react';
import { FiUsers, FiUserPlus, FiTrash2, FiX, FiAlertCircle, FiShield } from 'react-icons/fi';
import axios from 'axios';
import './SubProjectMemberManagement.css';

function SubProjectMemberManagement({ projectId, subProjectId, subProjectName, mode }) {
  const [activeTab, setActiveTab] = useState(mode || 'members');
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('viewer');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode) {
      setActiveTab(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (projectId && subProjectId) {
      fetchData();
    }
  }, [projectId, subProjectId, activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (activeTab === 'members') {
        const response = await axios.get(`/api/projects/${projectId}/sub-projects/${subProjectId}/members`);
        setMembers(response.data.members || []);
      } else {
        const response = await axios.get(`/api/projects/${projectId}/sub-projects/${subProjectId}/groups`);
        setGroups(response.data.groups || []);
      }
    } catch (err) {
      console.error(`Error fetching ${activeTab}:`, err);
      setError(err.response?.data?.message || `Failed to load ${activeTab}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const response = await axios.get('/api/users?limit=1000');
      setAvailableUsers(response.data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      alert('Failed to load available users');
    }
  };

  const fetchAvailableGroups = async () => {
    try {
      const response = await axios.get('/api/groups');
      setAvailableGroups(response.data.groups || []);
    } catch (err) {
      console.error('Error fetching groups:', err);
      alert('Failed to load available groups');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      alert('Please select a user');
      return;
    }

    try {
      setSubmitting(true);
      await axios.post(`/api/projects/${projectId}/sub-projects/${subProjectId}/members`, {
        user_id: selectedUserId,
        role: selectedRole
      });
      setShowAddMemberModal(false);
      setSelectedUserId('');
      setSelectedRole('viewer');
      await fetchData();
    } catch (err) {
      console.error('Error adding member:', err);
      alert(err.response?.data?.message || 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (memberId, username) => {
    if (!confirm(`Are you sure you want to remove ${username} from this sub-project?`)) {
      return;
    }

    try {
      await axios.delete(`/api/projects/${projectId}/sub-projects/${subProjectId}/members/${memberId}`);
      await fetchData();
    } catch (err) {
      console.error('Error removing member:', err);
      alert(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!selectedGroupId) {
      alert('Please select a group');
      return;
    }

    try {
      setSubmitting(true);
      await axios.post(`/api/projects/${projectId}/sub-projects/${subProjectId}/groups`, {
        group_id: selectedGroupId
      });
      setShowAddGroupModal(false);
      setSelectedGroupId('');
      await fetchData();
    } catch (err) {
      console.error('Error adding group:', err);
      alert(err.response?.data?.message || 'Failed to add group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveGroup = async (groupAssignmentId, groupName) => {
    if (!confirm(`Are you sure you want to remove the group "${groupName}" from this sub-project?`)) {
      return;
    }

    try {
      await axios.delete(`/api/projects/${projectId}/sub-projects/${subProjectId}/groups/${groupAssignmentId}`);
      await fetchData();
    } catch (err) {
      console.error('Error removing group:', err);
      alert(err.response?.data?.message || 'Failed to remove group');
    }
  };

  const openAddMemberModal = () => {
    fetchAvailableUsers();
    setShowAddMemberModal(true);
  };

  const openAddGroupModal = () => {
    fetchAvailableGroups();
    setShowAddGroupModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="subproject-member-management">
      {!mode && (
        <>
          <div className="spmm-header">
            <div className="header-title">
              <FiUsers size={20} />
              <h2>Access Management</h2>
              <span className="subproject-badge">{subProjectName}</span>
            </div>
          </div>

          <div className="spmm-tabs">
            <button
              className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              <FiUsers size={16} />
              Members
            </button>
            <button
              className={`tab-button ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              <FiShield size={16} />
              Access Groups
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="error-banner">
          <FiAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading {activeTab}...</p>
        </div>
      ) : (
        <>
          {activeTab === 'members' && (
            <div className="tab-content">
              <div className="content-header">
                <p className="content-description">Manage individual user access to this sub-project</p>
                <button className="btn btn-primary" onClick={openAddMemberModal}>
                  <FiUserPlus size={16} />
                  Add Member
                </button>
              </div>

              {members.length === 0 ? (
                <div className="empty-state">
                  <FiUsers size={48} />
                  <h3>No Members Yet</h3>
                  <p>Add members to grant them access to this sub-project</p>
                  <button className="btn btn-primary" onClick={openAddMemberModal}>
                    <FiUserPlus size={16} />
                    Add First Member
                  </button>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Added Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <div className="user-cell">
                              <FiUsers size={14} />
                              <span>{member.username}</span>
                            </div>
                          </td>
                          <td>{member.email || '-'}</td>
                          <td>
                            <span className={`role-badge role-${member.role}`}>
                              {member.role}
                            </span>
                          </td>
                          <td>{formatDate(member.added_at)}</td>
                          <td className="actions-cell">
                            <button
                              className="btn-icon btn-icon-danger"
                              onClick={() => handleRemoveMember(member.id, member.username)}
                              title="Remove member"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="tab-content">
              <div className="content-header">
                <p className="content-description">Manage group-based access to this sub-project</p>
                <button className="btn btn-primary" onClick={openAddGroupModal}>
                  <FiShield size={16} />
                  Add Group
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="empty-state">
                  <FiShield size={48} />
                  <h3>No Access Groups Yet</h3>
                  <p>Add groups to grant access to multiple users at once</p>
                  <button className="btn btn-primary" onClick={openAddGroupModal}>
                    <FiShield size={16} />
                    Add First Group
                  </button>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Group Name</th>
                        <th>Description</th>
                        <th>Members</th>
                        <th>Added Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <tr key={group.id}>
                          <td>
                            <div className="group-cell">
                              <FiShield size={14} />
                              <span>{group.group_name}</span>
                            </div>
                          </td>
                          <td>{group.description || '-'}</td>
                          <td className="text-center">{group.member_count || 0}</td>
                          <td>{formatDate(group.added_at)}</td>
                          <td className="actions-cell">
                            <button
                              className="btn-icon btn-icon-danger"
                              onClick={() => handleRemoveGroup(group.id, group.group_name)}
                              title="Remove group"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showAddMemberModal && (
        <div className="modal-overlay" onClick={() => setShowAddMemberModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FiUserPlus size={18} />
                Add Member
              </h3>
              <button
                className="btn-icon"
                onClick={() => setShowAddMemberModal(false)}
                disabled={submitting}
              >
                <FiX size={18} />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="modal-form">
              <div className="form-group">
                <label htmlFor="add-member-user-select">Select User <span className="required">*</span></label>
                <select
                  id="add-member-user-select"
                  className="form-input"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                  disabled={submitting}
                >
                  <option value="">-- Select a user --</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="add-member-role-select">Role <span className="required">*</span></label>
                <select
                  id="add-member-role-select"
                  className="form-input"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  required
                  disabled={submitting}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddMemberModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  <FiUserPlus size={16} />
                  {submitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddGroupModal && (
        <div className="modal-overlay" onClick={() => setShowAddGroupModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FiShield size={18} />
                Add Access Group
              </h3>
              <button
                className="btn-icon"
                onClick={() => setShowAddGroupModal(false)}
                disabled={submitting}
              >
                <FiX size={18} />
              </button>
            </div>
            <form onSubmit={handleAddGroup} className="modal-form">
              <div className="form-group">
                <label htmlFor="add-group-select">Select Group <span className="required">*</span></label>
                <select
                  id="add-group-select"
                  className="form-input"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  required
                  disabled={submitting}
                >
                  <option value="">-- Select a group --</option>
                  {availableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} {group.description && `- ${group.description}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddGroupModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  <FiShield size={16} />
                  {submitting ? 'Adding...' : 'Add Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubProjectMemberManagement;
