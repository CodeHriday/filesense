import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiDatabase, FiCloud, FiServer, FiHardDrive } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';
import './Connections.css';

// Use relative URL for API calls in the same domain
const API_URL = '/api';

const Connections = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  
  // Connection form state
  const [formData, setFormData] = useState({
    connection_name: '',
    connection_type: 'aws',
    region: '',
    bucket_name: '',
    access_key: '',
    secret_key: '',
    project_id: '',
    client_email: '',
    private_key: '',
    account_name: '',
    account_key: '',
    container_name: ''
  });
  
  // Fetch connections on component mount
  useEffect(() => {
    fetchConnections();
  }, []);
  
  const fetchConnections = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/connections`);
      setConnections(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching connections:', err);
      setError('Failed to load connections. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddNew = () => {
    setFormData({
      connection_name: '',
      connection_type: 'aws',
      region: '',
      bucket_name: '',
      access_key: '',
      secret_key: '',
      project_id: '',
      client_email: '',
      private_key: '',
      account_name: '',
      account_key: '',
      container_name: ''
    });
    setEditMode(false);
    setEditId(null);
    setShowForm(true);
  };
  
  const handleEdit = (connection) => {
    const { id, connection_name, connection_type } = connection;
    
    // Create a form data object with the correct fields based on connection type
    let newFormData = {
      connection_name,
      connection_type,
    };
    
    // Add type-specific fields
    if (connection_type === 'aws') {
      newFormData = {
        ...newFormData,
        region: connection.region || '',
        bucket_name: connection.bucket_name || '',
        access_key: connection.access_key || '',
        secret_key: '' // Don't prefill secret key for security
      };
    } else if (connection_type === 'gcp') {
      newFormData = {
        ...newFormData,
        project_id: connection.project_id || '',
        bucket_name: connection.bucket_name || '',
        client_email: connection.client_email || '',
        private_key: '' // Don't prefill private key for security
      };
    } else if (connection_type === 'azure') {
      newFormData = {
        ...newFormData,
        account_name: connection.account_name || '',
        container_name: connection.container_name || '',
        account_key: '' // Don't prefill account key for security
      };
    }
    
    setFormData(newFormData);
    setEditMode(true);
    setEditId(id);
    setShowForm(true);
  };
  
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this connection?')) {
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/connections/${id}`);
      // Update local state without refetching
      setConnections(connections.filter(conn => conn.id !== id));
    } catch (err) {
      console.error('Error deleting connection:', err);
      setError('Failed to delete connection. Please try again.');
    }
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  
  const handleConnectionTypeChange = (e) => {
    const connectionType = e.target.value;
    // Reset form data to avoid field confusion between types
    setFormData({
      ...formData,
      connection_type: connectionType,
      
      // Clear fields that aren't relevant to the new type
      region: connectionType === 'aws' ? formData.region : '',
      bucket_name: ['aws', 'gcp'].includes(connectionType) ? formData.bucket_name : '',
      access_key: connectionType === 'aws' ? formData.access_key : '',
      secret_key: connectionType === 'aws' ? formData.secret_key : '',
      
      project_id: connectionType === 'gcp' ? formData.project_id : '',
      client_email: connectionType === 'gcp' ? formData.client_email : '',
      private_key: connectionType === 'gcp' ? formData.private_key : '',
      
      account_name: connectionType === 'azure' ? formData.account_name : '',
      account_key: connectionType === 'azure' ? formData.account_key : '',
      container_name: connectionType === 'azure' ? formData.container_name : ''
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editMode) {
        await axios.put(`${API_URL}/connections/${editId}`, formData);
      } else {
        await axios.post(`${API_URL}/connections`, formData);
      }
      
      // Reset form and fetch updated connections
      setShowForm(false);
      fetchConnections();
    } catch (err) {
      console.error('Error saving connection:', err);
      setError('Failed to save connection. Please check your inputs and try again.');
    }
  };
  
  const renderConnectionIcon = (type) => {
    switch (type) {
      case 'aws':
        return <FiCloud className="connection-icon aws" />;
      case 'gcp':
        return <FiCloud className="connection-icon gcp" />;
      case 'azure':
        return <FiCloud className="connection-icon azure" />;
      default:
        return <FiDatabase className="connection-icon" />;
    }
  };
  
  const renderFormFields = () => {
    const { connection_type } = formData;
    
    // Common fields for all connection types
    const commonFields = (
      <>
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
            onChange={handleConnectionTypeChange}
            required
          >
            <option value="aws">AWS S3</option>
            <option value="gcp">Google Cloud Storage</option>
            <option value="azure">Azure Blob Storage</option>
          </select>
        </div>
      </>
    );
    
    // Type-specific fields
    let specificFields;
    
    if (connection_type === 'aws') {
      specificFields = (
        <>
          <div className="form-group">
            <label htmlFor="region">AWS Region</label>
            <input
              type="text"
              id="region"
              name="region"
              className="form-control"
              value={formData.region}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="bucket_name">S3 Bucket Name</label>
            <input
              type="text"
              id="bucket_name"
              name="bucket_name"
              className="form-control"
              value={formData.bucket_name}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="access_key">Access Key ID</label>
            <input
              type="text"
              id="access_key"
              name="access_key"
              className="form-control"
              value={formData.access_key}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="secret_key">Secret Access Key</label>
            <input
              type="password"
              id="secret_key"
              name="secret_key"
              className="form-control"
              value={formData.secret_key}
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
        </>
      );
    } else if (connection_type === 'gcp') {
      specificFields = (
        <>
          <div className="form-group">
            <label htmlFor="project_id">GCP Project ID</label>
            <input
              type="text"
              id="project_id"
              name="project_id"
              className="form-control"
              value={formData.project_id}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="bucket_name">Storage Bucket Name</label>
            <input
              type="text"
              id="bucket_name"
              name="bucket_name"
              className="form-control"
              value={formData.bucket_name}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="client_email">Service Account Email</label>
            <input
              type="text"
              id="client_email"
              name="client_email"
              className="form-control"
              value={formData.client_email}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="private_key">Service Account Private Key</label>
            <textarea
              id="private_key"
              name="private_key"
              className="form-control"
              value={formData.private_key}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              rows={3}
            />
            {editMode && (
              <small className="form-text text-muted">
                Leave blank to keep the existing private key.
              </small>
            )}
          </div>
        </>
      );
    } else if (connection_type === 'azure') {
      specificFields = (
        <>
          <div className="form-group">
            <label htmlFor="account_name">Storage Account Name</label>
            <input
              type="text"
              id="account_name"
              name="account_name"
              className="form-control"
              value={formData.account_name}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="container_name">Container Name</label>
            <input
              type="text"
              id="container_name"
              name="container_name"
              className="form-control"
              value={formData.container_name}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="account_key">Storage Account Key</label>
            <input
              type="password"
              id="account_key"
              name="account_key"
              className="form-control"
              value={formData.account_key}
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
        </>
      );
    }
    
    return (
      <>
        {commonFields}
        {specificFields}
      </>
    );
  };
  
  // Format connection details for display
  const formatConnectionDetails = (connection) => {
    const { connection_type } = connection;
    
    if (connection_type === 'aws') {
      return (
        <>
          <div><strong>Region:</strong> {connection.region}</div>
          <div><strong>Bucket:</strong> {connection.bucket_name}</div>
        </>
      );
    } else if (connection_type === 'gcp') {
      return (
        <>
          <div><strong>Project:</strong> {connection.project_id}</div>
          <div><strong>Bucket:</strong> {connection.bucket_name}</div>
        </>
      );
    } else if (connection_type === 'azure') {
      return (
        <>
          <div><strong>Account:</strong> {connection.account_name}</div>
          <div><strong>Container:</strong> {connection.container_name}</div>
        </>
      );
    }
    
    return null;
  };
  
  // Get connection type label
  const getConnectionTypeLabel = (type) => {
    switch (type) {
      case 'aws': return 'AWS S3';
      case 'gcp': return 'Google Cloud Storage';
      case 'azure': return 'Azure Blob Storage';
      default: return type;
    }
  };
  
  return (
    <div className="connections-container">
      <div className="connections-header">
        <h1>Cloud Storage Connections</h1>
        <button className="btn btn-primary add-connection-btn" onClick={handleAddNew}>
          <FiPlus /> Add Connection
        </button>
      </div>
      
      {error && <div className="alert alert-error">{error}</div>}
      
      {loading ? (
        <div className="loading-container">
          <LoadingSpinner />
          <p>Loading connections...</p>
        </div>
      ) : (
        <div className="connections-content">
          {showForm ? (
            <Card className="connection-form-container">
              <h2>{editMode ? 'Edit Connection' : 'Add New Connection'}</h2>
              <form onSubmit={handleSubmit}>
                {renderFormFields()}
                
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editMode ? 'Update' : 'Save'} Connection
                  </button>
                </div>
              </form>
            </Card>
          ) : (
            <>
              {connections.length === 0 ? (
                <>
                  <div className="no-connections">
                    <FiServer className="empty-icon" />
                    <p>No cloud storage connections configured yet.</p>
                    <p>Add a connection to start importing files from cloud storage.</p>
                    <button className="btn btn-primary" onClick={handleAddNew}>
                      Add Your First Connection
                    </button>
                  </div>
                  
                  {/* Cloud provider options */}
                  <h2>Supported Cloud Storage Providers</h2>
                  <div className="cloud-providers-list">
                    <div className="cloud-provider-section aws">
                      <div className="cloud-provider-header">
                        <FiCloud className="cloud-provider-icon aws" />
                        <div className="cloud-provider-title">
                          <h3>Amazon S3</h3>
                          <div className="cloud-provider-features">
                            Store and retrieve data from AWS S3 buckets
                          </div>
                        </div>
                      </div>
                      <p>
                        Connect to Amazon Simple Storage Service (S3) to access your object storage data. 
                        Supports importing CSV, JSON, and Parquet files directly from any S3 bucket.
                      </p>
                      <button className="btn btn-outline" onClick={() => {
                        setFormData({...formData, connection_type: 'aws'});
                        handleAddNew();
                      }}>
                        Connect to AWS S3
                      </button>
                    </div>
                    
                    <div className="cloud-provider-section gcp">
                      <div className="cloud-provider-header">
                        <FiCloud className="cloud-provider-icon gcp" />
                        <div className="cloud-provider-title">
                          <h3>Google Cloud Storage</h3>
                          <div className="cloud-provider-features">
                            Import data from GCP storage buckets
                          </div>
                        </div>
                      </div>
                      <p>
                        Connect to Google Cloud Storage to import data files from your GCP projects.
                        Use service account credentials to securely access your storage buckets.
                      </p>
                      <button className="btn btn-outline" onClick={() => {
                        setFormData({...formData, connection_type: 'gcp'});
                        handleAddNew();
                      }}>
                        Connect to Google Cloud
                      </button>
                    </div>
                    
                    <div className="cloud-provider-section azure">
                      <div className="cloud-provider-header">
                        <FiCloud className="cloud-provider-icon azure" />
                        <div className="cloud-provider-title">
                          <h3>Azure Blob Storage</h3>
                          <div className="cloud-provider-features">
                            Access data from Azure storage containers
                          </div>
                        </div>
                      </div>
                      <p>
                        Connect to Microsoft Azure Blob Storage to import files from your storage containers.
                        Supports secure access using storage account keys.
                      </p>
                      <button className="btn btn-outline" onClick={() => {
                        setFormData({...formData, connection_type: 'azure'});
                        handleAddNew();
                      }}>
                        Connect to Azure
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="connections-grid">
                  {connections.map(connection => (
                    <Card key={connection.id} className="connection-card">
                      <div className="connection-header">
                        {renderConnectionIcon(connection.connection_type)}
                        <div className="connection-title">
                          <h3>{connection.connection_name}</h3>
                          <span className="connection-type">
                            {getConnectionTypeLabel(connection.connection_type)}
                          </span>
                        </div>
                        <div className="connection-actions">
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
                        </div>
                      </div>
                      
                      <div className="connection-details">
                        {formatConnectionDetails(connection)}
                        <div className="connection-meta">
                          <span className="last-used">
                            Last used: {connection.last_used_at ? 
                              new Date(connection.last_used_at).toLocaleString() : 
                              'Never'}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Connections;