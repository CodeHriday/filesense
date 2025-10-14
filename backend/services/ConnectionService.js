const { pool, query } = require('../config/database');
const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const snowflake = require('snowflake-sdk');
const axios = require('axios');
const { encrypt, decrypt } = require('../utils/encryption');

class ConnectionService {
  /**
   * Encrypt sensitive credentials in config based on connection type
   * @param {string} type - Connection type
   * @param {Object} config - Configuration object
   * @returns {Object} - Config with encrypted sensitive fields
   */
  encryptSensitiveFields(type, config) {
    const encryptedConfig = { ...config };
    
    switch (type) {
      case 'aws':
        if (config.access_key) {
          encryptedConfig.access_key = encrypt(config.access_key);
        }
        if (config.secret_key) {
          encryptedConfig.secret_key = encrypt(config.secret_key);
        }
        break;
      
      case 'gcp':
        if (config.private_key) {
          encryptedConfig.private_key = encrypt(config.private_key);
        }
        break;
      
      case 'azure':
        if (config.account_key) {
          encryptedConfig.account_key = encrypt(config.account_key);
        }
        break;
      
      case 'snowflake':
        if (config.snowflake_password) {
          encryptedConfig.snowflake_password = encrypt(config.snowflake_password);
        }
        break;
      
      case 'databricks':
        if (config.databricks_token) {
          encryptedConfig.databricks_token = encrypt(config.databricks_token);
        }
        break;
      
      case 'sharepoint':
        if (config.sharepoint_client_secret) {
          encryptedConfig.sharepoint_client_secret = encrypt(config.sharepoint_client_secret);
        }
        break;
      
      case 'outlook':
        if (config.outlook_client_secret) {
          encryptedConfig.outlook_client_secret = encrypt(config.outlook_client_secret);
        }
        break;
    }
    
    return encryptedConfig;
  }

  /**
   * Decrypt sensitive credentials in config based on connection type
   * @param {string} type - Connection type
   * @param {Object} config - Configuration object with encrypted fields
   * @returns {Object} - Config with decrypted sensitive fields
   */
  decryptSensitiveFields(type, config) {
    const decryptedConfig = { ...config };
    
    switch (type) {
      case 'aws':
        if (config.access_key) {
          decryptedConfig.access_key = decrypt(config.access_key);
        }
        if (config.secret_key) {
          decryptedConfig.secret_key = decrypt(config.secret_key);
        }
        break;
      
      case 'gcp':
        if (config.private_key) {
          decryptedConfig.private_key = decrypt(config.private_key);
        }
        break;
      
      case 'azure':
        if (config.account_key) {
          decryptedConfig.account_key = decrypt(config.account_key);
        }
        break;
      
      case 'snowflake':
        if (config.snowflake_password) {
          decryptedConfig.snowflake_password = decrypt(config.snowflake_password);
        }
        break;
      
      case 'databricks':
        if (config.databricks_token) {
          decryptedConfig.databricks_token = decrypt(config.databricks_token);
        }
        break;
      
      case 'sharepoint':
        if (config.sharepoint_client_secret) {
          decryptedConfig.sharepoint_client_secret = decrypt(config.sharepoint_client_secret);
        }
        break;
      
      case 'outlook':
        if (config.outlook_client_secret) {
          decryptedConfig.outlook_client_secret = decrypt(config.outlook_client_secret);
        }
        break;
    }
    
    return decryptedConfig;
  }

