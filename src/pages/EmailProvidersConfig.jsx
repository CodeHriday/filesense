import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiCheck, FiX, FiAlertCircle, FiSend } from 'react-icons/fi';
import PageLayout from '../components/PageLayout';
import Modal from '../components/Modal';
import ThreeSectionModal from '../components/ThreeSectionModal';
import './EmailProvidersConfig.css';
import '../styles/global-page-styles.css';
import * as alertService from '../api/alertService';
import axios from 'axios';

const PROVIDER_TYPES = {
  smtp: { label: 'SMTP' },
  gmail_oauth2: { label: 'Gmail OAuth2' },
  outlook_oauth2: { label: 'Outlook OAuth2' },
  sendgrid: { label: 'SendGrid' },
  ses: { label: 'AWS SES' },
  azure_email: { label: 'Azure Email' },
  gcp_email: { label: 'GCP SMTP Relay' }
};

export const EmailProvidersConfig = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    provider_type: 'smtp',
    config: {}
  });

  const showError = (message) => {
    setErrorMessage(message);
    setShowErrorModal(true);
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await alertService.getEmailConnections();
      
      // Handle both array and object response formats
      const connectionsList = Array.isArray(response) ? response : 
                             (response.connections || response.data || []);
      setConnections(connectionsList);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load email connections');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConnection = async () => {
    try {
      const payload = {
        name: formData.name,
        provider_type: formData.provider_type,
        config: formData.config
      };

      const response = await alertService.createEmailConnection(payload);
      
      if (response.success) {
        loadConnections();
        setShowCreateModal(false);
        resetForm();
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to create email connection');
    }
  };

  const handleDeleteClick = (connection) => {
    setConnectionToDelete(connection);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!connectionToDelete) return;

    try {
      const response = await alertService.deleteEmailConnection(connectionToDelete.connection_id);
      if (response.success) {
        loadConnections();
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete email connection');
    } finally {
      setShowDeleteModal(false);
      setConnectionToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setConnectionToDelete(null);
  };

  const handleTestConnection = async () => {
    if (!selectedConnection || !testEmail) return;

    try {
      setTestResult({ loading: true });
      const response = await alertService.testEmailConnection(selectedConnection.connection_id, testEmail);
      
      setTestResult({
        success: response.success,
        message: response.message || 'Test email sent successfully!'
      });
    } catch (err) {
      // Show detailed error message if available
      const errorMsg = err.response?.data?.error || 'Test failed';
      const details = err.response?.data?.details;
      const fullMessage = details && details !== errorMsg 
        ? `${errorMsg} (${details})`
        : errorMsg;
      
      setTestResult({
        success: false,
        message: fullMessage
      });
    }
  };

  const handleOAuth2Auth = async (providerType) => {
    try {
      // Call POST endpoint to get auth URL
      const token = localStorage.getItem('token');
      const provider = providerType === 'gmail_oauth2' ? 'gmail' : 'outlook';
      
      const response = await axios.post(
        `/api/email-connections/oauth2/${provider}/auth`,
        { name: formData.name },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.data.success) {
        showError(response.data.error || 'Failed to initiate OAuth2 flow');
        return;
      }

      const authUrl = response.data.auth_url;
      
      // Open OAuth2 authorization in new window
      const authWindow = window.open(authUrl, 'oauth2', 'width=600,height=700');
      
      // Listen for OAuth2 callback
      const handleMessage = (event) => {
        if (event.data && event.data.type === 'oauth2_success') {
          window.removeEventListener('message', handleMessage);
          authWindow?.close();
          
          // Connection created successfully
          loadConnections();
          setShowCreateModal(false);
          resetForm();
        } else if (event.data && event.data.type === 'oauth2_error') {
          window.removeEventListener('message', handleMessage);
          authWindow?.close();
          showError(event.data.error || 'OAuth2 authorization failed');
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to initiate OAuth2 flow');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      provider_type: 'smtp',
      config: {}
    });
  };

  const openTestModal = (connection) => {
    setSelectedConnection(connection);
    setTestEmail('');
    setTestResult(null);
    setShowTestModal(true);
  };

  const handleCloseTestModal = () => {
    setShowTestModal(false);
    setSelectedConnection(null);
    setTestEmail('');
    setTestResult(null);
  };

  const renderProviderForm = () => {
    const { provider_type } = formData;

    if (provider_type === 'gmail_oauth2' || provider_type === 'outlook_oauth2') {
      return (
        <div className="oauth2-section">
          <div className="info-box">
            <FiAlertCircle />
            <p>Click the button below to authorize access to your {provider_type === 'gmail_oauth2' ? 'Gmail' : 'Outlook'} account.</p>
          </div>
          <button
            onClick={() => handleOAuth2Auth(provider_type)}
            className="btn-primary"
            disabled={!formData.name}
          >
            Authorize {provider_type === 'gmail_oauth2' ? 'Gmail' : 'Outlook'}
          </button>
        </div>
      );
    }

    if (provider_type === 'smtp') {
      return (
        <>
          <div className="form-row-grid">
            <div className="form-group">
              <label>SMTP Host <span className="required-field">*</span></label>
              <input
                type="text"
                value={formData.config.host || ''}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, host: e.target.value } })}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="form-group">
              <label>Port <span className="required-field">*</span></label>
              <input
                type="number"
                value={formData.config.port || 587}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, port: parseInt(e.target.value) } })}
              />
            </div>
          </div>

          <div className="form-row-grid">
            <div className="form-group">
              <label>Username <span className="required-field">*</span></label>
              <input
                type="text"
                value={formData.config.username || ''}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, username: e.target.value } })}
              />
            </div>
            <div className="form-group">
              <label>Password <span className="required-field">*</span></label>
              <input
                type="password"
                value={formData.config.password || ''}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, password: e.target.value } })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>From Email <span className="required-field">*</span></label>
            <input
              type="email"
              value={formData.config.from || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, from: e.target.value } })}
              placeholder="alerts@example.com"
            />
          </div>

          <div className="checkbox-group">
            <input
              type="checkbox"
              checked={formData.config.secure !== false}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, secure: e.target.checked } })}
              id="smtp-secure"
            />
            <label htmlFor="smtp-secure">Use TLS (recommended)</label>
          </div>
        </>
      );
    }

    if (provider_type === 'sendgrid') {
      return (
        <>
          <div className="form-group">
            <label>API Key <span className="required-field">*</span></label>
            <input
              type="password"
              value={formData.config.apiKey || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, apiKey: e.target.value } })}
              placeholder="SG.xxxxxxxxxxxxx"
            />
          </div>
          <div className="form-group">
            <label>From Email <span className="required-field">*</span></label>
            <input
              type="email"
              value={formData.config.from || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, from: e.target.value } })}
              placeholder="alerts@example.com"
            />
          </div>
        </>
      );
    }

    if (provider_type === 'ses') {
      return (
        <>
          <div className="form-group">
            <label>AWS Region <span className="required-field">*</span></label>
            <input
              type="text"
              value={formData.config.region || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, region: e.target.value } })}
              placeholder="us-east-1"
            />
          </div>
          <div className="form-row-grid">
            <div className="form-group">
              <label>Access Key ID <span className="required-field">*</span></label>
              <input
                type="text"
                value={formData.config.accessKeyId || ''}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, accessKeyId: e.target.value } })}
              />
            </div>
            <div className="form-group">
              <label>Secret Access Key <span className="required-field">*</span></label>
              <input
                type="password"
                value={formData.config.secretAccessKey || ''}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, secretAccessKey: e.target.value } })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>From Email <span className="required-field">*</span></label>
            <input
              type="email"
              value={formData.config.from || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, from: e.target.value } })}
              placeholder="alerts@example.com"
            />
          </div>
        </>
      );
    }

    if (provider_type === 'azure_email') {
      return (
        <>
          <div className="form-group">
            <label>Endpoint <span className="required-field">*</span></label>
            <input
              type="text"
              value={formData.config.endpoint || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, endpoint: e.target.value } })}
              placeholder="https://<resource-name>.communication.azure.com"
            />
          </div>
          <div className="form-group">
            <label>Access Key <span className="required-field">*</span></label>
            <input
              type="password"
              value={formData.config.accessKey || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, accessKey: e.target.value } })}
            />
          </div>
          <div className="form-group">
            <label>From Email <span className="required-field">*</span></label>
            <input
              type="email"
              value={formData.config.from || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, from: e.target.value } })}
              placeholder="DoNotReply@<resource-name>.azurecomm.net"
            />
          </div>
        </>
      );
    }

    if (provider_type === 'gcp_email') {
      return (
        <>
          <div className="form-row-grid">
            <div className="form-group">
              <label>SMTP Host <span className="required-field">*</span></label>
              <input
                type="text"
                value={formData.config.host || 'smtp-relay.gmail.com'}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, host: e.target.value } })}
              />
            </div>
            <div className="form-group">
              <label>Port <span className="required-field">*</span></label>
              <input
                type="number"
                value={formData.config.port || 587}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, port: parseInt(e.target.value) } })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>From Email <span className="required-field">*</span></label>
            <input
              type="email"
              value={formData.config.from || ''}
              onChange={(e) => setFormData({ ...formData, config: { ...formData.config, from: e.target.value } })}
              placeholder="alerts@example.com"
            />
          </div>
        </>
      );
    }

    return null;
  };

  const isFormValid = () => {
    if (!formData.name) return false;

    const { provider_type, config } = formData;

    if (provider_type === 'gmail_oauth2' || provider_type === 'outlook_oauth2') {
      return true; // OAuth2 handled separately
    }

    if (provider_type === 'smtp') {
      return config.host && config.port && config.username && config.password && config.from;
    }

    if (provider_type === 'sendgrid') {
      return config.apiKey && config.from;
    }

    if (provider_type === 'ses') {
      return config.region && config.accessKeyId && config.secretAccessKey && config.from;
    }

    if (provider_type === 'azure_email') {
      return config.endpoint && config.accessKey && config.from;
    }

    if (provider_type === 'gcp_email') {
      return config.host && config.port && config.from;
    }

    return false;
  };

  if (loading) {
    return (
      <PageLayout 
        title="Email Providers" 
        subtitle="Configure email providers for sending alert notifications"
      >
        <div className="loading-state">Loading email providers...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Email Providers" 
      subtitle="Configure email providers for sending alert notifications"
      headerActions={
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <FiPlus />
          Add Provider
        </button>
      }
    >
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="gps-table-container">
        <table className="gps-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider Type</th>
              <th>From Email</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <tr>
                <td colSpan="4" className="gps-table-empty">
                  No email providers configured. Add an email provider to start sending alert notifications.
                </td>
              </tr>
            ) : (
              connections.map((connection) => (
                <tr key={connection.connection_id}>
                  <td>
                    <span className="provider-name-cell">{connection.name}</span>
                  </td>
                  <td>
                    <span className="provider-type-badge">
                      {PROVIDER_TYPES[connection.provider_type]?.label || connection.provider_type}
                    </span>
                  </td>
                  <td>
                    <span className="from-email-cell">{connection.config?.from || '-'}</span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        onClick={() => openTestModal(connection)}
                        className="gps-action-btn gps-action-btn--primary"
                        title="Test Connection"
                      >
                        <FiSend size={14} />
                        <span>Test</span>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(connection)}
                        className="gps-action-btn gps-action-btn--danger"
                        title="Delete Provider"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ThreeSectionModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="Add Email Provider"
        size="medium"
        footer={
          <>
            <button
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
            >
              Cancel
            </button>
            {formData.provider_type !== 'gmail_oauth2' && formData.provider_type !== 'outlook_oauth2' && (
              <button
                onClick={handleCreateConnection}
                disabled={!isFormValid()}
              >
                Add Provider
              </button>
            )}
          </>
        }
      >
        <div className="form-group">
          <label>Connection Name <span className="required-field">*</span></label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Production Alerts"
          />
        </div>

        <div className="form-group">
          <label>Provider Type <span className="required-field">*</span></label>
          <select
            value={formData.provider_type}
            onChange={(e) => setFormData({ ...formData, provider_type: e.target.value, config: {} })}
          >
            {Object.entries(PROVIDER_TYPES).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </div>

        {renderProviderForm()}
      </ThreeSectionModal>

      <ThreeSectionModal
        isOpen={showTestModal}
        onClose={handleCloseTestModal}
        title={`Test Email Connection - ${selectedConnection?.name || ''}`}
        size="small"
        footer={
          <>
            <button onClick={handleCloseTestModal}>
              Close
            </button>
            <button
              onClick={handleTestConnection}
              disabled={!testEmail || testResult?.loading}
            >
              {testResult?.loading ? 'Sending...' : 'Send Test Email'}
            </button>
          </>
        }
      >
        <p className="gps-help-text" style={{ marginBottom: '12px' }}>
          Send a test email to verify your email provider configuration.
        </p>

        <div className="form-group">
          <label className="gps-form-label">Recipient Email <span className="required-field">*</span></label>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="test@example.com"
          />
        </div>

        {testResult && !testResult.loading && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.success ? <FiCheck /> : <FiX />}
            <span>{testResult.message}</span>
          </div>
        )}
      </ThreeSectionModal>

      <Modal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        title="Delete Email Provider"
        size="small"
        footer={
          <>
            <button onClick={handleCancelDelete} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleConfirmDelete} className="btn-danger">
              Delete
            </button>
          </>
        }
      >
        <div className="confirmation-body">
          <FiAlertCircle size={32} color="#e53e3e" />
          <p>
            Are you sure you want to delete the email provider <strong>"{connectionToDelete?.name}"</strong>?
          </p>
          <p className="warning-text">This action cannot be undone.</p>
        </div>
      </Modal>

      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Error"
        size="small"
        footer={
          <button onClick={() => setShowErrorModal(false)} className="btn-primary">
            OK
          </button>
        }
      >
        <div className="confirmation-body">
          <FiAlertCircle size={32} color="#e53e3e" />
          <p>{errorMessage}</p>
        </div>
      </Modal>
    </PageLayout>
  );
};
