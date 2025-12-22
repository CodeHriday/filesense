const express = require('express');
const router = express.Router();
const { pool, query } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const BulkProfilingService = require('../services/BulkProfilingService');

/**
 * @route   GET /api/vendor-access/projects
 * @desc    Get projects accessible to the logged-in vendor user
 * @access  Vendor users only
 */
router.get('/projects', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Get vendor profile
    const vendorResult = await query(
      'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
      [userId, 'active']
    );
    
    if (vendorResult.rows.length === 0) {
      return res.status(403).json({ 
        error: 'Vendor access required',
        message: 'You are not registered as a vendor user'
      });
    }
    
    const vendorId = vendorResult.rows[0].id;
    
    // Get user details to check primary/secondary contact
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = userResult.rows[0].email;
    
    // Get projects from vendor agreements where user is primary or secondary contact
    const projectsResult = await query(`
      SELECT DISTINCT 
        p.id,
        p.name,
        p.description,
        p.project_type
      FROM vendor_agreements va
      JOIN projects p ON va.project_id = p.id
      WHERE va.vendor_id = $1
        AND va.approval_status = 'fully_approved'
        AND va.is_locked = true
        AND va.status = 'active'
        AND (
          va.primary_contact_email = $2 
          OR va.secondary_contact_email = $2
        )
      ORDER BY p.name
    `, [vendorId, userEmail]);
    
    res.json({
      success: true,
      projects: projectsResult.rows
    });
    
  } catch (error) {
    systemLogger.error('Error fetching vendor projects', { 
      userId: req.user?.id, 
      error: error.message 
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/vendor-access/connections
 * @desc    Get connections accessible to the vendor for a specific project
 * @access  Vendor users only
 */
router.get('/connections', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    
    // Get vendor profile
    const vendorResult = await query(
      'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
      [userId, 'active']
    );
    
    if (vendorResult.rows.length === 0) {
      return res.status(403).json({ 
        error: 'Vendor access required',
        message: 'You are not registered as a vendor user'
      });
    }
    
    const vendorId = vendorResult.rows[0].id;
    
    // Get user email
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = userResult.rows[0].email;
    
    // Get connections from vendor agreements
    const connectionsResult = await query(`
      SELECT DISTINCT 
        sc.connection_id,
        sc.name,
        sc.type,
        sc.description,
        sc.path,
        sc.config,
        va.drop_location_path,
        va.id as agreement_id,
        va.agreement_code,
        va.file_name as agreement_file_name
      FROM vendor_agreements va
      JOIN storage_connections sc ON va.vendor_connection_id = sc.connection_id
      WHERE va.vendor_id = $1
        AND va.project_id = $2
        AND va.approval_status = 'fully_approved'
        AND va.is_locked = true
        AND va.status = 'active'
        AND (
          va.primary_contact_email = $3 
          OR va.secondary_contact_email = $3
        )
        AND sc.status = 'active'
      ORDER BY sc.name
    `, [vendorId, projectId, userEmail]);
    
    // Sanitize config to remove sensitive information
    const sanitizedConnections = connectionsResult.rows.map(conn => {
      const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
      
      return {
        connection_id: conn.connection_id,
        name: conn.name,
        type: conn.type,
        description: conn.description,
        path: conn.path,
        drop_location_path: conn.drop_location_path,
        agreement_id: conn.agreement_id,
        agreement_code: conn.agreement_code,
        agreement_file_name: conn.agreement_file_name,
        // Connection details (without credentials)
        region: config.region,
        bucket: config.bucket || config.bucket_name,
        container_name: config.container_name,
        account_name: config.account_name,
        gcp_bucket: config.gcp_bucket
      };
    });
    
    res.json({
      success: true,
      connections: sanitizedConnections
    });
    
  } catch (error) {
    systemLogger.error('Error fetching vendor connections', { 
      userId: req.user?.id, 
      error: error.message 
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/vendor-access/browse
 * @desc    Browse S3 folders for a vendor agreement
 * @access  Vendor users only (authorized for specific agreement)
 */
router.post('/browse', async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    const { agreementId, s3Path } = req.body;
    
    if (!agreementId) {
      return res.status(400).json({ 
        success: false,
        message: 'agreementId is required' 
      });
    }
    
    // Get vendor profile
    const vendorResult = await query(
      'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
      [userId, 'active']
    );
    
    if (vendorResult.rows.length === 0) {
      return res.status(403).json({ 
        success: false,
        message: 'Vendor access required'
      });
    }
    
    const vendorId = vendorResult.rows[0].id;
    
    // Get user email
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    const userEmail = userResult.rows[0].email;
    
    // Get vendor agreement and verify authorization
    const agreementResult = await query(`
      SELECT 
        va.id,
        va.vendor_connection_id,
        va.drop_location_path
      FROM vendor_agreements va
      WHERE va.id = $1
        AND va.vendor_id = $2
        AND va.approval_status = 'fully_approved'
        AND va.is_locked = true
        AND va.status = 'active'
        AND (
          va.primary_contact_email = $3 
          OR va.secondary_contact_email = $3
        )
    `, [agreementId, vendorId, userEmail]);
    
    if (agreementResult.rows.length === 0) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied to this agreement'
      });
    }
    
    const agreement = agreementResult.rows[0];
    
    if (!agreement.vendor_connection_id) {
      return res.status(400).json({ 
        success: false,
        message: 'No connection configured for this agreement'
      });
    }
    
    // Browse the S3 path using the vendor connection
    const contents = await BulkProfilingService.browseS3Path(
      agreement.vendor_connection_id,
      s3Path || agreement.drop_location_path || ''
    );
    
    res.json({
      success: true,
      ...contents
    });
    
  } catch (error) {
    systemLogger.error('Error browsing vendor S3 path', { 
      userId: req.user?.id, 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
