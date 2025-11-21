/**
 * SendGrid Email Provider Adapter
 * 
 * Implements email sending via SendGrid's Web API.
 * Supports templating, tracking, and delivery analytics.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const axios = require('axios');
const { systemLogger } = require('../../utils/logger');

class SendGridAdapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'sendgrid';
    this.apiKey = config.api_key;
    this.baseUrl = 'https://api.sendgrid.com/v3';
  }

  /**
   * Send email via SendGrid API
   */
  async send(emailData) {
    try {
      const payload = {
        personalizations: [
          {
            to: Array.isArray(emailData.to) 
              ? emailData.to.map(email => ({ email }))
              : [{ email: emailData.to }],
            subject: emailData.subject
          }
        ],
        from: {
          email: emailData.from || this.config.from_email,
          name: emailData.fromName || this.config.from_name || 'Data Observatory Alerts'
        },
        content: []
      };

      // Add plain text content
      if (emailData.text) {
        payload.content.push({
          type: 'text/plain',
          value: emailData.text
        });
      }

      // Add HTML content
      if (emailData.html) {
        payload.content.push({
          type: 'text/html',
          value: emailData.html
        });
      }

      // Add CC and BCC
      if (emailData.cc) {
        payload.personalizations[0].cc = Array.isArray(emailData.cc)
          ? emailData.cc.map(email => ({ email }))
          : [{ email: emailData.cc }];
      }
      if (emailData.bcc) {
        payload.personalizations[0].bcc = Array.isArray(emailData.bcc)
          ? emailData.bcc.map(email => ({ email }))
          : [{ email: emailData.bcc }];
      }

      // Add attachments
      if (emailData.attachments && emailData.attachments.length > 0) {
        payload.attachments = emailData.attachments.map(att => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) 
            ? att.content.toString('base64') 
            : Buffer.from(att.content).toString('base64'),
          type: att.contentType || att.mimeType || 'application/octet-stream',
          disposition: 'attachment'
        }));
      }

      const response = await axios.post(`${this.baseUrl}/mail/send`, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      // SendGrid returns 202 Accepted on success
      const messageId = response.headers['x-message-id'] || `sendgrid-${Date.now()}`;

      systemLogger?.info('SendGrid email sent successfully', {
        messageId,
        to: emailData.to,
        subject: emailData.subject,
        status: response.status
      });

      return {
        success: true,
        messageId,
        response: response.data,
        provider: 'sendgrid'
      };
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
      
      systemLogger?.error('SendGrid email send failed', {
        error: errorMessage,
        to: emailData.to,
        subject: emailData.subject,
        statusCode: error.response?.status
      });

      return {
        success: false,
        error: errorMessage,
        provider: 'sendgrid'
      };
    }
  }

  /**
   * Test SendGrid API connection
   */
  async testConnection() {
    try {
      // Use the API key validation endpoint
      await axios.get(`${this.baseUrl}/scopes`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return true;
    } catch (error) {
      systemLogger?.error('SendGrid connection test failed', {
        error: error.message,
        statusCode: error.response?.status
      });
      return false;
    }
  }

  /**
   * Get SendGrid delivery status using Message Activity API
   */
  async getDeliveryStatus(messageId) {
    try {
      // SendGrid Message Activity API uses query filters
      const response = await axios.get(`${this.baseUrl}/messages`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        params: {
          query: `msg_id='${messageId}'`,
          limit: 1
        }
      });

      const messages = response.data.messages || [];
      const message = messages.length > 0 ? messages[0] : null;

      return {
        messageId,
        status: message?.status || 'unknown',
        events: message?.events || [],
        provider: 'sendgrid'
      };
    } catch (error) {
      return {
        messageId,
        status: 'unknown',
        error: error.message,
        provider: 'sendgrid'
      };
    }
  }

  /**
   * Validate SendGrid configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.api_key) {
      errors.push('SendGrid API key is required');
    }
    if (!this.config.from_email) {
      errors.push('SendGrid from email is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get SendGrid provider metadata
   */
  getMetadata() {
    return {
      name: 'SendGrid',
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 30 * 1024 * 1024, // 30MB
      maxRecipients: 1000,
      supportsTracking: true,
      supportsTemplates: true
    };
  }
}

module.exports = SendGridAdapter;
