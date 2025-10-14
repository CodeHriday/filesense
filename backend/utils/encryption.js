/**
 * Encryption utility for sensitive data
 * Uses AES-256-CBC encryption
 */

const crypto = require('crypto');
const { systemLogger } = require('./logger');

const ALGORITHM = 'aes-256-cbc';

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
 * Encrypt text using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string|null} Encrypted text in format "iv:encryptedData" or null if text is empty
 */
function encrypt(text) {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ALGORITHM, 
      Buffer.from(ENCRYPTION_KEY, 'hex'), 
      iv
    );
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    systemLogger.error('Encryption failed', { error: error.message });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt text using AES-256-CBC
 * @param {string} text - Encrypted text in format "iv:encryptedData"
 * @returns {string|null} Decrypted text or null if text is empty
 */
function decrypt(text) {
  if (!text) return null;
  
  try {
    const parts = text.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM, 
      Buffer.from(ENCRYPTION_KEY, 'hex'), 
      iv
    );
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (error) {
    systemLogger.error('Decryption failed', { 
      error: error.message,
      hint: 'Encryption key may have changed since data was encrypted'
    });
    throw new Error('Failed to decrypt data - key may have changed');
  }
}

module.exports = {
  encrypt,
  decrypt
};
