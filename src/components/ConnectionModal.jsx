import React, { useState, useEffect } from 'react';
import { FaFolder } from 'react-icons/fa';
import ThreeSectionModal from './ThreeSectionModal';
import S3FolderBrowser from './S3FolderBrowser';
import axios from 'axios';
import '../styles/VendorManagement.css';

const ConnectionModal = ({
  isOpen,
  onClose,
  onSuccess,
  connection = null,
  connectionDirection = 'source'
}) => {
  const [formData, setFormData] = useState({
    name: '',
    connection_user: 'Internal',
    connection_direction: 'source',
    description: '',
    authentication_method: 'key-based',
    provider: 'aws',
    // AWS fields
    region: '',
    bucket: '',
    access_key_id: '',
    secret_access_key: '',
    endpoint: '',
    use_ssl: true,
    // AWS IAM Role
    iam_role_arn: '',
    external_id: '',
    // GCP fields
    gcp_project_id: '',
    service_account_json: '',
    gcp_bucket: '',
    // GCP OIDC
    workload_identity_pool: '',
    workload_identity_provider: '',
    service_account_email: '',
    // Azure fields
    account_name: '',
    account_key: '',
    container_name: '',
    azure_endpoint: '',
    // Azure Managed Identity
    azure_resource_id: '',
    azure_client_id: '',
    // DB Token
    db_host: '',
    db_port: '',
    db_name: '',
    db_user: '',
    token_endpoint: '',
    // OAuth2
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_token_url: '',
    oauth_scopes: '',
    // Kerberos
    kerberos_principal: '',
    kerberos_keytab: '',
    kerberos_realm: '',
    // Common
    file_path: ''
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [savedConnectionId, setSavedConnectionId] = useState(null);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [connectionDetailsModified, setConnectionDetailsModified] = useState(false);
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testCredentials, setTestCredentials] = useState(null);
  
  const isEditMode = !!connection;
  const connectionId = savedConnectionId || connection?.connection_id;
  // Can browse if connection is saved OR test was successful, AND connection details haven't been modified
  const canBrowse = (!!connectionId || testSuccessful) && !connectionDetailsModified;
  
  useEffect(() => {
    if (connection) {
      const config = connection.config || {};
      const authConfig = connection.auth_config || {};
      setFormData({
        name: connection.name || '',
        connection_user: connection.connection_user || 'Internal',
        connection_direction: connection.connection_direction || 'source',
        description: connection.description || '',
        authentication_method: connection.authentication_method || 'key-based',
        provider: config.provider || 'aws',
        // AWS
        region: config.region || '',
        bucket: config.bucket || '',
        access_key_id: '',
        secret_access_key: '',
        endpoint: config.endpoint || '',
        use_ssl: config.use_ssl !== undefined ? config.use_ssl : true,
        // AWS IAM
        iam_role_arn: authConfig.iam_role_arn || '',
        external_id: authConfig.external_id || '',
        // GCP
        gcp_project_id: config.project_id || '',
        service_account_json: '',
        gcp_bucket: config.gcp_bucket || '',
        // GCP OIDC
        workload_identity_pool: authConfig.workload_identity_pool || '',
        workload_identity_provider: authConfig.workload_identity_provider || '',
        service_account_email: authConfig.service_account_email || '',
        // Azure
        account_name: config.account_name || '',
        account_key: '',
        container_name: config.container_name || '',
        azure_endpoint: config.azure_endpoint || '',
        // Azure Managed Identity
        azure_resource_id: authConfig.azure_resource_id || '',
        azure_client_id: authConfig.azure_client_id || '',
        // DB Token
        db_host: authConfig.db_host || '',
        db_port: authConfig.db_port || '',
        db_name: authConfig.db_name || '',
        db_user: authConfig.db_user || '',
        token_endpoint: authConfig.token_endpoint || '',
        // OAuth2
        oauth_client_id: authConfig.oauth_client_id || '',
        oauth_client_secret: '',
        oauth_token_url: authConfig.oauth_token_url || '',
        oauth_scopes: authConfig.oauth_scopes || '',
        // Kerberos
        kerberos_principal: authConfig.kerberos_principal || '',
        kerberos_keytab: '',
        kerberos_realm: authConfig.kerberos_realm || '',
        // Common
        file_path: config.path_prefix || ''
      });
      setSavedConnectionId(connection.connection_id);
    } else {
      // Reset for create mode - use connection direction to set defaults
      setFormData({
        name: '',
        connection_user: connectionDirection === 'drop' ? 'External' : 'Internal',
        connection_direction: connectionDirection || 'source',
        description: '',
        authentication_method: 'key-based',
        provider: 'aws',
        region: '',
        bucket: '',
        access_key_id: '',
        secret_access_key: '',
        endpoint: '',
        use_ssl: true,
        iam_role_arn: '',
        external_id: '',
        gcp_project_id: '',
        service_account_json: '',
        gcp_bucket: '',
        workload_identity_pool: '',
        workload_identity_provider: '',
        service_account_email: '',
        account_name: '',
        account_key: '',
        container_name: '',
        azure_endpoint: '',
        azure_resource_id: '',
        azure_client_id: '',
        db_host: '',
        db_port: '',
        db_name: '',
        db_user: '',
        token_endpoint: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_token_url: '',
        oauth_scopes: '',
        kerberos_principal: '',
        kerberos_keytab: '',
        kerberos_realm: '',
        file_path: ''
      });
      setSavedConnectionId(null);
    }
    setError('');
    setTestResult(null);
    setConnectionDetailsModified(false);
    setTestSuccessful(false);
    setTestCredentials(null);
  }, [connection, isOpen]);
  
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Track if connection details (not file_path) are modified in edit mode
    const connectionDetailFields = [
      // Core fields
      'connection_user', 'connection_direction', 'authentication_method',
      // Provider fields
      'provider', 'region', 'bucket', 'access_key_id', 'secret_access_key', 'endpoint', 'use_ssl',
      'gcp_project_id', 'service_account_json', 'gcp_bucket',
      'account_name', 'account_key', 'container_name', 'azure_endpoint',
      // Authentication-specific fields
      'iam_role_arn', 'external_id',
      'workload_identity_pool', 'workload_identity_provider', 'service_account_email',
      'azure_resource_id', 'azure_client_id',
      'db_host', 'db_port', 'db_name', 'db_user', 'token_endpoint',
      'oauth_client_id', 'oauth_client_secret', 'oauth_token_url', 'oauth_scopes',
      'kerberos_principal', 'kerberos_keytab', 'kerberos_realm'
    ];
    
    if (connectionDetailFields.includes(name)) {
      if (connectionId) {
        setConnectionDetailsModified(true);
      }
      // Clear test success and file path when connection details change
      setTestSuccessful(false);
      setTestCredentials(null);
      // Clear file path when connection details change (bucket, container, etc.)
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
        file_path: '' // Clear file path when connection details change
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Connection name is required');
      }
      
      if (formData.provider === 'aws' && !formData.bucket) {
        throw new Error('AWS bucket name is required');
      }
      
      if (formData.provider === 'gcp' && (!formData.gcp_project_id || !formData.gcp_bucket)) {
        throw new Error('GCP project ID and bucket are required');
      }
      
      if (formData.provider === 'azure' && (!formData.account_name || !formData.container_name)) {
        throw new Error('Azure account name and container are required');
      }
      
      // Prepare payload with file_path mapped to path_prefix and connection_direction
      const payload = {
        ...formData,
        path_prefix: formData.file_path,
        connection_direction: connectionDirection,
        connection_user: formData.connection_user,
        description: formData.description,
        authentication_method: formData.authentication_method
      };
      delete payload.file_path;
      
      const url = connectionId 
        ? `/api/connections/${connectionId}`
        : '/api/connections';
      
      const method = connectionId ? 'put' : 'post';
      
      const response = await axios[method](url, payload);
      
      // After first save, store the connection ID so user can browse
      // Backend returns { connection: { connection_id, ... } }
      if (!connectionId && response.data.connection?.connection_id) {
        setSavedConnectionId(response.data.connection.connection_id);
      }
      
      // Reset the modified flag to re-enable browsing after save
      setConnectionDetailsModified(false);
      
      // Call onSuccess to refresh the list
      onSuccess();
      
      // Don't close the modal - let user browse and set file path
      setError('');
      setTestResult({ success: true, message: 'Connection saved successfully! You can now browse and select a file path.' });
      
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save vendor connection');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTestConnection = async () => {
    // For new connections that haven't been saved yet
    if (!connectionId) {
      setError('');
      setTesting(true);
      setTestResult(null);
      
      try {
        // Validate required fields first
        if (!formData.name.trim()) {
          throw new Error('Connection name is required');
        }
        
        if (formData.provider === 'aws' && !formData.bucket) {
          throw new Error('AWS bucket name is required');
        }
        
        if (formData.provider === 'gcp' && (!formData.gcp_project_id || !formData.gcp_bucket)) {
          throw new Error('GCP project ID and bucket are required');
        }
        
        if (formData.provider === 'azure' && (!formData.account_name || !formData.container_name)) {
          throw new Error('Azure account name and container are required');
        }
        
        // Test the connection by attempting to create it
        const payload = {
          ...formData,
          path_prefix: formData.file_path || '',
          connection_direction: connectionDirection,
          connection_user: formData.connection_user,
          description: formData.description,
          authentication_method: formData.authentication_method
        };
        delete payload.file_path;
        
        const response = await axios.post('/api/connections/test', payload);
        
        // Store test credentials for browsing
        setTestSuccessful(true);
        setTestCredentials(payload);
        
        setTestResult({
          success: true,
          message: response.data.message || 'Connection test successful! You can now browse folders or save the connection.'
        });
      } catch (err) {
        setTestSuccessful(false);
        setTestCredentials(null);
        setTestResult({
          success: false,
          message: err.response?.data?.error || err.message || 'Connection test failed'
        });
      } finally {
        setTesting(false);
      }
      return;
    }
    
    // For existing saved connections
    setTesting(true);
    setTestResult(null);
    
    try {
      const response = await axios.post(`/api/connections/${connectionId}/test`);
      setTestResult(response.data);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection test failed'
      });
    } finally {
      setTesting(false);
    }
  };
  
  const handleBrowseClick = () => {
    if (!canBrowse) {
      setError('Please save the connection first before browsing');
      return;
    }
    setShowBrowseModal(true);
  };
  
  const handlePathSelect = (path) => {
    setFormData(prev => ({
      ...prev,
      file_path: path
    }));
    setShowBrowseModal(false);
  };
  
  const renderAuthenticationFields = () => {
    switch (formData.authentication_method) {
      case 'aws-iam-role':
        return (
          <>
            <div className="form-group">
              <label>IAM Role ARN *</label>
              <input
                type="text"
                name="iam_role_arn"
                value={formData.iam_role_arn}
                onChange={handleInputChange}
                required
                placeholder="arn:aws:iam::123456789012:role/MyRole"
              />
              <small style={{ color: '#6b7280', display: 'block', marginTop: '0.25rem' }}>
                The ARN of the IAM role to assume
              </small>
            </div>
            <div className="form-group">
              <label>External ID (Optional)</label>
              <input
                type="text"
                name="external_id"
                value={formData.external_id}
                onChange={handleInputChange}
                placeholder="Optional external ID for role assumption"
              />
            </div>
          </>
        );
      
      case 'gcp-sa-oidc':
        return (
          <>
            <div className="form-group">
              <label>Workload Identity Pool *</label>
              <input
                type="text"
                name="workload_identity_pool"
                value={formData.workload_identity_pool}
                onChange={handleInputChange}
                required
                placeholder="projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID"
              />
            </div>
            <div className="form-group">
              <label>Workload Identity Provider *</label>
              <input
                type="text"
                name="workload_identity_provider"
                value={formData.workload_identity_provider}
                onChange={handleInputChange}
                required
                placeholder="projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID"
              />
            </div>
            <div className="form-group">
              <label>Service Account Email *</label>
              <input
                type="email"
                name="service_account_email"
                value={formData.service_account_email}
                onChange={handleInputChange}
                required
                placeholder="sa-name@project-id.iam.gserviceaccount.com"
              />
            </div>
          </>
        );
      
      case 'azure-managed-identity':
        return (
          <>
            <div className="form-group">
              <label>Azure Resource ID *</label>
              <input
                type="text"
                name="azure_resource_id"
                value={formData.azure_resource_id}
                onChange={handleInputChange}
                required
                placeholder="/subscriptions/.../resourceGroups/.../providers/Microsoft.Storage/storageAccounts/..."
              />
            </div>
            <div className="form-group">
              <label>Client ID (Optional)</label>
              <input
                type="text"
                name="azure_client_id"
                value={formData.azure_client_id}
                onChange={handleInputChange}
                placeholder="Optional client ID for user-assigned managed identity"
              />
            </div>
          </>
        );
      
      case 'db-short-lived-token':
        return (
          <>
            <div className="form-group">
              <label>Database Host *</label>
              <input
                type="text"
                name="db_host"
                value={formData.db_host}
                onChange={handleInputChange}
                required
                placeholder="database.example.com"
              />
            </div>
            <div className="form-group">
              <label>Database Port *</label>
              <input
                type="number"
                name="db_port"
                value={formData.db_port}
                onChange={handleInputChange}
                required
                placeholder="5432"
              />
            </div>
            <div className="form-group">
              <label>Database Name *</label>
              <input
                type="text"
                name="db_name"
                value={formData.db_name}
                onChange={handleInputChange}
                required
                placeholder="mydb"
              />
            </div>
            <div className="form-group">
              <label>Database User *</label>
              <input
                type="text"
                name="db_user"
                value={formData.db_user}
                onChange={handleInputChange}
                required
                placeholder="dbuser"
              />
            </div>
            <div className="form-group">
              <label>Token Endpoint *</label>
              <input
                type="url"
                name="token_endpoint"
                value={formData.token_endpoint}
                onChange={handleInputChange}
                required
                placeholder="https://auth.example.com/token"
              />
            </div>
          </>
        );
      
      case 'oauth2':
        return (
          <>
            <div className="form-group">
              <label>OAuth Client ID *</label>
              <input
                type="text"
                name="oauth_client_id"
                value={formData.oauth_client_id}
                onChange={handleInputChange}
                required
                placeholder="client_id_from_provider"
              />
            </div>
            <div className="form-group">
              <label>OAuth Client Secret {!isEditMode && '*'}</label>
              <input
                type="password"
                name="oauth_client_secret"
                value={formData.oauth_client_secret}
                onChange={handleInputChange}
                required={!isEditMode}
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'client_secret_from_provider'}
              />
            </div>
            <div className="form-group">
              <label>Token URL *</label>
              <input
                type="url"
                name="oauth_token_url"
                value={formData.oauth_token_url}
                onChange={handleInputChange}
                required
                placeholder="https://oauth.example.com/token"
              />
            </div>
            <div className="form-group">
              <label>Scopes (Optional)</label>
              <input
                type="text"
                name="oauth_scopes"
                value={formData.oauth_scopes}
                onChange={handleInputChange}
                placeholder="read write"
              />
            </div>
          </>
        );
      
      case 'kerberos':
        return (
          <>
            <div className="form-group">
              <label>Kerberos Principal *</label>
              <input
                type="text"
                name="kerberos_principal"
                value={formData.kerberos_principal}
                onChange={handleInputChange}
                required
                placeholder="username@REALM.EXAMPLE.COM"
              />
            </div>
            <div className="form-group">
              <label>Kerberos Keytab {!isEditMode && '*'}</label>
              <textarea
                name="kerberos_keytab"
                value={formData.kerberos_keytab}
                onChange={handleInputChange}
                required={!isEditMode}
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'Base64-encoded keytab content'}
                rows="3"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', fontFamily: 'monospace', fontSize: '0.875rem' }}
              />
            </div>
            <div className="form-group">
              <label>Kerberos Realm *</label>
              <input
                type="text"
                name="kerberos_realm"
                value={formData.kerberos_realm}
                onChange={handleInputChange}
                required
                placeholder="REALM.EXAMPLE.COM"
              />
            </div>
          </>
        );
      
      case 'key-based':
      default:
        // Key-based authentication fields are provider-specific and rendered by renderProviderFields
        return null;
    }
  };
  
  const renderProviderFields = () => {
    switch (formData.provider) {
      case 'aws':
        return (
          <>
            <div className="form-group">
              <label>AWS Region</label>
              <input
                type="text"
                name="region"
                value={formData.region}
                onChange={handleInputChange}
                placeholder="us-east-1"
              />
            </div>
            
            <div className="form-group">
              <label>Bucket Name *</label>
              <input
                type="text"
                name="bucket"
                value={formData.bucket}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Access Key ID {!isEditMode && '*'}</label>
              <input
                type="text"
                name="access_key_id"
                value={formData.access_key_id}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
              />
            </div>
            
            <div className="form-group">
              <label>Secret Access Key {!isEditMode && '*'}</label>
              <input
                type="password"
                name="secret_access_key"
                value={formData.secret_access_key}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
              />
            </div>
            
            <div className="form-group">
              <label>Endpoint (Optional)</label>
              <input
                type="text"
                name="endpoint"
                value={formData.endpoint}
                onChange={handleInputChange}
                placeholder="s3.amazonaws.com"
              />
            </div>
            
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  name="use_ssl"
                  checked={formData.use_ssl}
                  onChange={handleInputChange}
                />
                {' '}Use SSL
              </label>
            </div>
          </>
        );
      
      case 'gcp':
        return (
          <>
            <div className="form-group">
              <label>GCP Project ID *</label>
              <input
                type="text"
                name="gcp_project_id"
                value={formData.gcp_project_id}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Bucket Name *</label>
              <input
                type="text"
                name="gcp_bucket"
                value={formData.gcp_bucket}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Service Account JSON (JSON format) {!isEditMode && '*'}</label>
              <textarea
                name="service_account_json"
                value={formData.service_account_json}
                onChange={handleInputChange}
                rows="4"
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'Paste service account JSON key file content'}
              />
              <small style={{ color: '#6b7280' }}>
                Paste the entire JSON key file content from GCP
              </small>
            </div>
          </>
        );
      
      case 'azure':
        return (
          <>
            <div className="form-group">
              <label>Account Name *</label>
              <input
                type="text"
                name="account_name"
                value={formData.account_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Container Name *</label>
              <input
                type="text"
                name="container_name"
                value={formData.container_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Account Key {!isEditMode && '*'}</label>
              <input
                type="password"
                name="account_key"
                value={formData.account_key}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
              />
            </div>
            
            <div className="form-group">
              <label>Endpoint (Optional)</label>
              <input
                type="text"
                name="azure_endpoint"
                value={formData.azure_endpoint}
                onChange={handleInputChange}
                placeholder="blob.core.windows.net"
              />
            </div>
          </>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <>
      <ThreeSectionModal
        isOpen={isOpen}
        onClose={onClose}
        title={isEditMode ? 'Edit Connection' : 'Create Connection'}
        size="large"
        footer={
          <>
            <button onClick={onClose} disabled={loading || testing}>
              Close
            </button>
            <button 
              type="button"
              onClick={handleTestConnection}
              disabled={testing || loading}
              style={{ background: '#10b981' }}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={loading || testing}
            >
              {loading ? 'Saving...' : connectionId ? 'Update' : 'Save'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="vendor-connection-form">
          <div className="form-group">
            <label>Connection Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="My Connection"
            />
          </div>
          
          <div className="form-group">
            <label>Connection User *</label>
            <select
              name="connection_user"
              value={formData.connection_user}
              onChange={handleInputChange}
              required
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
            <small style={{ color: '#6b7280', display: 'block', marginTop: '0.25rem' }}>
              Internal: Company-managed connections | External: Third-party/vendor connections
            </small>
          </div>
          
          <div className="form-group">
            <label>Connection Direction *</label>
            <select
              name="connection_direction"
              value={formData.connection_direction}
              onChange={handleInputChange}
              required
            >
              <option value="source">Source (Read From)</option>
              <option value="target">Target (Write To)</option>
            </select>
            <small style={{ color: '#6b7280', display: 'block', marginTop: '0.25rem' }}>
              Source: Read data from this connection | Target: Write data to this connection
            </small>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Brief description of this connection"
              rows="2"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
            />
          </div>
          
          <div className="form-group">
            <label>Authentication Method *</label>
            <select
              name="authentication_method"
              value={formData.authentication_method}
              onChange={handleInputChange}
              required
            >
              <option value="key-based">Key-Based (Access Keys/Secrets)</option>
              <option value="aws-iam-role">AWS IAM Role (Assume Role)</option>
              <option value="gcp-sa-oidc">GCP Service Account OIDC</option>
              <option value="azure-managed-identity">Azure Managed Identity</option>
              <option value="db-short-lived-token">Database Short-Lived Token</option>
              <option value="oauth2">OAuth 2.0</option>
              <option value="kerberos">Kerberos</option>
            </select>
            <small style={{ color: '#6b7280', display: 'block', marginTop: '0.25rem' }}>
              Choose the authentication method for this connection
            </small>
          </div>
          
          {renderAuthenticationFields()}
          
          <div className="form-group">
            <label>Provider *</label>
            <select
              name="provider"
              value={formData.provider}
              onChange={handleInputChange}
              required
            >
              <option value="aws">AWS S3</option>
              <option value="gcp">Google Cloud Storage</option>
              <option value="azure">Azure Blob Storage</option>
            </select>
          </div>
          
          {renderProviderFields()}
          
          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`} style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              {testResult.message}
            </div>
          )}
          
          <div className="form-group">
            <label>File Path (Optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                name="file_path"
                value={formData.file_path}
                onChange={handleInputChange}
                placeholder="vendors/uploads"
                disabled={!canBrowse}
                style={{ 
                  flex: 1,
                  backgroundColor: !canBrowse ? '#f3f4f6' : 'white',
                  cursor: !canBrowse ? 'not-allowed' : 'text'
                }}
              />
              <button
                type="button"
                onClick={handleBrowseClick}
                disabled={!canBrowse}
                style={{
                  padding: '0.5rem 1rem',
                  background: canBrowse ? '#4a90e2' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: canBrowse ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                title={!canBrowse ? 'Test connection or save to enable browsing' : 'Browse folders'}
              >
                <FaFolder /> Browse
              </button>
            </div>
            <small style={{ color: '#6b7280' }}>
              {!canBrowse 
                ? 'Test connection or save to enable folder browsing'
                : 'Folder path within the bucket/container. Click Browse to select from available folders.'
              }
            </small>
          </div>
          
          {error && (
            <div className="error-message" role="alert" style={{ marginTop: '1rem' }}>
              {error}
            </div>
          )}
        </form>
      </ThreeSectionModal>

      {/* Browse Modal */}
      {showBrowseModal && canBrowse && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2><FaFolder /> Browse File Path</h2>
              <button className="btn-icon" onClick={() => setShowBrowseModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <S3FolderBrowser
                connectionId={connectionId}
                rawCredentials={testCredentials}
                initialPath={formData.file_path || '/'}
                onSelectPath={handlePathSelect}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConnectionModal;
