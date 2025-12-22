import React, { useState, useEffect } from 'react';
import { FaFolder } from 'react-icons/fa';
import ThreeSectionModal from './ThreeSectionModal';
import S3FolderBrowser from './S3FolderBrowser';
import axios from 'axios';
import '../styles/VendorManagement.css';
import PropTypes from 'prop-types';

const ConnectionModal = ({
  isOpen,
  onClose,
  onSuccess,
  connection = null,
  connectionDirection = 'source'
}) => {
  // Compact styling - Inter 12px medium weight, minimal spacing
  const compactStyles = {
    formGroup: {
      marginBottom: '0.75rem'
    },
    label: {
      display: 'block',
      marginBottom: '0.25rem',
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      fontWeight: 500,
      color: '#1f2937'
    },
    input: {
      width: '100%',
      padding: '0.375rem 0.5rem',
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      fontWeight: 500,
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      height: '32px'
    },
    select: {
      width: '100%',
      padding: '0.375rem 0.5rem',
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      fontWeight: 500,
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      height: '32px',
      backgroundColor: 'white'
    },
    textarea: {
      width: '100%',
      padding: '0.375rem 0.5rem',
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      fontWeight: 500,
      border: '1px solid #d1d5db',
      borderRadius: '4px'
    },
    helperText: {
      display: 'block',
      marginTop: '0.25rem',
      fontFamily: 'Inter, sans-serif',
      fontSize: '11px',
      fontWeight: 400,
      color: '#6b7280'
    }
  };
  
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
    file_path: '',
    // Archive password
    archive_password: '',
    has_archive_password: false
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
  
  // Validation function to check if all required fields are filled
  const isFormValid = () => {
    // Base required fields
    if (!formData.name?.trim()) return false;
    if (!formData.connection_user) return false;
    if (!formData.connection_direction) return false;
    if (!formData.authentication_method) return false;
    if (!formData.provider) return false;
    
    // Provider-specific validation
    if (formData.provider === 'aws') {
      if (!formData.region?.trim()) return false;
      if (!formData.bucket?.trim()) return false;
      // In create mode, access keys are required for key-based auth
      if (!isEditMode && formData.authentication_method === 'key-based') {
        if (!formData.access_key_id?.trim()) return false;
        if (!formData.secret_access_key?.trim()) return false;
      }
    } else if (formData.provider === 'gcp') {
      if (!formData.gcp_project_id?.trim()) return false;
      if (!formData.gcp_bucket?.trim()) return false;
      if (!isEditMode && formData.authentication_method === 'key-based') {
        if (!formData.service_account_json?.trim()) return false;
      }
    } else if (formData.provider === 'azure') {
      if (!formData.account_name?.trim()) return false;
      if (!formData.container_name?.trim()) return false;
      if (!isEditMode && formData.authentication_method === 'key-based') {
        if (!formData.account_key?.trim()) return false;
      }
    }
    
    // Authentication method specific validation
    if (formData.authentication_method === 'aws-iam-role') {
      if (!formData.iam_role_arn?.trim()) return false;
    } else if (formData.authentication_method === 'gcp-sa-oidc') {
      if (!formData.workload_identity_pool?.trim()) return false;
      if (!formData.workload_identity_provider?.trim()) return false;
      if (!formData.service_account_email?.trim()) return false;
    } else if (formData.authentication_method === 'azure-managed-identity') {
      if (!formData.azure_resource_id?.trim()) return false;
    } else if (formData.authentication_method === 'db-short-lived-token') {
      if (!formData.db_host?.trim()) return false;
      if (!formData.db_port) return false;
      if (!formData.db_name?.trim()) return false;
      if (!formData.db_user?.trim()) return false;
      if (!formData.token_endpoint?.trim()) return false;
    } else if (formData.authentication_method === 'oauth2') {
      if (!formData.oauth_client_id?.trim()) return false;
      if (!isEditMode && !formData.oauth_client_secret?.trim()) return false;
      if (!formData.oauth_token_url?.trim()) return false;
    } else if (formData.authentication_method === 'kerberos') {
      if (!formData.kerberos_principal?.trim()) return false;
      if (!isEditMode && !formData.kerberos_keytab?.trim()) return false;
      if (!formData.kerberos_realm?.trim()) return false;
    }
    
    // Archive password validation
    if (formData.has_archive_password && !isEditMode) {
      if (!formData.archive_password?.trim()) return false;
    }
    
    return true;
  };
  
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
        file_path: config.path_prefix || '',
        // Archive password (flag only, never send actual password)
        archive_password: '',
        has_archive_password: connection.has_archive_password || false
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
        file_path: '',
        // Archive password
        archive_password: '',
        has_archive_password: false
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
        
        // Store test credentials for browsing (ensure provider is explicitly retained)
        setTestSuccessful(true);
        setTestCredentials({
          ...payload,
          provider: formData.provider || 'aws',
          storage_type: formData.provider || 'aws'  // Backend compatibility
        });
        
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
            <div style={compactStyles.formGroup}>
              <label htmlFor="iam_role_arn" style={compactStyles.label}>IAM Role ARN <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="iam_role_arn"
                type="text"
                name="iam_role_arn"
                value={formData.iam_role_arn}
                onChange={handleInputChange}
                required
                placeholder="arn:aws:iam::123456789012:role/MyRole"
                style={compactStyles.input}
              />
              <small style={compactStyles.helperText}>
                The ARN of the IAM role to assume
              </small>
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="external_id" style={compactStyles.label}>External ID (Optional)</label>
              <input
                id="external_id"
                type="text"
                name="external_id"
                value={formData.external_id}
                onChange={handleInputChange}
                placeholder="Optional external ID for role assumption"
                style={compactStyles.input}
              />
            </div>
          </>
        );
      
      case 'gcp-sa-oidc':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="workload_identity_pool" style={compactStyles.label}>Workload Identity Pool <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="workload_identity_pool"
                type="text"
                name="workload_identity_pool"
                value={formData.workload_identity_pool}
                onChange={handleInputChange}
                required
                placeholder="projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="workload_identity_provider" style={compactStyles.label}>Workload Identity Provider <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="workload_identity_provider"
                type="text"
                name="workload_identity_provider"
                value={formData.workload_identity_provider}
                onChange={handleInputChange}
                required
                placeholder="projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="service_account_email" style={compactStyles.label}>Service Account Email <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="service_account_email"
                type="email"
                name="service_account_email"
                value={formData.service_account_email}
                onChange={handleInputChange}
                required
                placeholder="sa-name@project-id.iam.gserviceaccount.com"
                style={compactStyles.input}
              />
            </div>
          </>
        );
      
      case 'azure-managed-identity':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="azure_resource_id" style={compactStyles.label}>Azure Resource ID <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="azure_resource_id"
                type="text"
                name="azure_resource_id"
                value={formData.azure_resource_id}
                onChange={handleInputChange}
                required
                placeholder="/subscriptions/.../resourceGroups/.../providers/Microsoft.Storage/storageAccounts/..."
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="azure_client_id" style={compactStyles.label}>Client ID (Optional)</label>
              <input
                id="azure_client_id"
                type="text"
                name="azure_client_id"
                value={formData.azure_client_id}
                onChange={handleInputChange}
                placeholder="Optional client ID for user-assigned managed identity"
                style={compactStyles.input}
              />
            </div>
          </>
        );
      
      case 'db-short-lived-token':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="db_host" style={compactStyles.label}>Database Host <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="db_host"
                type="text"
                name="db_host"
                value={formData.db_host}
                onChange={handleInputChange}
                required
                placeholder="database.example.com"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="db_port" style={compactStyles.label}>Database Port <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="db_port"
                type="number"
                name="db_port"
                value={formData.db_port}
                onChange={handleInputChange}
                required
                placeholder="5432"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="db_name" style={compactStyles.label}>Database Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="db_name"
                type="text"
                name="db_name"
                value={formData.db_name}
                onChange={handleInputChange}
                required
                placeholder="mydb"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="db_user" style={compactStyles.label}>Database User <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="db_user"
                type="text"
                name="db_user"
                value={formData.db_user}
                onChange={handleInputChange}
                required
                placeholder="dbuser"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="token_endpoint" style={compactStyles.label}>Token Endpoint <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="token_endpoint"
                type="url"
                name="token_endpoint"
                value={formData.token_endpoint}
                onChange={handleInputChange}
                required
                placeholder="https://auth.example.com/token"
                style={compactStyles.input}
              />
            </div>
          </>
        );
      
      case 'oauth2':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="oauth_client_id" style={compactStyles.label}>OAuth Client ID <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="oauth_client_id"
                type="text"
                name="oauth_client_id"
                value={formData.oauth_client_id}
                onChange={handleInputChange}
                required
                placeholder="client_id_from_provider"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="oauth_client_secret" style={compactStyles.label}>OAuth Client Secret {!isEditMode && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <input
                id="oauth_client_secret"
                type="password"
                name="oauth_client_secret"
                value={formData.oauth_client_secret}
                onChange={handleInputChange}
                required={!isEditMode}
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'client_secret_from_provider'}
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="oauth_token_url" style={compactStyles.label}>Token URL <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="oauth_token_url"
                type="url"
                name="oauth_token_url"
                value={formData.oauth_token_url}
                onChange={handleInputChange}
                required
                placeholder="https://oauth.example.com/token"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="oauth_scopes" style={compactStyles.label}>Scopes (Optional)</label>
              <input
                id="oauth_scopes"
                type="text"
                name="oauth_scopes"
                value={formData.oauth_scopes}
                onChange={handleInputChange}
                placeholder="read write"
                style={compactStyles.input}
              />
            </div>
          </>
        );
      
      case 'kerberos':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="kerberos_principal" style={compactStyles.label}>Kerberos Principal <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="kerberos_principal"
                type="text"
                name="kerberos_principal"
                value={formData.kerberos_principal}
                onChange={handleInputChange}
                required
                placeholder="username@REALM.EXAMPLE.COM"
                style={compactStyles.input}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="kerberos_keytab" style={compactStyles.label}>Kerberos Keytab {!isEditMode && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <textarea
                id="kerberos_keytab"
                name="kerberos_keytab"
                value={formData.kerberos_keytab}
                onChange={handleInputChange}
                required={!isEditMode}
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'Base64-encoded keytab content'}
                rows="2"
                style={compactStyles.textarea}
              />
            </div>
            <div style={compactStyles.formGroup}>
              <label htmlFor="kerberos_realm" style={compactStyles.label}>Kerberos Realm <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="kerberos_realm"
                type="text"
                name="kerberos_realm"
                value={formData.kerberos_realm}
                onChange={handleInputChange}
                required
                placeholder="REALM.EXAMPLE.COM"
                style={compactStyles.input}
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
            <div style={compactStyles.formGroup}>
              <label htmlFor="region" style={compactStyles.label}>AWS Region <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="region"
                type="text"
                name="region"
                value={formData.region}
                onChange={handleInputChange}
                required
                placeholder="us-east-1"
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="bucket" style={compactStyles.label}>S3 Bucket Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="bucket"
                type="text"
                name="bucket"
                value={formData.bucket}
                onChange={handleInputChange}
                required
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="access_key_id" style={compactStyles.label}>Access Key ID {!isEditMode && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <input
                id="access_key_id"
                type="text"
                name="access_key_id"
                value={formData.access_key_id}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="secret_access_key" style={compactStyles.label}>Secret Access Key {!isEditMode && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <input
                id="secret_access_key"
                type="password"
                name="secret_access_key"
                value={formData.secret_access_key}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="endpoint" style={compactStyles.label}>Endpoint (Optional)</label>
              <input
                id="endpoint"
                type="text"
                name="endpoint"
                value={formData.endpoint}
                onChange={handleInputChange}
                placeholder="s3.amazonaws.com"
                style={compactStyles.input}
              />
            </div>
            
            <div style={{ ...compactStyles.formGroup, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="use_ssl"
                name="use_ssl"
                checked={formData.use_ssl}
                onChange={handleInputChange}
                style={{ width: 'auto', margin: 0 }}
              />
              <label htmlFor="use_ssl" style={{ ...compactStyles.label, margin: 0, cursor: 'pointer' }}>
                Use SSL
              </label>
            </div>
          </>
        );
      
      case 'gcp':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="gcp_project_id" style={compactStyles.label}>GCP Project ID <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="gcp_project_id"
                type="text"
                name="gcp_project_id"
                value={formData.gcp_project_id}
                onChange={handleInputChange}
                required
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="gcp_bucket" style={compactStyles.label}>Bucket Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="gcp_bucket"
                type="text"
                name="gcp_bucket"
                value={formData.gcp_bucket}
                onChange={handleInputChange}
                required
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="service_account_json" style={compactStyles.label}>Service Account JSON {!isEditMode && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <textarea
                id="service_account_json"
                name="service_account_json"
                value={formData.service_account_json}
                onChange={handleInputChange}
                rows="3"
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'Paste JSON key file content'}
                style={compactStyles.textarea}
              />
              <small style={compactStyles.helperText}>
                Paste the entire JSON key file content from GCP
              </small>
            </div>
          </>
        );
      
      case 'azure':
        return (
          <>
            <div style={compactStyles.formGroup}>
              <label htmlFor="account_name" style={compactStyles.label}>Account Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="account_name"
                type="text"
                name="account_name"
                value={formData.account_name}
                onChange={handleInputChange}
                required
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="container_name" style={compactStyles.label}>Container Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                id="container_name"
                type="text"
                name="container_name"
                value={formData.container_name}
                onChange={handleInputChange}
                required
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="account_key" style={compactStyles.label}>Account Key {!isEditMode && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <input
                id="account_key"
                type="password"
                name="account_key"
                value={formData.account_key}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
                style={compactStyles.input}
              />
            </div>
            
            <div style={compactStyles.formGroup}>
              <label htmlFor="azure_endpoint" style={compactStyles.label}>Endpoint (Optional)</label>
              <input
                id="azure_endpoint"
                type="text"
                name="azure_endpoint"
                value={formData.azure_endpoint}
                onChange={handleInputChange}
                placeholder="blob.core.windows.net"
                style={compactStyles.input}
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
              disabled={loading || testing || !isFormValid()}
              style={{ 
                opacity: (!loading && !testing && !isFormValid()) ? 0.5 : 1,
                cursor: (!loading && !testing && !isFormValid()) ? 'not-allowed' : 'pointer'
              }}
              title={!isFormValid() ? 'Please fill in all required fields' : ''}
            >
              {loading ? 'Saving...' : connectionId ? 'Update' : 'Save'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="vendor-connection-form" style={{ padding: '1rem' }}>
          <div style={compactStyles.formGroup}>
            <label htmlFor="name" style={compactStyles.label}>Connection Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="My Connection"
              style={compactStyles.input}
            />
          </div>
          
          <div style={compactStyles.formGroup}>
            <label htmlFor="connection_user" style={compactStyles.label}>Connection User <span style={{ color: '#dc2626' }}>*</span></label>
            <select
              id="connection_user"
              name="connection_user"
              value={formData.connection_user}
              onChange={handleInputChange}
              required
              style={compactStyles.select}
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
            <small style={compactStyles.helperText}>
              Internal: Company-managed | External: Third-party/vendor
            </small>
          </div>
          
          <div style={compactStyles.formGroup}>
            <label htmlFor="connection_direction" style={compactStyles.label}>Connection Direction <span style={{ color: '#dc2626' }}>*</span></label>
            <select
              id="connection_direction"
              name="connection_direction"
              value={formData.connection_direction}
              onChange={handleInputChange}
              required
              style={compactStyles.select}
            >
              <option value="source">Source (Read data from)</option>
              <option value="target">Target (Write data to)</option>
            </select>
            <small style={compactStyles.helperText}>
              Choose the authentication method for this connection
            </small>
          </div>
          
          <div style={compactStyles.formGroup}>
            <label htmlFor="description" style={compactStyles.label}>Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Brief description of this connection"
              rows="2"
              style={compactStyles.textarea}
            />
          </div>
          
          <div style={compactStyles.formGroup}>
            <label htmlFor="authentication_method" style={compactStyles.label}>Authentication Method <span style={{ color: '#dc2626' }}>*</span></label>
            <select
              id="authentication_method"
              name="authentication_method"
              value={formData.authentication_method}
              onChange={handleInputChange}
              required
              style={compactStyles.select}
            >
              <option value="key-based">Key-Based (Access Keys/Secrets)</option>
              <option value="aws-iam-role">AWS IAM Role (Assume Role)</option>
              <option value="gcp-sa-oidc">GCP Service Account OIDC</option>
              <option value="azure-managed-identity">Azure Managed Identity</option>
              <option value="db-short-lived-token">Database Short-Lived Token</option>
              <option value="oauth2">OAuth 2.0</option>
              <option value="kerberos">Kerberos</option>
            </select>
            <small style={compactStyles.helperText}>
              Choose the authentication method for this connection
            </small>
          </div>
          
          {renderAuthenticationFields()}
          
          <div style={compactStyles.formGroup}>
            <label htmlFor="provider" style={compactStyles.label}>Provider <span style={{ color: '#dc2626' }}>*</span></label>
            <select
              id="provider"
              name="provider"
              value={formData.provider}
              onChange={handleInputChange}
              required
              style={compactStyles.select}
            >
              <option value="aws">AWS S3</option>
              <option value="gcp">Google Cloud Storage</option>
              <option value="azure">Azure Blob Storage</option>
            </select>
          </div>
          
          {renderProviderFields()}
          
          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`} style={{ marginTop: '0.75rem', marginBottom: '0.75rem', fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
              {testResult.message}
            </div>
          )}
          
          <div style={compactStyles.formGroup}>
            <label htmlFor="file_path" style={compactStyles.label}>Path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="file_path"
                type="text"
                name="file_path"
                value={formData.file_path}
                onChange={handleInputChange}
                placeholder="vendors/uploads"
                disabled={!canBrowse}
                style={{ 
                  ...compactStyles.input,
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
                  padding: '0.375rem 0.75rem',
                  background: canBrowse ? '#4a90e2' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: canBrowse ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                  fontWeight: 500,
                  height: '32px'
                }}
                title={!canBrowse ? 'Test connection or save to enable browsing' : 'Browse folders'}
              >
                <FaFolder /> Browse
              </button>
            </div>
            <small style={compactStyles.helperText}>
              {!canBrowse 
                ? 'Test connection or save to enable folder browsing'
                : 'Folder path within the bucket/container. Click Browse to select folders.'
              }
            </small>
          </div>
          
          {/* Archive Password Section */}
          <div style={{ ...compactStyles.formGroup, marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                id="has_archive_password"
                name="has_archive_password"
                checked={formData.has_archive_password}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    has_archive_password: e.target.checked,
                    archive_password: e.target.checked ? prev.archive_password : ''
                  }));
                }}
                style={{ width: 'auto', margin: 0 }}
              />
              <label htmlFor="has_archive_password" style={{ ...compactStyles.label, margin: 0, cursor: 'pointer' }}>
                Password-protected archives
              </label>
            </div>
            
            {formData.has_archive_password && (
              <div style={{ marginBottom: 0 }}>
                <label htmlFor="archive_password" style={compactStyles.label}>Archive Password <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  id="archive_password"
                  type="password"
                  name="archive_password"
                  value={formData.archive_password}
                  onChange={handleInputChange}
                  placeholder={isEditMode && connection?.has_archive_password ? "Leave blank to keep existing" : "Enter password for archives"}
                  required={!isEditMode}
                  style={compactStyles.input}
                />
                <small style={compactStyles.helperText}>
                  {isEditMode && connection?.has_archive_password
                    ? 'Password already set. Enter new password to update or leave blank.'
                    : 'Password for ZIP, 7z, and TAR archives from this connection.'}
                </small>
              </div>
            )}
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

ConnectionModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  onSuccess: PropTypes.func,
  connection: PropTypes.shape({
    connection_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    connection_user: PropTypes.string,
    connection_direction: PropTypes.string,
    description: PropTypes.string,
    authentication_method: PropTypes.string,
    provider: PropTypes.string,
    config: PropTypes.object,
    auth_config: PropTypes.object,
    has_archive_password: PropTypes.bool
  }),
  connectionDirection: PropTypes.string,
};

ConnectionModal.defaultProps = {
  isOpen: false,
  onClose: () => {},
  onSuccess: () => {},
  connection: null,
  connectionDirection: 'source'
};

export default ConnectionModal;
