import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiCloud, FiDatabase, FiServer, FiFolder, FiMail, FiLink, FiUsers, FiHardDrive } from 'react-icons/fi';
import Card from '../components/Card';
import './Connections.css';

// Component to render connection icons
const renderConnectionIcon = (type) => {
  const iconProps = { size: 24, className: `connection-icon ${type}` };
  
  switch (type) {
    case 'aws':
      return <FiCloud {...iconProps} />;
    case 'gcp':
      return <FiCloud {...iconProps} />;
    case 'azure':
      return <FiCloud {...iconProps} />;
    case 'sharepoint':
      return <FiFolder {...iconProps} />;
    case 'outlook':
      return <FiMail {...iconProps} />;
    case 'local_folder':
      return <FiHardDrive {...iconProps} />;
    case 'sftp':
      return <FiServer {...iconProps} />;
    case 'snowflake':
      return <FiDatabase {...iconProps} />;
    default:
      return <FiServer {...iconProps} />;
  }
};

// Helper function to get connection type labels
const getConnectionTypeLabel = (type) => {
  const labels = {
    aws: 'Amazon S3',
    gcp: 'Google Cloud Storage',
    azure: 'Azure Blob Storage',
    sharepoint: 'SharePoint',
    outlook: 'Outlook',
    local_folder: 'Local Folder',
    sftp: 'SFTP',
    snowflake: 'Snowflake'
  };
  return labels[type] || type;
};

