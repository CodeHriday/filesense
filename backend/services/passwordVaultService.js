const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

class PasswordVaultService {
  constructor(dbPool, auditService = null, logger = null) {
    this.dbPool = dbPool;
    this.auditService = auditService;
    this.logger = logger || console;
    
    // Enforce VAULT_ENCRYPTION_KEY presence - fail fast
    if (!process.env.VAULT_ENCRYPTION_KEY) {
      throw new Error(
        'VAULT_ENCRYPTION_KEY environment variable is required. ' +
        'Generate a secure key: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
      );
    }
    
    // Validate key format and length
    const encryptionKey = process.env.VAULT_ENCRYPTION_KEY;
    if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
      throw new Error(
        'VAULT_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes). ' +
        'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
      );
    }
    
    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
    this.logger.info('Password vault initialized with secure encryption key');
  }

  /**
   * Encrypt a password for secure storage
   * @param {string} password - Plain text password
   * @returns {Object} - Object containing encrypted password and IV
   */
  encrypt(password) {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        ciphertext: encrypted,
        iv: iv.toString('hex')
      };
    } catch (error) {
      this.logger.error('Encryption failed', { error: error.message });
      throw new Error(`Password encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a password from secure storage
   * @param {string} ciphertext - Encrypted password
   * @param {string} ivHex - Initialization vector (hex)
   * @returns {string} - Decrypted password
   */
  decrypt(ciphertext, ivHex) {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', { error: error.message });
      throw new Error(`Password decryption failed: ${error.message}`);
    }
  }

  /**
   * Store an encrypted password for a file or agreement schema
   * @param {string} entityType - 'file' or 'vendor_agreement_file_schema'
   * @param {string} entityId - File ID or schema ID
   * @param {string} password - Plain text password
   * @param {number} userId - User who is storing the password
   * @returns {Promise<Object>} - Stored password record
   */
  async storePassword(entityType, entityId, password, userId) {
    try {
      const { ciphertext, iv } = this.encrypt(password);
      
      const result = await this.dbPool.query(
        `INSERT INTO encrypted_passwords (entity_type, entity_id, secret_ciphertext, iv, encryption_version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (entity_type, entity_id)
         DO UPDATE SET 
           secret_ciphertext = EXCLUDED.secret_ciphertext,
           iv = EXCLUDED.iv,
           created_by = EXCLUDED.created_by,
           created_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [entityType, entityId, ciphertext, iv, 'v1', userId]
      );
      
      // Audit password storage
      if (this.auditService && this.auditService.logAction) {
        try {
          await this.auditService.logAction({
            userId,
            actionType: 'password_vault_store',
            entityType: 'encrypted_password',
            entityId: result.rows[0].id.toString(),
            status: 'success',
            metadata: { entityType, entityId }
          });
        } catch (auditError) {
          this.logger.warn('Audit logging failed for password store', { error: auditError.message });
        }
      }
      
      this.logger.info('Password stored successfully', {
        entityType,
        entityId,
        userId,
        passwordId: result.rows[0].id
      });
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Password storage failed', {
        entityType,
        entityId,
        error: error.message
      });
      throw new Error(`Failed to store password: ${error.message}`);
    }
  }

  /**
   * Retrieve and decrypt a password for a file or agreement schema
   * @param {string} entityType - 'file' or 'vendor_agreement_file_schema'
   * @param {string} entityId - File ID or schema ID
   * @param {number} userId - User requesting the password (for audit)
   * @returns {Promise<string|null>} - Decrypted password or null if not found
   */
  async retrievePassword(entityType, entityId, userId = null) {
    try {
      const result = await this.dbPool.query(
        `UPDATE encrypted_passwords
         SET last_accessed_at = CURRENT_TIMESTAMP
         WHERE entity_type = $1 AND entity_id = $2
         RETURNING *`,
        [entityType, entityId]
      );
      
      if (result.rows.length === 0) {
        this.logger.info('Password not found', { entityType, entityId });
        return null;
      }
      
      const record = result.rows[0];
      const password = this.decrypt(record.secret_ciphertext, record.iv);
      
      // Audit password retrieval
      if (this.auditService && this.auditService.logAction && userId) {
        try {
          await this.auditService.logAction({
            userId,
            actionType: 'password_vault_retrieve',
            entityType: 'encrypted_password',
            entityId: record.id.toString(),
            status: 'success',
            metadata: { entityType, entityId }
          });
        } catch (auditError) {
          this.logger.warn('Audit logging failed for password retrieve', { error: auditError.message });
        }
      }
      
      this.logger.info('Password retrieved successfully', {
        entityType,
        entityId,
        userId,
        passwordId: record.id
      });
      
      return password;
    } catch (error) {
      this.logger.error('Password retrieval failed', {
        entityType,
        entityId,
        error: error.message
      });
      throw new Error(`Failed to retrieve password: ${error.message}`);
    }
  }

  /**
   * Delete a stored password
   * @param {string} entityType - 'file' or 'vendor_agreement_file_schema'
   * @param {string} entityId - File ID or schema ID
   * @param {number} userId - User deleting the password (for audit)
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deletePassword(entityType, entityId, userId) {
    try {
      const result = await this.dbPool.query(
        'DELETE FROM encrypted_passwords WHERE entity_type = $1 AND entity_id = $2 RETURNING id',
        [entityType, entityId]
      );
      
      const deleted = result.rows.length > 0;
      
      // Audit password deletion
      if (deleted && this.auditService && this.auditService.logAction) {
        try {
          await this.auditService.logAction({
            userId,
            actionType: 'password_vault_delete',
            entityType: 'encrypted_password',
            entityId: result.rows[0].id.toString(),
            status: 'success',
            metadata: { entityType, entityId }
          });
        } catch (auditError) {
          this.logger.warn('Audit logging failed for password delete', { error: auditError.message });
        }
      }
      
      this.logger.info(deleted ? 'Password deleted' : 'Password not found for deletion', {
        entityType,
        entityId,
        userId
      });
      
      return deleted;
    } catch (error) {
      this.logger.error('Password deletion failed', {
        entityType,
        entityId,
        error: error.message
      });
      throw new Error(`Failed to delete password: ${error.message}`);
    }
  }

  /**
   * Check if a password exists for an entity
   * @param {string} entityType - 'file' or 'vendor_agreement_file_schema'
   * @param {string} entityId - File ID or schema ID
   * @returns {Promise<boolean>} - True if password exists
   */
  async hasPassword(entityType, entityId) {
    try {
      const result = await this.dbPool.query(
        'SELECT id FROM encrypted_passwords WHERE entity_type = $1 AND entity_id = $2',
        [entityType, entityId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      this.logger.error('Password check failed', {
        entityType,
        entityId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Schedule password rotation for security
   * @param {string} entityType - 'file' or 'vendor_agreement_file_schema'
   * @param {string} entityId - File ID or schema ID
   * @param {Date} rotationDate - When to rotate the password
   * @returns {Promise<boolean>} - True if rotation scheduled
   */
  async scheduleRotation(entityType, entityId, rotationDate) {
    try {
      const result = await this.dbPool.query(
        `UPDATE encrypted_passwords
         SET rotation_scheduled_at = $1
         WHERE entity_type = $2 AND entity_id = $3`,
        [rotationDate, entityType, entityId]
      );
      
      this.logger.info('Password rotation scheduled', {
        entityType,
        entityId,
        rotationDate
      });
      
      return result.rowCount > 0;
    } catch (error) {
      this.logger.error('Password rotation scheduling failed', {
        entityType,
        entityId,
        error: error.message
      });
      return false;
    }
  }
}

module.exports = PasswordVaultService;
