import React, { useState, useEffect } from 'react';
import { FaFolder } from 'react-icons/fa';
import ThreeSectionModal from './ThreeSectionModal';
import S3FolderBrowser from './S3FolderBrowser';
import axios from 'axios';
import '../styles/VendorManagement.css';
import PropTypes from 'prop-types';

const VendorConnectionModal = ({
  isOpen,
  onClose,
  onSuccess,
  connection = null
}) => {
  const [formData, setFormData] = useState({
    name: '',
    provider: 'aws',
    // AWS fields
    region: '',
    bucket: '',
    access_key_id: '',
    secret_access_key: '',
    endpoint: '',
    use_ssl: true,
    // GCP fields
    gcp_project_id: '',
    service_account_json: '',
    gcp_bucket: '',
    // Azure fields
    account_name: '',
    account_key: '',
    container_name: '',
    azure_endpoint: '',
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
      setFormData({
        name: connection.name || '',
        provider: config.provider || 'aws',
        // AWS
        region: config.region || '',
        bucket: config.bucket || '',
        access_key_id: '',
        secret_access_key: '',
        endpoint: config.endpoint || '',
        use_ssl: config.use_ssl !== undefined ? config.use_ssl : true,
        // GCP
        gcp_project_id: config.project_id || '',
        service_account_json: '',
        gcp_bucket: config.gcp_bucket || '',
        // Azure
        account_name: config.account_name || '',
        account_key: '',
        container_name: config.container_name || '',
        azure_endpoint: config.azure_endpoint || '',
        // Common
        file_path: config.path_prefix || ''
      });
      setSavedConnectionId(connection.connection_id);
    } else {
      // Reset for create mode
      setFormData({
        name: '',
        provider: 'aws',
        region: '',
        bucket: '',
        access_key_id: '',
        secret_access_key: '',
        endpoint: '',
        use_ssl: true,
        gcp_project_id: '',
        service_account_json: '',
        gcp_bucket: '',
        account_name: '',
        account_key: '',
        container_name: '',
        azure_endpoint: '',
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
      'provider', 'region', 'bucket', 'access_key_id', 'secret_access_key', 'endpoint', 'use_ssl',
      'gcp_project_id', 'service_account_json', 'gcp_bucket',
      'account_name', 'account_key', 'container_name', 'azure_endpoint'
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
      
      // Prepare payload with file_path mapped to path_prefix for backend
      const payload = {
        ...formData,
        path_prefix: formData.file_path
      };
      delete payload.file_path;
      
      const url = connectionId 
        ? `/api/vendor-connections/${connectionId}`
        : '/api/vendor-connections';
      
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
          path_prefix: formData.file_path || ''
        };
        delete payload.file_path;
        
        const response = await axios.post('/api/vendor-connections/test-new', payload);
        
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
      const response = await axios.post(`/api/vendor-connections/${connectionId}/test`);
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
  
  const renderProviderFields = () => {
    switch (formData.provider) {
      case 'aws':
        return (
          <>
            <div className="form-group">
              <label htmlFor="region">AWS Region</label>
              <input
                id="region"
                type="text"
                name="region"
                value={formData.region}
                onChange={handleInputChange}
                placeholder="us-east-1"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="bucket">Bucket Name *</label>
              <input
                id="bucket"
                type="text"
                name="bucket"
                value={formData.bucket}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="access_key_id">Access Key ID {!isEditMode && '*'}</label>
              <input
                id="access_key_id"
                type="text"
                name="access_key_id"
                value={formData.access_key_id}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="secret_access_key">Secret Access Key {!isEditMode && '*'}</label>
              <input
                id="secret_access_key"
                type="password"
                name="secret_access_key"
                value={formData.secret_access_key}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="endpoint">Endpoint (Optional)</label>
              <input
                id="endpoint"
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
              <label htmlFor="gcp_project_id">GCP Project ID *</label>
              <input
                id="gcp_project_id"
                type="text"
                name="gcp_project_id"
                value={formData.gcp_project_id}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="gcp_bucket">Bucket Name *</label>
              <input
                id="gcp_bucket"
                type="text"
                name="gcp_bucket"
                value={formData.gcp_bucket}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="service_account_json">Service Account JSON (JSON format) {!isEditMode && '*'}</label>
              <textarea
                id="service_account_json"
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
              <label htmlFor="account_name">Account Name *</label>
              <input
                id="account_name"
                type="text"
                name="account_name"
                value={formData.account_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="container_name">Container Name *</label>
              <input
                id="container_name"
                type="text"
                name="container_name"
                value={formData.container_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="account_key">Account Key {!isEditMode && '*'}</label>
              <input
                id="account_key"
                type="password"
                name="account_key"
                value={formData.account_key}
                onChange={handleInputChange}
                placeholder={isEditMode ? 'Leave blank to keep existing' : ''}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="azure_endpoint">Endpoint (Optional)</label>
              <input
                id="azure_endpoint"
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
        title={isEditMode ? 'Edit Vendor Connection' : 'Create Vendor Connection'}
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
            <label htmlFor="name">Connection Name *</label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              placeholder="My Vendor Connection"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="provider">Provider *</label>
            <select
              id="provider"
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
            <label htmlFor="file_path">File Path (Optional)</label>
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

export default VendorConnectionModal;

VendorConnectionModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  onSuccess: PropTypes.func,
  connection: PropTypes.shape({
    connection_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    config: PropTypes.shape({
      provider: PropTypes.string,
      region: PropTypes.string,
      bucket: PropTypes.string,
      endpoint: PropTypes.string,
      use_ssl: PropTypes.bool,
      project_id: PropTypes.string,
      gcp_bucket: PropTypes.string,
      account_name: PropTypes.string,
      container_name: PropTypes.string,
      azure_endpoint: PropTypes.string,
      path_prefix: PropTypes.string,
    }),
  }),
};

VendorConnectionModal.defaultProps = {
  isOpen: false,
  onClose: () => {},
  onSuccess: () => {},
  connection: null,
};
