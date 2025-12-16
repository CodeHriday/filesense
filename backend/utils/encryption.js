/**
 * Encryption utility for sensitive data
 * Uses AES-256-GCM authenticated encryption (with CBC fallback for legacy data)
 */
require("dotenv").config();
const crypto = require('crypto');
const { systemLogger } = require('./logger');

const ALGORITHM = 'aes-256-gcm';

// CRITICAL: Encryption key must be a fixed 32-byte hex string
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Fail fast if encryption key is not configured
if (!ENCRYPTION_KEY) {
  const errorMsg = 'CRITICAL: ENCRYPTION_KEY environment variable is required for credentials encryption';
  systemLogger.error(errorMsg);
  console.error('\n' + '='.repeat(80));
  console.error(errorMsg);
  console.error('Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('Then set ENCRYPTION_KEY environment variable');
  console.error('='.repeat(80) + '\n');
  throw new Error(errorMsg);
}

// Validate encryption key format (must be 64 hex characters for 32 bytes)
if (!/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) {
  const errorMsg = 'CRITICAL: ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)';
  systemLogger.error(errorMsg, { keyLength: ENCRYPTION_KEY.length });
  console.error('\n' + '='.repeat(80));
  console.error(errorMsg);
  console.error(`Current key length: ${ENCRYPTION_KEY.length} (expected: 64)`);
  console.error('Generate a valid key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('='.repeat(80) + '\n');
  throw new Error(errorMsg);
}

/**
 * Encrypt text using AES-256-GCM (authenticated encryption)
 * @param {string} text - Text to encrypt
 * @returns {string|null} Encrypted text in format "iv:authTag:encryptedData" or null if text is empty
 */
function encrypt(text) {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(12); // GCM uses 12-byte IV for optimal performance
    const cipher = crypto.createCipheriv(
      ALGORITHM, 
      Buffer.from(ENCRYPTION_KEY, 'hex'), 
      iv
    );
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    systemLogger.error('Encryption failed', { error: error.message });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt text using AES-256-GCM (authenticated encryption)
 * @param {string} text - Encrypted text in format "iv:authTag:encryptedData" or legacy "iv:encryptedData"
 * @returns {string|null} Decrypted text or null if text is empty
 */
function decrypt(text) {
  if (!text) return null;
  
  try {
    const parts = text.split(':');
    
    // Handle both new GCM format (iv:authTag:encryptedData) and legacy CBC format (iv:encryptedData)
    if (parts.length === 3) {
      // New GCM format
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = Buffer.from(parts[2], 'hex');
      
      const decipher = crypto.createDecipheriv(
        ALGORITHM, 
        Buffer.from(ENCRYPTION_KEY, 'hex'), 
        iv
      );
      
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString();
    } else if (parts.length === 2) {
      // Legacy CBC format - fallback for existing data
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc', // Use CBC for legacy data
        Buffer.from(ENCRYPTION_KEY, 'hex'), 
        iv
      );
      
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString();
    } else {
      throw new Error('Invalid encrypted data format');
    }
  } catch (error) {
    systemLogger.error('Decryption failed', { 
      error: error.message,
      hint: 'Encryption key may have changed since data was encrypted'
    });
    throw new Error('Failed to decrypt data - key may have changed');
  }
}

/**
 * Decrypt cloud storage credentials based on connection type
 * @param {string} connectionType - Type of connection (aws, gcs, azure)
 * @param {Object} config - Configuration object with encrypted credentials
 * @returns {Object} Configuration object with decrypted credentials
 */
function decryptCredentials(connectionType, config) {
  if (!config) return {};
  
  const decryptedConfig = { ...config };
  
  try {
    switch (connectionType.toLowerCase()) {
      case 'aws':
      case 's3':
        // Decrypt AWS credentials
        // Support both field name variants (regular connections and vendor connections)
        if (config.access_key) {
          decryptedConfig.access_key = decrypt(config.access_key);
        }
        if (config.access_key_id) {
          decryptedConfig.access_key_id = decrypt(config.access_key_id);
        }
        if (config.secret_key) {
          decryptedConfig.secret_key = decrypt(config.secret_key);
        }
        if (config.secret_access_key) {
          decryptedConfig.secret_access_key = decrypt(config.secret_access_key);
        }
        break;
      
      case 'gcs':
      case 'google':
        // Decrypt GCS credentials
        if (config.private_key) {
          decryptedConfig.private_key = decrypt(config.private_key);
        }
        break;
      
      case 'azure':
      case 'blob':
        // Decrypt Azure credentials
        if (config.account_key) {
          decryptedConfig.account_key = decrypt(config.account_key);
        }
        break;
      
      default:
        systemLogger.warn('Unknown connection type for credential decryption', { connectionType });
    }
    
    return decryptedConfig;
  } catch (error) {
    systemLogger.error('Failed to decrypt credentials', { 
      connectionType, 
      error: error.message 
    });
    throw new Error(`Failed to decrypt credentials: ${error.message}`);
  }
}

module.exports = {
  encrypt,
  decrypt,
  decryptCredentials
};
