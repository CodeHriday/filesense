import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi';
import PageLayout from '../components/PageLayout';
import Card from '../components/Card';
import Modal from '../components/Modal';
import ThreeSectionModal from '../components/ThreeSectionModal';
import './EmailProvidersConfig.css';
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
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    provider_type: 'smtp',
    config: {}
  });

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
      alert(err.response?.data?.error || 'Failed to create email connection');
    }
  };

  const handleDeleteConnection = async (connectionId) => {
    if (!window.confirm('Are you sure you want to delete this email connection?')) return;

    try {
      const response = await alertService.deleteEmailConnection(connectionId);
      if (response.success) {
        loadConnections();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete email connection');
    }
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
      setTestResult({
        success: false,
        message: err.response?.data?.error || 'Test failed'
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
        alert(response.data.error || 'Failed to initiate OAuth2 flow');
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
          alert('Email connection created successfully!');
        } else if (event.data && event.data.type === 'oauth2_error') {
          window.removeEventListener('message', handleMessage);
          authWindow?.close();
          alert(event.data.error || 'OAuth2 authorization failed');
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to initiate OAuth2 flow');
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

      {connections.length === 0 ? (
        <Card>
          <div className="empty-state">
            <h3>No email providers configured</h3>
            <p>Add an email provider to start sending alert notifications</p>
          </div>
        </Card>
      ) : (
        <div className="providers-grid">
          {connections.map((connection) => (
            <Card key={connection.connection_id}>
              <div className="provider-card">
                <div className="provider-header">
                  <div className="provider-info">
                    <h3 className="provider-name">{connection.name}</h3>
                    <span className="provider-type">
                      {PROVIDER_TYPES[connection.provider_type]?.label || connection.provider_type}
                    </span>
                  </div>
                </div>

                {connection.config?.from && (
                  <div className="provider-details">
                    <div className="detail-item">
                      <span className="detail-label">From:</span>
                      <span className="detail-value">{connection.config.from}</span>
                    </div>
                  </div>
                )}

                <div className="provider-actions">
                  <button
                    onClick={() => openTestModal(connection)}
                    className="btn-icon btn-icon-blue"
                    title="Test Connection"
                  >
                    <FiCheck />
                  </button>
                  <button
                    onClick={() => handleDeleteConnection(connection.connection_id)}
                    className="btn-icon btn-icon-red"
                    title="Delete Provider"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

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

      <Modal
        isOpen={showTestModal}
        onClose={() => {
          setShowTestModal(false);
          setSelectedConnection(null);
          setTestEmail('');
          setTestResult(null);
        }}
        title={`Test Email Connection - ${selectedConnection?.name || ''}`}
        size="medium"
      >
        <div className="test-modal">
          <p className="test-description">
            Send a test email to verify your email provider configuration.
          </p>

          <div className="form-group">
            <label className="form-label">Recipient Email *</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="form-input"
              placeholder="test@example.com"
            />
          </div>

          {testResult && !testResult.loading && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? <FiCheck /> : <FiX />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="modal-actions">
            <button
              onClick={() => {
                setShowTestModal(false);
                setSelectedConnection(null);
                setTestEmail('');
                setTestResult(null);
              }}
              className="btn-secondary"
            >
              Close
            </button>
            <button
              onClick={handleTestConnection}
              className="btn-primary"
              disabled={!testEmail || testResult?.loading}
            >
              {testResult?.loading ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
