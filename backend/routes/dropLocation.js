const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

// Middleware to check admin access (uses permission-based check for admin-equivalent roles)
const requireAdmin = (req, res, next) => {
  if (!userHasAdminAccess(req.user)) {
    systemLogger.warn('Unauthorized drop location access attempt', {
      userId: req.user?.id,
      roles: req.user?.roles,
      path: req.path
    });
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

router.get('/config', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, provider, storage_type, region, bucket, path_prefix, endpoint, use_ssl, 
              project_id, gcp_bucket, account_name, container_name, azure_endpoint,
              access_key_id, secret_access_key, service_account_json, account_key,
              is_active, created_at, updated_at
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({ configured: false, config: null });
    }

    const config = result.rows[0];
    
    // Check credentials based on provider
    let hasCredentials = false;
    if (config.provider === 'aws' || !config.provider) {
      hasCredentials = !!config.access_key_id;
    } else if (config.provider === 'gcp') {
      hasCredentials = !!config.service_account_json;
    } else if (config.provider === 'azure') {
      hasCredentials = !!config.account_key;
    }
    
    // Remove encrypted credentials from response
    const { access_key_id, secret_access_key, service_account_json, account_key, ...publicConfig } = config;
    
    res.json({
      configured: true,
      config: {
        ...publicConfig,
        hasCredentials
      }
    });
  } catch (error) {
    systemLogger.error('Error fetching drop location config', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch drop location configuration' });
  }
});

