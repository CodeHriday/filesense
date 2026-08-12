/**
 * Vendor Agreement Service
 * Handles vendor agreements, schema management, and dual approval workflow
 */

// Use DI container for database pool to ensure proper initialization
const { getContainer } = require('../di/bootstrapper');
const container = getContainer();
const pool = container.get('dbPool');
const { systemLogger } = require('../utils/logger');
const { parseSchemaFile, validateSchema } = require('../utils/schemaParser');
const crypto = require('crypto');
const { formatChangeSummary } = require('../utils/formatters');

class VendorAgreementService {
  /**
   * Generate unique agreement code
   */
  async generateAgreementCode(vendorId, fileName) {
    const vendorResult = await pool.query('SELECT vendor_code FROM vendors WHERE id = $1', [vendorId]);
    const vendorCode = vendorResult.rows[0]?.vendor_code || 'VND';
    // Use fileName if provided, otherwise use 'DFT' for draft or 'CFG' for configured agreements
    const filePrefix = fileName 
      ? fileName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
      : 'CFG';
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
      // Filter by current agreement version so stale approval records from previous
      // approval cycles (e.g. before an admin re-edit) do not bleed into the UI.
      const result = await pool.query(
        `SELECT approval_stage, action, approval_timestamp 
         FROM vendor_agreement_approvals 
         WHERE agreement_id = $1
           AND agreement_version = $2
         ORDER BY approval_timestamp DESC`,
        [agreement.id, agreement.version]
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
        description,
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
        governance_manager_user_id,
        contains_pii,
        file_type,
        data_classification,
        domain,
        retention_days,
        expected_arrival_time,
        delivery_method,
        status,
        contract_start_date,
        contract_end_date,
        sub_project_id,
        sla_enabled,
        frequency_pattern,
        arrival_time,
        arrival_days,
        alert_threshold_minutes
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
      
      // Validation - vendor_id is always required, other fields only for active agreements
      if (!vendor_id) {
        throw new Error('vendor_id is required');
      }
      
      // Note: file_name is now optional since agreements use file-level configurations
      if (!isDraft) {
        if (!file_owner_user_id || !vendor_connection_id) {
          throw new Error('file_owner_user_id and vendor_connection_id are required');
        }
      }
      
      // Verify vendor exists and get project_id (vendor_id is now always required)
      const vendorCheck = await client.query('SELECT id, project_id, vendor_user_id FROM vendors WHERE id = $1', [vendor_id]);
      if (vendorCheck.rows.length === 0) {
        throw new Error('Vendor not found');
      }
      
      const project_id = vendorCheck.rows[0].project_id;
      const vendorUserId = vendorCheck.rows[0].vendor_user_id;
      
      // Vendor user validation: if creating user is a vendor user, they can only create contracts for their associated vendor
      if (creatingUser && creatingUser.user_type === 'Vendor') {
        if (vendorUserId !== createdBy) {
          throw new Error('Vendor users can only create agreements for their associated vendor');
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
            // Support both legacy bare array and new { columns, file_quality_rules } shape
            const schemaArray = Array.isArray(schemaObj) ? schemaObj
              : (Array.isArray(schemaObj?.columns) ? schemaObj.columns : []);
            if (schemaArray.length > 0) {
              // Filter out empty objects - check for any meaningful data
              const validRows = schemaArray.filter(row => {
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
      
      // Generate agreement code (always generate, even without file_name)
      let agreementCode = await this.generateAgreementCode(vendor_id || 0, file_name);
      
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
      
      // Set status - default to 'active' if not specified
      const finalStatus = status || 'active';
      
      // Set approval_status - 'draft' for draft agreements, 'pending_vendor_acceptance' for active agreements
      const approvalStatus = finalStatus === 'draft' ? 'draft' : 'pending_vendor_acceptance';
      
      // Prepare additional stakeholder arrays
      const additionalStakeholderUserIds = agreementData.additional_stakeholder_user_ids || [];
      const additionalStakeholderGroupIds = agreementData.additional_stakeholder_group_ids || [];
      
      // Create agreement
      const result = await client.query(
        `INSERT INTO vendor_agreements (
          vendor_id, agreement_code, file_name, file_description, description, schema,
          frequency, frequency_description, vendor_department_team, vendor_department_email, vendor_type, vendor_onboarding_date, file_owner_user_id,
          primary_contact_name, primary_contact_phone, primary_contact_email, primary_contact_designation,
          secondary_contact_name, secondary_contact_phone, secondary_contact_email, secondary_contact_designation,
          owner_contact, metadata,
          vendor_connection_id, drop_location_path, project_id, sub_project_id,
          manager_contact, governance_manager_user_id,
          contains_pii, file_type, data_classification, domain, retention_days, expected_arrival_time, delivery_method,
          sla_enabled, frequency_pattern, arrival_time, arrival_days, alert_threshold_minutes,
          additional_stakeholder_user_ids, additional_stakeholder_group_ids,
          status, contract_start_date, contract_end_date, approval_status, version, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, 1, $48, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          vendor_id, agreementCode, file_name, file_description, description || null, parsedSchema ? JSON.stringify(parsedSchema) : null,
          frequency, frequency_description, vendor_department_team, vendor_department_email, vendor_type, vendor_onboarding_date || null, file_owner_user_id,
          primary_contact_name, primary_contact_phone, finalPrimaryContactEmail, primary_contact_designation,
          secondary_contact_name, secondary_contact_phone, secondary_contact_email, secondary_contact_designation,
          owner_contact, metadata ? JSON.stringify(metadata) : null,
          vendor_connection_id, drop_location_path || null, project_id, sub_project_id || null,
          finalManagerContact, governance_manager_user_id || null,
          contains_pii, file_type, data_classification, domain, retention_days, expected_arrival_time, delivery_method,
          sla_enabled || false, frequency_pattern || 'daily', arrival_time || '09:00', arrival_days || null, alert_threshold_minutes || 60,
          JSON.stringify(additionalStakeholderUserIds), JSON.stringify(additionalStakeholderGroupIds),
          finalStatus, contract_start_date || null, contract_end_date || null, approvalStatus,
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
                `A new contract "${file_name || agreementCode}" has been created and requires your acceptance to proceed.`,
                agreement.id,
                `/vendor-agreements?view=${agreement.id}`,
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
        governance_manager_user_id,
        contains_pii,
        file_type,
        data_classification,
        domain,
        retention_days,
        expected_arrival_time,
        delivery_method,
        contract_start_date,
        contract_end_date,
        sub_project_id,
        status,
        sla_enabled,
        frequency_pattern,
        arrival_time,
        arrival_days,
        alert_threshold_minutes,
        additional_stakeholder_user_ids,
        additional_stakeholder_group_ids
      } = updateData;
      
      // Check for duplicate file_name (excluding current agreement)
      // Only check if file_name has a value (draft contracts can have empty file names)
      if (file_name !== undefined && file_name !== current.file_name && file_name && file_name.trim()) {
        const duplicateCheck = await client.query(
          'SELECT id FROM vendor_agreements WHERE LOWER(TRIM(file_name)) = LOWER(TRIM($1)) AND id != $2',
          [file_name, agreementId]
        );
        
        if (duplicateCheck.rows.length > 0) {
          throw new Error(`An agreement with the file name "${file_name}" already exists. Please use a different file name.`);
        }
      }
      
      // Handle status change from draft to active
      let generatedAgreementCode = null;
      let shouldInitiateApprovalWorkflow = false;
      
      if (status !== undefined && status === 'active' && current.status === 'draft') {
        // Validate required fields when activating a draft
        // Note: file_name is now optional since agreements use file-level configurations
        const finalFileName = file_name !== undefined ? file_name : current.file_name;
        const finalVendorId = current.vendor_id;
        const finalFileOwnerId = file_owner_user_id !== undefined ? file_owner_user_id : current.file_owner_user_id;
        const finalVendorConnectionId = vendor_connection_id !== undefined ? vendor_connection_id : current.vendor_connection_id;
        
        if (!finalVendorId || !finalFileOwnerId || !finalVendorConnectionId) {
          throw new Error('Cannot activate draft: vendor_id, file_owner_user_id, and vendor_connection_id are required');
        }
        
        // Set flag to initiate approval workflow
        shouldInitiateApprovalWorkflow = true;
        
        // Generate agreement code if not already present
        if (!current.agreement_code) {
          generatedAgreementCode = await this.generateAgreementCode(finalVendorId, finalFileName);
          
          // Ensure agreement code is unique
          let codeExists = await client.query(
            'SELECT id FROM vendor_agreements WHERE agreement_code = $1',
            [generatedAgreementCode]
          );
          
          while (codeExists.rows.length > 0) {
            generatedAgreementCode = await this.generateAgreementCode(finalVendorId, finalFileName);
            codeExists = await client.query(
              'SELECT id FROM vendor_agreements WHERE agreement_code = $1',
              [generatedAgreementCode]
            );
          }
          
          systemLogger.info('Generated agreement code for draft activation', { 
            agreementId, 
            agreementCode: generatedAgreementCode 
          });
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
            // Support both legacy bare array and new { columns, file_quality_rules } shape
            const schemaArray = Array.isArray(schemaObj) ? schemaObj
              : (Array.isArray(schemaObj?.columns) ? schemaObj.columns : []);
            if (schemaArray.length > 0) {
              // Filter out empty objects - check for any meaningful data
              const validRows = schemaArray.filter(row => {
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
      
      // Helper function to normalize values for comparison
      const normalizeForComparison = (value) => {
        if (value === null || value === undefined) return null;
        if (value === '') return null;
        
        // If it's a string that looks like JSON, parse it
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              return JSON.parse(trimmed);
            } catch {
              return value;
            }
          }
        }
        return value;
      };
      
      // Helper function to compare values (handles JSON objects/arrays)
      const valuesAreEqual = (a, b) => {
        const normA = normalizeForComparison(a);
        const normB = normalizeForComparison(b);
        
        // Both null/undefined
        if (normA === null && normB === null) return true;
        if (normA === null || normB === null) return false;
        
        // Compare objects/arrays as JSON strings
        if (typeof normA === 'object' || typeof normB === 'object') {
          return JSON.stringify(normA) === JSON.stringify(normB);
        }
        
        // Direct comparison for primitives
        return normA === normB;
      };
      
      // Helper function to normalize dates for comparison
      const normalizeDateForComparison = (value) => {
        if (!value) return null;
        if (value instanceof Date) {
          return value.toISOString().split('T')[0];
        }
        if (typeof value === 'string') {
          // Extract just the date part
          const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
          return dateMatch ? dateMatch[0] : value;
        }
        return String(value);
      };
      
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
      
      const { description } = updateData;
      const normalizedNewDesc = description === '' ? null : description;
      const normalizedCurrDesc = current.description === '' ? null : current.description;
      if (description !== undefined && normalizedNewDesc !== normalizedCurrDesc) {
        updates.push(`description = $${paramIndex}`);
        params.push(description || null);
        changes.description = { from: current.description, to: description };
        paramIndex++;
      }
      
      if (parsedSchema !== undefined && !valuesAreEqual(parsedSchema, current.schema)) {
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
      
      if (vendor_onboarding_date !== undefined) {
        const normCurrentDate = normalizeDateForComparison(current.vendor_onboarding_date);
        const normNewDate = normalizeDateForComparison(vendor_onboarding_date);
        if (normNewDate !== normCurrentDate) {
          updates.push(`vendor_onboarding_date = $${paramIndex}`);
          params.push(vendor_onboarding_date || null);
          changes.vendor_onboarding_date = { from: current.vendor_onboarding_date, to: vendor_onboarding_date };
          paramIndex++;
        }
      }
      
      let managerContactUpdated = false;
      
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
          managerContactUpdated = true;
        }
      }
      
      // Only update manager_contact explicitly if it wasn't already updated by file_owner_user_id change
      if (!managerContactUpdated && manager_contact !== undefined && manager_contact !== current.manager_contact) {
        updates.push(`manager_contact = $${paramIndex}`);
        params.push(manager_contact);
        changes.manager_contact = { from: current.manager_contact, to: manager_contact };
        paramIndex++;
      }
      
      if (governance_manager_user_id !== undefined && governance_manager_user_id !== current.governance_manager_user_id) {
        updates.push(`governance_manager_user_id = $${paramIndex}`);
        params.push(governance_manager_user_id || null);
        changes.governance_manager_user_id = { from: current.governance_manager_user_id, to: governance_manager_user_id };
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
      
      if (metadata !== undefined && !valuesAreEqual(metadata, current.metadata)) {
        updates.push(`metadata = $${paramIndex}`);
        params.push(metadata ? JSON.stringify(metadata) : null);
        changes.metadata = { from: current.metadata, to: metadata };
        paramIndex++;
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
      
      if (sub_project_id !== undefined && sub_project_id !== current.sub_project_id) {
        updates.push(`sub_project_id = $${paramIndex}`);
        params.push(sub_project_id || null);
        changes.sub_project_id = { from: current.sub_project_id, to: sub_project_id };
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
      
      if (sla_enabled !== undefined && sla_enabled !== current.sla_enabled) {
        updates.push(`sla_enabled = $${paramIndex}`);
        params.push(sla_enabled);
        changes.sla_enabled = { from: current.sla_enabled, to: sla_enabled };
        paramIndex++;
      }
      
      if (frequency_pattern !== undefined && frequency_pattern !== current.frequency_pattern) {
        updates.push(`frequency_pattern = $${paramIndex}`);
        params.push(frequency_pattern);
        changes.frequency_pattern = { from: current.frequency_pattern, to: frequency_pattern };
        paramIndex++;
      }
      
      if (arrival_time !== undefined && arrival_time !== current.arrival_time) {
        updates.push(`arrival_time = $${paramIndex}`);
        params.push(arrival_time);
        changes.arrival_time = { from: current.arrival_time, to: arrival_time };
        paramIndex++;
      }
      
      if (arrival_days !== undefined && !valuesAreEqual(arrival_days, current.arrival_days)) {
        updates.push(`arrival_days = $${paramIndex}`);
        params.push(arrival_days || null);
        changes.arrival_days = { from: current.arrival_days, to: arrival_days };
        paramIndex++;
      }
      
      if (alert_threshold_minutes !== undefined && alert_threshold_minutes !== current.alert_threshold_minutes) {
        updates.push(`alert_threshold_minutes = $${paramIndex}`);
        params.push(alert_threshold_minutes);
        changes.alert_threshold_minutes = { from: current.alert_threshold_minutes, to: alert_threshold_minutes };
        paramIndex++;
      }
      
      // Handle additional stakeholder user IDs (JSONB array)
      if (additional_stakeholder_user_ids !== undefined) {
        const currentUserIds = current.additional_stakeholder_user_ids || [];
        const newUserIds = Array.isArray(additional_stakeholder_user_ids) ? additional_stakeholder_user_ids : [];
        const currentUserIdsStr = JSON.stringify(currentUserIds.sort());
        const newUserIdsStr = JSON.stringify([...newUserIds].sort());
        
        if (currentUserIdsStr !== newUserIdsStr) {
          updates.push(`additional_stakeholder_user_ids = $${paramIndex}`);
          params.push(JSON.stringify(newUserIds));
          changes.additional_stakeholder_user_ids = { from: currentUserIds, to: newUserIds };
          paramIndex++;
        }
      }
      
      // Handle additional stakeholder group IDs (JSONB array)
      if (additional_stakeholder_group_ids !== undefined) {
        const currentGroupIds = current.additional_stakeholder_group_ids || [];
        const newGroupIds = Array.isArray(additional_stakeholder_group_ids) ? additional_stakeholder_group_ids : [];
        const currentGroupIdsStr = JSON.stringify(currentGroupIds.sort());
        const newGroupIdsStr = JSON.stringify([...newGroupIds].sort());
        
        if (currentGroupIdsStr !== newGroupIdsStr) {
          updates.push(`additional_stakeholder_group_ids = $${paramIndex}`);
          params.push(JSON.stringify(newGroupIds));
          changes.additional_stakeholder_group_ids = { from: currentGroupIds, to: newGroupIds };
          paramIndex++;
        }
      }
      
      if (contract_start_date !== undefined) {
        const currentStartDate = normalizeDateForComparison(current.contract_start_date);
        const newStartDate = normalizeDateForComparison(contract_start_date);
        if (newStartDate !== currentStartDate) {
          updates.push(`contract_start_date = $${paramIndex}`);
          params.push(contract_start_date || null);
          changes.contract_start_date = { from: current.contract_start_date, to: contract_start_date };
          paramIndex++;
        }
      }
      
      if (contract_end_date !== undefined) {
        const currentEndDate = normalizeDateForComparison(current.contract_end_date);
        const newEndDate = normalizeDateForComparison(contract_end_date);
        if (newEndDate !== currentEndDate) {
          updates.push(`contract_end_date = $${paramIndex}`);
          params.push(contract_end_date || null);
          changes.contract_end_date = { from: current.contract_end_date, to: contract_end_date };
          paramIndex++;
        }
      }
      
      if (status !== undefined && status !== current.status) {
        updates.push(`status = $${paramIndex}`);
        params.push(status);
        changes.status = { from: current.status, to: status };
        paramIndex++;
        
        // If changing to draft status, reset approval_status to null and clear all approval fields
        if (status === 'draft') {
          updates.push(`approval_status = NULL`);
          updates.push(`vendor_approved_at = NULL`);
          updates.push(`vendor_approved_by = NULL`);
          updates.push(`owner_approved_at = NULL`);
          updates.push(`owner_approved_by = NULL`);
          changes.approval_status = { from: current.approval_status, to: null };
          
          systemLogger.info('Reset approval status for draft agreement', { 
            agreementId, 
            previousApprovalStatus: current.approval_status
          });
        }
      }
      
      // Initialize approval workflow when activating a draft
      if (shouldInitiateApprovalWorkflow) {
        updates.push(`approval_status = $${paramIndex}`);
        params.push('pending_vendor_acceptance');
        changes.approval_status = { from: current.approval_status, to: 'pending_vendor_acceptance' };
        paramIndex++;
        
        systemLogger.info('Initiated approval workflow for activated draft', { 
          agreementId, 
          previousApprovalStatus: current.approval_status,
          newApprovalStatus: 'pending_vendor_acceptance'
        });
      }
      
      if (generatedAgreementCode) {
        updates.push(`agreement_code = $${paramIndex}`);
        params.push(generatedAgreementCode);
        changes.agreement_code = { from: current.agreement_code, to: generatedAgreementCode };
        paramIndex++;
      }
      
      // For draft agreements, always ensure approval_status is null
      // This handles both new drafts and existing drafts that may have stale approval_status
      const effectiveStatus = status !== undefined ? status : current.status;
      if (effectiveStatus === 'draft' && current.approval_status !== null) {
        updates.push(`approval_status = NULL`);
        updates.push(`vendor_approved_at = NULL`);
        updates.push(`vendor_approved_by = NULL`);
        updates.push(`owner_approved_at = NULL`);
        updates.push(`owner_approved_by = NULL`);
        changes.approval_status = { from: current.approval_status, to: null };
        
        systemLogger.info('Reset approval status for draft agreement', { 
          agreementId, 
          previousApprovalStatus: current.approval_status
        });
      }
      
      if (updates.length === 0) {
        return { success: false, error: 'No changes detected' };
      }
      
      // Track if we need to reset approvals
      let approvalsReset = false;
      let resetReason = '';
      
      // If locked and admin is making changes, unlock and reset approvals
      if (current.is_locked && isAdmin) {
        updates.push(`is_locked = false`);
        updates.push(`locked_at = NULL`);
        updates.push(`approval_status = 'pending_vendor_acceptance'`);
        updates.push(`vendor_approved_at = NULL`);
        updates.push(`vendor_approved_by = NULL`);
        updates.push(`owner_approved_at = NULL`);
        updates.push(`owner_approved_by = NULL`);
        updates.push(`version = version + 1`);
        approvalsReset = true;
        resetReason = 'Agreement unlocked by Admin for modifications';
        
        // Log unlock
        await client.query(
          `INSERT INTO vendor_agreement_changes (
            agreement_id, change_type, changes_summary, from_version, to_version, changed_by, changed_at
          ) VALUES ($1, 'unlocked', 'Agreement unlocked by Admin for modifications', $2, $3, $4, CURRENT_TIMESTAMP)`,
          [agreementId, current.version, current.version + 1, updatedBy]
        );
      } 
      // If in approval workflow (not draft, not locked), reset approvals
      else if (current.approval_status && 
               current.approval_status !== 'draft' && 
               current.status === 'active' &&
               !current.is_locked) {
        updates.push(`approval_status = 'pending_vendor_acceptance'`);
        updates.push(`vendor_approved_at = NULL`);
        updates.push(`vendor_approved_by = NULL`);
        updates.push(`owner_approved_at = NULL`);
        updates.push(`owner_approved_by = NULL`);
        updates.push(`version = version + 1`);
        approvalsReset = true;
        resetReason = `Contract modified during approval workflow (was: ${current.approval_status})`;
        
        systemLogger.info('Resetting approvals due to contract modification', { 
          agreementId, 
          previousApprovalStatus: current.approval_status,
          changedBy: updatedBy
        });
        
        // Log approval reset as 'updated' change type (approval_reset not in allowed constraint values)
        await client.query(
          `INSERT INTO vendor_agreement_changes (
            agreement_id, change_type, changes_summary, from_version, to_version, changed_by, changed_at, reason
          ) VALUES ($1, 'updated', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)`,
          [
            agreementId, 
            JSON.stringify({ 
              approval_reset: true,
              previous_approval_status: current.approval_status, 
              reset_to: 'pending_vendor_acceptance',
              fields_changed: Object.keys(changes)
            }), 
            current.version, 
            current.version + 1, 
            updatedBy,
            resetReason
          ]
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
      
      systemLogger.info('Vendor agreement updated', { 
        agreementId, 
        approvalsReset,
        resetReason: resetReason || null
      });
      
      // Send notification to stakeholders (async, non-blocking)
      if (Object.keys(changes).length > 0) {
        setImmediate(async () => {
          try {
            const VendorAgreementNotificationService = require('./VendorAgreementNotificationService');
            const changeSummary = formatChangeSummary(changes);
            
            // Helper to safely format values, distinguishing null/undefined from legitimate falsy values
            const formatValue = (value) => {
              if (value === null || value === undefined) return '(empty)';
              if (value === '') return '(empty)';
              if (typeof value === 'boolean') return value ? 'Yes' : 'No';
              if (typeof value === 'number') return String(value);
              return String(value);
            };
            
            const changesArray = Object.entries(changes).map(([field, change]) => ({
              field: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              oldValue: formatValue(change.from),
              newValue: formatValue(change.to)
            }));
            
            await VendorAgreementNotificationService.sendUpdateNotification({
              agreement: updated,
              changeSummary,
              changes: changesArray,
              updatedBy,
              baseUrl: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : process.env.APP_URL
            });
          } catch (notifyError) {
            systemLogger.warn('Failed to send agreement update notification', {
              agreementId,
              error: notifyError.message
            });
          }
        });
      }
      
      return {
        success: true,
        agreement: updated,
        requiresReapproval: current.is_locked && isAdmin,
        approvalsReset,
        resetReason: resetReason || null
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
      if (!['draft', 'pending_vendor_acceptance', 'manager_rejected', 'changes_pending'].includes(agreement.approval_status)) {
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
            `Contract "${agreement.agreement_code}" has been accepted by the vendor and is pending your approval.`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code })
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
            `Contract "${agreement.agreement_code}" has been rejected by the vendor. Reason: ${comments || 'No reason provided'}`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code, rejection_reason: comments })
          ]
        );
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Vendor action completed', { agreementId, action, approverUserId, newStatus });
      
      // Send email notification to all stakeholders asynchronously
      try {
        const VendorAgreementNotificationService = require('./VendorAgreementNotificationService');
        
        // Fetch the updated agreement with stakeholder data for notification
        const updatedAgreementResult = await pool.query(
          `SELECT va.*, 
                  va.additional_stakeholder_user_ids,
                  va.additional_stakeholder_group_ids
           FROM vendor_agreements va 
           WHERE va.id = $1`,
          [agreementId]
        );
        
        if (updatedAgreementResult.rows.length > 0) {
          const updatedAgreement = updatedAgreementResult.rows[0];
          
          if (action === 'accept') {
            // Send vendor acceptance notification
            VendorAgreementNotificationService.sendVendorAcceptanceNotification({
              agreement: updatedAgreement,
              acceptedBy: approverUserId,
              comments: comments,
              baseUrl: process.env.APP_URL || 'https://your-app-url.replit.app'
            }).then(result => {
              if (result.success) {
                systemLogger.info('Vendor acceptance email notification sent', {
                  agreementId,
                  recipientCount: result.sent
                });
              } else if (result.errors.length > 0) {
                systemLogger.warn('Vendor acceptance email notification issues', {
                  agreementId,
                  errors: result.errors
                });
              }
            }).catch(err => {
              systemLogger.error('Failed to send vendor acceptance email notification', {
                agreementId,
                error: err.message
              });
            });
          } else {
            // Send vendor rejection notification
            VendorAgreementNotificationService.sendVendorRejectionNotification({
              agreement: updatedAgreement,
              rejectedBy: approverUserId,
              rejectionReason: comments,
              baseUrl: process.env.APP_URL || 'https://your-app-url.replit.app'
            }).then(result => {
              if (result.success) {
                systemLogger.info('Vendor rejection email notification sent', {
                  agreementId,
                  recipientCount: result.sent
                });
              } else if (result.errors.length > 0) {
                systemLogger.warn('Vendor rejection email notification issues', {
                  agreementId,
                  errors: result.errors
                });
              }
            }).catch(err => {
              systemLogger.error('Failed to send vendor rejection email notification', {
                agreementId,
                error: err.message
              });
            });
          }
        }
      } catch (notificationError) {
        // Log but don't fail the main operation
        systemLogger.error('Error setting up vendor action notification', {
          agreementId,
          error: notificationError.message
        });
      }
      
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
            `Contract "${agreement.agreement_code}" has been approved by the manager and is pending your final approval.`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code })
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
              `Contract "${agreement.agreement_code}" has been rejected by the manager. Reason: ${comments || 'No reason provided'}`,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code, rejection_reason: comments })
            ]
          );
        }
        
        // Send email notification to all stakeholders
        try {
          const VendorAgreementNotificationService = require('./VendorAgreementNotificationService');
          
          // Fetch the updated agreement with stakeholder data for notification
          const updatedAgreementResult = await client.query(
            `SELECT va.*, 
                    va.additional_stakeholder_user_ids,
                    va.additional_stakeholder_group_ids
             FROM vendor_agreements va 
             WHERE va.id = $1`,
            [agreementId]
          );
          
          if (updatedAgreementResult.rows.length > 0) {
            const updatedAgreement = updatedAgreementResult.rows[0];
            
            // Send email notification asynchronously (don't block the main flow)
            VendorAgreementNotificationService.sendManagerRejectionNotification({
              agreement: updatedAgreement,
              rejectionReason: comments,
              rejectedBy: approverUserId,
              baseUrl: process.env.APP_URL || 'https://your-app-url.replit.app'
            }).then(result => {
              if (result.success) {
                systemLogger.info('Manager rejection email notification sent', {
                  agreementId,
                  recipientCount: result.sent
                });
              } else if (result.errors.length > 0) {
                systemLogger.warn('Manager rejection email notification issues', {
                  agreementId,
                  errors: result.errors
                });
              }
            }).catch(err => {
              systemLogger.error('Failed to send manager rejection email notification', {
                agreementId,
                error: err.message
              });
            });
          }
        } catch (notificationError) {
          // Log but don't fail the main operation
          systemLogger.error('Error setting up manager rejection notification', {
            agreementId,
            error: notificationError.message
          });
        }
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Manager action completed', { agreementId, action, approverUserId, newStatus });
      
      // Send email notification for manager approval (rejection is already handled above)
      if (action === 'approve') {
        try {
          const VendorAgreementNotificationService = require('./VendorAgreementNotificationService');
          
          // Fetch the updated agreement with stakeholder data for notification
          const updatedAgreementResult = await pool.query(
            `SELECT va.*, 
                    va.additional_stakeholder_user_ids,
                    va.additional_stakeholder_group_ids
             FROM vendor_agreements va 
             WHERE va.id = $1`,
            [agreementId]
          );
          
          if (updatedAgreementResult.rows.length > 0) {
            const updatedAgreement = updatedAgreementResult.rows[0];
            
            // Send email notification asynchronously (don't block the main flow)
            VendorAgreementNotificationService.sendManagerApprovalNotification({
              agreement: updatedAgreement,
              approvedBy: approverUserId,
              comments: comments,
              baseUrl: process.env.APP_URL || 'https://your-app-url.replit.app'
            }).then(result => {
              if (result.success) {
                systemLogger.info('Manager approval email notification sent', {
                  agreementId,
                  recipientCount: result.sent
                });
              } else if (result.errors.length > 0) {
                systemLogger.warn('Manager approval email notification issues', {
                  agreementId,
                  errors: result.errors
                });
              }
            }).catch(err => {
              systemLogger.error('Failed to send manager approval email notification', {
                agreementId,
                error: err.message
              });
            });
          }
        } catch (notificationError) {
          // Log but don't fail the main operation
          systemLogger.error('Error setting up manager approval notification', {
            agreementId,
            error: notificationError.message
          });
        }
      }
      
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
      if (agreement.approval_status !== 'vendor_rejected') {
        throw new Error('Agreement has not been rejected by vendor');
      }
      
      // Verify authorization
      if (!isAdmin && agreement.file_owner_user_id !== approverUserId) {
        throw new Error('Only the vendor manager can handle vendor rejection');
      }
      
      if (!comments) {
        throw new Error('Comments are required for this action');
      }
      
      // Record action - map to valid action values for check constraint
      const actionValue = action === 'send-to-vendor' ? 'revoked' : 'approved';
      const approvalResult = await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, ip_address, user_agent, approval_stage
        ) VALUES ($1, 'manager', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8)
        RETURNING id`,
        [agreementId, approverUserId, actionValue, comments, agreement.version, ipAddress, userAgent,
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
        // Find vendor user to notify - check vendor_approved_by or find last vendor approver
        let vendorUserToNotify = agreement.vendor_approved_by;
        
        if (!vendorUserToNotify) {
          // Find the most recent vendor approver from approvals history
          const lastVendorApproval = await client.query(
            `SELECT approver_user_id 
             FROM vendor_agreement_approvals 
             WHERE agreement_id = $1 AND approver_type = 'vendor'
             ORDER BY approval_timestamp DESC 
             LIMIT 1`,
            [agreementId]
          );
          
          if (lastVendorApproval.rows.length > 0) {
            vendorUserToNotify = lastVendorApproval.rows[0].approver_user_id;
          } else {
            // Fallback to primary contact email
            const contactUser = await client.query(
              `SELECT id FROM users WHERE email = $1 LIMIT 1`,
              [agreement.primary_contact_email]
            );
            if (contactUser.rows.length > 0) {
              vendorUserToNotify = contactUser.rows[0].id;
            }
          }
        }
        
        // Reset to vendor stage - clear vendor approval
        newStatus = 'pending_vendor_acceptance';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_approved_at = NULL,
               vendor_approved_by = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
        );
        
        notificationTitle = 'Vendor Contract Sent Back for Review';
        notificationMessage = `Contract "${agreement.agreement_code}" has been sent back to you for review. Manager feedback: ${comments}`;
        notificationType = 'vendor_contract_pending_vendor';
        
        // Notify vendor user
        if (vendorUserToNotify) {
          await client.query(
            `INSERT INTO notifications (
              user_id, notification_type, title, message, entity_type, entity_id,
              action_url, metadata
            ) VALUES ($1, $2, $3, $4, 'vendor_agreement', $5, $6, $7)`,
            [
              vendorUserToNotify,
              notificationType,
              notificationTitle,
              notificationMessage,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code, manager_comments: comments })
            ]
          );
        }
        
      } else if (action === 'override-and-approve') {
        // Override vendor rejection and move to governance
        newStatus = 'manager_approved';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_approved_at = CURRENT_TIMESTAMP,
               vendor_approved_by = $2,
               owner_approved_at = CURRENT_TIMESTAMP,
               owner_approved_by = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [newStatus, approverUserId, approverUserId, agreementId]
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
              `Contract "${agreement.agreement_code}" has been approved (vendor rejection overridden) and is pending your final approval. Manager notes: ${comments}`,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code, override_comments: comments })
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
   * Manager handles governance rejection - resubmit or close agreement
   */
  async managerHandleGovernanceRejection(agreementId, approverUserId, action, comments = null, documents = [], agreement) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (!['resubmit', 'close', 'send-to-vendor'].includes(action)) {
        throw new Error('Invalid action. Must be "resubmit", "send-to-vendor", or "close"');
      }
      
      // Verify agreement has governance rejection
      if (agreement.approval_status !== 'governance_rejected') {
        throw new Error('Agreement has not been rejected by governance');
      }
      
      // Verify authorization
      if (agreement.file_owner_user_id !== approverUserId) {
        throw new Error('Only the vendor manager can handle governance rejection');
      }
      
      if (!comments) {
        throw new Error('Comments are required for this action');
      }
      
      // Record action
      const actionValue = action === 'close' ? 'revoked' : 
                         action === 'send-to-vendor' ? 'rejected' : 
                         'approved';
      const approvalStage = action === 'close' ? 'close_agreement' : 
                           action === 'send-to-vendor' ? 'send_to_vendor' : 
                           'resubmit_to_governance';
      const approvalResult = await client.query(
        `INSERT INTO vendor_agreement_approvals (
          agreement_id, approver_type, approver_user_id, action, comments,
          agreement_version, approval_timestamp, approval_stage
        ) VALUES ($1, 'manager', $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
        RETURNING id`,
        [agreementId, approverUserId, actionValue, comments, agreement.version, approvalStage]
      );
      
      const approvalId = approvalResult.rows[0].id;
      
      // Handle documents
      if (documents && documents.length > 0) {
        for (const doc of documents) {
          const docStage = action === 'close' ? 'close_agreement' : 
                          action === 'send-to-vendor' ? 'send_to_vendor' : 
                          'resubmit_to_governance';
          await client.query(
            `INSERT INTO vendor_agreement_documents (
              agreement_id, approval_id, document_name, document_type,
              file_path, file_size, mime_type, uploaded_by, approval_stage, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [agreementId, approvalId, doc.name, doc.type, doc.path,
             doc.size, doc.mimeType, approverUserId, docStage, doc.description]
          );
        }
      }
      
      let newStatus, message;
      
      if (action === 'resubmit') {
        // Reset to governance stage - keep all previous approvals but clear governance rejection
        newStatus = 'manager_approved';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
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
              'Vendor Contract Resubmitted for Governance',
              `Contract "${agreement.agreement_code}" has been revised and resubmitted for your approval. Manager notes: ${comments}`,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code, resubmit_comments: comments })
            ]
          );
        }
        
        message = 'Agreement revised and resubmitted to governance';
      } else if (action === 'send-to-vendor') {
        // Send back to vendor stage - clear all approvals
        newStatus = 'pending_vendor_acceptance';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               vendor_approved_at = NULL,
               vendor_approved_by = NULL,
               owner_approved_at = NULL,
               owner_approved_by = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
        );
        
        // Notify vendor user
        if (agreement.vendor_approved_by) {
          await client.query(
            `INSERT INTO notifications (
              user_id, notification_type, title, message, entity_type, entity_id,
              action_url, metadata
            ) VALUES ($1, 'vendor_contract_sent_back', $2, $3, 'vendor_agreement', $4, $5, $6)`,
            [
              agreement.vendor_approved_by,
              'Vendor Contract Sent Back for Review',
              `Contract "${agreement.agreement_code}" has been sent back to you for review after governance rejection. Manager notes: ${comments}`,
              agreementId,
              `/vendor-agreements?view=${agreementId}`,
              JSON.stringify({ agreement_id: agreementId, agreement_code: agreement.agreement_code, manager_comments: comments })
            ]
          );
        }
        
        message = 'Agreement sent back to vendor for review';
      } else if (action === 'close') {
        // Close the agreement
        newStatus = 'rejected';
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
               is_locked = true,
               locked_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, agreementId]
        );
        
        message = 'Agreement closed due to governance rejection';
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Manager handled governance rejection', { agreementId, action, approverUserId, newStatus });
      
      return {
        success: true,
        message,
        approvalStatus: newStatus,
        approvalId
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error handling governance rejection', { agreementId, error: error.message });
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
               is_locked = $2,
               locked_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newStatus, isLocked, agreementId]
        );
      } else {
        await client.query(
          `UPDATE vendor_agreements 
           SET approval_status = $1,
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
              ? `Contract "${agreement.agreement_code}" has been fully approved and is now locked.`
              : `Contract "${agreement.agreement_code}" has been rejected by governance. Reason: ${comments || 'No reason provided'}`,
            agreementId,
            `/vendor-agreements?view=${agreementId}`,
            JSON.stringify({ 
              agreement_id: agreementId, 
              agreement_code: agreement.agreement_code,
              rejection_reason: action === 'reject' ? comments : null
            })
          ]
        );
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Governance action completed', { agreementId, action, approverUserId, newStatus, isLocked });
      
      // Send email notification for governance approval or rejection
      try {
        const VendorAgreementNotificationService = require('./VendorAgreementNotificationService');
        
        // Fetch the updated agreement with stakeholder data for notification
        const updatedAgreementResult = await pool.query(
          `SELECT va.*, 
                  va.additional_stakeholder_user_ids,
                  va.additional_stakeholder_group_ids
           FROM vendor_agreements va 
           WHERE va.id = $1`,
          [agreementId]
        );
        
        if (updatedAgreementResult.rows.length > 0) {
          const updatedAgreement = updatedAgreementResult.rows[0];
          
          if (action === 'approve') {
            // Send governance approval notification
            VendorAgreementNotificationService.sendGovernanceApprovalNotification({
              agreement: updatedAgreement,
              approvedBy: approverUserId,
              comments: comments,
              baseUrl: process.env.APP_URL || 'https://your-app-url.replit.app'
            }).then(result => {
              if (result.success) {
                systemLogger.info('Governance approval email notification sent', {
                  agreementId,
                  recipientCount: result.sent
                });
              } else if (result.errors.length > 0) {
                systemLogger.warn('Governance approval email notification issues', {
                  agreementId,
                  errors: result.errors
                });
              }
            }).catch(err => {
              systemLogger.error('Failed to send governance approval email notification', {
                agreementId,
                error: err.message
              });
            });
          } else {
            // Send governance rejection notification
            VendorAgreementNotificationService.sendGovernanceRejectionNotification({
              agreement: updatedAgreement,
              rejectedBy: approverUserId,
              rejectionReason: comments,
              baseUrl: process.env.APP_URL || 'https://your-app-url.replit.app'
            }).then(result => {
              if (result.success) {
                systemLogger.info('Governance rejection email notification sent', {
                  agreementId,
                  recipientCount: result.sent
                });
              } else if (result.errors.length > 0) {
                systemLogger.warn('Governance rejection email notification issues', {
                  agreementId,
                  errors: result.errors
                });
              }
            }).catch(err => {
              systemLogger.error('Failed to send governance rejection email notification', {
                agreementId,
                error: err.message
              });
            });
          }
        }
      } catch (notificationError) {
        // Log but don't fail the main operation
        systemLogger.error('Error setting up governance notification', {
          agreementId,
          error: notificationError.message
        });
      }
      
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
        vendorIds = null,
        status = null,
        userId,
        userRoles = [],
        userEmail = null,
        hasApprovePermission = false,
        hasReadPermission = false
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
      
      // Filter by vendor(s) if specified
      if (vendorIds && vendorIds.length > 0) {
        // Multiple vendor IDs - use ANY with explicit integer array cast
        whereClauses.push(`va.vendor_id = ANY($${paramCounter}::integer[])`);
        queryParams.push(vendorIds);
        paramCounter++;
      } else if (vendorId) {
        // Single vendor ID - use equality
        whereClauses.push(`va.vendor_id = $${paramCounter}`);
        queryParams.push(vendorId);
        paramCounter++;
      }
      // Note: When vendorIds is null, no vendor filtering is applied;
      // role-based filtering (contact emails, project membership) handles access control
      
      // Filter by status if specified
      if (status) {
        whereClauses.push(`va.status = $${paramCounter}`);
        queryParams.push(status);
        paramCounter++;
      }
      
      // Apply role-based filtering for non-admin users.
      // Users with vendor_agreements:approve or vendor_agreements:read permission are internal
      // staff who have been explicitly granted access — they bypass contact filtering and see
      // all non-archived agreements. Only external/vendor-role users are filtered to agreements
      // where they hold a designated relationship (file owner, contact, project member, etc.).
      if (!isAdmin && !hasApprovePermission && !hasReadPermission && userId) {
        if (userEmail) {
          // Allow access if user is:
          // 1. File owner (by user ID)
          // 2. Vendor user (by user ID)
          // 3. Primary or secondary contact (by email)
          // 4. Manager contact (by email)
          // 5. Governance manager (by user ID)
          // 6. Member of the vendor's project (direct or via access group)
          // 7. Listed as an additional stakeholder (by user ID in JSONB column)
          // 8. Member of an additional stakeholder group (via access_group_members)
          whereClauses.push(`(
            va.file_owner_user_id = $${paramCounter} 
            OR v.vendor_user_id = $${paramCounter}
            OR va.governance_manager_user_id = $${paramCounter}
            OR va.primary_contact_email = $${paramCounter + 1}
            OR va.secondary_contact_email = $${paramCounter + 1}
            OR va.manager_contact = $${paramCounter + 1}
            OR EXISTS (
              SELECT 1 FROM project_members pm 
              WHERE pm.project_id = v.project_id AND pm.user_id = $${paramCounter}
            )
            OR EXISTS (
              SELECT 1 FROM access_group_members agm
              JOIN project_access_groups pag ON agm.group_id = pag.group_id
              WHERE pag.project_id = v.project_id AND agm.user_id = $${paramCounter}
            )
            OR va.additional_stakeholder_user_ids @> jsonb_build_array($${paramCounter})
            OR EXISTS (
              SELECT 1 FROM access_group_members agm2
              WHERE agm2.user_id = $${paramCounter}
              AND va.additional_stakeholder_group_ids @> jsonb_build_array(agm2.group_id)
            )
          )`);
          queryParams.push(userId, userEmail);
          paramCounter += 2;
        } else {
          // Fallback if email not provided - check file owner, vendor user, governance manager,
          // project membership, and additional stakeholder assignments
          whereClauses.push(`(
            va.file_owner_user_id = $${paramCounter} 
            OR v.vendor_user_id = $${paramCounter}
            OR va.governance_manager_user_id = $${paramCounter}
            OR EXISTS (
              SELECT 1 FROM project_members pm 
              WHERE pm.project_id = v.project_id AND pm.user_id = $${paramCounter}
            )
            OR EXISTS (
              SELECT 1 FROM access_group_members agm
              JOIN project_access_groups pag ON agm.group_id = pag.group_id
              WHERE pag.project_id = v.project_id AND agm.user_id = $${paramCounter}
            )
            OR va.additional_stakeholder_user_ids @> jsonb_build_array($${paramCounter})
            OR EXISTS (
              SELECT 1 FROM access_group_members agm2
              WHERE agm2.user_id = $${paramCounter}
              AND va.additional_stakeholder_group_ids @> jsonb_build_array(agm2.group_id)
            )
          )`);
          queryParams.push(userId);
          paramCounter++;
        }
      }
      
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) 
        FROM vendor_agreements va
        LEFT JOIN vendors v ON va.vendor_id = v.id
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
          source_conn.name as vendor_connection_name,
          source_conn.path as vendor_connection_path
        FROM vendor_agreements va
        LEFT JOIN vendors v ON va.vendor_id = v.id
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
      
      // Fetch file schemas for each agreement
      const agreementIds = result.rows.map(row => row.id);
      let fileSchemasMap = {};
      
      if (agreementIds.length > 0) {
        const fileSchemasResult = await pool.query(
          `SELECT vendor_agreement_id, file_name_pattern as file_name, file_description, schema, contains_pii, 
                  data_classification, file_type, quality_rule_ids, created_at
           FROM vendor_agreement_file_schemas 
           WHERE vendor_agreement_id = ANY($1)
           ORDER BY created_at ASC`,
          [agreementIds]
        );
        
        // Group file schemas by vendor_agreement_id
        fileSchemasResult.rows.forEach(schema => {
          if (!fileSchemasMap[schema.vendor_agreement_id]) {
            fileSchemasMap[schema.vendor_agreement_id] = [];
          }
          fileSchemasMap[schema.vendor_agreement_id].push(schema);
        });
      }
      
      // Enrich agreements with rejection/acceptance timestamps and file schemas
      const enrichedAgreements = await Promise.all(
        result.rows.map(async agreement => {
          const enriched = await this.enrichAgreementWithTimestamps(agreement);
          enriched.file_schemas = fileSchemasMap[agreement.id] || [];
          return enriched;
        })
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
        WHERE (va.approval_status = 'fully_approved' OR va.approval_status = 'governance_approved') 
          AND va.is_locked = true 
          AND va.status = 'active'
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

  /**
   * Disable vendor agreement
   */
  async disableAgreement(agreementId, disabledBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if agreement exists
      const checkResult = await client.query(
        'SELECT id, agreement_code, status FROM vendor_agreements WHERE id = $1',
        [agreementId]
      );
      
      if (checkResult.rows.length === 0) {
        throw new Error('Agreement not found');
      }
      
      if (checkResult.rows[0].status === 'inactive') {
        throw new Error('Agreement is already disabled');
      }
      
      // Disable by updating status to 'inactive'
      const result = await client.query(
        `UPDATE vendor_agreements 
         SET status = 'inactive', 
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $2
         WHERE id = $1
         RETURNING id, agreement_code`,
        [agreementId, disabledBy]
      );
      
      // Log change
      await client.query(
        `INSERT INTO vendor_agreement_changes (
          agreement_id, change_type, changes_summary, changed_by, changed_at
        ) VALUES ($1, 'updated', 'Agreement disabled (status changed to inactive)', $2, CURRENT_TIMESTAMP)`,
        [agreementId, disabledBy]
      );
      
      await client.query('COMMIT');
      
      systemLogger.info('Agreement disabled', {
        agreementId,
        agreementCode: result.rows[0].agreement_code,
        disabledBy
      });
      
      return {
        success: true,
        message: 'Agreement disabled successfully'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error disabling agreement', { agreementId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Auto-disable expired agreements
   * This is called by the scheduled job to disable agreements past their contract_end_date
   */
  async autoDisableExpiredAgreements() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Find active agreements that have passed their contract_end_date
      const expiredAgreements = await client.query(
        `SELECT id, agreement_code, file_name, contract_end_date
         FROM vendor_agreements 
         WHERE status = 'active' 
         AND contract_end_date IS NOT NULL 
         AND contract_end_date < CURRENT_DATE`
      );
      
      if (expiredAgreements.rows.length === 0) {
        await client.query('COMMIT');
        systemLogger.info('No expired agreements found');
        return {
          success: true,
          disabledCount: 0
        };
      }
      
      // Disable all expired agreements
      for (const agreement of expiredAgreements.rows) {
        await client.query(
          `UPDATE vendor_agreements 
           SET status = 'inactive', 
               updated_at = CURRENT_TIMESTAMP,
               updated_by = 1
           WHERE id = $1`,
          [agreement.id]
        );
        
        // Log change
        await client.query(
          `INSERT INTO vendor_agreement_changes (
            agreement_id, change_type, changes_summary, changed_by, changed_at
          ) VALUES ($1, 'auto_disabled', $2, 1, CURRENT_TIMESTAMP)`,
          [agreement.id, `Agreement automatically disabled due to contract expiration (end date: ${agreement.contract_end_date})`]
        );
        
        systemLogger.info('Agreement auto-disabled', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          fileName: agreement.file_name,
          contractEndDate: agreement.contract_end_date
        });
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        disabledCount: expiredAgreements.rows.length,
        disabledAgreements: expiredAgreements.rows.map(a => ({
          id: a.id,
          agreementCode: a.agreement_code,
          fileName: a.file_name,
          contractEndDate: a.contract_end_date
        }))
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error auto-disabling expired agreements', { error: error.message });
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
