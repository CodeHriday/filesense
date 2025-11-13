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

// Get all email connections (filtered by user's accessible projects)
router.get('/', async (req, res) => {
  try {
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        return res.json({
          success: true,
          connections: []
        });
      }
    }
    
    let query = `
      SELECT 
        connection_id,
        type,
        name,
        status,
        created_at,
        updated_at,
        project_id,
        description
      FROM storage_connections
      WHERE type IN ('smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email')
    `;
    
    if (!isAdmin && projectIds.length > 0) {
      query += ` AND project_id = ANY($1)`;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    const result = await pool.query(query, params);
    
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
router.get('/:connectionId',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:read']
  }),
  async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    const connection = await ConnectionService.getConnection(connectionId);
    
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
router.post('/',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:create']
  }),
  async (req, res) => {
  try {
    const {
      name,
      type,
      description,
      project_id,
      config
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Connection name is required'
      });
    }
    
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Connection type is required'
      });
    }
    
    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }
    
    // Validate email provider type
    const emailTypes = ['smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email'];
    if (!emailTypes.includes(type)) {
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
    const connection = await ConnectionService.createConnection({
      name,
      type,
      description: description || null,
      project_id,
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
router.put('/:connectionId',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:update']
  }),
  async (req, res) => {
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
router.delete('/:connectionId',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:delete']
  }),
  async (req, res) => {
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
router.post('/:connectionId/test',
  authorizeProjectResource({
    resourceType: 'connection',
    requiredPermissions: ['connection:update']
  }),
  async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { to_email } = req.body;
    
    if (!to_email) {
      return res.status(400).json({
        success: false,
        error: 'Recipient email (to_email) is required for testing'
      });
    }
    
    const connection = await ConnectionService.getConnection(connectionId);
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Email connection not found'
      });
    }
    
    // Import NotificationService to test the connection
    const NotificationService = require('../services/NotificationService');
    
    try {
      const result = await NotificationService.sendEmailAlert({
        to: [to_email],
        subject: 'Test Email from Data File Observatory',
        html: '<p>This is a test email to verify your email connection is working correctly.</p>',
        text: 'This is a test email to verify your email connection is working correctly.',
        connectionId: connection.connection_id
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
