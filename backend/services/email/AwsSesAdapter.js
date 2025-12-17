/**
 * AWS SES Email Provider Adapter
 * 
 * Implements email sending via Amazon Simple Email Service (SES).
 * Supports attachments, HTML content, and delivery tracking.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const { systemLogger } = require('../../utils/logger');

class AwsSesAdapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'aws_ses';
    
    // Configure AWS SES
    this.ses = new AWS.SES({
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
      region: config.region || 'us-east-1'
    });
  }

  /**
   * Send email via AWS SES
   */
  async send(emailData) {
    try {
      const params = {
        Source: emailData.from || this.config.from_email,
        Destination: {
          ToAddresses: Array.isArray(emailData.to) ? emailData.to : [emailData.to]
        },
        Message: {
          Subject: {
            Data: emailData.subject,
            Charset: 'UTF-8'
          },
          Body: {}
        }
      };

      // Add plain text content
      if (emailData.text) {
        params.Message.Body.Text = {
          Data: emailData.text,
          Charset: 'UTF-8'
        };
      }

      // Add HTML content
      if (emailData.html) {
        params.Message.Body.Html = {
          Data: emailData.html,
          Charset: 'UTF-8'
        };
      }

      // Add CC and BCC
      if (emailData.cc) {
        params.Destination.CcAddresses = Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc];
      }
      if (emailData.bcc) {
        params.Destination.BccAddresses = Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc];
      }

      // For attachments, we need to use sendRawEmail instead
      if (emailData.attachments && emailData.attachments.length > 0) {
        return await this.sendRawEmail(emailData);
      }

      const result = await this.ses.sendEmail(params).promise();

      systemLogger?.info('AWS SES email sent successfully', {
        messageId: result.MessageId,
        to: params.Destination.ToAddresses,
        subject: emailData.subject
      });

      return {
        success: true,
        messageId: result.MessageId,
        response: result,
        provider: 'aws_ses'
      };
    } catch (error) {
      systemLogger?.error('AWS SES email send failed', {
        error: error.message,
        to: emailData.to,
        subject: emailData.subject,
        code: error.code
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        provider: 'aws_ses'
      };
    }
  }

  /**
   * Send raw email with attachments via AWS SES
   */
  async sendRawEmail(emailData) {
    try {
      // Build MIME message
      const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      let rawMessage = '';

      // Headers
      rawMessage += `From: ${emailData.from || this.config.from_email}\r\n`;
      rawMessage += `To: ${Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to}\r\n`;
      if (emailData.cc) {
        rawMessage += `Cc: ${Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc}\r\n`;
      }
      rawMessage += `Subject: ${emailData.subject}\r\n`;
      rawMessage += `MIME-Version: 1.0\r\n`;
      rawMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

      // Text/HTML body
      if (emailData.text || emailData.html) {
        rawMessage += `--${boundary}\r\n`;
        rawMessage += `Content-Type: multipart/alternative; boundary="${boundary}_alt"\r\n\r\n`;

        if (emailData.text) {
          rawMessage += `--${boundary}_alt\r\n`;
          rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
          rawMessage += `${emailData.text}\r\n\r\n`;
        }

        if (emailData.html) {
          rawMessage += `--${boundary}_alt\r\n`;
          rawMessage += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
          rawMessage += `${emailData.html}\r\n\r\n`;
        }

        rawMessage += `--${boundary}_alt--\r\n`;
      }

      // Attachments
      if (emailData.attachments) {
        for (const att of emailData.attachments) {
          rawMessage += `--${boundary}\r\n`;
          rawMessage += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"\r\n`;
          rawMessage += `Content-Transfer-Encoding: base64\r\n`;
          rawMessage += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;
          
          const content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
          rawMessage += content.toString('base64') + '\r\n';
        }
      }

      rawMessage += `--${boundary}--`;

      const params = {
        RawMessage: {
          Data: rawMessage
        },
        Destinations: Array.isArray(emailData.to) ? emailData.to : [emailData.to]
      };

      const result = await this.ses.sendRawEmail(params).promise();

      systemLogger?.info('AWS SES raw email sent successfully', {
        messageId: result.MessageId,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: true,
        messageId: result.MessageId,
        response: result,
        provider: 'aws_ses'
      };
    } catch (error) {
      systemLogger?.error('AWS SES raw email send failed', {
        error: error.message,
        code: error.code
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        provider: 'aws_ses'
      };
    }
  }

  /**
   * Test AWS SES connection
   */
  async testConnection() {
    try {
      // Get send quota to verify credentials
      await this.ses.getSendQuota().promise();
      return true;
    } catch (error) {
      systemLogger?.error('AWS SES connection test failed', {
        error: error.message,
        code: error.code
      });
      return false;
    }
  }

  /**
   * Get AWS SES delivery status
   */
  async getDeliveryStatus(messageId) {
    return {
      messageId,
      status: 'unknown',
      message: 'AWS SES delivery status requires CloudWatch or SNS configuration'
    };
  }

  /**
   * Validate AWS SES configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.access_key_id) {
      errors.push('AWS access key ID is required');
    }
    if (!this.config.secret_access_key) {
      errors.push('AWS secret access key is required');
    }
    if (!this.config.region) {
      errors.push('AWS region is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get AWS SES provider metadata
   */
  getMetadata() {
    return {
      name: 'AWS SES',
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 10 * 1024 * 1024, // 10MB per message
      maxRecipients: 50,
      requiresVerifiedDomain: true,
      supportsTracking: true
    };
  }
}

module.exports = AwsSesAdapter;
