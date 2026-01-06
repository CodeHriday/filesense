/**
 * Vendor Management Service
 * Handles vendor CRUD operations, user account creation, and project associations
 */

const { getClient, query } = require('../config/database');
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
   * Generate unique project code for vendor
   * @param {string} vendorName - Vendor name to include in project code
   */
  async generateProjectCode(vendorName) {
    let sanitizedName = vendorName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10);
    
    if (!sanitizedName) {
      sanitizedName = 'VENDOR';
    }
    
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `VEND-${sanitizedName}-${randomSuffix}`;
  }

  /**
   * Create vendor with associated user account
   * @param {Object} vendorData - Vendor information
   * @param {number} createdBy - User ID creating the vendor
   * @returns {Promise<Object>} Created vendor with user account
   */
  async createVendor(vendorData, createdBy) {
    const client = await getClient();
    
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
      
      // Email validation - use more specific pattern to prevent ReDoS
      const emailRegex = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$/;
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
      
      // Note: vendor_id will be set after vendor record is created (see below)
      
      // Auto-create or assign project
      let finalProjectId = project_id;
      
      if (!finalProjectId) {
        // Auto-create a project for this vendor (always external type)
        // Generate unique project code
        let projectCode = await this.generateProjectCode(vendor_name);
        
        // Ensure project code is unique
        let codeExists = await client.query(
          'SELECT id FROM projects WHERE name = $1',
          [projectCode]
        );
        
        while (codeExists.rows.length > 0) {
          projectCode = await this.generateProjectCode(vendor_name);
          codeExists = await client.query(
            'SELECT id FROM projects WHERE name = $1',
            [projectCode]
          );
        }
        
        const projectDescription = `Auto-created project for vendor: ${vendor_name}`;
        
        const newProjectResult = await client.query(
          `INSERT INTO projects (name, description, project_type, created_at, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [projectCode, projectDescription, 'external']
        );
        
        finalProjectId = newProjectResult.rows[0].id;
        
        systemLogger.info('Auto-created external project for vendor', { 
          projectId: finalProjectId, 
          projectCode,
          projectType: 'external',
          vendorName: vendor_name 
        });
      } else {
        // Verify provided project exists and is external
        const projectResult = await client.query(
          'SELECT id, project_type FROM projects WHERE id = $1',
          [project_id]
        );
        
        if (projectResult.rows.length === 0) {
          throw new Error(`Project with ID ${project_id} not found`);
        }
        
        // Verify that the project is external type
        if (projectResult.rows[0].project_type !== 'external') {
          throw new Error('Vendors can only be associated with external projects');
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
      
      // Add secondary/backup contact to project if provided
      if (backup_contact_email) {
        systemLogger.info('Processing secondary contact', { backupEmail: backup_contact_email });
        
        // Check if user with backup email already exists
        const backupUserResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [backup_contact_email]
        );
        
        let backupUserId;
        
        if (backupUserResult.rows.length > 0) {
          // User exists - use existing user
          backupUserId = backupUserResult.rows[0].id;
          systemLogger.info('Using existing user account for secondary contact', { 
            userId: backupUserId, 
            email: backup_contact_email 
          });
        } else {
          // Create new user account for secondary contact
          const backupUsername = backup_contact_email;
          const tempPassword = crypto.randomBytes(16).toString('hex');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          // Get Vendor role ID
          const roleResult = await client.query(
            'SELECT id FROM roles WHERE name = $1',
            ['Vendor']
          );
          
          if (roleResult.rows.length === 0) {
            throw new Error('Vendor role not found');
          }
          
          const vendorRoleId = roleResult.rows[0].id;
          
          // Create user
          const newUserResult = await client.query(
            `INSERT INTO users (username, email, password, first_name, last_name, auth_provider, created_at)
             VALUES ($1, $2, $3, $4, $5, 'local', CURRENT_TIMESTAMP)
             RETURNING id`,
            [backupUsername, backup_contact_email, hashedPassword, backup_contact_name || 'Backup Contact', '']
          );
          
          backupUserId = newUserResult.rows[0].id;
          
          // Assign Vendor role
          await client.query(
            `INSERT INTO user_roles (user_id, role_id, created_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            [backupUserId, vendorRoleId]
          );
          
          systemLogger.info('Created new user account for secondary contact', { 
            userId: backupUserId, 
            email: backup_contact_email
          });
        }
        
        // Add secondary contact to project if not already a member
        const backupMemberCheck = await client.query(
          'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
          [finalProjectId, backupUserId]
        );
        
        if (backupMemberCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO project_members (project_id, user_id, invited_by, can_invite, can_manage_members, created_at)
             VALUES ($1, $2, $3, false, false, CURRENT_TIMESTAMP)`,
            [finalProjectId, backupUserId, validInvitedBy]
          );
          systemLogger.info('Successfully added secondary contact to project', { 
            projectId: finalProjectId, 
            userId: backupUserId 
          });
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
      
      // Update vendor_id for primary contact user
      await client.query(
        'UPDATE users SET vendor_id = $1 WHERE id = $2',
        [vendor.id, vendorUserId]
      );
      systemLogger.info('Set vendor_id for primary contact', { vendorId: vendor.id, userId: vendorUserId });
      
      // Update vendor_id for secondary contact user if exists
      if (backup_contact_email) {
        const backupUserResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [backup_contact_email]
        );
        
        if (backupUserResult.rows.length > 0) {
          const backupUserId = backupUserResult.rows[0].id;
          await client.query(
            'UPDATE users SET vendor_id = $1 WHERE id = $2',
            [vendor.id, backupUserId]
          );
          systemLogger.info('Set vendor_id for secondary contact', { vendorId: vendor.id, userId: backupUserId });
        }
      }
      
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
      
      // Exclude deleted vendors by default unless explicitly requested
      if (filters.status) {
        whereClause += ` AND v.status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
      } else {
        whereClause += ` AND v.status != 'deleted'`;
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
      const countResult = await query(
        `SELECT COUNT(*) FROM vendors v ${whereClause}`,
        params
      );
      
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Get paginated data with user and project info
      params.push(pageSize, offset);
      const result = await query(
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
      const result = await query(
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
      const result = await query(
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
    const client = await getClient();
    
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
      
      // Fetch current vendor data for validation and tracking contact changes
      const currentVendorResult = await client.query(
        'SELECT contact_email, backup_contact_email, vendor_user_id FROM vendors WHERE id = $1',
        [vendorId]
      );
      
      if (currentVendorResult.rows.length === 0) {
        throw new Error(`Vendor with ID ${vendorId} not found`);
      }
      
      const currentVendor = currentVendorResult.rows[0];
      
      // Track whether contacts are being changed (for vendor_id management)
      // Primary changed if: explicitly provided AND different from current (including null/empty)
      const primaryContactChanged = contact_email !== undefined && contact_email !== currentVendor.contact_email;
      const backupContactChanged = backup_contact_email !== undefined && backup_contact_email !== currentVendor.backup_contact_email;
      
      // Email validation - use more specific pattern to prevent ReDoS
      const emailRegex = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$/;
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
      
      const updatedVendor = result.rows[0];
      
      // Handle vendor_id updates for primary contact change
      if (primaryContactChanged) {
        // Clear vendor_id from old primary contact if they're not the backup contact
        if (currentVendor.contact_email) {
          const oldPrimaryResult = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [currentVendor.contact_email]
          );
          
          if (oldPrimaryResult.rows.length > 0) {
            const oldPrimaryUserId = oldPrimaryResult.rows[0].id;
            
            // Only clear vendor_id if this user is not the backup contact for this vendor
            const isBackupContact = currentVendor.backup_contact_email && 
                                   currentVendor.backup_contact_email.toLowerCase() === currentVendor.contact_email.toLowerCase();
            
            if (!isBackupContact) {
              // Check if user is associated with any other vendors as primary or backup
              const otherVendorCheck = await client.query(
                `SELECT id FROM vendors 
                 WHERE id != $1 AND (
                   contact_email = $2 OR backup_contact_email = $2
                 )`,
                [vendorId, currentVendor.contact_email]
              );
              
              // Only clear if not associated with other vendors
              if (otherVendorCheck.rows.length === 0) {
                await client.query(
                  'UPDATE users SET vendor_id = NULL WHERE id = $1',
                  [oldPrimaryUserId]
                );
                systemLogger.info('Cleared vendor_id from old primary contact', { 
                  vendorId, 
                  userId: oldPrimaryUserId 
                });
              }
            }
          }
        }
        
        // Set vendor_id for new primary contact (only if not null/empty)
        if (contact_email && contact_email.trim()) {
          const newPrimaryResult = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [contact_email]
          );
          
          if (newPrimaryResult.rows.length > 0) {
            const newPrimaryUserId = newPrimaryResult.rows[0].id;
            await client.query(
              'UPDATE users SET vendor_id = $1 WHERE id = $2',
              [vendorId, newPrimaryUserId]
            );
            systemLogger.info('Set vendor_id for new primary contact', { 
              vendorId, 
              userId: newPrimaryUserId 
            });
          }
        }
      }
      
      // Handle vendor_id updates for backup contact change
      if (backupContactChanged) {
        // Clear vendor_id from old backup contact
        if (currentVendor.backup_contact_email) {
          const oldBackupResult = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [currentVendor.backup_contact_email]
          );
          
          if (oldBackupResult.rows.length > 0) {
            const oldBackupUserId = oldBackupResult.rows[0].id;
            
            // Only clear vendor_id if this user is not the primary contact for this vendor
            const isPrimaryContact = currentVendor.contact_email && 
                                     currentVendor.contact_email.toLowerCase() === currentVendor.backup_contact_email.toLowerCase();
            
            if (!isPrimaryContact) {
              // Check if user is associated with any other vendors
              const otherVendorCheck = await client.query(
                `SELECT id FROM vendors 
                 WHERE id != $1 AND (
                   contact_email = $2 OR backup_contact_email = $2
                 )`,
                [vendorId, currentVendor.backup_contact_email]
              );
              
              // Only clear if not associated with other vendors
              if (otherVendorCheck.rows.length === 0) {
                await client.query(
                  'UPDATE users SET vendor_id = NULL WHERE id = $1',
                  [oldBackupUserId]
                );
                systemLogger.info('Cleared vendor_id from old backup contact', { 
                  vendorId, 
                  userId: oldBackupUserId 
                });
              }
            }
          }
        }
      }
      
      // Add secondary contact to project if backup_contact_email was added/changed
      if (backup_contact_email && normalizedBackupEmail && 
          normalizedBackupEmail !== currentVendor.backup_contact_email) {
        
        systemLogger.info('Processing secondary contact update', { 
          vendorId,
          backupEmail: backup_contact_email 
        });
        
        // Check if user with backup email already exists
        const backupUserResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [backup_contact_email]
        );
        
        let backupUserId;
        
        if (backupUserResult.rows.length > 0) {
          backupUserId = backupUserResult.rows[0].id;
          systemLogger.info('Using existing user for secondary contact', { 
            userId: backupUserId, 
            email: backup_contact_email 
          });
        } else {
          // Create new user account for secondary contact
          const backupUsername = backup_contact_email;
          const tempPassword = crypto.randomBytes(16).toString('hex');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          // Get Vendor role ID
          const roleResult = await client.query(
            'SELECT id FROM roles WHERE name = $1',
            ['Vendor']
          );
          
          if (roleResult.rows.length === 0) {
            throw new Error('Vendor role not found');
          }
          
          const vendorRoleId = roleResult.rows[0].id;
          
          // Create user
          const newUserResult = await client.query(
            `INSERT INTO users (username, email, password, first_name, last_name, auth_provider, created_at)
             VALUES ($1, $2, $3, $4, $5, 'local', CURRENT_TIMESTAMP)
             RETURNING id`,
            [backupUsername, backup_contact_email, hashedPassword, backup_contact_name || 'Backup Contact', '']
          );
          
          backupUserId = newUserResult.rows[0].id;
          
          // Assign Vendor role
          await client.query(
            `INSERT INTO user_roles (user_id, role_id, created_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            [backupUserId, vendorRoleId]
          );
          
          systemLogger.info('Created new user for secondary contact', { 
            userId: backupUserId, 
            email: backup_contact_email
          });
        }
        
        // Set vendor_id for the backup contact user (new or existing)
        if (backupUserId) {
          await client.query(
            'UPDATE users SET vendor_id = $1 WHERE id = $2',
            [vendorId, backupUserId]
          );
          systemLogger.info('Set vendor_id for backup contact', { 
            vendorId, 
            userId: backupUserId 
          });
        }
        
        // Add secondary contact to project
        const projectIdToUse = project_id || updatedVendor.project_id;
        
        if (projectIdToUse && backupUserId) {
          const backupMemberCheck = await client.query(
            'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
            [projectIdToUse, backupUserId]
          );
          
          if (backupMemberCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO project_members (project_id, user_id, invited_by, can_invite, can_manage_members, created_at)
               VALUES ($1, $2, $3, false, false, CURRENT_TIMESTAMP)`,
              [projectIdToUse, backupUserId, updatedBy]
            );
            systemLogger.info('Added secondary contact to project', { 
              projectId: projectIdToUse, 
              userId: backupUserId 
            });
          }
        }
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor updated successfully', { vendorId });
      
      return {
        success: true,
        vendor: updatedVendor
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
   * Check vendor dependencies before deletion
   * Returns list of blocking dependencies
   */
  async checkVendorDependencies(vendorId) {
    try {
      const dependencies = {
        hasBlockingDependencies: false,
        activeAgreements: [],
        lockedAgreements: [],
        fullyApprovedAgreements: [],
        totalCount: 0
      };
      
      // Check for any vendor agreements
      const agreementResult = await query(
        `SELECT id, status, is_locked, approval_status, created_at
         FROM vendor_agreements
         WHERE vendor_id = $1
         ORDER BY created_at DESC`,
        [vendorId]
      );
      
      const agreements = agreementResult.rows;
      
      // Categorize agreements
      for (const agreement of agreements) {
        // Check for active agreements
        if (agreement.status === 'active') {
          dependencies.activeAgreements.push(agreement);
        }
        
        // Check for locked agreements
        if (agreement.is_locked === true) {
          dependencies.lockedAgreements.push(agreement);
        }
        
        // Check for fully approved agreements
        if (agreement.approval_status === 'fully_approved') {
          dependencies.fullyApprovedAgreements.push(agreement);
        }
      }
      
      // Determine if there are blocking dependencies
      const hasActive = dependencies.activeAgreements.length > 0;
      const hasLocked = dependencies.lockedAgreements.length > 0;
      const hasApproved = dependencies.fullyApprovedAgreements.length > 0;
      
      dependencies.hasBlockingDependencies = hasActive || hasLocked || hasApproved;
      dependencies.totalCount = Math.max(
        dependencies.activeAgreements.length,
        dependencies.lockedAgreements.length,
        dependencies.fullyApprovedAgreements.length
      );
      
      systemLogger.info('Checked vendor dependencies', {
        vendorId,
        hasBlockingDependencies: dependencies.hasBlockingDependencies,
        activeCount: dependencies.activeAgreements.length,
        lockedCount: dependencies.lockedAgreements.length,
        approvedCount: dependencies.fullyApprovedAgreements.length
      });
      
      return dependencies;
      
    } catch (error) {
      systemLogger.error('Error checking vendor dependencies', { vendorId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete vendor (hard delete with dependency checks)
   * Only allows deletion of orphan vendors without active/locked/approved agreements
   */
  async deleteVendor(vendorId, deletedBy) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // First, check if vendor exists
      const vendorResult = await client.query(
        'SELECT * FROM vendors WHERE id = $1',
        [vendorId]
      );
      
      if (vendorResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { 
          success: false, 
          error: 'Vendor not found',
          canDelete: false
        };
      }
      
      const vendor = vendorResult.rows[0];
      
      // Check for blocking dependencies
      const dependencies = await this.checkVendorDependencies(vendorId);
      
      if (dependencies.hasBlockingDependencies) {
        await client.query('ROLLBACK');
        
        // Build detailed error message
        const messages = [];
        if (dependencies.activeAgreements.length > 0) {
          messages.push(`${dependencies.activeAgreements.length} active agreement(s)`);
        }
        if (dependencies.lockedAgreements.length > 0) {
          messages.push(`${dependencies.lockedAgreements.length} locked agreement(s)`);
        }
        if (dependencies.fullyApprovedAgreements.length > 0) {
          messages.push(`${dependencies.fullyApprovedAgreements.length} fully approved agreement(s)`);
        }
        
        const errorMessage = `Cannot delete vendor - has ${messages.join(', ')}. Please deactivate or reassign agreements first.`;
        
        systemLogger.warn('Vendor deletion blocked due to dependencies', {
          vendorId,
          dependencies: {
            active: dependencies.activeAgreements.length,
            locked: dependencies.lockedAgreements.length,
            approved: dependencies.fullyApprovedAgreements.length
          }
        });
        
        return {
          success: false,
          error: errorMessage,
          canDelete: false,
          dependencies: {
            activeCount: dependencies.activeAgreements.length,
            lockedCount: dependencies.lockedAgreements.length,
            approvedCount: dependencies.fullyApprovedAgreements.length,
            totalCount: dependencies.totalCount
          }
        };
      }
      
      // No blocking dependencies - proceed with deletion
      systemLogger.info('No blocking dependencies found, proceeding with vendor deletion', { vendorId });
      
      // 1. Delete vendor connections (safely handle both numeric and string vendor_id in JSON)
      const deleteConnectionsResult = await client.query(
        `DELETE FROM storage_connections 
         WHERE (config->>'vendor_id') = $1::text 
         OR (config->'vendor_id')::text = $2
         RETURNING connection_id`,
        [vendorId.toString(), `"${vendorId}"`]
      );
      
      systemLogger.info('Deleted vendor connections', { 
        vendorId, 
        count: deleteConnectionsResult.rows.length 
      });
      
      // 2. Clear vendor_id from all users associated with this vendor
      // (primary and secondary contacts)
      const contactEmails = [vendor.contact_email];
      if (vendor.backup_contact_email) {
        contactEmails.push(vendor.backup_contact_email);
      }
      
      for (const email of contactEmails) {
        if (!email) continue;
        
        const userResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );
        
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          
          // Check if user is associated with other vendors
          const otherVendorCheck = await client.query(
            `SELECT id FROM vendors 
             WHERE id != $1 AND (
               contact_email = $2 OR backup_contact_email = $2
             )`,
            [vendorId, email]
          );
          
          // Only clear vendor_id if not associated with other vendors
          if (otherVendorCheck.rows.length === 0) {
            await client.query(
              'UPDATE users SET vendor_id = NULL WHERE id = $1',
              [userId]
            );
            systemLogger.info('Cleared vendor_id from user (vendor deletion)', { 
              vendorId, 
              userId,
              email
            });
          }
        }
      }
      
      // 3. Remove vendor users from project
      const projectId = vendor.project_id;
      const vendorUserId = vendor.vendor_user_id;
      
      if (projectId && vendorUserId) {
        await client.query(
          'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
          [projectId, vendorUserId]
        );
        systemLogger.info('Removed primary vendor user from project', { projectId, vendorUserId });
      }
      
      // 4. Remove secondary contact from project if exists
      if (vendor.backup_contact_email) {
        const backupUserResult = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [vendor.backup_contact_email]
        );
        
        if (backupUserResult.rows.length > 0 && projectId) {
          const backupUserId = backupUserResult.rows[0].id;
          await client.query(
            'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
            [projectId, backupUserId]
          );
          systemLogger.info('Removed secondary vendor user from project', { projectId, backupUserId });
        }
      }
      
      // 5. Delete the associated project if it's only used by this vendor
      if (projectId) {
        // Check if any other vendors use this project
        const otherVendorsCheck = await client.query(
          'SELECT id FROM vendors WHERE project_id = $1 AND id != $2',
          [projectId, vendorId]
        );
        
        // Check if project has any other members besides the vendor contacts
        const otherMembersCheck = await client.query(
          `SELECT COUNT(*) as count FROM project_members WHERE project_id = $1`,
          [projectId]
        );
        
        const hasOtherMembers = parseInt(otherMembersCheck.rows[0].count) > 0;
        
        // Only delete project if no other vendors use it and no other members exist
        if (otherVendorsCheck.rows.length === 0 && !hasOtherMembers) {
          await client.query(
            'DELETE FROM projects WHERE id = $1',
            [projectId]
          );
          systemLogger.info('Deleted vendor project', { 
            projectId,
            vendorId 
          });
        } else {
          systemLogger.info('Project not deleted - still in use', { 
            projectId,
            otherVendors: otherVendorsCheck.rows.length,
            hasOtherMembers
          });
        }
      }
      
      // 6. Delete the vendor record (hard delete)
      await client.query(
        'DELETE FROM vendors WHERE id = $1',
        [vendorId]
      );
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor hard deleted successfully', { 
        vendorId,
        vendorCode: vendor.vendor_code,
        deletedBy 
      });
      
      return {
        success: true,
        message: 'Vendor deleted successfully',
        vendor: vendor,
        canDelete: true,
        deletedConnections: deleteConnectionsResult.rows.length
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error deleting vendor', { 
        vendorId, 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get vendors by project
   */
  async getVendorsByProject(projectId) {
    try {
      const result = await query(
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
