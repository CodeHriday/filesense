/**
 * Base Email Provider Adapter Interface
 * 
 * Defines the contract for all email provider implementations.
 * Each provider (SMTP, SendGrid, AWS SES, Azure, GCP, Gmail OAuth2, Outlook OAuth2)
 * must implement these methods to ensure consistent behavior across the notification system.
 */

class EmailProviderAdapter {
  constructor(config) {
    this.config = config;
    this.providerName = 'base';
  }

  /**
   * Send an email using the provider
   * @param {Object} emailData - Email data
   * @param {string} emailData.from - Sender email address
   * @param {string|Array<string>} emailData.to - Recipient email address(es)
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.text - Plain text content
   * @param {string} emailData.html - HTML content
   * @param {Array<Object>} emailData.attachments - Attachments (optional)
   * @param {string} emailData.attachments[].filename - Attachment filename
   * @param {Buffer|string} emailData.attachments[].content - Attachment content
   * @param {string} emailData.attachments[].contentType - MIME type
   * @returns {Promise<Object>} - Send result with messageId and status
   */
  async send(emailData) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Test connection to email provider
   * @returns {Promise<boolean>} - True if connection is successful
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Get provider-specific delivery status
   * @param {string} messageId - Message ID returned from send()
   * @returns {Promise<Object>} - Delivery status information
   */
  async getDeliveryStatus(messageId) {
    throw new Error('getDeliveryStatus() must be implemented by subclass');
  }

  /**
   * Validate provider configuration
   * @returns {Object} - Validation result with isValid and errors
   */
  validateConfig() {
    return {
      isValid: true,
      errors: []
    };
  }

  /**
   * Get provider metadata
   * @returns {Object} - Provider information
   */
  getMetadata() {
    return {
      name: this.providerName,
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 10 * 1024 * 1024, // 10MB default
      maxRecipients: 50
    };
  }
}

module.exports = EmailProviderAdapter;
