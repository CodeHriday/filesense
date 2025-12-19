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

/**
 * Initialize secrets manager and override environment variables
 * This runs once at startup and makes all existing code work transparently
 */
async function initializeSecrets() {
  if (initialized) return;
  
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
    console.error("❌ AWS Secrets Manager failed:", error.message);
    
    // Provide specific guidance based on error type
    if (error.name === 'CredentialsProviderError' || error.message.includes('credentials')) {
      console.error("💡 Please set AWS credentials in .env file:");
      console.error("   AWS_ACCESS_KEY_ID=your_access_key");
      console.error("   AWS_SECRET_ACCESS_KEY=your_secret_key");
      console.error("   AWS_REGION=us-east-2");
    } else if (error.name === 'ResourceNotFoundException') {
      console.error("💡 Secret 'filevantage-prod' not found in AWS Secrets Manager");
    }
    
    throw error; // Re-throw to prevent fallback to .env
  }
  
  // Fallback: use existing DATABASE_URL from .env
  if (process.env.DATABASE_URL) {
    console.log("✅ Using DATABASE_URL from environment variables");
  } else {
    console.error("❌ No DATABASE_URL found in Secrets Manager or environment variables");
  }
  
  initialized = true;
}

// Export the initialization function for manual control
// Don't auto-initialize to avoid timing issues

module.exports = {
  initializeSecrets
};

// Auto-initialize when module is loaded
initializeSecrets().catch(err => {
  console.error("Failed to initialize secrets:", err.message);
});