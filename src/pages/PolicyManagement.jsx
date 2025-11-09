import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiShield, FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';
import './PolicyManagement.css';

function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="toast-container">
      <div className="toast toast-success">
        <FiCheckCircle className="toast-icon" />
        <span className="toast-message">{message}</span>
      </div>
    </div>
  );
}

function NotificationModal({ message, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content notification-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notification-header">
          <FiAlertCircle className="header-icon" />
          <h3>Error</h3>
          <button className="close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="notification-body">
          <p>{message}</p>
        </div>
        <div className="notification-actions">
          <button className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notification-header warning">
          <FiAlertCircle />
          <h3>Confirm Action</h3>
          <button className="close-btn" onClick={onCancel}>
            <FiX />
          </button>
        </div>
        <div className="notification-body">
          <p>{message}</p>
        </div>
        <div className="notification-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function PolicyManagement() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/governance-policies');
      setPolicies(response.data);
    } catch (err) {
      console.error('Error fetching policies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (policyId) => {
    setConfirmDelete(policyId);
  };

  const confirmDeletePolicy = async () => {
    try {
      await axios.delete(`/api/governance-policies/${confirmDelete}`);
      await fetchPolicies();
      setConfirmDelete(null);
      setSuccessToast('Policy deleted successfully');
    } catch (err) {
      console.error('Error deleting policy:', err);
      setConfirmDelete(null);
      setErrorModal(err.response?.data?.error || 'Failed to delete policy');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="policy-management-container">
      <div className="page-header">
        <div>
          <h1><FiShield className="header-icon" /> Data Governance Policies</h1>
          <p className="page-description">
            Manage retention, access control, and encryption policies for your data files.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setSelectedPolicy(null);
            setShowModal(true);
          }}
        >
          <FiPlus className="btn-icon" /> Create Policy
        </button>
      </div>

      <Card>
        {policies.length === 0 ? (
          <div className="empty-state">
            <FiShield style={{ fontSize: '48px', color: 'var(--text-tertiary)' }} />
            <h3>No policies defined</h3>
            <p>Create your first data governance policy to manage data retention, access control, and encryption.</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedPolicy(null);
                setShowModal(true);
              }}
            >
              <FiPlus className="btn-icon" /> Create First Policy
            </button>
          </div>
        ) : (
          <div className="policies-table-container">
            <table className="policies-table">
              <thead>
                <tr>
                  <th>Policy Name</th>
                  <th>Description</th>
                  <th>Rules</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.policy_id}>
                    <td className="policy-name-cell">{policy.policy_name}</td>
                    <td className="policy-description-cell">{policy.description || '-'}</td>
                    <td className="policy-rules-cell">
                      {policy.rules && typeof policy.rules === 'string' ? (
                        <pre className="rules-json">{JSON.stringify(JSON.parse(policy.rules), null, 2)}</pre>
                      ) : policy.rules ? (
                        <pre className="rules-json">{JSON.stringify(policy.rules, null, 2)}</pre>
                      ) : (
                        <span className="no-rules">No rules</span>
                      )}
                    </td>
                    <td className="policy-date-cell">
                      {new Date(policy.created_at).toLocaleDateString()}
                    </td>
                    <td className="policy-actions-cell">
                      <button
                        className="action-icon-btn edit-btn"
                        onClick={() => {
                          setSelectedPolicy(policy);
                          setShowModal(true);
                        }}
                        title="Edit policy"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        className="action-icon-btn delete-btn"
                        onClick={() => handleDelete(policy.policy_id)}
                        title="Delete policy"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <PolicyModal
          policy={selectedPolicy}
          onClose={() => {
            setShowModal(false);
            setSelectedPolicy(null);
          }}
          onSave={(message) => {
            fetchPolicies();
            setShowModal(false);
            setSelectedPolicy(null);
            setSuccessToast(message);
          }}
          onError={(message) => {
            setErrorModal(message);
          }}
        />
      )}

      {successToast && (
        <Toast
          message={successToast}
          onClose={() => setSuccessToast(null)}
        />
      )}

      {errorModal && (
        <NotificationModal
          message={errorModal}
          onClose={() => setErrorModal(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="Are you sure you want to delete this policy?"
          onConfirm={confirmDeletePolicy}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function PolicyModal({ policy, onClose, onSave, onError }) {
  const [policyId, setPolicyId] = useState(policy?.policy_id || '');
  const [policyName, setPolicyName] = useState(policy?.policy_name || '');
  const [description, setDescription] = useState(policy?.description || '');
  const [retentionDays, setRetentionDays] = useState(policy?.rules?.retention_days || '');
  const [accessControl, setAccessControl] = useState(policy?.rules?.access_control || 'internal');
  const [encryptionRequired, setEncryptionRequired] = useState(policy?.rules?.encryption_required || false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!policyId || !policyName) {
      onError('Policy ID and Name are required');
      return;
    }

    try {
      setSaving(true);
      const rules = {
        retention_days: retentionDays ? parseInt(retentionDays) : null,
        access_control: accessControl,
        encryption_required: encryptionRequired
      };

      if (policy) {
        await axios.put(`/api/governance-policies/${policy.policy_id}`, {
          policy_name: policyName,
          description,
          rules
        });
        onSave('Policy updated successfully');
      } else {
        await axios.post('/api/governance-policies', {
          policy_id: policyId,
          policy_name: policyName,
          description,
          rules
        });
        onSave('Policy created successfully');
      }
    } catch (err) {
      console.error('Error saving policy:', err);
      onError(err.response?.data?.error || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content policy-modal">
        <h2>{policy ? 'Edit Policy' : 'Create New Policy'}</h2>

        <div className="form-group">
          <label>Policy ID</label>
          <input
            type="text"
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            placeholder="e.g., pii-retention-policy"
            disabled={!!policy}
          />
        </div>

        <div className="form-group">
          <label>Policy Name</label>
          <input
            type="text"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value)}
            placeholder="e.g., PII Data Retention Policy"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose of this policy"
            rows="3"
          />
        </div>

        <div className="form-section">
          <h3>Policy Rules</h3>

          <div className="form-group">
            <label>Retention Period (days)</label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              placeholder="e.g., 90 (leave blank for no retention policy)"
            />
          </div>

          <div className="form-group">
            <label>Access Control</label>
            <select
              value={accessControl}
              onChange={(e) => setAccessControl(e.target.value)}
            >
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={encryptionRequired}
                onChange={(e) => setEncryptionRequired(e.target.checked)}
              />
              <span>Require Encryption</span>
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PolicyManagement;
