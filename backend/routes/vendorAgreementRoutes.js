/**
 * Vendor Agreement Routes
 * Routes for managing vendor agreements with dual approval workflow
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const vendorAgreementService = require('../services/vendorAgreementService');
const vendorService = require('../services/vendorService');
const { systemLogger } = require('../utils/logger');

// Configure multer for schema file uploads
const upload = multer({
  dest: 'uploads/schemas/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls), CSV (.csv), and JSON (.json) files are allowed'));
    }
  }
});

// Middleware to check admin access
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.roles || !req.user.roles.includes('Admin')) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

// Middleware to check if user is vendor or owner
const checkAgreementAccess = async (req, res, next) => {
  try {
    const agreementId = parseInt(req.params.id || req.body.agreement_id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    const result = await vendorAgreementService.getAgreementById(agreementId);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    const agreement = result.agreement;
    
    // Admin has access to everything
    if (req.user.roles && req.user.roles.includes('Admin')) {
      req.agreement = agreement;
      req.isAdmin = true;
      return next();
    }
    
    // Check if user is the vendor user
    if (agreement.vendor_user_id === req.user.id) {
      req.agreement = agreement;
      req.isVendor = true;
      return next();
    }
    
    // Check if user is the file owner
    if (agreement.file_owner_user_id === req.user.id) {
      req.agreement = agreement;
      req.isOwner = true;
      return next();
    }
    
    return res.status(403).json({ error: 'Access denied' });
    
  } catch (error) {
    systemLogger.error('Error checking agreement access', { error: error.message });
    return res.status(500).json({ error: 'Failed to verify access' });
  }
};

/**
 * POST /api/vendor-agreements
 * Create new vendor agreement (Admin only)
 */
router.post('/', requireAdmin, upload.single('schemaFile'), async (req, res) => {
  let schemaFilePath = null;
  
  try {
    const agreementData = JSON.parse(req.body.agreementData || '{}');
    
    // If schema file is uploaded, use it
    if (req.file) {
      schemaFilePath = req.file.path;
      const fileType = path.extname(req.file.originalname).substring(1);
      
      const result = await vendorAgreementService.createAgreement(
        agreementData,
        req.user.id,
        schemaFilePath,
        fileType
      );
      
      res.status(201).json(result);
    } else {
      // Use schema from body
      const result = await vendorAgreementService.createAgreement(
        agreementData,
        req.user.id
      );
      
      res.status(201).json(result);
    }
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements', { error: error.message });
    res.status(400).json({ error: error.message });
  } finally {
    // Clean up uploaded file
    if (schemaFilePath && fs.existsSync(schemaFilePath)) {
      fs.unlinkSync(schemaFilePath);
    }
  }
});

/**
 * GET /api/vendor-agreements/:id
 * Get agreement by ID
 */
router.get('/:id', checkAgreementAccess, async (req, res) => {
  try {
    res.json({
      success: true,
      agreement: req.agreement,
      userRole: req.isAdmin ? 'admin' : (req.isVendor ? 'vendor' : 'owner')
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/:id', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch agreement' });
  }
});

/**
 * PUT /api/vendor-agreements/:id
 * Update agreement (Admin only, can modify locked agreements)
 */
router.put('/:id', requireAdmin, upload.single('schemaFile'), async (req, res) => {
  let schemaFilePath = null;
  
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    const updateData = JSON.parse(req.body.updateData || '{}');
    
    // If schema file is uploaded, use it
    if (req.file) {
      schemaFilePath = req.file.path;
      const fileType = path.extname(req.file.originalname).substring(1);
      
      const result = await vendorAgreementService.updateAgreement(
        agreementId,
        updateData,
        req.user.id,
        true, // isAdmin
        schemaFilePath,
        fileType
      );
      
      res.json(result);
    } else {
      const result = await vendorAgreementService.updateAgreement(
        agreementId,
        updateData,
        req.user.id,
        true // isAdmin
      );
      
      res.json(result);
    }
    
  } catch (error) {
    systemLogger.error('Error in PUT /api/vendor-agreements/:id', { error: error.message });
    res.status(400).json({ error: error.message });
  } finally {
    // Clean up uploaded file
    if (schemaFilePath && fs.existsSync(schemaFilePath)) {
      fs.unlinkSync(schemaFilePath);
    }
  }
});

/**
 * POST /api/vendor-agreements/:id/approve
 * Approve agreement (Vendor or Owner)
 */
router.post('/:id/approve', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { comments } = req.body;
    
    // Determine approver type
    let approverType;
    if (req.isVendor) {
      approverType = 'vendor';
    } else if (req.isOwner) {
      approverType = 'owner';
    } else {
      return res.status(403).json({ error: 'Only vendor or owner can approve' });
    }
    
    const result = await vendorAgreementService.approveAgreement(
      agreementId,
      req.user.id,
      approverType,
      comments,
      req.ip,
      req.get('User-Agent')
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/approve', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-agreements/:id/reject
 * Reject agreement (Vendor or Owner)
 */
router.post('/:id/reject', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { comments } = req.body;
    
    if (!comments) {
      return res.status(400).json({ error: 'Comments are required for rejection' });
    }
    
    // Determine approver type
    let approverType;
    if (req.isVendor) {
      approverType = 'vendor';
    } else if (req.isOwner) {
      approverType = 'owner';
    } else {
      return res.status(403).json({ error: 'Only vendor or owner can reject' });
    }
    
    const result = await vendorAgreementService.rejectAgreement(
      agreementId,
      req.user.id,
      approverType,
      comments,
      req.ip,
      req.get('User-Agent')
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/reject', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/vendor-agreements/:id/approvals
 * Get approval history for an agreement
 */
router.get('/:id/approvals', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    const result = await vendorAgreementService.getApprovalHistory(agreementId);
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/:id/approvals', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

/**
 * GET /api/vendor-agreements/:id/changes
 * Get change history for an agreement
 */
router.get('/:id/changes', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    const result = await vendorAgreementService.getChangeHistory(agreementId);
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/:id/changes', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch change history' });
  }
});

/**
 * GET /api/vendor-agreements/vendor/:vendorId
 * Get all agreements for a vendor
 */
router.get('/vendor/:vendorId', async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    // Authorization check - only admin or the vendor user can access
    const vendorResult = await vendorService.getVendorById(vendorId);
    if (!vendorResult.success) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    const isAdmin = req.user.roles && req.user.roles.includes('Admin');
    const isVendorUser = vendorResult.vendor.vendor_user_id === req.user.id;
    
    if (!isAdmin && !isVendorUser) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    
    const result = await vendorAgreementService.getAgreementsByVendor(vendorId, page, pageSize);
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/vendor/:vendorId', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch agreements' });
  }
});

/**
 * GET /api/vendor-agreements/approved
 * Get all fully approved agreements (for use in mappings)
 */
router.get('/approved', async (req, res) => {
  try {
    const projectId = req.query.project_id ? parseInt(req.query.project_id) : null;
    
    const result = await vendorAgreementService.getApprovedAgreements(projectId);
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/approved', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch approved agreements' });
  }
});

module.exports = router;
