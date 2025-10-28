import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiDatabase, FiCloud, FiServer, FiHardDrive, FiFolder, FiMail, FiLink, FiCheckCircle, FiUploadCloud, FiAlertCircle, FiTruck } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import ConfirmationModal from '../components/ConfirmationModal';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import './Connections.css';

// Import the connection service
import { getConnections, createConnection, updateConnection, deleteConnection, testConnection, testSavedConnection, testConnectionWithUpdates } from '../api/connectionService';
import VendorConnectionModal from '../components/VendorConnectionModal';

const Connections = () => {
  const { hasWritePermission, hasExecutePermission, currentUser } = useAuth();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  const [testingConnection, setTestingConnection] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [activeTab, setActiveTab] = useState('source');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // Delete confirmation modal state
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState(null);
  const [isDeletingConnection, setIsDeletingConnection] = useState(false);
  const [showDeleteDropLocationModal, setShowDeleteDropLocationModal] = useState(false);
  
  // Test connection in modal state
  const [testingInModal, setTestingInModal] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);
  
  // Drop Location state
  const [dropLocationConfig, setDropLocationConfig] = useState(null);
  const [dropLocationConfigured, setDropLocationConfigured] = useState(false);
  const [dropLocationLoading, setDropLocationLoading] = useState(false);
  const [showDropLocationForm, setShowDropLocationForm] = useState(false);
  const [testingDropLocation, setTestingDropLocation] = useState(false);
  const [dropLocationTestResult, setDropLocationTestResult] = useState(null);
  const [dropLocationFormData, setDropLocationFormData] = useState({
    provider: 'aws',
    // AWS fields
    region: '',
    bucket: '',
    access_key_id: '',
    secret_access_key: '',
    endpoint: '',
    use_ssl: true,
    // GCP fields
    project_id: '',
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
  
  const isAdmin = currentUser?.roles?.includes('Admin');
  
  // Vendor Connections state
  const [vendorConnections, setVendorConnections] = useState([]);
  const [vendorConnectionsLoading, setVendorConnectionsLoading] = useState(false);
  const [showVendorConnectionModal, setShowVendorConnectionModal] = useState(false);
  const [editingVendorConnection, setEditingVendorConnection] = useState(null);
  const [projects, setProjects] = useState([]);
  const [deletingVendorConnectionId, setDeletingVendorConnectionId] = useState(null);
  const [vendorConnectionDeleteConfirmOpen, setVendorConnectionDeleteConfirmOpen] = useState(false);
  const [vendorConnectionToDelete, setVendorConnectionToDelete] = useState(null);
  
  // Connection form state
  const [formData, setFormData] = useState({
    connection_name: '',
    connection_type: 'aws',
    connection_direction: 'source',
    region: '',
    bucket_name: '',
    access_key: '',
    secret_key: '',
    project_id: '',
    client_email: '',
    private_key: '',
    account_name: '',
    account_key: '',
    container_name: '',
    // Snowflake credentials
    snowflake_account: '',
    snowflake_username: '',
    snowflake_password: '',
    snowflake_warehouse: '',
    snowflake_database: '',
    snowflake_schema: '',
    snowflake_role: '',
    // Databricks credentials
    databricks_host: '',
    databricks_token: '',
    databricks_catalog: '',
    databricks_schema: '',
    // SharePoint credentials
    sharepoint_tenant_id: '',
    sharepoint_client_id: '',
    sharepoint_client_secret: '',
    sharepoint_site_url: '',
    sharepoint_document_library: '',
    // Outlook credentials
    outlook_tenant_id: '',
    outlook_client_id: '',
    outlook_client_secret: '',
    outlook_user_email: '',
    outlook_folder_path: ''
  });
  
  // Fetch connections on component mount
  useEffect(() => {
    fetchConnections();
    if (isAdmin) {
      fetchDropLocationConfig();
      fetchVendorConnections();
      fetchProjects();
    }
  }, [isAdmin]);
  
  const fetchConnections = async () => {
    try {
      setLoading(true);
      const data = await getConnections();
      
      // Debug log to see the structure of connections
      console.log('Connections data:', data);
      
      // Process connections to ensure shared status is set
      const processedConnections = data.map(conn => ({
        ...conn,
        // Determine if connection is shared (has source_application that is not data_observatory)
        shared: conn.source_application && conn.source_application !== 'data_observatory'
      }));
      
      console.log('Processed connections:', processedConnections);
      setConnections(processedConnections);
      setError(null);
    } catch (err) {
      console.error('Error fetching connections:', err);
      setError('Failed to load connections. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Drop Location functions
  const fetchDropLocationConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/drop-location/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.configured) {
        const config = response.data.config;
        setDropLocationConfig(config);
        setDropLocationConfigured(true);
        setDropLocationFormData({
          provider: config.provider || 'aws',
          // AWS fields
          region: config.region || '',
          bucket: config.bucket || '',
          access_key_id: '',
          secret_access_key: '',
          endpoint: config.endpoint || '',
          use_ssl: config.use_ssl ?? true,
          // GCP fields
          project_id: config.project_id || '',
          service_account_json: '',
          gcp_bucket: config.gcp_bucket || '',
          // Azure fields
          account_name: config.account_name || '',
          account_key: '',
          container_name: config.container_name || '',
          azure_endpoint: config.azure_endpoint || '',
          // Common
          path_prefix: config.path_prefix || ''
        });
      }
    } catch (err) {
      console.error('Error fetching drop location config:', err);
    }
  };
  
  const handleDropLocationSubmit = async (e) => {
    e.preventDefault();
    setDropLocationLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/api/drop-location/config`,
        dropLocationFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setDropLocationConfig(response.data.config);
      setDropLocationConfigured(true);
      setShowDropLocationForm(false);
      setError(null);
    } catch (err) {
      console.error('Error saving drop location config:', err);
      setError('Failed to save drop location configuration. ' + (err.response?.data?.error || err.message));
    } finally {
      setDropLocationLoading(false);
    }
  };
  
  const handleDropLocationRemove = () => {
    setShowDeleteDropLocationModal(true);
  };
  
  const confirmDropLocationRemove = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/api/drop-location/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setDropLocationConfig(null);
      setDropLocationConfigured(false);
      setDropLocationFormData({
        provider: 'aws',
        // AWS fields
        region: '',
        bucket: '',
        access_key_id: '',
        secret_access_key: '',
        endpoint: '',
        use_ssl: true,
        // GCP fields
        project_id: '',
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
      setShowDeleteDropLocationModal(false);
    } catch (err) {
      console.error('Error removing drop location config:', err);
      setError('Failed to remove drop location configuration');
      setShowDeleteDropLocationModal(false);
    }
  };
  
  const handleTestDropLocation = async () => {
    try {
      setTestingDropLocation(true);
      setDropLocationTestResult(null);
      
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/drop-location/test`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Drop location test result:', response.data);
      setDropLocationTestResult(response.data);
    } catch (err) {
      console.error('Error testing drop location:', err);
      setDropLocationTestResult({
        success: false,
        message: err.response?.data?.message || `Test failed: ${err.message}`
      });
    } finally {
      setTestingDropLocation(false);
    }
  };
  
  const handleTestDropLocationInModal = async () => {
    try {
      setTestingDropLocation(true);
      setDropLocationTestResult(null);
      
      const token = localStorage.getItem('token');
      
      // Test with form data (backend will merge with saved credentials if needed)
      const response = await axios.post(
        `${API_BASE_URL}/api/drop-location/test`,
        dropLocationFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('Drop location modal test result:', response.data);
      setDropLocationTestResult(response.data);
    } catch (err) {
      console.error('Error testing drop location in modal:', err);
      setDropLocationTestResult({
        success: false,
        message: err.response?.data?.message || `Test failed: ${err.message}`
      });
    } finally {
      setTestingDropLocation(false);
    }
  };
  
  // Vendor Connections functions
  const fetchVendorConnections = async () => {
    if (!isAdmin) return;
    
    try {
      setVendorConnectionsLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/vendor-connections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setVendorConnections(response.data.connections || []);
    } catch (err) {
      console.error('Error fetching vendor connections:', err);
      setError('Failed to load vendor connections');
    } finally {
      setVendorConnectionsLoading(false);
    }
  };
  
  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setProjects(response.data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };
  
  const handleCreateVendorConnection = () => {
    setEditingVendorConnection(null);
    setShowVendorConnectionModal(true);
  };
  
  const handleEditVendorConnection = (connection) => {
    setEditingVendorConnection(connection);
    setShowVendorConnectionModal(true);
  };
  
  const handleVendorConnectionSuccess = () => {
    fetchVendorConnections();
    setError(null);
  };
  
  const openVendorConnectionDeleteConfirmation = (connectionId, connectionName) => {
    setVendorConnectionToDelete({ id: connectionId, name: connectionName });
    setVendorConnectionDeleteConfirmOpen(true);
  };
  
  const handleDeleteVendorConnection = async () => {
    if (!vendorConnectionToDelete) return;
    
    try {
      setDeletingVendorConnectionId(vendorConnectionToDelete.id);
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/api/vendor-connections/${vendorConnectionToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setVendorConnectionDeleteConfirmOpen(false);
      setVendorConnectionToDelete(null);
      fetchVendorConnections();
    } catch (err) {
      console.error('Error deleting vendor connection:', err);
      setError(err.response?.data?.error || 'Failed to delete vendor connection');
      setVendorConnectionDeleteConfirmOpen(false);
      setVendorConnectionToDelete(null);
    } finally {
      setDeletingVendorConnectionId(null);
    }
  };
  
  const handleAddNew = () => {
    setFormData({
      connection_name: '',
      connection_type: 'aws',
      connection_direction: activeTab,
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
    setModalTestResult(null);
    setShowForm(true);
  };
  
  const handleEdit = (connection) => {
    const { id, connection_name, connection_type, connection_direction } = connection;
    
    // Create a form data object with the correct fields based on connection type
    let newFormData = {
      connection_name,
      connection_type,
      connection_direction: connection_direction || 'source',
    };
    
    // Add type-specific fields
    if (connection_type === 'aws') {
      newFormData = {
        ...newFormData,
        region: connection.region || '',
        bucket_name: connection.bucket_name || '',
        access_key: '', // Don't prefill for security
        secret_key: '', // Don't prefill for security
        // Store flags to show credential status in UI
        has_access_key: connection.has_access_key,
        has_secret_key: connection.has_secret_key
      };
    } else if (connection_type === 'gcp') {
      newFormData = {
        ...newFormData,
        project_id: connection.project_id || '',
        bucket_name: connection.bucket_name || '',
        client_email: connection.client_email || '',
        private_key: '', // Don't prefill for security
        has_private_key: connection.has_private_key
      };
    } else if (connection_type === 'azure') {
      newFormData = {
        ...newFormData,
        account_name: connection.account_name || '',
        container_name: connection.container_name || '',
        account_key: '', // Don't prefill for security
        has_account_key: connection.has_account_key
      };
    } else if (connection_type === 'snowflake') {
      newFormData = {
        ...newFormData,
        snowflake_account: connection.snowflake_account || '',
        snowflake_username: connection.snowflake_username || '',
        snowflake_password: '', // Don't prefill for security
        snowflake_warehouse: connection.snowflake_warehouse || '',
        snowflake_database: connection.snowflake_database || '',
        snowflake_schema: connection.snowflake_schema || '',
        snowflake_role: connection.snowflake_role || '',
        has_snowflake_password: connection.has_snowflake_password
      };
    } else if (connection_type === 'databricks') {
      newFormData = {
        ...newFormData,
        databricks_host: connection.databricks_host || '',
        databricks_token: '', // Don't prefill for security
        databricks_catalog: connection.databricks_catalog || '',
        databricks_schema: connection.databricks_schema || '',
        has_databricks_token: connection.has_databricks_token
      };
    } else if (connection_type === 'sharepoint') {
      newFormData = {
        ...newFormData,
        sharepoint_tenant_id: connection.sharepoint_tenant_id || '',
        sharepoint_client_id: connection.sharepoint_client_id || '',
        sharepoint_client_secret: '', // Don't prefill for security
        sharepoint_site_url: connection.sharepoint_site_url || '',
        sharepoint_document_library: connection.sharepoint_document_library || ''
      };
    } else if (connection_type === 'outlook') {
      newFormData = {
        ...newFormData,
        outlook_tenant_id: connection.outlook_tenant_id || '',
        outlook_client_id: connection.outlook_client_id || '',
        outlook_client_secret: '', // Don't prefill secret for security
        outlook_user_email: connection.outlook_user_email || '',
        outlook_folder_path: connection.outlook_folder_path || ''
      };
    }
    
    setFormData(newFormData);
    setEditMode(true);
    setEditId(id);
    setModalTestResult(null);
    setShowForm(true);
  };
  
  const handleDelete = (id) => {
    const connection = connections.find(conn => conn.id === id);
    setConnectionToDelete(connection);
    setShowDeleteConnectionModal(true);
  };
  
  const confirmDeleteConnection = async () => {
    if (!connectionToDelete) return;
    
    setIsDeletingConnection(true);
    try {
      await deleteConnection(connectionToDelete.id);
      // Update local state without refetching
      setConnections(connections.filter(conn => conn.id !== connectionToDelete.id));
      setShowDeleteConnectionModal(false);
      setConnectionToDelete(null);
    } catch (err) {
      console.error('Error deleting connection:', err);
      setError('Failed to delete connection. Please try again.');
    } finally {
      setIsDeletingConnection(false);
    }
  };
  
  const closeDeleteConnectionModal = () => {
    setShowDeleteConnectionModal(false);
    setConnectionToDelete(null);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };
  
  const handleTestConnection = async (connection) => {
    try {
      setTestingConnection(connection.id);
      
      console.log('Testing saved connection ID:', connection.id);
      
      // For saved connections, use the new endpoint that fetches and decrypts credentials from database
      const result = await testSavedConnection(connection.id);
      
      console.log('Test result:', result);
      
      setTestResults({
        ...testResults,
        [connection.id]: {
          success: result.success,
          message: result.message || (result.success ? 'Connection successful' : 'Connection failed')
        }
      });
    } catch (err) {
      console.error('Error testing connection:', err);
      setTestResults({
        ...testResults,
        [connection.id]: {
          success: false,
          message: err.response?.data?.message || 'Connection test failed. Please check your credentials.'
        }
      });
    } finally {
      setTestingConnection(null);
    }
  };
  
  const handleTestConnectionInModal = async () => {
    try {
      setTestingInModal(true);
      setModalTestResult(null);
      
      let result;
      
      // Strip UI-only flags first
      const { 
        has_access_key, 
        has_secret_key, 
        has_private_key, 
        has_account_key,
        has_snowflake_password,
        has_databricks_token,
        has_sharepoint_client_secret,
        has_outlook_client_secret,
        ...cleanFormData 
      } = formData;
      
      if (editMode && editId) {
        // EDIT MODE: Test with form updates merged with saved credentials
        console.log('Testing connection in edit mode - merging form updates with saved credentials');
        result = await testConnectionWithUpdates(editId, cleanFormData);
      } else {
        // NEW CONNECTION: Test with form data only
        const configData = {
          connection_type: cleanFormData.connection_type,
          ...cleanFormData
        };
        
        console.log('Testing new connection with form data');
        result = await testConnection(configData);
      }
      
      console.log('Modal test result:', result);
      
      setModalTestResult({
        success: result.success,
        message: result.message || (result.success ? 'Connection successful' : 'Connection failed')
      });
    } catch (err) {
      console.error('Error testing connection in modal:', err);
      setModalTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection test failed. Please check your credentials.'
      });
    } finally {
      setTestingInModal(false);
    }
  };
  
  const handleConnectionTypeChange = (e) => {
    const connectionType = e.target.value;
    // Reset form data to avoid field confusion between types
    setFormData({
      ...formData,
      connection_type: connectionType,
      
      // Clear fields that aren't relevant to the new type
      // AWS fields
      region: connectionType === 'aws' ? formData.region : '',
      bucket_name: ['aws', 'gcp'].includes(connectionType) ? formData.bucket_name : '',
      access_key: connectionType === 'aws' ? formData.access_key : '',
      secret_key: connectionType === 'aws' ? formData.secret_key : '',
      
      // GCP fields
      project_id: connectionType === 'gcp' ? formData.project_id : '',
      client_email: connectionType === 'gcp' ? formData.client_email : '',
      private_key: connectionType === 'gcp' ? formData.private_key : '',
      
      // Azure fields
      account_name: connectionType === 'azure' ? formData.account_name : '',
      account_key: connectionType === 'azure' ? formData.account_key : '',
      container_name: connectionType === 'azure' ? formData.container_name : '',
      
      // Snowflake fields
      snowflake_account: connectionType === 'snowflake' ? formData.snowflake_account : '',
      snowflake_username: connectionType === 'snowflake' ? formData.snowflake_username : '',
      snowflake_password: connectionType === 'snowflake' ? formData.snowflake_password : '',
      snowflake_warehouse: connectionType === 'snowflake' ? formData.snowflake_warehouse : '',
      snowflake_database: connectionType === 'snowflake' ? formData.snowflake_database : '',
      snowflake_schema: connectionType === 'snowflake' ? formData.snowflake_schema : '',
      snowflake_role: connectionType === 'snowflake' ? formData.snowflake_role : '',
      
      // Databricks fields
      databricks_host: connectionType === 'databricks' ? formData.databricks_host : '',
      databricks_token: connectionType === 'databricks' ? formData.databricks_token : '',
      databricks_catalog: connectionType === 'databricks' ? formData.databricks_catalog : '',
      databricks_schema: connectionType === 'databricks' ? formData.databricks_schema : '',
      
      // SharePoint fields
      sharepoint_tenant_id: connectionType === 'sharepoint' ? formData.sharepoint_tenant_id : '',
      sharepoint_client_id: connectionType === 'sharepoint' ? formData.sharepoint_client_id : '',
      sharepoint_client_secret: connectionType === 'sharepoint' ? formData.sharepoint_client_secret : '',
      sharepoint_site_url: connectionType === 'sharepoint' ? formData.sharepoint_site_url : '',
      sharepoint_document_library: connectionType === 'sharepoint' ? formData.sharepoint_document_library : '',
      
      // Outlook fields
      outlook_tenant_id: connectionType === 'outlook' ? formData.outlook_tenant_id : '',
      outlook_client_id: connectionType === 'outlook' ? formData.outlook_client_id : '',
      outlook_client_secret: connectionType === 'outlook' ? formData.outlook_client_secret : '',
      outlook_user_email: connectionType === 'outlook' ? formData.outlook_user_email : '',
      outlook_folder_path: connectionType === 'outlook' ? formData.outlook_folder_path : ''
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Strip UI-only flags before sending to API
      const { 
        has_access_key, 
        has_secret_key, 
        has_private_key, 
        has_account_key,
        has_snowflake_password,
        has_databricks_token,
        has_sharepoint_client_secret,
        has_outlook_client_secret,
        ...cleanFormData 
      } = formData;
      
      if (editMode) {
        await updateConnection(editId, cleanFormData);
      } else {
        await createConnection(cleanFormData);
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
      case 'snowflake':
        return <FiDatabase className="connection-icon snowflake" />;
      case 'databricks':
        return <FiDatabase className="connection-icon databricks" />;
      case 'sharepoint':
        return <FiFolder className="connection-icon sharepoint" />;
      case 'outlook':
        return <FiMail className="connection-icon outlook" />;
      default:
        return <FiDatabase className="connection-icon" />;
    }
  };
  
  const renderFormFields = () => {
    const { connection_type } = formData;
    
    // Common fields for all connection types
    const commonFields = (
      <div className="form-grid">
        <div className="form-group form-group-full">
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
            <option value="snowflake">Snowflake</option>
            <option value="databricks">Databricks</option>
            <option value="sharepoint">SharePoint</option>
            <option value="outlook">Outlook</option>
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="connection_direction">Connection Direction</label>
          <select
            id="connection_direction"
            name="connection_direction"
            className="form-control"
            value={formData.connection_direction}
            onChange={handleInputChange}
            required
          >
            <option value="source">Source (Read data from)</option>
            <option value="target">Target (Write data to)</option>
          </select>
        </div>
      </div>
    );
    
    // Type-specific fields
    let specificFields;
    
    if (connection_type === 'aws') {
      specificFields = (
        <div className="form-grid">
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
              required={!editMode || !formData.has_access_key}
              placeholder={editMode && formData.has_access_key ? '(saved - leave blank to keep)' : ''}
            />
            {editMode && formData.has_access_key && (
              <small className="form-text text-muted">
                ✓ Access key is saved. Leave blank to keep existing, or enter new value to update.
              </small>
            )}
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
              required={!editMode || !formData.has_secret_key}
              placeholder={editMode && formData.has_secret_key ? '(saved - leave blank to keep)' : ''}
            />
            {editMode && formData.has_secret_key && (
              <small className="form-text text-muted">
                ✓ Secret key is saved. Leave blank to keep existing, or enter new value to update.
              </small>
            )}
          </div>
        </div>
      );
    } else if (connection_type === 'gcp') {
      specificFields = (
        <div className="form-grid">
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
          
          <div className="form-group form-group-full">
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
          
          <div className="form-group form-group-full">
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
        </div>
      );
    } else if (connection_type === 'azure') {
      specificFields = (
        <div className="form-grid">
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
          
          <div className="form-group form-group-full">
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
        </div>
      );
    } else if (connection_type === 'snowflake') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group form-group-full">
            <label htmlFor="snowflake_account">Snowflake Account</label>
            <input
              type="text"
              id="snowflake_account"
              name="snowflake_account"
              className="form-control"
              value={formData.snowflake_account}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              The account identifier (e.g., xy12345.us-east-1)
            </small>
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
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="snowflake_role">Role</label>
            <input
              type="text"
              id="snowflake_role"
              name="snowflake_role"
              className="form-control"
              value={formData.snowflake_role}
              onChange={handleInputChange}
            />
            <small className="form-text text-muted">
              Optional - leave blank to use the default role
            </small>
          </div>
        </div>
      );
    } else if (connection_type === 'databricks') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group form-group-full">
            <label htmlFor="databricks_host">Databricks Host</label>
            <input
              type="text"
              id="databricks_host"
              name="databricks_host"
              className="form-control"
              value={formData.databricks_host}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              The Databricks workspace URL (e.g., https://dbc-abc123.cloud.databricks.com)
            </small>
          </div>
          
          <div className="form-group form-group-full">
            <label htmlFor="databricks_token">Access Token</label>
            <input
              type="password"
              id="databricks_token"
              name="databricks_token"
              className="form-control"
              value={formData.databricks_token}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
            />
            {editMode && (
              <small className="form-text text-muted">
                Leave blank to keep the existing token.
              </small>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="databricks_catalog">Catalog</label>
            <input
              type="text"
              id="databricks_catalog"
              name="databricks_catalog"
              className="form-control"
              value={formData.databricks_catalog}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="databricks_schema">Schema</label>
            <input
              type="text"
              id="databricks_schema"
              name="databricks_schema"
              className="form-control"
              value={formData.databricks_schema}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>
      );
    } else if (connection_type === 'sharepoint') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="sharepoint_tenant_id">Microsoft Tenant ID</label>
            <input
              type="text"
              id="sharepoint_tenant_id"
              name="sharepoint_tenant_id"
              className="form-control"
              value={formData.sharepoint_tenant_id}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              Your Microsoft 365 tenant ID
            </small>
          </div>
          
          <div className="form-group">
            <label htmlFor="sharepoint_client_id">Application (Client) ID</label>
            <input
              type="text"
              id="sharepoint_client_id"
              name="sharepoint_client_id"
              className="form-control"
              value={formData.sharepoint_client_id}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              Client ID from your Azure AD registered application
            </small>
          </div>
          
          <div className="form-group form-group-full">
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
          
          <div className="form-group form-group-full">
            <label htmlFor="sharepoint_site_url">SharePoint Site URL</label>
            <input
              type="text"
              id="sharepoint_site_url"
              name="sharepoint_site_url"
              className="form-control"
              value={formData.sharepoint_site_url}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              The URL of your SharePoint site (e.g., https://contoso.sharepoint.com/sites/mysite)
            </small>
          </div>
          
          <div className="form-group form-group-full">
            <label htmlFor="sharepoint_document_library">Document Library</label>
            <input
              type="text"
              id="sharepoint_document_library"
              name="sharepoint_document_library"
              className="form-control"
              value={formData.sharepoint_document_library}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              Name of the document library where your files are stored (e.g., "Documents" or "Shared Documents")
            </small>
          </div>
        </div>
      );
    } else if (connection_type === 'outlook') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="outlook_tenant_id">Microsoft Tenant ID</label>
            <input
              type="text"
              id="outlook_tenant_id"
              name="outlook_tenant_id"
              className="form-control"
              value={formData.outlook_tenant_id}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              Your Microsoft 365 tenant ID
            </small>
          </div>
          
          <div className="form-group">
            <label htmlFor="outlook_client_id">Application (Client) ID</label>
            <input
              type="text"
              id="outlook_client_id"
              name="outlook_client_id"
              className="form-control"
              value={formData.outlook_client_id}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              Client ID from your Azure AD registered application
            </small>
          </div>
          
          <div className="form-group form-group-full">
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
          
          <div className="form-group">
            <label htmlFor="outlook_user_email">User Email</label>
            <input
              type="email"
              id="outlook_user_email"
              name="outlook_user_email"
              className="form-control"
              value={formData.outlook_user_email}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              The email address of the Outlook account to access
            </small>
          </div>
          
          <div className="form-group">
            <label htmlFor="outlook_folder_path">Folder Path</label>
            <input
              type="text"
              id="outlook_folder_path"
              name="outlook_folder_path"
              className="form-control"
              value={formData.outlook_folder_path}
              onChange={handleInputChange}
              required
            />
            <small className="form-text text-muted">
              Path to the folder containing attachment files (e.g., "Inbox/Reports" or leave as "Inbox" for default)
            </small>
          </div>
        </div>
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
    } else if (connection_type === 'snowflake') {
      return (
        <>
          <div><strong>Account:</strong> {connection.snowflake_account}</div>
          <div><strong>Database:</strong> {connection.snowflake_database}</div>
          <div><strong>Schema:</strong> {connection.snowflake_schema}</div>
        </>
      );
    } else if (connection_type === 'databricks') {
      return (
        <>
          <div><strong>Host:</strong> {connection.databricks_host}</div>
          <div><strong>Catalog:</strong> {connection.databricks_catalog}</div>
          <div><strong>Schema:</strong> {connection.databricks_schema}</div>
        </>
      );
    } else if (connection_type === 'sharepoint') {
      return (
        <>
          <div><strong>Site URL:</strong> {connection.sharepoint_site_url}</div>
          <div><strong>Document Library:</strong> {connection.sharepoint_document_library}</div>
        </>
      );
    } else if (connection_type === 'outlook') {
      return (
        <>
          <div><strong>Email:</strong> {connection.outlook_user_email}</div>
          <div><strong>Folder:</strong> {connection.outlook_folder_path}</div>
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
      case 'snowflake': return 'Snowflake';
      case 'databricks': return 'Databricks';
      case 'sharepoint': return 'SharePoint';
      case 'outlook': return 'Outlook';
      default: return type;
    }
  };
  
  // Filter connections based on active tab
  const filteredConnections = connections.filter(conn => 
    conn.connection_direction === activeTab || (!conn.connection_direction && activeTab === 'source')
  );

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentConnections = filteredConnections.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredConnections.length / itemsPerPage);

  // Reset to page 1 when changing tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  return (
    <div className="connections-container">
      <div className="connections-header">
        <h1>Cloud Storage Connections</h1>
      </div>
      
      {/* Vendor Connections Section (Admin Only) */}
      {isAdmin && (
        <Card style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <FiTruck />
                Vendor Connections
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>
                Manage multiple vendor file drop connections
              </p>
            </div>
            <button 
              className="btn btn-primary"
              onClick={handleCreateVendorConnection}
            >
              <FiPlus /> Create Vendor Connection
            </button>
          </div>
          
          {vendorConnectionsLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              Loading vendor connections...
            </div>
          ) : vendorConnections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              <p>No vendor connections configured.</p>
              <p>Create a vendor connection to enable vendor file uploads.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="connections-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Project</th>
                    <th>Provider</th>
                    <th>Bucket/Container</th>
                    <th>Path</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorConnections.map(conn => {
                    const config = conn.config || {};
                    const bucket = config.bucket || config.gcp_bucket || config.container_name || '-';
                    const path = config.path_prefix || '/';
                    
                    return (
                      <tr key={conn.connection_id}>
                        <td>{conn.name}</td>
                        <td>{conn.project_name || '-'}</td>
                        <td style={{ textTransform: 'uppercase' }}>
                          {config.provider || 'AWS'}
                        </td>
                        <td>{bucket}</td>
                        <td>{path}</td>
                        <td>
                          <span className={`status-badge ${conn.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                            {conn.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => handleEditVendorConnection(conn)}
                              title="Edit"
                            >
                              <FiEdit2 />
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => openVendorConnectionDeleteConfirmation(conn.connection_id, conn.name)}
                              disabled={deletingVendorConnectionId === conn.connection_id}
                              title="Delete"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      
      {/* Drop Location Configuration (Admin Only) */}
      {isAdmin && (
        <Card className="drop-location-card" style={{ marginBottom: '2rem' }}>
          <div className="drop-location-header">
            <div>
              <h2><FiUploadCloud style={{ marginRight: '0.5rem' }} />Drop File Location</h2>
              <p className="drop-location-subtitle">
                Configure a single cloud storage location for quick file uploads without profiling
              </p>
            </div>
            {dropLocationConfigured && !showDropLocationForm && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-outline"
                  onClick={() => {
                    setShowDropLocationForm(true);
                    setDropLocationTestResult(null);
                  }}
                >
                  <FiEdit2 /> Edit
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={handleDropLocationRemove}
                  title="Delete drop location"
                >
                  <FiTrash2 />
                </button>
              </div>
            )}
          </div>
          
          {showDropLocationForm ? (
            <form onSubmit={handleDropLocationSubmit} style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label htmlFor="drop_provider">Cloud Provider *</label>
                <select
                  id="drop_provider"
                  className="form-control"
                  value={dropLocationFormData.provider}
                  onChange={(e) => setDropLocationFormData({...dropLocationFormData, provider: e.target.value})}
                  required
                >
                  <option value="aws">AWS S3</option>
                  <option value="gcp">Google Cloud Storage</option>
                  <option value="azure">Azure Blob Storage</option>
                </select>
              </div>

              {/* AWS S3 Fields */}
              {dropLocationFormData.provider === 'aws' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="drop_region">AWS Region</label>
                      <input
                        type="text"
                        id="drop_region"
                        className="form-control"
                        value={dropLocationFormData.region}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, region: e.target.value})}
                        placeholder="us-east-1"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="drop_bucket">S3 Bucket *</label>
                      <input
                        type="text"
                        id="drop_bucket"
                        className="form-control"
                        value={dropLocationFormData.bucket}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, bucket: e.target.value})}
                        required
                        placeholder="my-drop-bucket"
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="drop_access_key">Access Key ID</label>
                      <input
                        type="text"
                        id="drop_access_key"
                        className="form-control"
                        value={dropLocationFormData.access_key_id}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, access_key_id: e.target.value})}
                        placeholder={dropLocationConfig?.hasCredentials ? '(saved - leave blank to keep)' : ''}
                      />
                      {dropLocationConfig?.hasCredentials && (
                        <small className="form-text text-muted">
                          ✓ Access key is saved. Leave blank to keep existing, or enter new value to update.
                        </small>
                      )}
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="drop_secret_key">Secret Access Key</label>
                      <input
                        type="password"
                        id="drop_secret_key"
                        className="form-control"
                        value={dropLocationFormData.secret_access_key}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, secret_access_key: e.target.value})}
                        placeholder={dropLocationConfig?.hasCredentials ? '(saved - leave blank to keep)' : ''}
                      />
                      {dropLocationConfig?.hasCredentials && (
                        <small className="form-text text-muted">
                          ✓ Secret key is saved. Leave blank to keep existing, or enter new value to update.
                        </small>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="drop_endpoint">Custom Endpoint (Optional)</label>
                    <input
                      type="text"
                      id="drop_endpoint"
                      className="form-control"
                      value={dropLocationFormData.endpoint}
                      onChange={(e) => setDropLocationFormData({...dropLocationFormData, endpoint: e.target.value})}
                      placeholder="https://s3.custom-endpoint.com"
                    />
                  </div>
                </>
              )}

              {/* GCP Storage Fields */}
              {dropLocationFormData.provider === 'gcp' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="drop_project_id">GCP Project ID *</label>
                      <input
                        type="text"
                        id="drop_project_id"
                        className="form-control"
                        value={dropLocationFormData.project_id}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, project_id: e.target.value})}
                        required
                        placeholder="my-gcp-project"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="drop_gcp_bucket">Storage Bucket *</label>
                      <input
                        type="text"
                        id="drop_gcp_bucket"
                        className="form-control"
                        value={dropLocationFormData.gcp_bucket}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, gcp_bucket: e.target.value})}
                        required
                        placeholder="my-drop-bucket"
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="drop_service_account">Service Account JSON *</label>
                    <textarea
                      id="drop_service_account"
                      className="form-control"
                      rows="4"
                      value={dropLocationFormData.service_account_json}
                      onChange={(e) => setDropLocationFormData({...dropLocationFormData, service_account_json: e.target.value})}
                      placeholder={dropLocationConfig?.hasCredentials ? '(saved - leave blank to keep)' : 'Paste your service account JSON key here'}
                    />
                    {dropLocationConfig?.hasCredentials ? (
                      <small className="form-text text-muted">
                        ✓ Service account is saved. Leave blank to keep existing, or enter new value to update.
                      </small>
                    ) : (
                      <small className="form-text text-muted">
                        Service account must have Storage Object Admin role
                      </small>
                    )}
                  </div>
                </>
              )}

              {/* Azure Blob Storage Fields */}
              {dropLocationFormData.provider === 'azure' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="drop_account_name">Storage Account Name *</label>
                      <input
                        type="text"
                        id="drop_account_name"
                        className="form-control"
                        value={dropLocationFormData.account_name}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, account_name: e.target.value})}
                        required
                        placeholder="mystorageaccount"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="drop_container_name">Container Name *</label>
                      <input
                        type="text"
                        id="drop_container_name"
                        className="form-control"
                        value={dropLocationFormData.container_name}
                        onChange={(e) => setDropLocationFormData({...dropLocationFormData, container_name: e.target.value})}
                        required
                        placeholder="my-drop-container"
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="drop_account_key">Account Key</label>
                    <input
                      type="password"
                      id="drop_account_key"
                      className="form-control"
                      value={dropLocationFormData.account_key}
                      onChange={(e) => setDropLocationFormData({...dropLocationFormData, account_key: e.target.value})}
                      placeholder={dropLocationConfig?.hasCredentials ? '(saved - leave blank to keep)' : 'Enter your storage account key'}
                    />
                    {dropLocationConfig?.hasCredentials && (
                      <small className="form-text text-muted">
                        ✓ Account key is saved. Leave blank to keep existing, or enter new value to update.
                      </small>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="drop_azure_endpoint">Custom Endpoint (Optional)</label>
                    <input
                      type="text"
                      id="drop_azure_endpoint"
                      className="form-control"
                      value={dropLocationFormData.azure_endpoint}
                      onChange={(e) => setDropLocationFormData({...dropLocationFormData, azure_endpoint: e.target.value})}
                      placeholder="https://mystorageaccount.blob.core.windows.net"
                    />
                  </div>
                </>
              )}

              {/* Common Fields */}
              <div className="form-group">
                <label htmlFor="drop_path_prefix">Path Prefix (Optional)</label>
                <input
                  type="text"
                  id="drop_path_prefix"
                  className="form-control"
                  value={dropLocationFormData.path_prefix}
                  onChange={(e) => setDropLocationFormData({...dropLocationFormData, path_prefix: e.target.value})}
                  placeholder="uploads/drop-files"
                />
                <small className="form-text text-muted">
                  Optional folder path within {dropLocationFormData.provider === 'azure' ? 'container' : 'bucket'}
                </small>
              </div>
              
              {/* Test Connection in Modal */}
              {dropLocationTestResult && (
                <div className={`test-result ${dropLocationTestResult.success ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
                  {dropLocationTestResult.success ? (
                    <><FiCheckCircle /> {dropLocationTestResult.message}</>
                  ) : (
                    <><FiAlertCircle /> {dropLocationTestResult.message}</>
                  )}
                </div>
              )}
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowDropLocationForm(false);
                    setDropLocationTestResult(null);
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleTestDropLocationInModal}
                  disabled={testingDropLocation}
                >
                  {testingDropLocation ? 'Testing...' : 'Test Connection'}
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={dropLocationLoading}
                >
                  {dropLocationLoading ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          ) : dropLocationConfigured ? (
            <div className="drop-location-info">
              <div className="info-grid">
                <div className="info-item">
                  <strong>Provider:</strong> {
                    dropLocationConfig.provider === 'aws' ? 'AWS S3' :
                    dropLocationConfig.provider === 'gcp' ? 'Google Cloud Storage' :
                    dropLocationConfig.provider === 'azure' ? 'Azure Blob Storage' :
                    dropLocationConfig.provider || 'AWS S3'
                  }
                </div>
                
                {dropLocationConfig.provider === 'aws' && (
                  <>
                    <div className="info-item">
                      <strong>Bucket:</strong> {dropLocationConfig.bucket}
                    </div>
                    {dropLocationConfig.region && (
                      <div className="info-item">
                        <strong>Region:</strong> {dropLocationConfig.region}
                      </div>
                    )}
                  </>
                )}
                
                {dropLocationConfig.provider === 'gcp' && (
                  <>
                    <div className="info-item">
                      <strong>Bucket:</strong> {dropLocationConfig.gcp_bucket}
                    </div>
                    <div className="info-item">
                      <strong>Project:</strong> {dropLocationConfig.project_id}
                    </div>
                  </>
                )}
                
                {dropLocationConfig.provider === 'azure' && (
                  <>
                    <div className="info-item">
                      <strong>Container:</strong> {dropLocationConfig.container_name}
                    </div>
                    <div className="info-item">
                      <strong>Account:</strong> {dropLocationConfig.account_name}
                    </div>
                  </>
                )}
                
                {dropLocationConfig.path_prefix && (
                  <div className="info-item">
                    <strong>Path Prefix:</strong> {dropLocationConfig.path_prefix}
                  </div>
                )}
                <div className="info-item">
                  <strong>Credentials:</strong> {dropLocationConfig.hasCredentials ? 'Configured' : 'Not set'}
                </div>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleTestDropLocation}
                  disabled={testingDropLocation || !dropLocationConfig.hasCredentials}
                >
                  {testingDropLocation ? 'Testing...' : 'Test Connection'}
                </button>
                
                {dropLocationTestResult && (
                  <div className={`test-result ${dropLocationTestResult.success ? 'success' : 'error'}`}>
                    {dropLocationTestResult.success ? (
                      <><FiCheckCircle /> {dropLocationTestResult.message}</>
                    ) : (
                      <><FiAlertCircle /> {dropLocationTestResult.message}</>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="drop-location-empty">
              <p>No drop location configured. Configure a cloud storage location to enable drop file uploads.</p>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setShowDropLocationForm(true);
                  setDropLocationTestResult(null);
                }}
              >
                <FiPlus /> Configure Drop Location
              </button>
            </div>
          )}
        </Card>
      )}
      
      <div className="connections-tabs">
        <button 
          className={`tab-button ${activeTab === 'source' ? 'active' : ''}`}
          onClick={() => setActiveTab('source')}
        >
          Source Connections
        </button>
        <button 
          className={`tab-button ${activeTab === 'target' ? 'active' : ''}`}
          onClick={() => setActiveTab('target')}
        >
          Target Connections
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
          {/* Add Connection button inside tab */}
          {!showForm && hasWritePermission('connections') && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button className="btn btn-primary add-connection-btn" onClick={handleAddNew}>
                <FiPlus /> Add Connection
              </button>
            </div>
          )}
          
          {showForm ? (
            <Card className="connection-form-container">
              <h2>{editMode ? 'Edit Connection' : 'Add New Connection'}</h2>
              <form onSubmit={handleSubmit}>
                {renderFormFields()}
                
                {/* Test Connection Result */}
                {modalTestResult && (
                  <div className={`test-result ${modalTestResult.success ? 'success' : 'error'}`}>
                    {modalTestResult.success ? (
                      <><FiCheckCircle /> {modalTestResult.message}</>
                    ) : (
                      <><FiAlertCircle /> {modalTestResult.message}</>
                    )}
                  </div>
                )}
                
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                  {hasExecutePermission('connection') && (
                    <button 
                      type="button" 
                      className="btn btn-outline" 
                      onClick={handleTestConnectionInModal}
                      disabled={testingInModal}
                    >
                      {testingInModal ? 'Testing...' : 'Test Connection'}
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary">
                    {editMode ? 'Update' : 'Save'} Connection
                  </button>
                </div>
              </form>
            </Card>
          ) : (
            <>
              {filteredConnections.length === 0 ? (
                <>
                  <div className="no-connections">
                    <FiServer className="empty-icon" />
                    <p>No {activeTab} connections configured yet.</p>
                    <p>Add a {activeTab} connection to {activeTab === 'source' ? 'import data from' : 'export data to'} cloud storage.</p>
                    {hasWritePermission('connections') ? (
                      <button className="btn btn-primary" onClick={handleAddNew}>
                        Add Your First Connection
                      </button>
                    ) : (
                      <div className="permission-notice">
                        You don't have permission to create connections
                      </div>
                    )}
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
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'aws'});
                          handleAddNew();
                        }}>
                          Connect to AWS S3
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
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
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'gcp'});
                          handleAddNew();
                        }}>
                          Connect to Google Cloud
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
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
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'azure'});
                          handleAddNew();
                        }}>
                          Connect to Azure
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
                    </div>
                    
                    <div className="cloud-provider-section snowflake">
                      <div className="cloud-provider-header">
                        <FiDatabase className="cloud-provider-icon snowflake" />
                        <div className="cloud-provider-title">
                          <h3>Snowflake</h3>
                          <div className="cloud-provider-features">
                            Connect to your Snowflake data warehouse
                          </div>
                        </div>
                      </div>
                      <p>
                        Access data directly from your Snowflake data warehouse. Query tables and views
                        to import data for profiling, quality checks, and lineage tracking.
                      </p>
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'snowflake'});
                          handleAddNew();
                        }}>
                          Connect to Snowflake
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
                    </div>
                    
                    <div className="cloud-provider-section databricks">
                      <div className="cloud-provider-header">
                        <FiDatabase className="cloud-provider-icon databricks" />
                        <div className="cloud-provider-title">
                          <h3>Databricks</h3>
                          <div className="cloud-provider-features">
                            Access data from your Databricks lakehouse
                          </div>
                        </div>
                      </div>
                      <p>
                        Connect to Databricks to access tables and views from your lakehouse platform.
                        Seamlessly import structured data for advanced profiling and quality monitoring.
                      </p>
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'databricks'});
                          handleAddNew();
                        }}>
                          Connect to Databricks
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
                    </div>

                    <div className="cloud-provider-section sharepoint">
                      <div className="cloud-provider-header">
                        <FiFolder className="cloud-provider-icon sharepoint" />
                        <div className="cloud-provider-title">
                          <h3>SharePoint</h3>
                          <div className="cloud-provider-features">
                            Access files from Microsoft SharePoint document libraries
                          </div>
                        </div>
                      </div>
                      <p>
                        Connect to Microsoft SharePoint to access files from your organization's document libraries.
                        Import spreadsheets, reports, and data files directly from SharePoint sites.
                      </p>
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'sharepoint'});
                          handleAddNew();
                        }}>
                          Connect to SharePoint
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
                    </div>

                    <div className="cloud-provider-section outlook">
                      <div className="cloud-provider-header">
                        <FiMail className="cloud-provider-icon outlook" />
                        <div className="cloud-provider-title">
                          <h3>Outlook</h3>
                          <div className="cloud-provider-features">
                            Process email attachments from Outlook folders
                          </div>
                        </div>
                      </div>
                      <p>
                        Connect to Microsoft Outlook to access and process file attachments from emails.
                        Automatically import data from scheduled reports sent to your inbox.
                      </p>
                      {hasWritePermission('connections') ? (
                        <button className="btn btn-outline" onClick={() => {
                          setFormData({...formData, connection_type: 'outlook'});
                          handleAddNew();
                        }}>
                          Connect to Outlook
                        </button>
                      ) : (
                        <div className="permission-notice-sm">
                          Requires write permission
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="connections-table-container">
                    <table className="connections-table">
                    <thead>
                      <tr>
                        <th className="col-icon"></th>
                        <th className="col-project">Project</th>
                        <th className="col-name">Connection Name</th>
                        <th className="col-type">Type</th>
                        <th className="col-details">Details</th>
                        <th className="col-last-used">Last Used</th>
                        <th className="col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentConnections.map(connection => (
                        <tr key={connection.id} className={`connection-row ${connection.connection_type || connection.type}`}>
                          <td className="col-icon">
                            {renderConnectionIcon(connection.connection_type || connection.type)}
                          </td>
                          <td className="col-project">
                            {connection.project_name || 'Default Project'}
                          </td>
                          <td className="col-name">
                            <div className="connection-name-wrapper">
                              {connection.connection_name}
                              {(connection.shared || (connection.source_application && connection.source_application !== 'data_observatory')) && (
                                <span className="shared-badge" title="Shared with Transform">
                                  <FiLink />
                                </span>
                              )}
                            </div>
                            {connection.source_application && connection.source_application !== 'data_observatory' && (
                              <div className="source-app-badge">Source: {connection.source_application}</div>
                            )}
                          </td>
                          <td className="col-type">
                            {getConnectionTypeLabel(connection.connection_type)}
                          </td>
                          <td className="col-details">
                            <div className="connection-details-inline">
                              {formatConnectionDetails(connection)}
                            </div>
                            {testResults[connection.id] && (
                              <div className={`test-result ${testResults[connection.id].success ? 'success' : 'error'}`}>
                                {testResults[connection.id].success ? (
                                  <><FiCheckCircle /> Connection is working</>
                                ) : (
                                  <span className="error-message">{testResults[connection.id].message}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="col-last-used">
                            {connection.last_used_at ? 
                              new Date(connection.last_used_at).toLocaleDateString() : 
                              'Never'}
                          </td>
                          <td className="col-actions">
                            <div className="table-actions">
                              {hasExecutePermission('connection') && (
                                <button 
                                  className="action-icon-btn test-btn" 
                                  onClick={() => handleTestConnection(connection)}
                                  disabled={testingConnection === connection.id}
                                  title="Test connection"
                                >
                                  {testingConnection === connection.id ? '...' : <FiCheckCircle />}
                                </button>
                              )}
                              {hasWritePermission('connections') && (
                                <>
                                  <button 
                                    className="action-icon-btn edit-btn" 
                                    onClick={() => handleEdit(connection)}
                                    title="Edit connection"
                                  >
                                    <FiEdit2 />
                                  </button>
                                  <button 
                                    className="action-icon-btn delete-btn" 
                                    onClick={() => handleDelete(connection.id)}
                                    title="Delete connection"
                                  >
                                    <FiTrash2 />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsPerPage={itemsPerPage}
                  totalItems={filteredConnections.length}
                />
                </>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Delete Connection Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConnectionModal}
        onClose={closeDeleteConnectionModal}
        onConfirm={confirmDeleteConnection}
        fileName={connectionToDelete?.connection_name}
        isDeleting={isDeletingConnection}
      />
      
      {/* Delete Drop Location Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteDropLocationModal}
        onClose={() => setShowDeleteDropLocationModal(false)}
        onConfirm={confirmDropLocationRemove}
        fileName="Drop Location Configuration"
        isDeleting={false}
      />
      
      {/* Vendor Connection Modal */}
      <VendorConnectionModal
        isOpen={showVendorConnectionModal}
        onClose={() => setShowVendorConnectionModal(false)}
        onSuccess={handleVendorConnectionSuccess}
        connection={editingVendorConnection}
        projects={projects}
      />
      
      {/* Vendor Connection Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={vendorConnectionDeleteConfirmOpen}
        onClose={() => {
          setVendorConnectionDeleteConfirmOpen(false);
          setVendorConnectionToDelete(null);
        }}
        onConfirm={handleDeleteVendorConnection}
        title="Delete Vendor Connection"
        message={`Are you sure you want to delete the vendor connection "${vendorConnectionToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonStyle={{ background: '#dc2626' }}
      />
    </div>
  );
};

export default Connections;