  /**
   * Get all connections from the shared table
   * 
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of connections to return
   * @param {string} options.source - Filter by source application
   * @returns {Promise<Array>} - Array of connections
   */
  async getAllConnections(options = {}) {
    try {
      const { limit, source } = options;
      
      let query = 'SELECT * FROM transform_connections WHERE is_active = TRUE';
      const params = [];
      
      // Add source filter if specified
      if (source) {
        query += ' AND source_application = $1';
        params.push(source);
      }
      
      // Add sorting and limit
      query += ' ORDER BY name ASC';
      
      if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
      }
      
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching connections:', error);
      throw new Error(`Failed to fetch connections: ${error.message}`);
    }
  }
  
  /**
   * Get a connection by ID
   * 
   * @param {number} id - Connection ID
   * @returns {Promise<Object>} - Connection details
   */
  async getConnectionById(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM transform_connections WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Connection with ID ${id} not found`);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching connection by ID:', error);
      throw new Error(`Failed to fetch connection: ${error.message}`);
    }
  }
  
  /**
   * Create a new connection
   * 
   * @param {Object} connectionData - Connection data
   * @returns {Promise<Object>} - Created connection
   */
  async createConnection(connectionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { name, type, config, created_by, description } = connectionData;
      
      // Validate required fields
      if (!name || !type || !config) {
        throw new Error('Missing required connection fields');
      }
      
      // Encrypt sensitive credentials before saving
      const encryptedConfig = this.encryptSensitiveFields(type, config);
      
      // Insert the connection
      const result = await client.query(`
        INSERT INTO transform_connections (
          name, 
          type, 
          config, 
          created_by,
          description,
          source_application
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        name,
        type,
        encryptedConfig,
        created_by || null,
        description || null,
        'data_observatory'
      ]);
      
      await client.query('COMMIT');
      console.log('Connection created successfully:', result.rows[0].id);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating connection:', error);
      throw new Error(`Failed to create connection: ${error.message}`);
    } finally {
      client.release();
    }
  }
  
  /**
   * Update an existing connection
   * 
   * @param {number} id - Connection ID
   * @param {Object} connectionData - Updated connection data
   * @returns {Promise<Object>} - Updated connection
   */
  async updateConnection(id, connectionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if connection exists
      const checkResult = await client.query(
        'SELECT * FROM transform_connections WHERE id = $1',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        throw new Error(`Connection with ID ${id} not found`);
      }
      
      const existingConnection = checkResult.rows[0];
      const existingConfig = existingConnection.config || {};
      
      // Extract fields to update
      const { name, type, config, is_active, description } = connectionData;
      
      // Build update query dynamically based on provided fields
      let updateQuery = 'UPDATE transform_connections SET ';
      const updateValues = [];
      const updateFields = [];
      
      if (name !== undefined) {
        updateFields.push(`name = $${updateValues.length + 1}`);
        updateValues.push(name);
      }
      
      if (type !== undefined) {
        updateFields.push(`type = $${updateValues.length + 1}`);
        updateValues.push(type);
      }
      
      if (config !== undefined) {
        // Merge new config with existing config
        const mergedConfig = { ...existingConfig };
        
        // Define sensitive fields per connection type
        const sensitiveFields = {
          aws: ['access_key', 'secret_key'],
          gcp: ['private_key'],
          azure: ['account_key'],
          snowflake: ['snowflake_password'],
          databricks: ['databricks_token'],
          sharepoint: ['sharepoint_client_secret'],
          outlook: ['outlook_client_secret']
        };
        
        const connectionType = type || existingConnection.type;
        const sensFields = sensitiveFields[connectionType] || [];
        
        // Update non-sensitive fields first
        for (const [key, value] of Object.entries(config)) {
          if (!sensFields.includes(key)) {
            mergedConfig[key] = value;
          }
        }
        
        // Handle sensitive fields: preserve existing encrypted credentials if new ones are not provided or are empty
        for (const field of sensFields) {
          if (config[field] && config[field] !== '') {
            // Encrypt and store the new value
            mergedConfig[field] = encrypt(config[field]);
          }
          // If field is empty/missing in config, keep existing encrypted value (already in mergedConfig)
        }
        
        updateFields.push(`config = $${updateValues.length + 1}`);
        updateValues.push(mergedConfig);
      }
      
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${updateValues.length + 1}`);
        updateValues.push(is_active);
      }
      
      if (description !== undefined) {
        updateFields.push(`description = $${updateValues.length + 1}`);
        updateValues.push(description);
      }
      
      // Add updated_at timestamp
      updateFields.push(`updated_at = NOW()`);
      
      // If no fields to update, return the existing connection
      if (updateFields.length === 1) { // Only updated_at
        return existingConnection;
      }
      
      updateQuery += updateFields.join(', ');
      updateQuery += ` WHERE id = $${updateValues.length + 1} RETURNING *`;
      updateValues.push(id);
      
      // Execute update
      const result = await client.query(updateQuery, updateValues);
      
      await client.query('COMMIT');
      console.log('Connection updated successfully:', id);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating connection:', error);
      throw new Error(`Failed to update connection: ${error.message}`);
    } finally {
      client.release();
    }
  }
  
  /**
   * Delete a connection
   * 
   * @param {number} id - Connection ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteConnection(id) {
    try {
      const result = await pool.query(
        'DELETE FROM transform_connections WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Connection with ID ${id} not found`);
      }
      
      console.log('Connection deleted successfully:', id);
      return true;
    } catch (error) {
      console.error('Error deleting connection:', error);
      throw new Error(`Failed to delete connection: ${error.message}`);
    }
  }
  
  /**
   * Test a connection to verify it works
   * 
   * @param {Object} connectionData - Connection configuration to test
   * @returns {Promise<Object>} - Test result
   */
  async testConnection(connectionData) {
    try {
      const { type, config } = connectionData;
      
      // Log the test attempt
      console.log('Testing connection:', type);
      
      // Decrypt sensitive credentials if they're encrypted
      // (credentials from database are encrypted, but new credentials from form are not)
      const decryptedConfig = this.decryptSensitiveFieldsIfNeeded(type, config);
      
      let testResult = { success: false, message: 'Connection test not implemented' };
      
      switch (type) {
        case 'aws':
          testResult = await this.testAWSConnection(decryptedConfig);
          break;
          
        case 'gcp':
          testResult = await this.testGCPConnection(decryptedConfig);
          break;
          
        case 'azure':
          testResult = await this.testAzureConnection(decryptedConfig);
          break;
          
        case 'snowflake':
          testResult = await this.testSnowflakeConnection(decryptedConfig);
          break;
          
        case 'databricks':
          testResult = await this.testDatabricksConnection(decryptedConfig);
          break;
          
        case 'sharepoint':
          testResult = { success: true, message: 'SharePoint connection test not yet implemented' };
          break;
          
        case 'outlook':
          testResult = { success: true, message: 'Outlook connection test not yet implemented' };
          break;
          
        default:
          testResult = { 
            success: false, 
            message: `Connection type '${type}' test not implemented` 
          };
      }
      
      return testResult;
    } catch (error) {
      console.error('Error testing connection:', error);
      return { 
        success: false, 
        message: `Connection test failed: ${error.message}` 
      };
    }
  }

  /**
   * Decrypt sensitive fields only if they appear to be encrypted (contain ':' separator)
   * @param {string} type - Connection type
   * @param {Object} config - Configuration object
   * @returns {Object} - Config with decrypted fields
   */
  decryptSensitiveFieldsIfNeeded(type, config) {
    const decryptedConfig = { ...config };
    
    // Check if a value looks encrypted (has IV:data format)
    const isEncrypted = (value) => {
      return value && typeof value === 'string' && value.includes(':') && value.split(':').length === 2;
    };
    
    switch (type) {
      case 'aws':
        if (isEncrypted(config.access_key)) {
          decryptedConfig.access_key = decrypt(config.access_key);
        }
        if (isEncrypted(config.secret_key)) {
          decryptedConfig.secret_key = decrypt(config.secret_key);
        }
        break;
      
      case 'gcp':
        if (isEncrypted(config.private_key)) {
          decryptedConfig.private_key = decrypt(config.private_key);
        }
        break;
      
      case 'azure':
        if (isEncrypted(config.account_key)) {
          decryptedConfig.account_key = decrypt(config.account_key);
        }
        break;
      
      case 'snowflake':
        if (isEncrypted(config.snowflake_password)) {
          decryptedConfig.snowflake_password = decrypt(config.snowflake_password);
        }
        break;
      
      case 'databricks':
        if (isEncrypted(config.databricks_token)) {
          decryptedConfig.databricks_token = decrypt(config.databricks_token);
        }
        break;
      
      case 'sharepoint':
        if (isEncrypted(config.sharepoint_client_secret)) {
          decryptedConfig.sharepoint_client_secret = decrypt(config.sharepoint_client_secret);
        }
        break;
      
      case 'outlook':
        if (isEncrypted(config.outlook_client_secret)) {
          decryptedConfig.outlook_client_secret = decrypt(config.outlook_client_secret);
        }
        break;
    }
    
    return decryptedConfig;
  }
  
  /**
   * Test AWS S3 connection
   */
  async testAWSConnection(config) {
    try {
      const { access_key, secret_key, region, bucket_name } = config;
      
      if (!access_key || !secret_key || !region || !bucket_name) {
        return {
          success: false,
          message: 'Missing required AWS credentials (access key, secret key, region, or bucket name)'
        };
      }
      
      // Configure AWS SDK
      const s3 = new AWS.S3({
        accessKeyId: access_key,
        secretAccessKey: secret_key,
        region: region
      });
      
      // Test connection by checking if bucket exists and is accessible
      await s3.headBucket({ Bucket: bucket_name }).promise();
      
      return {
        success: true,
        message: `Successfully connected to AWS S3 bucket '${bucket_name}' in region '${region}'`
      };
    } catch (error) {
      console.error('AWS connection test failed:', error);
      
      if (error.code === 'NoSuchBucket') {
        return {
          success: false,
          message: `Bucket '${config.bucket_name}' does not exist`
        };
      } else if (error.code === 'InvalidAccessKeyId') {
        return {
          success: false,
          message: 'Invalid AWS access key ID'
        };
      } else if (error.code === 'SignatureDoesNotMatch') {
        return {
          success: false,
          message: 'Invalid AWS secret access key'
        };
      } else if (error.code === 'Forbidden' || error.code === 'AccessDenied') {
        return {
          success: false,
          message: 'Access denied. Check your credentials and bucket permissions'
        };
      } else {
        return {
          success: false,
          message: `AWS connection failed: ${error.message}`
        };
      }
    }
  }
  
  /**
   * Test Google Cloud Storage connection
   */
  async testGCPConnection(config) {
    try {
      const { project_id, private_key, client_email, bucket_name } = config;
      
      if (!project_id || !private_key || !client_email || !bucket_name) {
        return {
          success: false,
          message: 'Missing required GCP credentials (project ID, private key, client email, or bucket name)'
        };
      }
      
      // Configure GCP Storage client
      const storage = new Storage({
        projectId: project_id,
        credentials: {
          client_email: client_email,
          private_key: private_key
        }
      });
      
      // Test connection by checking if bucket exists
      const bucket = storage.bucket(bucket_name);
      const [exists] = await bucket.exists();
      
      if (!exists) {
        return {
          success: false,
          message: `Bucket '${bucket_name}' does not exist`
        };
      }
      
      return {
        success: true,
        message: `Successfully connected to GCP Storage bucket '${bucket_name}'`
      };
    } catch (error) {
      console.error('GCP connection test failed:', error);
      
      if (error.code === 403) {
        return {
          success: false,
          message: 'Access denied. Check your service account permissions'
        };
      } else if (error.code === 401) {
        return {
          success: false,
          message: 'Authentication failed. Check your service account credentials'
        };
      } else {
        return {
          success: false,
          message: `GCP connection failed: ${error.message}`
        };
      }
    }
  }
  
  /**
   * Test Azure Blob Storage connection
   */
  async testAzureConnection(config) {
    try {
      const { account_name, account_key, container_name } = config;
      
      if (!account_name || !account_key || !container_name) {
        return {
          success: false,
          message: 'Missing required Azure credentials (account name, account key, or container name)'
        };
      }
      
      // Create connection string
      const connectionString = `DefaultEndpointsProtocol=https;AccountName=${account_name};AccountKey=${account_key};EndpointSuffix=core.windows.net`;
      
      // Create BlobServiceClient
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(container_name);
      
      // Test connection by checking if container exists
      const exists = await containerClient.exists();
      
      if (!exists) {
        return {
          success: false,
          message: `Container '${container_name}' does not exist`
        };
      }
      
      return {
        success: true,
        message: `Successfully connected to Azure Blob Storage container '${container_name}'`
      };
    } catch (error) {
      console.error('Azure connection test failed:', error);
      
      if (error.statusCode === 403) {
        return {
          success: false,
          message: 'Access denied. Check your account key and permissions'
        };
      } else if (error.code === 'InvalidAuthenticationInfo') {
        return {
          success: false,
          message: 'Invalid account name or account key'
        };
      } else {
        return {
          success: false,
          message: `Azure connection failed: ${error.message}`
        };
      }
    }
  }
  
  /**
   * Test Snowflake connection
   */
  async testSnowflakeConnection(config) {
    return new Promise((resolve) => {
      try {
        const { 
          snowflake_account, 
          snowflake_username, 
          snowflake_password, 
          snowflake_warehouse,
          snowflake_database,
          snowflake_schema
        } = config;
        
        if (!snowflake_account || !snowflake_username || !snowflake_password) {
          resolve({
            success: false,
            message: 'Missing required Snowflake credentials (account, username, or password)'
          });
          return;
        }
        
        // Create Snowflake connection
        const connection = snowflake.createConnection({
          account: snowflake_account,
          username: snowflake_username,
          password: snowflake_password,
          warehouse: snowflake_warehouse,
          database: snowflake_database,
          schema: snowflake_schema
        });
        
        // Connect to Snowflake
        connection.connect((err, conn) => {
          if (err) {
            console.error('Snowflake connection test failed:', err);
            
            if (err.code === '390100') {
              resolve({
                success: false,
                message: 'Invalid Snowflake account, username, or password'
              });
            } else if (err.code === '390201') {
              resolve({
                success: false,
                message: 'Snowflake account does not exist'
              });
            } else {
              resolve({
                success: false,
                message: `Snowflake connection failed: ${err.message}`
              });
            }
            return;
          }
          
          // Connection successful, now destroy it
          connection.destroy((err) => {
            if (err) {
              console.warn('Error destroying Snowflake connection:', err);
            }
          });
          
          let message = `Successfully connected to Snowflake account '${snowflake_account}'`;
          if (snowflake_database) {
            message += ` (database: ${snowflake_database})`;
          }
          
          resolve({
            success: true,
            message: message
          });
        });
      } catch (error) {
        console.error('Snowflake connection test error:', error);
        resolve({
          success: false,
          message: `Snowflake connection failed: ${error.message}`
        });
      }
    });
  }
  
  /**
   * Test Databricks connection
   */
  async testDatabricksConnection(config) {
    try {
      const { databricks_host, databricks_token } = config;
      
      if (!databricks_host || !databricks_token) {
        return {
          success: false,
          message: 'Missing required Databricks credentials (host or token)'
        };
      }
      
      // Clean up host URL
      const host = databricks_host.replace(/\/$/, '');
      
      // Test connection by calling the clusters API
      const response = await axios.get(`${host}/api/2.0/clusters/list`, {
        headers: {
          'Authorization': `Bearer ${databricks_token}`
        },
        timeout: 10000
      });
      
      if (response.status === 200) {
        return {
          success: true,
          message: `Successfully connected to Databricks workspace at '${host}'`
        };
      } else {
        return {
          success: false,
          message: `Unexpected response from Databricks: ${response.status}`
        };
      }
    } catch (error) {
      console.error('Databricks connection test failed:', error);
      
      if (error.response) {
        if (error.response.status === 401 || error.response.status === 403) {
          return {
            success: false,
            message: 'Invalid Databricks token or insufficient permissions'
          };
        } else if (error.response.status === 404) {
          return {
            success: false,
            message: 'Invalid Databricks host URL'
          };
        } else {
          return {
            success: false,
            message: `Databricks API error: ${error.response.status} - ${error.response.statusText}`
          };
        }
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: 'Cannot reach Databricks host. Check the host URL'
        };
      } else {
        return {
          success: false,
          message: `Databricks connection failed: ${error.message}`
        };
      }
    }
  }
  
  /**
   * Update the last_used_at timestamp for a connection
   * 
   * @param {number} id - Connection ID
   * @returns {Promise<void>}
   */
  async updateLastUsedTimestamp(id) {
    try {
      await pool.query(
        'UPDATE transform_connections SET last_used_at = NOW() WHERE id = $1',
        [id]
      );
    } catch (error) {
      console.warn('Error updating connection last_used timestamp:', error);
      // Non-critical error, don't throw
    }
  }
}

module.exports = new ConnectionService();
