import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
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

Toast.propTypes = {
  message: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired
};

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

NotificationModal.propTypes = {
  message: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired
};

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

ConfirmModal.propTypes = {
  message: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

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
  const [validationErrors, setValidationErrors] = useState({});

  const validatePolicyName = (value) => {
    const specialCharsRegex = /[!@#$%^&*()+=\[\]{};':"\\|,.<>\/?]/;
    if (specialCharsRegex.test(value)) {
      return 'Policy name cannot contain special characters';
    }
    return '';
  };

  const validateRetentionDays = (value) => {
    if (value === '' || value === null) return '';
    const num = parseInt(value, 10);
    if (isNaN(num) || num <= 0 || !Number.isInteger(Number(value))) {
      return 'Retention period must be a positive integer';
    }
    return '';
  };

  const handlePolicyNameChange = (e) => {
    const value = e.target.value;
    setPolicyName(value);
    const error = validatePolicyName(value);
    setValidationErrors(prev => ({ ...prev, policyName: error }));
  };

  const handleRetentionDaysChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setRetentionDays(value);
      const error = validateRetentionDays(value);
      setValidationErrors(prev => ({ ...prev, retentionDays: error }));
    }
  };

  const handleSave = async () => {
    const nameError = validatePolicyName(policyName);
    const retentionError = validateRetentionDays(retentionDays);
    
    if (!policyName.trim()) {
      onError('Policy Name is required');
      return;
    }
    
    if (nameError) {
      onError(nameError);
      return;
    }
    
    if (retentionError) {
      onError(retentionError);
      return;
    }

    try {
      setSaving(true);
      const rules = {
        retention_days: retentionDays ? parseInt(retentionDays, 10) : null,
        access_control: accessControl,
        encryption_required: encryptionRequired
      };

      if (policy) {
        await axios.put(`/api/governance-policies/${policy.policy_id}`, {
          policy_name: policyName.trim(),
          description: description.trim(),
          rules
        });
        onSave('Policy updated successfully');
      } else {
        await axios.post('/api/governance-policies', {
          policy_name: policyName.trim(),
          description: description.trim(),
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
    <div className="gps-modal-overlay" onClick={onClose}>
      <div className="gps-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="gps-modal-header">
          <h2 className="gps-modal-title">{policy ? 'Edit Policy' : 'Create New Policy'}</h2>
          <button className="gps-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="gps-modal-body">
          <div className="gps-form-group">
            <label htmlFor="policy-name" className="gps-form-label">Policy Name <span className="gps-required">*</span></label>
            <input
              id="policy-name"
              type="text"
              className={`gps-form-input ${validationErrors.policyName ? 'gps-form-input--error' : ''}`}
              value={policyName}
              onChange={handlePolicyNameChange}
              placeholder="e.g., PII Data Retention Policy"
              maxLength={100}
            />
            {validationErrors.policyName && (
              <span className="gps-form-error">{validationErrors.policyName}</span>
            )}
            <small className="gps-form-help">Letters, numbers, spaces, hyphens and underscores only</small>
          </div>

          <div className="gps-form-group">
            <label htmlFor="description" className="gps-form-label">Description</label>
            <textarea
              id="description"
              className="gps-form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this policy"
              rows="4"
            />
          </div>

          <div className="gps-divider" style={{ margin: '20px 0' }}></div>

          <div className="gps-form-section">
            <h3 className="gps-form-section__title" style={{ fontSize: '14px', marginBottom: '16px' }}>Policy Rules</h3>

            <div className="gps-form-group">
              <label htmlFor="retention-days" className="gps-form-label">Retention Period (days)</label>
              <input
                id="retention-days"
                type="text"
                inputMode="numeric"
                className={`gps-form-input ${validationErrors.retentionDays ? 'gps-form-input--error' : ''}`}
                value={retentionDays}
                onChange={handleRetentionDaysChange}
                placeholder="e.g., 90"
                style={{ maxWidth: '200px' }}
              />
              {validationErrors.retentionDays && (
                <span className="gps-form-error">{validationErrors.retentionDays}</span>
              )}
              <small className="gps-form-help">Leave blank for no retention limit</small>
            </div>

            <div className="gps-form-group">
              <label htmlFor="access-control" className="gps-form-label">Access Control</label>
              <select
                id="access-control"
                className="gps-select"
                value={accessControl}
                onChange={(e) => setAccessControl(e.target.value)}
                style={{ maxWidth: '200px' }}
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>

            <div className="gps-form-group" style={{ marginTop: '16px' }}>
              <label className="gps-checkbox-wrapper">
                <input
                  id="encryption-required"
                  type="checkbox"
                  className="gps-checkbox"
                  checked={encryptionRequired}
                  onChange={(e) => setEncryptionRequired(e.target.checked)}
                />
                <span className="gps-checkbox-label">Require Encryption</span>
              </label>
            </div>
          </div>
        </div>
        <div className="gps-modal-footer">
          <button className="gps-btn gps-btn--secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button 
            className="gps-btn gps-btn--primary" 
            onClick={handleSave} 
            disabled={saving || !!validationErrors.policyName || !!validationErrors.retentionDays}
          >
            {saving ? 'Saving...' : 'Save Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

PolicyModal.propTypes = {
  policy: PropTypes.shape({
    policy_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    policy_name: PropTypes.string,
    description: PropTypes.string,
    rules: PropTypes.shape({
      retention_days: PropTypes.number,
      access_control: PropTypes.string,
      encryption_required: PropTypes.bool
    })
  }),
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired
};

export default PolicyManagement;
