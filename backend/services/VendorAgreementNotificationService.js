/**
 * Vendor Agreement Notification Service
 * 
 * Sends email notifications to stakeholders when vendor agreements are updated.
 * Stakeholders include:
 * - Primary contact (primary_contact_email)
 * - Secondary contact (secondary_contact_email)
 * - Vendor Manager (manager_contact)
 * - Governance Manager (governance_manager_user_id -> users.email)
 */

const { pool, query } = require('../config/database');
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
        'SELECT username, first_name, last_name FROM users WHERE id = $1',
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
   * Get the default email provider from app settings or storage_connections
   * @returns {Promise<Object|null>} - Email provider connection or null
   */
  async getEmailProvider() {
    try {
      const connectionId = await getSetting(pool, 'default_email_connection_id');
      
      if (!connectionId) {
        systemLogger?.debug('No default email provider configured in app_settings');
        
        const result = await query(
          `SELECT id, type, config, name 
           FROM storage_connections 
           WHERE type IN ('smtp', 'gmail_oauth2', 'outlook_oauth2', 'sendgrid', 'ses', 'azure_email', 'gcp_email')
           AND is_active = true
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
          config: decryptedConfig
        };
      }
      
      const result = await query(
        `SELECT id, type, config, name 
         FROM storage_connections 
         WHERE id = $1 AND is_active = true`,
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
        config: decryptedConfig
      };
    } catch (error) {
      systemLogger?.error('Failed to get email provider', { error: error.message });
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

      const emailContent = await EmailComposer.composeVendorAgreementUpdate({
        agreement,
        vendorName,
        changeSummary,
        changes,
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
}

module.exports = new VendorAgreementNotificationService();
