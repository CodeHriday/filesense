/**
 * Vendor Access Control Middleware
 * Ensures vendors can only access their own data
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { isVendorUser } = require('../utils/userHelpers');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Middleware to check if user is a vendor and get their vendor profile
 */
async function attachVendorProfile(req, res, next) {
  try {
    // Skip if no user or not a vendor (use user attributes, not roles)
    if (!req.user || !isVendorUser(req.user)) {
      return next();
    }
    
    // Get vendor profile for this user
    const result = await pool.query(
      'SELECT * FROM vendors WHERE vendor_user_id = $1 AND status = $2',
      [req.user.id, 'active']
    );
    
    if (result.rows.length > 0) {
      req.vendorProfile = result.rows[0];
      req.isVendor = true;
    }
    
    next();
  } catch (error) {
    systemLogger.error('Error attaching vendor profile', { 
      userId: req.user?.id, 
      error: error.message 
    });
    next(error);
  }
}

/**
 * Middleware to restrict vendors to only their own vendor data
 * Use this on vendor-specific routes that include vendor ID in params
 */
function requireOwnVendorAccess(req, res, next) {
  // Admin-level access can access everything (uses permission-based check)
  if (userHasAdminAccess(req.user)) {
    return next();
  }
  
  // Must be a vendor user
  if (!req.isVendor || !req.vendorProfile) {
    systemLogger.warn('Non-vendor attempted to access vendor-only resource', {
      userId: req.user?.id,
      path: req.path
    });
    return res.status(403).json({ error: 'Access denied. Vendor access required.' });
  }
  
  // CRITICAL: Verify the requested vendor ID matches the authenticated vendor's ID
  const requestedVendorId = parseInt(req.params.id || req.params.vendorId);
  const authenticatedVendorId = parseInt(req.vendorProfile.id);
  
  if (requestedVendorId && !isNaN(requestedVendorId) && requestedVendorId !== authenticatedVendorId) {
    systemLogger.warn('Vendor attempted to access another vendor\'s data', {
      userId: req.user.id,
      vendorId: authenticatedVendorId,
      requestedVendorId,
      path: req.path,
      method: req.method
    });
    return res.status(403).json({ error: 'Access denied. You can only access your own vendor data.' });
  }
  
  next();
}

/**
 * Middleware to filter file catalog for vendors
 * Vendors should only see files from their vendor agreements/connections
 */
async function filterVendorFiles(req, res, next) {
  try {
    // Skip filtering for non-vendors or admins
    if (!req.isVendor || (req.user.roles && req.user.roles.includes('Admin'))) {
      return next();
    }
    
    // Get vendor's drop location path
    if (req.vendorProfile && req.vendorProfile.drop_location_path) {
      // Add vendor filter to query parameters
      req.vendorFileFilter = {
        vendorId: req.vendorProfile.id,
        dropLocationPath: req.vendorProfile.drop_location_path
      };
    }
    
    next();
  } catch (error) {
    systemLogger.error('Error applying vendor file filter', { 
      userId: req.user?.id, 
      error: error.message 
    });
    next(error);
  }
}

/**
 * Middleware to ensure vendor can only access their own agreements
 */
async function requireOwnAgreementAccess(req, res, next) {
  try {
    // Admin can access everything
    if (req.user && req.user.roles && req.user.roles.includes('Admin')) {
      return next();
    }
    
    const agreementId = parseInt(req.params.id || req.params.agreementId);
    
    if (isNaN(agreementId)) {
      return res.status(400).json({ error: 'Invalid agreement ID' });
    }
    
    // Get agreement
    const result = await pool.query(
      `SELECT va.*, v.vendor_user_id 
       FROM vendor_agreements va
       JOIN vendors v ON va.vendor_id = v.id
       WHERE va.id = $1`,
      [agreementId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    const agreement = result.rows[0];
    
    // Check if user is the vendor user or the file owner
    const isVendorUser = agreement.vendor_user_id === req.user.id;
    const isFileOwner = agreement.file_owner_user_id === req.user.id;
    
    if (!isVendorUser && !isFileOwner) {
      systemLogger.warn('Unauthorized agreement access attempt', {
        userId: req.user.id,
        agreementId,
        vendorUserId: agreement.vendor_user_id,
        fileOwnerId: agreement.file_owner_user_id
      });
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Attach agreement to request for use in route handler
    req.agreement = agreement;
    req.isVendorUser = isVendorUser;
    req.isFileOwner = isFileOwner;
    
    next();
  } catch (error) {
    systemLogger.error('Error checking agreement access', { 
      userId: req.user?.id, 
      error: error.message 
    });
    return res.status(500).json({ error: 'Failed to verify access' });
  }
}

/**
 * Helper function to check if a user is a vendor
 */
async function isUserVendor(userId) {
  try {
    const result = await pool.query(
      'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
      [userId, 'active']
    );
    return result.rows.length > 0;
  } catch (error) {
    systemLogger.error('Error checking vendor status', { userId, error: error.message });
    return false;
  }
}

/**
 * Helper function to get vendor ID for a user
 */
async function getVendorIdForUser(userId) {
  try {
    const result = await pool.query(
      'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
      [userId, 'active']
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    systemLogger.error('Error getting vendor ID', { userId, error: error.message });
    return null;
  }
}

module.exports = {
  attachVendorProfile,
  requireOwnVendorAccess,
  filterVendorFiles,
  requireOwnAgreementAccess,
  isUserVendor,
  getVendorIdForUser
};
