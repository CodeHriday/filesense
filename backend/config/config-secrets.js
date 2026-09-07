/**
 * Configuration Secrets Manager
 * 
 * Handles retrieval of sensitive configuration from AWS Secrets Manager
 * with fallback to environment variables (.env file)
 * 
 * This module automatically overrides process.env.DATABASE_URL at startup
 * so all existing code continues to work without changes.
 */

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

// Initialize AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || "us-east-2",
});

let initialized = false;
let cachedSecretData = null;

function getEnvironmentSecretData() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    OKTA_CLIENT_ID: process.env.OKTA_CLIENT_ID || process.env.VITE_OKTA_CLIENT_ID,
    OKTA_DOMAIN: process.env.OKTA_DOMAIN || process.env.VITE_OKTA_DOMAIN,
    OKTA_ISSUER: process.env.OKTA_ISSUER || (process.env.OKTA_DOMAIN ? `https://${process.env.OKTA_DOMAIN}/oauth2/default` : undefined),
    OKTA_REDIRECT_URI: process.env.OKTA_REDIRECT_URI || process.env.VITE_OKTA_REDIRECT_URI,
    BACKEND_URL: process.env.BACKEND_URL || process.env.VITE_BACKEND_URL,
  };
}

/**
 * Initialize secrets manager and override environment variables
 * This runs once at startup and makes all existing code work transparently
 */
async function initializeSecrets() {
  if (initialized) return;

  // Replit injects DATABASE_URL directly. Do not contact AWS in that case:
  // the AWS SDK's credential-provider retries add startup delay and misleading
  // errors even though the database configuration is already complete.
  if (process.env.DATABASE_URL) {
    cachedSecretData = getEnvironmentSecretData();
    initialized = true;
    console.log('✅ Using DATABASE_URL from environment variables');
    return;
  }
  
  try {
    console.log("Initializing AWS Secrets Manager integration...");
    
    const command = new GetSecretValueCommand({
      SecretId: "filevantage-prod",
    });
    
    const response = await secretsClient.send(command);
    
    if (response.SecretString) {
      let databaseUrl;
      
      try {
        const secretData = JSON.parse(response.SecretString);
        cachedSecretData = secretData;
        
        // Check if it's already a complete database URL
        if (secretData.database_url || secretData.DATABASE_URL) {
          databaseUrl = secretData.database_url || secretData.DATABASE_URL;
        } else {
          // Construct the PostgreSQL URL from AWS RDS secret format
          const { username, password, host, port = 5432, dbname } = secretData;
          
          if (username && password && host && dbname) {
            databaseUrl = `postgres://${username}:${password}@${host}:${port}/${dbname}`;
          }
        }
      } catch (parseError) {
        // If not JSON, assume the secret is the plain database URL
        databaseUrl = response.SecretString;
      }

      if (databaseUrl) {
        // Override the environment variable so all existing code works
        process.env.DATABASE_URL = databaseUrl;
        console.log("✅ Database URL loaded from AWS Secrets Manager");
        console.log("Database URL format:", databaseUrl.substring(0, 20) + "...");
        initialized = true;
        return;
      } else {
        console.error("❌ No database URL found in secret data");
        console.log("Secret data keys:", Object.keys(JSON.parse(response.SecretString || '{}')));
      }
    }
  } catch (error) {
    console.warn('AWS Secrets Manager unavailable; continuing with environment configuration.', error.message);
  }
  
  // Fallback: use existing DATABASE_URL from .env
  if (process.env.DATABASE_URL) {
    console.log("✅ Using DATABASE_URL from environment variables");
  } else {
    console.error("❌ No DATABASE_URL found in Secrets Manager or environment variables");
  }
  
  cachedSecretData = getEnvironmentSecretData();
  initialized = true;
}

async function getAllSecretData() {
  // If already fetched and cached, return it
  if (cachedSecretData) {
    return cachedSecretData;
  }

  // Prefer credentials already supplied by the deployment environment. This
  // avoids an unnecessary AWS credential lookup on every cold start.
  if (process.env.DATABASE_URL) {
    cachedSecretData = getEnvironmentSecretData();
    return cachedSecretData;
  }

  try {
    const command = new GetSecretValueCommand({
      SecretId: process.env.AWS_SECRET_ID || 'filevantage-prod',
    });

    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error('No secret value found in AWS Secrets Manager');
    }

    const secretData = JSON.parse(response.SecretString);

    // Cache both DB URL and the entire secret object
    cachedSecretData = secretData;
    return secretData;
  } catch (error) {
    // Fallback to environment variables for development
    console.warn('AWS Secrets Manager unavailable, using environment variables');
    
    cachedSecretData = getEnvironmentSecretData();
    return cachedSecretData;
  }
}

// Export the initialization function for manual control
// Don't auto-initialize to avoid timing issues

module.exports = {
  initializeSecrets,
  getAllSecretData,
};

// Auto-initialize when module is loaded
initializeSecrets().catch(err => {
  console.error("Failed to initialize secrets:", err.message);
});

getAllSecretData().catch(err => {
  console.error("Failed to fetch all secret data:", err.message);
});