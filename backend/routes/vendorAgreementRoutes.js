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
const AgreementTemplateUtils = require('../utils/agreementTemplateUtils');
const { systemLogger } = require('../utils/logger');
const { requirePermission, checkPermission, hasPermission } = require('../middleware/vendorPermissions');
const PasswordVaultService = require('../services/passwordVaultService');
const AuditService = require('../services/AuditService');
const { userHasAdminAccess } = require('../utils/permissionHelpers');
const { query: dbQuery } = require('../config/database');

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'File too large. Maximum file size is 10 KB for approval documents.' 
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files. Maximum 5 documents allowed per submission.' 
      });
    }
    return res.status(400).json({ error: err.message });
  }
  
  if (err && err.message) {
    // Custom file filter errors
    return res.status(400).json({ error: err.message });
  }
  
  next(err);
};

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

// Configure multer for template file uploads
const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for templates
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

// Configure multer for approval document uploads (compressed formats preferred, 10 KB limit)
const approvalDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 // 10 KB limit for efficient storage
  },
  fileFilter: (req, file, cb) => {
    // Accept compressed formats and PDFs
    const allowedExtensions = ['.zip', '.gz', '.7z', '.pdf', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only compressed formats (.zip, .gz, .7z) and small documents (.pdf, .txt) under 10 KB are allowed'));
    }
  }
});

// Note: Admin access is now managed through permissions (vendor_agreements:write, vendor_agreements:approve)
// instead of hard-coded role checks. See vendorPermissions.js middleware for permission-based access control.

// Middleware to check if user is vendor or owner
// Also checks for vendor_agreements:approve permission
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
    
    // Check if user has vendor_agreements:approve permission
    // This allows access regardless of relationship to the agreement
    if (hasPermission(req.user, 'vendor_agreements:approve')) {
      req.agreement = agreement;
      req.hasApprovePermission = true;
      // Note: Do NOT set req.isAdmin here - permission holders are NOT admins
      return next();
    }
    
    // Check if user has vendor_agreements:read permission
    // This allows viewing but not necessarily approving
    if (hasPermission(req.user, 'vendor_agreements:read')) {
      req.agreement = agreement;
      req.hasReadPermission = true;
    }
    
    // Admin-level access has access to everything (uses permission-based check)
    if (userHasAdminAccess(req.user)) {
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
    
    // Check if user is the primary or secondary contact (by email)
    if (req.user.email) {
      if (agreement.primary_contact_email === req.user.email) {
        req.agreement = agreement;
        req.isVendor = true; // Treat primary contact as vendor role
        return next();
      }
      
      if (agreement.secondary_contact_email === req.user.email) {
        req.agreement = agreement;
        req.isVendor = true; // Treat secondary contact as vendor role
        return next();
      }
    }
    
    // If user has read permission set earlier, allow access for viewing
    if (req.hasReadPermission) {
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
 * Create new vendor agreement (Requires vendor_agreements:write permission)
 */
router.post('/', requirePermission('vendor_agreements:write'), upload.single('schemaFile'), async (req, res) => {
  let schemaFilePath = null;
  
  try {
    const agreementData = JSON.parse(req.body.agreementData || '{}');
    
    // Validate file configurations are required for non-draft contracts
    if (agreementData.status !== 'draft') {
      const fileConfigCount = parseInt(agreementData.file_configurations_count) || 0;
      if (fileConfigCount === 0) {
        return res.status(400).json({ 
          error: 'At least one file configuration is required for creating a vendor contract. Please add file configurations before creating the contract.' 
        });
      }
    }
    
    // Remove file_configurations_count from agreementData as it's only for validation
    delete agreementData.file_configurations_count;
    
    // If schema file is uploaded, use it
    if (req.file) {
      schemaFilePath = req.file.path;
      const fileType = path.extname(req.file.originalname).substring(1);
      
      const result = await vendorAgreementService.createAgreement(
        agreementData,
        req.user.id,
        schemaFilePath,
        fileType,
        req.user // Pass full user object for validation and auto-population
      );
      
      res.status(201).json(result);
    } else {
      // Use schema from body
      const result = await vendorAgreementService.createAgreement(
        agreementData,
        req.user.id,
        null,
        null,
        req.user // Pass full user object for validation and auto-population
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
 * GET /api/vendor-agreements
 * List all vendor agreements with optional filtering and pagination
 * For vendor users, only shows agreements where they are a contact (unless they have approve permission)
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const projectId = req.query.project_id ? parseInt(req.query.project_id) : null;
    let vendorId = req.query.vendor_id ? parseInt(req.query.vendor_id) : null;
    const status = req.query.status || null;
    const filterByMyVendor = req.query.filterByMyVendor === 'true';
    
    // If filterByMyVendor is true, get the user's vendor ID and use it for filtering
    // This ensures vendor users only see agreements for their own vendor organization
    if (filterByMyVendor && !vendorId) {
      const vendorResult = await dbQuery(
        'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
        [req.user.id, 'active']
      );
      if (vendorResult.rows.length > 0) {
        vendorId = vendorResult.rows[0].id;
        systemLogger.info('Filtering agreements by user vendor', { 
          userId: req.user.id, 
          vendorId 
        });
      }
    }
    
    // Only users with approve permission can see ALL agreements (bypassing contact filtering)
    // Regular vendor users with just read permission still get filtered by their contact emails
    const hasApprovePermission = hasPermission(req.user, 'vendor_agreements:approve');
    
    // DEBUG: Log permission check for troubleshooting
    systemLogger.info('Vendor agreements permission check', {
      username: req.user.username,
      userId: req.user.id,
      roles: req.user.roles,
      hasApprovePermission,
      permissionsCount: req.user.permissions?.length || 0,
      permissions: req.user.permissions?.map(p => typeof p === 'string' ? p : (p.name || `${p.resource}:${p.action}`))
    });
    
    const result = await vendorAgreementService.getAllAgreements({
      page,
      pageSize,
      projectId,
      vendorId,
      status,
      userId: req.user.id,
      userRoles: req.user.roles,
      userEmail: req.user.email,
      hasApprovePermission
    });
    
    // Include hasApprovePermission flag in response so frontend can filter agreements for mapping wizard
    res.json({
      ...result,
      hasApprovePermission
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch agreements' });
  }
});

/**
 * GET /stakeholder-options
 * Get list of internal users and access groups that can be added as stakeholders
 * NOTE: This route MUST be defined before /:id routes to avoid path conflict
 */
router.get('/stakeholder-options', requirePermission('vendor_agreements:read'), async (req, res) => {
  try {
    // Get internal users only (security: no external users can be added)
    const usersResult = await dbQuery(`
      SELECT 
        u.id,
        u.username,
        u.email,
        TRIM(CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name)) AS full_name
      FROM users u
      WHERE u.internal_user = true
      ORDER BY u.first_name, u.last_name, u.username
    `);
    
    // Get access groups
    const groupsResult = await dbQuery(`
      SELECT 
        ag.id,
        ag.name,
        ag.description,
        ag.group_type,
        (
          SELECT COUNT(*)::int 
          FROM user_groups ug 
          WHERE ug.group_id = ag.id
        ) as member_count
      FROM access_groups ag
      ORDER BY ag.name
    `);
    
    res.json({
      success: true,
      users: usersResult.rows.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.full_name || u.username || u.email
      })),
      groups: groupsResult.rows.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        groupType: g.group_type,
        memberCount: g.member_count
      }))
    });
    
  } catch (error) {
    systemLogger.error('Error fetching stakeholder options', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to fetch stakeholder options',
      details: error.message
    });
  }
});

