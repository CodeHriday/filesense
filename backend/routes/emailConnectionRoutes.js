const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const authorizeProjectResource = require('../middleware/authorizeProjectResource');
const ConnectionService = require('../services/ConnectionService');

/**
 * Email Connection API Routes
 * Handles email provider connections with OAuth2 support
 */

// Get all email connections (application-wide, includes null project_id connections)
router.get('/', async (req, res) => {
  try {
    // Email connections are application-wide, so we include connections with null project_id
    // All authenticated users can view email connections
    const query = `
      SELECT 
        connection_id,
        type as provider_type,
        name,
        status,
        created_at,
        updated_at,
        project_id,
        description,
        config
      FROM storage_connections
      WHERE type IN ('smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email')
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      connections: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching email connections', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email connections'
    });
  }
});

// Get a single email connection by ID
// Email connections are application-wide, so no project authorization needed
router.get('/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    const connection = await ConnectionService.getConnectionById(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Email connection not found'
      });
    }
    
    // Check if it's an email connection type
    const emailTypes = ['smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email'];
    if (!emailTypes.includes(connection.type)) {
      return res.status(400).json({
        success: false,
        error: 'Connection is not an email provider'
      });
    }
    
    res.json({
      success: true,
      connection
    });
  } catch (error) {
    systemLogger.error('Error fetching email connection', { 
      connectionId: req.params.connectionId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email connection'
    });
  }
});

// Create a new email connection
// Email connections are application-wide and don't require project context
router.post('/', async (req, res) => {
  try {
    const {
      name,
      provider_type,
      type,
      description,
      config
    } = req.body;
    
    // Use provider_type from frontend, fallback to type for backward compatibility
    const connectionType = provider_type || type;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Connection name is required'
      });
    }
    
    if (!connectionType) {
      return res.status(400).json({
        success: false,
        error: 'Connection type is required'
      });
    }
    
    // Validate email provider type
    const emailTypes = ['smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email'];
    if (!emailTypes.includes(connectionType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid email provider type. Must be one of: ${emailTypes.join(', ')}`
      });
    }
    
    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Connection configuration is required'
      });
    }
    
    // Create connection using ConnectionService (handles encryption)
    // Email connections are application-wide, so project_id is null
    const connection = await ConnectionService.createConnection({
      name,
      type: connectionType,
      description: description || null,
      project_id: null,
      config,
      connection_direction: 'outbound',
      status: 'active'
    });
    
    systemLogger.info('Email connection created', {
      connectionId: connection.connection_id,
      type,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      connection
    });
  } catch (error) {
    systemLogger.error('Error creating email connection', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create email connection'
    });
  }
});

// Update an email connection
// Email connections are application-wide, so no project authorization needed
router.put('/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const {
      name,
      description,
      config,
      status
    } = req.body;
    
    const updates = {};
    
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (config !== undefined) updates.config = config;
    if (status !== undefined) updates.status = status;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    // Update connection using ConnectionService (handles encryption)
    const connection = await ConnectionService.updateConnection(connectionId, updates);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Email connection not found'
      });
    }
    
    systemLogger.info('Email connection updated', {
      connectionId,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      connection
    });
  } catch (error) {
    systemLogger.error('Error updating email connection', { 
      connectionId: req.params.connectionId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update email connection'
    });
  }
});

// Delete an email connection
// Email connections are application-wide, so no project authorization needed
router.delete('/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    const connection = await ConnectionService.deleteConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Email connection not found'
      });
    }
    
    systemLogger.info('Email connection deleted', {
      connectionId,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      deleted: connection
    });
  } catch (error) {
    systemLogger.error('Error deleting email connection', { 
      connectionId: req.params.connectionId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete email connection'
    });
  }
});

