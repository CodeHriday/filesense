const pool = require('../db');
const { systemLogger } = require('../utils/logger');

class VendorUserService {
  /**
   * Get all vendor users for a specific vendor
   */
  async getVendorUsers(vendorId, activeOnly = true) {
    const client = await pool.connect();
    
    try {
      let query = `
        SELECT 
          vu.*,
          v.vendor_name
        FROM vendor_users vu
        JOIN vendors v ON vu.vendor_id = v.id
        WHERE vu.vendor_id = $1
      `;
      
      const params = [vendorId];
      
      if (activeOnly) {
        query += ' AND vu.is_active = true';
      }
      
      query += ' ORDER BY vu.name ASC';
      
      const result = await client.query(query, params);
      
      return {
        success: true,
        vendorUsers: result.rows
      };
      
    } catch (error) {
      systemLogger.error('Error fetching vendor users', { error: error.message, vendorId });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get a specific vendor user by ID
   */
  async getVendorUserById(userId) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT 
          vu.*,
          v.vendor_name
        FROM vendor_users vu
        JOIN vendors v ON vu.vendor_id = v.id
        WHERE vu.id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Vendor user not found');
      }
      
      return {
        success: true,
        vendorUser: result.rows[0]
      };
      
    } catch (error) {
      systemLogger.error('Error fetching vendor user by ID', { error: error.message, userId });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Create a new vendor user
   */
  async createVendorUser(userData, createdBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { vendor_id, name, email, phone, designation, is_active = true } = userData;
      
      // Validation
      if (!vendor_id || !name) {
        throw new Error('vendor_id and name are required');
      }
      
      // Verify vendor exists
      const vendorCheck = await client.query(
        'SELECT id FROM vendors WHERE id = $1',
        [vendor_id]
      );
      
      if (vendorCheck.rows.length === 0) {
        throw new Error('Vendor not found');
      }
      
      // Create vendor user
      const result = await client.query(
        `INSERT INTO vendor_users (
          vendor_id, name, email, phone, designation, is_active, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        RETURNING *`,
        [vendor_id, name, email || null, phone || null, designation || null, is_active, createdBy]
      );
      
      const vendorUser = result.rows[0];
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor user created', { 
        vendorUserId: vendorUser.id,
        vendorId: vendor_id,
        name 
      });
      
      return {
        success: true,
        vendorUser
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating vendor user', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update a vendor user
   */
  async updateVendorUser(userId, updateData, updatedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current vendor user
      const currentResult = await client.query(
        'SELECT * FROM vendor_users WHERE id = $1',
        [userId]
      );
      
      if (currentResult.rows.length === 0) {
        throw new Error('Vendor user not found');
      }
      
      const current = currentResult.rows[0];
      
      const { name, email, phone, designation, is_active } = updateData;
      
      // Build update query dynamically
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (name !== undefined && name !== current.name) {
        updates.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
      }
      
      if (email !== undefined && email !== current.email) {
        updates.push(`email = $${paramIndex}`);
        params.push(email || null);
        paramIndex++;
      }
      
      if (phone !== undefined && phone !== current.phone) {
        updates.push(`phone = $${paramIndex}`);
        params.push(phone || null);
        paramIndex++;
      }
      
      if (designation !== undefined && designation !== current.designation) {
        updates.push(`designation = $${paramIndex}`);
        params.push(designation || null);
        paramIndex++;
      }
      
      if (is_active !== undefined && is_active !== current.is_active) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(is_active);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return {
          success: true,
          vendorUser: current,
          message: 'No changes detected'
        };
      }
      
      // Add updated_by
      updates.push(`updated_by = $${paramIndex}`);
      params.push(updatedBy);
      paramIndex++;
      
      // Add ID parameter
      params.push(userId);
      
      const query = `
        UPDATE vendor_users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      const result = await client.query(query, params);
      const updatedUser = result.rows[0];
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor user updated', { vendorUserId: userId });
      
      return {
        success: true,
        vendorUser: updatedUser
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error updating vendor user', { error: error.message, userId });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Delete a vendor user
   */
  async deleteVendorUser(userId, deletedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user exists
      const userCheck = await client.query(
        'SELECT id, name FROM vendor_users WHERE id = $1',
        [userId]
      );
      
      if (userCheck.rows.length === 0) {
        throw new Error('Vendor user not found');
      }
      
      // Delete the user
      await client.query(
        'DELETE FROM vendor_users WHERE id = $1',
        [userId]
      );
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor user deleted', { 
        vendorUserId: userId,
        deletedBy 
      });
      
      return {
        success: true,
        message: 'Vendor user deleted successfully'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error deleting vendor user', { error: error.message, userId });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new VendorUserService();
