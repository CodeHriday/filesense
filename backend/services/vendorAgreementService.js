/**
 * Vendor Agreement Service
 * Handles vendor agreements, schema management, and dual approval workflow
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { parseSchemaFile, validateSchema } = require('../utils/schemaParser');
const crypto = require('crypto');

class VendorAgreementService {
  /**
   * Generate unique agreement code
   */
  async generateAgreementCode(vendorId, fileName) {
    const vendorResult = await pool.query('SELECT vendor_code FROM vendors WHERE id = $1', [vendorId]);
    const vendorCode = vendorResult.rows[0]?.vendor_code || 'VND';
    const filePrefix = fileName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `AGR-${vendorCode}-${filePrefix}-${randomSuffix}`;
  }

  /**
   * Enrich agreement with rejection/acceptance timestamps from approvals table
   * Adds vendor_rejected_at, vendor_accepted_at, manager_rejected_at, manager_approved_at, 
   * governance_rejected_at, governance_approved_at to the agreement object
   */
  async enrichAgreementWithTimestamps(agreement) {
    try {
      const result = await pool.query(
        `SELECT approval_stage, action, approval_timestamp 
         FROM vendor_agreement_approvals 
         WHERE agreement_id = $1 
         ORDER BY approval_timestamp DESC`,
        [agreement.id]
      );
      
      // Add timestamp fields based on approvals
      for (const approval of result.rows) {
        if (approval.approval_stage === 'vendor_acceptance') {
          if (approval.action === 'rejected') {
            agreement.vendor_rejected_at = approval.approval_timestamp;
          } else if (approval.action === 'accepted') {
            agreement.vendor_accepted_at = approval.approval_timestamp;
          }
        } else if (approval.approval_stage === 'manager_approval') {
          if (approval.action === 'rejected') {
            agreement.manager_rejected_at = approval.approval_timestamp;
          } else if (approval.action === 'approved') {
            agreement.manager_approved_at = approval.approval_timestamp;
          }
        } else if (approval.approval_stage === 'governance_approval') {
          if (approval.action === 'rejected') {
            agreement.governance_rejected_at = approval.approval_timestamp;
          } else if (approval.action === 'approved') {
            agreement.governance_approved_at = approval.approval_timestamp;
          }
        }
      }
      
      return agreement;
    } catch (error) {
      systemLogger.error('Error enriching agreement with timestamps', { agreementId: agreement.id, error: error.message });
      return agreement; // Return original if enrichment fails
    }
  }

  /**
   * Create vendor agreement
   * @param {Object} agreementData - Agreement data
   * @param {number} createdBy - User ID creating the agreement
   * @param {string} schemaFilePath - Optional schema file path
   * @param {string} schemaFileType - Optional schema file type
   * @param {Object} creatingUser - Full user object with email and user_type
   */
  async createAgreement(agreementData, createdBy, schemaFilePath = null, schemaFileType = null, creatingUser = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const {
        vendor_id,
        file_name,
        file_description,
        schema,
        frequency,
        frequency_description,
        vendor_department_team,
        vendor_department_email,
        vendor_type,
        vendor_onboarding_date,
        file_owner_user_id,
        primary_contact_name,
        primary_contact_phone,
        primary_contact_email,
        primary_contact_designation,
        secondary_contact_name,
        secondary_contact_phone,
        secondary_contact_email,
        secondary_contact_designation,
        owner_contact,
        metadata,
        vendor_connection_id,
        drop_location_path,
        manager_contact,
        contains_pii,
        file_type,
        data_classification,
        domain,
        retention_days,
        expected_arrival_time,
        delivery_method,
        status
      } = agreementData;
      
      // Check for duplicate file_name
      if (file_name) {
        const duplicateCheck = await client.query(
          'SELECT id FROM vendor_agreements WHERE LOWER(TRIM(file_name)) = LOWER(TRIM($1))',
          [file_name]
        );
        
        if (duplicateCheck.rows.length > 0) {
          throw new Error(`An agreement with the file name "${file_name}" already exists. Please use a different file name.`);
        }
      }
      
      // Determine if this is a draft
      const isDraft = status === 'draft';
      
      // Validation - skip for drafts, enforce for active agreements
      if (!isDraft) {
        if (!vendor_id || !file_name || !file_owner_user_id || !vendor_connection_id) {
          throw new Error('vendor_id, file_name, file_owner_user_id, and vendor_connection_id are required');
        }
      }
      
      // Verify vendor exists and get project_id (skip if draft and no vendor_id)
      let project_id = null;
      let vendorUserId = null;
      
      if (vendor_id) {
        const vendorCheck = await client.query('SELECT id, project_id, vendor_user_id FROM vendors WHERE id = $1', [vendor_id]);
        if (vendorCheck.rows.length === 0) {
          throw new Error('Vendor not found');
        }
        
        project_id = vendorCheck.rows[0].project_id;
        vendorUserId = vendorCheck.rows[0].vendor_user_id;
        
        // Vendor user validation: if creating user is a vendor user, they can only create contracts for their associated vendor
        if (creatingUser && creatingUser.user_type === 'Vendor') {
          if (vendorUserId !== createdBy) {
            throw new Error('Vendor users can only create agreements for their associated vendor');
          }
        }
      }
      
      // Verify file owner exists and get contact info (skip if draft and no file_owner_user_id)
      let finalManagerContact = manager_contact;
      
      if (file_owner_user_id) {
        const ownerCheck = await client.query('SELECT id, email FROM users WHERE id = $1', [file_owner_user_id]);
        if (ownerCheck.rows.length === 0) {
          throw new Error('File owner user not found');
        }
        
        // Auto-populate manager_contact from file owner's email if not provided
        finalManagerContact = manager_contact || ownerCheck.rows[0].email;
      }
      
      // Auto-populate primary_contact_email for vendor users if not provided
      let finalPrimaryContactEmail = primary_contact_email;
      if (creatingUser && creatingUser.user_type === 'Vendor' && !primary_contact_email && creatingUser.email) {
        finalPrimaryContactEmail = creatingUser.email;
        systemLogger.info('Auto-populated primary_contact_email for vendor user', { 
          userId: createdBy, 
          email: creatingUser.email 
        });
      }
      
      // Validate vendor_connection_id (skip if draft and no vendor_connection_id)
      if (vendor_connection_id) {
        const connCheck = await client.query(
          `SELECT connection_id FROM storage_connections 
           WHERE connection_id = $1 AND connection_user = 'External' AND connection_direction IN ('source', 'target', 'drop')`,
          [vendor_connection_id]
        );
        
        if (connCheck.rows.length === 0) {
          throw new Error('Invalid vendor connection or connection not configured for file operations');
        }
      }
      
      // Parse schema if file is provided (schema is optional)
      let parsedSchema = schema;
      
      if (schemaFilePath) {
        parsedSchema = await parseSchemaFile(schemaFilePath, schemaFileType);
        validateSchema(parsedSchema);
      } else if (schema) {
        // Log what we received for debugging
        systemLogger.info('Received schema data', { 
          schemaType: typeof schema, 
          schemaValue: JSON.stringify(schema).substring(0, 200) 
        });
        
        // Handle string schemas
        if (typeof schema === 'string' && schema.trim() !== '' && schema !== '[]') {
          try {
            const schemaObj = JSON.parse(schema);
            if (Array.isArray(schemaObj) && schemaObj.length > 0) {
              // Filter out empty objects - check for any meaningful data
              const validRows = schemaObj.filter(row => {
                if (!row || typeof row !== 'object') return false;
                // Check if row has any non-empty, non-null values
                const hasData = (row.column_name && row.column_name.trim()) || 
                               (row.name && row.name.trim()) || 
                               (row.data_type && row.data_type.trim()) || 
                               (row.type && row.type.trim());
                return hasData;
              });
              
              if (validRows.length > 0) {
                validateSchema(validRows);
                parsedSchema = validRows;
              } else {
                systemLogger.info('Schema has no valid rows after filtering, setting to null');
                parsedSchema = null;
              }
            } else {
              parsedSchema = null;
            }
          } catch (e) {
            systemLogger.error('Error parsing schema JSON', { error: e.message });
            parsedSchema = null;
          }
        } else {
          // Schema is empty string or '[]'
          parsedSchema = null;
        }
      } else {
        // Schema is optional - set to null if not provided
        parsedSchema = null;
      }
      
      // Generate agreement code (only if file_name is provided)
      let agreementCode = null;
      if (file_name) {
        agreementCode = await this.generateAgreementCode(vendor_id || 0, file_name);
        
        // Ensure agreement code is unique
        let codeExists = await client.query(
          'SELECT id FROM vendor_agreements WHERE agreement_code = $1',
          [agreementCode]
        );
        
        while (codeExists.rows.length > 0) {
          agreementCode = await this.generateAgreementCode(vendor_id || 0, file_name);
          codeExists = await client.query(
            'SELECT id FROM vendor_agreements WHERE agreement_code = $1',
            [agreementCode]
          );
        }
      }
      
      // Set status - default to 'active' if not specified
      const finalStatus = status || 'active';
      
      // Create agreement
      const result = await client.query(
        `INSERT INTO vendor_agreements (
          vendor_id, agreement_code, file_name, file_description, schema,
          frequency, frequency_description, vendor_department_team, vendor_department_email, vendor_type, vendor_onboarding_date, file_owner_user_id,
          primary_contact_name, primary_contact_phone, primary_contact_email, primary_contact_designation,
          secondary_contact_name, secondary_contact_phone, secondary_contact_email, secondary_contact_designation,
          owner_contact, metadata,
          vendor_connection_id, drop_location_path, project_id,
          manager_contact,
          contains_pii, file_type, data_classification, domain, retention_days, expected_arrival_time, delivery_method,
          status, version, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, 1, $35, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          vendor_id, agreementCode, file_name, file_description, parsedSchema ? JSON.stringify(parsedSchema) : null,
          frequency, frequency_description, vendor_department_team, vendor_department_email, vendor_type, vendor_onboarding_date || null, file_owner_user_id,
          primary_contact_name, primary_contact_phone, finalPrimaryContactEmail, primary_contact_designation,
          secondary_contact_name, secondary_contact_phone, secondary_contact_email, secondary_contact_designation,
          owner_contact, metadata ? JSON.stringify(metadata) : null,
          vendor_connection_id, drop_location_path || null, project_id,
          finalManagerContact,
          contains_pii, file_type, data_classification, domain, retention_days, expected_arrival_time, delivery_method,
          finalStatus,
          createdBy
        ]
      );
      
      const agreement = result.rows[0];
      
      // Log change
      await client.query(
        `INSERT INTO vendor_agreement_changes (
          agreement_id, change_type, new_data, changes_summary, to_version, changed_by, changed_at
        ) VALUES ($1, 'created', $2, 'Agreement created', 1, $3, CURRENT_TIMESTAMP)`,
        [agreement.id, JSON.stringify(agreement), createdBy]
      );
      
      // Create notifications for vendor users (primary and secondary contacts)
      // Skip notification if this is a draft or if no contacts are specified
      if (finalStatus !== 'draft') {
        const notifyEmails = [];
        
        if (finalPrimaryContactEmail) {
          notifyEmails.push(finalPrimaryContactEmail);
        }
        
        if (secondary_contact_email && secondary_contact_email !== finalPrimaryContactEmail) {
          notifyEmails.push(secondary_contact_email);
        }
        
        // Get user IDs for these emails
        if (notifyEmails.length > 0) {
          const usersResult = await client.query(
            'SELECT id, email FROM users WHERE email = ANY($1)',
            [notifyEmails]
          );
          
          for (const user of usersResult.rows) {
            await client.query(
              `INSERT INTO notifications (
                user_id, notification_type, title, message, entity_type, entity_id,
                action_url, metadata
              ) VALUES ($1, 'vendor_contract_pending_vendor', $2, $3, 'vendor_agreement', $4, $5, $6)`,
              [
                user.id,
                'New Vendor Contract Awaiting Your Review',
                `A new contract "${file_name || 'Untitled'}" has been created and requires your acceptance to proceed.`,
                agreement.id,
                `/vendor-agreements/${agreement.id}`,
                JSON.stringify({ 
                  agreement_id: agreement.id, 
                  agreement_code: agreementCode,
                  file_name: file_name 
                })
              ]
            );
            
            systemLogger.info('Created notification for vendor contact', {
              userId: user.id,
              email: user.email,
              agreementId: agreement.id
            });
          }
        }
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor agreement created', { 
        agreementId: agreement.id, 
        agreementCode: agreement.agreement_code 
      });
      
      return {
        success: true,
        agreement
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating vendor agreement', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update vendor agreement (only if not locked or by Admin)
   */
  async updateAgreement(agreementId, updateData, updatedBy, isAdmin = false, schemaFilePath = null, schemaFileType = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current agreement
      const currentResult = await client.query(
        'SELECT * FROM vendor_agreements WHERE id = $1',
        [agreementId]
      );
      
      if (currentResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const current = currentResult.rows[0];
      
      // Check if locked
      if (current.is_locked && !isAdmin) {
        throw new Error('Agreement is locked. Only Admin can make changes.');
      }
      
      const {
        file_name,
        file_description,
        schema,
        frequency,
        frequency_description,
        vendor_department_team,
        vendor_department_email,
        vendor_type,
        vendor_onboarding_date,
        file_owner_user_id,
        primary_contact_name,
        primary_contact_phone,
        primary_contact_email,
        primary_contact_designation,
        secondary_contact_name,
        secondary_contact_phone,
        secondary_contact_email,
        secondary_contact_designation,
        owner_contact,
        metadata,
        vendor_connection_id,
        drop_location_path,
        manager_contact,
        contains_pii,
        file_type,
        data_classification,
        domain,
        retention_days,
        expected_arrival_time,
        delivery_method
      } = updateData;
      
      // Check for duplicate file_name (excluding current agreement)
      if (file_name !== undefined && file_name !== current.file_name) {
        const duplicateCheck = await client.query(
          'SELECT id FROM vendor_agreements WHERE LOWER(TRIM(file_name)) = LOWER(TRIM($1)) AND id != $2',
          [file_name, agreementId]
        );
        
        if (duplicateCheck.rows.length > 0) {
          throw new Error(`An agreement with the file name "${file_name}" already exists. Please use a different file name.`);
        }
      }
      
      // Validate vendor_connection_id if provided (optional in updates)
      if (vendor_connection_id !== undefined && vendor_connection_id) {
        const connCheck = await client.query(
          `SELECT connection_id FROM storage_connections 
           WHERE connection_id = $1 AND connection_user = 'External' AND connection_direction IN ('source', 'target', 'drop')`,
          [vendor_connection_id]
        );
        
        if (connCheck.rows.length === 0) {
          throw new Error('Invalid vendor connection or connection not configured for file operations');
        }
      }
      
      // Parse schema if file is provided (schema is optional)
      let parsedSchema = schema;
      
      if (schemaFilePath) {
        parsedSchema = await parseSchemaFile(schemaFilePath, schemaFileType);
        validateSchema(parsedSchema);
      } else if (schema) {
        // Log what we received for debugging
        systemLogger.info('Received schema data for update', { 
          schemaType: typeof schema, 
          schemaValue: JSON.stringify(schema).substring(0, 200) 
        });
        
        // Handle string schemas
        if (typeof schema === 'string' && schema.trim() !== '' && schema !== '[]') {
          try {
            const schemaObj = JSON.parse(schema);
            if (Array.isArray(schemaObj) && schemaObj.length > 0) {
              // Filter out empty objects - check for any meaningful data
              const validRows = schemaObj.filter(row => {
                if (!row || typeof row !== 'object') return false;
                // Check if row has any non-empty, non-null values
                const hasData = (row.column_name && row.column_name.trim()) || 
                               (row.name && row.name.trim()) || 
                               (row.data_type && row.data_type.trim()) || 
                               (row.type && row.type.trim());
                return hasData;
              });
              
              if (validRows.length > 0) {
                validateSchema(validRows);
                parsedSchema = validRows;
              } else {
                systemLogger.info('Schema has no valid rows after filtering, setting to null');
                parsedSchema = null;
              }
            } else {
              parsedSchema = null;
            }
          } catch (e) {
            systemLogger.error('Error parsing schema JSON for update', { error: e.message });
            parsedSchema = null;
          }
        } else {
          // Schema is empty string or '[]'
          parsedSchema = null;
        }
      } else if (schema !== undefined) {
        // Schema is being explicitly cleared
        parsedSchema = null;
      }
      
      // Build update query
      const updates = [];
      const params = [];
      let paramIndex = 1;
      const changes = {};
      
      if (file_name !== undefined && file_name !== current.file_name) {
        updates.push(`file_name = $${paramIndex}`);
        params.push(file_name);
        changes.file_name = { from: current.file_name, to: file_name };
        paramIndex++;
      }
      
      if (file_description !== undefined && file_description !== current.file_description) {
        updates.push(`file_description = $${paramIndex}`);
        params.push(file_description);
        changes.file_description = { from: current.file_description, to: file_description };
        paramIndex++;
      }
      
      if (parsedSchema !== undefined && JSON.stringify(parsedSchema) !== JSON.stringify(current.schema)) {
        updates.push(`schema = $${paramIndex}`);
        params.push(parsedSchema ? JSON.stringify(parsedSchema) : null);
        changes.schema = { from: current.schema, to: parsedSchema };
        paramIndex++;
      }
      
      if (frequency !== undefined && frequency !== current.frequency) {
        updates.push(`frequency = $${paramIndex}`);
        params.push(frequency);
        changes.frequency = { from: current.frequency, to: frequency };
        paramIndex++;
      }
      
      if (frequency_description !== undefined && frequency_description !== current.frequency_description) {
        updates.push(`frequency_description = $${paramIndex}`);
        params.push(frequency_description);
        changes.frequency_description = { from: current.frequency_description, to: frequency_description };
        paramIndex++;
      }
      
      if (vendor_department_team !== undefined && vendor_department_team !== current.vendor_department_team) {
        updates.push(`vendor_department_team = $${paramIndex}`);
        params.push(vendor_department_team);
        changes.vendor_department_team = { from: current.vendor_department_team, to: vendor_department_team };
        paramIndex++;
      }
      
      if (vendor_department_email !== undefined && vendor_department_email !== current.vendor_department_email) {
        updates.push(`vendor_department_email = $${paramIndex}`);
        params.push(vendor_department_email);
        changes.vendor_department_email = { from: current.vendor_department_email, to: vendor_department_email };
        paramIndex++;
      }
      
      if (vendor_type !== undefined && vendor_type !== current.vendor_type) {
        updates.push(`vendor_type = $${paramIndex}`);
        params.push(vendor_type);
        changes.vendor_type = { from: current.vendor_type, to: vendor_type };
        paramIndex++;
      }
      
      if (vendor_onboarding_date !== undefined && vendor_onboarding_date !== current.vendor_onboarding_date) {
        updates.push(`vendor_onboarding_date = $${paramIndex}`);
        params.push(vendor_onboarding_date || null);
        changes.vendor_onboarding_date = { from: current.vendor_onboarding_date, to: vendor_onboarding_date };
        paramIndex++;
      }
      
      if (file_owner_user_id !== undefined && file_owner_user_id !== current.file_owner_user_id) {
        updates.push(`file_owner_user_id = $${paramIndex}`);
        params.push(file_owner_user_id);
        changes.file_owner_user_id = { from: current.file_owner_user_id, to: file_owner_user_id };
        paramIndex++;
        
        // Auto-update manager_contact when file owner changes
        const ownerResult = await client.query('SELECT email FROM users WHERE id = $1', [file_owner_user_id]);
        if (ownerResult.rows.length > 0) {
          const newManagerContact = ownerResult.rows[0].email;
          updates.push(`manager_contact = $${paramIndex}`);
          params.push(newManagerContact);
          changes.manager_contact = { from: current.manager_contact, to: newManagerContact };
          paramIndex++;
        }
      }
      
      if (manager_contact !== undefined && manager_contact !== current.manager_contact) {
        updates.push(`manager_contact = $${paramIndex}`);
        params.push(manager_contact);
        changes.manager_contact = { from: current.manager_contact, to: manager_contact };
        paramIndex++;
      }
      
      if (primary_contact_name !== undefined && primary_contact_name !== current.primary_contact_name) {
        updates.push(`primary_contact_name = $${paramIndex}`);
        params.push(primary_contact_name);
        changes.primary_contact_name = { from: current.primary_contact_name, to: primary_contact_name };
        paramIndex++;
      }
      
      if (primary_contact_phone !== undefined && primary_contact_phone !== current.primary_contact_phone) {
        updates.push(`primary_contact_phone = $${paramIndex}`);
        params.push(primary_contact_phone);
        changes.primary_contact_phone = { from: current.primary_contact_phone, to: primary_contact_phone };
        paramIndex++;
      }
      
      if (primary_contact_email !== undefined && primary_contact_email !== current.primary_contact_email) {
        updates.push(`primary_contact_email = $${paramIndex}`);
        params.push(primary_contact_email);
        changes.primary_contact_email = { from: current.primary_contact_email, to: primary_contact_email };
        paramIndex++;
      }
      
      if (primary_contact_designation !== undefined && primary_contact_designation !== current.primary_contact_designation) {
        updates.push(`primary_contact_designation = $${paramIndex}`);
        params.push(primary_contact_designation);
        changes.primary_contact_designation = { from: current.primary_contact_designation, to: primary_contact_designation };
        paramIndex++;
      }
      
      if (secondary_contact_name !== undefined && secondary_contact_name !== current.secondary_contact_name) {
        updates.push(`secondary_contact_name = $${paramIndex}`);
        params.push(secondary_contact_name);
        changes.secondary_contact_name = { from: current.secondary_contact_name, to: secondary_contact_name };
        paramIndex++;
      }
      
      if (secondary_contact_phone !== undefined && secondary_contact_phone !== current.secondary_contact_phone) {
        updates.push(`secondary_contact_phone = $${paramIndex}`);
        params.push(secondary_contact_phone);
        changes.secondary_contact_phone = { from: current.secondary_contact_phone, to: secondary_contact_phone };
        paramIndex++;
      }
      
      if (secondary_contact_email !== undefined && secondary_contact_email !== current.secondary_contact_email) {
        updates.push(`secondary_contact_email = $${paramIndex}`);
        params.push(secondary_contact_email);
        changes.secondary_contact_email = { from: current.secondary_contact_email, to: secondary_contact_email };
        paramIndex++;
      }
      
      if (secondary_contact_designation !== undefined && secondary_contact_designation !== current.secondary_contact_designation) {
        updates.push(`secondary_contact_designation = $${paramIndex}`);
        params.push(secondary_contact_designation);
        changes.secondary_contact_designation = { from: current.secondary_contact_designation, to: secondary_contact_designation };
        paramIndex++;
      }
      
      if (owner_contact !== undefined && owner_contact !== current.owner_contact) {
        updates.push(`owner_contact = $${paramIndex}`);
        params.push(owner_contact);
        changes.owner_contact = { from: current.owner_contact, to: owner_contact };
        paramIndex++;
      }
      
      if (metadata !== undefined) {
        const metaStr = metadata ? JSON.stringify(metadata) : null;
        if (metaStr !== current.metadata) {
          updates.push(`metadata = $${paramIndex}`);
          params.push(metaStr);
          changes.metadata = { from: current.metadata, to: metadata };
          paramIndex++;
        }
      }
      
      if (vendor_connection_id !== undefined && vendor_connection_id !== current.vendor_connection_id) {
        updates.push(`vendor_connection_id = $${paramIndex}`);
        params.push(vendor_connection_id || null);
        changes.vendor_connection_id = { from: current.vendor_connection_id, to: vendor_connection_id };
        paramIndex++;
      }
      
      if (drop_location_path !== undefined && drop_location_path !== current.drop_location_path) {
        updates.push(`drop_location_path = $${paramIndex}`);
        params.push(drop_location_path || null);
        changes.drop_location_path = { from: current.drop_location_path, to: drop_location_path };
        paramIndex++;
      }
      
      if (contains_pii !== undefined && contains_pii !== current.contains_pii) {
        updates.push(`contains_pii = $${paramIndex}`);
        params.push(contains_pii);
        changes.contains_pii = { from: current.contains_pii, to: contains_pii };
        paramIndex++;
      }
      
      if (file_type !== undefined && file_type !== current.file_type) {
        updates.push(`file_type = $${paramIndex}`);
        params.push(file_type);
        changes.file_type = { from: current.file_type, to: file_type };
        paramIndex++;
      }
      
      if (data_classification !== undefined && data_classification !== current.data_classification) {
        updates.push(`data_classification = $${paramIndex}`);
        params.push(data_classification);
        changes.data_classification = { from: current.data_classification, to: data_classification };
        paramIndex++;
      }
      
      if (domain !== undefined && domain !== current.domain) {
        updates.push(`domain = $${paramIndex}`);
        params.push(domain);
        changes.domain = { from: current.domain, to: domain };
        paramIndex++;
      }
      
      if (retention_days !== undefined && retention_days !== current.retention_days) {
        updates.push(`retention_days = $${paramIndex}`);
        params.push(retention_days);
        changes.retention_days = { from: current.retention_days, to: retention_days };
        paramIndex++;
      }
      
      if (expected_arrival_time !== undefined && expected_arrival_time !== current.expected_arrival_time) {
        updates.push(`expected_arrival_time = $${paramIndex}`);
        params.push(expected_arrival_time);
        changes.expected_arrival_time = { from: current.expected_arrival_time, to: expected_arrival_time };
        paramIndex++;
      }
      
      if (delivery_method !== undefined && delivery_method !== current.delivery_method) {
        updates.push(`delivery_method = $${paramIndex}`);
        params.push(delivery_method);
        changes.delivery_method = { from: current.delivery_method, to: delivery_method };
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return { success: false, error: 'No changes detected' };
      }
      
      // If locked and admin is making changes, unlock and reset approvals
      if (current.is_locked && isAdmin) {
        updates.push(`is_locked = false`);
        updates.push(`locked_at = NULL`);
        updates.push(`approval_status = 'changes_pending'`);
        updates.push(`vendor_approved_at = NULL`);
        updates.push(`vendor_approved_by = NULL`);
        updates.push(`owner_approved_at = NULL`);
        updates.push(`owner_approved_by = NULL`);
        updates.push(`version = version + 1`);
        
        // Log unlock
        await client.query(
          `INSERT INTO vendor_agreement_changes (
            agreement_id, change_type, changes_summary, from_version, to_version, changed_by, changed_at
          ) VALUES ($1, 'unlocked', 'Agreement unlocked by Admin for modifications', $2, $3, $4, CURRENT_TIMESTAMP)`,
          [agreementId, current.version, current.version + 1, updatedBy]
        );
      }
      
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_by = $${paramIndex}`);
      params.push(updatedBy);
      paramIndex++;
      
      params.push(agreementId);
      
      const result = await client.query(
        `UPDATE vendor_agreements 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        params
      );
      
      const updated = result.rows[0];
      
      // Log change
      await client.query(
        `INSERT INTO vendor_agreement_changes (
          agreement_id, change_type, previous_data, new_data, changes_summary,
          from_version, to_version, changed_by, changed_at, reason
        ) VALUES ($1, 'updated', $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)`,
        [
          agreementId,
          JSON.stringify(current),
          JSON.stringify(updated),
          JSON.stringify(changes),
          current.version,
          updated.version,
          updatedBy,
          isAdmin && current.is_locked ? 'Admin modification of locked agreement' : 'Agreement updated'
        ]
      );
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor agreement updated', { agreementId });
      
      return {
        success: true,
        agreement: updated,
        requiresReapproval: current.is_locked && isAdmin
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error updating vendor agreement', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve agreement (vendor or owner)
   */
  async approveAgreement(agreementId, approverUserId, approverType, comments = null, ipAddress = null, userAgent = null, isAdmin = false) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Validate approver type
      if (approverType !== 'vendor' && approverType !== 'owner') {
        throw new Error('Invalid approver type. Must be "vendor" or "owner"');
      }
      
      // Get agreement
      const agreementResult = await client.query(
        `SELECT va.*, v.vendor_user_id 
         FROM vendor_agreements va
         JOIN vendors v ON va.vendor_id = v.id
         WHERE va.id = $1`,
        [agreementId]
      );
      
      if (agreementResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const agreement = agreementResult.rows[0];
      
      // Verify approver authorization (skip for admins)
      if (!isAdmin) {
        if (approverType === 'vendor') {
          // Check if user is the vendor user OR their email matches contact fields
          let isAuthorized = agreement.vendor_user_id === approverUserId;
          
          if (!isAuthorized) {
            // Get user's email to check contact fields
            const userResult = await client.query(
              'SELECT email FROM users WHERE id = $1',
              [approverUserId]
            );
            
            if (userResult.rows.length > 0) {
              const userEmail = userResult.rows[0].email;
              isAuthorized = userEmail === agreement.primary_contact_email || 
                            userEmail === agreement.secondary_contact_email;
            }
          }
          
          if (!isAuthorized) {
            throw new Error('Only the vendor user can provide vendor approval');
          }
        }
        
        if (approverType === 'owner' && agreement.file_owner_user_id !== approverUserId) {
          throw new Error('Only the file owner can provide owner approval');
        }
      }
      
      // Check if already approved by this type
      if (approverType === 'vendor' && agreement.vendor_approved_at) {
        throw new Error('Agreement already approved by vendor');
      }
      
      if (approverType === 'owner' && agreement.owner_approved_at) {
        throw new Error('Agreement already approved by owner');
      }
      
      // Record approval
      await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent
        ) VALUES ($1, $2, $3, 'approved', $4, $5, CURRENT_TIMESTAMP, $6, $7)`,
        [agreementId, approverType, approverUserId, comments, agreement.version, ipAddress, userAgent]
      );
      
      // Update agreement
      let newStatus = agreement.approval_status;
      const updates = [`updated_at = CURRENT_TIMESTAMP`];
      
      if (approverType === 'vendor') {
        updates.push(`vendor_approved_at = CURRENT_TIMESTAMP`);
        updates.push(`vendor_approved_by = $1`);
        
        // Check if owner already approved
        if (agreement.owner_approved_at) {
          // Both approved - lock the agreement
          newStatus = 'fully_approved';
          updates.push(`approval_status = '${newStatus}'`);
          updates.push(`is_locked = true`);
          updates.push(`locked_at = CURRENT_TIMESTAMP`);
        } else {
          newStatus = 'vendor_approved';
          updates.push(`approval_status = '${newStatus}'`);
        }
      } else {
        updates.push(`owner_approved_at = CURRENT_TIMESTAMP`);
        updates.push(`owner_approved_by = $1`);
        
        // Check if vendor already approved
        if (agreement.vendor_approved_at) {
          // Both approved - lock the agreement
          newStatus = 'fully_approved';
          updates.push(`approval_status = '${newStatus}'`);
          updates.push(`is_locked = true`);
          updates.push(`locked_at = CURRENT_TIMESTAMP`);
        } else {
          newStatus = 'owner_approved';
          updates.push(`approval_status = '${newStatus}'`);
        }
      }
      
      await client.query(
        `UPDATE vendor_agreements 
         SET ${updates.join(', ')}
         WHERE id = $2`,
        [approverUserId, agreementId]
      );
      
      // If fully approved, log the lock
      if (newStatus === 'fully_approved') {
        await client.query(
          `INSERT INTO vendor_agreement_changes (
            agreement_id, change_type, changes_summary, to_version, changed_by, changed_at
          ) VALUES ($1, 'locked', 'Agreement locked after dual approval', $2, $3, CURRENT_TIMESTAMP)`,
          [agreementId, agreement.version, approverUserId]
        );
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Agreement approved', { 
        agreementId, 
        approverType, 
        approverUserId,
        fullyApproved: newStatus === 'fully_approved'
      });
      
      return {
        success: true,
        approvalStatus: newStatus,
        fullyApproved: newStatus === 'fully_approved',
        isLocked: newStatus === 'fully_approved'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error approving agreement', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject agreement
   */
  async rejectAgreement(agreementId, approverUserId, approverType, comments, ipAddress = null, userAgent = null, isAdmin = false) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Validate approver type
      if (approverType !== 'vendor' && approverType !== 'owner') {
        throw new Error('Invalid approver type. Must be "vendor" or "owner"');
      }
      
      if (!comments) {
        throw new Error('Comments are required for rejection');
      }
      
      // Get agreement
      const agreementResult = await client.query(
        `SELECT va.*, v.vendor_user_id 
         FROM vendor_agreements va
         JOIN vendors v ON va.vendor_id = v.id
         WHERE va.id = $1`,
        [agreementId]
      );
      
      if (agreementResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const agreement = agreementResult.rows[0];
      
      // Verify approver authorization (skip for admins)
      if (!isAdmin) {
        if (approverType === 'vendor') {
          // Check if user is the vendor user OR their email matches contact fields
          let isAuthorized = agreement.vendor_user_id === approverUserId;
          
          if (!isAuthorized) {
            // Get user's email to check contact fields
            const userResult = await client.query(
              'SELECT email FROM users WHERE id = $1',
              [approverUserId]
            );
            
            if (userResult.rows.length > 0) {
              const userEmail = userResult.rows[0].email;
              isAuthorized = userEmail === agreement.primary_contact_email || 
                            userEmail === agreement.secondary_contact_email;
            }
          }
          
          if (!isAuthorized) {
            throw new Error('Only the vendor user can reject as vendor');
          }
        }
        
        if (approverType === 'owner' && agreement.file_owner_user_id !== approverUserId) {
          throw new Error('Only the file owner can reject as owner');
        }
      }
      
      // Record rejection
      await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent
        ) VALUES ($1, $2, $3, 'rejected', $4, $5, CURRENT_TIMESTAMP, $6, $7)`,
        [agreementId, approverType, approverUserId, comments, agreement.version, ipAddress, userAgent]
      );
      
      // Update agreement to rejected status
      await client.query(
        `UPDATE vendor_agreements 
         SET approval_status = 'rejected', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [agreementId]
      );
      
      await client.query('COMMIT');
      
      systemLogger.info('Agreement rejected', { agreementId, approverType, approverUserId });
      
      return {
        success: true,
        approvalStatus: 'rejected'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error rejecting agreement', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Three-Stage Approval Workflow Methods
   */
  
  /**
   * Accept or reject agreement as Vendor User (Stage 1)
   */
  async vendorAcceptReject(agreementId, approverUserId, action, comments = null, documents = [], ipAddress = null, userAgent = null, isAdmin = false) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (!['accept', 'reject'].includes(action)) {
        throw new Error('Invalid action. Must be "accept" or "reject"');
      }
      
      // Get agreement
      const agreementResult = await client.query(
        `SELECT va.*, v.vendor_user_id 
         FROM vendor_agreements va
         JOIN vendors v ON va.vendor_id = v.id
         WHERE va.id = $1`,
        [agreementId]
      );
      
      if (agreementResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const agreement = agreementResult.rows[0];
      
      // Check if in correct state for vendor action
      if (!['draft', 'pending_vendor_acceptance', 'manager_rejected'].includes(agreement.approval_status)) {
        throw new Error(`Cannot perform vendor action in current status: ${agreement.approval_status}`);
      }
      
      // Verify authorization
      if (!isAdmin) {
        let isAuthorized = agreement.vendor_user_id === approverUserId;
        
        if (!isAuthorized) {
          const userResult = await client.query(
            'SELECT email FROM users WHERE id = $1',
            [approverUserId]
          );
          
          if (userResult.rows.length > 0) {
            const userEmail = userResult.rows[0].email;
            isAuthorized = userEmail === agreement.primary_contact_email || 
                          userEmail === agreement.secondary_contact_email;
          }
        }
        
        if (!isAuthorized) {
          throw new Error('Only the vendor contact can accept/reject the agreement');
        }
      }
      
      if (action === 'reject' && !comments) {
        throw new Error('Comments are required for rejection');
      }
      
      // Record approval/rejection
      const approvalResult = await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent, approval_stage
        ) VALUES ($1, 'vendor', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, 'vendor_acceptance')
        RETURNING id`,
        [agreementId, approverUserId, action === 'accept' ? 'approved' : 'rejected', 
         comments, agreement.version, ipAddress, userAgent]
      );
      
      const approvalId = approvalResult.rows[0].id;
      
      // Handle documents if any
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          await client.query(
            `INSERT INTO vendor_agreement_documents (
              agreement_id, approval_id, document_name, document_type,
              file_path, file_size, mime_type, uploaded_by, approval_stage, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vendor_acceptance', $9)`,
            [agreementId, approvalId, doc.name, doc.type, doc.path, 
             doc.size, doc.mimeType, approverUserId, doc.description]
          );
        }
      }
      
      // Update agreement status
      const newStatus = action === 'accept' ? 'vendor_accepted' : 'vendor_rejected';
      if (action === 'accept') {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_approved_at = CURRENT_TIMESTAMP,
               vendor_approved_by = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newStatus, approverUserId, agreementId]
        );
      } else {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_approved_at = NULL,
               vendor_approved_by = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
        );
      }
      
      // Create notifications
      if (action === 'accept' && agreement.file_owner_user_id) {
        // Notify Vendor Manager that vendor has accepted
        await client.query(
          `INSERT INTO notifications (
            user_id, notification_type, title, message, entity_type, entity_id,
            action_url, metadata
          ) VALUES ($1, 'vendor_contract_pending_manager', $2, $3, 'vendor_agreement', $4, $5, $6)`,
          [
            agreement.file_owner_user_id,
            'Vendor Contract Ready for Manager Approval',
            `Contract "${agreement.agreement_name}" has been accepted by the vendor and is pending your approval.`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ agreement_id: agreementId, agreement_name: agreement.agreement_name })
          ]
        );
      } else if (action === 'reject' && agreement.file_owner_user_id) {
        // Notify Vendor Manager that vendor has rejected
        await client.query(
          `INSERT INTO notifications (
            user_id, notification_type, title, message, entity_type, entity_id,
            action_url, metadata
          ) VALUES ($1, 'vendor_contract_rejected_vendor', $2, $3, 'vendor_agreement', $4, $5, $6)`,
          [
            agreement.file_owner_user_id,
            'Vendor Contract Rejected by Vendor',
            `Contract "${agreement.agreement_name}" has been rejected by the vendor. Reason: ${comments || 'No reason provided'}`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ agreement_id: agreementId, agreement_name: agreement.agreement_name, rejection_reason: comments })
          ]
        );
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor action completed', { agreementId, action, approverUserId, newStatus });
      
      return {
        success: true,
        approvalStatus: newStatus,
        approvalId
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error in vendor accept/reject', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Approve or reject agreement as Vendor Manager (Stage 2)
   */
  async managerApproveReject(agreementId, approverUserId, action, comments = null, documents = [], ipAddress = null, userAgent = null, isAdmin = false) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (!['approve', 'reject'].includes(action)) {
        throw new Error('Invalid action. Must be "approve" or "reject"');
      }
      
      // Get agreement
      const agreementResult = await client.query(
        `SELECT va.* FROM vendor_agreements va WHERE va.id = $1`,
        [agreementId]
      );
      
      if (agreementResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const agreement = agreementResult.rows[0];
      
      // Check if in correct state for manager action
      if (!['vendor_accepted', 'governance_rejected'].includes(agreement.approval_status)) {
        throw new Error(`Cannot perform manager action in current status: ${agreement.approval_status}`);
      }
      
      // Verify authorization
      if (!isAdmin && agreement.file_owner_user_id !== approverUserId) {
        throw new Error('Only the vendor manager can approve/reject at this stage');
      }
      
      if (action === 'reject' && !comments) {
        throw new Error('Comments are required for rejection');
      }
      
      // Record approval/rejection
      const approvalResult = await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent, approval_stage
        ) VALUES ($1, 'manager', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, 'manager_approval')
        RETURNING id`,
        [agreementId, approverUserId, action === 'approve' ? 'approved' : 'rejected',
         comments, agreement.version, ipAddress, userAgent]
      );
      
      const approvalId = approvalResult.rows[0].id;
      
      // Handle documents
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          await client.query(
            `INSERT INTO vendor_agreement_documents (
              agreement_id, approval_id, document_name, document_type,
              file_path, file_size, mime_type, uploaded_by, approval_stage, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manager_approval', $9)`,
            [agreementId, approvalId, doc.name, doc.type, doc.path,
             doc.size, doc.mimeType, approverUserId, doc.description]
          );
        }
      }
      
      // Update agreement status
      const newStatus = action === 'approve' ? 'manager_approved' : 'manager_rejected';
      if (action === 'approve') {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               owner_approved_at = CURRENT_TIMESTAMP,
               owner_approved_by = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newStatus, approverUserId, agreementId]
        );
      } else {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               owner_approved_at = NULL,
               owner_approved_by = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
        );
      }
      
      // Create notifications
      if (action === 'approve' && agreement.governance_manager_user_id) {
        // Notify Governance Manager
        await client.query(
          `INSERT INTO notifications (
            user_id, notification_type, title, message, entity_type, entity_id,
            action_url, metadata
          ) VALUES ($1, 'vendor_contract_pending_governance', $2, $3, 'vendor_agreement', $4, $5, $6)`,
          [
            agreement.governance_manager_user_id,
            'Vendor Contract Ready for Governance Approval',
            `Contract "${agreement.agreement_name}" has been approved by the manager and is pending your final approval.`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ agreement_id: agreementId, agreement_name: agreement.agreement_name })
          ]
        );
      } else if (action === 'reject') {
        // Notify Vendor User of manager rejection - needs to go back to vendor for review
        if (agreement.vendor_approved_by) {
          await client.query(
            `INSERT INTO notifications (
              user_id, notification_type, title, message, entity_type, entity_id,
              action_url, metadata
            ) VALUES ($1, 'vendor_contract_rejected_manager', $2, $3, 'vendor_agreement', $4, $5, $6)`,
            [
              agreement.vendor_approved_by,
              'Vendor Contract Rejected by Manager',
              `Contract "${agreement.agreement_name}" has been rejected by the manager. Reason: ${comments || 'No reason provided'}`,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_name: agreement.agreement_name, rejection_reason: comments })
            ]
          );
        }
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Manager action completed', { agreementId, action, approverUserId, newStatus });
      
      return {
        success: true,
        approvalStatus: newStatus,
        approvalId
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error in manager approve/reject', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Manager handles vendor rejection (send back to vendor or override)
   */
  async managerHandleVendorRejection(agreementId, approverUserId, action, comments = null, documents = [], ipAddress = null, userAgent = null, isAdmin = false) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (!['send-to-vendor', 'override-and-approve'].includes(action)) {
        throw new Error('Invalid action. Must be "send-to-vendor" or "override-and-approve"');
      }
      
      // Get agreement
      const agreementResult = await client.query(
        `SELECT va.* FROM vendor_agreements va WHERE va.id = $1`,
        [agreementId]
      );
      
      if (agreementResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const agreement = agreementResult.rows[0];
      
      // Check if agreement has vendor rejection
      if (!agreement.vendor_rejected_at) {
        throw new Error('Agreement has not been rejected by vendor');
      }
      
      // Verify authorization
      if (!isAdmin && agreement.file_owner_user_id !== approverUserId) {
        throw new Error('Only the vendor manager can handle vendor rejection');
      }
      
      if (!comments) {
        throw new Error('Comments are required for this action');
      }
      
      // Record action
      const approvalResult = await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent, approval_stage
        ) VALUES ($1, 'manager', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8)
        RETURNING id`,
        [agreementId, approverUserId, action, comments, agreement.version, ipAddress, userAgent,
         action === 'send-to-vendor' ? 'send_to_vendor' : 'manager_override']
      );
      
      const approvalId = approvalResult.rows[0].id;
      
      // Handle documents
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          await client.query(
            `INSERT INTO vendor_agreement_documents (
              agreement_id, approval_id, document_name, document_type,
              file_path, file_size, mime_type, uploaded_by, approval_stage, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [agreementId, approvalId, doc.name, doc.type, doc.path,
             doc.size, doc.mimeType, approverUserId,
             action === 'send-to-vendor' ? 'send_to_vendor' : 'manager_override', doc.description]
          );
        }
      }
      
      let newStatus, notificationTitle, notificationMessage, notificationType;
      
      if (action === 'send-to-vendor') {
        // Reset to vendor stage - clear vendor rejected timestamp
        newStatus = 'pending_vendor';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_accepted_at = NULL,
               vendor_approved_by = NULL,
               vendor_rejected_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
        );
        
        notificationTitle = 'Vendor Contract Sent Back for Review';
        notificationMessage = `Contract "${agreement.agreement_name}" has been sent back to you for review. Manager feedback: ${comments}`;
        notificationType = 'vendor_contract_pending_vendor';
        
        // Notify vendor contacts
        if (agreement.vendor_approved_by) {
          await client.query(
            `INSERT INTO notifications (
              user_id, notification_type, title, message, entity_type, entity_id,
              action_url, metadata
            ) VALUES ($1, $2, $3, $4, 'vendor_agreement', $5, $6, $7)`,
            [
              agreement.vendor_approved_by,
              notificationType,
              notificationTitle,
              notificationMessage,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_name: agreement.agreement_name, manager_comments: comments })
            ]
          );
        }
        
      } else if (action === 'override-and-approve') {
        // Override vendor rejection and move to governance
        newStatus = 'manager_approved';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_accepted_at = CURRENT_TIMESTAMP,
               vendor_approved_by = $2,
               vendor_rejected_at = NULL,
               manager_approved_at = CURRENT_TIMESTAMP,
               manager_approved_by = $3,
               owner_approved_at = CURRENT_TIMESTAMP,
               owner_approved_by = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [newStatus, approverUserId, approverUserId, approverUserId, agreementId]
        );
        
        // Notify governance manager
        if (agreement.governance_manager_user_id) {
          await client.query(
            `INSERT INTO notifications (
              user_id, notification_type, title, message, entity_type, entity_id,
              action_url, metadata
            ) VALUES ($1, 'vendor_contract_pending_governance', $2, $3, 'vendor_agreement', $4, $5, $6)`,
            [
              agreement.governance_manager_user_id,
              'Vendor Contract Ready for Governance Approval',
              `Contract "${agreement.agreement_name}" has been approved (vendor rejection overridden) and is pending your final approval. Manager notes: ${comments}`,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_name: agreement.agreement_name, override_comments: comments })
            ]
          );
        }
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Manager handled vendor rejection', { agreementId, action, approverUserId, newStatus });
      
      return {
        success: true,
        message: action === 'send-to-vendor' ? 'Agreement sent back to vendor for review' : 'Vendor rejection overridden and sent to governance',
        approvalStatus: newStatus,
        approvalId
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error handling vendor rejection', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Approve or reject agreement as Governance Manager (Stage 3)
   */
  async governanceApproveReject(agreementId, approverUserId, action, comments = null, documents = [], ipAddress = null, userAgent = null, isAdmin = false) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (!['approve', 'reject'].includes(action)) {
        throw new Error('Invalid action. Must be "approve" or "reject"');
      }
      
      // Get agreement
      const agreementResult = await client.query(
        `SELECT va.* FROM vendor_agreements va WHERE va.id = $1`,
        [agreementId]
      );
      
      if (agreementResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      const agreement = agreementResult.rows[0];
      
      // Check if in correct state for governance action
      if (agreement.approval_status !== 'manager_approved') {
        throw new Error(`Cannot perform governance action in current status: ${agreement.approval_status}`);
      }
      
      // Verify authorization
      if (!isAdmin && agreement.governance_manager_user_id !== approverUserId) {
        throw new Error('Only the governance manager can approve/reject at this stage');
      }
      
      if (action === 'reject' && !comments) {
        throw new Error('Comments are required for rejection');
      }
      
      // Record approval/rejection
      const approvalResult = await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent, approval_stage
        ) VALUES ($1, 'governance_manager', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, 'governance_approval')
        RETURNING id`,
        [agreementId, approverUserId, action === 'approve' ? 'approved' : 'rejected',
         comments, agreement.version, ipAddress, userAgent]
      );
      
      const approvalId = approvalResult.rows[0].id;
      
      // Handle documents
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          await client.query(
            `INSERT INTO vendor_agreement_documents (
              agreement_id, approval_id, document_name, document_type,
              file_path, file_size, mime_type, uploaded_by, approval_stage, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'governance_approval', $9)`,
            [agreementId, approvalId, doc.name, doc.type, doc.path,
             doc.size, doc.mimeType, approverUserId, doc.description]
          );
        }
      }
      
      // Update agreement status
      const newStatus = action === 'approve' ? 'governance_approved' : 'governance_rejected';
      const isLocked = action === 'approve';
      
      if (action === 'approve') {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               governance_approved_at = CURRENT_TIMESTAMP,
               governance_approved_by = $2,
               is_locked = $3,
               locked_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [newStatus, approverUserId, isLocked, agreementId]
        );
      } else {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               governance_approved_at = NULL,
               governance_approved_by = NULL,
               is_locked = $2,
               locked_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newStatus, isLocked, agreementId]
        );
      }
      
      // Log the lock if approved
      if (action === 'approve') {
        await client.query(
          `INSERT INTO vendor_agreement_changes (
            agreement_id, change_type, changes_summary, to_version, changed_by, changed_at
          ) VALUES ($1, 'locked', 'Agreement locked after governance approval', $2, $3, CURRENT_TIMESTAMP)`,
          [agreementId, agreement.version, approverUserId]
        );
      }
      
      // Create notifications
      // Notify all parties of final decision
      const notifyUserIds = [
        agreement.vendor_approved_by,
        agreement.owner_approved_by,
        agreement.file_owner_user_id
      ].filter(id => id !== null && id !== undefined);
      
      for (const userId of notifyUserIds) {
        await client.query(
          `INSERT INTO notifications (
            user_id, notification_type, title, message, entity_type, entity_id,
            action_url, metadata
          ) VALUES ($1, $2, $3, $4, 'vendor_agreement', $5, $6, $7)`,
          [
            userId,
            action === 'approve' ? 'vendor_contract_approved_final' : 'vendor_contract_rejected_governance',
            action === 'approve' ? 'Vendor Contract Fully Approved' : 'Vendor Contract Rejected by Governance',
            action === 'approve' 
              ? `Contract "${agreement.agreement_name}" has been fully approved and is now locked.`
              : `Contract "${agreement.agreement_name}" has been rejected by governance. Reason: ${comments || 'No reason provided'}`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ 
              agreement_id: agreementId, 
              agreement_name: agreement.agreement_name,
              rejection_reason: action === 'reject' ? comments : null
            })
          ]
        );
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Governance action completed', { agreementId, action, approverUserId, newStatus, isLocked });
      
      return {
        success: true,
        approvalStatus: newStatus,
        approvalId,
        isLocked,
        fullyApproved: action === 'approve'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error in governance approve/reject', { agreementId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get agreement by ID with full details
   */
  async getAgreementById(agreementId) {
    try {
      const result = await pool.query(
        `SELECT 
          va.*,
          v.vendor_code,
          v.vendor_name,
          v.vendor_user_id,
          owner.username as owner_username,
          owner.email as owner_email,
          vendor_approver.username as vendor_approver_username,
          owner_approver.username as owner_approver_username
        FROM vendor_agreements va
        JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN users owner ON va.file_owner_user_id = owner.id
        LEFT JOIN users vendor_approver ON va.vendor_approved_by = vendor_approver.id
        LEFT JOIN users owner_approver ON va.owner_approved_by = owner_approver.id
        WHERE va.id = $1`,
        [agreementId]
      );
      
      if (result.rows.length === 0) {
        return { success: false, error: 'Agreement not found' };
      }
      
      // Enrich with rejection/acceptance timestamps
      const enrichedAgreement = await this.enrichAgreementWithTimestamps(result.rows[0]);
      
      return {
        success: true,
        agreement: enrichedAgreement
      };
      
    } catch (error) {
      systemLogger.error('Error fetching agreement', { agreementId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all vendor agreements with filtering and pagination
   * For non-admin vendor users without approve permission, filters by contact emails
   */
  async getAllAgreements(options = {}) {
    try {
      const {
        page = 1,
        pageSize = 10,
        projectId = null,
        vendorId = null,
        status = null,
        userId,
        userRoles = [],
        userEmail = null,
        hasApprovePermission = false
      } = options;
      
      const offset = (page - 1) * pageSize;
      const isAdmin = userRoles.includes('Admin');
      
      // Build WHERE clause based on filters
      const whereClauses = [];
      const queryParams = [];
      let paramCounter = 1;
      
      // Always exclude archived agreements (soft deleted)
      whereClauses.push(`(va.status IS NULL OR va.status != 'archived')`);
      
      // Filter by project if specified
      if (projectId) {
        whereClauses.push(`v.project_id = $${paramCounter}`);
        queryParams.push(projectId);
        paramCounter++;
      }
      
      // Filter by vendor if specified
      if (vendorId) {
        whereClauses.push(`va.vendor_id = $${paramCounter}`);
        queryParams.push(vendorId);
        paramCounter++;
      }
      
      // Filter by status if specified
      if (status) {
        whereClauses.push(`va.approval_status = $${paramCounter}`);
        queryParams.push(status);
        paramCounter++;
      }
      
      // Apply role-based filtering for vendor users
      // Only admin role or vendor_agreements:approve permission bypass contact filtering
      // Regular vendor users with just vendor_agreements:read must be filtered by contact emails
      if (!isAdmin && !hasApprovePermission && userId) {
        if (userEmail) {
          // Allow access if user is: file owner, vendor user, primary contact, or secondary contact
          whereClauses.push(`(
            va.file_owner_user_id = $${paramCounter} 
            OR v.vendor_user_id = $${paramCounter}
            OR va.primary_contact_email = $${paramCounter + 1}
            OR va.secondary_contact_email = $${paramCounter + 1}
          )`);
          queryParams.push(userId, userEmail);
          paramCounter += 2;
        } else {
          // Fallback if email not provided
          whereClauses.push(`(va.file_owner_user_id = $${paramCounter} OR v.vendor_user_id = $${paramCounter})`);
          queryParams.push(userId);
          paramCounter++;
        }
      }
      
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) 
        FROM vendor_agreements va
        JOIN vendors v ON va.vendor_id = v.id
        ${whereClause}
      `;
      
      const countResult = await pool.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Get paginated results with full details
      const dataQuery = `
        SELECT 
          va.*,
          v.vendor_code,
          v.vendor_name,
          v.vendor_user_id,
          v.project_id,
          owner.username as owner_username,
          owner.email as owner_email,
          vendor_approver.username as vendor_approver_username,
          owner_approver.username as owner_approver_username,
          source_conn.name as vendor_connection_name
        FROM vendor_agreements va
        JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN users owner ON va.file_owner_user_id = owner.id
        LEFT JOIN users vendor_approver ON va.vendor_approved_by = vendor_approver.id
        LEFT JOIN users owner_approver ON va.owner_approved_by = owner_approver.id
        LEFT JOIN storage_connections source_conn ON va.vendor_connection_id = source_conn.connection_id
        ${whereClause}
        ORDER BY va.created_at DESC
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;
      
      queryParams.push(pageSize, offset);
      
      const result = await pool.query(dataQuery, queryParams);
      
      // Enrich agreements with rejection/acceptance timestamps
      const enrichedAgreements = await Promise.all(
        result.rows.map(agreement => this.enrichAgreementWithTimestamps(agreement))
      );
      
      return {
        success: true,
        agreements: enrichedAgreements,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize)
        }
      };
      
    } catch (error) {
      systemLogger.error('Error fetching all agreements', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all agreements for a vendor
   * For non-admin vendor users, filter to only show agreements where they are a contact
   */
  async getAgreementsByVendor(vendorId, page = 1, pageSize = 20, userEmail = null, isAdmin = false) {
    try {
      const offset = (page - 1) * pageSize;
      
      // Build the WHERE clause based on user role
      let whereClause = 'WHERE va.vendor_id = $1';
      let countParams = [vendorId];
      let queryParams = [vendorId];
      
      // If not admin and userEmail provided, filter by contact emails
      if (!isAdmin && userEmail) {
        whereClause += ' AND (va.primary_contact_email = $2 OR va.secondary_contact_email = $2)';
        countParams.push(userEmail);
        queryParams.push(userEmail);
      }
      
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM vendor_agreements va ${whereClause}`,
        countParams
      );
      
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Adjust parameter indices for LIMIT and OFFSET
      const limitParam = `$${queryParams.length + 1}`;
      const offsetParam = `$${queryParams.length + 2}`;
      
      const result = await pool.query(
        `SELECT 
          va.*,
          owner.username as owner_username,
          owner.email as owner_email
        FROM vendor_agreements va
        LEFT JOIN users owner ON va.file_owner_user_id = owner.id
        ${whereClause}
        ORDER BY va.created_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
        [...queryParams, pageSize, offset]
      );
      
      // Enrich agreements with rejection/acceptance timestamps
      const enrichedAgreements = await Promise.all(
        result.rows.map(agreement => this.enrichAgreementWithTimestamps(agreement))
      );
      
      return {
        success: true,
        agreements: enrichedAgreements,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize)
        }
      };
      
    } catch (error) {
      systemLogger.error('Error fetching agreements by vendor', { vendorId, error: error.message });
      throw error;
    }
  }

  /**
   * Get approval history for an agreement
   */
  async getApprovalHistory(agreementId) {
    try {
      const approvalResult = await pool.query(
        `SELECT 
          vaa.*,
          u.username,
          u.email
        FROM vendor_agreement_approvals vaa
        JOIN users u ON vaa.approver_user_id = u.id
        WHERE vaa.agreement_id = $1
        ORDER BY vaa.approval_timestamp DESC`,
        [agreementId]
      );
      
      // Fetch documents for each approval
      const approvalsWithDocuments = await Promise.all(
        approvalResult.rows.map(async (approval) => {
          const documentsResult = await pool.query(
            `SELECT 
              id,
              document_name,
              document_type,
              file_size,
              mime_type,
              uploaded_at,
              description
            FROM vendor_agreement_documents
            WHERE approval_id = $1
            ORDER BY uploaded_at DESC`,
            [approval.id]
          );
          
          return {
            ...approval,
            documents: documentsResult.rows
          };
        })
      );
      
      return {
        success: true,
        approvals: approvalsWithDocuments
      };
      
    } catch (error) {
      systemLogger.error('Error fetching approval history', { agreementId, error: error.message });
      throw error;
    }
  }

  /**
   * Get change history for an agreement
   */
  async getChangeHistory(agreementId) {
    try {
      const result = await pool.query(
        `SELECT 
          vac.*,
          u.username,
          u.email
        FROM vendor_agreement_changes vac
        JOIN users u ON vac.changed_by = u.id
        WHERE vac.agreement_id = $1
        ORDER BY vac.changed_at DESC`,
        [agreementId]
      );
      
      return {
        success: true,
        changes: result.rows
      };
      
    } catch (error) {
      systemLogger.error('Error fetching change history', { agreementId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all fully approved agreements (for use in mappings)
   */
  async getApprovedAgreements(projectId = null) {
    try {
      let query = `
        SELECT 
          va.*,
          v.vendor_code,
          v.vendor_name,
          v.drop_location_path
        FROM vendor_agreements va
        JOIN vendors v ON va.vendor_id = v.id
        WHERE va.approval_status = 'fully_approved' AND va.is_locked = true AND va.status = 'active'
      `;
      
      const params = [];
      
      if (projectId) {
        query += ' AND v.project_id = $1';
        params.push(projectId);
      }
      
      query += ' ORDER BY v.vendor_name, va.file_name';
      
      const result = await pool.query(query, params);
      
      return {
        success: true,
        agreements: result.rows
      };
      
    } catch (error) {
      systemLogger.error('Error fetching approved agreements', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete vendor agreement (soft delete by setting status to 'archived')
   */
  async deleteAgreement(agreementId, deletedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if agreement exists
      const checkResult = await client.query(
        'SELECT id, agreement_code FROM vendor_agreements WHERE id = $1',
        [agreementId]
      );
      
      if (checkResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      // Soft delete by updating status to 'archived'
      const result = await client.query(
        `UPDATE vendor_agreements 
         SET status = 'archived', 
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $2
         WHERE id = $1
         RETURNING id, agreement_code`,
        [agreementId, deletedBy]
      );
      
      await client.query('COMMIT');
      
      systemLogger.info('Agreement deleted', {
        agreementId,
        agreementCode: result.rows[0].agreement_code,
        deletedBy
      });
      
      return {
        success: true,
        message: 'Agreement deleted successfully'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error deleting agreement', { agreementId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }
}

module.exports = new VendorAgreementService();
