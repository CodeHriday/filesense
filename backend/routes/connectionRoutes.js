const express = require('express');
const router = express.Router();
const connectionService = require('../services/ConnectionService');
const { encrypt, decrypt } = require('../utils/encryption');
const db = require('../config/database');
const PasswordVaultService = require('../services/passwordVaultService');
const AuditService = require('../services/AuditService');
const { systemLogger } = require('../utils/logger');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

const passwordVault = new PasswordVaultService(db, new AuditService(db), systemLogger);

/**
 * @route   GET /api/connections
 * @desc    Get all connections
 * @access  Public (authentication would be added in a real implementation)
 */
router.get('/', async (req, res) => {
  try {
    // Extract query parameters
    const { limit, source, include_deleted } = req.query;
    
    // Get user info for project filtering
    const isAdmin = userHasAdminAccess(req.user);
    const userId = req.user?.id;
    
    const connections = await connectionService.getAllConnections({ 
      limit: limit ? parseInt(limit) : undefined,
      source,
      userId,
      isAdmin,
      includeDeleted: include_deleted === 'true'
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
        has_outlook_client_secret: !!config.outlook_client_secret,
        // Archive password flag (never send the actual password)
        has_archive_password: conn.has_archive_password || false
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
    const isAdmin = userHasAdminAccess(req.user);
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
      has_outlook_client_secret: !!config.outlook_client_secret,
      // Archive password flag (never send the actual password)
      has_archive_password: connection.has_archive_password || false
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
      source_access_key,
      source_secret_key,
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
      path, // Optional folder path within the bucket
      // Archive password (for password-protected files in cloud storage)
      archive_password,
      ...otherConfigDetails
    } = req.body;
    
    // Validate project access
    const isAdmin = userHasAdminAccess(req.user);
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
        // Encrypt and store source credentials for cross-account AssumeRole
        if (source_access_key) auth_config.source_access_key = encrypt(source_access_key);
        if (source_secret_key) auth_config.source_secret_key = encrypt(source_secret_key);
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
      auth_config,
      path: path || null // Optional folder path within the bucket
    };
    
    // Create connection first
    const newConnection = await connectionService.createConnection(connectionData);
    
    // Store archive password if provided (compensating delete on failure)
    let passwordStored = false;
    if (archive_password) {
      try {
        // Store password in encrypted vault
        await passwordVault.storePassword(
          'connection',
          newConnection.connection_id.toString(),
          archive_password,
          req.user?.id || 1
        );
        
        // Update has_archive_password flag
        await db.query(
          'UPDATE storage_connections SET has_archive_password = true WHERE connection_id = $1',
          [newConnection.connection_id]
        );
        
        passwordStored = true;
        systemLogger.info('Archive password stored for connection', {
          connectionId: newConnection.connection_id,
          userId: req.user?.id
        });
      } catch (pwdError) {
        // CRITICAL: Password storage failed - rollback connection creation
        systemLogger.error('Archive password storage failed, deleting connection', {
          connectionId: newConnection.connection_id,
          error: pwdError.message
        });
        
        // Attempt compensating delete
        await db.query(
          'DELETE FROM storage_connections WHERE connection_id = $1',
          [newConnection.connection_id]
        ).catch(deleteError => {
          // Log but don't throw - original password error is more important
          systemLogger.error('Compensating delete failed - orphaned connection may exist', {
            connectionId: newConnection.connection_id,
            originalError: pwdError.message,
            deleteError: deleteError.message
          });
        });
        
        // Throw original password error to fail the request
        throw new Error(`Failed to store archive password: ${pwdError.message}`);
      }
    }
    
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
        created_at: newConnection.created_at,
        has_archive_password: passwordStored
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
      source_access_key,
      source_secret_key,
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
      path, // Optional folder path within the bucket
      status,
      // Archive password (for password-protected files in cloud storage)
      archive_password
    } = req.body;
    
    // Check project access before allowing update
    const isAdmin = userHasAdminAccess(req.user);
    if (!isAdmin) {
      const checkResult = await db.query(
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
    const existing = await db.query(
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
        // Encrypt and store source credentials for cross-account AssumeRole
        if (source_access_key) auth_config.source_access_key = encrypt(source_access_key);
        if (source_secret_key) auth_config.source_secret_key = encrypt(source_secret_key);
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
    if (path !== undefined) {
      updates.push(`path = $${paramIndex++}`);
      values.push(path);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    values.push(id);
    
    // Update connection
    const result = await db.query(
      `UPDATE storage_connections 
       SET ${updates.join(', ')}
       WHERE connection_id = $${paramIndex}
       RETURNING connection_id, name, type, status, connection_direction, project_id, 
                 connection_user, description, authentication_method, created_at, updated_at`,
      values
    );
    
    console.log('[UPDATE CONNECTION] Connection updated successfully');
    
    // Update archive password if provided
    if (archive_password !== undefined) {
      if (archive_password) {
        // Store or update the password
        await passwordVault.storePassword(
          'connection',
          id.toString(),
          archive_password,
          req.user?.id || 1
        );
        
        // Update has_archive_password flag
        await db.query(
          'UPDATE storage_connections SET has_archive_password = true WHERE connection_id = $1',
          [id]
        );
        
        systemLogger.info('Archive password updated for connection', {
          connectionId: id,
          userId: req.user?.id
        });
      } else {
        // If empty string/null, remove the password
        await db.query(
          'DELETE FROM encrypted_passwords WHERE entity_type = $1 AND entity_id = $2',
          ['connection', id.toString()]
        );
        
        // Update has_archive_password flag
        await db.query(
          'UPDATE storage_connections SET has_archive_password = false WHERE connection_id = $1',
          [id]
        );
        
        systemLogger.info('Archive password removed for connection', {
          connectionId: id,
          userId: req.user?.id
        });
      }
    }
    
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
 * @route   GET /api/connections/:id/dependencies
 * @desc    Check if connection has dependencies (used in vendor agreements, transformations, etc.)
 * @access  Protected (requires authentication)
 */
router.get('/:id/dependencies', async (req, res) => {
  try {
    const connectionId = req.params.id;
    const dependencies = {
      canDelete: true,
      inUse: false,
      dependencies: []
    };

    // Check vendor_agreements
    const vendorAgreements = await db.query(
      `SELECT va.id, v.vendor_name, va.file_name 
       FROM vendor_agreements va
       LEFT JOIN vendors v ON va.vendor_id = v.id
       WHERE va.vendor_connection_id = $1 AND va.status != 'archived'`,
      [connectionId]
    );
    if (vendorAgreements.rows.length > 0) {
      dependencies.dependencies.push({
        type: 'Vendor Agreements',
        count: vendorAgreements.rows.length,
        items: vendorAgreements.rows.map(row => ({
          id: row.id,
          name: `${row.vendor_name || 'Unknown Vendor'} - ${row.file_name}`
        }))
      });
    }

    // Check vendor_file_profiling_results
    const vendorProfiling = await db.query(
      `SELECT COUNT(DISTINCT file_id) as count 
       FROM vendor_file_profiling_results 
       WHERE connection_id = $1`,
      [connectionId]
    );
    if (vendorProfiling.rows[0].count > 0) {
      dependencies.dependencies.push({
        type: 'Vendor File Profiling Results',
        count: parseInt(vendorProfiling.rows[0].count),
        items: []
      });
    }

    // Check transformation_mappings (source and target)
    const transformMappings = await db.query(
      `SELECT mapping_id, mapping_name 
       FROM transformation_mappings 
       WHERE source_connection_id = $1 OR target_connection_id = $1`,
      [connectionId]
    );
    if (transformMappings.rows.length > 0) {
      dependencies.dependencies.push({
        type: 'Transformation Mappings',
        count: transformMappings.rows.length,
        items: transformMappings.rows.map(row => ({
          id: row.mapping_id,
          name: row.mapping_name
        }))
      });
    }

    // Check mapping_groups (through mapping_group_members -> transformation_mappings)
    const mappingGroups = await db.query(
      `SELECT DISTINCT mg.id as group_id, mg.name as group_name 
       FROM mapping_groups mg
       INNER JOIN mapping_group_members mgm ON mg.id = mgm.group_id
       INNER JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
       WHERE tm.source_connection_id = $1 OR tm.target_connection_id = $1`,
      [connectionId]
    );
    if (mappingGroups.rows.length > 0) {
      dependencies.dependencies.push({
        type: 'Mapping Groups',
        count: mappingGroups.rows.length,
        items: mappingGroups.rows.map(row => ({
          id: row.group_id,
          name: row.group_name
        }))
      });
    }

    // Update summary flags
    if (dependencies.dependencies.length > 0) {
      dependencies.canDelete = false;
      dependencies.inUse = true;
    }

    res.json(dependencies);
  } catch (error) {
    console.error('Error checking connection dependencies:', error);
    res.status(500).json({ error: 'Failed to check connection dependencies' });
  }
});

/**
 * @route   DELETE /api/connections/:id
 * @desc    Delete a connection (checks dependencies first)
 * @access  Protected (requires authentication and project membership)
 */
router.delete('/:id', async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Check project access before allowing delete
    const isAdmin = userHasAdminAccess(req.user);
    if (!isAdmin) {
      const existingConnection = await connectionService.getConnectionById(connectionId);
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
    
    // Check for dependencies before deletion
    const dependencies = [];
    
    // Check vendor_agreements
    const vendorAgreements = await db.query(
      `SELECT va.id, v.vendor_name, va.file_name 
       FROM vendor_agreements va
       LEFT JOIN vendors v ON va.vendor_id = v.id
       WHERE va.vendor_connection_id = $1 AND va.status != 'archived'`,
      [connectionId]
    );
    if (vendorAgreements.rows.length > 0) {
      dependencies.push({
        type: 'Vendor Agreements',
        count: vendorAgreements.rows.length,
        items: vendorAgreements.rows.slice(0, 5).map(row => `${row.vendor_name || 'Unknown Vendor'} - ${row.file_name}`)
      });
    }

    // Check vendor_file_profiling_results
    const vendorProfiling = await db.query(
      `SELECT COUNT(DISTINCT file_id) as count 
       FROM vendor_file_profiling_results 
       WHERE connection_id = $1`,
      [connectionId]
    );
    if (parseInt(vendorProfiling.rows[0].count) > 0) {
      dependencies.push({
        type: 'Vendor File Profiling Results',
        count: parseInt(vendorProfiling.rows[0].count),
        items: []
      });
    }

    // Check transformation_mappings
    const transformMappings = await db.query(
      `SELECT mapping_id, mapping_name 
       FROM transformation_mappings 
       WHERE source_connection_id = $1 OR target_connection_id = $1`,
      [connectionId]
    );
    if (transformMappings.rows.length > 0) {
      dependencies.push({
        type: 'Transformation Mappings',
        count: transformMappings.rows.length,
        items: transformMappings.rows.slice(0, 5).map(row => row.mapping_name)
      });
    }

    // Check mapping_groups (through mapping_group_members -> transformation_mappings)
    const mappingGroups = await db.query(
      `SELECT DISTINCT mg.id as group_id, mg.name as group_name 
       FROM mapping_groups mg
       INNER JOIN mapping_group_members mgm ON mg.id = mgm.group_id
       INNER JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
       WHERE tm.source_connection_id = $1 OR tm.target_connection_id = $1`,
      [connectionId]
    );
    if (mappingGroups.rows.length > 0) {
      dependencies.push({
        type: 'Mapping Groups',
        count: mappingGroups.rows.length,
        items: mappingGroups.rows.slice(0, 5).map(row => row.group_name)
      });
    }

    // If dependencies exist, prevent deletion
    if (dependencies.length > 0) {
      return res.status(409).json({
        error: 'Connection cannot be deleted',
        message: 'This connection is currently in use and cannot be deleted.',
        canDelete: false,
        inUse: true,
        dependencies: dependencies
      });
    }
    
    // No dependencies - safe to delete
    await connectionService.deleteConnection(connectionId);
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
 * @route   PATCH /api/connections/:id/soft-delete
 * @desc    Soft delete a connection (marks as deleted without removing)
 * @access  Protected (requires authentication)
 */
router.patch('/:id/soft-delete', async (req, res) => {
  try {
    const connectionId = req.params.id;
    const userId = req.user?.id;
    
    // Check project access before allowing soft delete
    const isAdmin = userHasAdminAccess(req.user);
    if (!isAdmin) {
      const existingConnection = await connectionService.getConnectionById(connectionId);
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
    
    // Perform soft delete
    const result = await db.query(
      `UPDATE storage_connections 
       SET is_deleted = TRUE, 
           deleted_at = NOW(), 
           deleted_by = $2,
           status = 'inactive'
       WHERE connection_id = $1
       RETURNING connection_id, name, is_deleted, deleted_at`,
      [connectionId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    res.json({
      success: true,
      message: 'Connection soft deleted successfully',
      connection: result.rows[0]
    });
  } catch (error) {
    console.error('Error soft deleting connection:', error);
    res.status(500).json({ error: 'Failed to soft delete connection' });
  }
});

/**
 * @route   PATCH /api/connections/:id/restore
 * @desc    Restore a soft-deleted connection
 * @access  Protected (requires authentication)
 */
router.patch('/:id/restore', async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Check project access before allowing restore
    const isAdmin = userHasAdminAccess(req.user);
    if (!isAdmin) {
      const existingConnection = await connectionService.getConnectionById(connectionId);
      const userId = req.user?.id;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      const userProjectIds = userProjects.map(p => p.id);
      
      if (!userProjectIds.includes(existingConnection.project_id)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to restore this connection' 
        });
      }
    }
    
    // Restore connection
    const result = await db.query(
      `UPDATE storage_connections 
       SET is_deleted = FALSE, 
           deleted_at = NULL, 
           deleted_by = NULL,
           status = 'active'
       WHERE connection_id = $1
       RETURNING connection_id, name, is_deleted`,
      [connectionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    res.json({
      success: true,
      message: 'Connection restored successfully',
      connection: result.rows[0]
    });
  } catch (error) {
    console.error('Error restoring connection:', error);
    res.status(500).json({ error: 'Failed to restore connection' });
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
    const isAdmin = userHasAdminAccess(req.user);
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
    const result = await db.query(
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
      source_access_key,
      source_secret_key,
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
        // No encryption for test - pass plain text source credentials
        if (source_access_key) auth_config.source_access_key = source_access_key;
        if (source_secret_key) auth_config.source_secret_key = source_secret_key;
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

/**
 * @route   POST /api/connections/:id/browse
 * @desc    Browse folders/files in the connection's bucket
 * @access  Protected (requires connection:execute permission)
 */
router.post('/:id/browse', async (req, res) => {
  try {
    // Check if user has connection:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('connection:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to browse connections. Contact your administrator.'
      });
    }
    
    const { id } = req.params;
    const { prefix = '' } = req.body; // Optional prefix to browse from a specific folder
    
    // Fetch connection from database
    const result = await db.query(
      'SELECT config, type, authentication_method, auth_config FROM storage_connections WHERE connection_id = $1 AND status = $2',
      [id, 'active']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found or inactive' });
    }
    
    const connection = result.rows[0];
    const config = typeof connection.config === 'string' 
      ? JSON.parse(connection.config) 
      : connection.config;
    
    const type = connection.type;
    const authMethod = connection.authentication_method || 'key-based';
    const authConfig = connection.auth_config 
      ? (typeof connection.auth_config === 'string' ? JSON.parse(connection.auth_config) : connection.auth_config)
      : {};
    
    // Decrypt credentials
    const decryptedConfig = connectionService.decryptSensitiveFields(type, config);
    
    let folders = [];
    
    // Browse based on connection type
    if (type === 'aws') {
      const AWS = require('aws-sdk');
      let s3;
      
      if (authMethod === 'aws-iam-role' && authConfig.iam_role_arn) {
        const credentials = await connectionService.getAssumedRoleCredentials(
          {
            role_arn: authConfig.iam_role_arn,
            external_id: authConfig.external_id,
            source_access_key: authConfig.source_access_key,
            source_secret_key: authConfig.source_secret_key,
            session_duration: 3600,
            session_name: 'DataObservatory-Browse'
          },
          decryptedConfig.region || 'us-east-1'
        );
        s3 = new AWS.S3({
          region: decryptedConfig.region || 'us-east-1',
          credentials,
          endpoint: decryptedConfig.endpoint,
          s3ForcePathStyle: !!decryptedConfig.endpoint
        });
      } else {
        s3 = new AWS.S3({
          accessKeyId: decryptedConfig.access_key,
          secretAccessKey: decryptedConfig.secret_key,
          region: decryptedConfig.region || 'us-east-1',
          endpoint: decryptedConfig.endpoint,
          s3ForcePathStyle: true
        });
      }
      
      const params = {
        Bucket: decryptedConfig.bucket,
        Prefix: prefix,
        Delimiter: '/'
      };
      
      const data = await s3.listObjectsV2(params).promise();
      
      // Get folders (CommonPrefixes)
      folders = (data.CommonPrefixes || []).map(item => ({
        name: item.Prefix.replace(prefix, '').replace('/', ''),
        path: item.Prefix,
        type: 'folder'
      }));
      
      // Get files at current level (optional, for file selection)
      const files = (data.Contents || [])
        .filter(item => item.Key !== prefix) // Exclude the prefix itself
        .map(item => ({
          name: item.Key.replace(prefix, ''),
          path: item.Key,
          type: 'file',
          size: item.Size,
          lastModified: item.LastModified
        }));
      
      folders = [...folders, ...files];
      
    } else if (type === 'gcp') {
      const { Storage } = require('@google-cloud/storage');
      const storage = new Storage({
        credentials: JSON.parse(decryptedConfig.service_account_json),
        projectId: decryptedConfig.project_id
      });
      
      const bucket = storage.bucket(decryptedConfig.gcp_bucket);
      const [files] = await bucket.getFiles({
        prefix: prefix,
        delimiter: '/',
        autoPaginate: false
      });
      
      // GCS returns prefixes separately
      const options = { prefix: prefix, delimiter: '/' };
      const [, , apiResponse] = await bucket.getFiles(options);
      
      folders = (apiResponse.prefixes || []).map(folderPath => ({
        name: folderPath.replace(prefix, '').replace('/', ''),
        path: folderPath,
        type: 'folder'
      }));
      
      const fileList = files
        .filter(file => file.name !== prefix)
        .map(file => ({
          name: file.name.replace(prefix, ''),
          path: file.name,
          type: 'file',
          size: file.metadata.size,
          lastModified: file.metadata.updated
        }));
      
      folders = [...folders, ...fileList];
      
    } else if (type === 'azure') {
      const { BlobServiceClient } = require('@azure/storage-blob');
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        `DefaultEndpointsProtocol=https;AccountName=${decryptedConfig.account_name};AccountKey=${decryptedConfig.account_key};EndpointSuffix=core.windows.net`
      );
      
      const containerClient = blobServiceClient.getContainerClient(decryptedConfig.container_name);
      
      const options = {
        prefix: prefix
      };
      
      const iter = containerClient.listBlobsByHierarchy('/', options);
      
      for await (const item of iter) {
        if (item.kind === 'prefix') {
          folders.push({
            name: item.name.replace(prefix, '').replace('/', ''),
            path: item.name,
            type: 'folder'
          });
        } else {
          folders.push({
            name: item.name.replace(prefix, ''),
            path: item.name,
            type: 'file',
            size: item.properties.contentLength,
            lastModified: item.properties.lastModified
          });
        }
      }
    } else {
      return res.status(400).json({ 
        error: 'Unsupported connection type for browsing',
        message: `Connection type '${type}' does not support folder browsing`
      });
    }
    
    res.json({
      success: true,
      prefix: prefix,
      items: folders
    });
    
  } catch (error) {
    console.error('[BROWSE CONNECTION] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to browse connection: ${error.message}` 
    });
  }
});

module.exports = router;