/**
 * GET /api/vendor-agreements/init-data
 * Batch endpoint to get all data needed for the VendorAgreements page in a single call
 * Replaces 5 separate API calls: vendor-connections, connections, vendors, vendor-agreements, users
 * Permission-aware: Mirrors the exact permission model of original individual endpoints
 */
router.get('/init-data', async (req, res) => {
  try {
    const hasApprovePermission = hasPermission(req.user, 'vendor_agreements:approve');
    const hasWritePermission = hasPermission(req.user, 'vendor_agreements:write');
    const isAdminUser = userHasAdminAccess(req.user);
    
    let vendorConnections = [];
    let allConnections = [];
    let vendors = [];
    
    if (isAdminUser) {
      try {
        const connResult = await dbQuery(`
          SELECT vc.id, vc.connection_name, vc.vendor_id, vc.connection_type, 
                 vc.storage_type, vc.bucket_name, vc.container_name, vc.base_path, 
                 vc.status, vc.created_at, v.vendor_name
          FROM vendor_connections vc
          LEFT JOIN vendors v ON vc.vendor_id = v.id
          WHERE vc.status = 'active'
          ORDER BY vc.connection_name
        `);
        vendorConnections = connResult.rows;
      } catch (err) {
        systemLogger.warn('Could not fetch vendor connections', { error: err.message });
      }
      
      try {
        const vendorsResult = await dbQuery(`
          SELECT id, vendor_name, vendor_code, status, vendor_type
          FROM vendors
          WHERE status = 'active'
          ORDER BY vendor_name
        `);
        vendors = vendorsResult.rows;
      } catch (err) {
        systemLogger.warn('Could not fetch vendors', { error: err.message });
      }
    } else {
      const vendorResult = await dbQuery(`
        SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = 'active'
      `, [req.user.id]);
      
      if (vendorResult.rows.length > 0) {
        const userVendorId = vendorResult.rows[0].id;
        try {
          const vendorsResult = await dbQuery(`
            SELECT id, vendor_name, vendor_code, status, vendor_type
            FROM vendors
            WHERE id = $1 AND status = 'active'
          `, [userVendorId]);
          vendors = vendorsResult.rows;
        } catch (err) {
          systemLogger.warn('Could not fetch user vendor', { error: err.message });
        }
      }
    }
    
    try {
      const allConnResult = await dbQuery(`
        SELECT id, connection_name as name, connection_type, created_at
        FROM connections
        ORDER BY connection_name
      `);
      allConnections = allConnResult.rows;
    } catch (err) {
      systemLogger.warn('Could not fetch all connections', { error: err.message });
    }
    
    const agreementsResult = await vendorAgreementService.getAllAgreements({
      page: 1,
      pageSize: 10000,
      userId: req.user.id,
      userRoles: req.user.roles,
      userEmail: req.user.email,
      hasApprovePermission
    });
    
    let usersResult = { rows: [] };
    if (isAdminUser || hasWritePermission) {
      usersResult = await dbQuery(`
        SELECT u.id, u.username, u.email, u.first_name, u.last_name,
               COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        GROUP BY u.id, u.username, u.email, u.first_name, u.last_name
        ORDER BY u.first_name, u.last_name
        LIMIT 1000
      `);
    }
    
    res.json({
      success: true,
      vendorConnections,
      allConnections,
      vendors,
      agreements: agreementsResult.agreements || [],
      users: usersResult.rows,
      hasApprovePermission
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/init-data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch init data' });
  }
});

/**
 * GET /api/vendor-agreements/:id/full
 * Batch endpoint to get agreement with approvals and changes in a single call
 * Replaces 3 separate API calls: agreement, approvals, changes
 */
router.get('/:id/full', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    
    const approvalsResult = await dbQuery(`
      SELECT 
        va.id,
        va.agreement_id,
        va.stage,
        va.action,
        va.comments,
        va.approved_by,
        va.approved_at,
        u.username as approved_by_username,
        u.email as approved_by_email
      FROM vendor_agreement_approvals va
      LEFT JOIN users u ON va.approved_by = u.id
      WHERE va.agreement_id = $1
      ORDER BY va.approved_at DESC
    `, [agreementId]);
    
    const changesResult = await dbQuery(`
      SELECT 
        vc.id,
        vc.agreement_id,
        vc.field_name,
        vc.old_value,
        vc.new_value,
        vc.changed_by,
        vc.changed_at,
        u.username as changed_by_username
      FROM vendor_agreement_changes vc
      LEFT JOIN users u ON vc.changed_by = u.id
      WHERE vc.agreement_id = $1
      ORDER BY vc.changed_at DESC
      LIMIT 100
    `, [agreementId]);
    
    res.json({
      success: true,
      agreement: req.agreement,
      approvals: approvalsResult.rows,
      changes: changesResult.rows,
      userRole: req.isAdmin ? 'admin' : (req.isVendor ? 'vendor' : 'owner')
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/:id/full', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch full agreement data' });
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
 * Update agreement (Requires vendor_agreements:write permission, can modify locked agreements)
 */
router.put('/:id', requirePermission('vendor_agreements:write'), upload.single('schemaFile'), async (req, res) => {
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
 * Approve agreement (Vendor, Owner, or users with vendor_agreements:approve permission)
 */
router.post('/:id/approve', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { comments, approver_type } = req.body;
    
    // Check if user has approval permission OR is vendor/owner
    if (!req.hasApprovePermission && !req.isAdmin && !req.isVendor && !req.isOwner) {
      return res.status(403).json({ error: 'Access denied. Requires vendor_agreements:approve permission or must be vendor/owner' });
    }
    
    // Determine approver type
    let approverType;
    
    if (req.isAdmin || req.hasApprovePermission) {
      // Admins and users with approve permission must specify which type of approval (vendor or owner)
      if (!approver_type || !['vendor', 'owner'].includes(approver_type)) {
        return res.status(400).json({ error: 'Users with approval permission must specify approver_type (vendor or owner)' });
      }
      approverType = approver_type;
    } else if (req.isVendor) {
      approverType = 'vendor';
    } else if (req.isOwner) {
      approverType = 'owner';
    } else {
      return res.status(403).json({ error: 'Only vendor, owner, or users with approval permission can approve' });
    }
    
    const result = await vendorAgreementService.approveAgreement(
      agreementId,
      req.user.id,
      approverType,
      comments,
      req.ip,
      req.get('User-Agent'),
      req.isAdmin || false
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/approve', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-agreements/:id/reject
 * Reject agreement (Vendor, Owner, or users with vendor_agreements:approve permission)
 */
router.post('/:id/reject', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { comments, approver_type } = req.body;
    
    // Check if user has approval permission OR is vendor/owner
    if (!req.hasApprovePermission && !req.isAdmin && !req.isVendor && !req.isOwner) {
      return res.status(403).json({ error: 'Access denied. Requires vendor_agreements:approve permission or must be vendor/owner' });
    }
    
    if (!comments) {
      return res.status(400).json({ error: 'Comments are required for rejection' });
    }
    
    // Determine approver type
    let approverType;
    
    if (req.isAdmin || req.hasApprovePermission) {
      // Admins and users with approve permission must specify which type of rejection (vendor or owner)
      if (!approver_type || !['vendor', 'owner'].includes(approver_type)) {
        return res.status(400).json({ error: 'Users with approval permission must specify approver_type (vendor or owner)' });
      }
      approverType = approver_type;
    } else if (req.isVendor) {
      approverType = 'vendor';
    } else if (req.isOwner) {
      approverType = 'owner';
    } else {
      return res.status(403).json({ error: 'Only vendor, owner, or users with approval permission can reject' });
    }
    
    const result = await vendorAgreementService.rejectAgreement(
      agreementId,
      req.user.id,
      approverType,
      comments,
      req.ip,
      req.get('User-Agent'),
      req.isAdmin || false
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/reject', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * Three-Stage Approval Workflow Routes
 */

/**
 * POST /api/vendor-agreements/:id/vendor-action
 * Vendor User accepts or rejects agreement (Stage 1)
 */
router.post('/:id/vendor-action', checkAgreementAccess, approvalDocUpload.array('documents', 5), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { action, comments } = req.body;
    
    // Check if user is vendor or admin
    if (!req.isVendor && !req.isAdmin && !req.hasApprovePermission) {
      return res.status(403).json({ error: 'Only vendor contacts can accept/reject agreements' });
    }
    
    // Process uploaded documents
    const documents = (req.files || []).map(file => ({
      name: file.originalname,
      path: file.buffer.toString('base64'),
      type: 'approval_document',
      mimeType: file.mimetype,
      size: file.size,
      description: null
    }));
    
    const result = await vendorAgreementService.vendorAcceptReject(
      agreementId,
      req.user.id,
      action,
      comments,
      documents,
      req.ip,
      req.get('User-Agent'),
      req.isAdmin || req.hasApprovePermission || false
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/vendor-action', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-agreements/:id/manager-action
 * Vendor Manager approves or rejects agreement (Stage 2)
 */
router.post('/:id/manager-action', checkAgreementAccess, approvalDocUpload.array('documents', 5), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { action, comments } = req.body;
    
    // Check if user is owner (manager) or admin
    if (!req.isOwner && !req.isAdmin && !req.hasApprovePermission) {
      return res.status(403).json({ error: 'Only vendor manager can approve/reject at this stage' });
    }
    
    // Process uploaded documents
    const documents = (req.files || []).map(file => ({
      name: file.originalname,
      path: file.buffer.toString('base64'),
      type: 'approval_document',
      mimeType: file.mimetype,
      size: file.size,
      description: null
    }));
    
    const result = await vendorAgreementService.managerApproveReject(
      agreementId,
      req.user.id,
      action,
      comments,
      documents,
      req.ip,
      req.get('User-Agent'),
      req.isAdmin || req.hasApprovePermission || false
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/manager-action', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-agreements/:id/manager-handle-rejection
 * Vendor Manager handles vendor rejection (send back to vendor or override)
 */
router.post('/:id/manager-handle-rejection', checkAgreementAccess, approvalDocUpload.array('documents', 5), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { action, comments } = req.body;
    
    // Check if user is owner (manager) or admin
    if (!req.isOwner && !req.isAdmin && !req.hasApprovePermission) {
      return res.status(403).json({ error: 'Only vendor manager can handle vendor rejection' });
    }
    
    // Process uploaded documents
    const documents = (req.files || []).map(file => ({
      name: file.originalname,
      path: file.buffer.toString('base64'),
      type: 'approval_document',
      mimeType: file.mimetype,
      size: file.size,
      description: null
    }));
    
    const result = await vendorAgreementService.managerHandleVendorRejection(
      agreementId,
      req.user.id,
      action,
      comments,
      documents,
      req.ip,
      req.get('User-Agent'),
      req.isAdmin || req.hasApprovePermission || false
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/manager-handle-rejection', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-agreements/:id/manager-handle-governance-rejection
 * Vendor Manager handles governance rejection (revise & resubmit or close)
 */
router.post('/:id/manager-handle-governance-rejection', checkAgreementAccess, approvalDocUpload.array('documents', 5), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { action, comments } = req.body;
    
    // Check if user is owner (manager) or admin
    if (!req.isOwner && !req.isAdmin && !req.hasApprovePermission) {
      return res.status(403).json({ error: 'Only vendor manager can handle governance rejection' });
    }
    
    // Process uploaded documents
    const documents = (req.files || []).map(file => ({
      name: file.originalname,
      path: file.buffer.toString('base64'),
      type: 'approval_document',
      mimeType: file.mimetype,
      size: file.size,
      description: null
    }));
    
    const result = await vendorAgreementService.managerHandleGovernanceRejection(
      agreementId,
      req.user.id,
      action,
      comments,
      documents,
      req.agreement
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/manager-handle-governance-rejection', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-agreements/:id/governance-action
 * Governance Manager approves or rejects agreement (Stage 3 - Final)
 */
router.post('/:id/governance-action', checkAgreementAccess, approvalDocUpload.array('documents', 5), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { action, comments } = req.body;
    
    const agreement = req.agreement;
    
    // Check if user is governance manager or admin
    if (!req.isAdmin && !req.hasApprovePermission && agreement.governance_manager_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only governance manager can approve/reject at this stage' });
    }
    
    // Process uploaded documents
    const documents = (req.files || []).map(file => ({
      name: file.originalname,
      path: file.buffer.toString('base64'),
      type: 'approval_document',
      mimeType: file.mimetype,
      size: file.size,
      description: null
    }));
    
    const result = await vendorAgreementService.governanceApproveReject(
      agreementId,
      req.user.id,
      action,
      comments,
      documents,
      req.ip,
      req.get('User-Agent'),
      req.isAdmin || req.hasApprovePermission || false
    );
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendor-agreements/:id/governance-action', { error: error.message });
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
 * GET /api/vendor-agreements/:id/files
 * Get file schemas for a vendor agreement
 */
router.get('/:id/files', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    const pool = require('../db');
    const result = await dbQuery(
      `SELECT id, vendor_agreement_id, file_name_pattern as file_name, file_description, 
              schema, contains_pii, data_classification, file_type, quality_rule_ids, created_at
       FROM vendor_agreement_file_schemas 
       WHERE vendor_agreement_id = $1
       ORDER BY created_at ASC`,
      [agreementId]
    );
    
    // Check password status for each file schema (only if vault is available)
    let passwordVaultService = null;
    if (process.env.VAULT_ENCRYPTION_KEY) {
      try {
        passwordVaultService = new PasswordVaultService(pool, null, systemLogger);
      } catch (error) {
        systemLogger.warn('Password vault service not available for file schema password check', { error: error.message });
      }
    }
    
    const filesWithPasswordStatus = await Promise.all(result.rows.map(async (file) => {
      let hasArchivePassword = false;
      if (passwordVaultService) {
        try {
          hasArchivePassword = await passwordVaultService.hasPassword('vendor_agreement_file_schema', file.id.toString());
        } catch (error) {
          systemLogger.warn('Error checking password status for file schema', { fileId: file.id, error: error.message });
        }
      }
      return {
        ...file,
        has_archive_password: hasArchivePassword
      };
    }));
    
    res.json({ files: filesWithPasswordStatus });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements/:id/files', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch agreement files' });
  }
});

/**
 * GET /api/vendor-agreements/vendor/:vendorId
 * Get all agreements for a vendor
 * For non-admin vendor users, only returns agreements where they are a contact
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
    
    const isAdmin = userHasAdminAccess(req.user);
    const isVendorUser = vendorResult.vendor.vendor_user_id === req.user.id;
    
    if (!isAdmin && !isVendorUser) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    
    // Pass user email and admin status to filter agreements by contact for non-admins
    const result = await vendorAgreementService.getAgreementsByVendor(
      vendorId, 
      page, 
      pageSize, 
      req.user.email, 
      isAdmin
    );
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

/**
 * GET /api/vendor-agreements/template/:format
 * Download agreement template in specified format (xlsx, csv, json)
 */
router.get('/template/:format', async (req, res) => {
  try {
    const format = req.params.format.toLowerCase();
    let buffer, filename, contentType;
    
    switch (format) {
      case 'xlsx':
      case 'excel':
        buffer = AgreementTemplateUtils.generateExcelTemplate();
        filename = 'agreement_template.xlsx';
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
        
      case 'csv':
        buffer = AgreementTemplateUtils.generateCSVTemplate();
        filename = 'agreement_template.csv';
        contentType = 'text/csv';
        break;
        
      case 'json':
        buffer = AgreementTemplateUtils.generateJSONTemplate();
        filename = 'agreement_template.json';
        contentType = 'application/json';
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid format. Use xlsx, csv, or json.' });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
    
  } catch (error) {
    systemLogger.error('Error generating template', { format: req.params.format, error: error.message });
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

/**
 * POST /api/vendor-agreements/parse-template
 * Parse uploaded template file and return extracted data
 */
router.post('/parse-template', templateUpload.single('templateFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let parsedData;
    
    switch (fileExtension) {
      case '.xlsx':
      case '.xls':
        parsedData = AgreementTemplateUtils.parseExcelTemplate(req.file.buffer);
        break;
        
      case '.csv':
        parsedData = AgreementTemplateUtils.parseCSVTemplate(req.file.buffer);
        break;
        
      case '.json':
        parsedData = AgreementTemplateUtils.parseJSONTemplate(req.file.buffer);
        break;
        
      default:
        return res.status(400).json({ error: 'Unsupported file type' });
    }
    
    // Validate the parsed data
    const validation = AgreementTemplateUtils.validateTemplateData(parsedData);
    
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Template validation failed',
        validationErrors: validation.errors
      });
    }
    
    // Convert schema to JSON string if it's an array
    if (Array.isArray(parsedData.schema)) {
      parsedData.schema = JSON.stringify(parsedData.schema, null, 2);
    }
    
    res.json({
      success: true,
      data: parsedData
    });
    
  } catch (error) {
    systemLogger.error('Error parsing template', { error: error.message });
    res.status(400).json({ 
      error: error.message || 'Failed to parse template file'
    });
  }
});

// PATCH /api/vendor-agreements/:id/disable - Disable a vendor agreement
router.patch('/:id/disable', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    const result = await vendorAgreementService.disableAgreement(agreementId, req.user.id);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    res.json({
      success: true,
      message: result.message
    });
    
  } catch (error) {
    systemLogger.error('Error disabling agreement', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to disable agreement'
    });
  }
});

// GET /api/vendor-agreements/:id/check-dependencies - Check if agreement has dependencies
router.get('/:id/check-dependencies', requirePermission('vendor_agreements:read'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    
    // Check documents (actual uploaded assets)
    const documentsResult = await dbQuery(
      'SELECT COUNT(*) as count FROM vendor_agreement_documents WHERE agreement_id = $1',
      [agreementId]
    );
    
    // Check for processed files through transformation jobs linked to this agreement
    const processedFilesResult = await dbQuery(
      `SELECT COUNT(DISTINCT tj.id) as count 
       FROM transformation_jobs tj
       INNER JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
       WHERE tm.vendor_agreement_id = $1
       AND tj.status IN ('completed', 'running', 'pending')`,
      [agreementId]
    );
    
    const documentsCount = parseInt(documentsResult.rows[0].count) || 0;
    const processedFilesCount = parseInt(processedFilesResult.rows[0].count) || 0;
    
    const totalDependencies = documentsCount + processedFilesCount;
    const canDelete = totalDependencies === 0;
    
    res.json({
      success: true,
      canDelete,
      dependencies: {
        documents: documentsCount,
        transformationJobs: processedFilesCount,
        total: totalDependencies
      }
    });
    
  } catch (error) {
    systemLogger.error('Error checking agreement dependencies', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to check dependencies'
    });
  }
});

// DELETE /api/vendor-agreements/:id - Delete a vendor agreement
router.delete('/:id', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    const result = await vendorAgreementService.deleteAgreement(agreementId, req.user.id);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    res.json({
      success: true,
      message: result.message
    });
    
  } catch (error) {
    systemLogger.error('Error deleting agreement', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to delete agreement'
    });
  }
});

// ========================================
// Document Upload/Download Routes for Approvals
// ========================================

// Configure multer for approval documents
const documentUpload = multer({
  dest: 'uploads/agreement_documents/',
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit for approval documents
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.txt', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, XLSX, XLS, TXT, JPG, PNG'));
    }
  }
});

// POST /api/vendor-agreements/:id/documents - Upload document for approval
router.post('/:id/documents', checkAgreementAccess, documentUpload.single('document'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { approval_id, document_type, description, approval_stage } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No document file provided' });
    }
    
    // Create document record
    const result = await dbQuery(
      `INSERT INTO vendor_agreement_documents (
        agreement_id, approval_id, document_name, document_type, 
        file_path, file_size, mime_type, uploaded_by, description, approval_stage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        agreementId,
        approval_id || null,
        req.file.originalname,
        document_type || 'supporting_evidence',
        req.file.path,
        req.file.size,
        req.file.mimetype,
        req.user.id,
        description || null,
        approval_stage || null
      ]
    );
    
    systemLogger.info('Document uploaded for agreement', { 
      agreementId, 
      documentId: result.rows[0].id,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      document: result.rows[0]
    });
    
  } catch (error) {
    systemLogger.error('Error uploading agreement document', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to upload document'
    });
  }
});

// GET /api/vendor-agreements/:id/documents - Get all documents for an agreement
router.get('/:id/documents', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    const result = await dbQuery(
      `SELECT 
        d.*,
        u.username as uploaded_by_name,
        u.email as uploaded_by_email
       FROM vendor_agreement_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.agreement_id = $1
       ORDER BY d.uploaded_at DESC`,
      [agreementId]
    );
    
    res.json({
      success: true,
      documents: result.rows
    });
    
  } catch (error) {
    systemLogger.error('Error fetching agreement documents', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to fetch documents'
    });
  }
});

// GET /api/vendor-agreements/:id/documents/:docId/download - Download a document
router.get('/:id/documents/:docId/download', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    
    const result = await dbQuery(
      `SELECT * FROM vendor_agreement_documents 
       WHERE id = $1 AND agreement_id = $2`,
      [docId, agreementId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = result.rows[0];
    
    // Decode base64 data
    if (!document.file_path) {
      return res.status(404).json({ error: 'File data not found' });
    }
    
    const fileBuffer = Buffer.from(document.file_path, 'base64');
    
    // Set headers and send file
    res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${document.document_name}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    res.send(fileBuffer);
    
  } catch (error) {
    systemLogger.error('Error downloading agreement document', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to download document'
    });
  }
});

// DELETE /api/vendor-agreements/:id/documents/:docId - Delete a document
router.delete('/:id/documents/:docId', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    
    // Only allow document owner or admin to delete
    const docResult = await dbQuery(
      `SELECT * FROM vendor_agreement_documents 
       WHERE id = $1 AND agreement_id = $2`,
      [docId, agreementId]
    );
    
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = docResult.rows[0];
    
    // Check permissions
    if (document.uploaded_by !== req.user.id && !req.isAdmin && !req.hasApprovePermission) {
      return res.status(403).json({ error: 'Not authorized to delete this document' });
    }
    
    // Delete file from disk
    if (fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }
    
    // Delete from database
    await dbQuery(
      `DELETE FROM vendor_agreement_documents WHERE id = $1`,
      [docId]
    );
    
    systemLogger.info('Document deleted', { agreementId, docId, userId: req.user.id });
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
    
  } catch (error) {
    systemLogger.error('Error deleting agreement document', { error: error.message });
    res.status(500).json({ 
      error: error.message || 'Failed to delete document'
    });
  }
});

/**
 * POST /api/vendor-agreements/:id/archive-password
 * Store/update archive password for vendor agreement
 */
router.post('/:id/archive-password', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { password } = req.body;
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return res.status(400).json({ error: 'Password is required and must be a non-empty string' });
    }
    
    const auditService = new AuditService(pool);
    const passwordVaultService = new PasswordVaultService(pool, auditService, systemLogger);
    
    const result = await passwordVaultService.storePassword(
      'vendor_agreement',
      agreementId.toString(),
      password,
      req.user.id
    );
    
    systemLogger.info('Archive password stored for vendor agreement', {
      agreementId,
      userId: req.user.id,
      passwordId: result.id
    });
    
    res.json({
      success: true,
      message: 'Archive password stored successfully',
      hasPassword: true
    });
    
  } catch (error) {
    systemLogger.error('Error storing archive password', {
      agreementId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to store archive password',
      details: error.message
    });
  }
});

/**
 * GET /api/vendor-agreements/:id/archive-password
 * Check if archive password exists for vendor agreement
 */
router.get('/:id/archive-password', requirePermission('vendor_agreements:read'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    const auditService = new AuditService(pool);
    const passwordVaultService = new PasswordVaultService(pool, auditService, systemLogger);
    
    const hasPassword = await passwordVaultService.hasPassword(
      'vendor_agreement',
      agreementId.toString()
    );
    
    res.json({
      success: true,
      hasPassword
    });
    
  } catch (error) {
    systemLogger.error('Error checking archive password', {
      agreementId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to check archive password',
      details: error.message
    });
  }
});

/**
 * DELETE /api/vendor-agreements/:id/archive-password
 * Delete archive password for vendor agreement
 */
router.delete('/:id/archive-password', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    const auditService = new AuditService(pool);
    const passwordVaultService = new PasswordVaultService(pool, auditService, systemLogger);
    
    const deleted = await passwordVaultService.deletePassword(
      'vendor_agreement',
      agreementId.toString(),
      req.user.id
    );
    
    if (!deleted) {
      return res.status(404).json({
        error: 'No archive password found for this vendor agreement'
      });
    }
    
    systemLogger.info('Archive password deleted for vendor agreement', {
      agreementId,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Archive password deleted successfully',
      hasPassword: false
    });
    
  } catch (error) {
    systemLogger.error('Error deleting archive password', {
      agreementId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to delete archive password',
      details: error.message
    });
  }
});

// ===========================
// ADDITIONAL STAKEHOLDERS ENDPOINTS
// ===========================

/**
 * GET /:id/stakeholders
 * Get current additional stakeholders for an agreement
 */
router.get('/:id/stakeholders', checkAgreementAccess, async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    
    // Get agreement with stakeholder IDs
    const agreementResult = await dbQuery(`
      SELECT 
        additional_stakeholder_user_ids,
        additional_stakeholder_group_ids
      FROM vendor_agreements
      WHERE id = $1
    `, [agreementId]);
    
    if (agreementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    const agreement = agreementResult.rows[0];
    const userIds = agreement.additional_stakeholder_user_ids || [];
    const groupIds = agreement.additional_stakeholder_group_ids || [];
    
    // Get user details for the selected user IDs
    let users = [];
    if (userIds.length > 0) {
      const usersResult = await dbQuery(`
        SELECT 
          u.id,
          u.username,
          u.email,
          TRIM(CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name)) AS full_name
        FROM users u
        WHERE u.id = ANY($1::int[])
        ORDER BY u.first_name, u.last_name
      `, [userIds]);
      users = usersResult.rows.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.full_name || u.username || u.email
      }));
    }
    
    // Get group details for the selected group IDs
    let groups = [];
    if (groupIds.length > 0) {
      const groupsResult = await dbQuery(`
        SELECT 
          ag.id,
          ag.name,
          ag.description,
          ag.group_type,
          (
            SELECT COUNT(*)::int 
            FROM user_groups ug 
            WHERE ug.group_id = ag.id
          ) as member_count
        FROM access_groups ag
        WHERE ag.id = ANY($1::int[])
        ORDER BY ag.name
      `, [groupIds]);
      groups = groupsResult.rows.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        groupType: g.group_type,
        memberCount: g.member_count
      }));
    }
    
    res.json({
      success: true,
      userIds,
      groupIds,
      users,
      groups
    });
    
  } catch (error) {
    systemLogger.error('Error fetching agreement stakeholders', {
      agreementId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to fetch stakeholders',
      details: error.message
    });
  }
});

/**
 * PUT /:id/stakeholders
 * Update additional stakeholders for an agreement
 */
router.put('/:id/stakeholders', requirePermission('vendor_agreements:write'), async (req, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { userIds = [], groupIds = [] } = req.body;
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    // Validate input arrays
    if (!Array.isArray(userIds) || !Array.isArray(groupIds)) {
      return res.status(400).json({ error: 'userIds and groupIds must be arrays' });
    }
    
    
    // Verify agreement exists
    const agreementCheck = await dbQuery(
      'SELECT id FROM vendor_agreements WHERE id = $1',
      [agreementId]
    );
    
    if (agreementCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    // Validate that all user IDs are internal users (security check)
    if (userIds.length > 0) {
      const validUsersResult = await dbQuery(`
        SELECT id FROM users 
        WHERE id = ANY($1::int[]) 
        AND internal_user = true
      `, [userIds]);
      
      const validUserIds = validUsersResult.rows.map(r => r.id);
      const invalidUserIds = userIds.filter(id => !validUserIds.includes(id));
      
      if (invalidUserIds.length > 0) {
        return res.status(400).json({
          error: 'Invalid user IDs. Only internal users can be added as stakeholders.',
          invalidIds: invalidUserIds
        });
      }
    }
    
    // Validate that all group IDs exist
    if (groupIds.length > 0) {
      const validGroupsResult = await dbQuery(`
        SELECT id FROM access_groups 
        WHERE id = ANY($1::int[])
      `, [groupIds]);
      
      const validGroupIds = validGroupsResult.rows.map(r => r.id);
      const invalidGroupIds = groupIds.filter(id => !validGroupIds.includes(id));
      
      if (invalidGroupIds.length > 0) {
        return res.status(400).json({
          error: 'Invalid group IDs',
          invalidIds: invalidGroupIds
        });
      }
    }
    
    // Update the agreement
    await dbQuery(`
      UPDATE vendor_agreements
      SET 
        additional_stakeholder_user_ids = $1::jsonb,
        additional_stakeholder_group_ids = $2::jsonb,
        updated_at = NOW(),
        updated_by = $3
      WHERE id = $4
    `, [
      JSON.stringify(userIds),
      JSON.stringify(groupIds),
      req.user.id,
      agreementId
    ]);
    
    systemLogger.info('Updated agreement stakeholders', {
      agreementId,
      userIds,
      groupIds,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Stakeholders updated successfully',
      userIds,
      groupIds
    });
    
  } catch (error) {
    systemLogger.error('Error updating agreement stakeholders', {
      agreementId: req.params.id,
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to update stakeholders',
      details: error.message
    });
  }
});

// Register Multer error handling middleware
router.use(handleMulterError);

module.exports = router;
