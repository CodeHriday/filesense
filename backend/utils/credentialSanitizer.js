/**
 * Credential Sanitization Utility
 * 
 * Sanitizes sensitive fields from objects before logging or exposing them.
 * Prevents credential leakage in logs, error messages, and API responses.
 */

const SENSITIVE_FIELDS = [
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'client_secret',
  'api_key',
  'private_key',
  'auth_token',
  'bearer_token',
  'session_token',
  'encryption_key',
  'secret_key',
  'secret_access_key',
  'aws_secret_access_key',
  'credentials'
];

/**
 * Sanitize an object by replacing sensitive fields with redacted values
 * @param {Object} obj - Object to sanitize
 * @param {Array<string>} additionalSensitiveFields - Additional field names to redact
 * @returns {Object} - Sanitized copy of the object
 */
function sanitizeCredentials(obj, additionalSensitiveFields = []) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const allSensitiveFields = [...SENSITIVE_FIELDS, ...additionalSensitiveFields];
  const sanitized = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = allSensitiveFields.some(field => 
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      // Replace with redacted indicator
      sanitized[key] = value ? '[REDACTED]' : null;
    } else if (value && typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeCredentials(value, additionalSensitiveFields);
    } else {
      // Keep non-sensitive values as-is
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a safe summary of credentials (only boolean flags, no actual values)
 * @param {Object} credentials - Credentials object
 * @returns {Object} - Safe summary with boolean flags only
 */
function createCredentialsSummary(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    return null;
  }

  const summary = {};

  // Only include boolean existence flags
  if ('access_token' in credentials) {
    summary.hasAccessToken = !!credentials.access_token;
  }
  if ('refresh_token' in credentials) {
    summary.hasRefreshToken = !!credentials.refresh_token;
  }
  if ('expires_at' in credentials) {
    summary.expiresAt = credentials.expires_at; // Timestamp is safe
  }
  if ('expires_in' in credentials) {
    summary.expiresIn = credentials.expires_in; // Duration is safe
  }

  return summary;
}

/**
 * Sanitize configuration objects for logging
 * @param {Object} config - Configuration object
 * @returns {Object} - Sanitized configuration safe for logging
 */
function sanitizeConfig(config) {
  return sanitizeCredentials(config);
}

/**
 * Sanitize error objects before logging
 * @param {Error} error - Error object
 * @returns {Object} - Safe error representation
 */
function sanitizeError(error) {
  if (!error) return null;

  return {
    message: error.message,
    code: error.code,
    stack: error.stack,
    name: error.name
  };
}

module.exports = {
  sanitizeCredentials,
  createCredentialsSummary,
  sanitizeConfig,
  sanitizeError,
  SENSITIVE_FIELDS
};
