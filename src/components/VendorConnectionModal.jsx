import React, { useState, useEffect } from 'react';
import ThreeSectionModal from './ThreeSectionModal';
import axios from 'axios';

const VendorConnectionModal = ({
  isOpen,
  onClose,
  onSuccess,
  connection = null, // For editing existing connection
  projects = []
}) => {
  const [formData, setFormData] = useState({
    name: '',
    project_id: '',
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
    path_prefix: ''
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  
  const isEditMode = !!connection;
  
  useEffect(() => {
    if (connection) {
      const config = connection.config || {};
      setFormData({
        name: connection.name || '',
        project_id: connection.project_id || '',
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
        path_prefix: config.path_prefix || ''
      });
    } else {
      // Reset for create mode
      setFormData({
        name: '',
        project_id: '',
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
        path_prefix: ''
      });
    }
    setError('');
    setTestResult(null);
  }, [connection, isOpen]);
  
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
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
      
      if (!formData.project_id) {
        throw new Error('Project selection is required');
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
      
      const url = isEditMode 
        ? `/api/vendor-connections/${connection.connection_id}`
        : '/api/vendor-connections';
      
      const method = isEditMode ? 'put' : 'post';
      
      await axios[method](url, formData);
      
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save vendor connection');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTestConnection = async () => {
    if (!connection) {
      setTestResult({ success: false, message: 'Please save the connection before testing' });
      return;
    }
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const response = await axios.post(`/api/vendor-connections/${connection.connection_id}/test`);
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
              <label>Service Account JSON {!isEditMode && '*'}</label>
              <textarea
                name="service_account_json"
                value={formData.service_account_json}
                onChange={handleInputChange}
                rows="4"
                placeholder={isEditMode ? 'Leave blank to keep existing' : 'Paste service account JSON'}
              />
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
    <ThreeSectionModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Vendor Connection' : 'Create Vendor Connection'}
      size="large"
      footer={
        <>
          <button onClick={onClose} disabled={loading}>
            Cancel
          </button>
          {isEditMode && (
            <button 
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              style={{ background: '#10b981' }}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          )}
          <button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="vendor-connection-form">
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        
        {testResult && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.message}
          </div>
        )}
        
        <div className="form-group">
          <label>Connection Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            placeholder="My Vendor Connection"
          />
        </div>
        
        <div className="form-group">
          <label>Project *</label>
          <select
            name="project_id"
            value={formData.project_id}
            onChange={handleInputChange}
            required
            disabled={isEditMode} // Can't change project after creation
          >
            <option value="">Select a project</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {isEditMode && (
            <small style={{ color: '#6b7280' }}>
              Project cannot be changed after creation
            </small>
          )}
        </div>
        
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
        
        <div className="form-group">
          <label>Path Prefix (Optional)</label>
          <input
            type="text"
            name="path_prefix"
            value={formData.path_prefix}
            onChange={handleInputChange}
            placeholder="vendors/uploads"
          />
          <small style={{ color: '#6b7280' }}>
            Folder path within the bucket/container
          </small>
        </div>
      </form>
    </ThreeSectionModal>
  );
};

export default VendorConnectionModal;
