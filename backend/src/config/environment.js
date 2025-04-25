/**
 * Environment configuration module
 * 
 * This module provides centralized access to environment variables
 * with sensible defaults and validation.
 */
require('dotenv').config();

// General application configuration
const APP_CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  API_PREFIX: process.env.API_PREFIX || '/api',
  UPLOADS_DIR: process.env.UPLOADS_DIR || './uploads',
  CORS_ORIGINS: process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',') : 
    ['http://localhost:5000', 'https://localhost:5000'],
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per window
};

// Database configuration
const DATABASE_CONFIG = {
  CONNECTION_STRING: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dataobservatory',
  SSL_ENABLED: process.env.DATABASE_SSL === 'true',
  SSL_REJECT_UNAUTHORIZED: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  POOL_MAX: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  POOL_IDLE_TIMEOUT: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000', 10),
  CONNECTION_TIMEOUT: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '5000', 10)
};

// Security configuration
const SECURITY_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '24h', // Token expiration time
  JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION || '7d', // Refresh token expiration
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'cookie-secret-change-in-production',
  ENABLE_CSRF: process.env.ENABLE_CSRF === 'true'
};

// File storage configuration
const STORAGE_CONFIG = {
  PROVIDER: process.env.STORAGE_PROVIDER || 'local', // 'local', 's3', 'azure', 'google'
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || './uploads',
  S3_BUCKET: process.env.S3_BUCKET || 'data-observatory',
  S3_REGION: process.env.S3_REGION || 'us-east-1',
  AZURE_CONTAINER: process.env.AZURE_CONTAINER || 'data-observatory',
  AZURE_CONNECTION_STRING: process.env.AZURE_CONNECTION_STRING || '',
  GCS_BUCKET: process.env.GCS_BUCKET || 'data-observatory',
  GCS_PROJECT_ID: process.env.GCS_PROJECT_ID || '',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '100', 10) * 1024 * 1024 // Default 100 MB
};

// Validate critical configuration
const validateConfig = () => {
  const issues = [];
  
  // Validate JWT secret in production
  if (APP_CONFIG.NODE_ENV === 'production' && 
      SECURITY_CONFIG.JWT_SECRET === 'your-secret-key-change-in-production') {
    issues.push('JWT_SECRET is using the default value in production mode');
  }
  
  // Validate storage provider configuration
  if (STORAGE_CONFIG.PROVIDER === 's3' && !process.env.AWS_ACCESS_KEY_ID) {
    issues.push('AWS_ACCESS_KEY_ID is required when using S3 storage provider');
  }
  
  if (STORAGE_CONFIG.PROVIDER === 'azure' && !STORAGE_CONFIG.AZURE_CONNECTION_STRING) {
    issues.push('AZURE_CONNECTION_STRING is required when using Azure storage provider');
  }
  
  if (STORAGE_CONFIG.PROVIDER === 'google' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    issues.push('GOOGLE_APPLICATION_CREDENTIALS is required when using Google Cloud Storage');
  }
  
  if (issues.length > 0) {
    console.warn('⚠️ Configuration issues detected:');
    issues.forEach(issue => console.warn(`  - ${issue}`));
    
    if (APP_CONFIG.NODE_ENV === 'production') {
      throw new Error('Critical configuration issues detected in production mode');
    }
  }
};

// Run validation (will throw in production if there are issues)
validateConfig();

module.exports = {
  APP_CONFIG,
  DATABASE_CONFIG,
  SECURITY_CONFIG,
  STORAGE_CONFIG
};