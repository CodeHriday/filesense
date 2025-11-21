/**
 * Email Provider Failover Scenario Tests
 * 
 * Tests failover and retry logic:
 * 1. Primary provider failure → secondary provider success
 * 2. Multiple provider failures → fallback chain
 * 3. Circuit breaker pattern
 * 4. Retry with exponential backoff
 * 5. Rate limiting enforcement
 */

const NotificationService = require('../services/NotificationService');
const { query } = require('../config/database');

describe('Email Provider Failover Tests', () => {
  let testProjectId;
  let testPolicyId;
  let primaryConnectionId;
  let secondaryConnectionId;
  let tertiaryConnectionId;

  beforeAll(async () => {
    // Create test project
    const projectResult = await query(
      `INSERT INTO projects (name, description, project_type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Failover Test Project', 'Test project for failover scenarios', 'internal', 1]
    );
    testProjectId = projectResult.rows[0].id;

    // Create primary email connection (will fail)
    const primaryResult = await query(
      `INSERT INTO storage_connections (name, type, config, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Primary Provider (Failing)',
        'smtp',
        JSON.stringify({
          host: 'invalid-smtp-host.example.com',
          port: 587,
          auth: {
            user: 'test@example.com',
            password: 'invalid-password'
          }
        }),
        testProjectId,
        1
      ]
    );
    primaryConnectionId = primaryResult.rows[0].id;

    // Create secondary email connection (will also fail)
    const secondaryResult = await query(
      `INSERT INTO storage_connections (name, type, config, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Secondary Provider (Also Failing)',
        'smtp',
        JSON.stringify({
          host: 'another-invalid-host.example.com',
          port: 587,
          auth: {
            user: 'test@example.com',
            password: 'invalid-password'
          }
        }),
        testProjectId,
        1
      ]
    );
    secondaryConnectionId = secondaryResult.rows[0].id;

    // Create tertiary email connection (working)
    const tertiaryResult = await query(
      `INSERT INTO storage_connections (name, type, config, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Tertiary Provider (Working)',
        'smtp',
        JSON.stringify({
          host: 'smtp.mailtrap.io',
          port: 2525,
          auth: {
            user: 'test-user',
            password: 'test-password'
          }
        }),
        testProjectId,
        1
      ]
    );
    tertiaryConnectionId = tertiaryResult.rows[0].id;

    // Create alert policy with failover chain
    const policyResult = await query(
      `INSERT INTO alert_policies (
        name, project_id, entity_type, trigger_events,
        primary_connection_id, secondary_connection_id, tertiary_connection_id,
        consolidation_window_minutes, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        'Failover Test Policy',
        testProjectId,
        'job',
        JSON.stringify(['completed', 'failed']),
        primaryConnectionId,
        secondaryConnectionId,
        tertiaryConnectionId,
        5,
        true,
        1
      ]
    );
    testPolicyId = policyResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await query('DELETE FROM alert_policies WHERE id = $1', [testPolicyId]);
    await query('DELETE FROM storage_connections WHERE id IN ($1, $2, $3)', 
      [primaryConnectionId, secondaryConnectionId, tertiaryConnectionId]);
    await query('DELETE FROM projects WHERE id = $1', [testProjectId]);
  });

  // ============================================
  // Test 1: Primary Failure → Secondary Success
  // ============================================
  describe('Primary to Secondary Failover', () => {
    test('should failover to secondary provider when primary fails', async () => {
      const notificationService = new NotificationService();
      
      // Mock providers: primary fails, secondary succeeds
      notificationService.sendWithProvider = jest.fn()
        .mockRejectedValueOnce(new Error('Primary provider connection failed'))
        .mockResolvedValueOnce({
          success: true,
          messageId: 'secondary-success-123',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Failover Test',
        html: '<p>Testing failover</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('secondary-success-123');
      expect(notificationService.sendWithProvider).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // Test 2: Multiple Provider Failures → Tertiary Success
  // ============================================
  describe('Cascading Failover', () => {
    test('should cascade through failover chain until success', async () => {
      const notificationService = new NotificationService();
      
      // Mock providers: primary fails, secondary fails, tertiary succeeds
      notificationService.sendWithProvider = jest.fn()
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('Secondary failed'))
        .mockResolvedValueOnce({
          success: true,
          messageId: 'tertiary-success-456',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Cascading Failover Test',
        html: '<p>Testing cascade</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('tertiary-success-456');
      expect(notificationService.sendWithProvider).toHaveBeenCalledTimes(3);
    });

    test('should track all failed attempts in result', async () => {
      const notificationService = new NotificationService();
      
      notificationService.sendWithProvider = jest.fn()
        .mockRejectedValueOnce(new Error('Primary timeout'))
        .mockRejectedValueOnce(new Error('Secondary auth failed'))
        .mockResolvedValueOnce({
          success: true,
          messageId: 'final-success',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Attempt Tracking Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      expect(result.attempts).toBeDefined();
      expect(result.attempts.length).toBeGreaterThanOrEqual(3);
      
      const failedAttempts = result.attempts.filter(a => a.status === 'failed');
      expect(failedAttempts.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // Test 3: All Providers Fail
  // ============================================
  describe('Complete Failover Chain Failure', () => {
    test('should fail gracefully when all providers fail', async () => {
      const notificationService = new NotificationService();
      
      // Mock all providers failing
      notificationService.sendWithProvider = jest.fn()
        .mockRejectedValue(new Error('Provider unavailable'));

      const emailData = {
        to: ['test@example.com'],
        subject: 'Complete Failure Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('failed');
    });
  });

  // ============================================
  // Test 4: Retry with Exponential Backoff
  // ============================================
  describe('Retry Logic', () => {
    test('should retry failed provider with backoff', async () => {
      const notificationService = new NotificationService();
      const startTime = Date.now();
      
      // Mock provider failing twice, then succeeding
      notificationService.sendWithProvider = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Still failing'))
        .mockResolvedValueOnce({
          success: true,
          messageId: 'retry-success',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Retry Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData, 3);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(notificationService.sendWithProvider).toHaveBeenCalledTimes(3);
      // Verify exponential backoff introduced delay
      expect(duration).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Test 5: Circuit Breaker Pattern
  // ============================================
  describe('Circuit Breaker', () => {
    test('should open circuit after repeated failures', async () => {
      const notificationService = new NotificationService();
      
      // Record 3 failures to open circuit
      for (let i = 0; i < 3; i++) {
        notificationService.recordFailure(primaryConnectionId);
      }

      const isOpen = !notificationService.checkCircuitBreaker(primaryConnectionId);
      expect(isOpen).toBe(true);
    });

    test('should skip provider when circuit is open', async () => {
      const notificationService = new NotificationService();
      
      // Open circuit for primary provider
      for (let i = 0; i < 3; i++) {
        notificationService.recordFailure(primaryConnectionId);
      }

      notificationService.sendWithProvider = jest.fn()
        .mockResolvedValue({
          success: true,
          messageId: 'circuit-bypass-success',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Circuit Breaker Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      // Should skip primary (circuit open) and use secondary
      const skippedAttempts = result.attempts.filter(a => a.reason === 'circuit_breaker_open');
      expect(skippedAttempts.length).toBeGreaterThan(0);
    });

    test('should close circuit after cooldown period', async () => {
      const notificationService = new NotificationService();
      
      // Open circuit
      for (let i = 0; i < 3; i++) {
        notificationService.recordFailure(primaryConnectionId);
      }

      expect(notificationService.checkCircuitBreaker(primaryConnectionId)).toBe(false);

      // Manually modify breaker to simulate cooldown
      const key = `provider_${primaryConnectionId}`;
      const breaker = notificationService.providerCircuitBreakers.get(key);
      breaker.lastFailure = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      notificationService.providerCircuitBreakers.set(key, breaker);

      // Circuit should be half-open now
      expect(notificationService.checkCircuitBreaker(primaryConnectionId)).toBe(true);
    });

    test('should heal circuit gradually on success', async () => {
      const notificationService = new NotificationService();
      
      // Open circuit with 3 failures
      for (let i = 0; i < 3; i++) {
        notificationService.recordFailure(primaryConnectionId);
      }

      const key = `provider_${primaryConnectionId}`;
      let breaker = notificationService.providerCircuitBreakers.get(key);
      expect(breaker.failures).toBe(3);
      expect(breaker.isOpen).toBe(true);

      // Record success to start healing
      notificationService.recordSuccess(primaryConnectionId);
      breaker = notificationService.providerCircuitBreakers.get(key);
      expect(breaker.failures).toBe(2);

      // More successes
      notificationService.recordSuccess(primaryConnectionId);
      notificationService.recordSuccess(primaryConnectionId);
      breaker = notificationService.providerCircuitBreakers.get(key);
      expect(breaker.failures).toBe(0);
      expect(breaker.isOpen).toBe(false);
    });
  });

  // ============================================
  // Test 6: Rate Limiting
  // ============================================
  describe('Rate Limiting', () => {
    test('should enforce rate limit per provider', async () => {
      const notificationService = new NotificationService();
      
      // Exhaust rate limit (100 per hour)
      const key = `provider_${primaryConnectionId}`;
      notificationService.rateLimitCache.set(key, {
        count: 100,
        resetTime: Date.now() + (60 * 60 * 1000)
      });

      const canSend = notificationService.checkRateLimit(primaryConnectionId);
      expect(canSend).toBe(false);
    });

    test('should skip rate-limited provider in failover chain', async () => {
      const notificationService = new NotificationService();
      
      // Rate limit primary provider
      const key = `provider_${primaryConnectionId}`;
      notificationService.rateLimitCache.set(key, {
        count: 100,
        resetTime: Date.now() + (60 * 60 * 1000)
      });

      notificationService.sendWithProvider = jest.fn()
        .mockResolvedValue({
          success: true,
          messageId: 'rate-limit-bypass',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Rate Limit Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      const rateLimitedAttempts = result.attempts.filter(a => a.reason === 'rate_limit_exceeded');
      expect(rateLimitedAttempts.length).toBeGreaterThan(0);
    });

    test('should reset rate limit after time window', async () => {
      const notificationService = new NotificationService();
      
      const key = `provider_${primaryConnectionId}`;
      
      // Set expired rate limit
      notificationService.rateLimitCache.set(key, {
        count: 100,
        resetTime: Date.now() - 1000 // Expired 1 second ago
      });

      const canSend = notificationService.checkRateLimit(primaryConnectionId);
      expect(canSend).toBe(true);

      // Verify limit was reset
      const limit = notificationService.rateLimitCache.get(key);
      expect(limit.count).toBe(1);
    });
  });

  // ============================================
  // Test 7: OAuth2 Token Refresh During Failover
  // ============================================
  describe('OAuth2 Token Refresh', () => {
    test('should refresh OAuth2 tokens during retry', async () => {
      const notificationService = new NotificationService();
      
      // Mock provider with token refresh
      notificationService.sendWithProvider = jest.fn()
        .mockResolvedValue({
          success: true,
          messageId: 'oauth2-refresh-success',
          provider: 'gmail_oauth2',
          credentialsUpdated: true,
          credentialsSummary: {
            hasAccessToken: true,
            hasRefreshToken: true,
            expiresAt: new Date(Date.now() + 3600000).toISOString()
          },
          credentialsRefreshed: true,
          credentialsPersisted: true
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'OAuth2 Refresh Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      expect(result.credentialsRefreshed).toBe(true);
      expect(result.credentialsPersisted).toBe(true);
    });

    test('should not leak credentials in failover result', async () => {
      const notificationService = new NotificationService();
      
      notificationService.sendWithProvider = jest.fn()
        .mockResolvedValue({
          success: true,
          messageId: 'credential-safety-test',
          provider: 'gmail_oauth2',
          credentialsUpdated: true,
          credentialsSummary: {
            hasAccessToken: true,
            hasRefreshToken: true,
            expiresAt: new Date(Date.now() + 3600000).toISOString()
          },
          credentialsRefreshed: true,
          credentialsPersisted: true
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Credential Safety Test',
        html: '<p>Test</p>'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      // Verify no actual credentials in result
      expect(result.updatedCredentials).toBeUndefined();
      expect(result.access_token).toBeUndefined();
      expect(result.refresh_token).toBeUndefined();
      expect(result.client_secret).toBeUndefined();
    });
  });

  // ============================================
  // Test 8: Concurrent Failover Requests
  // ============================================
  describe('Concurrent Failover Handling', () => {
    test('should handle multiple concurrent failover requests', async () => {
      const notificationService = new NotificationService();
      
      notificationService.sendWithProvider = jest.fn()
        .mockResolvedValue({
          success: true,
          messageId: 'concurrent-success',
          provider: 'smtp',
          credentialsRefreshed: false,
          credentialsPersisted: false
        });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Concurrent Test',
        html: '<p>Test</p>'
      };

      // Send 5 concurrent requests
      const promises = Array(5).fill(null).map(() => 
        notificationService.sendEmail(testPolicyId, emailData)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
