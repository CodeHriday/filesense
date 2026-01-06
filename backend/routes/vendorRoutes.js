/**
 * Vendor Management Routes
 * Admin-only routes for managing vendors
 */

const express = require('express');
const router = express.Router();
const vendorService = require('../services/vendorService');
const { systemLogger} = require('../utils/logger');
const { isVendorUser: checkVendorUser } = require('../utils/userHelpers');
const { hasPermission } = require('../middleware/vendorPermissions');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

// Helper function to check if user has vendor management write permission or is Admin
const canManageVendors = (user) => {
  // Check permission first
  if (hasPermission(user, 'vendor_management:write')) {
    return true;
  }
  // Use permission-based admin check for admin-equivalent roles
  return userHasAdminAccess(user);
};

// Middleware to require vendor management write permission
const requireVendorManagement = (req, res, next) => {
  if (!canManageVendors(req.user)) {
    systemLogger.warn('Unauthorized vendor management access attempt', {
      userId: req.user?.id,
      roles: req.user?.roles,
      path: req.path
    });
    return res.status(403).json({ error: 'Access denied. Vendor management permission required.' });
  }
  next();
};

// Middleware to check if user is vendor (for their own profile access)
const isVendorUser = (req, res, next) => {
  // Use user attributes (internal_user and user_type) instead of roles
  if (req.user && checkVendorUser(req.user)) {
    req.isVendor = true;
  }
  next();
};

/**
 * GET /api/vendors
 * Get all vendors (Admin only) or own vendor profile (Vendor user)
 */
router.get('/', isVendorUser, async (req, res) => {
  try {
    // If vendor user (and not a vendor manager), return only their own profile
    if (req.isVendor && !canManageVendors(req.user)) {
      const result = await vendorService.getVendorByUserId(req.user.id);
      
      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }
      
      return res.json({
        success: true,
        vendors: [result.vendor],
        isOwnProfile: true
      });
    }
    
    // Admin access - get all vendors with filters
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.project_id) filters.project_id = parseInt(req.query.project_id);
    if (req.query.search) filters.search = req.query.search;
    
    const result = await vendorService.getAllVendors(page, pageSize, filters);
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendors', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

/**
 * GET /api/vendors/init-data
 * Batch endpoint to get all data needed for VendorManagement page in a single call
 * Replaces 3 separate API calls: vendors, projects, vendor-users
 * Permission-aware: Returns data based on user's access level
 * Projects are filtered by user's project access (same as /api/projects endpoint)
 * NOTE: This route MUST be defined BEFORE /:id to prevent Express from matching 'init-data' as an ID
 */
router.get('/init-data', isVendorUser, async (req, res) => {
  try {
    const db = require('../config/database');
    const { userHasAllProjectAccess } = require('../utils/permissionHelpers');
    const canManage = canManageVendors(req.user);
    
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || '';
    
    let vendorsData = { vendors: [], pagination: { totalPages: 1, totalCount: 0 } };
    let projects = [];
    let vendorUsers = [];
    
    if (req.isVendor && !canManage) {
      const result = await vendorService.getVendorByUserId(req.user.id);
      if (result.success) {
        vendorsData = {
          vendors: [result.vendor],
          isOwnProfile: true,
          pagination: { totalPages: 1, totalCount: 1 }
        };
      }
    } else {
      const filters = {};
      if (search) filters.search = search;
      
      const result = await vendorService.getAllVendors(page, pageSize, filters);
      vendorsData = {
        vendors: result.vendors || [],
        pagination: result.pagination || { totalPages: 1, totalCount: 0 }
      };
    }
    
    if (canManage) {
      try {
        const isAdmin = userHasAllProjectAccess(req.user);
        let projectsQuery = `
          SELECT id, name, description, project_type, status, created_at
          FROM projects
          WHERE parent_id IS NULL
        `;
        const params = [];
        
        if (!isAdmin) {
          projectsQuery = `
            SELECT DISTINCT p.id, p.name, p.description, p.project_type, p.status, p.created_at
            FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN project_access_groups pag ON p.id = pag.project_id
            LEFT JOIN user_groups ug ON pag.group_id = ug.group_id
            WHERE p.parent_id IS NULL
              AND (pm.user_id = $1 OR ug.user_id = $1)
          `;
          params.push(req.user.id);
        }
        
        projectsQuery += ' ORDER BY name';
        const projectsResult = await db.query(projectsQuery, params);
        projects = projectsResult.rows;
      } catch (err) {
        systemLogger.warn('Could not fetch projects', { error: err.message });
      }
      
      try {
        const vendorUsersResult = await db.query(`
          SELECT 
            u.id,
            u.username,
            u.email,
            u.first_name,
            u.last_name,
            u.full_name,
            u.phone_number,
            u.state
          FROM users u
          WHERE u.internal_user = false 
            AND u.user_type = 'Vendor'
          ORDER BY u.first_name, u.last_name
        `);
        vendorUsers = vendorUsersResult.rows;
      } catch (err) {
        systemLogger.warn('Could not fetch vendor users', { error: err.message });
      }
    }
    
    res.json({
      success: true,
      vendors: vendorsData.vendors,
      pagination: vendorsData.pagination,
      isOwnProfile: vendorsData.isOwnProfile || false,
      projects,
      vendorUsers,
      canManageVendors: canManage
    });
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendors/init-data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch init data' });
  }
});

/**
 * GET /api/vendors/:id
 * Get vendor by ID
 */
router.get('/:id', isVendorUser, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    const result = await vendorService.getVendorById(vendorId);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    // If vendor user (and not a vendor manager), ensure they can only see their own profile
    if (req.isVendor && !canManageVendors(req.user)) {
      if (result.vendor.vendor_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendors/:id', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

/**
 * POST /api/vendors
 * Create new vendor (requires vendor_management:write permission)
 */
router.post('/', requireVendorManagement, async (req, res) => {
  try {
    const result = await vendorService.createVendor(req.body, req.user.id);
    res.status(201).json(result);
    
  } catch (error) {
    systemLogger.error('Error in POST /api/vendors', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/vendors/:id
 * Update vendor (requires vendor_management:write permission)
 */
router.put('/:id', requireVendorManagement, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    const result = await vendorService.updateVendor(vendorId, req.body, req.user.id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in PUT /api/vendors/:id', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/vendors/:id
 * Delete (deactivate) vendor (requires vendor_management:write permission)
 */
router.delete('/:id', requireVendorManagement, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }
    
    const result = await vendorService.deleteVendor(vendorId, req.user.id);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }
    
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in DELETE /api/vendors/:id', { error: error.message });
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

/**
 * GET /api/vendors/project/:projectId
 * Get vendors by project (requires vendor_management:write permission)
 */
router.get('/project/:projectId', requireVendorManagement, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    const result = await vendorService.getVendorsByProject(projectId);
    res.json(result);
    
  } catch (error) {
    systemLogger.error('Error in GET /api/vendors/project/:projectId', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

module.exports = router;