router.post('/config', requireAdmin, async (req, res) => {
  try {
    const {
      provider = 'aws',
      storage_type = 's3',
      // AWS fields
      region,
      bucket,
      access_key_id,
      secret_access_key,
      endpoint,
      use_ssl = true,
      // GCP fields
      project_id,
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

    // Validate required fields based on provider
    if (provider === 'aws' && !bucket) {
      return res.status(400).json({ error: 'Bucket name is required for AWS S3' });
    }
    if (provider === 'gcp' && (!project_id || !gcp_bucket)) {
      return res.status(400).json({ error: 'Project ID and bucket name are required for GCP' });
    }
    if (provider === 'azure' && (!account_name || !container_name)) {
      return res.status(400).json({ error: 'Account name and container name are required for Azure' });
    }

    // Encrypt credentials based on provider
    let encryptedAccessKey = null;
    let encryptedSecretKey = null;
    let encryptedServiceAccount = null;
    let encryptedAccountKey = null;

    if (provider === 'aws') {
      encryptedAccessKey = access_key_id ? encrypt(access_key_id) : null;
      encryptedSecretKey = secret_access_key ? encrypt(secret_access_key) : null;
    } else if (provider === 'gcp') {
      encryptedServiceAccount = service_account_json ? encrypt(service_account_json) : null;
    } else if (provider === 'azure') {
      encryptedAccountKey = account_key ? encrypt(account_key) : null;
    }

    const existingResult = await db.query(
      'SELECT id, provider, access_key_id, secret_access_key, service_account_json, account_key FROM drop_location_config WHERE is_active = true LIMIT 1'
    );

    let result;
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      // Keep existing credentials if new ones aren't provided
      if (provider === 'aws') {
        encryptedAccessKey = encryptedAccessKey || existing.access_key_id;
        encryptedSecretKey = encryptedSecretKey || existing.secret_access_key;
      } else if (provider === 'gcp') {
        encryptedServiceAccount = encryptedServiceAccount || existing.service_account_json;
      } else if (provider === 'azure') {
        encryptedAccountKey = encryptedAccountKey || existing.account_key;
      }
      
      result = await db.query(
        `UPDATE drop_location_config 
         SET provider = $1, storage_type = $2, region = $3, bucket = $4, path_prefix = $5,
             access_key_id = $6, secret_access_key = $7, endpoint = $8, use_ssl = $9,
             project_id = $10, service_account_json = $11, gcp_bucket = $12,
             account_name = $13, account_key = $14, container_name = $15, azure_endpoint = $16,
             updated_at = CURRENT_TIMESTAMP, updated_by = $17
         WHERE id = $18
         RETURNING id, provider, storage_type, region, bucket, path_prefix, endpoint, use_ssl, 
                   project_id, gcp_bucket, account_name, container_name, azure_endpoint, is_active`,
        [provider, storage_type, region, bucket, path_prefix, 
         encryptedAccessKey, encryptedSecretKey, endpoint, use_ssl,
         project_id, encryptedServiceAccount, gcp_bucket,
         account_name, encryptedAccountKey, container_name, azure_endpoint,
         req.user.id, existing.id]
      );
    } else {
      result = await db.query(
        `INSERT INTO drop_location_config 
         (provider, storage_type, region, bucket, path_prefix, 
          access_key_id, secret_access_key, endpoint, use_ssl,
          project_id, service_account_json, gcp_bucket,
          account_name, account_key, container_name, azure_endpoint,
          is_active, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, $17)
         RETURNING id, provider, storage_type, region, bucket, path_prefix, endpoint, use_ssl, 
                   project_id, gcp_bucket, account_name, container_name, azure_endpoint, is_active`,
        [provider, storage_type, region, bucket, path_prefix,
         encryptedAccessKey, encryptedSecretKey, endpoint, use_ssl,
         project_id, encryptedServiceAccount, gcp_bucket,
         account_name, encryptedAccountKey, container_name, azure_endpoint,
         req.user.id]
      );
    }

    systemLogger.info('Drop location config saved', { 
      userId: req.user.id,
      provider,
      bucket: bucket || gcp_bucket || container_name
    });

    // Query to get the saved configuration with credentials to determine hasCredentials
    const savedResult = await db.query(
      `SELECT provider, access_key_id, secret_access_key, service_account_json, account_key
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );
    
    const savedConfig = result.rows[0];
    const credConfig = savedResult.rows[0];
    
    // Check if credentials exist based on provider
    let hasCredentials = false;
    if (credConfig.provider === 'aws' || !credConfig.provider) {
      hasCredentials = !!(credConfig.access_key_id && credConfig.secret_access_key);
    } else if (credConfig.provider === 'gcp') {
      hasCredentials = !!credConfig.service_account_json;
    } else if (credConfig.provider === 'azure') {
      hasCredentials = !!credConfig.account_key;
    }

    res.json({
      message: 'Drop location configuration saved successfully',
      config: {
        ...savedConfig,
        hasCredentials
      }
    });
  } catch (error) {
    systemLogger.error('Error saving drop location config', { error: error.message });
    res.status(500).json({ error: 'Failed to save drop location configuration' });
  }
});

router.delete('/config', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE drop_location_config SET is_active = false WHERE is_active = true');
    
    systemLogger.info('Drop location config deactivated', { userId: req.user.id });
    
    res.json({ message: 'Drop location configuration removed successfully' });
  } catch (error) {
    systemLogger.error('Error removing drop location config', { error: error.message });
    res.status(500).json({ error: 'Failed to remove drop location configuration' });
  }
});

router.get('/credentials', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT provider, access_key_id, secret_access_key, service_account_json, account_key
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active drop location configuration found' });
    }

    const config = result.rows[0];
    const provider = config.provider || 'aws';
    
    // Return decrypted credentials based on provider
    const credentials = { provider };
    
    if (provider === 'aws') {
      credentials.access_key_id = config.access_key_id ? decrypt(config.access_key_id) : null;
      credentials.secret_access_key = config.secret_access_key ? decrypt(config.secret_access_key) : null;
    } else if (provider === 'gcp') {
      credentials.service_account_json = config.service_account_json ? decrypt(config.service_account_json) : null;
    } else if (provider === 'azure') {
      credentials.account_key = config.account_key ? decrypt(config.account_key) : null;
    }
    
    res.json(credentials);
  } catch (error) {
    systemLogger.error('Error fetching drop location credentials', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

router.get('/test', requireAdmin, async (req, res) => {
  try {
    console.log('[TEST DROP LOCATION] Starting connection test');
    
    // Fetch the active drop location configuration
    const result = await db.query(
      `SELECT provider, storage_type, region, bucket, path_prefix, endpoint, use_ssl,
              project_id, gcp_bucket, account_name, container_name, azure_endpoint,
              access_key_id, secret_access_key, service_account_json, account_key
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No active drop location configuration found. Please configure a drop location first.' 
      });
    }

    const config = result.rows[0];
    const provider = config.provider || 'aws';
    
    console.log('[TEST DROP LOCATION] Provider:', provider);
    console.log('[TEST DROP LOCATION] Has encrypted credentials:', !!config.access_key_id || !!config.service_account_json || !!config.account_key);
    
    let testResult = { success: false, message: 'Connection test not implemented' };
    
    // Test based on provider
    if (provider === 'aws') {
      testResult = await testAWSDropLocation(config);
    } else if (provider === 'gcp') {
      testResult = await testGCPDropLocation(config);
    } else if (provider === 'azure') {
      testResult = await testAzureDropLocation(config);
    } else {
      testResult = { 
        success: false, 
        message: `Provider '${provider}' test not implemented` 
      };
    }
    
    console.log('[TEST DROP LOCATION] Test result:', testResult.success ? 'SUCCESS' : 'FAILED');
    
    res.json(testResult);
  } catch (error) {
    console.error('[TEST DROP LOCATION] Error:', error);
    systemLogger.error('Error testing drop location', { error: error.message });
    res.status(500).json({ 
      success: false,
      message: `Connection test failed: ${error.message}` 
    });
  }
});

