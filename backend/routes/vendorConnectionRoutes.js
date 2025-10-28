/**
 * Vendor Connection Routes
 * Handles vendor-specific file drop connections
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');
const { v4: uuidv4 } = require('uuid');

// Middleware to check admin access
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.roles || !req.user.roles.includes('Admin')) {
    systemLogger.warn('Unauthorized vendor connection access attempt', {
      userId: req.user?.id,
      roles: req.user?.roles,
      path: req.path
    });
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

/**
 * GET /api/vendor-connections
 * Get all vendor connections with optional project filter
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { project_id } = req.query;
    
    let query = `
      SELECT 
        sc.connection_id,
        sc.name,
        sc.type,
        sc.config,
        sc.status,
        sc.connection_direction,
        sc.project_id,
        sc.created_at,
        sc.updated_at,
        p.name as project_name
      FROM storage_connections sc
      LEFT JOIN projects p ON sc.project_id = p.id
      WHERE sc.type = 'vendor' AND sc.connection_direction IN ('source', 'target', 'drop')
    `;
    
    const params = [];
    
    if (project_id) {
      query += ` AND sc.project_id = $1`;
      params.push(project_id);
    }
    
    query += ` ORDER BY sc.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Remove sensitive credentials from response
    const connections = result.rows.map(conn => {
      const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
      const { access_key_id, secret_access_key, service_account_json, account_key, ...publicConfig } = config;
      
      return {
        ...conn,
        config: {
          ...publicConfig,
          hasCredentials: !!(access_key_id || secret_access_key || service_account_json || account_key)
        }
      };
    });
    
    res.json({ success: true, connections });
  } catch (error) {
    systemLogger.error('Error fetching vendor connections', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendor connections' });
  }
});

/**
 * GET /api/vendor-connections/:id
 * Get a specific vendor connection by ID
 */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        sc.connection_id,
        sc.name,
        sc.type,
        sc.config,
        sc.status,
        sc.connection_direction,
        sc.project_id,
        sc.created_at,
        sc.updated_at,
        p.name as project_name
      FROM storage_connections sc
      LEFT JOIN projects p ON sc.project_id = p.id
      WHERE sc.connection_id = $1 AND sc.type = 'vendor' AND sc.connection_direction IN ('source', 'target', 'drop')`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor connection not found' });
    }
    
    const connection = result.rows[0];
    const config = typeof connection.config === 'string' ? JSON.parse(connection.config) : connection.config;
    const { access_key_id, secret_access_key, service_account_json, account_key, ...publicConfig } = config;
    
    res.json({
      success: true,
      connection: {
        ...connection,
        config: {
          ...publicConfig,
          hasCredentials: !!(access_key_id || secret_access_key || service_account_json || account_key)
        }
      }
    });
  } catch (error) {
    systemLogger.error('Error fetching vendor connection', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendor connection' });
  }
});

/**
 * POST /api/vendor-connections
 * Create a new vendor connection
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      project_id,
      provider = 'aws',
      // AWS fields
      region,
      bucket,
      access_key_id,
      secret_access_key,
      endpoint,
      use_ssl = true,
      // GCP fields
      gcp_project_id,
      service_account_json,
      gcp_bucket,
      // Azure fields
      account_name,
      account_key,
      container_name,
      azure_endpoint,
      // Common
      path_prefix = ''
    } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Connection name is required' });
    }
    
    // Check for duplicate connection name (case-insensitive) across all connection tables
    const duplicateCheck = await pool.query(
      'SELECT name FROM storage_connections WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );
    
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: `A connection with the name "${name.trim()}" already exists (case-insensitive).` 
      });
    }
    
    // project_id is now optional for global vendor connections
    
    // Validate provider-specific fields
    if (provider === 'aws' && !bucket) {
      return res.status(400).json({ error: 'Bucket name is required for AWS S3' });
    }
    if (provider === 'gcp' && (!gcp_project_id || !gcp_bucket)) {
      return res.status(400).json({ error: 'Project ID and bucket name are required for GCP' });
    }
    if (provider === 'azure' && (!account_name || !container_name)) {
      return res.status(400).json({ error: 'Account name and container name are required for Azure' });
    }
    
    // Build config object
    const config = {
      provider,
      storage_type: provider === 'aws' ? 's3' : provider === 'gcp' ? 'gcs' : 'azure-blob'
    };
    
    // Encrypt and add provider-specific fields
    if (provider === 'aws') {
      config.region = region;
      config.bucket = bucket;
      config.endpoint = endpoint;
      config.use_ssl = use_ssl;
      config.path_prefix = path_prefix;
      if (access_key_id) config.access_key_id = encrypt(access_key_id);
      if (secret_access_key) config.secret_access_key = encrypt(secret_access_key);
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
    
    // Create connection
    const connectionId = uuidv4();
    // Convert undefined to null for project_id (vendor connections are global by default)
    const normalizedProjectId = project_id || null;
    const result = await pool.query(
      `INSERT INTO storage_connections (
        connection_id, type, name, config, status, 
        connection_direction, project_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING connection_id, name, type, status, connection_direction, project_id, created_at, updated_at`,
      [connectionId, 'vendor', name.trim(), JSON.stringify(config), 'active', 'drop', normalizedProjectId]
    );
    
    systemLogger.info('Vendor connection created', { 
      connectionId, 
      name, 
      projectId: project_id,
      provider,
      userId: req.user.id 
    });
    
    res.status(201).json({
      success: true,
      message: 'Vendor connection created successfully',
      connection: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error creating vendor connection', { error: error.message });
    res.status(500).json({ error: 'Failed to create vendor connection' });
  }
});

/**
 * PUT /api/vendor-connections/:id
 * Update an existing vendor connection
 */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      provider,
      // AWS fields
      region,
      bucket,
      access_key_id,
      secret_access_key,
      endpoint,
      use_ssl,
      // GCP fields
      gcp_project_id,
      service_account_json,
      gcp_bucket,
      // Azure fields
      account_name,
      account_key,
      container_name,
      azure_endpoint,
      // Common
      path_prefix,
      status
    } = req.body;
    
    // Get existing connection
    const existing = await pool.query(
      'SELECT config FROM storage_connections WHERE connection_id = $1 AND type = \'vendor\'',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor connection not found' });
    }
    
    const existingConfig = typeof existing.rows[0].config === 'string' 
      ? JSON.parse(existing.rows[0].config) 
      : existing.rows[0].config;
    
    // Update config
    const config = { ...existingConfig };
    
    if (provider) config.provider = provider;
    
    if (provider === 'aws' || existingConfig.provider === 'aws') {
      if (region !== undefined) config.region = region;
      if (bucket !== undefined) config.bucket = bucket;
      if (endpoint !== undefined) config.endpoint = endpoint;
      if (use_ssl !== undefined) config.use_ssl = use_ssl;
      if (path_prefix !== undefined) config.path_prefix = path_prefix;
      if (access_key_id) config.access_key_id = encrypt(access_key_id);
      if (secret_access_key) config.secret_access_key = encrypt(secret_access_key);
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
    
    // Update connection
    const result = await pool.query(
      `UPDATE storage_connections 
       SET name = COALESCE($1, name),
           config = $2,
           status = COALESCE($3, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE connection_id = $4 AND type = 'vendor'
       RETURNING connection_id, name, type, status, connection_direction, project_id, created_at, updated_at`,
      [name, JSON.stringify(config), status, id]
    );
    
    systemLogger.info('Vendor connection updated', { connectionId: id, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Vendor connection updated successfully',
      connection: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error updating vendor connection', { error: error.message });
    res.status(500).json({ error: 'Failed to update vendor connection' });
  }
});

/**
 * DELETE /api/vendor-connections/:id
 * Delete a vendor connection
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if connection is being used by any vendor agreements
    const usageCheck = await pool.query(
      'SELECT COUNT(*) FROM vendor_agreements WHERE vendor_connection_id = $1',
      [id]
    );
    
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete connection. It is currently being used by one or more vendor agreements.' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM storage_connections WHERE connection_id = $1 AND type = \'vendor\' RETURNING connection_id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor connection not found' });
    }
    
    systemLogger.info('Vendor connection deleted', { connectionId: id, userId: req.user.id });
    
    res.json({ success: true, message: 'Vendor connection deleted successfully' });
  } catch (error) {
    systemLogger.error('Error deleting vendor connection', { error: error.message });
    res.status(500).json({ error: 'Failed to delete vendor connection' });
  }
});

/**
 * POST /api/vendor-connections/test-new
 * Test a vendor connection configuration without saving it
 */
router.post('/test-new', requireAdmin, async (req, res) => {
  try {
    const {
      provider = 'aws',
      // AWS fields
      region,
      bucket,
      access_key_id,
      secret_access_key,
      endpoint,
      use_ssl = true,
      // GCP fields
      gcp_project_id,
      service_account_json,
      gcp_bucket,
      // Azure fields
      account_name,
      account_key,
      container_name,
      azure_endpoint
    } = req.body;
    
    // Build test config (no encryption needed for testing)
    const config = {
      provider,
      storage_type: provider === 'aws' ? 's3' : provider === 'gcp' ? 'gcs' : 'azure-blob'
    };
    
    if (provider === 'aws') {
      config.region = region;
      config.bucket = bucket;
      config.access_key_id = access_key_id; // No encryption for test
      config.secret_access_key = secret_access_key;
      config.endpoint = endpoint;
      config.use_ssl = use_ssl;
    } else if (provider === 'gcp') {
      config.project_id = gcp_project_id;
      config.gcp_bucket = gcp_bucket;
      config.service_account_json = service_account_json; // No encryption for test
    } else if (provider === 'azure') {
      config.account_name = account_name;
      config.container_name = container_name;
      config.account_key = account_key; // No encryption for test
      config.azure_endpoint = azure_endpoint;
    }
    
    let testResult;
    
    if (provider === 'aws') {
      testResult = await testAWSConnection(config);
    } else if (provider === 'gcp') {
      testResult = await testGCPConnection(config);
    } else if (provider === 'azure') {
      testResult = await testAzureConnection(config);
    } else {
      testResult = { success: false, message: `Provider '${provider}' test not implemented` };
    }
    
    res.json(testResult);
  } catch (error) {
    systemLogger.error('Error testing new vendor connection', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

/**
 * POST /api/vendor-connections/:id/test
 * Test a vendor connection
 */
router.post('/:id/test', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT config FROM storage_connections WHERE connection_id = $1 AND type = \'vendor\'',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor connection not found' });
    }
    
    const config = typeof result.rows[0].config === 'string' 
      ? JSON.parse(result.rows[0].config) 
      : result.rows[0].config;
    
    const provider = config.provider || 'aws';
    let testResult;
    
    if (provider === 'aws') {
      testResult = await testAWSConnection(config);
    } else if (provider === 'gcp') {
      testResult = await testGCPConnection(config);
    } else if (provider === 'azure') {
      testResult = await testAzureConnection(config);
    } else {
      testResult = { success: false, message: `Provider '${provider}' test not implemented` };
    }
    
    res.json(testResult);
  } catch (error) {
    systemLogger.error('Error testing vendor connection', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: `Connection test failed: ${error.message}` 
    });
  }
});

// Helper function to safely decrypt
function safeDecrypt(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return decrypt(value);
  } catch (error) {
    return value;
  }
}

// Test AWS connection
async function testAWSConnection(config) {
  const AWS = require('aws-sdk');
  
  try {
    const { region, bucket, access_key_id, secret_access_key, endpoint, use_ssl } = config;
    
    if (!access_key_id || !secret_access_key) {
      return { success: false, message: 'Missing AWS credentials' };
    }
    
    if (!bucket) {
      return { success: false, message: 'Missing AWS bucket name' };
    }
    
    const decryptedAccessKey = safeDecrypt(access_key_id);
    const decryptedSecretKey = safeDecrypt(secret_access_key);
    
    const s3Config = {
      accessKeyId: decryptedAccessKey,
      secretAccessKey: decryptedSecretKey,
      region: region || 'us-east-1'
    };
    
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.s3ForcePathStyle = true;
    }
    
    if (use_ssl !== undefined) {
      s3Config.sslEnabled = use_ssl;
    }
    
    const s3 = new AWS.S3(s3Config);
    await s3.headBucket({ Bucket: bucket }).promise();
    
    return {
      success: true,
      message: `Successfully connected to AWS S3 bucket '${bucket}'`
    };
  } catch (error) {
    return {
      success: false,
      message: `AWS connection failed: ${error.message}`
    };
  }
}

// Test GCP connection
async function testGCPConnection(config) {
  const { Storage } = require('@google-cloud/storage');
  
  try {
    const { project_id, gcp_bucket, service_account_json } = config;
    
    if (!service_account_json) {
      return { success: false, message: 'Missing GCP service account credentials' };
    }
    
    if (!gcp_bucket || !project_id) {
      return { success: false, message: 'Missing GCP bucket name or project ID' };
    }
    
    const decryptedServiceAccount = safeDecrypt(service_account_json);
    const credentials = JSON.parse(decryptedServiceAccount);
    
    const storage = new Storage({
      projectId: project_id,
      credentials: credentials
    });
    
    const bucket = storage.bucket(gcp_bucket);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      return { success: false, message: `Bucket '${gcp_bucket}' does not exist` };
    }
    
    return {
      success: true,
      message: `Successfully connected to GCP Storage bucket '${gcp_bucket}'`
    };
  } catch (error) {
    return {
      success: false,
      message: `GCP connection failed: ${error.message}`
    };
  }
}

// Test Azure connection
async function testAzureConnection(config) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  
  try {
    const { account_name, account_key, container_name } = config;
    
    if (!account_key) {
      return { success: false, message: 'Missing Azure account key' };
    }
    
    if (!container_name || !account_name) {
      return { success: false, message: 'Missing Azure container name or account name' };
    }
    
    const decryptedAccountKey = safeDecrypt(account_key);
    
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${account_name};AccountKey=${decryptedAccountKey};EndpointSuffix=core.windows.net`;
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(container_name);
    
    const exists = await containerClient.exists();
    
    if (!exists) {
      return { success: false, message: `Container '${container_name}' does not exist` };
    }
    
    return {
      success: true,
      message: `Successfully connected to Azure Blob Storage container '${container_name}'`
    };
  } catch (error) {
    return {
      success: false,
      message: `Azure connection failed: ${error.message}`
    };
  }
}

module.exports = router;
