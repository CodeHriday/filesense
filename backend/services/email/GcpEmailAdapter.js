/**
 * GCP Email Adapter
 * 
 * Implements email sending via GCP SMTP Relay or SendGrid on GCP.
 * This adapter uses SMTP protocol with GCP-specific configuration.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const nodemailer = require('nodemailer');
const { systemLogger } = require('../../utils/logger');

class GcpEmailAdapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'gcp_email';
    this.transporter = null;
  }

  /**
   * Initialize GCP SMTP transporter
   */
  getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    // GCP SMTP Relay configuration
    const transportConfig = {
      host: this.config.smtp_host || 'smtp-relay.gmail.com',
      port: this.config.smtp_port || 587,
      secure: this.config.secure || false,
      auth: {
        user: this.config.username || this.config.email,
        pass: this.config.password
      },
      tls: {
        rejectUnauthorized: this.config.reject_unauthorized !== false
      }
    };

    // If using service account (for Google Cloud SMTP)
    if (this.config.service_account_email && this.config.private_key) {
      transportConfig.auth = {
        type: 'OAuth2',
        user: this.config.service_account_email,
        serviceClient: this.config.service_account_email,
        privateKey: this.config.private_key
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);
    return this.transporter;
  }

  /**
   * Send email via GCP SMTP
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

      // Add CC and BCC
      if (emailData.cc) {
        mailOptions.cc = Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc;
      }
      if (emailData.bcc) {
        mailOptions.bcc = Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : emailData.bcc;
      }

      // Add attachments
      if (emailData.attachments && emailData.attachments.length > 0) {
        mailOptions.attachments = emailData.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType || att.mimeType
        }));
      }

      const info = await transporter.sendMail(mailOptions);

      systemLogger?.info('GCP email sent successfully', {
        messageId: info.messageId,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        provider: 'gcp_email'
      };
    } catch (error) {
      systemLogger?.error('GCP email send failed', {
        error: error.message,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: false,
        error: error.message,
        provider: 'gcp_email'
      };
    }
  }

  /**
   * Test GCP SMTP connection
   */
  async testConnection() {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      systemLogger?.error('GCP SMTP connection test failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * GCP SMTP doesn't provide delivery status tracking
   */
  async getDeliveryStatus(messageId) {
    return {
      messageId,
      status: 'unknown',
      message: 'GCP SMTP Relay does not provide delivery status tracking'
    };
  }

  /**
   * Validate GCP email configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.password && !this.config.private_key) {
      errors.push('GCP email requires either password or service account private key');
    }
    if (!this.config.username && !this.config.service_account_email) {
      errors.push('GCP email requires either username or service account email');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get GCP email provider metadata
   */
  getMetadata() {
    return {
      name: 'GCP SMTP Relay',
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
      maxRecipients: 100,
      requiresAuth: true,
      supportsTLS: true
    };
  }
}

module.exports = GcpEmailAdapter;
