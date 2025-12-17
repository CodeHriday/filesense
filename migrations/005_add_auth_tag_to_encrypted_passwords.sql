-- Migration: Add authentication tag column for GCM mode encryption
-- This enables secure authenticated encryption while maintaining backward compatibility

-- Add auth_tag column for GCM authentication tag
ALTER TABLE encrypted_passwords 
ADD COLUMN IF NOT EXISTS auth_tag TEXT;

-- Update the comment to reflect the new secure encryption mode
COMMENT ON TABLE encrypted_passwords IS 'Stores AES-256-GCM encrypted passwords for password-protected archives with authentication';
COMMENT ON COLUMN encrypted_passwords.secret_ciphertext IS 'AES-256-GCM encrypted password (or legacy AES-256-CBC)';
COMMENT ON COLUMN encrypted_passwords.iv IS 'Initialization vector for encryption/decryption';
COMMENT ON COLUMN encrypted_passwords.auth_tag IS 'GCM authentication tag for data integrity (null for legacy CBC entries)';