router.post('/test', requireAdmin, async (req, res) => {
  try {
    const formData = req.body;
    const provider = formData.provider || 'aws';
    
    console.log('[TEST DROP LOCATION WITH FORM] Provider:', provider);
    console.log('[TEST DROP LOCATION WITH FORM] Form data keys:', Object.keys(formData));
    
    // Fetch saved configuration to merge with form data
    const savedResult = await db.query(
      `SELECT provider, storage_type, region, bucket, path_prefix, endpoint, use_ssl,
              project_id, gcp_bucket, account_name, container_name, azure_endpoint,
              access_key_id, secret_access_key, service_account_json, account_key
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );
    
    // Merge form data with saved config
    const mergedConfig = { ...formData };
    
    if (savedResult.rows.length > 0) {
      const savedConfig = savedResult.rows[0];
      
      // Preserve and decrypt saved credentials if not provided in form
      if (provider === 'aws') {
        if (!formData.access_key_id && savedConfig.access_key_id) {
          mergedConfig.access_key_id = savedConfig.access_key_id;
          console.log('[TEST DROP LOCATION WITH FORM] Using saved access_key_id (encrypted)');
        }
        if (!formData.secret_access_key && savedConfig.secret_access_key) {
          mergedConfig.secret_access_key = savedConfig.secret_access_key;
          console.log('[TEST DROP LOCATION WITH FORM] Using saved secret_access_key (encrypted)');
        }
      } else if (provider === 'gcp') {
        if (!formData.service_account_json && savedConfig.service_account_json) {
          mergedConfig.service_account_json = savedConfig.service_account_json;
          console.log('[TEST DROP LOCATION WITH FORM] Using saved service_account_json (encrypted)');
        }
      } else if (provider === 'azure') {
        if (!formData.account_key && savedConfig.account_key) {
          mergedConfig.account_key = savedConfig.account_key;
          console.log('[TEST DROP LOCATION WITH FORM] Using saved account_key (encrypted)');
        }
      }
    }
    
    // Note: testAWSDropLocation, testGCPDropLocation, and testAzureDropLocation
    // already handle decryption of encrypted credentials (they check for IV:data format)
    
    let testResult = { success: false, message: 'Connection test not implemented' };
    
    // Test based on provider with merged config
    if (provider === 'aws') {
      testResult = await testAWSDropLocation(mergedConfig);
    } else if (provider === 'gcp') {
      testResult = await testGCPDropLocation(mergedConfig);
    } else if (provider === 'azure') {
      testResult = await testAzureDropLocation(mergedConfig);
    } else {
      testResult = { 
        success: false, 
        message: `Provider '${provider}' test not implemented` 
      };
    }
    
    console.log('[TEST DROP LOCATION WITH FORM] Test result:', testResult.success ? 'SUCCESS' : 'FAILED');
    
    res.json(testResult);
  } catch (error) {
    console.error('[TEST DROP LOCATION WITH FORM] Error:', error);
    systemLogger.error('Error testing drop location with form data', { error: error.message });
    res.status(500).json({ 
      success: false,
      message: `Connection test failed: ${error.message}` 
    });
  }
});

// Helper function to safely decrypt a value
// Returns decrypted value if successful, otherwise returns original value
function safeDecrypt(value) {
  if (!value || typeof value !== 'string') return value;
  
  try {
    return decrypt(value);
  } catch (error) {
    // If decryption fails, value is plain text
    return value;
  }
}

// Helper function to test AWS S3 drop location
async function testAWSDropLocation(config) {
  const AWS = require('aws-sdk');
  
  try {
    const { region, bucket, access_key_id, secret_access_key, endpoint, use_ssl } = config;
    
    if (!access_key_id || !secret_access_key) {
      return {
        success: false,
        message: 'Missing AWS credentials. Please configure access key and secret key.'
      };
    }
    
    if (!bucket) {
      return {
        success: false,
        message: 'Missing AWS bucket name'
      };
    }
    
    // Safely decrypt credentials (handles both encrypted and plain text)
    const decryptedAccessKey = safeDecrypt(access_key_id);
    const decryptedSecretKey = safeDecrypt(secret_access_key);
    
    console.log('[TEST AWS] Testing with bucket:', bucket);
    console.log('[TEST AWS] Region:', region);
    
    // Configure AWS SDK
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
    
    // Test connection by checking if bucket exists and is accessible
    await s3.headBucket({ Bucket: bucket }).promise();
    
    return {
      success: true,
      message: `Successfully connected to AWS S3 bucket '${bucket}' in region '${region || 'us-east-1'}'`
    };
  } catch (error) {
    console.error('[TEST AWS] Connection test failed:', error);
    
    if (error.code === 'NoSuchBucket') {
      return {
        success: false,
        message: `Bucket '${config.bucket}' does not exist`
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

// Helper function to test GCP Storage drop location
async function testGCPDropLocation(config) {
  const { Storage } = require('@google-cloud/storage');
  
  try {
    const { project_id, gcp_bucket, service_account_json } = config;
    
    if (!service_account_json) {
      return {
        success: false,
        message: 'Missing GCP service account credentials'
      };
    }
    
    if (!gcp_bucket || !project_id) {
      return {
        success: false,
        message: 'Missing GCP bucket name or project ID'
      };
    }
    
    // Safely decrypt and parse service account JSON (handles both encrypted and plain text)
    const decryptedServiceAccount = safeDecrypt(service_account_json);
    const credentials = JSON.parse(decryptedServiceAccount);
    
    console.log('[TEST GCP] Testing with bucket:', gcp_bucket);
    console.log('[TEST GCP] Project:', project_id);
    
    // Configure GCP Storage client
    const storage = new Storage({
      projectId: project_id,
      credentials: credentials
    });
    
    // Test connection by checking if bucket exists
    const bucket = storage.bucket(gcp_bucket);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      return {
        success: false,
        message: `Bucket '${gcp_bucket}' does not exist`
      };
    }
    
    return {
      success: true,
      message: `Successfully connected to GCP Storage bucket '${gcp_bucket}'`
    };
  } catch (error) {
    console.error('[TEST GCP] Connection test failed:', error);
    return {
      success: false,
      message: `GCP connection failed: ${error.message}`
    };
  }
}

// Helper function to test Azure Blob Storage drop location
async function testAzureDropLocation(config) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  
  try {
    const { account_name, account_key, container_name, azure_endpoint } = config;
    
    if (!account_key) {
      return {
        success: false,
        message: 'Missing Azure account key'
      };
    }
    
    if (!container_name || !account_name) {
      return {
        success: false,
        message: 'Missing Azure container name or account name'
      };
    }
    
    // Safely decrypt credentials (handles both encrypted and plain text)
    const decryptedAccountKey = safeDecrypt(account_key);
    
    console.log('[TEST Azure] Testing with container:', container_name);
    console.log('[TEST Azure] Account:', account_name);
    
    // Build connection string
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${account_name};AccountKey=${decryptedAccountKey};EndpointSuffix=core.windows.net`;
    
    // Configure Azure Blob Service Client
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
    console.error('[TEST Azure] Connection test failed:', error);
    return {
      success: false,
      message: `Azure connection failed: ${error.message}`
    };
  }
}

module.exports = router;