function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editConnection, setEditConnection] = useState(null);
  const [testingConnection, setTestingConnection] = useState(null);
  const [userRole, setUserRole] = useState('read-only');

  useEffect(() => {
    fetchConnections();
    fetchUserRole();
  }, []);

  const hasWritePermission = (resource) => {
    return userRole === 'admin' || userRole === 'editor';
  };

  const fetchUserRole = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/user/role', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserRole(data.role || 'read-only');
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole('read-only');
    }
  };

  const fetchConnections = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token not found');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/connections', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConnections(data);
      } else {
        setError('Failed to fetch connections');
      }
    } catch (error) {
      console.error('Error fetching connections:', error);
      setError('Error loading connections');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      const url = editMode 
        ? `/api/connections/${editConnection.id}` 
        : '/api/connections';
      
      const method = editMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowForm(false);
        setEditMode(false);
        setEditConnection(null);
        await fetchConnections();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save connection');
      }
    } catch (error) {
      console.error('Error saving connection:', error);
      setError('Error saving connection');
    }
  };

  const handleEdit = (connection) => {
    setEditConnection(connection);
    setEditMode(true);
    setShowForm(true);
  };

  const handleDelete = async (connectionId) => {
    if (!window.confirm('Are you sure you want to delete this connection?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchConnections();
      } else {
        setError('Failed to delete connection');
      }
    } catch (error) {
      console.error('Error deleting connection:', error);
      setError('Error deleting connection');
    }
  };

  const handleTestConnection = async (connection) => {
    setTestingConnection(connection.id);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/connections/${connection.id}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        alert('Connection test successful!');
      } else {
        alert(`Connection test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      alert('Error testing connection');
    } finally {
      setTestingConnection(null);
    }
  };

  return (
    <div className="connections-container">
      <div className="connections-header">
        <h2>Connections</h2>
        {hasWritePermission('connections') && (
          <button 
            className="btn btn-primary" 
            onClick={() => setShowForm(true)}
          >
            Add Connection
          </button>
        )}
      </div>

      {loading && <div className="loading">Loading connections...</div>}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {showForm && (
        <div className="connection-form-overlay">
          <div className="connection-form-modal">
            <ConnectionForm 
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditMode(false);
                setEditConnection(null);
              }}
              editMode={editMode}
              initialData={editConnection}
            />
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {connections.length === 0 && !hasWritePermission('connections') && (
            <div className="no-connections">
              <p>No connections available.</p>
              {!hasWritePermission('connections') && (
                <div className="permission-notice-sm">
                  Contact your administrator to add connections
                </div>
              )}
            </div>
          )}

          {connections.length === 0 && hasWritePermission('connections') && (
            <div className="no-connections">
              <p>No connections configured yet.</p>
              <p>Add your first connection to get started.</p>
            </div>
          )}
        </>
      )}

      {/* Show connections only if we have them */}
      {!loading && !error && connections.length > 0 && (
        <>
          {/* Connection Statistics */}
          <div className="connection-stats">
            <div className="stat-card">
              <span className="stat-number">{connections.length}</span>
              <span className="stat-label">Total Connections</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{connections.filter(c => c.is_active).length}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{new Set(connections.map(c => c.connection_type || c.type)).size}</span>
              <span className="stat-label">Provider Types</span>
            </div>
          </div>

          <div className="connections-grid">
            {connections.map(connection => (
              <Card key={connection.id} className={`connection-card ${connection.connection_type || connection.type}`}>
                <div className="connection-header">
                  <div className="connection-title-section">
                    {renderConnectionIcon(connection.connection_type || connection.type)}
                    <div className="connection-info">
                      <div className="connection-name">
                        {connection.connection_name}
                        {(connection.shared || (connection.source_application && connection.source_application !== 'data_observatory')) && (
                          <span className="shared-indicator" title="Shared with Transform">
                            <FiLink className="shared-icon" />
                          </span>
                        )}
                      </div>
                      <div className="connection-type">
                        {getConnectionTypeLabel(connection.connection_type || connection.type)}
                      </div>
                    </div>
                  </div>
                  <div className="connection-actions">
                    {hasWritePermission('connections') && (
                      <>
                        <button 
                          className="test-btn" 
                          onClick={() => handleTestConnection(connection)}
                          disabled={testingConnection === connection.id}
                        >
                          {testingConnection === connection.id ? 'Testing...' : 'Test'}
                        </button>
                        <button 
                          className="action-btn edit-btn" 
                          onClick={() => handleEdit(connection)}
                          title="Edit connection"
                        >
                          <FiEdit2 />
                        </button>
                        <button 
                          className="action-btn delete-btn" 
                          onClick={() => handleDelete(connection.id)}
                          title="Delete connection"
                        >
                          <FiTrash2 />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="connection-details">
                  {connection.source_application && connection.source_application !== 'data_observatory' && (
                    <div className="connection-detail-item">
                      <span className="connection-detail-label">Source:</span>
                      <span className="connection-detail-value">{connection.source_application}</span>
                    </div>
                  )}
                  
                  {(connection.connection_type === 'aws' || connection.type === 'aws') && (
                    <>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Region:</span>
                        <span className="connection-detail-value">{connection.aws_region || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Bucket:</span>
                        <span className="connection-detail-value">{connection.aws_bucket_name || 'Not set'}</span>
                      </div>
                    </>
                  )}
                  
                  {(connection.connection_type === 'gcp' || connection.type === 'gcp') && (
                    <>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Project:</span>
                        <span className="connection-detail-value">{connection.gcp_project_id || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Bucket:</span>
                        <span className="connection-detail-value">{connection.gcp_bucket_name || 'Not set'}</span>
                      </div>
                    </>
                  )}
                  
                  {(connection.connection_type === 'azure' || connection.type === 'azure') && (
                    <>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Account:</span>
                        <span className="connection-detail-value">{connection.azure_account_name || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Container:</span>
                        <span className="connection-detail-value">{connection.azure_container_name || 'Not set'}</span>
                      </div>
                    </>
                  )}
                  
                  {(connection.connection_type === 'sharepoint' || connection.type === 'sharepoint') && (
                    <>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Site:</span>
                        <span className="connection-detail-value">{connection.sharepoint_site_url || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Library:</span>
                        <span className="connection-detail-value">{connection.sharepoint_document_library || 'Not set'}</span>
                      </div>
                    </>
                  )}
                  
                  {(connection.connection_type === 'outlook' || connection.type === 'outlook') && (
                    <div className="connection-detail-item">
                      <span className="connection-detail-label">Folder:</span>
                      <span className="connection-detail-value">{connection.outlook_folder_path || 'Not set'}</span>
                    </div>
                  )}
                  
                  {(connection.connection_type === 'local_folder' || connection.type === 'local_folder') && (
                    <div className="connection-detail-item">
                      <span className="connection-detail-label">Path:</span>
                      <span className="connection-detail-value">{connection.local_folder_path || 'Not set'}</span>
                    </div>
                  )}
                  
                  {(connection.connection_type === 'sftp' || connection.type === 'sftp') && (
                    <>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Host:</span>
                        <span className="connection-detail-value">{connection.sftp_host || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Port:</span>
                        <span className="connection-detail-value">{connection.sftp_port || '22'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Username:</span>
                        <span className="connection-detail-value">{connection.sftp_username || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Path:</span>
                        <span className="connection-detail-value">{connection.sftp_path || '/'}</span>
                      </div>
                    </>
                  )}
                  
                  {(connection.connection_type === 'snowflake' || connection.type === 'snowflake') && (
                    <>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Account:</span>
                        <span className="connection-detail-value">{connection.snowflake_account || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Database:</span>
                        <span className="connection-detail-value">{connection.snowflake_database || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Schema:</span>
                        <span className="connection-detail-value">{connection.snowflake_schema || 'Not set'}</span>
                      </div>
                      <div className="connection-detail-item">
                        <span className="connection-detail-label">Warehouse:</span>
                        <span className="connection-detail-value">{connection.snowflake_warehouse || 'Not set'}</span>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ConnectionForm component with improved multi-column layout
const ConnectionForm = ({ onSubmit, onCancel, editMode = false, initialData = null }) => {
  const [formData, setFormData] = useState(initialData || {
    connection_name: '',
    connection_type: '',
    aws_region: '',
    aws_bucket_name: '',
    aws_access_key: '',
    aws_secret_key: '',
    gcp_project_id: '',
    gcp_bucket_name: '',
    gcp_service_account_key: '',
    azure_account_name: '',
    azure_container_name: '',
    azure_account_key: '',
    sharepoint_site_url: '',
    sharepoint_document_library: '',
    sharepoint_client_id: '',
    sharepoint_client_secret: '',
    outlook_folder_path: '',
    outlook_client_id: '',
    outlook_client_secret: '',
    local_folder_path: '',
    sftp_host: '',
    sftp_port: '22',
    sftp_username: '',
    sftp_password: '',
    sftp_path: '/',
    snowflake_account: '',
    snowflake_database: '',
    snowflake_schema: '',
    snowflake_warehouse: '',
    snowflake_username: '',
    snowflake_password: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const renderSpecificFields = () => {
    const { connection_type } = formData;
    
    switch (connection_type) {
      case 'aws':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="aws_region">AWS Region</label>
              <input
                type="text"
                id="aws_region"
                name="aws_region"
                className="form-control"
                value={formData.aws_region}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="aws_bucket_name">S3 Bucket Name</label>
              <input
                type="text"
                id="aws_bucket_name"
                name="aws_bucket_name"
                className="form-control"
                value={formData.aws_bucket_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="aws_access_key">Access Key ID</label>
              <input
                type="text"
                id="aws_access_key"
                name="aws_access_key"
                className="form-control"
                value={formData.aws_access_key}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="aws_secret_key">Secret Access Key</label>
              <input
                type="password"
                id="aws_secret_key"
                name="aws_secret_key"
                className="form-control"
                value={formData.aws_secret_key}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : ''}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing secret key.
                </small>
              )}
            </div>
          </div>
        );
      
      case 'gcp':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="gcp_project_id">GCP Project ID</label>
              <input
                type="text"
                id="gcp_project_id"
                name="gcp_project_id"
                className="form-control"
                value={formData.gcp_project_id}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="gcp_bucket_name">Storage Bucket Name</label>
              <input
                type="text"
                id="gcp_bucket_name"
                name="gcp_bucket_name"
                className="form-control"
                value={formData.gcp_bucket_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group form-group-full-width">
              <label htmlFor="gcp_service_account_key">Service Account Key (JSON)</label>
              <textarea
                id="gcp_service_account_key"
                name="gcp_service_account_key"
                className="form-control"
                rows="6"
                value={formData.gcp_service_account_key}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : 'Paste your service account JSON key here'}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing service account key.
                </small>
              )}
            </div>
          </div>
        );
      
      case 'azure':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="azure_account_name">Storage Account Name</label>
              <input
                type="text"
                id="azure_account_name"
                name="azure_account_name"
                className="form-control"
                value={formData.azure_account_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="azure_container_name">Container Name</label>
              <input
                type="text"
                id="azure_container_name"
                name="azure_container_name"
                className="form-control"
                value={formData.azure_container_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group form-group-full-width">
              <label htmlFor="azure_account_key">Account Key</label>
              <input
                type="password"
                id="azure_account_key"
                name="azure_account_key"
                className="form-control"
                value={formData.azure_account_key}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : ''}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing account key.
                </small>
              )}
            </div>
          </div>
        );
      
      case 'sharepoint':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sharepoint_site_url">SharePoint Site URL</label>
              <input
                type="url"
                id="sharepoint_site_url"
                name="sharepoint_site_url"
                className="form-control"
                value={formData.sharepoint_site_url}
                onChange={handleInputChange}
                required
                placeholder="https://yourcompany.sharepoint.com/sites/yoursite"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sharepoint_document_library">Document Library</label>
              <input
                type="text"
                id="sharepoint_document_library"
                name="sharepoint_document_library"
                className="form-control"
                value={formData.sharepoint_document_library}
                onChange={handleInputChange}
                required
                placeholder="Shared Documents"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sharepoint_client_id">Client ID</label>
              <input
                type="text"
                id="sharepoint_client_id"
                name="sharepoint_client_id"
                className="form-control"
                value={formData.sharepoint_client_id}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sharepoint_client_secret">Client Secret</label>
              <input
                type="password"
                id="sharepoint_client_secret"
                name="sharepoint_client_secret"
                className="form-control"
                value={formData.sharepoint_client_secret}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : ''}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing client secret.
                </small>
              )}
            </div>
          </div>
        );
      
      case 'outlook':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="outlook_folder_path">Folder Path</label>
              <input
                type="text"
                id="outlook_folder_path"
                name="outlook_folder_path"
                className="form-control"
                value={formData.outlook_folder_path}
                onChange={handleInputChange}
                placeholder="Inbox/Attachments"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="outlook_client_id">Client ID</label>
              <input
                type="text"
                id="outlook_client_id"
                name="outlook_client_id"
                className="form-control"
                value={formData.outlook_client_id}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group form-group-full-width">
              <label htmlFor="outlook_client_secret">Client Secret</label>
              <input
                type="password"
                id="outlook_client_secret"
                name="outlook_client_secret"
                className="form-control"
                value={formData.outlook_client_secret}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : ''}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing client secret.
                </small>
              )}
            </div>
          </div>
        );
      
      case 'local_folder':
        return (
          <div className="form-row">
            <div className="form-group form-group-full-width">
              <label htmlFor="local_folder_path">Folder Path</label>
              <input
                type="text"
                id="local_folder_path"
                name="local_folder_path"
                className="form-control"
                value={formData.local_folder_path}
                onChange={handleInputChange}
                required
                placeholder="/path/to/your/folder"
              />
            </div>
          </div>
        );
      
      case 'sftp':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sftp_host">SFTP Host</label>
              <input
                type="text"
                id="sftp_host"
                name="sftp_host"
                className="form-control"
                value={formData.sftp_host}
                onChange={handleInputChange}
                required
                placeholder="ftp.example.com"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sftp_port">Port</label>
              <input
                type="number"
                id="sftp_port"
                name="sftp_port"
                className="form-control"
                value={formData.sftp_port}
                onChange={handleInputChange}
                required
                min="1"
                max="65535"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sftp_username">Username</label>
              <input
                type="text"
                id="sftp_username"
                name="sftp_username"
                className="form-control"
                value={formData.sftp_username}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sftp_password">Password</label>
              <input
                type="password"
                id="sftp_password"
                name="sftp_password"
                className="form-control"
                value={formData.sftp_password}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : ''}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing password.
                </small>
              )}
            </div>
            
            <div className="form-group form-group-full-width">
              <label htmlFor="sftp_path">Remote Path</label>
              <input
                type="text"
                id="sftp_path"
                name="sftp_path"
                className="form-control"
                value={formData.sftp_path}
                onChange={handleInputChange}
                placeholder="/"
              />
            </div>
          </div>
        );
      
      case 'snowflake':
        return (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="snowflake_account">Account</label>
              <input
                type="text"
                id="snowflake_account"
                name="snowflake_account"
                className="form-control"
                value={formData.snowflake_account}
                onChange={handleInputChange}
                required
                placeholder="your-account.snowflakecomputing.com"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="snowflake_database">Database</label>
              <input
                type="text"
                id="snowflake_database"
                name="snowflake_database"
                className="form-control"
                value={formData.snowflake_database}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="snowflake_schema">Schema</label>
              <input
                type="text"
                id="snowflake_schema"
                name="snowflake_schema"
                className="form-control"
                value={formData.snowflake_schema}
                onChange={handleInputChange}
                required
                placeholder="PUBLIC"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="snowflake_warehouse">Warehouse</label>
              <input
                type="text"
                id="snowflake_warehouse"
                name="snowflake_warehouse"
                className="form-control"
                value={formData.snowflake_warehouse}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="snowflake_username">Username</label>
              <input
                type="text"
                id="snowflake_username"
                name="snowflake_username"
                className="form-control"
                value={formData.snowflake_username}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="snowflake_password">Password</label>
              <input
                type="password"
                id="snowflake_password"
                name="snowflake_password"
                className="form-control"
                value={formData.snowflake_password}
                onChange={handleInputChange}
                required={!editMode}
                placeholder={editMode ? '(unchanged)' : ''}
              />
              {editMode && (
                <small className="form-text text-muted">
                  Leave blank to keep the existing password.
                </small>
              )}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="connection-form">
      <div className="form-header">
        <h3>{editMode ? 'Edit Connection' : 'Add New Connection'}</h3>
        <button type="button" className="close-btn" onClick={onCancel}>×</button>
      </div>
      
      <form onSubmit={handleFormSubmit}>
        {/* Common fields in multi-column layout */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="connection_name">Connection Name</label>
            <input
              type="text"
              id="connection_name"
              name="connection_name"
              className="form-control"
              value={formData.connection_name}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="connection_type">Connection Type</label>
            <select
              id="connection_type"
              name="connection_type"
              className="form-control"
              value={formData.connection_type}
              onChange={handleInputChange}
              required
            >
              <option value="">Select a connection type</option>
              <option value="aws">Amazon S3</option>
              <option value="gcp">Google Cloud Storage</option>
              <option value="azure">Azure Blob Storage</option>
              <option value="sharepoint">SharePoint</option>
              <option value="outlook">Outlook</option>
              <option value="local_folder">Local Folder</option>
              <option value="sftp">SFTP</option>
              <option value="snowflake">Snowflake</option>
            </select>
          </div>
        </div>

        {/* Connection-specific fields */}
        {renderSpecificFields()}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {editMode ? 'Update Connection' : 'Create Connection'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Connections;