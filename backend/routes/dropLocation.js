const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');

// Middleware to check admin access (applied at route registration in server.js)
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.roles || !req.user.roles.includes('Admin')) {
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

    res.json({
      message: 'Drop location configuration saved successfully',
      config: result.rows[0]
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

module.exports = router;