// Test an email connection
// Email connections are application-wide, so no project authorization needed
router.post('/:connectionId/test', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { to_email } = req.body;
    
    if (!to_email) {
      return res.status(400).json({
        success: false,
        error: 'Recipient email (to_email) is required for testing'
      });
    }
    
    const connection = await ConnectionService.getConnectionById(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Email connection not found'
      });
    }
    
    // Import NotificationService to test the connection
    const NotificationService = require('../services/NotificationService');
    const notificationService = new NotificationService();
    
    try {
      // Parse config if it's a string
      const config = typeof connection.config === 'string' 
        ? JSON.parse(connection.config) 
        : connection.config;
      
      // Decrypt sensitive fields for the connection type
      const decryptedConfig = notificationService.connectionService.decryptSensitiveFields(
        connection.type,
        config
      );
      
      // Create provider object in the format expected by sendWithProvider
      const provider = {
        id: connection.connection_id,
        type: connection.type,
        name: connection.name,
        config: decryptedConfig
      };
      
      // Send test email using the provider
      const result = await notificationService.sendWithProvider(provider, {
        to: [to_email],
        subject: 'Test Email from Data File Observatory',
        html: '<p>This is a test email to verify your email connection is working correctly.</p><p>If you received this message, your email provider configuration is working!</p>',
        text: 'This is a test email to verify your email connection is working correctly. If you received this message, your email provider configuration is working!'
      });
      
      if (result.success) {
        systemLogger.info('Email connection test successful', {
          connectionId,
          userId: req.user.id
        });
        
        res.json({
          success: true,
          message: 'Test email sent successfully',
          details: result
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send test email',
          details: result.error
        });
      }
    } catch (sendError) {
      systemLogger.error('Email connection test failed', {
        connectionId,
        error: sendError.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to send test email',
        details: sendError.message
      });
    }
  } catch (error) {
    systemLogger.error('Error testing email connection', { 
      connectionId: req.params.connectionId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to test email connection'
    });
  }
});

// OAuth2 authorization URL generator for Gmail/Outlook
router.post('/oauth2/authorize-url', async (req, res) => {
  try {
    const { provider, redirect_uri, project_id } = req.body;
    
    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'Provider is required (gmail or outlook)'
      });
    }
    
    if (!redirect_uri) {
      return res.status(400).json({
        success: false,
        error: 'Redirect URI is required'
      });
    }
    
    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }
    
    // Generate state token for CSRF protection
    const crypto = require('crypto');
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in session or temporary storage
    // For simplicity, we'll encode it in the state parameter
    const stateData = Buffer.from(JSON.stringify({
      project_id,
      timestamp: Date.now()
    })).toString('base64');
    
    let authUrl;
    
    if (provider === 'gmail') {
      const clientId = process.env.GMAIL_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({
          success: false,
          error: 'Gmail OAuth2 not configured (missing GMAIL_CLIENT_ID)'
        });
      }
      
      authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
        '&response_type=code' +
        '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/gmail.send') +
        '&access_type=offline' +
        '&prompt=consent' +
        `&state=${stateData}`;
        
    } else if (provider === 'outlook') {
      const clientId = process.env.OUTLOOK_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({
          success: false,
          error: 'Outlook OAuth2 not configured (missing OUTLOOK_CLIENT_ID)'
        });
      }
      
      authUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
        '&response_type=code' +
        '&scope=' + encodeURIComponent('https://graph.microsoft.com/Mail.Send offline_access') +
        `&state=${stateData}`;
        
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "gmail" or "outlook"'
      });
    }
    
    res.json({
      success: true,
      auth_url: authUrl,
      state: stateData
    });
    
  } catch (error) {
    systemLogger.error('Error generating OAuth2 authorization URL', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL'
    });
  }
});

