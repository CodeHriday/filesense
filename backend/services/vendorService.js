/**
 * Vendor Management Service
 * Handles vendor CRUD operations, user account creation, and project associations
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class VendorService {
  /**
   * Generate unique vendor code
   */
  async generateVendorCode(vendorName) {
    const prefix = vendorName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${randomSuffix}`;
  }

  /**
   * Create vendor with associated user account
   * @param {Object} vendorData - Vendor information
   * @param {number} createdBy - User ID creating the vendor
   * @returns {Promise<Object>} Created vendor with user account
   */
  async createVendor(vendorData, createdBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const {
        vendor_name,
        description,
        contact_name,
        contact_email,
        contact_phone,
        address,
        backup_contact_name,
        backup_contact_phone,
        backup_contact_email,
        project_id,
        vendor_type
      } = vendorData;
      
      // Validation
      if (!vendor_name || !contact_name || !contact_email) {
        throw new Error('Vendor name, contact name, and contact email are required');
      }
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact_email)) {
        throw new Error('Invalid contact email format');
      }
      
      // Validate backup contact email if provided
      if (backup_contact_email && !emailRegex.test(backup_contact_email)) {
        throw new Error('Invalid backup contact email format');
      }
      
      // Prevent duplicate primary and backup contacts
      if (backup_contact_email && contact_email.toLowerCase() === backup_contact_email.toLowerCase()) {
        throw new Error('Backup contact cannot be the same as primary contact');
      }
      
      // Check if vendor with same email already exists
      const existingVendor = await client.query(
        'SELECT id FROM vendors WHERE contact_email = $1',
        [contact_email]
      );
      
      if (existingVendor.rows.length > 0) {
        throw new Error('Vendor with this email already exists');
      }
      
      // Generate unique vendor code
      let vendorCode = await this.generateVendorCode(vendor_name);
      
      // Ensure vendor code is unique
      let codeExists = await client.query(
        'SELECT id FROM vendors WHERE vendor_code = $1',
        [vendorCode]
      );
      
      while (codeExists.rows.length > 0) {
        vendorCode = await this.generateVendorCode(vendor_name);
        codeExists = await client.query(
          'SELECT id FROM vendors WHERE vendor_code = $1',
          [vendorCode]
        );
      }
      
      // Create user account for vendor
      // Check if user with this email already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [contact_email]
      );
      
      let vendorUserId;
      
      if (existingUser.rows.length > 0) {
        // User exists - use existing user
        vendorUserId = existingUser.rows[0].id;
        systemLogger.info('Using existing user account for vendor', { userId: vendorUserId, email: contact_email });
        
      } else {
        // Create new user account - username is the email
        const username = contact_email;
        
        // Generate a temporary password - vendor should reset on first login
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        // Get Vendor role ID
        const roleResult = await client.query(
          'SELECT id FROM roles WHERE name = $1',
          ['Vendor']
        );
        
        if (roleResult.rows.length === 0) {
          throw new Error('Vendor role not found. Please ensure the Vendor role is created.');
        }
        
        const vendorRoleId = roleResult.rows[0].id;
        
        // Create user
        const userResult = await client.query(
          `INSERT INTO users (username, email, password, first_name, last_name, auth_provider, created_at)
           VALUES ($1, $2, $3, $4, $5, 'local', CURRENT_TIMESTAMP)
           RETURNING id`,
          [username, contact_email, hashedPassword, contact_name, '']
        );
        
        vendorUserId = userResult.rows[0].id;
        
        // Assign Vendor role to user
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, created_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)`,
          [vendorUserId, vendorRoleId]
        );
        
        systemLogger.info('Created new user account for vendor', { 
          userId: vendorUserId, 
          email: contact_email,
          tempPassword: tempPassword // In production, this should be sent via email
        });
      }
      
      // Auto-create or assign project
      let finalProjectId = project_id;
      
      if (!finalProjectId) {
        // Auto-create a project for this vendor
        const projectName = `${vendor_name} - Vendor Project`;
        const projectDescription = `Auto-created project for vendor: ${vendor_name}`;
        
        const newProjectResult = await client.query(
          `INSERT INTO projects (name, description, created_at, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [projectName, projectDescription]
        );
        
        finalProjectId = newProjectResult.rows[0].id;
        
        systemLogger.info('Auto-created project for vendor', { 
          projectId: finalProjectId, 
          projectName,
          vendorName: vendor_name 
        });
      } else {
        // Verify provided project exists
        const projectResult = await client.query(
          'SELECT id FROM projects WHERE id = $1',
          [project_id]
        );
        
        if (projectResult.rows.length === 0) {
          throw new Error(`Project with ID ${project_id} not found`);
        }
      }
      
      // Add vendor user to the project
      // Validate createdBy - it must be a valid user ID or NULL
      let validInvitedBy = createdBy;
      if (createdBy) {
        const creatorCheck = await client.query(
          'SELECT id FROM users WHERE id = $1',
          [createdBy]
        );
        if (creatorCheck.rows.length === 0) {
          systemLogger.warn('Invalid createdBy user ID, setting invited_by to NULL', { createdBy });
          validInvitedBy = null;
        }
      }
      
      systemLogger.info('Checking project membership', { 
        projectId: finalProjectId, 
        userId: vendorUserId,
        createdBy: createdBy,
        validInvitedBy: validInvitedBy
      });
      
      const memberCheck = await client.query(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
        [finalProjectId, vendorUserId]
      );
      
      if (memberCheck.rows.length === 0) {
        systemLogger.info('Adding vendor user to project', { 
          projectId: finalProjectId, 
          userId: vendorUserId,
          invitedBy: validInvitedBy 
        });
        
        try {
          await client.query(
            `INSERT INTO project_members (project_id, user_id, invited_by, can_invite, can_manage_members, created_at)
             VALUES ($1, $2, $3, false, false, CURRENT_TIMESTAMP)`,
            [finalProjectId, vendorUserId, validInvitedBy]
          );
          systemLogger.info('Successfully added vendor user to project');
        } catch (memberError) {
          systemLogger.error('Error adding vendor user to project', { 
            error: memberError.message,
            code: memberError.code,
            detail: memberError.detail,
            params: { finalProjectId, vendorUserId, validInvitedBy }
          });
          throw memberError;
        }
      }
      
      // Create vendor record
      const vendorResult = await client.query(
        `INSERT INTO vendors (
          vendor_code, vendor_name, description, contact_name, contact_email, contact_phone,
          address, backup_contact_name, backup_contact_phone, backup_contact_email,
          vendor_user_id, project_id, vendor_onboarding_date, vendor_type, status, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, $13, 'active', $14, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          vendorCode, vendor_name, description, contact_name, contact_email, contact_phone,
          address, backup_contact_name, backup_contact_phone, backup_contact_email,
          vendorUserId, finalProjectId, vendor_type, createdBy
        ]
      );
      
      const vendor = vendorResult.rows[0];
      
      // Create two default connections for the vendor (source and target)
      const sourceConnectionId = uuidv4();
      const targetConnectionId = uuidv4();
      const sourceConnectionName = `${vendorCode}_source`;
      const targetConnectionName = `${vendorCode}_target`;
      
      systemLogger.info('Creating default vendor connections', {
        vendorId: vendor.id,
        vendorCode,
        sourceConnectionName,
        targetConnectionName,
        projectId: finalProjectId
      });
      
      // Create source connection with unified fields
      await client.query(
        `INSERT INTO storage_connections (
          connection_id, type, name, config, status, 
          connection_direction, project_id, connection_user, description,
          authentication_method, auth_config, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          sourceConnectionId,
          'vendor',
          sourceConnectionName,
          JSON.stringify({ vendor_id: vendor.id, placeholder: true }),
          'pending',
          'source',
          finalProjectId,
          'External',  // connection_user
          `Source connection for vendor ${vendor_name}`,  // description
          'key-based',  // authentication_method
          JSON.stringify({})  // auth_config
        ]
      );
      
      // Create target connection with unified fields
      await client.query(
        `INSERT INTO storage_connections (
          connection_id, type, name, config, status, 
          connection_direction, project_id, connection_user, description,
          authentication_method, auth_config, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          targetConnectionId,
          'vendor',
          targetConnectionName,
          JSON.stringify({ vendor_id: vendor.id, placeholder: true }),
          'pending',
          'target',
          finalProjectId,
          'External',  // connection_user
          `Target connection for vendor ${vendor_name}`,  // description
          'key-based',  // authentication_method
          JSON.stringify({})  // auth_config
        ]
      );
      
      systemLogger.info('Created default vendor connections successfully', {
        sourceConnectionId,
        targetConnectionId
      });
      
      await client.query('COMMIT');
      
      // Fetch project name to include in response
      const projectResult = await client.query(
        'SELECT name FROM projects WHERE id = $1',
        [finalProjectId]
      );
      
      // Add project_name to vendor object
      vendor.project_name = projectResult.rows[0]?.name || null;
      
      systemLogger.info('Vendor created successfully', { 
        vendorId: vendor.id, 
        vendorCode: vendor.vendor_code,
        userId: vendorUserId 
      });
      
      return {
        success: true,
        vendor: vendor,
        userId: vendorUserId
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating vendor', { 
        error: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack,
        vendorData: { vendor_name: vendorData.vendor_name, contact_email: vendorData.contact_email },
        createdBy: createdBy
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all vendors with pagination
   */
  async getAllVendors(page = 1, pageSize = 20, filters = {}) {
    try {
      const offset = (page - 1) * pageSize;
      
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;
      
      if (filters.status) {
        whereClause += ` AND v.status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
      }
      
      if (filters.project_id) {
        whereClause += ` AND v.project_id = $${paramIndex}`;
        params.push(filters.project_id);
        paramIndex++;
      }
      
      if (filters.search) {
        whereClause += ` AND (v.vendor_name ILIKE $${paramIndex} OR v.vendor_code ILIKE $${paramIndex} OR v.contact_email ILIKE $${paramIndex})`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }
      
      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM vendors v ${whereClause}`,
        params
      );
      
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Get paginated data with user and project info
      params.push(pageSize, offset);
      const result = await pool.query(
        `SELECT 
          v.*,
          u.username as vendor_username,
          u.email as vendor_email,
          p.name as project_name,
          creator.username as created_by_username
        FROM vendors v
        LEFT JOIN users u ON v.vendor_user_id = u.id
        LEFT JOIN projects p ON v.project_id = p.id
        LEFT JOIN users creator ON v.created_by = creator.id
        ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );
      
      return {
        success: true,
        vendors: result.rows,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize)
        }
      };
      
    } catch (error) {
      systemLogger.error('Error fetching vendors', { error: error.message });
      throw error;
    }
  }

  /**
   * Get vendor by ID
   */
  async getVendorById(vendorId) {
    try {
      const result = await pool.query(
        `SELECT 
          v.*,
          u.username as vendor_username,
          u.email as vendor_email,
          u.first_name,
          u.last_name,
          p.name as project_name,
          p.description as project_description,
          creator.username as created_by_username
        FROM vendors v
        LEFT JOIN users u ON v.vendor_user_id = u.id
        LEFT JOIN projects p ON v.project_id = p.id
        LEFT JOIN users creator ON v.created_by = creator.id
        WHERE v.id = $1`,
        [vendorId]
      );
      
      if (result.rows.length === 0) {
        return { success: false, error: 'Vendor not found' };
      }
      
      return {
        success: true,
        vendor: result.rows[0]
      };
      
    } catch (error) {
      systemLogger.error('Error fetching vendor', { vendorId, error: error.message });
      throw error;
    }
  }

  /**
   * Get vendor by user ID (for vendor users to view their own profile)
   */
  async getVendorByUserId(userId) {
    try {
      const result = await pool.query(
        `SELECT 
          v.*,
          u.username as vendor_username,
          u.email as vendor_email,
          p.name as project_name
        FROM vendors v
        LEFT JOIN users u ON v.vendor_user_id = u.id
        LEFT JOIN projects p ON v.project_id = p.id
        WHERE v.vendor_user_id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        return { success: false, error: 'Vendor not found for this user' };
      }
      
      return {
        success: true,
        vendor: result.rows[0]
      };
      
    } catch (error) {
      systemLogger.error('Error fetching vendor by user', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update vendor
   */
  async updateVendor(vendorId, updateData, updatedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const {
        vendor_name,
        description,
        contact_name,
        contact_email,
        contact_phone,
        address,
        backup_contact_name,
        backup_contact_phone,
        backup_contact_email,
        project_id,
        status,
        vendor_type
      } = updateData;
      
      // Fetch current vendor data for validation
      const currentVendorResult = await client.query(
        'SELECT contact_email, backup_contact_email FROM vendors WHERE id = $1',
        [vendorId]
      );
      
      if (currentVendorResult.rows.length === 0) {
        throw new Error(`Vendor with ID ${vendorId} not found`);
      }
      
      const currentVendor = currentVendorResult.rows[0];
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (contact_email && !emailRegex.test(contact_email)) {
        throw new Error('Invalid contact email format');
      }
      
      // Validate backup contact email if provided
      if (backup_contact_email && !emailRegex.test(backup_contact_email)) {
        throw new Error('Invalid backup contact email format');
      }
      
      // Prevent duplicate primary and backup contacts
      // Use new values if provided, otherwise use existing values
      const finalContactEmail = contact_email || currentVendor.contact_email;
      const finalBackupEmail = backup_contact_email !== undefined ? backup_contact_email : currentVendor.backup_contact_email;
      
      // Treat empty strings as null/absence
      const normalizedContactEmail = finalContactEmail?.trim() || null;
      const normalizedBackupEmail = finalBackupEmail?.trim() || null;
      
      if (normalizedContactEmail && normalizedBackupEmail && 
          normalizedContactEmail.toLowerCase() === normalizedBackupEmail.toLowerCase()) {
        throw new Error('Backup contact cannot be the same as primary contact');
      }
      
      // Build update query dynamically
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (vendor_name !== undefined) {
        updates.push(`vendor_name = $${paramIndex}`);
        params.push(vendor_name);
        paramIndex++;
      }
      
      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }
      
      if (contact_name !== undefined) {
        updates.push(`contact_name = $${paramIndex}`);
        params.push(contact_name);
        paramIndex++;
      }
      
      if (contact_email !== undefined) {
        updates.push(`contact_email = $${paramIndex}`);
        params.push(contact_email);
        paramIndex++;
      }
      
      if (contact_phone !== undefined) {
        updates.push(`contact_phone = $${paramIndex}`);
        params.push(contact_phone);
        paramIndex++;
      }
      
      if (address !== undefined) {
        updates.push(`address = $${paramIndex}`);
        params.push(address);
        paramIndex++;
      }
      
      if (backup_contact_name !== undefined) {
        updates.push(`backup_contact_name = $${paramIndex}`);
        params.push(backup_contact_name);
        paramIndex++;
      }
      
      if (backup_contact_phone !== undefined) {
        updates.push(`backup_contact_phone = $${paramIndex}`);
        params.push(backup_contact_phone);
        paramIndex++;
      }
      
      if (backup_contact_email !== undefined) {
        updates.push(`backup_contact_email = $${paramIndex}`);
        params.push(backup_contact_email);
        paramIndex++;
      }
      
      if (project_id !== undefined) {
        updates.push(`project_id = $${paramIndex}`);
        params.push(project_id);
        paramIndex++;
        
        // If changing project, update project membership
        if (project_id) {
          const vendorResult = await client.query('SELECT vendor_user_id FROM vendors WHERE id = $1', [vendorId]);
          if (vendorResult.rows.length > 0) {
            const userId = vendorResult.rows[0].vendor_user_id;
            
            // Remove from old project memberships
            await client.query('DELETE FROM project_members WHERE user_id = $1', [userId]);
            
            // Add to new project
            await client.query(
              `INSERT INTO project_members (project_id, user_id, invited_by, can_invite, can_manage_members, created_at)
               VALUES ($1, $2, $3, false, false, CURRENT_TIMESTAMP)
               ON CONFLICT (project_id, user_id) DO NOTHING`,
              [project_id, userId, updatedBy]
            );
          }
        }
      }
      
      if (status !== undefined) {
        updates.push(`status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }
      
      if (vendor_type !== undefined) {
        updates.push(`vendor_type = $${paramIndex}`);
        params.push(vendor_type);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return { success: false, error: 'No updates provided' };
      }
      
      // Add updated_at and updated_by
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_by = $${paramIndex}`);
      params.push(updatedBy);
      paramIndex++;
      
      // Add vendor ID
      params.push(vendorId);
      
      const result = await client.query(
        `UPDATE vendors 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        params
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Vendor not found' };
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor updated successfully', { vendorId });
      
      return {
        success: true,
        vendor: result.rows[0]
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error updating vendor', { vendorId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete vendor (soft delete by setting status to inactive)
   */
  async deleteVendor(vendorId, deletedBy) {
    try {
      const result = await pool.query(
        `UPDATE vendors 
         SET status = 'inactive', updated_at = CURRENT_TIMESTAMP, updated_by = $1
         WHERE id = $2
         RETURNING *`,
        [deletedBy, vendorId]
      );
      
      if (result.rows.length === 0) {
        return { success: false, error: 'Vendor not found' };
      }
      
      systemLogger.info('Vendor deleted (deactivated)', { vendorId });
      
      return {
        success: true,
        vendor: result.rows[0]
      };
      
    } catch (error) {
      systemLogger.error('Error deleting vendor', { vendorId, error: error.message });
      throw error;
    }
  }

  /**
   * Get vendors by project
   */
  async getVendorsByProject(projectId) {
    try {
      const result = await pool.query(
        `SELECT 
          v.*,
          u.username as vendor_username,
          u.email as vendor_email
        FROM vendors v
        LEFT JOIN users u ON v.vendor_user_id = u.id
        WHERE v.project_id = $1 AND v.status = 'active'
        ORDER BY v.vendor_name`,
        [projectId]
      );
      
      return {
        success: true,
        vendors: result.rows
      };
      
    } catch (error) {
      systemLogger.error('Error fetching vendors by project', { projectId, error: error.message });
      throw error;
    }
  }
}

module.exports = new VendorService();
