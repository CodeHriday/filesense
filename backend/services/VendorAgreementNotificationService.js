/**
 * Vendor Agreement Notification Service
 * 
 * Sends email notifications to stakeholders when vendor agreements are updated.
 * Stakeholders include:
 * - Primary contact (primary_contact_email)
 * - Secondary contact (secondary_contact_email)
 * - Vendor Manager (manager_contact)
 * - Governance Manager (governance_manager_user_id -> users.email)
 * - Additional stakeholder users (additional_stakeholder_user_ids)
 * - Additional stakeholder group members (additional_stakeholder_group_ids -> user_groups -> users)
 */

const pool = require('../db');
const { query } = require('../config/database');
const EmailProviderFactory = require('./email/EmailProviderFactory');
const connectionService = require('./ConnectionService');
const EmailComposer = require('./EmailComposer');
const { systemLogger } = require('../utils/logger');
const { getSetting } = require('./appSettingsService');

class VendorAgreementNotificationService {
  constructor() {
    this.connectionService = connectionService;
  }

  /**
   * Get stakeholder emails for an agreement
   * @param {Object} agreement - The vendor agreement object
   * @returns {Promise<Array<{email: string, name: string, role: string}>>} - Array of stakeholders
   */
  async getStakeholders(agreement) {
    const stakeholders = [];
    const seenEmails = new Set();

    const addStakeholder = (email, name, role) => {
      if (email && !seenEmails.has(email.toLowerCase())) {
        seenEmails.add(email.toLowerCase());
        stakeholders.push({ email: email.toLowerCase(), name: name || email, role });
      }
    };

    addStakeholder(
      agreement.primary_contact_email, 
      agreement.primary_contact_name, 
      'Primary Contact'
    );

    addStakeholder(
      agreement.secondary_contact_email, 
      agreement.secondary_contact_name, 
      'Secondary Contact'
    );

    addStakeholder(
      agreement.manager_contact, 
      null, 
      'Vendor Manager'
    );

    if (agreement.governance_manager_user_id) {
      try {
        const result = await query(
          'SELECT email, first_name, last_name FROM users WHERE id = $1',
          [agreement.governance_manager_user_id]
        );
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
          addStakeholder(user.email, name, 'Governance Manager');
        }
      } catch (error) {
        systemLogger?.warn('Failed to get governance manager email', {
          agreementId: agreement.id,
          governanceManagerUserId: agreement.governance_manager_user_id,
          error: error.message
        });
      }
    }

    // Add additional stakeholder users
    const additionalUserIds = agreement.additional_stakeholder_user_ids || [];
    if (additionalUserIds.length > 0) {
      try {
        const result = await query(
          `SELECT id, email, first_name, last_name 
           FROM users 
           WHERE id = ANY($1::int[]) AND internal_user = true`,
          [additionalUserIds]
        );
        for (const user of result.rows) {
          const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
          addStakeholder(user.email, name, 'Additional Stakeholder');
        }
      } catch (error) {
        systemLogger?.warn('Failed to get additional stakeholder users', {
          agreementId: agreement.id,
          userIds: additionalUserIds,
          error: error.message
        });
      }
    }

    // Add additional stakeholder group members
    const additionalGroupIds = agreement.additional_stakeholder_group_ids || [];
    if (additionalGroupIds.length > 0) {
      try {
        // Get all user IDs from the specified groups via user_groups junction table
        const groupMembersResult = await query(
          `
          SELECT DISTINCT 
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            ag.name AS group_name
          FROM user_groups ug
          INNER JOIN users u ON u.id = ug.user_id
          INNER JOIN access_groups ag ON ag.id = ug.group_id
          WHERE ug.group_id = ANY($1::int[])
            AND u.internal_user = true
          `,
          [additionalGroupIds]
        );
        
        for (const member of groupMembersResult.rows) {
          const name =
            [member.first_name, member.last_name].filter(Boolean).join(' ') ||
            member.email;

          addStakeholder(
            member.email,
            name,
            `Group Member (${member.group_name})`
          );
        }
      } catch (error) {
        systemLogger?.warn(
          'Failed to get additional stakeholder group members',
          {
            agreementId: agreement.id,
            groupIds: additionalGroupIds,
            error: error.message
          }
        );
        // Explicitly handle the failure: skip adding additional group members
        return;
}
    }

