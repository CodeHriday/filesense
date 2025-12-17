/**
 * Gmail OAuth2 Email Adapter
 * 
 * Implements email sending via Gmail using OAuth2 authentication.
 * Supports token refresh, revocation, and automatic token management.
 * 
 * IMPORTANT: Token Persistence
 * When the adapter refreshes the access token, it stores it in memory but does NOT
 * persist it to the database. The calling service (NotificationService) MUST:
 * 1. Capture the original access_token before calling send()
 * 2. After send() completes, call wasTokenRefreshed(originalToken)
 * 3. If true, call getUpdatedCredentials() and persist to ConnectionService
 * 
 * This design keeps the adapter stateless and allows the service layer to control persistence.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { systemLogger } = require('../../utils/logger');
const { createCredentialsSummary } = require('../../utils/credentialSanitizer');

class GmailOAuth2Adapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'gmail_oauth2';
    
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.refreshToken = config.refresh_token;
    this.accessToken = config.access_token;
    this.fromEmail = config.from_email;
    this.expiresAt = config.expires_at ? new Date(config.expires_at) : null;
    
    this.tokenEndpoint = 'https://oauth2.googleapis.com/token';
    this.revokeEndpoint = 'https://oauth2.googleapis.com/revoke';
  }

  /**
   * Refresh OAuth2 access token using refresh token
   * @returns {Promise<string>} - New access token
   */
  async refreshAccessToken() {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await axios.post(this.tokenEndpoint, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      
      // Google may rotate the refresh token, update it if provided
      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
      }
      
      // Calculate and store token expiry time
      const expiresIn = response.data.expires_in || 3600;
      this.expiresAt = new Date(Date.now() + (expiresIn * 1000));
      
      systemLogger?.info('Gmail OAuth2 access token refreshed successfully', {
        expiresIn: response.data.expires_in,
        expiresAt: this.expiresAt.toISOString(),
        refreshTokenRotated: !!response.data.refresh_token
      });
      
      return {
        access_token: this.accessToken,
        refresh_token: this.refreshToken,
        expires_in: expiresIn,
        expires_at: this.expiresAt.toISOString()
      };
    } catch (error) {
      systemLogger?.error('Failed to refresh Gmail OAuth2 access token', {
        error: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data
      });
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Revoke OAuth2 tokens
   * @returns {Promise<boolean>}
   */
  async revokeToken() {
    try {
      await axios.post(this.revokeEndpoint, null, {
        params: {
          token: this.refreshToken || this.accessToken
        }
      });

      systemLogger?.info('Gmail OAuth2 token revoked successfully');
      return true;
    } catch (error) {
      systemLogger?.error('Failed to revoke Gmail OAuth2 token', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if access token is expired or will expire soon (within 5 minutes)
   * @returns {boolean}
   */
  isTokenExpired() {
    if (!this.expiresAt) {
      return !this.accessToken; // If no expiry info, check if token exists
    }
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() >= (this.expiresAt.getTime() - bufferTime);
  }

  /**
   * Create nodemailer transporter with OAuth2
   */
  async createTransporter() {
    // Refresh token if missing or expired
    if (!this.accessToken || this.isTokenExpired()) {
      const tokenData = await this.refreshAccessToken();
      this.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        this.refreshToken = tokenData.refresh_token;
      }
    }

    return nodemailer.createTransport({
    // Gmail OAuth2 transport uses HTTPS/TLS internally.
    // No plaintext HTTP communication is used (Sonar Security Hotspot).
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: this.fromEmail,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: this.refreshToken,
        accessToken: this.accessToken
      }
    });
  }

  /**
   * Send email via Gmail with OAuth2
   */
  async send(emailData) {
    const originalAccessToken = this.accessToken;
    const originalRefreshToken = this.refreshToken;
    let credentialsRefreshed = false;

    try {
      const transporter = await this.createTransporter();

      const mailOptions = {
        from: emailData.from || this.fromEmail,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html
      };

      if (emailData.cc) {
        mailOptions.cc = Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc;
      }
      if (emailData.bcc) {
        mailOptions.bcc = Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : emailData.bcc;
      }

      if (emailData.attachments && emailData.attachments.length > 0) {
        mailOptions.attachments = emailData.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType
        }));
      }

      const info = await transporter.sendMail(mailOptions);

      systemLogger?.info('Gmail OAuth2 email sent successfully', {
        messageId: info.messageId,
        to: emailData.to,
        subject: emailData.subject
      });

      const result = {
        success: true,
        messageId: info.messageId,
        response: info.response,
        provider: 'gmail_oauth2'
      };

      // Include updated credentials if they were refreshed
      if (this.accessToken !== originalAccessToken || this.refreshToken !== originalRefreshToken) {
        result.credentialsUpdated = true;
        
        // Full credentials for secure persistence (DO NOT LOG - encrypt before storage)
        result.updatedCredentials = {
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          from_email: this.fromEmail,
          expires_at: this.expiresAt ? this.expiresAt.toISOString() : null
        };
        
        // Sanitized summary for logging (SAFE TO LOG - no secrets)
        result.credentialsSummary = createCredentialsSummary({
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          expires_at: this.expiresAt ? this.expiresAt.toISOString() : null
        });
      }

      return result;
    } catch (error) {
      // If error is due to invalid token, try refreshing and retry once
      if (error.code === 'EAUTH' || error.responseCode === 401) {
        try {
          systemLogger?.info('Gmail OAuth2 authentication failed, attempting token refresh');
          await this.refreshAccessToken();
          credentialsRefreshed = true;
          
          const transporter = await this.createTransporter();
          const mailOptions = {
            from: emailData.from || this.fromEmail,
            to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html
          };

          if (emailData.cc) {
            mailOptions.cc = Array.isArray(emailData.cc) ? emailData.cc.join(', ') : emailData.cc;
          }
          if (emailData.bcc) {
            mailOptions.bcc = Array.isArray(emailData.bcc) ? emailData.bcc.join(', ') : emailData.bcc;
          }

          if (emailData.attachments && emailData.attachments.length > 0) {
            mailOptions.attachments = emailData.attachments.map(att => ({
              filename: att.filename,
              content: att.content,
              contentType: att.contentType
            }));
          }

          const info = await transporter.sendMail(mailOptions);

          systemLogger?.info('Gmail OAuth2 email sent successfully after token refresh', {
            messageId: info.messageId,
            to: emailData.to,
            subject: emailData.subject
          });

          return {
            success: true,
            messageId: info.messageId,
            response: info.response,
            provider: 'gmail_oauth2',
            credentialsUpdated: true,
            updatedCredentials: {
              access_token: this.accessToken,
              refresh_token: this.refreshToken,
              client_id: this.clientId,
              client_secret: this.clientSecret,
              from_email: this.fromEmail,
              expires_at: this.expiresAt ? this.expiresAt.toISOString() : null
            }
          };
        } catch (retryError) {
          systemLogger?.error('Gmail OAuth2 email send failed after token refresh', {
            error: retryError.message,
            to: emailData.to,
            subject: emailData.subject
          });

          return {
            success: false,
            error: retryError.message,
            provider: 'gmail_oauth2'
          };
        }
      }

      systemLogger?.error('Gmail OAuth2 email send failed', {
        error: error.message,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: false,
        error: error.message,
        provider: 'gmail_oauth2'
      };
    }
  }

  /**
   * Test Gmail OAuth2 connection
   */
  async testConnection() {
    try {
      const transporter = await this.createTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      systemLogger?.error('Gmail OAuth2 connection test failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get Gmail delivery status
   * Note: Gmail doesn't provide a direct API for delivery status without Gmail API
   * This is a placeholder that returns basic info
   */
  async getDeliveryStatus(messageId) {
    return {
      messageId,
      status: 'sent',
      provider: 'gmail_oauth2',
      note: 'Gmail delivery status requires Gmail API integration for detailed tracking'
    };
  }

  /**
   * Validate Gmail OAuth2 configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.clientId) {
      errors.push('Gmail OAuth2 client ID is required');
    }
    if (!this.clientSecret) {
      errors.push('Gmail OAuth2 client secret is required');
    }
    if (!this.refreshToken) {
      errors.push('Gmail OAuth2 refresh token is required');
    }
    if (!this.fromEmail) {
      errors.push('Gmail from email is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get updated credentials after token refresh
   * This should be called by the NotificationService to persist refreshed tokens
   * @returns {Object} - Updated credentials that need to be persisted
   */
  getUpdatedCredentials() {
    return {
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      from_email: this.fromEmail,
      expires_at: this.expiresAt ? this.expiresAt.toISOString() : null
    };
  }

  /**
   * Check if access token was refreshed during operation
   * @param {string} originalToken - Original access token before operation
   * @returns {boolean} - True if token was refreshed
   */
  wasTokenRefreshed(originalToken) {
    return this.accessToken !== originalToken;
  }

  /**
   * Get Gmail OAuth2 provider metadata
   */
  getMetadata() {
    return {
      provider: 'gmail_oauth2',
      name: 'Gmail OAuth2',
      supportsHtml: true,
      supportsAttachments: true,
      requiresOAuth: true,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
      features: [
        'oauth2_authentication',
        'automatic_token_refresh',
        'token_revocation',
        'html_content',
        'attachments',
        'cc_bcc_support'
      ]
    };
  }
}

module.exports = GmailOAuth2Adapter;
