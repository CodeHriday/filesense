/**
 * Notification Service
 * 
 * Orchestrates email sending across multiple providers with:
 * - Provider resolution and failover
 * - OAuth2 token refresh and persistence
 * - Retry logic with exponential backoff
 * - Rate limiting per provider
 * - Alert run tracking and logging
 */

const { pool, query } = require('../config/database');
const EmailProviderFactory = require('./email/EmailProviderFactory');
const ConnectionService = require('./ConnectionService');
const EmailDomainValidationService = require('./EmailDomainValidationService');
const { systemLogger } = require('../utils/logger');
const { createCredentialsSummary } = require('../utils/credentialSanitizer');

class NotificationService {
  constructor() {
    // ConnectionService is exported as a singleton instance, use it directly
    this.connectionService = ConnectionService;
    this.rateLimitCache = new Map(); // provider_id -> { count, resetTime }
    this.providerCircuitBreakers = new Map(); // provider_id -> { failures, lastFailure, isOpen }
  }

  /**
   * Get email provider connection from database
   * @param {number} connectionId - Storage connection ID
   * @returns {Promise<Object>} - Connection with decrypted credentials
   */
  async getEmailProvider(connectionId) {
    try {
      const result = await query(
        `SELECT id, type, config, name, description 
         FROM storage_connections 
         WHERE id = $1 AND is_active = true`,
        [connectionId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Email provider connection ${connectionId} not found or inactive`);
      }

      const connection = result.rows[0];
      
      // Decrypt sensitive fields
      const decryptedConfig = this.connectionService.decryptSensitiveFields(
        connection.type,
        connection.config
      );

      return {
        ...connection,
        config: decryptedConfig
      };
    } catch (error) {
      systemLogger?.error('Failed to get email provider', {
        connectionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get failover chain for an alert policy
   * @param {number} policyId - Alert policy ID
   * @returns {Promise<Array>} - Ordered list of provider connections
   */
  async getProviderChain(policyId) {
    try {
      const result = await query(
        `SELECT 
          ap.provider_connection_id as primary_provider_id,
          ap.failover_connection_id as failover_provider_id
         FROM alert_policies ap
         WHERE ap.id = $1`,
        [policyId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Alert policy ${policyId} not found`);
      }

      const policy = result.rows[0];
      const providerIds = [];

      if (policy.primary_provider_id) {
        providerIds.push(policy.primary_provider_id);
      }
      if (policy.failover_provider_id) {
        providerIds.push(policy.failover_provider_id);
      }

      if (providerIds.length === 0) {
        throw new Error(`Alert policy ${policyId} has no email providers configured`);
      }

      // Load all providers in parallel
      const providers = await Promise.all(
        providerIds.map(id => this.getEmailProvider(id))
      );

      return providers;
    } catch (error) {
      systemLogger?.error('Failed to get provider chain', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check rate limit for a provider
   * @param {number} connectionId - Provider connection ID
   * @param {number} maxPerHour - Maximum emails per hour
   * @returns {boolean} - True if rate limit allows sending
   */
  checkRateLimit(connectionId, maxPerHour = 100) {
    const now = Date.now();
    const key = `provider_${connectionId}`;
    const limit = this.rateLimitCache.get(key);

    if (!limit || now >= limit.resetTime) {
      // Reset the limit
      this.rateLimitCache.set(key, {
        count: 1,
        resetTime: now + (60 * 60 * 1000) // 1 hour from now
      });
      return true;
    }

    if (limit.count >= maxPerHour) {
      systemLogger?.warn('Rate limit exceeded for provider', {
        connectionId,
        count: limit.count,
        maxPerHour
      });
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Check circuit breaker for a provider
   * @param {number} connectionId - Provider connection ID
   * @returns {boolean} - True if circuit is closed (provider is healthy)
   */
  checkCircuitBreaker(connectionId) {
    const key = `provider_${connectionId}`;
    const breaker = this.providerCircuitBreakers.get(key);

    if (!breaker) {
      return true; // No failures recorded
    }

    const now = Date.now();
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes

    // If circuit is open and cooldown has passed, try half-open
    if (breaker.isOpen && (now - breaker.lastFailure) >= cooldownPeriod) {
      systemLogger?.info('Circuit breaker half-open, attempting provider', {
        connectionId
      });
      breaker.isOpen = false;
      breaker.failures = Math.max(0, breaker.failures - 1);
      return true;
    }

    return !breaker.isOpen;
  }

  /**
   * Record circuit breaker failure
   * @param {number} connectionId - Provider connection ID
   */
  recordFailure(connectionId) {
    const key = `provider_${connectionId}`;
    const breaker = this.providerCircuitBreakers.get(key) || { failures: 0, lastFailure: 0, isOpen: false };

    breaker.failures++;
    breaker.lastFailure = Date.now();

    // Open circuit after 3 failures
    if (breaker.failures >= 3) {
      breaker.isOpen = true;
      systemLogger?.error('Circuit breaker opened for provider', {
        connectionId,
        failures: breaker.failures
      });
    }

    this.providerCircuitBreakers.set(key, breaker);
  }

  /**
   * Record circuit breaker success
   * @param {number} connectionId - Provider connection ID
   */
  recordSuccess(connectionId) {
    const key = `provider_${connectionId}`;
    const breaker = this.providerCircuitBreakers.get(key);

    if (breaker) {
      breaker.failures = Math.max(0, breaker.failures - 1);
      if (breaker.failures === 0) {
        breaker.isOpen = false;
      }
      this.providerCircuitBreakers.set(key, breaker);
    }
  }

  /**
   * Persist updated OAuth2 credentials to database
   * @param {number} connectionId - Storage connection ID
   * @param {Object} updatedCredentials - Updated credential object
   * @returns {Promise<boolean>} - True if persistence succeeded
   */
  async persistCredentials(connectionId, updatedCredentials) {
    try {
      await this.connectionService.updateConnection(connectionId, {
        config: updatedCredentials
      });

      // Log sanitized summary (SAFE - no secrets)
      const summary = createCredentialsSummary(updatedCredentials);
      systemLogger?.info('OAuth2 credentials persisted successfully', {
        connectionId,
        ...summary
      });

      return true;
    } catch (error) {
      systemLogger?.error('Failed to persist OAuth2 credentials', {
        connectionId,
        error: error.message
      });
      // Don't throw - credential persistence failure shouldn't fail the email send
      return false;
    }
  }

  /**
   * Send email with a specific provider
   * @param {Object} provider - Provider connection object
   * @param {Object} emailData - Email data (to, subject, html, text, attachments)
   * @returns {Promise<Object>} - Send result with credential persistence metadata
   */
  async sendWithProvider(provider, emailData) {
    try {
      // Validate email domains before sending
      const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
      const validationResult = await EmailDomainValidationService.validateEmails(recipients);
      
      if (!validationResult.valid) {
        const invalidEmailsList = validationResult.invalidEmails
          .map(e => `${e.email} (${e.reason})`)
          .join(', ');
        
        systemLogger?.error('Email domain validation failed', {
          providerId: provider.id,
          invalidEmails: validationResult.invalidEmails,
          allowedDomains: validationResult.allowedDomains
        });
        
        return {
          success: false,
          error: `Email domain not allowed: ${invalidEmailsList}`,
          domainValidationFailed: true,
          invalidEmails: validationResult.invalidEmails
        };
      }
      
      // Create adapter instance
      const adapter = EmailProviderFactory.createAdapter(provider.type, provider.config);

      // Send email
      const result = await adapter.send(emailData);

      // Persist updated credentials if OAuth2 token was refreshed
      let credentialsPersisted = false;
      if (result.credentialsUpdated && result.updatedCredentials) {
        credentialsPersisted = await this.persistCredentials(provider.id, result.updatedCredentials);
        if (!credentialsPersisted) {
          systemLogger?.warn('Credential persistence failed but email sent successfully', {
            providerId: provider.id
          });
        }
      }

      // SECURITY: Remove full credentials from result before returning
      // Only keep sanitized summary for logging
      const { updatedCredentials, ...safeResult } = result;

      // Include credential persistence status in result
      return {
        ...safeResult,
        credentialsPersisted,
        credentialsRefreshed: result.credentialsUpdated || false
      };
    } catch (error) {
      systemLogger?.error('Provider send failed', {
        providerId: provider.id,
        providerType: provider.type,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send email with failover and retry logic
   * @param {number} policyId - Alert policy ID
   * @param {Object} emailData - Email data
   * @param {number} maxRetries - Maximum retry attempts per provider
   * @returns {Promise<Object>} - Send result with metadata
   */
  async sendEmail(policyId, emailData, maxRetries = 2) {
    const startTime = Date.now();
    const providers = await this.getProviderChain(policyId);
    const attempts = [];

    for (const provider of providers) {
      // Check circuit breaker
      if (!this.checkCircuitBreaker(provider.id)) {
        systemLogger?.warn('Skipping provider due to circuit breaker', {
          providerId: provider.id,
          providerType: provider.type
        });
        attempts.push({
          providerId: provider.id,
          providerType: provider.type,
          status: 'skipped',
          reason: 'circuit_breaker_open',
          retries: 0,
          credentialsRefreshed: false,
          credentialsPersisted: false
        });
        continue;
      }

      // Check rate limit
      if (!this.checkRateLimit(provider.id)) {
        systemLogger?.warn('Skipping provider due to rate limit', {
          providerId: provider.id,
          providerType: provider.type
        });
        attempts.push({
          providerId: provider.id,
          providerType: provider.type,
          status: 'skipped',
          reason: 'rate_limit_exceeded',
          retries: 0,
          credentialsRefreshed: false,
          credentialsPersisted: false
        });
        continue;
      }

      // Try sending with retries
      let lastError = null;
      let lastResult = null;
      for (let retry = 0; retry <= maxRetries; retry++) {
        try {
          const result = await this.sendWithProvider(provider, emailData);
          lastResult = result; // Capture last result for credential metadata

          if (result.success) {
            this.recordSuccess(provider.id);

            const duration = Date.now() - startTime;
            systemLogger?.info('Email sent successfully', {
              policyId,
              providerId: provider.id,
              providerType: provider.type,
              messageId: result.messageId,
              duration,
              retries: retry
            });

            attempts.push({
              providerId: provider.id,
              providerType: provider.type,
              status: 'success',
              messageId: result.messageId,
              retries: retry,
              credentialsRefreshed: result.credentialsRefreshed,
              credentialsPersisted: result.credentialsPersisted
            });

            return {
              success: true,
              providerId: provider.id,
              providerType: provider.type,
              messageId: result.messageId,
              duration,
              attempts,
              credentialsRefreshed: result.credentialsRefreshed,
              credentialsPersisted: result.credentialsPersisted
            };
          }

          lastError = result.error || 'Unknown error';
        } catch (error) {
          lastError = error.message;
          systemLogger?.warn('Email send attempt failed', {
            policyId,
            providerId: provider.id,
            providerType: provider.type,
            retry,
            error: error.message
          });

          // Wait before retry with exponential backoff
          if (retry < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retry), 10000); // Max 10 seconds
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed for this provider
      // Use credential metadata from last attempt if available
      this.recordFailure(provider.id);
      attempts.push({
        providerId: provider.id,
        providerType: provider.type,
        status: 'failed',
        error: lastError,
        retries: maxRetries,
        credentialsRefreshed: lastResult?.credentialsRefreshed || false,
        credentialsPersisted: lastResult?.credentialsPersisted || false
      });
    }

    // All providers failed
    const duration = Date.now() - startTime;
    const errorMessage = `All email providers failed for policy ${policyId}`;
    
    systemLogger?.error(errorMessage, {
      policyId,
      attempts,
      duration
    });

    return {
      success: false,
      error: errorMessage,
      duration,
      attempts
    };
  }

  /**
   * Create alert run record
   * @param {number} policyId - Alert policy ID
   * @param {Object} sendResult - Result from sendEmail
   * @param {Object} emailData - Email data that was sent
   * @returns {Promise<number>} - Alert run ID
   */
  async createAlertRun(policyId, sendResult, emailData) {
    try {
      const result = await query(
        `INSERT INTO alert_runs (
          policy_id, 
          provider_connection_id,
          status,
          message_id,
          recipients,
          subject,
          error_message,
          sent_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          policyId,
          sendResult.providerId || null,
          sendResult.success ? 'sent' : 'failed',
          sendResult.messageId || null,
          emailData.to,
          emailData.subject,
          sendResult.error || null,
          new Date(),
          JSON.stringify({
            duration: sendResult.duration,
            attempts: sendResult.attempts,
            providerType: sendResult.providerType,
            credentialsRefreshed: sendResult.credentialsRefreshed || false,
            credentialsPersisted: sendResult.credentialsPersisted || false
          })
        ]
      );

      return result.rows[0].id;
    } catch (error) {
      systemLogger?.error('Failed to create alert run record', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send alert email (main public method)
   * @param {number} policyId - Alert policy ID
   * @param {Object} emailData - Email data
   * @returns {Promise<Object>} - Send result with alert run ID
   */
  async sendAlert(policyId, emailData) {
    try {
      const sendResult = await this.sendEmail(policyId, emailData);
      const alertRunId = await this.createAlertRun(policyId, sendResult, emailData);

      return {
        ...sendResult,
        alertRunId
      };
    } catch (error) {
      systemLogger?.error('Failed to send alert', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = NotificationService;