    return stakeholders;
  }

  /**
   * Get vendor name for an agreement
   * @param {number} vendorId - Vendor ID
   * @returns {Promise<string>} - Vendor name
   */
  async getVendorName(vendorId) {
    try {
      const result = await query(
        'SELECT vendor_name FROM vendors WHERE id = $1',
        [vendorId]
      );
      return result.rows.length > 0 ? result.rows[0].vendor_name : 'Unknown Vendor';
    } catch (error) {
      systemLogger?.warn('Failed to get vendor name', {
        vendorId,
        error: error.message
      });
      return 'Unknown Vendor';
    }
  }

  /**
   * Get user name by ID
   * @param {number} userId - User ID
   * @returns {Promise<string>} - User's display name
   */
  async getUserName(userId) {
    if (!userId) return 'System';
    
    try {
      const result = await query(
        'SELECT username, first_name, last_name, email FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        return fullName || user.username || 'System';
      }
      return 'System';
    } catch (error) {
      return 'System';
    }
  }

  /**
   * Get multiple user names by IDs
   * @param {Array<number>} userIds - Array of user IDs
   * @returns {Promise<Array<string>>} - Array of user display names
   */
  async getUserNamesByIds(userIds) {
    if (!userIds || userIds.length === 0) return [];
    
    try {
      const result = await query(
        'SELECT id, username, first_name, last_name, email FROM users WHERE id = ANY($1::int[])',
        [userIds]
      );
      
      const userMap = new Map();
      for (const user of result.rows) {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        const displayName = fullName || user.username || user.email || `User ${user.id}`;
        userMap.set(user.id, displayName);
      }
      
      return userIds.map(id => userMap.get(id) || `User ${id}`);
    } catch (error) {
      systemLogger?.warn('Failed to get user names by IDs', { userIds, error: error.message });
      return userIds.map(id => `User ${id}`);
    }
  }

  /**
   * Get multiple group names by IDs
   * @param {Array<number>} groupIds - Array of group IDs
   * @returns {Promise<Array<string>>} - Array of group names
   */
  async getGroupNamesByIds(groupIds) {
    if (!groupIds || groupIds.length === 0) return [];
    
    try {
      const result = await query(
        'SELECT id, name FROM access_groups WHERE id = ANY($1::int[])',
        [groupIds]
      );
      
      const groupMap = new Map();
      for (const group of result.rows) {
        groupMap.set(group.id, group.name || `Group ${group.id}`);
      }
      
      return groupIds.map(id => groupMap.get(id) || `Group ${id}`);
    } catch (error) {
      systemLogger?.warn('Failed to get group names by IDs', { groupIds, error: error.message });
      return groupIds.map(id => `Group ${id}`);
    }
  }

  /**
   * Transform changes to replace IDs with friendly names for email display
   * @param {Array} changes - Array of {field, oldValue, newValue} changes
   * @returns {Promise<Array>} - Transformed changes with friendly names
   */
  async transformChangesForEmail(changes) {
    if (!changes || changes.length === 0) return changes;
    
    const transformedChanges = [];
    
    for (const change of changes) {
      let transformedChange = { ...change };
      
      // Transform additional_stakeholder_user_ids to user names
      if (change.field === 'additional_stakeholder_user_ids' || 
          change.field === 'Additional Stakeholder User Ids') {
        const oldIds = Array.isArray(change.oldValue) ? change.oldValue : [];
        const newIds = Array.isArray(change.newValue) ? change.newValue : [];
        
        const [oldNames, newNames] = await Promise.all([
          this.getUserNamesByIds(oldIds),
          this.getUserNamesByIds(newIds)
        ]);
        
        transformedChange = {
          field: 'Additional Stakeholders (Users)',
          oldValue: oldNames.length > 0 ? oldNames.join(', ') : 'None',
          newValue: newNames.length > 0 ? newNames.join(', ') : 'None'
        };
      }
      // Transform additional_stakeholder_group_ids to group names
      else if (change.field === 'additional_stakeholder_group_ids' ||
               change.field === 'Additional Stakeholder Group Ids') {
        const oldIds = Array.isArray(change.oldValue) ? change.oldValue : [];
        const newIds = Array.isArray(change.newValue) ? change.newValue : [];
        
        const [oldNames, newNames] = await Promise.all([
          this.getGroupNamesByIds(oldIds),
          this.getGroupNamesByIds(newIds)
        ]);
        
        transformedChange = {
          field: 'Additional Stakeholders (Groups)',
          oldValue: oldNames.length > 0 ? oldNames.join(', ') : 'None',
          newValue: newNames.length > 0 ? newNames.join(', ') : 'None'
        };
      }
      // Transform file_owner_user_id to user name
      else if (change.field === 'file_owner_user_id' ||
               change.field === 'File Owner User Id') {
        const [oldName, newName] = await Promise.all([
          change.oldValue ? this.getUserName(change.oldValue) : Promise.resolve('None'),
          change.newValue ? this.getUserName(change.newValue) : Promise.resolve('None')
        ]);
        
        transformedChange = {
          field: 'File Owner',
          oldValue: oldName,
          newValue: newName
        };
      }
      // Transform governance_manager_user_id to user name
      else if (change.field === 'governance_manager_user_id' ||
               change.field === 'Governance Manager User Id') {
        const [oldName, newName] = await Promise.all([
          change.oldValue ? this.getUserName(change.oldValue) : Promise.resolve('None'),
          change.newValue ? this.getUserName(change.newValue) : Promise.resolve('None')
        ]);
        
        transformedChange = {
          field: 'Governance Manager',
          oldValue: oldName,
          newValue: newName
        };
      }
      
      transformedChanges.push(transformedChange);
    }
    
    return transformedChanges;
  }

  /**
   * Get the default email provider from app settings or storage_connections
   * @returns {Promise<Object|null>} - Email provider connection or null
   */
  async getEmailProvider() {
    try {
      const connectionId = await getSetting(pool, 'default_email_connection_id');
      
      if (!connectionId) {
        systemLogger?.debug('No default email provider configured in app_settings');
        
        // Use correct column names: connection_id, status, is_deleted
        const result = await query(
          `SELECT connection_id, type, config, name 
           FROM storage_connections 
           WHERE type IN ('smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email')
           AND status = 'active'
           AND (is_deleted = false OR is_deleted IS NULL)
           ORDER BY created_at ASC
           LIMIT 1`
        );
        
        if (result.rows.length === 0) {
          systemLogger?.warn('No email provider available for vendor agreement notifications');
          return null;
        }
        
        const connection = result.rows[0];
        const decryptedConfig = this.connectionService.decryptSensitiveFields(
          connection.type,
          connection.config
        );
        
        return {
          ...connection,
          id: connection.connection_id, // Map connection_id to id for compatibility
          config: decryptedConfig
        };
      }
      
      // Use correct column names: connection_id, status, is_deleted
      const result = await query(
        `SELECT connection_id, type, config, name 
         FROM storage_connections 
         WHERE connection_id = $1 
         AND status = 'active'
         AND (is_deleted = false OR is_deleted IS NULL)`,
        [connectionId]
      );
      
      if (result.rows.length === 0) {
        systemLogger?.warn('Configured email provider not found or inactive', { connectionId });
        return null;
      }
      
      const connection = result.rows[0];
      const decryptedConfig = this.connectionService.decryptSensitiveFields(
        connection.type,
        connection.config
      );
      
      return {
        ...connection,
        id: connection.connection_id, // Map connection_id to id for compatibility
        config: decryptedConfig
      };
    } catch (error) {
      systemLogger?.error('Failed to get email provider', { error: error.message, stack: error.stack });
      return null;
    }
  }

  /**
   * Send email using the provider
   * @param {Object} provider - Email provider connection
   * @param {Object} emailData - Email data (to, subject, html, text)
   * @returns {Promise<Object>} - Send result
   */
  async sendEmail(provider, emailData) {
    try {
      const adapter = EmailProviderFactory.createAdapter(provider.type, provider.config);
      const result = await adapter.send(emailData);
      return result;
    } catch (error) {
      systemLogger?.error('Failed to send email', {
        providerType: provider.type,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send agreement update notifications to all stakeholders
   * @param {Object} options - Notification options
   * @param {Object} options.agreement - The updated agreement object
   * @param {string} options.changeSummary - Human-readable change summary
   * @param {Array} options.changes - Array of {field, oldValue, newValue} changes
   * @param {number} options.updatedBy - User ID who made the update
   * @param {string} options.baseUrl - Base URL for the application
   * @returns {Promise<Object>} - Notification result
   */
  async sendUpdateNotification({ agreement, changeSummary, changes, updatedBy, baseUrl }) {
    const result = {
      success: false,
      stakeholders: [],
      sent: 0,
      failed: 0,
      errors: []
    };

    try {
      const provider = await this.getEmailProvider();
      
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping vendor agreement notification - no email provider', {
          agreementId: agreement.id
        });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        systemLogger?.info('Skipping vendor agreement notification - no stakeholders', {
          agreementId: agreement.id
        });
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const updatedByName = await this.getUserName(updatedBy);
      
      // Transform changes to replace IDs with friendly names
      const transformedChanges = await this.transformChangesForEmail(changes);

      const emailContent = await EmailComposer.composeVendorAgreementUpdate({
        agreement,
        vendorName,
        changeSummary,
        changes: transformedChanges,
        updatedByName,
        baseUrl: baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app'
      });

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, {
          to: recipientEmails,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        });
        
        result.sent = stakeholders.length;
        result.success = true;
        
        systemLogger?.info('Sent vendor agreement update notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        
        systemLogger?.error('Failed to send vendor agreement update notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendUpdateNotification', {
        agreementId: agreement.id,
        error: error.message
      });
      return result;
    }
  }

  /**
   * Queue notification for async processing (for future enhancement)
   * For now, this sends synchronously but could be enhanced to use BullMQ
   */
  async queueNotification(options) {
    return this.sendUpdateNotification(options);
  }

  /**
   * Send manager rejection notification to stakeholders
   * @param {Object} options - Notification options
   * @param {Object} options.agreement - The agreement object
   * @param {string} options.rejectionReason - Reason for rejection (comments)
   * @param {number} options.rejectedBy - User ID who rejected
   * @param {string} options.baseUrl - Base URL for the application
   * @returns {Promise<Object>} - Notification result
   */
  async sendManagerRejectionNotification({ agreement, rejectionReason, rejectedBy, baseUrl }) {
    const result = {
      success: false,
      stakeholders: [],
      sent: 0,
      failed: 0,
      errors: []
    };

    try {
      const provider = await this.getEmailProvider();
      
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping manager rejection notification - no email provider', {
          agreementId: agreement.id
        });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        systemLogger?.info('Skipping manager rejection notification - no stakeholders', {
          agreementId: agreement.id
        });
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const rejectedByName = await this.getUserName(rejectedBy);
      const appBaseUrl = baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app';

      const subject = `[Manager Rejected] Contract ${agreement.agreement_code} - ${vendorName}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #dc2626; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 24px; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .alert-box h3 { color: #dc2626; margin: 0 0 8px 0; font-size: 14px; }
    .alert-box p { margin: 0; color: #7f1d1d; font-size: 14px; }
    .details { margin: 20px 0; }
    .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
    .detail-label { font-weight: 600; color: #6b7280; min-width: 140px; font-size: 13px; }
    .detail-value { color: #111827; font-size: 13px; }
    .reason-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #dc2626; }
    .reason-box h4 { margin: 0 0 8px 0; color: #374151; font-size: 13px; }
    .reason-box p { margin: 0; color: #4b5563; font-size: 14px; white-space: pre-wrap; }
    .cta-button { display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
    .footer { background: #f9fafb; padding: 16px 24px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Contract Rejected by Manager</h1>
    </div>
    <div class="content">
      <div class="alert-box">
        <h3>Action Required</h3>
        <p>The vendor manager has rejected this contract. Please review the feedback and make necessary revisions.</p>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Agreement Code:</span>
          <span class="detail-value">${agreement.agreement_code}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Vendor:</span>
          <span class="detail-value">${vendorName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Rejected By:</span>
          <span class="detail-value">${rejectedByName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Rejected At:</span>
          <span class="detail-value">${new Date().toLocaleString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
          })}</span>
        </div>
      </div>
      
      <div class="reason-box">
        <h4>Rejection Reason:</h4>
        <p>${rejectionReason || 'No reason provided'}</p>
      </div>
      
      <a href="${appBaseUrl}/vendor-agreements?view=${agreement.id}" class="cta-button">View Contract Details</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from Data File Observatory.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `CONTRACT REJECTED BY MANAGER

Agreement Code: ${agreement.agreement_code}
Vendor: ${vendorName}
Rejected By: ${rejectedByName}
Rejected At: ${new Date().toLocaleString()}

REJECTION REASON:
${rejectionReason || 'No reason provided'}

View contract details: ${appBaseUrl}/vendor-agreements?view=${agreement.id}

---
This is an automated notification from Data File Observatory.`;

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, {
          to: recipientEmails,
          subject,
          html,
          text
        });
        
        result.sent = stakeholders.length;
        result.success = true;
        
        systemLogger?.info('Sent manager rejection notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        
        systemLogger?.error('Failed to send manager rejection notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendManagerRejectionNotification', {
        agreementId: agreement.id,
        error: error.message
      });
      return result;
    }
  }

  /**
   * Generate common email styles for all notification types
   */
  getEmailStyles() {
    return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; color: white; }
    .header-success { background: #059669; }
    .header-warning { background: #d97706; }
    .header-error { background: #dc2626; }
    .header-info { background: #0d9488; }
    .content { padding: 24px; }
    .status-box { border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .status-success { background: #ecfdf5; border: 1px solid #a7f3d0; }
    .status-success h3 { color: #059669; margin: 0 0 8px 0; font-size: 14px; }
    .status-success p { margin: 0; color: #065f46; font-size: 14px; }
    .status-warning { background: #fffbeb; border: 1px solid #fcd34d; }
    .status-warning h3 { color: #d97706; margin: 0 0 8px 0; font-size: 14px; }
    .status-warning p { margin: 0; color: #92400e; font-size: 14px; }
    .status-error { background: #fef2f2; border: 1px solid #fecaca; }
    .status-error h3 { color: #dc2626; margin: 0 0 8px 0; font-size: 14px; }
    .status-error p { margin: 0; color: #7f1d1d; font-size: 14px; }
    .details { margin: 20px 0; }
    .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
    .detail-label { font-weight: 600; color: #6b7280; min-width: 140px; font-size: 13px; }
    .detail-value { color: #111827; font-size: 13px; }
    .reason-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #dc2626; }
    .reason-box h4 { margin: 0 0 8px 0; color: #374151; font-size: 13px; }
    .reason-box p { margin: 0; color: #4b5563; font-size: 14px; white-space: pre-wrap; }
    .comments-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #0d9488; }
    .comments-box h4 { margin: 0 0 8px 0; color: #374151; font-size: 13px; }
    .comments-box p { margin: 0; color: #4b5563; font-size: 14px; white-space: pre-wrap; }
    .cta-button { display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
    .footer { background: #f9fafb; padding: 16px 24px; text-align: center; color: #6b7280; font-size: 12px; }
    .workflow-stage { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .workflow-stage h4 { margin: 0 0 12px 0; color: #374151; font-size: 13px; }
    .stage-item { display: flex; align-items: center; padding: 8px 0; }
    .stage-dot { width: 12px; height: 12px; border-radius: 50%; margin-right: 12px; }
    .stage-complete { background: #059669; }
    .stage-current { background: #0d9488; }
    .stage-pending { background: #d1d5db; }
    .stage-text { font-size: 13px; color: #374151; }`;
  }

  /**
   * Send vendor acceptance notification to stakeholders (Stage 1 - Vendor Accepts)
   */
  async sendVendorAcceptanceNotification({ agreement, acceptedBy, comments, baseUrl }) {
    const result = { success: false, stakeholders: [], sent: 0, failed: 0, errors: [] };

    try {
      const provider = await this.getEmailProvider();
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping vendor acceptance notification - no email provider', { agreementId: agreement.id });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const acceptedByName = await this.getUserName(acceptedBy);
      const appBaseUrl = baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app';

      const subject = `[Vendor Accepted] Contract ${agreement.agreement_code} - ${vendorName}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${this.getEmailStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header header-success">
      <h1>Vendor Has Accepted the Contract</h1>
    </div>
    <div class="content">
      <div class="status-box status-success">
        <h3>Stage 1 Complete</h3>
        <p>The vendor has accepted this contract. It is now pending Manager approval.</p>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Agreement Code:</span>
          <span class="detail-value">${agreement.agreement_code}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Vendor:</span>
          <span class="detail-value">${vendorName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Accepted By:</span>
          <span class="detail-value">${acceptedByName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Accepted At:</span>
          <span class="detail-value">${new Date().toLocaleString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
          })}</span>
        </div>
      </div>
      
      ${comments ? `<div class="comments-box"><h4>Comments:</h4><p>${comments}</p></div>` : ''}
      
      <div class="workflow-stage">
        <h4>Approval Workflow Progress:</h4>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Vendor Acceptance - Complete</span></div>
        <div class="stage-item"><span class="stage-dot stage-current"></span><span class="stage-text">Manager Approval - Pending</span></div>
        <div class="stage-item"><span class="stage-dot stage-pending"></span><span class="stage-text">Governance Approval - Waiting</span></div>
      </div>
      
      <a href="${appBaseUrl}/vendor-agreements?view=${agreement.id}" class="cta-button">View Contract Details</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from Data File Observatory.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `VENDOR HAS ACCEPTED THE CONTRACT

Agreement Code: ${agreement.agreement_code}
Vendor: ${vendorName}
Accepted By: ${acceptedByName}
Accepted At: ${new Date().toLocaleString()}
${comments ? `\nComments: ${comments}` : ''}

NEXT STEP: Manager Approval

View contract details: ${appBaseUrl}/vendor-agreements?view=${agreement.id}

---
This is an automated notification from Data File Observatory.`;

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, { to: recipientEmails, subject, html, text });
        result.sent = stakeholders.length;
        result.success = true;
        systemLogger?.info('Sent vendor acceptance notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        systemLogger?.error('Failed to send vendor acceptance notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendVendorAcceptanceNotification', { agreementId: agreement.id, error: error.message });
      return result;
    }
  }

  /**
   * Send vendor rejection notification to stakeholders (Stage 1 - Vendor Rejects)
   */
  async sendVendorRejectionNotification({ agreement, rejectedBy, rejectionReason, baseUrl }) {
    const result = { success: false, stakeholders: [], sent: 0, failed: 0, errors: [] };

    try {
      const provider = await this.getEmailProvider();
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping vendor rejection notification - no email provider', { agreementId: agreement.id });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const rejectedByName = await this.getUserName(rejectedBy);
      const appBaseUrl = baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app';

      const subject = `[Vendor Rejected] Contract ${agreement.agreement_code} - ${vendorName}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${this.getEmailStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header header-error">
      <h1>Vendor Has Rejected the Contract</h1>
    </div>
    <div class="content">
      <div class="status-box status-error">
        <h3>Action Required</h3>
        <p>The vendor has rejected this contract. Please review the rejection reason and take appropriate action.</p>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Agreement Code:</span>
          <span class="detail-value">${agreement.agreement_code}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Vendor:</span>
          <span class="detail-value">${vendorName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Rejected By:</span>
          <span class="detail-value">${rejectedByName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Rejected At:</span>
          <span class="detail-value">${new Date().toLocaleString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
          })}</span>
        </div>
      </div>
      
      <div class="reason-box">
        <h4>Rejection Reason:</h4>
        <p>${rejectionReason || 'No reason provided'}</p>
      </div>
      
      <a href="${appBaseUrl}/vendor-agreements?view=${agreement.id}" class="cta-button">View Contract Details</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from Data File Observatory.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `VENDOR HAS REJECTED THE CONTRACT

Agreement Code: ${agreement.agreement_code}
Vendor: ${vendorName}
Rejected By: ${rejectedByName}
Rejected At: ${new Date().toLocaleString()}

REJECTION REASON:
${rejectionReason || 'No reason provided'}

View contract details: ${appBaseUrl}/vendor-agreements?view=${agreement.id}

---
This is an automated notification from Data File Observatory.`;

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, { to: recipientEmails, subject, html, text });
        result.sent = stakeholders.length;
        result.success = true;
        systemLogger?.info('Sent vendor rejection notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        systemLogger?.error('Failed to send vendor rejection notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendVendorRejectionNotification', { agreementId: agreement.id, error: error.message });
      return result;
    }
  }

  /**
   * Send manager approval notification to stakeholders (Stage 2 - Manager Approves)
   */
  async sendManagerApprovalNotification({ agreement, approvedBy, comments, baseUrl }) {
    const result = { success: false, stakeholders: [], sent: 0, failed: 0, errors: [] };

    try {
      const provider = await this.getEmailProvider();
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping manager approval notification - no email provider', { agreementId: agreement.id });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const approvedByName = await this.getUserName(approvedBy);
      const appBaseUrl = baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app';

      const subject = `[Manager Approved] Contract ${agreement.agreement_code} - ${vendorName}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${this.getEmailStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header header-success">
      <h1>Manager Has Approved the Contract</h1>
    </div>
    <div class="content">
      <div class="status-box status-success">
        <h3>Stage 2 Complete</h3>
        <p>The vendor manager has approved this contract. It is now pending final Governance approval.</p>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Agreement Code:</span>
          <span class="detail-value">${agreement.agreement_code}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Vendor:</span>
          <span class="detail-value">${vendorName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Approved By:</span>
          <span class="detail-value">${approvedByName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Approved At:</span>
          <span class="detail-value">${new Date().toLocaleString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
          })}</span>
        </div>
      </div>
      
      ${comments ? `<div class="comments-box"><h4>Comments:</h4><p>${comments}</p></div>` : ''}
      
      <div class="workflow-stage">
        <h4>Approval Workflow Progress:</h4>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Vendor Acceptance - Complete</span></div>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Manager Approval - Complete</span></div>
        <div class="stage-item"><span class="stage-dot stage-current"></span><span class="stage-text">Governance Approval - Pending</span></div>
      </div>
      
      <a href="${appBaseUrl}/vendor-agreements?view=${agreement.id}" class="cta-button">View Contract Details</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from Data File Observatory.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `MANAGER HAS APPROVED THE CONTRACT

Agreement Code: ${agreement.agreement_code}
Vendor: ${vendorName}
Approved By: ${approvedByName}
Approved At: ${new Date().toLocaleString()}
${comments ? `\nComments: ${comments}` : ''}

NEXT STEP: Governance Approval (Final)

View contract details: ${appBaseUrl}/vendor-agreements?view=${agreement.id}

---
This is an automated notification from Data File Observatory.`;

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, { to: recipientEmails, subject, html, text });
        result.sent = stakeholders.length;
        result.success = true;
        systemLogger?.info('Sent manager approval notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        systemLogger?.error('Failed to send manager approval notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendManagerApprovalNotification', { agreementId: agreement.id, error: error.message });
      return result;
    }
  }

  /**
   * Send governance approval notification to stakeholders (Stage 3 - Fully Approved)
   */
  async sendGovernanceApprovalNotification({ agreement, approvedBy, comments, baseUrl }) {
    const result = { success: false, stakeholders: [], sent: 0, failed: 0, errors: [] };

    try {
      const provider = await this.getEmailProvider();
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping governance approval notification - no email provider', { agreementId: agreement.id });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const approvedByName = await this.getUserName(approvedBy);
      const appBaseUrl = baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app';

      const subject = `[Fully Approved] Contract ${agreement.agreement_code} - ${vendorName}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${this.getEmailStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header header-success">
      <h1>Contract Fully Approved</h1>
    </div>
    <div class="content">
      <div class="status-box status-success">
        <h3>All Approvals Complete</h3>
        <p>This contract has been fully approved by all stakeholders and is now locked and active.</p>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Agreement Code:</span>
          <span class="detail-value">${agreement.agreement_code}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Vendor:</span>
          <span class="detail-value">${vendorName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Final Approval By:</span>
          <span class="detail-value">${approvedByName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Approved At:</span>
          <span class="detail-value">${new Date().toLocaleString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
          })}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value" style="color: #059669; font-weight: 600;">Locked & Active</span>
        </div>
      </div>
      
      ${comments ? `<div class="comments-box"><h4>Comments:</h4><p>${comments}</p></div>` : ''}
      
      <div class="workflow-stage">
        <h4>Approval Workflow Progress:</h4>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Vendor Acceptance - Complete</span></div>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Manager Approval - Complete</span></div>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Governance Approval - Complete</span></div>
      </div>
      
      <a href="${appBaseUrl}/vendor-agreements?view=${agreement.id}" class="cta-button">View Contract Details</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from Data File Observatory.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `CONTRACT FULLY APPROVED

Agreement Code: ${agreement.agreement_code}
Vendor: ${vendorName}
Final Approval By: ${approvedByName}
Approved At: ${new Date().toLocaleString()}
Status: Locked & Active
${comments ? `\nComments: ${comments}` : ''}

All approval stages are complete. The contract is now locked and active.

View contract details: ${appBaseUrl}/vendor-agreements?view=${agreement.id}

---
This is an automated notification from Data File Observatory.`;

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, { to: recipientEmails, subject, html, text });
        result.sent = stakeholders.length;
        result.success = true;
        systemLogger?.info('Sent governance approval notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        systemLogger?.error('Failed to send governance approval notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendGovernanceApprovalNotification', { agreementId: agreement.id, error: error.message });
      return result;
    }
  }

  /**
   * Send governance rejection notification to stakeholders (Stage 3 - Governance Rejects)
   */
  async sendGovernanceRejectionNotification({ agreement, rejectedBy, rejectionReason, baseUrl }) {
    const result = { success: false, stakeholders: [], sent: 0, failed: 0, errors: [] };

    try {
      const provider = await this.getEmailProvider();
      if (!provider) {
        result.errors.push('No email provider configured');
        systemLogger?.info('Skipping governance rejection notification - no email provider', { agreementId: agreement.id });
        return result;
      }

      const stakeholders = await this.getStakeholders(agreement);
      result.stakeholders = stakeholders;

      if (stakeholders.length === 0) {
        result.errors.push('No stakeholders to notify');
        return result;
      }

      const vendorName = await this.getVendorName(agreement.vendor_id);
      const rejectedByName = await this.getUserName(rejectedBy);
      const appBaseUrl = baseUrl || process.env.APP_URL || 'https://your-app-url.replit.app';

      const subject = `[Governance Rejected] Contract ${agreement.agreement_code} - ${vendorName}`;
      
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${this.getEmailStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header header-error">
      <h1>Contract Rejected by Governance</h1>
    </div>
    <div class="content">
      <div class="status-box status-error">
        <h3>Final Approval Denied</h3>
        <p>The governance manager has rejected this contract. Please review the feedback and address the issues.</p>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Agreement Code:</span>
          <span class="detail-value">${agreement.agreement_code}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Vendor:</span>
          <span class="detail-value">${vendorName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Rejected By:</span>
          <span class="detail-value">${rejectedByName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Rejected At:</span>
          <span class="detail-value">${new Date().toLocaleString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
          })}</span>
        </div>
      </div>
      
      <div class="reason-box">
        <h4>Rejection Reason:</h4>
        <p>${rejectionReason || 'No reason provided'}</p>
      </div>
      
      <div class="workflow-stage">
        <h4>Approval Workflow Status:</h4>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Vendor Acceptance - Complete</span></div>
        <div class="stage-item"><span class="stage-dot stage-complete"></span><span class="stage-text">Manager Approval - Complete</span></div>
        <div class="stage-item"><span class="stage-dot" style="background: #dc2626;"></span><span class="stage-text" style="color: #dc2626; font-weight: 600;">Governance Approval - Rejected</span></div>
      </div>
      
      <a href="${appBaseUrl}/vendor-agreements?view=${agreement.id}" class="cta-button">View Contract Details</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from Data File Observatory.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `CONTRACT REJECTED BY GOVERNANCE

Agreement Code: ${agreement.agreement_code}
Vendor: ${vendorName}
Rejected By: ${rejectedByName}
Rejected At: ${new Date().toLocaleString()}

REJECTION REASON:
${rejectionReason || 'No reason provided'}

The contract must be revised and resubmitted for approval.

View contract details: ${appBaseUrl}/vendor-agreements?view=${agreement.id}

---
This is an automated notification from Data File Observatory.`;

      const recipientEmails = stakeholders.map(s => s.email);
      
      try {
        await this.sendEmail(provider, { to: recipientEmails, subject, html, text });
        result.sent = stakeholders.length;
        result.success = true;
        systemLogger?.info('Sent governance rejection notification', {
          agreementId: agreement.id,
          agreementCode: agreement.agreement_code,
          recipients: recipientEmails,
          providerType: provider.type
        });
      } catch (sendError) {
        result.failed = stakeholders.length;
        result.errors.push(sendError.message);
        systemLogger?.error('Failed to send governance rejection notification', {
          agreementId: agreement.id,
          recipients: recipientEmails,
          error: sendError.message
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error.message);
      systemLogger?.error('Error in sendGovernanceRejectionNotification', { agreementId: agreement.id, error: error.message });
      return result;
    }
  }
}

module.exports = new VendorAgreementNotificationService();