// Gmail OAuth2 POST auth (initiates OAuth2 flow)
// Returns auth URL for frontend to open in popup
router.post('/oauth2/gmail/auth',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:create'],
    getProjectId: (req) => req.body.project_id
  }),
  async (req, res) => {
  try {
    const { project_id } = req.body;
    const userId = req.user?.id;
    
    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found'
      });
    }
    
    const clientId = process.env.GMAIL_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({
        success: false,
        error: 'Gmail OAuth2 not configured (missing GMAIL_CLIENT_ID)'
      });
    }
    
    // Generate cryptographically secure nonce
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Store state in cache with 10-minute expiry (one-time use)
    const { getCacheClient } = require('../utils/cache');
    const cache = getCacheClient();
    const stateKey = `oauth2_state:${nonce}`;
    const stateData = {
      project_id,
      user_id: userId,
      provider: 'gmail',
      timestamp: Date.now()
    };
    
    await cache.set(stateKey, JSON.stringify(stateData), 600); // 10 minutes
    
    const redirect_uri = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/email-connections/oauth2/gmail/callback`;
    
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      '&response_type=code' +
      '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/gmail.send') +
      '&access_type=offline' +
      '&prompt=consent' +
      `&state=${nonce}`;
    
    systemLogger.info('Gmail OAuth2 flow initiated', { userId, projectId: project_id, nonce });
    
    res.json({
      success: true,
      auth_url: authUrl,
      nonce
    });
    
  } catch (error) {
    systemLogger.error('Error initiating Gmail OAuth2 flow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth2 flow'
    });
  }
});

// Outlook OAuth2 POST auth (initiates OAuth2 flow)
// Returns auth URL for frontend to open in popup
router.post('/oauth2/outlook/auth',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:create'],
    getProjectId: (req) => req.body.project_id
  }),
  async (req, res) => {
  try {
    const { project_id } = req.body;
    const userId = req.user?.id;
    
    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found'
      });
    }
    
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({
        success: false,
        error: 'Outlook OAuth2 not configured (missing OUTLOOK_CLIENT_ID)'
      });
    }
    
    // Generate cryptographically secure nonce
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Store state in cache with 10-minute expiry (one-time use)
    const { getCacheClient } = require('../utils/cache');
    const cache = getCacheClient();
    const stateKey = `oauth2_state:${nonce}`;
    const stateData = {
      project_id,
      user_id: userId,
      provider: 'outlook',
      timestamp: Date.now()
    };
    
    await cache.set(stateKey, JSON.stringify(stateData), 600); // 10 minutes
    
    const redirect_uri = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/email-connections/oauth2/outlook/callback`;
    
    const authUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      '&response_type=code' +
      '&scope=' + encodeURIComponent('https://graph.microsoft.com/Mail.Send offline_access') +
      `&state=${nonce}`;
    
    systemLogger.info('Outlook OAuth2 flow initiated', { userId, projectId: project_id, nonce });
    
    res.json({
      success: true,
      auth_url: authUrl,
      nonce
    });
    
  } catch (error) {
    systemLogger.error('Error initiating Outlook OAuth2 flow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth2 flow'
    });
  }
});

