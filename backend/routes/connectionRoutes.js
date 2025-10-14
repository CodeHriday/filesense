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
    
    const newConnection = await connectionService.createConnection(connectionData);
    
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
    console.error('Error in POST /connections', error);
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
    
    const updatedConnection = await connectionService.updateConnection(
      req.params.id, 
      connectionData
    );
    
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
      console.error('Error in PUT /connections/:id', error);
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
 * @route   POST /api/connections/test
 * @desc    Test a connection without saving it
 * @access  Public (authentication would be added in a real implementation)
 */
router.post('/test', async (req, res) => {
  try {
    const { connection_type, ...configDetails } = req.body;
    
    const testResult = await connectionService.testConnection({
      type: connection_type,
      config: {
        connection_type,
        ...configDetails
      }
    });
    
    res.json(testResult);
  } catch (error) {
    console.error('Error in POST /connections/test', error);
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

module.exports = router;
