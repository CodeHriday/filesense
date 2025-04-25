/**
 * Environment configuration module
 * 
 * This module centralizes access to environment variables
 * and provides default values for development.
 */
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

/**
 * Get an environment variable with a default value
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if environment variable is not set
 * @returns {string} Environment variable value or default
 */
const getEnv = (key, defaultValue) => {
  return process.env[key] || defaultValue;
};

// Server configuration
const SERVER_CONFIG = {
  PORT: parseInt(getEnv('PORT', 3000), 10),
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  IS_PRODUCTION: getEnv('NODE_ENV', 'development') === 'production',
};

// Database configuration
const DB_CONFIG = {
  HOST: getEnv('DB_HOST', 'localhost'),
  PORT: parseInt(getEnv('DB_PORT', 5432), 10),
  USER: getEnv('DB_USER', 'postgres'),
  PASSWORD: getEnv('DB_PASSWORD', ''),
  DATABASE: getEnv('DB_NAME', 'postgres'),
  CONNECTION_STRING: getEnv('DATABASE_URL', ''),
};

// Security configuration
const SECURITY_CONFIG = {
  JWT_SECRET: getEnv('JWT_SECRET', 'your-secret-key-for-development'),
  JWT_EXPIRATION: getEnv('JWT_EXPIRATION', '24h'),
  JWT_REFRESH_EXPIRATION: getEnv('JWT_REFRESH_EXPIRATION', '7d'),
  BCRYPT_SALT_ROUNDS: parseInt(getEnv('BCRYPT_SALT_ROUNDS', 10), 10),
};

// File upload configuration
const UPLOAD_CONFIG = {
  UPLOAD_DIR: getEnv('UPLOAD_DIR', './uploads'),
  MAX_FILE_SIZE: parseInt(getEnv('MAX_FILE_SIZE', 1024 * 1024 * 1024), 10), // 1GB default
};

// CORS configuration
const CORS_CONFIG = {
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS', '*').split(','),
  ALLOWED_METHODS: getEnv('ALLOWED_METHODS', 'GET,POST,PUT,DELETE,OPTIONS').split(','),
  ALLOWED_HEADERS: getEnv('ALLOWED_HEADERS', 'Content-Type,Authorization').split(','),
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  WINDOW_MS: parseInt(getEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), 10), // 15 minutes
  MAX_REQUESTS: parseInt(getEnv('RATE_LIMIT_MAX_REQUESTS', 100), 10), // 100 requests
};

// Export all configurations
module.exports = {
  SERVER_CONFIG,
  DB_CONFIG,
  SECURITY_CONFIG,
  UPLOAD_CONFIG,
  CORS_CONFIG,
  RATE_LIMIT_CONFIG,
};