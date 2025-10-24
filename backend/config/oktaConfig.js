/**
 * Okta OIDC Configuration
 * Handles Okta authentication setup for SSO
 */

require('dotenv').config();

const oktaConfig = {
  issuer: process.env.OKTA_ISSUER || 'https://your-domain.okta.com/oauth2/default',
  clientId: process.env.OKTA_CLIENT_ID || 'your-client-id',
  clientSecret: process.env.OKTA_CLIENT_SECRET || 'your-client-secret',
  redirectUri: process.env.OKTA_REDIRECT_URI || 'http://localhost:3000/auth/okta/callback',
  scopes: ['openid', 'profile', 'email'],
  pkce: true,  // Use PKCE for added security
  testing: {
    disableHttpsCheck: process.env.NODE_ENV !== 'production'
  }
};

// Validate Okta configuration
function validateOktaConfig() {
  // When using PKCE, clientSecret is optional for public clients
  const required = oktaConfig.pkce 
    ? ['issuer', 'clientId', 'redirectUri']  // PKCE mode - no secret needed
    : ['issuer', 'clientId', 'clientSecret', 'redirectUri']; // Confidential client mode
  
  const missing = [];
  
  for (const key of required) {
    if (!oktaConfig[key] || oktaConfig[key].includes('your-')) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    console.warn(`⚠️  Okta SSO not configured. Missing: ${missing.join(', ')}`);
    if (oktaConfig.pkce) {
      console.warn('   Set OKTA_ISSUER, OKTA_CLIENT_ID, OKTA_REDIRECT_URI in environment (PKCE mode - client secret not required)');
    } else {
      console.warn('   Set OKTA_ISSUER, OKTA_CLIENT_ID, OKTA_CLIENT_SECRET, OKTA_REDIRECT_URI in environment');
    }
    return false;
  }
  
  console.log(`✓ Okta SSO configuration validated (PKCE mode: ${oktaConfig.pkce ? 'enabled' : 'disabled'})`);
  return true;
}

// Check if Okta is enabled
function isOktaEnabled() {
  return validateOktaConfig();
}

module.exports = {
  oktaConfig,
  validateOktaConfig,
  isOktaEnabled
};
