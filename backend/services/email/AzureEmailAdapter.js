/**
 * Azure Communication Services Email Adapter
 * 
 * Implements email sending via Azure Communication Services Email API.
 * Supports HTML content, attachments, and delivery tracking.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const axios = require('axios');
const { systemLogger } = require('../../utils/logger');

class AzureEmailAdapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'azure_email';
    
    // Parse connection string
    this.parseConnectionString(config.connection_string);
    this.accessKey = config.access_key;
  }

  /**
   * Parse Azure Communication Services connection string
   */
  parseConnectionString(connectionString) {
    const parts = connectionString.split(';').reduce((acc, part) => {
      // Split only on the first '=' to preserve base64 padding in access key
      const eqIndex = part.indexOf('=');
      if (eqIndex > 0) {
        const key = part.substring(0, eqIndex).toLowerCase();
        const value = part.substring(eqIndex + 1);
        acc[key] = value;
      }
      return acc;
    }, {});

    this.endpoint = parts.endpoint;
    this.accessKey = parts.accesskey || this.accessKey;
  }

  /**
   * Generate HMAC-SHA256 signature for Azure Communication Services
   * @param {string} stringToSign - String to sign
   * @returns {string} - Base64 encoded signature
   */
  generateSignature(stringToSign) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', Buffer.from(this.accessKey, 'base64'));
    hmac.update(stringToSign);
    return hmac.digest('base64');
  }

  /**
   * Generate Authorization header for Azure Communication Services
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {string} host - Host header
   * @param {string|Object} body - Request body (optional)
   * @returns {Object} - Authorization headers
   */
  generateAuthHeader(method, path, host, body = null) {
    const crypto = require('crypto');
    const dateString = new Date().toUTCString();
    
    // Always compute SHA256 hash of request body (even for GET/empty requests)
    const bodyString = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const contentHash = crypto.createHash('sha256').update(bodyString).digest('base64');
    
    const stringToSign = `${method}\n${path}\n${dateString};${host};${contentHash}`;
    const signature = this.generateSignature(stringToSign);
    
    return {
      authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
      'x-ms-date': dateString,
      'x-ms-content-sha256': contentHash
    };
  }

  /**
   * Send email via Azure Communication Services
   */
  async send(emailData) {
    try {
      const url = `${this.endpoint}/emails:send?api-version=2023-03-31`;
      
      const payload = {
        senderAddress: emailData.from || this.config.from_email,
        recipients: {
          to: Array.isArray(emailData.to)
            ? emailData.to.map(email => ({ address: email }))
            : [{ address: emailData.to }]
        },
        content: {
          subject: emailData.subject
        }
      };

      // Add plain text and HTML content
      if (emailData.text && emailData.html) {
        payload.content.plainText = emailData.text;
        payload.content.html = emailData.html;
      } else if (emailData.html) {
        payload.content.html = emailData.html;
      } else if (emailData.text) {
        payload.content.plainText = emailData.text;
      }

      // Add CC and BCC
      if (emailData.cc) {
        payload.recipients.cc = Array.isArray(emailData.cc)
          ? emailData.cc.map(email => ({ address: email }))
          : [{ address: emailData.cc }];
      }
      if (emailData.bcc) {
        payload.recipients.bcc = Array.isArray(emailData.bcc)
          ? emailData.bcc.map(email => ({ address: email }))
          : [{ address: emailData.bcc }];
      }

      // Add attachments
      if (emailData.attachments && emailData.attachments.length > 0) {
        payload.attachments = emailData.attachments.map(att => ({
          name: att.filename,
          contentType: att.contentType || 'application/octet-stream',
          contentInBase64: Buffer.isBuffer(att.content)
            ? att.content.toString('base64')
            : Buffer.from(att.content).toString('base64')
        }));
      }

      const urlObj = new URL(url);
      const authHeaders = this.generateAuthHeader('POST', urlObj.pathname + urlObj.search, urlObj.host, payload);
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      });

      // Azure returns operation-location header for tracking
      // Extract the operation ID from the URL (e.g., https://endpoint/emails/{id} → {id})
      let messageId = response.data.id || response.data.messageId;
      if (response.headers['operation-location']) {
        try {
          const operationUrl = new URL(response.headers['operation-location']);
          const pathParts = operationUrl.pathname.split('/');
          messageId = pathParts[pathParts.length - 1]; // Get the last segment (operation ID)
        } catch (e) {
          // Fallback to the full header if URL parsing fails
          messageId = response.headers['operation-location'];
        }
      }

      systemLogger?.info('Azure Communication Services email sent successfully', {
        messageId,
        to: emailData.to,
        subject: emailData.subject,
        status: response.data.status
      });

      return {
        success: true,
        messageId,
        response: response.data,
        provider: 'azure_email'
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      systemLogger?.error('Azure Communication Services email send failed', {
        error: errorMessage,
        to: emailData.to,
        subject: emailData.subject,
        statusCode: error.response?.status
      });

      return {
        success: false,
        error: errorMessage,
        provider: 'azure_email'
      };
    }
  }

  /**
   * Test Azure Communication Services connection
   */
  async testConnection() {
    try {
      // Try to get service properties to verify credentials
      const url = `${this.endpoint}/senderAddresses?api-version=2023-03-31`;
      const urlObj = new URL(url);
      const authHeaders = this.generateAuthHeader('GET', urlObj.pathname + urlObj.search, urlObj.host);
      
      await axios.get(url, {
        headers: authHeaders
      });
      return true;
    } catch (error) {
      systemLogger?.error('Azure Communication Services connection test failed', {
        error: error.message,
        statusCode: error.response?.status
      });
      return false;
    }
  }

  /**
   * Get Azure email delivery status
   */
  async getDeliveryStatus(messageId) {
    try {
      // Azure uses /emails/operations/{id} for delivery status polling
      const url = `${this.endpoint}/emails/operations/${messageId}?api-version=2023-03-31`;
      const urlObj = new URL(url);
      const authHeaders = this.generateAuthHeader('GET', urlObj.pathname + urlObj.search, urlObj.host);
      
      const response = await axios.get(url, {
        headers: authHeaders
      });

      return {
        messageId,
        status: response.data.status,
        provider: 'azure_email'
      };
    } catch (error) {
      return {
        messageId,
        status: 'unknown',
        error: error.message,
        provider: 'azure_email'
      };
    }
  }

  /**
   * Validate Azure email configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.connection_string && !this.endpoint) {
      errors.push('Azure connection string or endpoint is required');
    }
    if (!this.accessKey) {
      errors.push('Azure access key is required');
    }
    if (!this.config.from_email) {
      errors.push('Azure from email is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get Azure email provider metadata
   */
  getMetadata() {
    return {
      name: 'Azure Communication Services',
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 10 * 1024 * 1024, // 10MB
      maxRecipients: 50,
      supportsTracking: true
    };
  }
}

module.exports = AzureEmailAdapter;
