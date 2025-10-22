const express = require('express');
const router = express.Router();
const connectionService = require('../services/ConnectionService');

/**
 * @route   GET /api/connections
 * @desc    Get all connections
 * @access  Public (authentication would be added in a real implementation)
 */
router.get('/', async (req, res) => {
  try {
    // Extract query parameters
    const { limit, source } = req.query;
    
    const connections = await connectionService.getAllConnections({ 
      limit: limit ? parseInt(limit) : undefined,
      source
    });
    
    // Filter out sensitive information
    const sanitizedConnections = connections.map(conn => {
      const { config, ...rest } = conn;
      return {
        ...rest,
        // Include non-sensitive config fields
        connection_name: config.connection_name || config.name || conn.name,
        connection_type: config.connection_type || conn.type,
        connection_direction: config.connection_direction || 'source',
        // Connection type specific fields (based on connection types)
        region: config.region,
        bucket_name: config.bucket_name,
        account_name: config.account_name,
        container_name: config.container_name,
        project_id: config.project_id,
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
 * @access  Public (authentication would be added in a real implementation)
 */
router.get('/:id', async (req, res) => {
  try {
    const connection = await connectionService.getConnectionById(req.params.id);
    
    // Filter sensitive information
    const { config, ...rest } = connection;
    const sanitizedConnection = {
      ...rest,
      // Include non-sensitive config fields
      connection_name: config.connection_name || config.name || connection.name,
      connection_type: config.connection_type || connection.type,
      connection_direction: config.connection_direction || 'source',
      // Connection type specific fields (similar to above)
      region: config.region,
      bucket_name: config.bucket_name,
      account_name: config.account_name,
      container_name: config.container_name,
      project_id: config.project_id,
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
 * @desc    Create a new connection
 * @access  Public (authentication would be added in a real implementation)
 */
router.post('/', async (req, res) => {
  try {
    const { connection_name, connection_type, ...configDetails } = req.body;
    
    // DEBUG: Log what we received
    console.log('[CREATE CONNECTION] Received request body:', JSON.stringify(req.body, null, 2));
    console.log('[CREATE CONNECTION] Connection type:', connection_type);
    console.log('[CREATE CONNECTION] Config details keys:', Object.keys(configDetails));
    if (connection_type === 'aws') {
      console.log('[CREATE CONNECTION] AWS - has access_key:', !!configDetails.access_key);
      console.log('[CREATE CONNECTION] AWS - has secret_key:', !!configDetails.secret_key);
    }
    
    // Format data for the connection service
    const connectionData = {
      name: connection_name,
      type: connection_type,
      config: {
        connection_name,
        connection_type,
        ...configDetails
      },
      description: req.body.description
    };
    
    console.log('[CREATE CONNECTION] Formatted connectionData config keys:', Object.keys(connectionData.config));
    
    const newConnection = await connectionService.createConnection(connectionData);
    
    console.log('[CREATE CONNECTION] Connection created with ID:', newConnection.id);
    
    // Filter sensitive information in response
    const { config, ...rest } = newConnection;
    const sanitizedConnection = {
      ...rest,
      connection_name: config.connection_name || config.name || newConnection.name,
      connection_type: config.connection_type || newConnection.type,
      connection_direction: config.connection_direction || 'source',
      // Other non-sensitive fields
    };
    
    res.status(201).json(sanitizedConnection);
  } catch (error) {
    console.error('[CREATE CONNECTION] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/connections/:id
 * @desc    Update a connection
 * @access  Public (authentication would be added in a real implementation)
 */
router.put('/:id', async (req, res) => {
  try {
    const { connection_name, connection_type, ...configDetails } = req.body;
    
    // DEBUG: Log what we received
    console.log('[UPDATE CONNECTION] Connection ID:', req.params.id);
    console.log('[UPDATE CONNECTION] Received request body:', JSON.stringify(req.body, null, 2));
    console.log('[UPDATE CONNECTION] Connection type:', connection_type);
    console.log('[UPDATE CONNECTION] Config details keys:', Object.keys(configDetails));
    if (connection_type === 'aws') {
      console.log('[UPDATE CONNECTION] AWS - access_key value:', configDetails.access_key || '(empty)');
      console.log('[UPDATE CONNECTION] AWS - secret_key value:', configDetails.secret_key || '(empty)');
      console.log('[UPDATE CONNECTION] AWS - has access_key:', !!configDetails.access_key);
      console.log('[UPDATE CONNECTION] AWS - has secret_key:', !!configDetails.secret_key);
    }
    
    // Format data for the connection service
    const connectionData = {
      name: connection_name,
      type: connection_type,
      config: {
        connection_name,
        connection_type,
        ...configDetails
      },
      description: req.body.description
    };
    
    console.log('[UPDATE CONNECTION] Formatted connectionData config keys:', Object.keys(connectionData.config));
    
    const updatedConnection = await connectionService.updateConnection(
      req.params.id, 
      connectionData
    );
    
    console.log('[UPDATE CONNECTION] Connection updated successfully');
    
    // Filter sensitive information in response
    const { config, ...rest } = updatedConnection;
    const sanitizedConnection = {
      ...rest,
      connection_name: config.connection_name || config.name || updatedConnection.name,
      connection_type: config.connection_type || updatedConnection.type,
      connection_direction: config.connection_direction || 'source',
      // Other non-sensitive fields
    };
    
    res.json(sanitizedConnection);
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
 * @access  Public (authentication would be added in a real implementation)
 */
router.delete('/:id', async (req, res) => {
  try {
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
 * @access  Public (authentication would be added in a real implementation)
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
 * @desc    Test a saved connection with form updates (merges form data with saved credentials)
 * @access  Public (authentication would be added in a real implementation)
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
    
    const { connection_type, ...formConfig } = req.body;
    
    console.log('[TEST WITH UPDATES] Connection ID:', req.params.id);
    console.log('[TEST WITH UPDATES] Form updates:', Object.keys(formConfig));
    
    // Fetch the saved connection from database
    const savedConnection = await connectionService.getConnectionById(req.params.id);
    
    // Merge form config with saved config (form values take precedence, except for empty credential fields)
    const mergedConfig = { ...savedConnection.config };
    
    // Define credential fields that should be preserved if empty in form
    const credentialFields = {
      aws: ['access_key', 'secret_key'],
      gcp: ['private_key'],
      azure: ['account_key'],
      snowflake: ['snowflake_password'],
      databricks: ['databricks_token'],
      sharepoint: ['sharepoint_client_secret'],
      outlook: ['outlook_client_secret']
    };
    
    const credsToPreserve = credentialFields[savedConnection.type] || [];
    
    // Update config with form values, but preserve saved credentials if form fields are empty
    for (const [key, value] of Object.entries(formConfig)) {
      if (credsToPreserve.includes(key) && !value) {
        // Keep existing encrypted credential
        console.log('[TEST WITH UPDATES] Preserving saved credential:', key);
      } else {
        // Use form value
        mergedConfig[key] = value;
      }
    }
    
    console.log('[TEST WITH UPDATES] Testing with merged config');
    
    // Test the merged configuration
    const testResult = await connectionService.testConnection({
      type: savedConnection.type,
      config: mergedConfig
    });
    
    console.log('[TEST WITH UPDATES] Test result:', testResult.success ? 'SUCCESS' : 'FAILED');
    
    res.json(testResult);
  } catch (error) {
    console.error('[TEST WITH UPDATES] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

/**
 * @route   POST /api/connections/test
 * @desc    Test a connection without saving it (for new connections)
 * @access  Public (authentication would be added in a real implementation)
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
    
    const { connection_type, ...configDetails } = req.body;
    
    // DEBUG: Log what we received for testing
    console.log('[TEST CONNECTION] Received request body:', JSON.stringify(req.body, null, 2));
    console.log('[TEST CONNECTION] Connection type:', connection_type);
    console.log('[TEST CONNECTION] Config details keys:', Object.keys(configDetails));
    if (connection_type === 'aws') {
      console.log('[TEST CONNECTION] AWS - access_key present:', !!configDetails.access_key);
      console.log('[TEST CONNECTION] AWS - secret_key present:', !!configDetails.secret_key);
      console.log('[TEST CONNECTION] AWS - region:', configDetails.region);
      console.log('[TEST CONNECTION] AWS - bucket:', configDetails.bucket_name);
    }
    
    const testResult = await connectionService.testConnection({
      type: connection_type,
      config: {
        connection_type,
        ...configDetails
      }
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
