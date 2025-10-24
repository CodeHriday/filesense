/**
 * Okta SSO Authentication Routes
 * Handles Okta OIDC login flow and automatic user provisioning
 */

const express = require('express');
const router = express.Router();
const { ExpressOIDC } = require('@okta/oidc-middleware');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const { oktaConfig, isOktaEnabled } = require('../config/oktaConfig');

// Initialize Okta OIDC middleware only if configured
let oidc = null;

if (isOktaEnabled()) {
  // Determine app base URL from environment or Replit domain
  const appBaseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_BASE_URL || 'http://localhost:3000');
  
  oidc = new ExpressOIDC({
    issuer: oktaConfig.issuer,
    client_id: oktaConfig.clientId,
    client_secret: oktaConfig.clientSecret,
    redirect_uri: oktaConfig.redirectUri,
    appBaseUrl: appBaseUrl,
    scope: oktaConfig.scopes.join(' '),
    pkce: oktaConfig.pkce,
    routes: {
      login: {
        path: '/login'
      },
      loginCallback: {
        path: '/callback',
        handler: async (req, res, next) => {
          try {
            // User is authenticated, provision in our database
            const userInfo = req.userContext?.userinfo || req.userinfo;
            
            if (!userInfo) {
              throw new Error('No user information received from Okta');
            }
            
            // Provision or update user
            const user = await provisionOktaUser(userInfo);
            
            // Generate JWT token for our app
            const { SECURITY_CONFIG } = require('../src/config/environment');
            const token = jwt.sign(
              { 
                id: user.id,
                userId: user.id, 
                username: user.username,
                email: user.email,
                roles: user.roles || [],
                authProvider: 'okta'
              },
              SECURITY_CONFIG.JWT_SECRET,
              { expiresIn: SECURITY_CONFIG.JWT_EXPIRATION }
            );
            
            // Redirect to frontend with token
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
            res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
            
          } catch (error) {
            console.error('Okta callback error:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
            res.redirect(`${frontendUrl}/login?error=sso_failed`);
          }
        }
      }
    },
    ...oktaConfig.testing
  });
  
  // Mount the OIDC router to handle OAuth2 flow
  router.use(oidc.router);
  
  console.log('✓ Okta OIDC middleware initialized and mounted');
}

/**
 * Provision or update user from Okta profile
 * Creates new user if first-time login, updates if existing
 */
async function provisionOktaUser(oktaProfile) {
  const client = await pool.connect();
  
  try {
    const {
      sub: externalId,
      email,
      given_name: firstName,
      family_name: lastName,
      middle_name: middleName,
      phone_number: phoneNumber,
      preferred_username: username
    } = oktaProfile;
    
    // Check if user exists by external_id
    let result = await client.query(
      'SELECT * FROM users WHERE external_id = $1 AND auth_provider = $2',
      [externalId, 'okta']
    );
    
    if (result.rows.length > 0) {
      // Update existing user
      const updateQuery = `
        UPDATE users 
        SET 
          email = $1,
          first_name = $2,
          last_name = $3,
          middle_name = $4,
          phone_number = $5,
          last_login = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE external_id = $6 AND auth_provider = $7
        RETURNING *
      `;
      
      result = await client.query(updateQuery, [
        email,
        firstName,
        lastName,
        middleName || null,
        phoneNumber || null,
        externalId,
        'okta'
      ]);
      
      console.log(`✓ Updated Okta user: ${email}`);
    } else {
      // Create new user
      const insertQuery = `
        INSERT INTO users (
          username,
          email,
          first_name,
          last_name,
          middle_name,
          phone_number,
          auth_provider,
          external_id,
          password,
          last_login
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      // Use email as username if preferred_username not available
      const usernameValue = username || email.split('@')[0];
      
      result = await client.query(insertQuery, [
        usernameValue,
        email,
        firstName,
        lastName,
        middleName || null,
        phoneNumber || null,
        'okta',
        externalId
      ]);
      
      console.log(`✓ Created new Okta user: ${email}`);
    }
    
    return result.rows[0];
    
  } finally {
    client.release();
  }
}

// Note: /login and /callback routes are handled by the OIDC middleware mounted above

/**
 * POST /auth/okta/logout
 * Logout from Okta session
 */
router.post('/logout', (req, res) => {
  if (!isOktaEnabled()) {
    return res.json({ message: 'Logged out' });
  }
  
  req.logout();
  res.json({ message: 'Logged out from Okta' });
});

/**
 * GET /auth/okta/status
 * Check if Okta SSO is enabled
 */
router.get('/status', (req, res) => {
  res.json({ 
    enabled: isOktaEnabled(),
    configured: isOktaEnabled()
  });
});

module.exports = router;
