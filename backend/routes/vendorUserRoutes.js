const express = require('express');
const router = express.Router();
const vendorUserService = require('../services/vendorUserService');
const authenticateToken = require('../middleware/authenticate');

/**
 * GET /api/vendors/:vendorId/users
 * Get all users for a specific vendor
 */
router.get('/vendors/:vendorId/users', authenticateToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const activeOnly = req.query.active_only !== 'false'; // Default to true
    
    const result = await vendorUserService.getVendorUsers(parseInt(vendorId), activeOnly);
    
    res.json(result.vendorUsers);
  } catch (error) {
    console.error('Error fetching vendor users:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vendor-users/:id
 * Get a specific vendor user by ID
 */
router.get('/vendor-users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await vendorUserService.getVendorUserById(parseInt(id));
    
    res.json(result.vendorUser);
  } catch (error) {
    console.error('Error fetching vendor user:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/vendor-users
 * Create a new vendor user
 */
router.post('/vendor-users', authenticateToken, async (req, res) => {
  try {
    const result = await vendorUserService.createVendorUser(req.body, req.user.id);
    
    res.status(201).json(result.vendorUser);
  } catch (error) {
    console.error('Error creating vendor user:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/vendor-users/:id
 * Update a vendor user
 */
router.put('/vendor-users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await vendorUserService.updateVendorUser(
      parseInt(id),
      req.body,
      req.user.id
    );
    
    res.json(result.vendorUser);
  } catch (error) {
    console.error('Error updating vendor user:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/vendor-users/:id
 * Delete a vendor user
 */
router.delete('/vendor-users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await vendorUserService.deleteVendorUser(parseInt(id), req.user.id);
    
    res.json({ message: result.message });
  } catch (error) {
    console.error('Error deleting vendor user:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
