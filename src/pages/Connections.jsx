import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiEdit2, FiFolder, FiMail, FiLink, FiDatabase, FiCloud, FiCheckCircle, FiAlertCircle, FiSearch, FiActivity, FiServer } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ConnectionDeleteModal from '../components/ConnectionDeleteModal';
import S3FolderBrowser from '../components/S3FolderBrowser';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import './Connections.css';

// Import the connection service
import { getConnections, createConnection, updateConnection, deleteConnection, testConnection, testSavedConnection, testConnectionWithUpdates, checkConnectionDependencies } from '../api/connectionService';

const Connections = () => {
  const { hasWritePermission, hasExecutePermission, currentUser } = useAuth();
  const [connections, setConnections] = useState([]);
  const [projects, setProjects] = useState([]);
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
  const [searchTerm, setSearchTerm] = useState('');
  
  // Delete confirmation modal state
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState(null);
  const [isDeletingConnection, setIsDeletingConnection] = useState(false);
  const [connectionDependencies, setConnectionDependencies] = useState(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  
  // Connection usage tracking
  const [connectionUsageMap, setConnectionUsageMap] = useState({});
  
  // Test connection in modal state
  const [testingInModal, setTestingInModal] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);
  
  // Browse folder state
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [connectionDetailsModified, setConnectionDetailsModified] = useState(false);
  const [testSuccessful, setTestSuccessful] = useState(false);
  const [testCredentials, setTestCredentials] = useState(null);
  
  // Check for admin-level access (uses permission-based check for backward compatibility)
  const isAdmin = currentUser?.permissions?.some(p => 
    typeof p === 'string' 
      ? ['users:write', 'roles:write', 'project_management:write'].includes(p)
      : ['users:write', 'roles:write', 'project_management:write'].includes(p.name)
  ) || currentUser?.roles?.includes('Admin');

  
  // Compute whether user can browse folders
  // Must have either saved connection or successful test, AND no modifications since
  const canBrowse = ((editMode && editId) || testSuccessful) && !connectionDetailsModified;
  
  // Validation function to check if all required fields are filled
  const isFormValid = () => {
    // Base required fields
    if (!formData.connection_name?.trim()) return false;
    if (!formData.connection_type) return false;
    if (!formData.connection_direction) return false;
    if (!formData.connection_user) return false;
    if (!formData.authentication_method) return false;
    
    const providerType = formData._provider || formData.connection_type;
    
    // Provider-specific validation
    if (providerType === 'aws') {
      if (!formData.region?.trim()) return false;
      if (!formData.bucket_name?.trim()) return false;
      if (!editMode || !formData.has_access_key) {
        if (!formData.access_key?.trim()) return false;
      }
      if (!editMode || !formData.has_secret_key) {
        if (!formData.secret_key?.trim()) return false;
      }
    } else if (providerType === 'gcp') {
      if (!formData.project_id?.trim()) return false;
      if (!formData.bucket_name?.trim()) return false;
      if (!formData.client_email?.trim()) return false;
      if (!editMode || !formData.has_private_key) {
        if (!formData.private_key?.trim()) return false;
      }
    } else if (providerType === 'azure') {
      if (!formData.account_name?.trim()) return false;
      if (!formData.container_name?.trim()) return false;
      if (!editMode || !formData.has_account_key) {
        if (!formData.account_key?.trim()) return false;
      }
    } else if (providerType === 'snowflake') {
      if (!formData.snowflake_account?.trim()) return false;
      if (!formData.snowflake_username?.trim()) return false;
      if (!editMode || !formData.has_snowflake_password) {
        if (!formData.snowflake_password?.trim()) return false;
      }
    } else if (providerType === 'databricks') {
      if (!formData.databricks_host?.trim()) return false;
      if (!editMode || !formData.has_databricks_token) {
        if (!formData.databricks_token?.trim()) return false;
      }
    } else if (providerType === 'sharepoint') {
      if (!formData.sharepoint_tenant_id?.trim()) return false;
      if (!formData.sharepoint_client_id?.trim()) return false;
      if (!editMode || !formData.has_sharepoint_client_secret) {
        if (!formData.sharepoint_client_secret?.trim()) return false;
      }
      if (!formData.sharepoint_site_url?.trim()) return false;
    } else if (providerType === 'outlook') {
      if (!formData.outlook_tenant_id?.trim()) return false;
      if (!formData.outlook_client_id?.trim()) return false;
      if (!editMode || !formData.has_outlook_client_secret) {
        if (!formData.outlook_client_secret?.trim()) return false;
      }
      if (!formData.outlook_user_email?.trim()) return false;
    }
    
    return true;
  };
  
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
  
  // Connection form state
  const [formData, setFormData] = useState({
    connection_name: '',
    connection_type: 'aws',
    connection_direction: 'source',
    connection_user: 'Internal',
    authentication_method: 'key-based',
    description: '',
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
    outlook_folder_path: '',
    // Common path field for all cloud storage
    path: ''
  });
  
  // Fetch connections on component mount
  useEffect(() => {
    fetchConnections();
    if (isAdmin) {
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
  
  const handleAddNew = () => {
    setFormData({
      connection_name: '',
      connection_type: 'aws',
      connection_direction: activeTab,
      connection_user: 'Internal',
      authentication_method: 'key-based',
      description: '',
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
      path: ''
    });
    setEditMode(false);
    setEditId(null);
    setModalTestResult(null);
    setConnectionDetailsModified(false);
    setTestSuccessful(false);
    setTestCredentials(null);
    setShowForm(true);
  };
  
  const handleEdit = (connection) => {
    const { id, connection_name, connection_type, connection_direction, connection_user, authentication_method, description, config } = connection;
    
    // For vendor connections (type='vendor'), get the actual provider from config for rendering fields
    const providerType = connection_type === 'vendor' && config?.provider ? config.provider : connection_type;
    
    // Create a form data object with the correct fields based on connection type
    // IMPORTANT: Keep the original connection_type (don't change 'vendor' to provider)
    let newFormData = {
      connection_name,
      connection_type, // Keep original type (vendor stays vendor)
      _provider: providerType, // Store provider type separately for field rendering
      connection_direction: connection_direction || 'source',
      connection_user: connection_user || 'Internal',
      authentication_method: authentication_method || 'key-based',
      description: description || '',
    };
    
    // Add type-specific fields (use providerType to handle vendor connections correctly)
    if (providerType === 'aws') {
      newFormData = {
        ...newFormData,
        region: connection.region || config?.region || '',
        bucket_name: connection.bucket_name || config?.bucket || config?.bucket_name || '',
        access_key: '', // Don't prefill for security
        secret_key: '', // Don't prefill for security
        path: connection.path || config?.path_prefix || '',
        // Store flags to show credential status in UI
        has_access_key: connection.has_access_key || !!config?.access_key || !!config?.access_key_id,
        has_secret_key: connection.has_secret_key || !!config?.secret_key || !!config?.secret_access_key
      };
    } else if (providerType === 'gcp') {
      newFormData = {
        ...newFormData,
        project_id: connection.project_id || config?.project_id || '',
        bucket_name: connection.bucket_name || config?.gcp_bucket || config?.bucket || '',
        client_email: connection.client_email || config?.client_email || '',
        private_key: '', // Don't prefill for security
        path: connection.path || config?.path_prefix || '',
        has_private_key: connection.has_private_key || !!config?.private_key
      };
    } else if (providerType === 'azure') {
      newFormData = {
        ...newFormData,
        account_name: connection.account_name || config?.account_name || '',
        container_name: connection.container_name || config?.container_name || '',
        account_key: '', // Don't prefill for security
        path: connection.path || config?.path_prefix || '',
        has_account_key: connection.has_account_key || !!config?.account_key
      };
    } else if (providerType === 'snowflake') {
      newFormData = {
        ...newFormData,
        snowflake_account: connection.snowflake_account || config?.snowflake_account || '',
        snowflake_username: connection.snowflake_username || config?.snowflake_username || '',
        snowflake_password: '', // Don't prefill for security
        snowflake_warehouse: connection.snowflake_warehouse || config?.snowflake_warehouse || '',
        snowflake_database: connection.snowflake_database || config?.snowflake_database || '',
        snowflake_schema: connection.snowflake_schema || config?.snowflake_schema || '',
        snowflake_role: connection.snowflake_role || config?.snowflake_role || '',
        has_snowflake_password: connection.has_snowflake_password || !!config?.snowflake_password
      };
    } else if (providerType === 'databricks') {
      newFormData = {
        ...newFormData,
        databricks_host: connection.databricks_host || config?.databricks_host || '',
        databricks_token: '', // Don't prefill for security
        databricks_catalog: connection.databricks_catalog || config?.databricks_catalog || '',
        databricks_schema: connection.databricks_schema || config?.databricks_schema || '',
        has_databricks_token: connection.has_databricks_token || !!config?.databricks_token
      };
    } else if (providerType === 'sharepoint') {
      newFormData = {
        ...newFormData,
        sharepoint_tenant_id: connection.sharepoint_tenant_id || config?.sharepoint_tenant_id || '',
        sharepoint_client_id: connection.sharepoint_client_id || config?.sharepoint_client_id || '',
        sharepoint_client_secret: '', // Don't prefill for security
        sharepoint_site_url: connection.sharepoint_site_url || config?.sharepoint_site_url || '',
        sharepoint_document_library: connection.sharepoint_document_library || config?.sharepoint_document_library || ''
      };
    } else if (providerType === 'outlook') {
      newFormData = {
        ...newFormData,
        outlook_tenant_id: connection.outlook_tenant_id || config?.outlook_tenant_id || '',
        outlook_client_id: connection.outlook_client_id || config?.outlook_client_id || '',
        outlook_client_secret: '', // Don't prefill secret for security
        outlook_user_email: connection.outlook_user_email || config?.outlook_user_email || '',
        outlook_folder_path: connection.outlook_folder_path || config?.outlook_folder_path || ''
      };
    }
    
    setFormData(newFormData);
    setEditMode(true);
    setEditId(id);
    setModalTestResult(null);
    setConnectionDetailsModified(false);
    setTestSuccessful(false);
    setTestCredentials(null);
    setShowForm(true);
  };
  
  const handleDelete = async (id) => {
    const connection = connections.find(conn => conn.id === id);
    setConnectionToDelete(connection);
    setCheckingDependencies(true);
    setDeleteError(null);
    setShowDeleteConnectionModal(true);
    
    try {
      const deps = await checkConnectionDependencies(id);
      setConnectionDependencies(deps);
      
      // Update usage map for this connection
      const totalCount = deps.dependencies?.reduce((sum, dep) => sum + dep.count, 0) || 0;
      setConnectionUsageMap(prev => ({
        ...prev,
        [id]: {
          inUse: deps.inUse,
          count: totalCount,
          dependencies: deps.dependencies
        }
      }));
    } catch (err) {
      console.error('Error checking connection dependencies:', err);
      setDeleteError('Failed to check connection dependencies. Please try again.');
      setConnectionDependencies({ canDelete: false, inUse: false, dependencies: [] });
    } finally {
      setCheckingDependencies(false);
    }
  };
  
  const confirmDeleteConnection = async () => {
    if (!connectionToDelete) return;
    
    setIsDeletingConnection(true);
    setDeleteError(null);
    try {
      await deleteConnection(connectionToDelete.id);
      // Update local state without refetching
      setConnections(connections.filter(conn => conn.id !== connectionToDelete.id));
      setShowDeleteConnectionModal(false);
      setConnectionToDelete(null);
      setDeleteError(null);
    } catch (err) {
      console.error('Error deleting connection:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete connection. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeletingConnection(false);
    }
  };
  
  const closeDeleteConnectionModal = () => {
    setShowDeleteConnectionModal(false);
    setConnectionToDelete(null);
    setConnectionDependencies(null);
    setCheckingDependencies(false);
    setDeleteError(null);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Track if connection details (not path) are modified
    const connectionDetailFields = [
      'region', 'bucket_name', 'access_key', 'secret_key',
      'project_id', 'client_email', 'private_key',
      'account_name', 'account_key', 'container_name'
    ];
    
    if (connectionDetailFields.includes(name) && (editMode || testSuccessful)) {
      setConnectionDetailsModified(true);
      setTestSuccessful(false);
      setTestCredentials(null);
      // Clear path when connection details change
      setFormData({ ...formData, [name]: value, path: '' });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };
  
  const handleBrowseClick = () => {
    setShowBrowseModal(true);
  };
  
  const handlePathSelect = (path) => {
    setFormData({ ...formData, path });
    setShowBrowseModal(false);
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
      
      // Enable browsing if test successful
      if (result.success) {
        setTestSuccessful(true);
        setConnectionDetailsModified(false);
        setTestCredentials(cleanFormData);
      }
    } catch (err) {
      console.error('Error testing connection in modal:', err);
      setModalTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection test failed. Please check your credentials.'
      });
      setTestSuccessful(false);
      setTestCredentials(null);
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
  
  const renderFormFields = () => {
    const { connection_type, _provider } = formData;
    
    // For vendor connections, use the _provider field to determine which credential fields to show
    // Otherwise use connection_type
    const providerType = _provider || connection_type;
    
    // Common fields for all connection types
    const commonFields = (
      <div className="form-grid">
        <div className="form-group form-group-full" style={compactStyles.formGroup}>
          <label htmlFor="connection_name" style={compactStyles.label}>Connection Name <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            type="text"
            id="connection_name"
            name="connection_name"
            className="form-control"
            value={formData.connection_name}
            onChange={handleInputChange}
            required
            style={compactStyles.input}
          />
        </div>
        
        <div className="form-group" style={compactStyles.formGroup}>
          <label htmlFor="connection_type" style={compactStyles.label}>Connection Type <span style={{ color: '#dc2626' }}>*</span></label>
          <select
            id="connection_type"
            name="connection_type"
            className="form-control"
            value={formData.connection_type}
            onChange={handleConnectionTypeChange}
            required
            style={compactStyles.select}
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
        
        <div className="form-group" style={compactStyles.formGroup}>
          <label htmlFor="connection_direction" style={compactStyles.label}>Connection Direction <span style={{ color: '#dc2626' }}>*</span></label>
          <select
            id="connection_direction"
            name="connection_direction"
            className="form-control"
            value={formData.connection_direction}
            onChange={handleInputChange}
            required
            style={compactStyles.select}
          >
            <option value="source">Source (Read data from)</option>
            <option value="target">Target (Write data to)</option>
          </select>
        </div>
        
        <div className="form-group" style={compactStyles.formGroup}>
          <label htmlFor="connection_user" style={compactStyles.label}>Connection User <span style={{ color: '#dc2626' }}>*</span></label>
          <select
            id="connection_user"
            name="connection_user"
            className="form-control"
            value={formData.connection_user}
            onChange={handleInputChange}
            required
            style={compactStyles.select}
          >
            <option value="Internal">Internal</option>
            <option value="External">External</option>
          </select>
          <small className="form-text text-muted" style={compactStyles.helperText}>
            Internal: Company-managed | External: Third-party/vendor
          </small>
        </div>
        
        <div className="form-group" style={compactStyles.formGroup}>
          <label htmlFor="authentication_method" style={compactStyles.label}>Authentication Method <span style={{ color: '#dc2626' }}>*</span></label>
          <select
            id="authentication_method"
            name="authentication_method"
            className="form-control"
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
          <small className="form-text text-muted" style={compactStyles.helperText}>
            Choose the authentication method for this connection
          </small>
        </div>
        
        <div className="form-group form-group-full" style={compactStyles.formGroup}>
          <label htmlFor="description" style={compactStyles.label}>Description</label>
          <textarea
            id="description"
            name="description"
            className="form-control"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Brief description of this connection"
            rows="2"
            style={compactStyles.textarea}
          />
        </div>
      </div>
    );
    
    // Type-specific fields (use providerType to handle vendor connections)
    let specificFields;
    
    if (providerType === 'aws') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="region" style={compactStyles.label}>AWS Region <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="region"
              name="region"
              className="form-control"
              value={formData.region}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="bucket_name" style={compactStyles.label}>S3 Bucket Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="bucket_name"
              name="bucket_name"
              className="form-control"
              value={formData.bucket_name}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="path" style={compactStyles.label}>Path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                id="path"
                name="path"
                className="form-control"
                value={formData.path}
                onChange={handleInputChange}
                placeholder="e.g., vendor-uploads/"
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
                className="btn btn-secondary"
                style={{
                  padding: '0.5rem 1rem',
                  cursor: canBrowse ? 'pointer' : 'not-allowed',
                  opacity: canBrowse ? 1 : 0.6
                }}
                title={!canBrowse ? 'Test connection or save to enable browsing' : 'Browse folders'}
              >
                <FiFolder style={{ marginRight: '0.25rem' }} /> Browse
              </button>
            </div>
            <small className="form-text text-muted" style={compactStyles.helperText}>
              {!canBrowse 
                ? 'Test connection or save to enable folder browsing'
                : 'Folder path within the bucket where files will be uploaded. Click Browse to select from available folders.'
              }
            </small>
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="access_key" style={compactStyles.label}>Access Key ID <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="access_key"
              name="access_key"
              className="form-control"
              value={formData.access_key}
              onChange={handleInputChange}
              required={!editMode || !formData.has_access_key}
              placeholder={editMode && formData.has_access_key ? '(saved - leave blank to keep)' : ''}
              style={compactStyles.input}
            />
            {editMode && formData.has_access_key && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                ✓ Access key is saved. Leave blank to keep existing, or enter new value to update.
              </small>
            )}
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="secret_key" style={compactStyles.label}>Secret Access Key <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              id="secret_key"
              name="secret_key"
              className="form-control"
              value={formData.secret_key}
              onChange={handleInputChange}
              required={!editMode || !formData.has_secret_key}
              placeholder={editMode && formData.has_secret_key ? '(saved - leave blank to keep)' : ''}
              style={compactStyles.input}
            />
            {editMode && formData.has_secret_key && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                ✓ Secret key is saved. Leave blank to keep existing, or enter new value to update.
              </small>
            )}
          </div>
        </div>
      );
    } else if (providerType === 'gcp') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="project_id" style={compactStyles.label}>GCP Project ID <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="project_id"
              name="project_id"
              className="form-control"
              value={formData.project_id}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="bucket_name" style={compactStyles.label}>Storage Bucket Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="bucket_name"
              name="bucket_name"
              className="form-control"
              value={formData.bucket_name}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="path" style={compactStyles.label}>Path</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                id="path"
                name="path"
                className="form-control"
                value={formData.path}
                onChange={handleInputChange}
                placeholder="e.g., vendor-uploads/"
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
                className="btn btn-secondary"
                style={{
                  padding: '0.5rem 1rem',
                  cursor: canBrowse ? 'pointer' : 'not-allowed',
                  opacity: canBrowse ? 1 : 0.6
                }}
                title={!canBrowse ? 'Test connection or save to enable browsing' : 'Browse folders'}
              >
                <FiFolder style={{ marginRight: '0.25rem' }} /> Browse
              </button>
            </div>
            <small className="form-text text-muted" style={compactStyles.helperText}>
              {!canBrowse 
                ? 'Test connection or save to enable folder browsing'
                : 'Folder path within the bucket where files will be uploaded. Click Browse to select from available folders.'
              }
            </small>
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="client_email" style={compactStyles.label}>Service Account Email <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="client_email"
              name="client_email"
              className="form-control"
              value={formData.client_email}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="private_key" style={compactStyles.label}>Service Account Private Key <span style={{ color: '#dc2626' }}>*</span></label>
            <textarea
              id="private_key"
              name="private_key"
              className="form-control"
              value={formData.private_key}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              rows={3}
              style={compactStyles.textarea}
            />
            {editMode && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                Leave blank to keep the existing private key.
              </small>
            )}
          </div>
        </div>
      );
    } else if (providerType === 'azure') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="account_name" style={compactStyles.label}>Storage Account Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="account_name"
              name="account_name"
              className="form-control"
              value={formData.account_name}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="container_name" style={compactStyles.label}>Container Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="container_name"
              name="container_name"
              className="form-control"
              value={formData.container_name}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="path" style={compactStyles.label}>Base Path (Optional)</label>
            <input
              type="text"
              id="path"
              name="path"
              className="form-control"
              value={formData.path}
              onChange={handleInputChange}
              placeholder="e.g., vendor-uploads/"
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Optional folder path within the container where files will be uploaded
            </small>
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="account_key" style={compactStyles.label}>Storage Account Key <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              id="account_key"
              name="account_key"
              className="form-control"
              value={formData.account_key}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              style={compactStyles.input}
            />
            {editMode && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                Leave blank to keep the existing account key.
              </small>
            )}
          </div>
        </div>
      );
    } else if (providerType === 'snowflake') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_account" style={compactStyles.label}>Snowflake Account <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="snowflake_account"
              name="snowflake_account"
              className="form-control"
              value={formData.snowflake_account}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              The account identifier (e.g., xy12345.us-east-1)
            </small>
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_username" style={compactStyles.label}>Username <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="snowflake_username"
              name="snowflake_username"
              className="form-control"
              value={formData.snowflake_username}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_password" style={compactStyles.label}>Password <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              id="snowflake_password"
              name="snowflake_password"
              className="form-control"
              value={formData.snowflake_password}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              style={compactStyles.input}
            />
            {editMode && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                Leave blank to keep the existing password.
              </small>
            )}
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_warehouse" style={compactStyles.label}>Warehouse</label>
            <input
              type="text"
              id="snowflake_warehouse"
              name="snowflake_warehouse"
              className="form-control"
              value={formData.snowflake_warehouse}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_database" style={compactStyles.label}>Database</label>
            <input
              type="text"
              id="snowflake_database"
              name="snowflake_database"
              className="form-control"
              value={formData.snowflake_database}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_schema" style={compactStyles.label}>Schema</label>
            <input
              type="text"
              id="snowflake_schema"
              name="snowflake_schema"
              className="form-control"
              value={formData.snowflake_schema}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="snowflake_role" style={compactStyles.label}>Role</label>
            <input
              type="text"
              id="snowflake_role"
              name="snowflake_role"
              className="form-control"
              value={formData.snowflake_role}
              onChange={handleInputChange}
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Optional - leave blank to use the default role
            </small>
          </div>
        </div>
      );
    } else if (providerType === 'databricks') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="databricks_host" style={compactStyles.label}>Databricks Host <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="databricks_host"
              name="databricks_host"
              className="form-control"
              value={formData.databricks_host}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              The Databricks workspace URL (e.g., https://dbc-abc123.cloud.databricks.com)
            </small>
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="databricks_token" style={compactStyles.label}>Access Token <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              id="databricks_token"
              name="databricks_token"
              className="form-control"
              value={formData.databricks_token}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              style={compactStyles.input}
            />
            {editMode && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                Leave blank to keep the existing token.
              </small>
            )}
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="databricks_catalog" style={compactStyles.label}>Catalog</label>
            <input
              type="text"
              id="databricks_catalog"
              name="databricks_catalog"
              className="form-control"
              value={formData.databricks_catalog}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="databricks_schema" style={compactStyles.label}>Schema</label>
            <input
              type="text"
              id="databricks_schema"
              name="databricks_schema"
              className="form-control"
              value={formData.databricks_schema}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
          </div>
        </div>
      );
    } else if (providerType === 'sharepoint') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="sharepoint_tenant_id" style={compactStyles.label}>Microsoft Tenant ID <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="sharepoint_tenant_id"
              name="sharepoint_tenant_id"
              className="form-control"
              value={formData.sharepoint_tenant_id}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Your Microsoft 365 tenant ID
            </small>
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="sharepoint_client_id" style={compactStyles.label}>Application (Client) ID <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="sharepoint_client_id"
              name="sharepoint_client_id"
              className="form-control"
              value={formData.sharepoint_client_id}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Client ID from your Azure AD registered application
            </small>
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="sharepoint_client_secret" style={compactStyles.label}>Client Secret <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              id="sharepoint_client_secret"
              name="sharepoint_client_secret"
              className="form-control"
              value={formData.sharepoint_client_secret}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              style={compactStyles.input}
            />
            {editMode && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                Leave blank to keep the existing client secret.
              </small>
            )}
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="sharepoint_site_url" style={compactStyles.label}>SharePoint Site URL <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="sharepoint_site_url"
              name="sharepoint_site_url"
              className="form-control"
              value={formData.sharepoint_site_url}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              The URL of your SharePoint site (e.g., https://contoso.sharepoint.com/sites/mysite)
            </small>
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="sharepoint_document_library" style={compactStyles.label}>Document Library</label>
            <input
              type="text"
              id="sharepoint_document_library"
              name="sharepoint_document_library"
              className="form-control"
              value={formData.sharepoint_document_library}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Name of the document library where your files are stored (e.g., "Documents" or "Shared Documents")
            </small>
          </div>
        </div>
      );
    } else if (providerType === 'outlook') {
      specificFields = (
        <div className="form-grid">
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="outlook_tenant_id" style={compactStyles.label}>Microsoft Tenant ID <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="outlook_tenant_id"
              name="outlook_tenant_id"
              className="form-control"
              value={formData.outlook_tenant_id}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Your Microsoft 365 tenant ID
            </small>
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="outlook_client_id" style={compactStyles.label}>Application (Client) ID <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              id="outlook_client_id"
              name="outlook_client_id"
              className="form-control"
              value={formData.outlook_client_id}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              Client ID from your Azure AD registered application
            </small>
          </div>
          
          <div className="form-group form-group-full" style={compactStyles.formGroup}>
            <label htmlFor="outlook_client_secret" style={compactStyles.label}>Client Secret <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              id="outlook_client_secret"
              name="outlook_client_secret"
              className="form-control"
              value={formData.outlook_client_secret}
              onChange={handleInputChange}
              required={!editMode}
              placeholder={editMode ? '(unchanged)' : ''}
              style={compactStyles.input}
            />
            {editMode && (
              <small className="form-text text-muted" style={compactStyles.helperText}>
                Leave blank to keep the existing client secret.
              </small>
            )}
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="outlook_user_email" style={compactStyles.label}>User Email <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="email"
              id="outlook_user_email"
              name="outlook_user_email"
              className="form-control"
              value={formData.outlook_user_email}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
              The email address of the Outlook account to access
            </small>
          </div>
          
          <div className="form-group" style={compactStyles.formGroup}>
            <label htmlFor="outlook_folder_path" style={compactStyles.label}>Folder Path</label>
            <input
              type="text"
              id="outlook_folder_path"
              name="outlook_folder_path"
              className="form-control"
              value={formData.outlook_folder_path}
              onChange={handleInputChange}
              required
              style={compactStyles.input}
            />
            <small className="form-text text-muted" style={compactStyles.helperText}>
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
  
  
  // Get connection type label
  
  
  // Filter connections based on search term first
  const searchedConnections = connections.filter(conn => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      ((conn.connection_name || conn.name) || '').toLowerCase().includes(term) ||
      (conn.description || '').toLowerCase().includes(term) ||
      (conn.connection_type || conn.type || '').toLowerCase().includes(term) ||
      (conn.bucket_name || conn.config?.bucket || conn.config?.gcp_bucket || conn.config?.container_name || '').toLowerCase().includes(term) ||
      (conn.region || conn.config?.region || '').toLowerCase().includes(term)
    );
  });

  // Then filter by active tab
  const filteredConnections = searchedConnections.filter(conn => 
    conn.connection_direction === activeTab || (!conn.connection_direction && activeTab === 'source')
  );

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentConnections = filteredConnections.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredConnections.length / itemsPerPage);

  // Reset to page 1 when changing tabs or search term
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Cloud Storage Connections</h1>
          <p className="gps-page-subtitle">Manage source and target cloud storage connections</p>
        </div>
        {!showForm && hasWritePermission('connections') && (
          <button className="gps-btn gps-btn--primary" onClick={handleAddNew}>
            <FiPlus style={{ marginRight: '6px' }} /> Add Connection
          </button>
        )}
      </div>
      
      {!showForm && (
        <div className="gps-filters">
          <div className="gps-search-container">
            <FiSearch className="gps-search-icon" />
            <input
              type="text"
              className="gps-search-input"
              placeholder="Search connections..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}
      
      <div className="gps-tabs">
        <button 
          className={`gps-tab ${activeTab === 'source' ? 'gps-tab--active' : ''}`}
          onClick={() => setActiveTab('source')}
        >
          Source Connections
        </button>
        <button 
          className={`gps-tab ${activeTab === 'target' ? 'gps-tab--active' : ''}`}
          onClick={() => setActiveTab('target')}
        >
          Target Connections
        </button>
      </div>
      
      {error && <div className="gps-alert gps-alert--error">{error}</div>}
      
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
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={!isFormValid()}
                    style={{ 
                      opacity: !isFormValid() ? 0.5 : 1,
                      cursor: !isFormValid() ? 'not-allowed' : 'pointer'
                    }}
                    title={!isFormValid() ? 'Please fill in all required fields' : ''}
                  >
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
                  <div className="gps-table-container">
                    <table className="gps-table">
                    <thead>
                      <tr>
                        <th>Connection Id</th>
                        <th>Connection Name</th>
                        <th>User</th>
                        <th>Auth Method</th>
                        <th>Provider</th>
                        <th>Details</th>
                        <th>Last Used</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentConnections.map(connection => {
                        const config = connection.config || {};
                        const provider = config.provider || 'aws';
                        
                        return (
                        <tr key={connection.id} className={`connection-row ${connection.connection_type || connection.type}`}>
                          <td className="col-id">
                            {connection.id?.substring(0, 8) || '-'}
                          </td>
                          <td className="col-name">
                            <div className="connection-name-wrapper">
                              {connection.name || connection.connection_name}
                              {(connection.shared || (connection.source_application && connection.source_application !== 'data_observatory')) && (
                                <span className="shared-badge" title="Shared with Transform">
                                  <FiLink />
                                </span>
                              )}
                              {connectionUsageMap[connection.id]?.inUse && (
                                <span className="usage-badge" title={`Used in ${connectionUsageMap[connection.id]?.count || 0} places`}>
                                  <FiActivity /> In Use
                                </span>
                              )}
                            </div>
                            {connection.description && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                {connection.description}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`gps-badge ${connection.connection_user === 'External' ? 'gps-badge--warning' : 'gps-badge--info'}`}>
                              {connection.connection_user || 'Internal'}
                            </span>
                          </td>
                          <td className="col-auth">
                            <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                              {connection.authentication_method === 'key-based' ? 'Key-Based' :
                               connection.authentication_method === 'aws-iam-role' ? 'AWS IAM' :
                               connection.authentication_method === 'gcp-sa-oidc' ? 'GCP OIDC' :
                               connection.authentication_method === 'azure-managed-identity' ? 'Azure MI' :
                               connection.authentication_method === 'db-short-lived-token' ? 'DB Token' :
                               connection.authentication_method === 'oauth2' ? 'OAuth 2.0' :
                               connection.authentication_method === 'kerberos' ? 'Kerberos' :
                               'Key-Based'}
                            </span>
                          </td>
                          <td className="col-type">
                            <span style={{ textTransform: 'uppercase', fontSize: '0.875rem' }}>
                              {provider}
                            </span>
                          </td>
                          <td className="col-details">
                            <div className="connection-details-inline">
                              {config.bucket || config.gcp_bucket || config.container_name || '-'}
                              {config.path_prefix && ` / ${config.path_prefix}`}
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
                          <td>
                            <div className="gps-action-buttons">
                              {hasExecutePermission('connection') && (
                                <button 
                                  className="gps-icon-btn gps-icon-btn-success" 
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
                                    className="gps-icon-btn gps-icon-btn--edit" 
                                    onClick={() => handleEdit(connection)}
                                    title="Edit connection"
                                  >
                                    <FiEdit2 />
                                  </button>
                                  <button 
                                    className="gps-icon-btn gps-icon-btn--delete" 
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
                        );
                      })}
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
      
      {/* Browse Folder Modal */}
      {showBrowseModal && canBrowse && (
        <div className="modal-overlay" onClick={() => setShowBrowseModal(false)}>
          <div className="modal-content" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><FiFolder /> Browse Path</h2>
              <button className="btn-icon" onClick={() => setShowBrowseModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <S3FolderBrowser
                connectionId={editMode ? editId : null}
                rawCredentials={testSuccessful ? testCredentials : null}
                initialPath={formData.path || '/'}
                onSelectPath={handlePathSelect}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Connection Confirmation Modal */}
      <ConnectionDeleteModal
        isOpen={showDeleteConnectionModal}
        onClose={closeDeleteConnectionModal}
        connection={connectionToDelete}
        dependencies={connectionDependencies}
        onConfirmDelete={confirmDeleteConnection}
        isDeleting={isDeletingConnection}
        checkingDependencies={checkingDependencies}
        deleteError={deleteError}
      />
    </div>
  );
};

export default Connections;