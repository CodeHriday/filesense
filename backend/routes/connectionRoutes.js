const express = require('express');
const router = express.Router();
const connectionService = require('../services/ConnectionService');
const { encrypt, decrypt } = require('../utils/encryption');
const { pool } = require('../config/database');

/**
 * @route   GET /api/connections
 * @desc    Get all connections
 * @access  Public (authentication would be added in a real implementation)
 */
router.get('/', async (req, res) => {
  try {
    // Extract query parameters
    const { limit, source } = req.query;
    
    // Get user info for project filtering
    const isAdmin = req.user?.roles?.includes('Admin');
    const userId = req.user?.id;
    
    const connections = await connectionService.getAllConnections({ 
      limit: limit ? parseInt(limit) : undefined,
      source,
      userId,
      isAdmin
    });
    
    // Filter out sensitive information
    const sanitizedConnections = connections.map(conn => {
      const { config, name: dbName, type: dbType, project_name, ...rest } = conn;
      return {
        ...rest,
        // Use database fields for name and type (not from config, not from project join)
        connection_name: dbName,
        name: dbName,
        connection_type: dbType,
        type: dbType,
        config: config,
        // Use database columns for unified fields (not config)
        connection_user: conn.connection_user,
        connection_direction: conn.connection_direction,
        description: conn.description,
        authentication_method: conn.authentication_method,
        // Connection type specific fields (based on connection types)
        region: config.region,
        bucket_name: config.bucket_name,
        account_name: config.account_name,
        container_name: config.container_name,
        client_email: config.client_email,
        snowflake_account: config.snowflake_account,
        snowflake_username: config.snowflake_username,
        snowflake_warehouse: config.snowflake_warehouse,
        snowflake_database: config.snowflake_database,
        snowflake_schema: config.snowflake_schema,
        snowflake_role: config.snowflake_role,
        databricks_host: config.databricks_host,
        databricks_catalog: config.databricks_catalog,
        databricks_schema: config.databricks_schema,
        sharepoint_tenant_id: config.sharepoint_tenant_id,
        sharepoint_client_id: config.sharepoint_client_id,
        sharepoint_site_url: config.sharepoint_site_url,
        sharepoint_document_library: config.sharepoint_document_library,
        outlook_tenant_id: config.outlook_tenant_id,
        outlook_client_id: config.outlook_client_id,
        outlook_user_email: config.outlook_user_email,
        outlook_folder_path: config.outlook_folder_path,
        // Credential existence flags (for security, don't send actual credentials)
        has_access_key: !!config.access_key,
        has_secret_key: !!config.secret_key,
        has_private_key: !!config.private_key,
        has_account_key: !!config.account_key,
        has_snowflake_password: !!config.snowflake_password,
        has_databricks_token: !!config.databricks_token,
        has_sharepoint_client_secret: !!config.sharepoint_client_secret,
        has_outlook_client_secret: !!config.outlook_client_secret
      };
    });
    
    res.json(sanitizedConnections);
  } catch (error) {
    console.error('Error in GET /connections', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/connections/:id
 * @desc    Get connection by ID
 * @access  Protected (requires authentication and project membership)
 */
router.get('/:id', async (req, res) => {
  try {
    const connection = await connectionService.getConnectionById(req.params.id);
    
    // Check project access (admins and global connections bypass)
    const isAdmin = req.user?.roles?.includes('Admin');
    const isGlobalConnection = connection.project_id === null;
    
    if (!isAdmin && !isGlobalConnection) {
      const userId = req.user?.id;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      const userProjectIds = userProjects.map(p => p.id);
      
      // Check if user has access to this connection's project
      if (!userProjectIds.includes(connection.project_id)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to this connection' 
        });
      }
    }
    
    // Filter sensitive information
    const { config, name: dbName, type: dbType, project_name, ...rest } = connection;
    const sanitizedConnection = {
      ...rest,
      // Use database fields for name and type (not from config, not from project join)
      connection_name: dbName,
      name: dbName,
      connection_type: dbType,
      type: dbType,
      config: config,
      // Use database columns for unified fields (not config)
      connection_user: connection.connection_user,
      connection_direction: connection.connection_direction,
      description: connection.description,
      authentication_method: connection.authentication_method,
      // Connection type specific fields (similar to above)
      region: config.region,
      bucket_name: config.bucket_name,
      account_name: config.account_name,
      container_name: config.container_name,
      client_email: config.client_email,
      snowflake_account: config.snowflake_account,
      snowflake_username: config.snowflake_username,
      snowflake_warehouse: config.snowflake_warehouse,
      snowflake_database: config.snowflake_database,
      snowflake_schema: config.snowflake_schema,
      snowflake_role: config.snowflake_role,
      databricks_host: config.databricks_host,
      databricks_catalog: config.databricks_catalog,
      databricks_schema: config.databricks_schema,
      sharepoint_tenant_id: config.sharepoint_tenant_id,
      sharepoint_client_id: config.sharepoint_client_id,
      sharepoint_site_url: config.sharepoint_site_url,
      sharepoint_document_library: config.sharepoint_document_library,
      outlook_tenant_id: config.outlook_tenant_id,
      outlook_client_id: config.outlook_client_id,
      outlook_user_email: config.outlook_user_email,
      outlook_folder_path: config.outlook_folder_path,
      // Credential existence flags (for security, don't send actual credentials)
      has_access_key: !!config.access_key,
      has_secret_key: !!config.secret_key,
      has_private_key: !!config.private_key,
      has_account_key: !!config.account_key,
      has_snowflake_password: !!config.snowflake_password,
      has_databricks_token: !!config.databricks_token,
      has_sharepoint_client_secret: !!config.sharepoint_client_secret,
      has_outlook_client_secret: !!config.outlook_client_secret
    };
    
    res.json(sanitizedConnection);
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      console.error('Error in GET /connections/:id', error);
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * @route   POST /api/connections
 * @desc    Create a new connection with unified connection management
 * @access  Protected (requires authentication and project membership)
 */
router.post('/', async (req, res) => {
  try {
    const {
      connection_name,
      connection_type,
      project_id,
      connection_user = 'Internal', // Internal or External
      description, // Connection description
      authentication_method = 'key-based', // Auth method
      connection_direction = 'source', // source or target
      // AWS fields (support both naming conventions)
      region,
      bucket,
      access_key_id,
      secret_access_key,
      access_key,     // Alternative field name
      secret_key,     // Alternative field name
      endpoint,
      use_ssl = true,
      // AWS IAM Role fields
      iam_role_arn,
      external_id,
      // GCP fields
      gcp_project_id,
      service_account_json,
      gcp_bucket,
      // GCP OIDC fields
      workload_identity_provider,
      service_account_email,
      // Azure fields
      account_name,
      account_key,
      container_name,
      azure_endpoint,
      // Azure Managed Identity fields
      azure_resource_id,
      managed_identity_client_id,
      // OAuth fields
      oauth_client_id,
      oauth_client_secret,
      oauth_token_url,
      oauth_scope,
      // Kerberos fields
      kerberos_principal,
      kerberos_keytab_path,
      kerberos_realm,
      // Common
      path_prefix = '',
      ...otherConfigDetails
    } = req.body;
    
    // Validate project access
    const isAdmin = req.user?.roles?.includes('Admin');
    let assignedProjectId = project_id || null; // Allow null for global connections
    
    if (!isAdmin) {
      const userId = req.user?.id;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      const userProjectIds = userProjects.map(p => p.id);
      
      // If user has no project access, deny creation
      if (userProjectIds.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You must be a member of at least one project to create connections' 
        });
      }
      
      // If project_id specified, validate access
      if (assignedProjectId) {
        if (!userProjectIds.includes(assignedProjectId)) {
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'You do not have access to the specified project' 
          });
        }
      }
      // Note: Non-admin users can create global connections (project_id = null) if desired
    }
    // Note: Admins can create global connections (project_id = null) without restrictions
    
    // Build config object with provider-specific fields
    const provider = connection_type; // aws, gcp, azure, etc.
    const config = {
      provider,
      connection_name,
      connection_type,
      ...otherConfigDetails
    };
    
    // Set storage_type for cloud storage providers
    if (provider === 'aws') {
      config.storage_type = 's3';
    } else if (provider === 'gcp') {
      config.storage_type = 'gcs';
    } else if (provider === 'azure') {
      config.storage_type = 'azure-blob';
    }
    
    // Build auth_config based on authentication method
    const auth_config = {};
    
    switch (authentication_method) {
      case 'key-based':
        // Encrypt and add provider-specific fields (legacy key-based auth)
        if (provider === 'aws') {
          config.region = region;
          config.bucket = bucket;
          config.endpoint = endpoint;
          config.use_ssl = use_ssl;
          config.path_prefix = path_prefix;
          // Support both field name formats: access_key_id/secret_access_key AND access_key/secret_key
          const awsAccessKey = access_key_id || access_key;
          const awsSecretKey = secret_access_key || secret_key;
          if (awsAccessKey) config.access_key = encrypt(awsAccessKey);
          if (awsSecretKey) config.secret_key = encrypt(awsSecretKey);
        } else if (provider === 'gcp') {
          config.project_id = gcp_project_id;
          config.gcp_bucket = gcp_bucket;
          config.path_prefix = path_prefix;
          if (service_account_json) config.service_account_json = encrypt(service_account_json);
        } else if (provider === 'azure') {
          config.account_name = account_name;
          config.container_name = container_name;
          config.azure_endpoint = azure_endpoint;
          config.path_prefix = path_prefix;
          if (account_key) config.account_key = encrypt(account_key);
        }
        break;
      
      case 'aws-iam-role':
        config.region = region;
        config.bucket = bucket;
        config.path_prefix = path_prefix;
        auth_config.iam_role_arn = iam_role_arn;
        if (external_id) auth_config.external_id = external_id;
        break;
      
      case 'gcp-sa-oidc':
        config.project_id = gcp_project_id;
        config.gcp_bucket = gcp_bucket;
        config.path_prefix = path_prefix;
        auth_config.workload_identity_provider = workload_identity_provider;
        auth_config.service_account_email = service_account_email;
        break;
      
      case 'azure-managed-identity':
        config.account_name = account_name;
        config.container_name = container_name;
        config.path_prefix = path_prefix;
        auth_config.azure_resource_id = azure_resource_id;
        if (managed_identity_client_id) auth_config.managed_identity_client_id = managed_identity_client_id;
        break;
      
      case 'oauth2':
        auth_config.oauth_client_id = oauth_client_id;
        if (oauth_client_secret) auth_config.oauth_client_secret = encrypt(oauth_client_secret);
        auth_config.oauth_token_url = oauth_token_url;
        if (oauth_scope) auth_config.oauth_scope = oauth_scope;
        break;
      
      case 'kerberos':
        auth_config.kerberos_principal = kerberos_principal;
        auth_config.kerberos_keytab_path = kerberos_keytab_path;
        auth_config.kerberos_realm = kerberos_realm;
        break;
      
      case 'db-short-lived-token':
        // Config will be populated when token is requested
        auth_config.token_ttl = 3600; // Default 1 hour
        break;
    }
    
    // Format data for the connection service
    const connectionData = {
      name: connection_name,
      type: connection_type,
      project_id: assignedProjectId,
      config,
      description: description || null,
      connection_user,
      connection_direction,
      authentication_method,
      auth_config
    };
    
    const newConnection = await connectionService.createConnection(connectionData);
    
    // Return sanitized response
    res.status(201).json({
      success: true,
      message: 'Connection created successfully',
      connection: {
        connection_id: newConnection.connection_id,
        name: newConnection.name,
        type: newConnection.type,
        connection_user: newConnection.connection_user,
        connection_direction: newConnection.connection_direction,
        description: newConnection.description,
        authentication_method: newConnection.authentication_method,
        status: newConnection.status,
        created_at: newConnection.created_at
      }
    });
  } catch (error) {
    console.error('[CREATE CONNECTION] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/connections/:id
 * @desc    Update a connection with unified connection management
 * @access  Protected (requires authentication and project membership)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      connection_name,
      connection_type,
      connection_user,
      description,
      authentication_method,
      connection_direction,
      // AWS fields (support both naming conventions)
      region,
      bucket,
      access_key_id,
      secret_access_key,
      access_key,     // Alternative field name
      secret_key,     // Alternative field name
      endpoint,
      use_ssl,
      // AWS IAM Role fields
      iam_role_arn,
      external_id,
      // GCP fields
      gcp_project_id,
      service_account_json,
      gcp_bucket,
      // GCP OIDC fields
      workload_identity_provider,
      service_account_email,
      // Azure fields
      account_name,
      account_key,
      container_name,
      azure_endpoint,
      // Azure Managed Identity fields
      azure_resource_id,
      managed_identity_client_id,
      // OAuth fields
      oauth_client_id,
      oauth_client_secret,
      oauth_token_url,
      oauth_scope,
      // Kerberos fields
      kerberos_principal,
      kerberos_keytab_path,
      kerberos_realm,
      // Common
      path_prefix,
      status
    } = req.body;
    
    // Check project access before allowing update
    const isAdmin = req.user?.roles?.includes('Admin');
    if (!isAdmin) {
      const checkResult = await pool.query(
        'SELECT project_id FROM storage_connections WHERE connection_id = $1',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Connection not found' });
      }
      
      const userId = req.user?.id;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      const userProjectIds = userProjects.map(p => p.id);
      
      if (!userProjectIds.includes(checkResult.rows[0].project_id)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to modify this connection' 
        });
      }
    }
    
    // Get existing connection
    const existing = await pool.query(
      'SELECT config, authentication_method FROM storage_connections WHERE connection_id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    const existingConfig = typeof existing.rows[0].config === 'string' 
      ? JSON.parse(existing.rows[0].config) 
      : existing.rows[0].config;
    
    // Update config
    const config = { ...existingConfig };
    const provider = connection_type || existingConfig.provider || existingConfig.connection_type;
    
    if (provider) config.provider = provider;
    if (connection_name) config.connection_name = connection_name;
    if (connection_type) config.connection_type = connection_type;
    
    // Build auth_config if authentication method is provided
    const auth_config = {};
    const effectiveAuthMethod = authentication_method || existing.rows[0].authentication_method || 'key-based';
    
    switch (effectiveAuthMethod) {
      case 'key-based':
        // Handle key-based authentication
        if (provider === 'aws' || existingConfig.provider === 'aws') {
          if (region !== undefined) config.region = region;
          if (bucket !== undefined) config.bucket = bucket;
          if (endpoint !== undefined) config.endpoint = endpoint;
          if (use_ssl !== undefined) config.use_ssl = use_ssl;
          if (path_prefix !== undefined) config.path_prefix = path_prefix;
          // Support both field name formats: access_key_id/secret_access_key AND access_key/secret_key
          const awsAccessKey = access_key_id || access_key;
          const awsSecretKey = secret_access_key || secret_key;
          if (awsAccessKey) config.access_key = encrypt(awsAccessKey);
          if (awsSecretKey) config.secret_key = encrypt(awsSecretKey);
        } else if (provider === 'gcp' || existingConfig.provider === 'gcp') {
          if (gcp_project_id !== undefined) config.project_id = gcp_project_id;
          if (gcp_bucket !== undefined) config.gcp_bucket = gcp_bucket;
          if (path_prefix !== undefined) config.path_prefix = path_prefix;
          if (service_account_json) config.service_account_json = encrypt(service_account_json);
        } else if (provider === 'azure' || existingConfig.provider === 'azure') {
          if (account_name !== undefined) config.account_name = account_name;
          if (container_name !== undefined) config.container_name = container_name;
          if (azure_endpoint !== undefined) config.azure_endpoint = azure_endpoint;
          if (path_prefix !== undefined) config.path_prefix = path_prefix;
          if (account_key) config.account_key = encrypt(account_key);
        }
        break;
      
      case 'aws-iam-role':
        if (region !== undefined) config.region = region;
        if (bucket !== undefined) config.bucket = bucket;
        if (path_prefix !== undefined) config.path_prefix = path_prefix;
        if (iam_role_arn) auth_config.iam_role_arn = iam_role_arn;
        if (external_id) auth_config.external_id = external_id;
        break;
      
      case 'gcp-sa-oidc':
        if (gcp_project_id !== undefined) config.project_id = gcp_project_id;
        if (gcp_bucket !== undefined) config.gcp_bucket = gcp_bucket;
        if (path_prefix !== undefined) config.path_prefix = path_prefix;
        if (workload_identity_provider) auth_config.workload_identity_provider = workload_identity_provider;
        if (service_account_email) auth_config.service_account_email = service_account_email;
        break;
      
      case 'azure-managed-identity':
        if (account_name !== undefined) config.account_name = account_name;
        if (container_name !== undefined) config.container_name = container_name;
        if (path_prefix !== undefined) config.path_prefix = path_prefix;
        if (azure_resource_id) auth_config.azure_resource_id = azure_resource_id;
        if (managed_identity_client_id) auth_config.managed_identity_client_id = managed_identity_client_id;
        break;
      
      case 'oauth2':
        if (oauth_client_id) auth_config.oauth_client_id = oauth_client_id;
        if (oauth_client_secret) auth_config.oauth_client_secret = encrypt(oauth_client_secret);
        if (oauth_token_url) auth_config.oauth_token_url = oauth_token_url;
        if (oauth_scope) auth_config.oauth_scope = oauth_scope;
        break;
      
      case 'kerberos':
        if (kerberos_principal) auth_config.kerberos_principal = kerberos_principal;
        if (kerberos_keytab_path) auth_config.kerberos_keytab_path = kerberos_keytab_path;
        if (kerberos_realm) auth_config.kerberos_realm = kerberos_realm;
        break;
    }
    
    // Build dynamic UPDATE query
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (connection_name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(connection_name);
    }
    if (connection_type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(connection_type);
    }
    updates.push(`config = $${paramIndex++}`);
    values.push(JSON.stringify(config));
    
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (connection_user !== undefined) {
      updates.push(`connection_user = $${paramIndex++}`);
      values.push(connection_user);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (authentication_method !== undefined) {
      updates.push(`authentication_method = $${paramIndex++}`);
      values.push(authentication_method);
    }
    if (Object.keys(auth_config).length > 0) {
      updates.push(`auth_config = $${paramIndex++}`);
      values.push(JSON.stringify(auth_config));
    }
    if (connection_direction !== undefined) {
      updates.push(`connection_direction = $${paramIndex++}`);
      values.push(connection_direction);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    values.push(id);
    
    // Update connection
    const result = await pool.query(
      `UPDATE storage_connections 
       SET ${updates.join(', ')}
       WHERE connection_id = $${paramIndex}
       RETURNING connection_id, name, type, status, connection_direction, project_id, 
                 connection_user, description, authentication_method, created_at, updated_at`,
      values
    );
    
    console.log('[UPDATE CONNECTION] Connection updated successfully');
    
    res.json({
      success: true,
      message: 'Connection updated successfully',
      connection: result.rows[0]
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      console.error('[UPDATE CONNECTION] Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * @route   DELETE /api/connections/:id
 * @desc    Delete a connection
 * @access  Protected (requires authentication and project membership)
 */
router.delete('/:id', async (req, res) => {
  try {
    // Check project access before allowing delete
    const isAdmin = req.user?.roles?.includes('Admin');
    if (!isAdmin) {
      const existingConnection = await connectionService.getConnectionById(req.params.id);
      const userId = req.user?.id;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      const userProjectIds = userProjects.map(p => p.id);
      
      if (!userProjectIds.includes(existingConnection.project_id)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to delete this connection' 
        });
      }
    }
    
    await connectionService.deleteConnection(req.params.id);
    res.json({ success: true, message: 'Connection deleted successfully' });
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      console.error('Error in DELETE /connections/:id', error);
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * @route   GET /api/connections/:id/test
 * @desc    Test a saved connection by ID (fetches and decrypts credentials)
 * @access  Protected (requires authentication, project membership, and connection:execute permission)
 */
router.get('/:id/test', async (req, res) => {
  try {
    // Check if user has connection:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('connection:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to test connections. Contact your administrator.'
      });
    }
    
    console.log('[TEST SAVED CONNECTION] Testing connection ID:', req.params.id);
    
    // Fetch the connection from database
    const connection = await connectionService.getConnectionById(req.params.id);
    
    // Check project access (admins bypass)
    const isAdmin = req.user?.roles?.includes('Admin');
    if (!isAdmin) {
      const userId = req.user?.id;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      const userProjectIds = userProjects.map(p => p.id);
      
      if (!userProjectIds.includes(connection.project_id)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to test this connection' 
        });
      }
    }
    
    console.log('[TEST SAVED CONNECTION] Connection type:', connection.type);
    console.log('[TEST SAVED CONNECTION] Has encrypted credentials:', !!connection.config.access_key);
    
    // Test the connection (service will decrypt credentials automatically)
    const testResult = await connectionService.testConnection({
      type: connection.type,
      config: connection.config
    });
    
    console.log('[TEST SAVED CONNECTION] Test result:', testResult.success ? 'SUCCESS' : 'FAILED');
    
    res.json(testResult);
  } catch (error) {
    console.error('[TEST SAVED CONNECTION] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

/**
 * @route   POST /api/connections/:id/test
 * @desc    Test a saved connection from storage_connections (unified connection management)
 * @access  Protected (requires connection:execute permission)
 */
router.post('/:id/test', async (req, res) => {
  try {
    // Check if user has connection:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('connection:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to test connections. Contact your administrator.'
      });
    }
    
    const { id } = req.params;
    
    // Fetch connection from storage_connections
    const result = await pool.query(
      'SELECT config, type, authentication_method, auth_config FROM storage_connections WHERE connection_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    const connection = result.rows[0];
    const config = typeof connection.config === 'string' 
      ? JSON.parse(connection.config) 
      : connection.config;
    
    const auth_config = connection.auth_config 
      ? (typeof connection.auth_config === 'string' ? JSON.parse(connection.auth_config) : connection.auth_config)
      : {};
    
    // Merge auth_config into config for testing
    const testConfig = { ...config, auth_config };
    
    // Test the connection using connectionService
    const testResult = await connectionService.testConnection({
      type: connection.type,
      config: testConfig
    });
    
    res.json(testResult);
  } catch (error) {
    console.error('[TEST SAVED CONNECTION] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

/**
 * @route   POST /api/connections/test
 * @desc    Test a connection without saving it (for new connections with unified management)
 * @access  Protected (requires connection:execute permission)
 */
router.post('/test', async (req, res) => {
  try {
    // Check if user has connection:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('connection:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to test connections. Contact your administrator.'
      });
    }
    
    const {
      connection_type,
      authentication_method = 'key-based',
      // AWS fields
      region,
      bucket,
      access_key_id,
      secret_access_key,
      endpoint,
      use_ssl = true,
      // AWS IAM Role fields (ephemeral auth)
      iam_role_arn,
      external_id,
      // GCP fields
      gcp_project_id,
      service_account_json,
      gcp_bucket,
      // GCP OIDC fields (ephemeral auth)
      workload_identity_provider,
      service_account_email,
      // Azure fields
      account_name,
      account_key,
      container_name,
      azure_endpoint,
      // Azure Managed Identity fields (ephemeral auth)
      azure_resource_id,
      managed_identity_client_id,
      // OAuth fields
      oauth_client_id,
      oauth_client_secret,
      oauth_token_url,
      oauth_scope,
      // Kerberos fields
      kerberos_principal,
      kerberos_keytab_path,
      kerberos_realm,
      // Common
      path_prefix = '',
      ...otherConfigDetails
    } = req.body;
    
    // Build config based on provider and authentication method (no encryption for testing)
    const provider = connection_type;
    const config = {
      provider,
      connection_type,
      ...otherConfigDetails
    };
    
    // Set storage_type for cloud storage providers
    if (provider === 'aws') {
      config.storage_type = 's3';
    } else if (provider === 'gcp') {
      config.storage_type = 'gcs';
    } else if (provider === 'azure') {
      config.storage_type = 'azure-blob';
    }
    
    // Build config based on authentication method (no encryption needed for testing)
    const auth_config = {};
    
    switch (authentication_method) {
      case 'key-based':
        if (provider === 'aws') {
          config.region = region;
          config.bucket = bucket;
          config.endpoint = endpoint;
          config.use_ssl = use_ssl;
          config.path_prefix = path_prefix;
          config.access_key_id = access_key_id; // No encryption for test
          config.secret_access_key = secret_access_key;
        } else if (provider === 'gcp') {
          config.project_id = gcp_project_id;
          config.gcp_bucket = gcp_bucket;
          config.path_prefix = path_prefix;
          config.service_account_json = service_account_json; // No encryption for test
        } else if (provider === 'azure') {
          config.account_name = account_name;
          config.container_name = container_name;
          config.azure_endpoint = azure_endpoint;
          config.path_prefix = path_prefix;
          config.account_key = account_key; // No encryption for test
        }
        break;
      
      case 'aws-iam-role':
        config.region = region;
        config.bucket = bucket;
        config.path_prefix = path_prefix;
        auth_config.iam_role_arn = iam_role_arn;
        if (external_id) auth_config.external_id = external_id;
        break;
      
      case 'gcp-sa-oidc':
        config.project_id = gcp_project_id;
        config.gcp_bucket = gcp_bucket;
        config.path_prefix = path_prefix;
        auth_config.workload_identity_provider = workload_identity_provider;
        auth_config.service_account_email = service_account_email;
        break;
      
      case 'azure-managed-identity':
        config.account_name = account_name;
        config.container_name = container_name;
        config.path_prefix = path_prefix;
        auth_config.azure_resource_id = azure_resource_id;
        if (managed_identity_client_id) auth_config.managed_identity_client_id = managed_identity_client_id;
        break;
      
      case 'oauth2':
        auth_config.oauth_client_id = oauth_client_id;
        auth_config.oauth_client_secret = oauth_client_secret; // No encryption for test
        auth_config.oauth_token_url = oauth_token_url;
        if (oauth_scope) auth_config.oauth_scope = oauth_scope;
        break;
      
      case 'kerberos':
        auth_config.kerberos_principal = kerberos_principal;
        auth_config.kerberos_keytab_path = kerberos_keytab_path;
        auth_config.kerberos_realm = kerberos_realm;
        break;
      
      case 'db-short-lived-token':
        auth_config.token_ttl = 3600; // Default 1 hour
        break;
    }
    
    // Merge auth_config into config for testing
    config.auth_config = auth_config;
    
    const testResult = await connectionService.testConnection({
      type: connection_type,
      config
    });
    
    console.log('[TEST CONNECTION] Test result:', testResult.success ? 'SUCCESS' : 'FAILED');
    
    res.json(testResult);
  } catch (error) {
    console.error('[TEST CONNECTION] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

module.exports = router;
