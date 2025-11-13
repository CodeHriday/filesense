/**
 * Email Provider Factory
 * 
 * Factory pattern for creating email provider adapter instances.
 * Abstracts the instantiation logic and provides a unified interface
 * for all email providers.
 */

const SmtpAdapter = require('./SmtpAdapter');
const SendGridAdapter = require('./SendGridAdapter');
const AwsSesAdapter = require('./AwsSesAdapter');
const AzureEmailAdapter = require('./AzureEmailAdapter');
const GcpEmailAdapter = require('./GcpEmailAdapter');
const GmailOAuth2Adapter = require('./GmailOAuth2Adapter');
const { systemLogger } = require('../../utils/logger');

class EmailProviderFactory {
  /**
   * Create email provider adapter instance
   * @param {string} type - Provider type (smtp, sendgrid, ses, azure_email, gcp_email, gmail_oauth2, outlook_oauth2)
   * @param {Object} config - Provider configuration
   * @returns {EmailProviderAdapter} - Provider adapter instance
   */
  static createAdapter(type, config) {
    switch (type) {
      case 'smtp':
        return new SmtpAdapter(config);
      
      case 'sendgrid':
        return new SendGridAdapter(config);
      
      case 'ses':
        return new AwsSesAdapter(config);
      
      case 'azure_email':
        return new AzureEmailAdapter(config);
      
      case 'gcp_email':
        return new GcpEmailAdapter(config);
      
      case 'gmail_oauth2':
        return new GmailOAuth2Adapter(config);
      
      case 'outlook_oauth2':
        // Outlook OAuth2 adapter will be implemented in task 7
        throw new Error('Outlook OAuth2 adapter not yet implemented');
      
      default:
        throw new Error(`Unsupported email provider type: ${type}`);
    }
  }

  /**
   * Get all available provider types
   * @returns {Array<string>} - List of provider types
   */
  static getAvailableProviders() {
    return [
      'smtp',
      'sendgrid',
      'ses',
      'azure_email',
      'gcp_email',
      'gmail_oauth2',  // Coming soon
      'outlook_oauth2'  // Coming soon
    ];
  }

  /**
   * Get provider display name
   * @param {string} type - Provider type
   * @returns {string} - Display name
   */
  static getProviderDisplayName(type) {
    const displayNames = {
      smtp: 'SMTP',
      sendgrid: 'SendGrid',
      ses: 'AWS SES',
      azure_email: 'Azure Communication Services',
      gcp_email: 'GCP SMTP Relay',
      gmail_oauth2: 'Gmail (OAuth2)',
      outlook_oauth2: 'Outlook/Office 365 (OAuth2)'
    };

    return displayNames[type] || type;
  }

  /**
   * Validate provider configuration
   * @param {string} type - Provider type
   * @param {Object} config - Provider configuration
   * @returns {Object} - Validation result
   */
  static validateProviderConfig(type, config) {
    try {
      const adapter = EmailProviderFactory.createAdapter(type, config);
      return adapter.validateConfig();
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Test provider connection
   * @param {string} type - Provider type
   * @param {Object} config - Provider configuration
   * @returns {Promise<boolean>} - True if connection test successful
   */
  static async testProviderConnection(type, config) {
    try {
      const adapter = EmailProviderFactory.createAdapter(type, config);
      return await adapter.testConnection();
    } catch (error) {
      systemLogger?.error('Email provider connection test failed', {
        type,
        error: error.message
      });
      return false;
    }
  }
}

module.exports = EmailProviderFactory;
