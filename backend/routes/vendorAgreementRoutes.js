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
    
    // Admin role has access to everything (backwards compatibility)
    // Defensive check: ensure roles array exists before checking
    if (req.user.roles && Array.isArray(req.user.roles) && req.user.roles.includes('Admin')) {
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
    const vendorId = req.query.vendor_id ? parseInt(req.query.vendor_id) : null;
    const status = req.query.status || null;
    
    // Only users with approve permission can see ALL agreements (bypassing contact filtering)
    // Regular vendor users with just read permission still get filtered by their contact emails
    const hasApprovePermission = hasPermission(req.user, 'vendor_agreements:approve');
    
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
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendor-agreements', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch agreements' });
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
    
    const isAdmin = req.user.roles && req.user.roles.includes('Admin');
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
    const { pool } = require('../config/database');
    const result = await pool.query(
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
    
    const { pool } = require('../config/database');
    const result = await pool.query(
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
    
    const { pool } = require('../config/database');
    const result = await pool.query(
      `SELECT * FROM vendor_agreement_documents 
       WHERE id = $1 AND agreement_id = $2`,
      [docId, agreementId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const document = result.rows[0];
    
    // Check if file exists
    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Set headers and send file
    res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${document.document_name}"`);
    
    const fileStream = fs.createReadStream(document.file_path);
    fileStream.pipe(res);
    
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
    const { pool } = require('../config/database');
    const docResult = await pool.query(
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
    await pool.query(
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

module.exports = router;
