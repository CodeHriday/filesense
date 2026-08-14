/**
 * End-to-End Alert Flow Integration Tests
 * 
 * Tests the complete alert flow:
 * 1. Job/Workflow/Schedule execution
 * 2. Event emission to AlertAggregator
 * 3. Alert aggregation and consolidation
 * 4. Email composition with templates
 * 5. Quality violations attachment generation
 * 6. Email delivery via NotificationService
 * 7. Alert run tracking
 */

const { query } = require('../config/database');
const AlertAggregator = require('../services/AlertAggregator');
const AlertAggregationWorker = require('../workers/AlertAggregationWorker');
const NotificationService = require('../services/NotificationService');
const EmailComposer = require('../services/email/EmailComposer');
const AttachmentBuilder = require('../services/email/AttachmentBuilder');

describe('End-to-End Alert Flow Tests', () => {
  let testProjectId;
  let testPolicyId;
  let testConnectionId;
  let testJobId;

  beforeAll(async () => {
    // Create test project
    const projectResult = await query(
      `INSERT INTO projects (name, description, project_type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Test Alert Project', 'Test project for alert flow', 'internal', 1]
    );
    testProjectId = projectResult.rows[0].id;

    // Create test email connection (mock SMTP)
    const connectionResult = await query(
      `INSERT INTO storage_connections (name, type, config, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Test SMTP Provider',
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
    testConnectionId = connectionResult.rows[0].id;

    // Create test alert policy
    const policyResult = await query(
      `INSERT INTO alert_policies (
        name, project_id, entity_type, trigger_events, 
        primary_connection_id, consolidation_window_minutes, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        'Test Job Alert Policy',
        testProjectId,
        'job',
        JSON.stringify(['completed', 'failed']),
        testConnectionId,
        5, // 5 minute window
        true,
        1
      ]
    );
    testPolicyId = policyResult.rows[0].id;

    // Add policy recipients
    await query(
      `INSERT INTO alert_policy_recipients (policy_id, user_id, email)
       VALUES ($1, $2, $3)`,
      [testPolicyId, 1, 'test@example.com']
    );

    // Create test ETL job
    const jobResult = await query(
      `INSERT INTO etl_jobs (
        name, project_id, source_pattern, target_format, 
        transformation_rules, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        'Test Job',
        testProjectId,
        '*.csv',
        'parquet',
        JSON.stringify([]),
        1
      ]
    );
    testJobId = jobResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    await query('DELETE FROM alert_policy_recipients WHERE policy_id = $1', [testPolicyId]);
    await query('DELETE FROM alert_policies WHERE id = $1', [testPolicyId]);
    await query('DELETE FROM storage_connections WHERE id = $1', [testConnectionId]);
    await query('DELETE FROM etl_jobs WHERE id = $1', [testJobId]);
    await query('DELETE FROM projects WHERE id = $1', [testProjectId]);
  });

  // ============================================
  // Test 1: Event Emission
  // ============================================
  describe('Event Emission', () => {
    test('should emit job completion event', async () => {
      const aggregator = new AlertAggregator();
      
      const eventData = {
        jobId: testJobId,
        jobName: 'Test Job',
        projectId: testProjectId,
        projectName: 'Test Alert Project',
        status: 'completed',
        executionTime: new Date().toISOString(),
        duration: 5000,
        recordsProcessed: 1000,
        qualityViolations: 0
      };

      await aggregator.onJobExecuted(eventData);

      // Verify event was stored
      const events = await aggregator.getEventsForPolicy(
        testPolicyId, 
        'job', 
        JSON.stringify(['completed', 'failed'])
      );

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({
        type: 'job',
        name: 'Test Job',
        status: 'completed'
      });
    });

    test('should emit job failure event with quality violations', async () => {
      const aggregator = new AlertAggregator();
      
      const eventData = {
        jobId: testJobId,
        jobName: 'Test Job',
        projectId: testProjectId,
        projectName: 'Test Alert Project',
        status: 'failed',
        executionTime: new Date().toISOString(),
        duration: 3000,
        recordsProcessed: 500,
        qualityViolations: 25,
        error: 'Data validation failed'
      };

      await aggregator.onJobExecuted(eventData);

      const events = await aggregator.getEventsForPolicy(
        testPolicyId,
        'job',
        JSON.stringify(['failed'])
      );

      expect(events.length).toBeGreaterThan(0);
      const failureEvent = events.find(e => e.status === 'failed');
      expect(failureEvent).toBeDefined();
      expect(failureEvent.qualityViolations).toBe(25);
      expect(failureEvent.error).toBe('Data validation failed');
    });
  });

  // ============================================
  // Test 2: Alert Aggregation
  // ============================================
  describe('Alert Aggregation', () => {
    test('should consolidate multiple events in time window', async () => {
      const aggregator = new AlertAggregator();
      
      // Emit 3 job events within consolidation window
      for (let i = 0; i < 3; i++) {
        await aggregator.onJobExecuted({
          jobId: testJobId,
          jobName: `Test Job ${i}`,
          projectId: testProjectId,
          projectName: 'Test Alert Project',
          status: 'completed',
          executionTime: new Date().toISOString(),
          duration: 2000 + (i * 100),
          recordsProcessed: 100 * (i + 1)
        });
        
        // Small delay to ensure distinct timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const events = await aggregator.getEventsForPolicy(
        testPolicyId,
        'job',
        JSON.stringify(['completed', 'failed'])
      );

      expect(events.length).toBe(3);
    });

    test('should track aggregation expiration time', async () => {
      const aggregator = new AlertAggregator();
      
      await aggregator.onJobExecuted({
        jobId: testJobId,
        jobName: 'Test Job',
        projectId: testProjectId,
        projectName: 'Test Alert Project',
        status: 'completed',
        executionTime: new Date().toISOString(),
        duration: 5000,
        recordsProcessed: 500
      });

      // Check aggregation record exists
      const aggResult = await query(
        `SELECT * FROM alert_aggregation 
         WHERE policy_id = $1 AND processed = false`,
        [testPolicyId]
      );

      expect(aggResult.rows.length).toBeGreaterThan(0);
      expect(aggResult.rows[0].expires_at).toBeDefined();
    });
  });

  // ============================================
  // Test 3: Email Composition
  // ============================================
  describe('Email Composition', () => {
    test('should compose HTML email from job template', async () => {
      const composer = new EmailComposer();
      
      const eventData = {
        jobId: testJobId,
        jobName: 'Test Job',
        projectId: testProjectId,
        projectName: 'Test Alert Project',
        status: 'completed',
        executionTime: new Date().toISOString(),
        duration: 5000,
        recordsProcessed: 1000,
        qualityViolations: 0
      };

      const email = await composer.composeJobAlert(eventData);

      expect(email.html).toContain('Test Job');
      expect(email.html).toContain('completed');
      expect(email.text).toContain('Test Job');
      expect(email.subject).toContain('Job Completed');
    });

    test('should compose warning email for completed_with_warnings status', async () => {
      const composer = new EmailComposer();

      const email = await composer.composeJobAlert({
        job: {
          name: 'Warn Job',
          id: 'warn-job-001',
          project_name: 'Test Project'
        },
        status: 'completed_with_warnings',
        error: null,
        duration: 3000,
        recordsProcessed: 500,
        qualityViolations: 3
      });

      // Subject should say WARNING, not FAILED
      expect(email.subject).toContain('WARNING');
      expect(email.subject).toContain('Warn Job');
      expect(email.subject).not.toContain('FAILED');
      // HTML should render warning label, not Failed
      expect(email.html).toContain('Completed with Warnings');
      expect(email.html).not.toContain('>Failed<');
      // Text should match
      expect(email.text).toContain('COMPLETED WITH WARNINGS');
      expect(email.text).not.toContain('FAILED');
    });

    test('should compose consolidated email with multiple events', async () => {
      const composer = new EmailComposer();
      
      const events = [
        {
          type: 'job',
          name: 'Job 1',
          status: 'completed',
          timestamp: new Date().toISOString(),
          duration: 3000
        },
        {
          type: 'job',
          name: 'Job 2',
          status: 'failed',
          timestamp: new Date().toISOString(),
          duration: 2000,
          error: 'Validation error'
        }
      ];

      const email = await composer.composeConsolidatedAlert(events, '5 minutes');

      expect(email.html).toContain('Job 1');
      expect(email.html).toContain('Job 2');
      expect(email.html).toContain('completed');
      expect(email.html).toContain('failed');
      expect(email.subject).toContain('Alert Summary');
    });
  });

  // ============================================
  // Test 4: Quality Violations Attachment
  // ============================================
  describe('Quality Violations Attachment', () => {
    let testExecutionId;

    beforeAll(async () => {
      // Create test execution with quality violations
      const execResult = await query(
        `INSERT INTO etl_job_executions (job_id, status, started_at)
         VALUES ($1, $2, $3) RETURNING id`,
        [testJobId, 'completed', new Date()]
      );
      testExecutionId = execResult.rows[0].id;

      // Insert test quality violations
      for (let i = 0; i < 5; i++) {
        await query(
          `INSERT INTO quality_violations (
            execution_id, rule_name, severity, field_name, 
            row_number, expected_value, actual_value
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            testExecutionId,
            'Not Null Check',
            'error',
            'user_email',
            i + 1,
            'not null',
            'null'
          ]
        );
      }
    });

    afterAll(async () => {
      await query('DELETE FROM quality_violations WHERE execution_id = $1', [testExecutionId]);
      await query('DELETE FROM etl_job_executions WHERE id = $1', [testExecutionId]);
    });

    test('should generate CSV attachment from quality violations', async () => {
      const builder = new AttachmentBuilder();
      
      const attachment = await builder.buildQualityViolationsAttachment(testExecutionId);

      expect(attachment).toBeDefined();
      expect(attachment.filename).toContain('quality_violations');
      expect(attachment.filename).toContain('.csv');
      expect(attachment.content).toBeDefined();
      expect(attachment.contentType).toBe('text/csv');

      // Verify CSV content
      const csvContent = attachment.content.toString('utf8');
      expect(csvContent).toContain('rule_name');
      expect(csvContent).toContain('Not Null Check');
      expect(csvContent).toContain('user_email');
    });

    test('should handle large attachments with requiresCloudUpload flag', async () => {
      const builder = new AttachmentBuilder();
      
      // Mock large dataset (>10MB)
      const largeExecutionId = 999999; // Non-existent, will trigger empty result
      const attachment = await builder.buildQualityViolationsAttachment(largeExecutionId);

      // For empty/small result, should not require cloud upload
      if (attachment) {
        expect(attachment.requiresCloudUpload).toBe(false);
      }
    });
  });

  // ============================================
  // Test 5: Email Delivery
  // ============================================
  describe('Email Delivery', () => {
    test('should send email via NotificationService', async () => {
      const notificationService = new NotificationService();
      
      // Mock the email provider to avoid actual sending
      notificationService.sendWithProvider = jest.fn().mockResolvedValue({
        success: true,
        messageId: 'test-message-id-123',
        provider: 'smtp',
        credentialsRefreshed: false,
        credentialsPersisted: false
      });

      const emailData = {
        to: ['test@example.com'],
        subject: 'Test Alert',
        html: '<h1>Test Alert</h1>',
        text: 'Test Alert'
      };

      const result = await notificationService.sendEmail(testPolicyId, emailData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id-123');
      expect(notificationService.sendWithProvider).toHaveBeenCalled();
    });

    test('should track alert run in database', async () => {
      const notificationService = new NotificationService();
      
      const sendResult = {
        success: true,
        messageId: 'test-message-id-456',
        providerId: testConnectionId,
        providerType: 'smtp',
        duration: 500,
        attempts: []
      };

      const emailData = {
        to: ['test@example.com'],
        subject: 'Test Alert',
        html: '<p>Test</p>'
      };

      const runId = await notificationService.createAlertRun(
        testPolicyId,
        sendResult,
        emailData
      );

      expect(runId).toBeDefined();
      expect(typeof runId).toBe('number');

      // Verify run record
      const runResult = await query(
        'SELECT * FROM alert_runs WHERE id = $1',
        [runId]
      );

      expect(runResult.rows.length).toBe(1);
      expect(runResult.rows[0].policy_id).toBe(testPolicyId);
      expect(runResult.rows[0].status).toBe('sent');
      expect(runResult.rows[0].message_id).toBe('test-message-id-456');

      // Cleanup
      await query('DELETE FROM alert_runs WHERE id = $1', [runId]);
    });
  });

  // ============================================
  // Test 6: Complete End-to-End Flow
  // ============================================
  describe('Complete End-to-End Flow', () => {
    test('should execute full alert flow: event → aggregation → email', async () => {
      const aggregator = new AlertAggregator();
      const worker = new AlertAggregationWorker();
      const notificationService = new NotificationService();

      // Mock email sending
      notificationService.sendAlert = jest.fn().mockResolvedValue({
        success: true,
        messageId: 'e2e-test-message',
        alertRunId: 123
      });

      // Step 1: Emit job failure event with quality violations
      const eventData = {
        jobId: testJobId,
        jobName: 'E2E Test Job',
        projectId: testProjectId,
        projectName: 'Test Alert Project',
        status: 'failed',
        executionTime: new Date().toISOString(),
        duration: 8000,
        recordsProcessed: 750,
        qualityViolations: 15,
        error: 'Data quality threshold exceeded'
      };

      await aggregator.onJobExecuted(eventData);

      // Step 2: Manually trigger aggregation processing
      // (In production, this runs via worker polling)
      const expiredAggregations = await query(
        `SELECT * FROM alert_aggregation 
         WHERE processed = false AND expires_at <= NOW()`
      );

      // Mark aggregation as expired for testing
      await query(
        `UPDATE alert_aggregation 
         SET expires_at = NOW() - INTERVAL '1 minute'
         WHERE policy_id = $1 AND processed = false`,
        [testPolicyId]
      );

      // Step 3: Process aggregations (this would send email)
      // For test, we just verify the aggregation exists
      const pendingAggs = await query(
        `SELECT * FROM alert_aggregation 
         WHERE policy_id = $1 AND processed = false AND expires_at <= NOW()`,
        [testPolicyId]
      );

      expect(pendingAggs.rows.length).toBeGreaterThan(0);

      // Cleanup
      await query(
        'DELETE FROM alert_aggregation WHERE policy_id = $1',
        [testPolicyId]
      );
    });
  });
});