// Gmail OAuth2 GET callback (called by Google after user authorization)
// NOTE: Cannot use authorizeProjectResource middleware because Google redirects without Authorization headers
// Instead, validates state against cached server-side data with one-time use
router.get('/oauth2/gmail/callback', async (req, res) => {
    try {
      const { code, state: nonce, error } = req.query;
      
      if (error) {
        systemLogger.warn('Gmail OAuth2 authorization denied', { error });
        return res.redirect(`/oauth2-callback?success=false&error=${encodeURIComponent(error)}`);
      }
      
      if (!code || !nonce) {
        systemLogger.warn('Gmail OAuth2 callback missing parameters');
        return res.redirect('/oauth2-callback?success=false&error=Missing+code+or+state+parameter');
      }
      
      // Validate state nonce against cached server-side data
      const { getCacheClient } = require('../utils/cache');
      const cache = getCacheClient();
      const stateKey = `oauth2_state:${nonce}`;
      
      const cachedState = await cache.get(stateKey);
      if (!cachedState) {
        systemLogger.warn('Gmail OAuth2 state not found or expired', { nonce });
        return res.redirect('/oauth2-callback?success=false&error=OAuth+state+expired+or+invalid');
      }
      
      // Parse cached state
      let stateData;
      try {
        stateData = JSON.parse(cachedState);
      } catch (error) {
        systemLogger.error('Gmail OAuth2 invalid cached state', { error: error.message });
        return res.redirect('/oauth2-callback?success=false&error=Invalid+cached+state');
      }
      
      const { project_id, user_id, provider, timestamp } = stateData;
      
      // Verify provider matches
      if (provider !== 'gmail') {
        systemLogger.warn('Gmail OAuth2 provider mismatch', { expected: 'gmail', actual: provider });
        return res.redirect('/oauth2-callback?success=false&error=Provider+mismatch');
      }
      
      // Validate state timestamp (expire after 10 minutes)
      const stateAge = Date.now() - timestamp;
      if (stateAge > 600000) {
        systemLogger.warn('Gmail OAuth2 state expired', { age: stateAge });
        await cache.del(stateKey); // Clean up expired state
        return res.redirect('/oauth2-callback?success=false&error=OAuth+state+expired');
      }
      
      // Delete state immediately (one-time use, prevents replay attacks)
      await cache.del(stateKey);
      
      // Exchange code for tokens
      const axios = require('axios');
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const redirect_uri = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/email-connections/oauth2/gmail/callback`;
      
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri
      });
      
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Calculate token expiry
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
      
      // Create connection (state validation is our CSRF protection)
      const connection = await ConnectionService.createConnection({
        name: 'Gmail OAuth2 Connection',
        type: 'gmail_oauth2',
        description: 'OAuth2 connection created via authorization flow',
        project_id,
        config: {
          access_token,
          refresh_token,
          expires_at: expiresAt
        },
        connection_direction: 'outbound',
        status: 'active'
      });
      
      systemLogger.info('Gmail OAuth2 connection created', {
        connectionId: connection.connection_id,
        projectId: project_id,
        userId: user_id
      });
      
      res.redirect(`/oauth2-callback?success=true&connection_name=${encodeURIComponent(connection.name)}`);
      
    } catch (error) {
      systemLogger.error('Error handling Gmail OAuth2 callback', { error: error.message });
      res.redirect(`/oauth2-callback?success=false&error=${encodeURIComponent(error.response?.data?.error_description || error.message)}`);
    }
  });


// Outlook OAuth2 GET callback (called by Microsoft after user authorization)
// NOTE: Cannot use authorizeProjectResource middleware because Microsoft redirects without Authorization headers
// Instead, validates state against cached server-side data with one-time use
router.get('/oauth2/outlook/callback', async (req, res) => {
    try {
      const { code, state: nonce, error } = req.query;
      
      if (error) {
        systemLogger.warn('Outlook OAuth2 authorization denied', { error });
        return res.redirect(`/oauth2-callback?success=false&error=${encodeURIComponent(error)}`);
      }
      
      if (!code || !nonce) {
        systemLogger.warn('Outlook OAuth2 callback missing parameters');
        return res.redirect('/oauth2-callback?success=false&error=Missing+code+or+state+parameter');
      }
      
      // Validate state nonce against cached server-side data
      const { getCacheClient } = require('../utils/cache');
      const cache = getCacheClient();
      const stateKey = `oauth2_state:${nonce}`;
      
      const cachedState = await cache.get(stateKey);
      if (!cachedState) {
        systemLogger.warn('Outlook OAuth2 state not found or expired', { nonce });
        return res.redirect('/oauth2-callback?success=false&error=OAuth+state+expired+or+invalid');
      }
      
      // Parse cached state
      let stateData;
      try {
        stateData = JSON.parse(cachedState);
      } catch (error) {
        systemLogger.error('Outlook OAuth2 invalid cached state', { error: error.message });
        return res.redirect('/oauth2-callback?success=false&error=Invalid+cached+state');
      }
      
      const { project_id, user_id, provider, timestamp } = stateData;
      
      // Verify provider matches
      if (provider !== 'outlook') {
        systemLogger.warn('Outlook OAuth2 provider mismatch', { expected: 'outlook', actual: provider });
        return res.redirect('/oauth2-callback?success=false&error=Provider+mismatch');
      }
      
      // Validate state timestamp (expire after 10 minutes)
      const stateAge = Date.now() - timestamp;
      if (stateAge > 600000) {
        systemLogger.warn('Outlook OAuth2 state expired', { age: stateAge });
        await cache.del(stateKey); // Clean up expired state
        return res.redirect('/oauth2-callback?success=false&error=OAuth+state+expired');
      }
      
      // Delete state immediately (one-time use, prevents replay attacks)
      await cache.del(stateKey);
      
      // Exchange code for tokens
      const axios = require('axios');
      const clientId = process.env.OUTLOOK_CLIENT_ID;
      const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
      const redirect_uri = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/email-connections/oauth2/outlook/callback`;
      
      const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri
      });
      
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Calculate token expiry
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
      
      // Create connection (state validation is our CSRF protection)
      const connection = await ConnectionService.createConnection({
        name: 'Outlook OAuth2 Connection',
        type: 'outlook_oauth2',
        description: 'OAuth2 connection created via authorization flow',
        project_id,
        config: {
          access_token,
          refresh_token,
          expires_at: expiresAt
        },
        connection_direction: 'outbound',
        status: 'active'
      });
      
      systemLogger.info('Outlook OAuth2 connection created', {
        connectionId: connection.connection_id,
        projectId: project_id,
        userId: user_id
      });
      
      res.redirect(`/oauth2-callback?success=true&connection_name=${encodeURIComponent(connection.name)}`);
      
    } catch (error) {
      systemLogger.error('Error handling Outlook OAuth2 callback', { error: error.message });
      res.redirect(`/oauth2-callback?success=false&error=${encodeURIComponent(error.response?.data?.error_description || error.message)}`);
    }
  });

