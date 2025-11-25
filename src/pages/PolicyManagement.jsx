import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiShield, FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';
import '../styles/global-page-styles.css';

function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999 }}>
      <div className="gps-alert gps-alert--success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FiCheckCircle />
        <span>{message}</span>
      </div>
    </div>
  );
}

function NotificationModal({ message, onClose }) {
  return (
    <div className="gps-modal-overlay" onClick={onClose}>
      <div className="gps-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="gps-modal-header" style={{ borderBottom: '1px solid #fee2e2', backgroundColor: '#fef2f2' }}>
          <h2 className="gps-modal-title" style={{ color: '#e53e3e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiAlertCircle />
            Error
          </h2>
          <button className="gps-modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="gps-modal-body">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
        <div className="gps-modal-footer">
          <button className="gps-btn gps-btn--primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="gps-modal-overlay" onClick={onCancel}>
      <div className="gps-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="gps-modal-header">
          <h2 className="gps-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiAlertCircle style={{ color: '#f59e0b' }} />
            Confirm Action
          </h2>
          <button className="gps-modal-close" onClick={onCancel}>
            <FiX />
          </button>
        </div>
        <div className="gps-modal-body">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
        <div className="gps-modal-footer">
          <button className="gps-btn gps-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="gps-btn gps-btn--danger" onClick={onConfirm}>
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
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">
            <FiShield style={{ marginRight: '8px', color: '#025043' }} />
            Data Governance Policies
          </h1>
          <p className="gps-page-subtitle">
            Manage retention, access control, and encryption policies for your data files.
          </p>
        </div>
        <div className="gps-header-actions">
          <button
            className="gps-btn gps-btn--primary"
            onClick={() => {
              setSelectedPolicy(null);
              setShowModal(true);
            }}
          >
            <FiPlus /> Create Policy
          </button>
        </div>
      </div>

      {policies.length === 0 ? (
        <div className="gps-empty-state">
          <FiShield style={{ fontSize: '48px', color: '#9ca3af', marginBottom: '16px' }} />
          <h3>No policies defined</h3>
          <p>Create your first data governance policy to manage data retention, access control, and encryption.</p>
          <button
            className="gps-btn gps-btn--primary"
            onClick={() => {
              setSelectedPolicy(null);
              setShowModal(true);
            }}
          >
            <FiPlus /> Create First Policy
          </button>
        </div>
      ) : (
        <div className="gps-table-container">
          <table className="gps-table">
            <thead>
              <tr>
                <th>Policy Id</th>
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
                  <td>{policy.policy_id}</td>
                  <td style={{ fontWeight: 500 }}>{policy.policy_name}</td>
                  <td>
                    <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={policy.description || ''}>
                      {policy.description || '-'}
                    </div>
                  </td>
                  <td>
                    {policy.rules && typeof policy.rules === 'string' ? (
                      <pre style={{ fontSize: '9px', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', margin: 0, maxWidth: '200px', overflow: 'auto' }}>
                        {JSON.stringify(JSON.parse(policy.rules), null, 2)}
                      </pre>
                    ) : policy.rules ? (
                      <pre style={{ fontSize: '9px', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', margin: 0, maxWidth: '200px', overflow: 'auto' }}>
                        {JSON.stringify(policy.rules, null, 2)}
                      </pre>
                    ) : (
                      <span className="gps-text-muted">No rules</span>
                    )}
                  </td>
                  <td>
                    {new Date(policy.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="gps-action-buttons">
                      <button
                        className="gps-icon-btn gps-icon-btn--edit"
                        onClick={() => {
                          setSelectedPolicy(policy);
                          setShowModal(true);
                        }}
                        title="Edit policy"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        className="gps-icon-btn gps-icon-btn--delete"
                        onClick={() => handleDelete(policy.policy_id)}
                        title="Delete policy"
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
  const [policyName, setPolicyName] = useState(policy?.policy_name || '');
  const [description, setDescription] = useState(policy?.description || '');
  const [retentionDays, setRetentionDays] = useState(policy?.rules?.retention_days || '');
  const [accessControl, setAccessControl] = useState(policy?.rules?.access_control || 'internal');
  const [encryptionRequired, setEncryptionRequired] = useState(policy?.rules?.encryption_required || false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!policyName) {
      onError('Policy Name is required');
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
    <div className="gps-modal-overlay">
      <div className="gps-modal" style={{ maxWidth: '500px' }}>
        <div className="gps-modal-header">
          <h2 className="gps-modal-title">{policy ? 'Edit Policy' : 'Create New Policy'}</h2>
          <button className="gps-modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="gps-modal-body">
          <div className="gps-form-group">
            <label className="gps-label">Policy Name</label>
            <input
              type="text"
              className="gps-input"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              placeholder="e.g., PII Data Retention Policy"
            />
          </div>

          <div className="gps-form-group">
            <label className="gps-label">Description</label>
            <textarea
              className="gps-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this policy"
              rows="3"
            />
          </div>

          <div className="gps-section" style={{ marginTop: '16px' }}>
            <h3 className="gps-section-title">Policy Rules</h3>

            <div className="gps-form-group">
              <label className="gps-label">Retention Period (days)</label>
              <input
                type="number"
                className="gps-input"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                placeholder="e.g., 90 (leave blank for no retention policy)"
              />
            </div>

            <div className="gps-form-group">
              <label className="gps-label">Access Control</label>
              <select
                className="gps-select"
                value={accessControl}
                onChange={(e) => setAccessControl(e.target.value)}
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>

            <div className="gps-form-group">
              <label className="gps-checkbox-label">
                <input
                  type="checkbox"
                  checked={encryptionRequired}
                  onChange={(e) => setEncryptionRequired(e.target.checked)}
                />
                <span>Require Encryption</span>
              </label>
            </div>
          </div>
        </div>
        <div className="gps-modal-footer">
          <button className="gps-btn gps-btn--secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="gps-btn gps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PolicyManagement;
