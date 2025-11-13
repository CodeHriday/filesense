/**
 * Outlook/Office 365 OAuth2 Email Adapter
 * 
 * Implements email sending via Outlook/Office 365 using OAuth2 authentication.
 * Supports token refresh and automatic token management.
 * 
 * IMPORTANT: Token Persistence
 * When the adapter refreshes the access token, it stores it in memory but does NOT
 * persist it to the database. The calling service (NotificationService) MUST:
 * 1. Check credentialsUpdated flag in send() response
 * 2. If true, persist updatedCredentials to ConnectionService
 * 
 * This design keeps the adapter stateless and allows the service layer to control persistence.
 */

const EmailProviderAdapter = require('./EmailProviderAdapter');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { systemLogger } = require('../../utils/logger');

class OutlookOAuth2Adapter extends EmailProviderAdapter {
  constructor(config) {
    super(config);
    this.providerName = 'outlook_oauth2';
    
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.refreshToken = config.refresh_token;
    this.accessToken = config.access_token;
    this.fromEmail = config.from_email;
    this.tenantId = config.tenant_id || 'common';
    this.expiresAt = config.expires_at ? new Date(config.expires_at) : null;
    
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
  }

  /**
   * Refresh OAuth2 access token using refresh token
   * @returns {Promise<Object>} - Token data with access_token, refresh_token, expires_in
   */
  async refreshAccessToken() {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://outlook.office365.com/SMTP.Send offline_access'
      });

      const response = await axios.post(this.tokenEndpoint, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      
      // Microsoft may rotate the refresh token, update it if provided
      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
      }
      
      // Calculate and store token expiry time
      const expiresIn = response.data.expires_in || 3600;
      this.expiresAt = new Date(Date.now() + (expiresIn * 1000));
      
      systemLogger?.info('Outlook OAuth2 access token refreshed successfully', {
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
      systemLogger?.error('Failed to refresh Outlook OAuth2 access token', {
        error: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data
      });
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Revoke OAuth2 tokens
   * Note: Microsoft OAuth2 doesn't have a direct revoke endpoint
   * Tokens expire naturally or can be invalidated by removing app consent
   * @returns {Promise<boolean>}
   */
  async revokeToken() {
    systemLogger?.info('Outlook OAuth2 token revocation requested', {
      note: 'Microsoft OAuth2 tokens expire naturally. Admins can revoke app consent in Azure AD.'
    });
    return true;
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
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      requireTLS: true,
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
   * Send email via Outlook/Office 365 with OAuth2
   */
  async send(emailData) {
    const originalAccessToken = this.accessToken;
    const originalRefreshToken = this.refreshToken;

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

      systemLogger?.info('Outlook OAuth2 email sent successfully', {
        messageId: info.messageId,
        to: emailData.to,
        subject: emailData.subject
      });

      const result = {
        success: true,
        messageId: info.messageId,
        response: info.response,
        provider: 'outlook_oauth2'
      };

      // Include updated credentials if they were refreshed
      if (this.accessToken !== originalAccessToken || this.refreshToken !== originalRefreshToken) {
        result.credentialsUpdated = true;
        result.updatedCredentials = {
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          from_email: this.fromEmail,
          tenant_id: this.tenantId,
          expires_at: this.expiresAt ? this.expiresAt.toISOString() : null
        };
      }

      return result;
    } catch (error) {
      // If error is due to invalid token, try refreshing and retry once
      if (error.code === 'EAUTH' || error.responseCode === 401 || error.responseCode === 535) {
        try {
          systemLogger?.info('Outlook OAuth2 authentication failed, attempting token refresh');
          await this.refreshAccessToken();
          
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

          systemLogger?.info('Outlook OAuth2 email sent successfully after token refresh', {
            messageId: info.messageId,
            to: emailData.to,
            subject: emailData.subject
          });

          return {
            success: true,
            messageId: info.messageId,
            response: info.response,
            provider: 'outlook_oauth2',
            credentialsUpdated: true,
            updatedCredentials: {
              access_token: this.accessToken,
              refresh_token: this.refreshToken,
              client_id: this.clientId,
              client_secret: this.clientSecret,
              from_email: this.fromEmail,
              tenant_id: this.tenantId,
              expires_at: this.expiresAt ? this.expiresAt.toISOString() : null
            }
          };
        } catch (retryError) {
          systemLogger?.error('Outlook OAuth2 email send failed after token refresh', {
            error: retryError.message,
            to: emailData.to,
            subject: emailData.subject
          });

          return {
            success: false,
            error: retryError.message,
            provider: 'outlook_oauth2'
          };
        }
      }

      systemLogger?.error('Outlook OAuth2 email send failed', {
        error: error.message,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: false,
        error: error.message,
        provider: 'outlook_oauth2'
      };
    }
  }

  /**
   * Test Outlook OAuth2 connection
   */
  async testConnection() {
    try {
      const transporter = await this.createTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      systemLogger?.error('Outlook OAuth2 connection test failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get Outlook delivery status
   * Note: Outlook/Office 365 doesn't provide a direct API for delivery status without Microsoft Graph API
   * This is a placeholder that returns basic info
   */
  async getDeliveryStatus(messageId) {
    return {
      messageId,
      status: 'sent',
      provider: 'outlook_oauth2',
      note: 'Outlook delivery status requires Microsoft Graph API integration for detailed tracking'
    };
  }

  /**
   * Validate Outlook OAuth2 configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.clientId) {
      errors.push('Outlook OAuth2 client ID is required');
    }
    if (!this.clientSecret) {
      errors.push('Outlook OAuth2 client secret is required');
    }
    if (!this.refreshToken) {
      errors.push('Outlook OAuth2 refresh token is required');
    }
    if (!this.fromEmail) {
      errors.push('Outlook from email is required');
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
      tenant_id: this.tenantId,
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
   * Get Outlook OAuth2 provider metadata
   */
  getMetadata() {
    return {
      provider: 'outlook_oauth2',
      name: 'Outlook/Office 365 OAuth2',
      supportsHtml: true,
      supportsAttachments: true,
      requiresOAuth: true,
      maxAttachmentSize: 35 * 1024 * 1024, // 35MB for Office 365
      features: [
        'oauth2_authentication',
        'automatic_token_refresh',
        'html_content',
        'attachments',
        'cc_bcc_support',
        'multi_tenant_support'
      ]
    };
  }
}

module.exports = OutlookOAuth2Adapter;
