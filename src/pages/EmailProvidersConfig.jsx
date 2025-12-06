import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiCheck, FiX, FiAlertCircle, FiSend, FiEdit2 } from 'react-icons/fi';
import PageLayout from '../components/PageLayout';
import ThreeSectionModal from '../components/ThreeSectionModal';
import ConfirmationModal from '../components/ConfirmationModal';
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
  const [editMode, setEditMode] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);

  const [allowedDomains, setAllowedDomains] = useState([]);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainDescription, setNewDomainDescription] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [showDomainDeleteModal, setShowDomainDeleteModal] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState(null);

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
    loadAllowedDomains();
  }, []);

  const loadAllowedDomains = async () => {
    try {
      const response = await axios.get('/api/allowed-email-domains');
      if (response.data.success) {
        setAllowedDomains(response.data.domains || []);
      }
    } catch (err) {
      console.error('Failed to load allowed domains:', err);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    
    setAddingDomain(true);
    try {
      const response = await axios.post('/api/allowed-email-domains', {
        domain: newDomain.trim(),
        description: newDomainDescription.trim() || null
      });
      
      if (response.data.success) {
        setAllowedDomains([...allowedDomains, response.data.domain]);
        setNewDomain('');
        setNewDomainDescription('');
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to add domain');
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomainClick = (domain) => {
    setDomainToDelete(domain);
    setShowDomainDeleteModal(true);
  };

  const handleConfirmDeleteDomain = async () => {
    if (!domainToDelete) return;
    
    try {
      await axios.delete(`/api/allowed-email-domains/${domainToDelete.id}`);
      setAllowedDomains(allowedDomains.filter(d => d.id !== domainToDelete.id));
      setShowDomainDeleteModal(false);
      setDomainToDelete(null);
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to delete domain');
    }
  };

  const handleToggleDomainStatus = async (domain) => {
    try {
      const response = await axios.put(`/api/allowed-email-domains/${domain.id}`, {
        is_active: !domain.is_active
      });
      
      if (response.data.success) {
        setAllowedDomains(allowedDomains.map(d => 
          d.id === domain.id ? response.data.domain : d
        ));
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update domain');
    }
  };

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

  const handleEditClick = (connection) => {
    setEditMode(true);
    setEditingConnection(connection);
    setFormData({
      name: connection.name,
      provider_type: connection.provider_type,
      config: connection.config || {}
    });
    setShowCreateModal(true);
  };

  const handleUpdateConnection = async () => {
    if (!editingConnection) return;
    
    try {
      const payload = {
        name: formData.name,
        provider_type: formData.provider_type,
        config: formData.config
      };

      const response = await alertService.updateEmailConnection(editingConnection.connection_id, payload);
      
      if (response.success) {
        loadConnections();
        setShowCreateModal(false);
        resetForm();
        setEditMode(false);
        setEditingConnection(null);
      }
    } catch (err) {
      showError(err.response?.data?.error || 'Failed to update email connection');
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
      let details = err.response?.data?.details;
      
      // Ensure details is always a string (handle object errors)
      if (details && typeof details === 'object') {
        if (details.errors && Array.isArray(details.errors)) {
          details = details.errors.map(e => e.message || String(e)).join('; ');
        } else if (details.message) {
          details = details.message;
        } else {
          details = JSON.stringify(details);
        }
      }
      
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
    setEditMode(false);
    setEditingConnection(null);
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
                        onClick={() => handleEditClick(connection)}
                        className="gps-action-btn gps-action-btn--secondary"
                        title="Edit Provider"
                      >
                        <FiEdit2 size={14} />
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

      <div className="gps-section-divider" style={{ margin: '32px 0', borderTop: '1px solid #e2e8f0' }} />

      <div className="gps-section">
        <div className="gps-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '600', color: '#025043', margin: 0 }}>Allowed Email Domains</h3>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#6b7280', margin: '4px 0 0 0' }}>
              Configure which email domains are allowed to receive notifications. If no domains are configured, all domains are allowed.
            </p>
          </div>
        </div>

        <div className="gps-add-domain-form" style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com"
            style={{ 
              flex: '1 1 200px', 
              maxWidth: '200px',
              padding: '8px 12px', 
              border: '1px solid #e2e8f0', 
              borderRadius: '4px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '12px'
            }}
          />
          <input
            type="text"
            value={newDomainDescription}
            onChange={(e) => setNewDomainDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ 
              flex: '2 1 250px', 
              maxWidth: '300px',
              padding: '8px 12px', 
              border: '1px solid #e2e8f0', 
              borderRadius: '4px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '12px'
            }}
          />
          <button
            onClick={handleAddDomain}
            disabled={!newDomain.trim() || addingDomain}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flex: '0 0 auto', width: 'auto' }}
          >
            <FiPlus size={14} />
            {addingDomain ? 'Adding...' : 'Add Domain'}
          </button>
        </div>

        {allowedDomains.length === 0 ? (
          <div style={{ 
            padding: '24px', 
            textAlign: 'center', 
            color: '#6b7280', 
            backgroundColor: '#f9fafb', 
            borderRadius: '6px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px'
          }}>
            No allowed domains configured. All email domains are currently permitted.
          </div>
        ) : (
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allowedDomains.map((domain) => (
                  <tr key={domain.id}>
                    <td>
                      <span style={{ fontWeight: '500' }}>{domain.domain}</span>
                    </td>
                    <td>
                      <span style={{ color: '#6b7280' }}>{domain.description || '-'}</span>
                    </td>
                    <td>
                      <span 
                        className={`status-badge ${domain.is_active ? 'status-badge--success' : 'status-badge--inactive'}`}
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          backgroundColor: domain.is_active ? '#dcfce7' : '#f3f4f6',
                          color: domain.is_active ? '#166534' : '#6b7280'
                        }}
                      >
                        {domain.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          onClick={() => handleToggleDomainStatus(domain)}
                          className="gps-action-btn gps-action-btn--secondary"
                          title={domain.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {domain.is_active ? <FiX size={14} /> : <FiCheck size={14} />}
                        </button>
                        <button
                          onClick={() => handleDeleteDomainClick(domain)}
                          className="gps-action-btn gps-action-btn--danger"
                          title="Delete Domain"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ThreeSectionModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title={editMode ? "Edit Email Provider" : "Add Email Provider"}
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
            {(editMode || (formData.provider_type !== 'gmail_oauth2' && formData.provider_type !== 'outlook_oauth2')) && (
              <button
                onClick={editMode ? handleUpdateConnection : handleCreateConnection}
                disabled={!isFormValid()}
              >
                {editMode ? 'Update Provider' : 'Add Provider'}
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

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete Email Provider"
        message={<>Are you sure you want to delete the email provider <strong>"{connectionToDelete?.name}"</strong>?</>}
        subMessage="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showDomainDeleteModal}
        onClose={() => {
          setShowDomainDeleteModal(false);
          setDomainToDelete(null);
        }}
        onConfirm={handleConfirmDeleteDomain}
        title="Delete Email Domain"
        message={<>Are you sure you want to delete the domain <strong>"{domainToDelete?.domain}"</strong>?</>}
        subMessage="Emails will no longer be allowed to this domain."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onConfirm={() => setShowErrorModal(false)}
        title="Error"
        message={errorMessage}
        confirmText="OK"
        variant="danger"
        showCancel={false}
      />
    </PageLayout>
  );
};
