/**
 * SendGrid Email Provider Adapter
 * 
 * Implements email sending via @sendgrid/mail library.
 * Supports templating, tracking, attachments, and delivery analytics.
 * 
 * Improvements:
 * - Uses official @sendgrid/mail library for reliability
 * - Supports dynamic templates (template_id + dynamic_template_data)
 * - Flexible recipient format (string or {email, name} objects)
 * - Attachment size validation
 * - Sandbox mode for safe connection testing
 * - Safe logging (no secrets, truncated errors)
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const { systemLogger } = require('../../utils/logger');

class SendGridAdapter extends EmailProviderAdapter {
  constructor(config = {}) {
    super(config);
    this.providerName = 'sendgrid';
    // normalization: allow api_key or apiKey
    this.apiKey = config.api_key || config.apiKey || process.env.SENDGRID_API_KEY;
    this.config = config;
    this.baseUrl = 'https://api.sendgrid.com/v3';
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
    }
    // default axios options for optional API calls (e.g., Email Activity)
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: config.axiosTimeoutMs || 10_000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });
  }

  // Helper: normalize recipient input (string or {email,name})
  _normalizeRecipient(r) {
    if (!r) return null;
    if (typeof r === 'string') return { email: r };
    if (typeof r === 'object' && r.email) {
      const out = { email: r.email };
      if (r.name) out.name = r.name;
      return out;
    }
    throw new Error('Invalid recipient format. Must be string or {email,name}');
  }

  /**
   * Send email via @sendgrid/mail
   * Supports: template_id + dynamic_template_data OR content (text/html),
   * attachments (Buffer or base64 string), cc, bcc, replyTo, sandbox mode.
   */
  async send(emailData = {}) {
    try {
      // Basic validation
      if (!this.apiKey) {
        throw new Error('SendGrid API key not configured');
      }

      const toList = (Array.isArray(emailData.to) ? emailData.to : [emailData.to])
        .filter(Boolean)
        .map(r => this._normalizeRecipient(r));

      if ((!toList || toList.length === 0) && !emailData.templateId && !emailData.template_id) {
        throw new Error('`to` is required unless using a system template (template_id)');
      }

      const msg = {
        personalizations: [{
          to: toList,
        }],
        from: {
          email: emailData.from || this.config.from_email,
          name: emailData.fromName || this.config.from_name || 'Data Observatory Alerts'
        },
        // Allow reply_to
        replyTo: emailData.replyTo ? this._normalizeRecipient(emailData.replyTo) : undefined,
        // custom headers if provided
        headers: emailData.headers || undefined,
        // mail_settings may include sandbox_mode
        mail_settings: undefined
      };

      // subject can be per-personalization or global
      if (emailData.subject) {
        msg.personalizations[0].subject = emailData.subject;
      }

      // cc / bcc
      if (emailData.cc) {
        msg.personalizations[0].cc =
          (Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc]).map(r => this._normalizeRecipient(r));
      }
      if (emailData.bcc) {
        msg.personalizations[0].bcc =
          (Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc]).map(r => this._normalizeRecipient(r));
      }

      // Template support: prefer template_id if present
      const templateId = emailData.templateId || emailData.template_id;
      if (templateId) {
        msg.template_id = templateId;
        if (emailData.dynamic_template_data) {
          msg.personalizations[0].dynamic_template_data = emailData.dynamic_template_data;
        }
        // If using templates, do not set msg.content (SendGrid will use the template)
      } else {
        // Content mode (text/html)
        msg.content = [];
        if (emailData.text) msg.content.push({ type: 'text/plain', value: emailData.text });
        if (emailData.html) msg.content.push({ type: 'text/html', value: emailData.html });
        if (!msg.content.length) {
          throw new Error('Either template_id or text/html content must be provided');
        }
      }

      // Mail settings: sandbox (for safe key verification)
      if (emailData.sandbox === true) {
        msg.mail_settings = { sandbox_mode: { enable: true } };
      }

      // Attachments - @sendgrid/mail expects base64 content
      if (emailData.attachments && emailData.attachments.length > 0) {
        const MAX_ATTACHMENT_SIZE = this.getMetadata().maxAttachmentSize || (30 * 1024 * 1024);
        msg.attachments = emailData.attachments.map(att => {
          const contentBuffer = Buffer.isBuffer(att.content)
            ? att.content
            : Buffer.from(att.content || '', att.encoding || 'utf8'); // if string passed

          if (contentBuffer.length > MAX_ATTACHMENT_SIZE) {
            throw new Error(`Attachment ${att.filename} exceeds allowed size (${MAX_ATTACHMENT_SIZE} bytes)`);
          }

          return {
            content: contentBuffer.toString('base64'),
            filename: att.filename,
            type: att.contentType || att.mimeType || 'application/octet-stream',
            disposition: att.disposition || 'attachment',
            content_id: att.contentId || undefined
          };
        });
      }

      // Send using @sendgrid/mail (returns array with response)
      const respArray = await sgMail.send(msg, false); // second arg "false" => don't use callback
      // sgMail.send returns an array of responses for each personalization; pick first
      const resp = Array.isArray(respArray) ? respArray[0] : respArray;

      const statusCode = resp?.statusCode || (resp?.status || 202);
      const messageId = resp?.headers?.['x-message-id'] || resp?.headers?.['X-Message-Id'] || `sendgrid-${Date.now()}`;

      systemLogger?.info('SendGrid email queued', {
        provider: 'sendgrid',
        messageId,
        to: toList.map(r => r.email),
        subject: emailData.subject,
        statusCode
      });

      return {
        success: true,
        provider: 'sendgrid',
        statusCode,
        messageId,
        response: resp?.body || null
      };
    } catch (err) {
      // Extract sendgrid errors (if present)
      const statusCode = err?.code || err?.response?.status || err?.statusCode;
      const sgError = err?.response?.body || err?.response?.data || err?.message;

      // Safe logging: avoid printing full payloads / secrets
      systemLogger?.error('SendGrid send failed', {
        provider: 'sendgrid',
        error: typeof sgError === 'string' ? sgError : JSON.stringify(sgError).slice(0, 2000),
        statusCode,
        to: (Array.isArray(emailData?.to) ? emailData.to : emailData?.to)
      });

      return {
        success: false,
        provider: 'sendgrid',
        statusCode: statusCode || 500,
        error: sgError || err.message
      };
    }
  }

  /**
   * Test SendGrid API connection by performing a sandbox-mode send.
   * Sandbox send will be accepted (202) but not delivered.
   */
  async testConnection() {
    if (!this.apiKey) {
      systemLogger?.error('SendGrid testConnection failed: API key not configured');
      return false;
    }

    try {
      const testMsg = {
        personalizations: [{ to: [{ email: this.config?.from_email || 'test@example.com' }], subject: 'SendGrid API Key Test' }],
        from: { email: this.config?.from_email || 'test@example.com' },
        content: [{ type: 'text/plain', value: 'This is a sandbox test of SendGrid API key' }],
        mail_settings: { sandbox_mode: { enable: true } }
      };

      const respArray = await sgMail.send(testMsg, false);
      const resp = Array.isArray(respArray) ? respArray[0] : respArray;
      const ok = resp?.statusCode === 202 || resp?.status === 202;
      if (!ok) {
        systemLogger?.error('SendGrid testConnection unexpected response', { status: resp?.statusCode || resp?.status });
      }
      return ok;
    } catch (err) {
      systemLogger?.error('SendGrid connection test failed', {
        error: err?.message || JSON.stringify(err?.response?.body || err?.response?.data || err),
        statusCode: err?.response?.status
      });
      return false;
    }
  }

  /**
   * Attempt to fetch delivery status using Email Activity API (requires plan & permission).
   * NOTE: Recommended approach is to use SendGrid Event Webhook to receive real-time events.
   */
  async getDeliveryStatus(messageId) {
    if (!messageId) {
      return { messageId: null, status: 'unknown', error: 'messageId required', provider: 'sendgrid' };
    }

    // Best practice: use Event Webhooks. This method attempts the Email Activity API if available.
    try {
      // Email Activity API endpoint example: /messages?query=msg_id='...'
      const resp = await this.axiosInstance.get('/messages', {
        params: {
          query: `msg_id='${messageId}'`,
          limit: 1
        }
      });

      const messages = resp?.data?.messages || [];
      const message = messages.length > 0 ? messages[0] : null;

      return {
        messageId,
        status: message?.status || 'unknown',
        events: message?.events || [],
        provider: 'sendgrid'
      };
    } catch (err) {
      // If Email Activity API is not available, return guidance
      const errMsg = err?.response?.data || err?.message || 'Email Activity API unavailable';
      systemLogger?.warn('SendGrid getDeliveryStatus failed or not available', {
        provider: 'sendgrid',
        messageId,
        error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg).slice(0, 1000)
      });

      return {
        messageId,
        status: 'unknown',
        error: 'Email Activity API unavailable or message not found. Consider using Event Webhooks for reliable delivery status.',
        provider: 'sendgrid'
      };
    }
  }

  /**
   * Validate config
   */
  validateConfig() {
    const errors = [];
    if (!this.apiKey) errors.push('SendGrid API key is required (config.api_key or SENDGRID_API_KEY)');
    if (!this.config?.from_email) errors.push('SendGrid from email is required (config.from_email)');
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Provider metadata
   */
  getMetadata() {
    return {
      name: 'SendGrid',
      supportsHtml: true,
      supportsAttachments: true,
      maxAttachmentSize: 30 * 1024 * 1024, // 30MB per attachment
      maxRecipients: 1000,
      supportsTracking: true,
      supportsTemplates: true
    };
  }
}

module.exports = SendGridAdapter;