// OAuth2 callback handler (exchange code for tokens)
// REQUIRES AUTHENTICATION - user must be logged in to complete OAuth flow
router.post('/oauth2/callback',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:create'],
    getProjectId: async (req) => {
      // Extract project_id from state parameter
      try {
        const { state } = req.body;
        if (!state) return null;
        
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        return stateData.project_id;
      } catch (error) {
        return null;
      }
    }
  }),
  async (req, res) => {
  try {
    const { provider, code, state, redirect_uri, name } = req.body;
    
    if (!provider || !code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Provider, code, and state are required'
      });
    }
    
    // Decode and validate state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }
    
    const { project_id, timestamp } = stateData;
    
    // Validate state timestamp (expire after 10 minutes)
    const stateAge = Date.now() - timestamp;
    if (stateAge > 600000) {
      return res.status(400).json({
        success: false,
        error: 'OAuth state expired. Please restart the authorization flow.'
      });
    }
    
    // Verify user has access to the project
    if (req.projectId && req.projectId !== project_id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project'
      });
    }
    
    // Exchange code for tokens
    const axios = require('axios');
    let tokenResponse;
    
    if (provider === 'gmail') {
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      
      tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri
      });
      
    } else if (provider === 'outlook') {
      const clientId = process.env.OUTLOOK_CLIENT_ID;
      const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
      
      tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri
      });
      
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider'
      });
    }
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Calculate token expiry
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    
    // Create connection
    const connection = await ConnectionService.createConnection({
      name: name || `${provider === 'gmail' ? 'Gmail' : 'Outlook'} OAuth2 Connection`,
      type: provider === 'gmail' ? 'gmail_oauth2' : 'outlook_oauth2',
      description: `OAuth2 connection created via authorization flow`,
      project_id,
      config: {
        access_token,
        refresh_token,
        expires_at: expiresAt
      },
      connection_direction: 'outbound',
      status: 'active'
    });
    
    systemLogger.info('OAuth2 email connection created', {
      connectionId: connection.connection_id,
      provider,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      connection
    });
    
  } catch (error) {
    systemLogger.error('Error handling OAuth2 callback', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to complete OAuth2 flow',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
