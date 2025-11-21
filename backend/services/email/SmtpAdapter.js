/**
 * SMTP Email Provider Adapter
 * 
 * Implements email sending via SMTP protocol using nodemailer.
 * Supports TLS encryption, authentication, and standard SMTP configurations.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const nodemailer = require('nodemailer');
const { systemLogger } = require('../../utils/logger');

class SmtpAdapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'smtp';
    this.transporter = null;
  }

  /**
   * Initialize SMTP transporter
   */
  getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const transportConfig = {
      host: this.config.host,
      port: this.config.port || 587,
      secure: this.config.secure || false, // true for 465, false for other ports
      auth: {
        user: this.config.username,
        pass: this.config.password
      },
      tls: {
        rejectUnauthorized: this.config.reject_unauthorized !== false // Default to true for security
      }
    };

    // Add additional SMTP options if provided
    if (this.config.pool) {
      transportConfig.pool = this.config.pool;
    }
    if (this.config.maxConnections) {
      transportConfig.maxConnections = this.config.maxConnections;
    }
    if (this.config.rateLimit) {
      transportConfig.rateLimit = this.config.rateLimit;
    }

    this.transporter = nodemailer.createTransport(transportConfig);
    return this.transporter;
  }

  /**
   * Send email via SMTP
   */
  async send(emailData) {
    try {
      const transporter = this.getTransporter();

      const mailOptions = {
        from: emailData.from || this.config.from_email,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html
      };

      // Add CC and BCC if provided
      if (emailData.cc) {
        mailOptions.cc = Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc;
      }
      if (emailData.bcc) {
        mailOptions.bcc = Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : emailData.bcc;
      }

      // Add attachments if provided
      if (emailData.attachments && emailData.attachments.length > 0) {
        mailOptions.attachments = emailData.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType || att.mimeType
        }));
      }

      const info = await transporter.sendMail(mailOptions);

      systemLogger?.info('SMTP email sent successfully', {
        messageId: info.messageId,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        provider: 'smtp'
      };
    } catch (error) {
      systemLogger?.error('SMTP email send failed', {
        error: error.message,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: false,
        error: error.message,
        provider: 'smtp'
      };
    }
  }

  /**
   * Test SMTP connection
   */
  async testConnection() {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      systemLogger?.error('SMTP connection test failed', {
        error: error.message,
        host: this.config.host
      });
      return false;
    }
  }

  /**
   * SMTP doesn't provide delivery status tracking
   */
  async getDeliveryStatus(messageId) {
    return {
      messageId,
      status: 'unknown',
      message: 'SMTP does not provide delivery status tracking'
    };
  }

  /**
   * Validate SMTP configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.host) {
      errors.push('SMTP host is required');
    }
    if (!this.config.port) {
      errors.push('SMTP port is required');
    }
    if (!this.config.username) {
      errors.push('SMTP username is required');
    }
    if (!this.config.password) {
      errors.push('SMTP password is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get SMTP provider metadata
   */
  getMetadata() {
    return {
      name: 'SMTP',
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB typical limit
      maxRecipients: 100,
      requiresAuth: true,
      supportsTLS: true
    };
  }
}

module.exports = SmtpAdapter;
