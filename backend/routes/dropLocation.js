const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { systemLogger } = require('../utils/logger');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return null;
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

router.get('/config', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, storage_type, region, bucket, path_prefix, endpoint, use_ssl, is_active, created_at, updated_at
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({ configured: false, config: null });
    }

    const config = result.rows[0];
    
    res.json({
      configured: true,
      config: {
        ...config,
        hasCredentials: config.access_key_id ? true : false
      }
    });
  } catch (error) {
    systemLogger.error('Error fetching drop location config', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch drop location configuration' });
  }
});

router.post('/config', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      storage_type = 's3',
      region,
      bucket,
      path_prefix = '',
      access_key_id,
      secret_access_key,
      endpoint,
      use_ssl = true
    } = req.body;

    if (!bucket) {
      return res.status(400).json({ error: 'Bucket name is required' });
    }

    const encryptedAccessKey = access_key_id ? encrypt(access_key_id) : null;
    const encryptedSecretKey = secret_access_key ? encrypt(secret_access_key) : null;

    const existingResult = await db.query(
      'SELECT id FROM drop_location_config WHERE is_active = true LIMIT 1'
    );

    let result;
    if (existingResult.rows.length > 0) {
      result = await db.query(
        `UPDATE drop_location_config 
         SET storage_type = $1, region = $2, bucket = $3, path_prefix = $4,
             access_key_id = $5, secret_access_key = $6, endpoint = $7, use_ssl = $8,
             updated_at = CURRENT_TIMESTAMP, updated_by = $9
         WHERE id = $10
         RETURNING id, storage_type, region, bucket, path_prefix, endpoint, use_ssl, is_active`,
        [storage_type, region, bucket, path_prefix, encryptedAccessKey, encryptedSecretKey, 
         endpoint, use_ssl, req.user.id, existingResult.rows[0].id]
      );
    } else {
      result = await db.query(
        `INSERT INTO drop_location_config 
         (storage_type, region, bucket, path_prefix, access_key_id, secret_access_key, 
          endpoint, use_ssl, is_active, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $9)
         RETURNING id, storage_type, region, bucket, path_prefix, endpoint, use_ssl, is_active`,
        [storage_type, region, bucket, path_prefix, encryptedAccessKey, encryptedSecretKey,
         endpoint, use_ssl, req.user.id]
      );
    }

    systemLogger.info('Drop location config saved', { 
      userId: req.user.id,
      bucket,
      storageType: storage_type
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

router.delete('/config', verifyToken, requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE drop_location_config SET is_active = false WHERE is_active = true');
    
    systemLogger.info('Drop location config deactivated', { userId: req.user.id });
    
    res.json({ message: 'Drop location configuration removed successfully' });
  } catch (error) {
    systemLogger.error('Error removing drop location config', { error: error.message });
    res.status(500).json({ error: 'Failed to remove drop location configuration' });
  }
});

router.get('/credentials', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT access_key_id, secret_access_key
       FROM drop_location_config
       WHERE is_active = true
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active drop location configuration found' });
    }

    const config = result.rows[0];
    
    res.json({
      access_key_id: config.access_key_id ? decrypt(config.access_key_id) : null,
      secret_access_key: config.secret_access_key ? decrypt(config.secret_access_key) : null
    });
  } catch (error) {
    systemLogger.error('Error fetching drop location credentials', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

module.exports = router;
