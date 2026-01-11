const { pool, query: dbQuery, getClient } = require('../config/database');
const AWS = require('aws-sdk');
const { Storage } = require('@google-cloud/storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const snowflake = require('snowflake-sdk');
const axios = require('axios');
const { encrypt, decrypt } = require('../utils/encryption');

const assumedRoleCache = new Map();
const ASSUMED_ROLE_CACHE_TTL = 45 * 60 * 1000;

class ConnectionService {
  
  /**
   * Safely decrypt a value - handles both encrypted and plaintext values
   * @param {string} value - The value to decrypt
   * @returns {string} - The decrypted value (or original if already plaintext)
   */
  safeDecrypt(value) {
    if (!value) return value;
    try {
      return decrypt(value);
    } catch (e) {
      return value;
    }
  }
  
  /**
   * Create AWS credentials based on authentication method
   * Supports: static keys, IAM role (instance profile), and AssumeRole
   * Handles both encrypted and plaintext credentials safely.
   * 
   * @param {Object} connection - Connection object from storage_connections
   * @returns {Promise<AWS.Credentials|null>} - AWS credentials or null for default chain
   */
  async getAwsCredentials(connection) {
    const config = connection.config || {};
    const authConfig = connection.auth_config || {};
    const authMethod = connection.authentication_method || 'key-based';
    
    if (authMethod === 'key-based') {
      const accessKey = config.access_key || config.access_key_id;
      const secretKey = config.secret_key || config.secret_access_key;
      
      if (!accessKey || !secretKey) {
        throw new Error('Static key authentication requires access_key and secret_key');
      }
      
      return new AWS.Credentials({
        accessKeyId: this.safeDecrypt(accessKey),
        secretAccessKey: this.safeDecrypt(secretKey)
      });
    }
    
    if (authMethod === 'aws-iam-role') {
      if (authConfig.role_arn) {
        return await this.getAssumedRoleCredentials(authConfig, config.region);
      }
      return null;
    }
    
    return null;
  }
  
  /**
   * Get credentials by assuming an IAM role via STS
   * Includes caching to avoid excessive AssumeRole calls
   * 
   * For cross-account AssumeRole, source credentials are required:
   * 1. Check for source_access_key/source_secret_key in auth config
   * 2. Fall back to environment variables AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
   * 3. Fall back to default credential chain (EC2 instance profile, ECS task role, etc.)
   * 
   * @param {Object} authConfig - Auth config with role_arn, external_id, source credentials, etc.
   * @param {string} region - AWS region
   * @returns {Promise<AWS.Credentials>} - Assumed role credentials
   */
  async getAssumedRoleCredentials(authConfig, region = 'us-east-1') {
    const { role_arn, external_id, session_duration = 3600, session_name, source_access_key, source_secret_key } = authConfig;
    
    if (!role_arn) {
      throw new Error('role_arn is required for AssumeRole authentication');
    }
    
    const cacheKey = `${role_arn}:${external_id || 'none'}`;
    const cached = assumedRoleCache.get(cacheKey);
    
    if (cached && cached.expiration > Date.now()) {
      return cached.credentials;
    }
    
    // Build STS config with source credentials for AssumeRole
    const stsConfig = { region };
    
    // Priority 1: Explicit source credentials in auth config (for cross-account)
    if (source_access_key && source_secret_key) {
      console.log('Using explicit source credentials for AssumeRole');
      stsConfig.credentials = {
        accessKeyId: this.safeDecrypt(source_access_key),
        secretAccessKey: this.safeDecrypt(source_secret_key)
      };
    }
    // Priority 2: Environment variables (platform-level credentials)
    else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('Using environment variable credentials for AssumeRole');
      stsConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      };
    }
    // Priority 3: Default credential chain (instance profile, ECS task role, etc.)
    else {
      console.log('Using default credential chain for AssumeRole (requires instance profile or configured credentials)');
    }
    
    const sts = new AWS.STS(stsConfig);
    
    const params = {
      RoleArn: role_arn,
      RoleSessionName: session_name || `DataObservatory-${Date.now()}`,
      DurationSeconds: Math.min(session_duration, 43200)
    };
    
    if (external_id) {
      params.ExternalId = external_id;
    }
    
    try {
      const response = await sts.assumeRole(params).promise();
      const credentials = new AWS.Credentials({
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken
      });
      
      assumedRoleCache.set(cacheKey, {
        credentials,
        expiration: Date.now() + ASSUMED_ROLE_CACHE_TTL
      });
      
      console.log(`Successfully assumed role: ${role_arn}`);
      return credentials;
    } catch (error) {
      console.error(`Failed to assume role ${role_arn}:`, error.message);
      throw new Error(`AssumeRole failed: ${error.message}`);
    }
  }
  
  /**
   * Create an S3 client with appropriate credentials based on connection auth method
   * Handles JSON string config and encrypted credentials internally.
   * 
   * @param {Object} connection - Connection object from storage_connections
   * @param {Object} options - Additional S3 client options
   * @returns {Promise<AWS.S3>} - Configured S3 client
   */
  async createS3Client(connection, options = {}) {
    const rawConfig = connection.config;
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : (rawConfig || {});
    const rawAuthConfig = connection.auth_config;
    const authConfig = typeof rawAuthConfig === 'string' ? JSON.parse(rawAuthConfig) : (rawAuthConfig || {});
    
    const normalizedConnection = {
      ...connection,
      config,
      auth_config: authConfig
    };
    
    const region = config.region || options.region || 'us-east-1';
    
    const s3Config = {
      region,
      ...options
    };
    
    if (config.endpoint) {
      s3Config.endpoint = config.endpoint;
      s3Config.s3ForcePathStyle = true;
    }
    
    const credentials = await this.getAwsCredentials(normalizedConnection);
    if (credentials) {
      s3Config.credentials = credentials;
    }
    
    return new AWS.S3(s3Config);
  }
  
  /**
   * Create an SES client with appropriate credentials based on connection auth method
   * Handles JSON string config and encrypted credentials internally.
   * 
   * @param {Object} connection - Connection object from storage_connections
   * @param {Object} options - Additional SES client options
   * @returns {Promise<AWS.SES>} - Configured SES client
   */
  async createSesClient(connection, options = {}) {
    const rawConfig = connection.config;
    const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : (rawConfig || {});
    const rawAuthConfig = connection.auth_config;
    const authConfig = typeof rawAuthConfig === 'string' ? JSON.parse(rawAuthConfig) : (rawAuthConfig || {});
    
    const normalizedConnection = {
      ...connection,
      config,
      auth_config: authConfig
    };
    
    const region = config.region || options.region || 'us-east-1';
    
    const sesConfig = {
      region,
      ...options
    };
    
    const credentials = await this.getAwsCredentials(normalizedConnection);
    if (credentials) {
      sesConfig.credentials = credentials;
    }
    
    return new AWS.SES(sesConfig);
  }
  
  /**
   * Create an S3 client from raw config (for backward compatibility)
   * Supports both key-based and IAM role authentication
   * 
   * @param {Object} config - Raw configuration object
   * @param {string} authMethod - Authentication method (key-based or aws-iam-role)
   * @param {Object} authConfig - Additional auth config for IAM role
   * @returns {Promise<AWS.S3>} - Configured S3 client
   */
  async createS3ClientFromConfig(config, authMethod = 'key-based', authConfig = {}) {
    const connection = {
      config,
      authentication_method: authMethod,
      auth_config: authConfig
    };
    return this.createS3Client(connection);
  }
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
      
      case 'vendor':
        // Vendor connections use access_key_id and secret_access_key
        if (config.access_key_id) {
          encryptedConfig.access_key_id = encrypt(config.access_key_id);
        }
        if (config.secret_access_key) {
          encryptedConfig.secret_access_key = encrypt(config.secret_access_key);
        }
        // Also handle GCP service account key for vendor connections
        if (config.service_account_key) {
          encryptedConfig.service_account_key = encrypt(config.service_account_key);
        }
        // Azure account key for vendor connections
        if (config.account_key) {
          encryptedConfig.account_key = encrypt(config.account_key);
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
      
      // Email Provider Types
      case 'smtp':
        if (config.password) {
          encryptedConfig.password = encrypt(config.password);
        }
        break;
      
      case 'gmail_oauth2':
      case 'outlook_oauth2':
        if (config.client_secret) {
          encryptedConfig.client_secret = encrypt(config.client_secret);
        }
        if (config.refresh_token) {
          encryptedConfig.refresh_token = encrypt(config.refresh_token);
        }
        if (config.access_token) {
          encryptedConfig.access_token = encrypt(config.access_token);
        }
        break;
      
      case 'sendgrid':
        if (config.api_key) {
          encryptedConfig.api_key = encrypt(config.api_key);
        }
        break;
      
      case 'ses':
        // AWS SES uses AWS credentials
        if (config.access_key_id) {
          encryptedConfig.access_key_id = encrypt(config.access_key_id);
        }
        if (config.secret_access_key) {
          encryptedConfig.secret_access_key = encrypt(config.secret_access_key);
        }
        break;
      
      case 'azure_email':
        // Azure Communication Services
        if (config.connection_string) {
          encryptedConfig.connection_string = encrypt(config.connection_string);
        }
        if (config.access_key) {
          encryptedConfig.access_key = encrypt(config.access_key);
        }
        break;
      
      case 'gcp_email':
        // GCP SMTP Relay or SendGrid on GCP
        if (config.private_key) {
          encryptedConfig.private_key = encrypt(config.private_key);
        }
        if (config.api_key) {
          encryptedConfig.api_key = encrypt(config.api_key);
        }
        if (config.password) {
          encryptedConfig.password = encrypt(config.password);
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
      
      case 'vendor':
        // Vendor connections use access_key_id and secret_access_key
        if (config.access_key_id) {
          decryptedConfig.access_key_id = decrypt(config.access_key_id);
        }
        if (config.secret_access_key) {
          decryptedConfig.secret_access_key = decrypt(config.secret_access_key);
        }
        // Also handle GCP service account key for vendor connections
        if (config.service_account_key) {
          decryptedConfig.service_account_key = decrypt(config.service_account_key);
        }
        // Azure account key for vendor connections
        if (config.account_key) {
          decryptedConfig.account_key = decrypt(config.account_key);
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
      
      // Email Provider Types
      case 'smtp':
        if (config.password) {
          decryptedConfig.password = decrypt(config.password);
        }
        break;
      
      case 'gmail_oauth2':
      case 'outlook_oauth2':
        if (config.client_secret) {
          decryptedConfig.client_secret = decrypt(config.client_secret);
        }
        if (config.refresh_token) {
          decryptedConfig.refresh_token = decrypt(config.refresh_token);
        }
        if (config.access_token) {
          decryptedConfig.access_token = decrypt(config.access_token);
        }
        break;
      
      case 'sendgrid':
        if (config.api_key) {
          decryptedConfig.api_key = decrypt(config.api_key);
        }
        break;
      
      case 'ses':
        // AWS SES uses AWS credentials
        if (config.access_key_id) {
          decryptedConfig.access_key_id = decrypt(config.access_key_id);
        }
        if (config.secret_access_key) {
          decryptedConfig.secret_access_key = decrypt(config.secret_access_key);
        }
        break;
      
      case 'azure_email':
        // Azure Communication Services
        if (config.connection_string) {
          decryptedConfig.connection_string = decrypt(config.connection_string);
        }
        if (config.access_key) {
          decryptedConfig.access_key = decrypt(config.access_key);
        }
        break;
      
      case 'gcp_email':
        // GCP SMTP Relay or SendGrid on GCP
        if (config.private_key) {
          decryptedConfig.private_key = decrypt(config.private_key);
        }
        if (config.api_key) {
          decryptedConfig.api_key = decrypt(config.api_key);
        }
        if (config.password) {
          decryptedConfig.password = decrypt(config.password);
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
   * @param {number} options.userId - User ID for project filtering
   * @param {boolean} options.isAdmin - Whether the user is an admin
   * @returns {Promise<Array>} - Array of connections
   */
  async getAllConnections(options = {}) {
    try {
      const { limit, source, userId, isAdmin, includeDeleted } = options;
      
      // Get user's accessible projects if not admin
      let projectIds = [];
      if (!isAdmin && userId) {
        const { getUserProjects } = require('../middleware/requireProjectAccess');
        const userProjects = await getUserProjects(userId);
        projectIds = userProjects.map(p => p.id);
        
        // Note: Even if user has no projects, they can still see global connections (project_id IS NULL)
      }
      
      // Query storage_connections for unified connection management
      let query = `
        SELECT 
          sc.connection_id as id,
          sc.name,
          sc.type,
          sc.config,
          sc.status,
          sc.connection_user,
          sc.connection_direction,
          sc.description,
          sc.authentication_method,
          sc.auth_config,
          sc.project_id,
          sc.path,
          sc.created_at,
          sc.updated_at,
          sc.is_deleted,
          sc.deleted_at,
          p.name as project_name,
          TRUE as is_active
        FROM storage_connections sc
        LEFT JOIN projects p ON sc.project_id = p.id
        WHERE sc.status = 'active'
      `;
      
      // Filter out soft-deleted connections by default
      if (!includeDeleted) {
        query += ' AND (sc.is_deleted = FALSE OR sc.is_deleted IS NULL)';
      }
      
      const params = [];
      
      // Filter by project membership (unless admin)
      // Include both: connections in user's projects AND global connections (project_id IS NULL)
      if (!isAdmin && projectIds.length > 0) {
        query += ' AND (sc.project_id = ANY($' + (params.length + 1) + ') OR sc.project_id IS NULL)';
        params.push(projectIds);
      } else if (!isAdmin) {
        // User has no projects, but can still see global connections
        query += ' AND sc.project_id IS NULL';
      }
      
      // Add source filter if specified (source_application not in storage_connections, skip for now)
      if (source) {
        // Storage connections don't have source_application field
        // Skip this filter for unified connections
      }
      
      // Add sorting and limit
      query += ' ORDER BY sc.name ASC';
      
      if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
      }
      
      const result = await dbQuery(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching connections:', error);
      throw new Error(`Failed to fetch connections: ${error.message}`);
    }
  }
  
  /**
   * Get a connection by ID from unified storage_connections table
   * 
   * @param {string} id - Connection ID (UUID)
   * @returns {Promise<Object>} - Connection details
   */
  async getConnectionById(id) {
    try {
      // All connections are now in storage_connections with UUID connection_id
      const result = await dbQuery(
        'SELECT * FROM storage_connections WHERE connection_id = $1',
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
   * Create a new connection in storage_connections (unified connection management)
   * 
   * @param {Object} connectionData - Connection data
   * @returns {Promise<Object>} - Created connection
   */
  async createConnection(connectionData) {
    const client = await getClient();
    const { v4: uuidv4 } = require('uuid');
    
    try {
      await client.query('BEGIN');
      
      const { 
        name, 
        type, 
        config,  
        description, 
        project_id,
        connection_user = 'Internal',
        connection_direction = 'source',
        authentication_method = 'key-based',
        auth_config = {},
        path = null
      } = connectionData;
      
      // Validate required fields
      if (!name || !type || !config) {
        throw new Error('Missing required connection fields');
      }
      
      // Check for duplicate connection name (case-insensitive) in storage_connections
      const duplicateCheck = await client.query(
        'SELECT name FROM storage_connections WHERE LOWER(name) = LOWER($1)',
        [name]
      );
      
      if (duplicateCheck.rows.length > 0) {
        throw new Error(`A connection with the name "${name}" already exists (case-insensitive).`);
      }
      
      // Generate connection ID
      const connectionId = uuidv4();
      
      // Insert into storage_connections table with unified fields
      const result = await client.query(`
        INSERT INTO storage_connections (
          connection_id,
          name, 
          type, 
          config, 
          status,
          description,
          project_id,
          connection_user,
          connection_direction,
          authentication_method,
          auth_config,
          path,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING connection_id, name, type, status, connection_user, connection_direction, 
                  description, authentication_method, path, created_at, updated_at
      `, [
        connectionId,
        name,
        type,
        JSON.stringify(config),
        'active',
        description || null,
        project_id || null,
        connection_user,
        connection_direction,
        authentication_method,
        JSON.stringify(auth_config),
        path
      ]);
      
      await client.query('COMMIT');
      console.log('Connection created successfully in storage_connections:', connectionId);
      
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
   * @param {string} id - Connection ID (UUID)
   * @param {Object} connectionData - Updated connection data
   * @returns {Promise<Object>} - Updated connection
   */
  async updateConnection(id, connectionData) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Check if connection exists
      const checkResult = await client.query(
        'SELECT * FROM storage_connections WHERE connection_id = $1',
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
      let updateQuery = 'UPDATE storage_connections SET ';
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
        const connectionType = type || existingConnection.type;
        
        // Parse existing config if it's a string (from database)
        const existingConfigParsed = typeof existingConfig === 'string' 
          ? JSON.parse(existingConfig) 
          : existingConfig;
        
        // Start with existing config (which has encrypted sensitive fields)
        const mergedConfig = { ...existingConfigParsed };
        
        // Define sensitive fields that should not be overwritten with empty values
        const sensitiveFieldsByType = {
          aws: ['access_key', 'secret_key', 'access_key_id', 'secret_access_key'],
          gcp: ['private_key', 'service_account_key'],
          azure: ['account_key'],
          snowflake: ['snowflake_password'],
          databricks: ['databricks_token'],
          sharepoint: ['sharepoint_client_secret'],
          outlook: ['outlook_client_secret'],
          vendor: ['access_key_id', 'secret_access_key', 'service_account_key', 'account_key'],
          // Email Provider Types
          smtp: ['password'],
          gmail_oauth2: ['client_secret', 'refresh_token', 'access_token'],
          outlook_oauth2: ['client_secret', 'refresh_token', 'access_token'],
          sendgrid: ['api_key'],
          ses: ['access_key_id', 'secret_access_key'],
          azure_email: ['connection_string', 'access_key'],
          gcp_email: ['private_key', 'api_key', 'password']
        };
        
        const sensitiveFields = sensitiveFieldsByType[connectionType] || [];
        
        // Separate new config into sensitive and non-sensitive fields
        const fieldsToEncrypt = {};
        
        // Update with new config values
        for (const [key, value] of Object.entries(config)) {
          // For sensitive fields: only update if value is non-empty
          if (sensitiveFields.includes(key)) {
            if (value && value !== '') {
              // Add to fields that need encryption
              fieldsToEncrypt[key] = value;
            }
            // If empty/undefined, preserve existing encrypted value (don't update)
          } else {
            // For non-sensitive fields: update normally
            mergedConfig[key] = value;
          }
        }
        
        // Encrypt the newly provided sensitive fields
        if (Object.keys(fieldsToEncrypt).length > 0) {
          const encryptedNewFields = this.encryptSensitiveFields(connectionType, fieldsToEncrypt);
          
          // Merge encrypted new fields into config
          for (const [key, value] of Object.entries(encryptedNewFields)) {
            mergedConfig[key] = value;
          }
        }
        
        updateFields.push(`config = $${updateValues.length + 1}`);
        updateValues.push(JSON.stringify(mergedConfig));
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
      updateQuery += ` WHERE connection_id = $${updateValues.length + 1} RETURNING *`;
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
   * @param {string} id - Connection ID (UUID)
   * @returns {Promise<boolean>} - Success status
   */
  async deleteConnection(id) {
    try {
      const result = await dbQuery(
        'DELETE FROM storage_connections WHERE connection_id = $1 RETURNING connection_id',
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
      
      // For vendor connections, use the provider from config, otherwise use type
      const providerType = config?.provider || type;
      
      // Log the test attempt
      console.log('Testing connection - type:', type, 'provider:', providerType);
      
      // Decrypt sensitive credentials if they're encrypted
      // (credentials from database are encrypted, but new credentials from form are not)
      const decryptedConfig = this.decryptSensitiveFieldsIfNeeded(providerType, config);
      
      let testResult = { success: false, message: 'Connection test not implemented' };
      
      switch (providerType) {
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
    
    // Check if a value looks encrypted (has IV:data or IV:authTag:data format)
    // Old encryption format: 2 parts (IV:encryptedData)
    // New encryption format: 3 parts (IV:authTag:encryptedData)
    const isEncrypted = (value) => {
      if (!value || typeof value !== 'string' || !value.includes(':')) {
        return false;
      }
      const parts = value.split(':').length;
      return parts === 2 || parts === 3;
    };
    
    console.log('[DECRYPT] Connection type:', type);
    console.log('[DECRYPT] Config has secret_key:', !!config.secret_key);
    
    switch (type) {
      case 'aws':
        // Handle both field name variations (access_key and access_key_id)
        // Decrypt if encrypted, otherwise use as-is
        if (config.access_key) {
          if (isEncrypted(config.access_key)) {
            console.log('[DECRYPT] Decrypting access_key (encrypted)');
            decryptedConfig.access_key = decrypt(config.access_key);
          }
        } else if (config.access_key_id) {
          if (isEncrypted(config.access_key_id)) {
            console.log('[DECRYPT] Decrypting access_key_id (encrypted)');
            decryptedConfig.access_key_id = decrypt(config.access_key_id);
          }
          // Always map access_key_id to access_key (for vendor connections)
          decryptedConfig.access_key = decryptedConfig.access_key_id;
        }
        
        if (config.secret_key) {
          if (isEncrypted(config.secret_key)) {
            console.log('[DECRYPT] Decrypting secret_key (encrypted)');
            decryptedConfig.secret_key = decrypt(config.secret_key);
          }
        } else if (config.secret_access_key) {
          if (isEncrypted(config.secret_access_key)) {
            console.log('[DECRYPT] Decrypting secret_access_key (encrypted)');
            decryptedConfig.secret_access_key = decrypt(config.secret_access_key);
          }
          // Always map secret_access_key to secret_key (for vendor connections)
          decryptedConfig.secret_key = decryptedConfig.secret_access_key;
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
      const bucket_name = config.bucket_name || config.bucket;
      const region = config.region || 'us-east-1';
      const authConfig = config.auth_config || {};
      const authMethod = authConfig.iam_role_arn ? 'aws-iam-role' : 'key-based';
      
      if (!bucket_name) {
        return {
          success: false,
          message: 'Missing required bucket name'
        };
      }
      
      if (!region) {
        return {
          success: false,
          message: 'Missing required AWS region'
        };
      }
      
      let s3;
      
      if (authMethod === 'aws-iam-role' && authConfig.iam_role_arn) {
        console.log(`Testing AWS S3 connection with IAM Role: ${authConfig.iam_role_arn}`);
        
        try {
          const credentials = await this.getAssumedRoleCredentials(
            {
              role_arn: authConfig.iam_role_arn,
              external_id: authConfig.external_id,
              source_access_key: authConfig.source_access_key,
              source_secret_key: authConfig.source_secret_key,
              session_duration: 900,
              session_name: 'DataObservatory-Test'
            },
            region
          );
          
          s3 = new AWS.S3({
            region,
            credentials
          });
        } catch (roleError) {
          return {
            success: false,
            message: `Failed to assume IAM role: ${roleError.message}`
          };
        }
      } else {
        const access_key = config.access_key || config.access_key_id;
        const secret_key = config.secret_key || config.secret_access_key;
        
        if (!access_key || !secret_key) {
          return {
            success: false,
            message: 'Missing required AWS credentials (access key and secret key)'
          };
        }
        
        s3 = new AWS.S3({
          accessKeyId: access_key,
          secretAccessKey: secret_key,
          region
        });
      }
      
      await s3.headBucket({ Bucket: bucket_name }).promise();
      
      const authDescription = authMethod === 'aws-iam-role' 
        ? `via IAM Role (${authConfig.iam_role_arn})`
        : 'with access keys';
      
      return {
        success: true,
        message: `Successfully connected to AWS S3 bucket '${bucket_name}' in region '${region}' ${authDescription}`
      };
    } catch (error) {
      console.error('AWS connection test failed:', error);
      
      if (error.code === 'NoSuchBucket') {
        return {
          success: false,
          message: `Bucket '${config.bucket_name || config.bucket}' does not exist`
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
      await dbQuery(
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
