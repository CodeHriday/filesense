import React, { useState, useEffect } from 'react';
import { FiBell, FiPlus, FiEdit2, FiTrash2, FiMail, FiClock, FiUsers } from 'react-icons/fi';
import Card from '../components/Card';
import Modal from '../components/Modal';
import './AlertsConfig.css';
import * as alertService from '../api/alertService';
import axios from 'axios';

export const AlertsConfig = () => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRecipientsModal, setShowRecipientsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    entity_type: 'job',
    trigger_events: ['failure'],
    consolidation_window_minutes: 60,
    consolidate_alerts: true,
    enabled: true,
    project_id: ''
  });

  const [newRecipient, setNewRecipient] = useState({
    type: 'user',
    user_id: '',
    email: ''
  });

  useEffect(() => {
    loadPolicies();
    loadProjects();
    loadUsers();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await alertService.getAlertPolicies();
      if (response.success) {
        setPolicies(response.policies);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load alert policies');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(Array.isArray(response.data) ? response.data : (response.data.users || []));
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadRecipients = async (policyId) => {
    try {
      const response = await alertService.getPolicyRecipients(policyId);
      if (response.success) {
        setRecipients(response.recipients);
      }
    } catch (err) {
      console.error('Failed to load recipients:', err);
    }
  };

  const handleCreatePolicy = async () => {
    try {
      const response = await alertService.createAlertPolicy(formData);
      if (response.success) {
        loadPolicies();
        setShowCreateModal(false);
        resetForm();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create alert policy');
    }
  };

  const handleUpdatePolicy = async () => {
    if (!selectedPolicy) return;

    try {
      const response = await alertService.updateAlertPolicy(selectedPolicy.id, formData);
      if (response.success) {
        loadPolicies();
        setShowEditModal(false);
        setSelectedPolicy(null);
        resetForm();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update alert policy');
    }
  };

  const handleDeletePolicy = async (policyId) => {
    if (!window.confirm('Are you sure you want to delete this alert policy?')) return;

    try {
      const response = await alertService.deleteAlertPolicy(policyId);
      if (response.success) {
        loadPolicies();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete alert policy');
    }
  };

  const handleAddRecipient = async () => {
    if (!selectedPolicy) return;

    const payload = newRecipient.type === 'user'
      ? { user_id: newRecipient.user_id }
      : { email: newRecipient.email };

    try {
      const response = await alertService.addPolicyRecipient(selectedPolicy.id, payload);
      if (response.success) {
        loadRecipients(selectedPolicy.id);
        setNewRecipient({ type: 'user', user_id: '', email: '' });
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add recipient');
    }
  };

  const handleDeleteRecipient = async (recipientId) => {
    if (!selectedPolicy) return;

    try {
      const response = await alertService.deletePolicyRecipient(selectedPolicy.id, recipientId);
      if (response.success) {
        loadRecipients(selectedPolicy.id);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove recipient');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      entity_type: 'job',
      trigger_events: ['failure'],
      consolidation_window_minutes: 60,
      consolidate_alerts: true,
      enabled: true,
      project_id: ''
    });
  };

  const openEditModal = (policy) => {
    setSelectedPolicy(policy);
    setFormData({
      name: policy.name,
      description: policy.description || '',
      entity_type: policy.entity_type,
      trigger_events: Array.isArray(policy.trigger_events) ? policy.trigger_events : [policy.trigger_events],
      consolidation_window_minutes: policy.consolidation_window_minutes || 60,
      consolidate_alerts: policy.consolidate_alerts !== false,
      enabled: policy.enabled !== false,
      project_id: policy.project_id
    });
    setShowEditModal(true);
  };

  const openRecipientsModal = (policy) => {
    setSelectedPolicy(policy);
    loadRecipients(policy.id);
    setShowRecipientsModal(true);
  };

  const getEntityTypeBadge = (type) => {
    const colors = {
      job: 'bg-blue-100 text-blue-800',
      workflow: 'bg-purple-100 text-purple-800',
      mapping_group: 'bg-green-100 text-green-800',
      schedule: 'bg-orange-100 text-orange-800'
    };

    return (
      <span className={`trigger-badge ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
        {type.replace('_', ' ')}
      </span>
    );
  };

  const getTriggerEventsBadge = (events) => {
    if (!events || events.length === 0) return null;
    
    const eventList = Array.isArray(events) ? events : [events];
    const displayText = eventList.join(', ');
    
    const colors = {
      failure: 'bg-red-100 text-red-800',
      success: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800'
    };

    const color = eventList.includes('failure') ? colors.failure : 
                  (eventList.includes('success') || eventList.includes('completed')) ? colors.success : 
                  'bg-yellow-100 text-yellow-800';

    return (
      <span className={`trigger-badge ${color}`}>
        {displayText}
      </span>
    );
  };

  const handleTriggerEventsChange = (event) => {
    const value = event.target.value;
    setFormData({ ...formData, trigger_events: [value] });
  };

  if (loading) {
    return (
      <div className="alerts-config-container">
        <div className="loading-state">Loading alert policies...</div>
      </div>
    );
  }

  return (
    <div className="alerts-config-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FiBell className="title-icon" />
            Alert Policies
          </h1>
          <p className="page-subtitle">
            Configure email notifications for job, workflow, and schedule events
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <FiPlus />
          Create Policy
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {policies.length === 0 ? (
        <Card title="No Alert Policies">
          <div className="empty-state">
            <FiBell className="empty-state-icon" />
            <h3>No alert policies yet</h3>
            <p>Create your first alert policy to receive email notifications</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Create Alert Policy
            </button>
          </div>
        </Card>
      ) : (
        <div className="policies-grid">
          {policies.map((policy) => (
            <Card key={policy.id}>
              <div className="policy-card">
                <div className="policy-header">
                  <div className="policy-title-row">
                    <h3 className="policy-name">{policy.name}</h3>
                    <div className="policy-badges">
                      {getEntityTypeBadge(policy.entity_type)}
                      {getTriggerEventsBadge(policy.trigger_events)}
                      {!policy.enabled && (
                        <span className="trigger-badge bg-gray-100 text-gray-500">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>

                  {policy.description && (
                    <p className="policy-description">{policy.description}</p>
                  )}

                  <div className="policy-meta">
                    <div className="meta-item">
                      <FiClock />
                      <span>Group: {policy.consolidation_window_minutes || 60} min</span>
                    </div>
                    <div className="meta-item">
                      <FiUsers />
                      <span>{policy.recipient_count || 0} recipients</span>
                    </div>
                  </div>
                </div>

                <div className="policy-actions">
                  <button
                    onClick={() => openRecipientsModal(policy)}
                    className="btn-icon btn-icon-blue"
                    title="Manage Recipients"
                  >
                    <FiMail />
                  </button>
                  <button
                    onClick={() => openEditModal(policy)}
                    className="btn-icon"
                    title="Edit Policy"
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    onClick={() => handleDeletePolicy(policy.id)}
                    className="btn-icon btn-icon-red"
                    title="Delete Policy"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="Create Alert Policy"
        size="large"
      >
        <div className="modal-form">
          <div className="form-group">
            <label htmlFor="create-policy-name" className="form-label">Policy Name *</label>
            <input
              id="create-policy-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
              placeholder="Job Failure Alerts"
            />
          </div>

          <div className="form-group">
            <label htmlFor="create-description" className="form-label">Description</label>
            <textarea
              id="create-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-textarea"
              rows="3"
              placeholder="Notify team when ETL jobs fail"
            />
          </div>

          <div className="form-group">
            <label htmlFor="create-project" className="form-label">Project *</label>
            <select
              id="create-project"
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
              className="form-select"
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="create-entity-type" className="form-label">Entity Type *</label>
              <select
                id="create-entity-type"
                value={formData.entity_type}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                className="form-select"
              >
                <option value="job">Job</option>
                <option value="workflow">Workflow</option>
                <option value="mapping_group">Mapping Group</option>
                <option value="schedule">Schedule</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="create-trigger-event" className="form-label">Trigger Event *</label>
              <select
                id="create-trigger-event"
                value={formData.trigger_events[0] || 'failure'}
                onChange={handleTriggerEventsChange}
                className="form-select"
              >
                <option value="failure">Failure</option>
                <option value="success">Success</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="create-consolidation-window" className="form-label">Consolidation Window (minutes) *</label>
            <input
              id="create-consolidation-window"
              type="number"
              value={formData.consolidation_window_minutes}
              onChange={(e) => setFormData({ ...formData, consolidation_window_minutes: parseInt(e.target.value) || 60 })}
              className="form-input"
              min="1"
              max="1440"
            />
            <p className="form-hint">
              Events within this window will be grouped into a single email
            </p>
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              checked={formData.consolidate_alerts}
              onChange={(e) => setFormData({ ...formData, consolidate_alerts: e.target.checked })}
              id="consolidate-checkbox"
            />
            <label htmlFor="consolidate-checkbox">Consolidate multiple alerts</label>
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              id="enabled-checkbox"
            />
            <label htmlFor="enabled-checkbox">Enable this policy</label>
          </div>

          <div className="modal-actions">
            <button
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePolicy}
              className="btn-primary"
              disabled={!formData.name || !formData.project_id}
            >
              Create Policy
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedPolicy(null);
          resetForm();
        }}
        title="Edit Alert Policy"
        size="large"
      >
        <div className="modal-form">
          <div className="form-group">
            <label htmlFor="edit-policy-name" className="form-label">Policy Name *</label>
            <input
              id="edit-policy-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-description" className="form-label">Description</label>
            <textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="form-textarea"
              rows="3"
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-project" className="form-label">Project *</label>
            <select
              id="edit-project"
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
              className="form-select"
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-entity-type" className="form-label">Entity Type *</label>
              <select
                id="edit-entity-type"
                value={formData.entity_type}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                className="form-select"
              >
                <option value="job">Job</option>
                <option value="workflow">Workflow</option>
                <option value="mapping_group">Mapping Group</option>
                <option value="schedule">Schedule</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="edit-trigger-event" className="form-label">Trigger Event *</label>
              <select
                id="edit-trigger-event"
                value={formData.trigger_events[0] || 'failure'}
                onChange={handleTriggerEventsChange}
                className="form-select"
              >
                <option value="failure">Failure</option>
                <option value="success">Success</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-consolidation-window" className="form-label">Consolidation Window (minutes) *</label>
            <input
              id="edit-consolidation-window"
              type="number"
              value={formData.consolidation_window_minutes}
              onChange={(e) => setFormData({ ...formData, consolidation_window_minutes: parseInt(e.target.value) || 60 })}
              className="form-input"
              min="1"
              max="1440"
            />
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              checked={formData.consolidate_alerts}
              onChange={(e) => setFormData({ ...formData, consolidate_alerts: e.target.checked })}
              id="consolidate-checkbox-edit"
            />
            <label htmlFor="consolidate-checkbox-edit">Consolidate multiple alerts</label>
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              id="enabled-checkbox-edit"
            />
            <label htmlFor="enabled-checkbox-edit">Enable this policy</label>
          </div>

          <div className="modal-actions">
            <button
              onClick={() => {
                setShowEditModal(false);
                setSelectedPolicy(null);
                resetForm();
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdatePolicy}
              className="btn-primary"
              disabled={!formData.name || !formData.project_id}
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showRecipientsModal}
        onClose={() => {
          setShowRecipientsModal(false);
          setSelectedPolicy(null);
          setRecipients([]);
        }}
        title={`Manage Recipients - ${selectedPolicy?.name || ''}`}
        size="medium"
      >
        <div className="recipients-modal">
          <div className="add-recipient-section">
            <h4 className="section-title">Add Recipient</h4>

            <div className="recipient-type-tabs">
              <button
                onClick={() => setNewRecipient({ ...newRecipient, type: 'user' })}
                className={`type-tab ${newRecipient.type === 'user' ? 'active' : ''}`}
              >
                User
              </button>
              <button
                onClick={() => setNewRecipient({ ...newRecipient, type: 'email' })}
                className={`type-tab ${newRecipient.type === 'email' ? 'active' : ''}`}
              >
                Email
              </button>
            </div>

            {newRecipient.type === 'user' ? (
              <div className="recipient-input-row">
                <select
                  value={newRecipient.user_id}
                  onChange={(e) => setNewRecipient({ ...newRecipient, user_id: e.target.value })}
                  className="form-select"
                >
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.email})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddRecipient}
                  disabled={!newRecipient.user_id}
                  className="btn-primary"
                >
                  Add
                </button>
              </div>
            ) : (
              <div className="recipient-input-row">
                <input
                  type="email"
                  value={newRecipient.email}
                  onChange={(e) => setNewRecipient({ ...newRecipient, email: e.target.value })}
                  className="form-input"
                  placeholder="email@example.com"
                />
                <button
                  onClick={handleAddRecipient}
                  disabled={!newRecipient.email}
                  className="btn-primary"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          <div className="recipients-list-section">
            <h4 className="section-title">
              Current Recipients ({recipients.length})
            </h4>

            {recipients.length === 0 ? (
              <p className="empty-recipients">No recipients added yet</p>
            ) : (
              <div className="recipients-list">
                {recipients.map((recipient) => (
                  <div key={recipient.id} className="recipient-item">
                    <div className="recipient-info">
                      <FiMail className="recipient-icon" />
                      <span>{recipient.user_name || recipient.email}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteRecipient(recipient.id)}
                      className="btn-icon btn-icon-red"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button
              onClick={() => {
                setShowRecipientsModal(false);
                setSelectedPolicy(null);
                setRecipients([]);
              }}
              className="btn-secondary"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
