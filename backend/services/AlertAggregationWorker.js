/**
 * Alert Aggregation Background Worker
 * 
 * Monitors alert aggregation queue and triggers consolidated email delivery.
 * 
 * Responsibilities:
 * - Periodic flush of expired aggregations (every 1 minute)
 * - Workflow completion detection and immediate flush
 * - Integration with NotificationService for email delivery
 */

const alertAggregator = require('./AlertAggregator');
const notificationService = require('./NotificationService');
const emailComposer = require('./EmailComposer');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

class AlertAggregationWorker {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    
    // Check for expired aggregations every 60 seconds
    this.FLUSH_INTERVAL_MS = 60 * 1000;
  }

  /**
   * Start the background worker
   */
  start() {
    if (this.isRunning) {
      systemLogger.warn('Alert aggregation worker is already running');
      return;
    }

    systemLogger.info('Starting alert aggregation worker');
    this.isRunning = true;

    // Run immediately on start
    this.processExpiredAggregations();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.processExpiredAggregations();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Stop the background worker
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    systemLogger.info('Stopping alert aggregation worker');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Process expired aggregations and send consolidated alerts
   */
  async processExpiredAggregations() {
    try {
      // Flush expired aggregations and get events
      const flushedAggregations = await alertAggregator.flushExpiredAggregations();
      
      if (flushedAggregations.length > 0) {
        systemLogger.info('Processing expired alert aggregations', {
          count: flushedAggregations.length
        });

        // Send consolidated alert for each flushed policy
        for (const { policyId, events } of flushedAggregations) {
          try {
            // Get policy details
            const policyResult = await pool.query(
              'SELECT * FROM alert_policies WHERE id = $1',
              [policyId]
            );

            if (policyResult.rows.length === 0) {
              systemLogger.warn('Policy not found for flushed aggregation', { policyId });
              continue;
            }

            const policy = policyResult.rows[0];
            await this.sendConsolidatedAlert(policy, events);
          } catch (error) {
            systemLogger.error('Error sending consolidated alert for flushed policy', {
              policyId,
              error: error.message
            });
          }
        }
      }
    } catch (error) {
      systemLogger.error('Error processing expired aggregations', {
        error: error.message
      });
    }
  }

  /**
   * Handle workflow completion event
   * Triggers immediate flush of aggregated alerts for the workflow's policies
   * @param {string} workflowId - Workflow ID
   * @param {string} workflowRunId - Workflow run ID
   */
  async onWorkflowCompleted(workflowId, workflowRunId) {
    try {
      systemLogger.info('Workflow completed, checking for pending alerts', {
        workflowId,
        workflowRunId
      });

      // Get all alert policies that match this workflow
      const policies = await this.getMatchingPolicies('workflow', workflowId);
      
      for (const policy of policies) {
        const status = await alertAggregator.getAggregationStatus(policy.id);
        
        if (status.eventCount > 0) {
          systemLogger.info('Flushing aggregated alerts on workflow completion', {
            workflowId,
            policyId: policy.id,
            eventCount: status.eventCount
          });

          // Flush and send consolidated alert
          const events = await alertAggregator.flushEvents(policy.id, 'workflow_completed');
          await this.sendConsolidatedAlert(policy, events);
        }
      }
    } catch (error) {
      systemLogger.error('Error handling workflow completion', {
        workflowId,
        workflowRunId,
        error: error.message
      });
    }
  }

  /**
   * Handle job completion event
   * @param {string} jobId - Job ID
   * @param {string} status - Job status ('completed', 'failed')
   */
  async onJobCompleted(jobId, status) {
    try {
      // Get all alert policies that match this job
      const policies = await this.getMatchingPolicies('job', jobId);
      
      for (const policy of policies) {
        // Add event to aggregation queue
        await alertAggregator.addEvent({
          policyId: policy.id,
          eventType: 'job_execution',
          entityId: jobId,
          entityType: 'job',
          status,
          metadata: { completedAt: new Date().toISOString() }
        });

        // If policy has immediate delivery (no consolidation), flush immediately
        if (policy.consolidate_alerts === false) {
          const events = await alertAggregator.flushEvents(policy.id, 'immediate_delivery');
          await this.sendConsolidatedAlert(policy, events);
        }
      }
    } catch (error) {
      systemLogger.error('Error handling job completion', {
        jobId,
        status,
        error: error.message
      });
    }
  }

  /**
   * Handle mapping group completion event
   * @param {string} mappingGroupId - Mapping group ID
   * @param {string} status - Status ('completed', 'failed')
   */
  async onMappingGroupCompleted(mappingGroupId, status) {
    try {
      const policies = await this.getMatchingPolicies('mapping_group', mappingGroupId);
      
      for (const policy of policies) {
        await alertAggregator.addEvent({
          policyId: policy.id,
          eventType: 'mapping_group_execution',
          entityId: mappingGroupId,
          entityType: 'mapping_group',
          status,
          metadata: { completedAt: new Date().toISOString() }
        });

        if (policy.consolidate_alerts === false) {
          const events = await alertAggregator.flushEvents(policy.id, 'immediate_delivery');
          await this.sendConsolidatedAlert(policy, events);
        }
      }
    } catch (error) {
      systemLogger.error('Error handling mapping group completion', {
        mappingGroupId,
        status,
        error: error.message
      });
    }
  }

  /**
   * Handle schedule execution completion
   * @param {string} scheduleId - Schedule ID
   * @param {string} status - Status ('completed', 'failed')
   */
  async onScheduleExecuted(scheduleId, status) {
    try {
      const policies = await this.getMatchingPolicies('schedule', scheduleId);
      
      for (const policy of policies) {
        await alertAggregator.addEvent({
          policyId: policy.id,
          eventType: 'schedule_execution',
          entityId: scheduleId,
          entityType: 'schedule',
          status,
          metadata: { executedAt: new Date().toISOString() }
        });

        if (policy.consolidate_alerts === false) {
          const events = await alertAggregator.flushEvents(policy.id, 'immediate_delivery');
          await this.sendConsolidatedAlert(policy, events);
        }
      }
    } catch (error) {
      systemLogger.error('Error handling schedule execution', {
        scheduleId,
        status,
        error: error.message
      });
    }
  }

  /**
   * Get alert policies matching entity
   * @param {string} entityType - 'job', 'workflow', 'mapping_group', 'schedule'
   * @param {string} entityId - Entity ID
   * @returns {Promise<Array>} - Matching policies
   */
  async getMatchingPolicies(entityType, entityId) {
    try {
      const query = `
        SELECT *
        FROM alert_policies
        WHERE enabled = true
          AND (
            (entity_type = $1 AND entity_id = $2)
            OR (entity_type = $1 AND entity_id = '*')
          )
      `;
      
      const result = await pool.query(query, [entityType, entityId]);
      return result.rows;
    } catch (error) {
      systemLogger.error('Error getting matching policies', {
        entityType,
        entityId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Send consolidated alert email
   * @param {Object} policy - Alert policy
   * @param {Array} events - Aggregated events
   */
  async sendConsolidatedAlert(policy, events) {
    try {
      if (events.length === 0) {
        return;
      }

      systemLogger.info('Sending consolidated alert', {
        policyId: policy.id,
        eventCount: events.length
      });

      // Get recipients
      const recipientResult = await pool.query(
        'SELECT recipient_email, recipient_name FROM alert_policy_recipients WHERE policy_id = $1',
        [policy.id]
      );
      
      if (recipientResult.rows.length === 0) {
        systemLogger.warn('No recipients configured for alert policy', {
          policyId: policy.id
        });
        return;
      }

      const recipients = recipientResult.rows.map(r => ({
        email: r.recipient_email,
        name: r.recipient_name
      }));

      // Determine alert type based on events
      const eventType = events[0].entityType;
      const entityIds = [...new Set(events.map(e => e.entityId))];

      // Compose email based on event type
      let emailContent;
      if (events.length === 1) {
        // Single event - use specific template
        const event = events[0];
        emailContent = await this.composeSingleEventEmail(event);
      } else {
        // Multiple events - use consolidated template
        emailContent = await this.composeConsolidatedEmail(policy, events);
      }

      // Send via NotificationService
      const result = await notificationService.sendAlert({
        policyId: policy.id,
        recipients,
        subject: emailContent.subject,
        htmlBody: emailContent.html,
        textBody: emailContent.text,
        attachments: emailContent.attachments || [],
        metadata: {
          eventCount: events.length,
          eventType,
          entityIds
        }
      });

      systemLogger.info('Consolidated alert sent successfully', {
        policyId: policy.id,
        eventCount: events.length,
        alertRunId: result.alertRunId
      });
    } catch (error) {
      systemLogger.error('Error sending consolidated alert', {
        policyId: policy.id,
        error: error.message
      });
    }
  }

  /**
   * Compose email for single event
   * @private
   */
  async composeSingleEventEmail(event) {
    const { entityType, entityId, status, metadata } = event;

    // Fetch entity details from database
    let entity;
    switch (entityType) {
      case 'job':
        entity = await this.getJobDetails(entityId);
        break;
      case 'workflow':
        entity = await this.getWorkflowDetails(entityId);
        break;
      case 'mapping_group':
        entity = await this.getMappingGroupDetails(entityId);
        break;
      case 'schedule':
        entity = await this.getScheduleDetails(entityId);
        break;
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }

    if (!entity) {
      throw new Error(`Entity not found: ${entityType} ${entityId}`);
    }

    // Build full template payload combining entity metadata + event runtime data
    let entityData;
    switch (entityType) {
      case 'job':
        entityData = {
          job: entity,
          status: status || entity.status,
          error: metadata?.error || entity.error_message,
          duration: metadata?.duration || entity.duration_ms,
          recordsProcessed: metadata?.recordsProcessed || entity.records_processed || 0,
          qualityViolations: metadata?.qualityViolations || entity.quality_violations || 0
        };
        break;

      case 'workflow':
        entityData = {
          workflow: entity,
          status: status || entity.status,
          error: metadata?.error || entity.error_message,
          duration: metadata?.duration || entity.duration_ms,
          stepsCompleted: metadata?.stepsCompleted || entity.steps_completed || 0,
          totalSteps: metadata?.totalSteps || entity.total_steps || 0,
          failedStep: metadata?.failedStep || entity.failed_step
        };
        break;

      case 'mapping_group':
        entityData = {
          mappingGroup: entity,
          status: status || entity.status,
          error: metadata?.error || entity.error_message,
          duration: metadata?.duration || entity.duration_ms,
          jobsCompleted: metadata?.jobsCompleted || entity.jobs_completed || 0,
          totalJobs: metadata?.totalJobs || entity.total_jobs || 0,
          failedJobs: metadata?.failedJobs || entity.failed_jobs || 0
        };
        break;

      case 'schedule':
        entityData = {
          schedule: entity,
          status: status || 'completed',
          error: metadata?.error,
          duration: metadata?.duration,
          nextRun: metadata?.nextRun || entity.next_run
        };
        break;

      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }

    return await emailComposer.composeAlert(entityType, entityData);
  }

  /**
   * Compose consolidated email for multiple events
   * @private
   */
  async composeConsolidatedEmail(policy, events) {
    // Group events by entity type and status
    const groupedEvents = events.reduce((acc, event) => {
      const key = `${event.entityType}_${event.status}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(event);
      return acc;
    }, {});

    // Fetch details for all entities
    const entityDetails = await Promise.all(
      events.map(async (event) => {
        switch (event.entityType) {
          case 'job':
            return await this.getJobDetails(event.entityId);
          case 'workflow':
            return await this.getWorkflowDetails(event.entityId);
          case 'mapping_group':
            return await this.getMappingGroupDetails(event.entityId);
          case 'schedule':
            return await this.getScheduleDetails(event.entityId);
          default:
            return null;
        }
      })
    );

    return await emailComposer.composeConsolidatedAlert({
      policyName: policy.name,
      events: events.map((e, i) => ({ ...e, details: entityDetails[i] })),
      groupedEvents
    });
  }

  /**
   * Get job details from database
   * @private
   */
  async getJobDetails(jobId) {
    const result = await pool.query(
      'SELECT * FROM etl_jobs WHERE id = $1',
      [jobId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get workflow details from database
   * @private
   */
  async getWorkflowDetails(workflowId) {
    const result = await pool.query(
      'SELECT * FROM workflows WHERE id = $1',
      [workflowId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get mapping group details from database
   * @private
   */
  async getMappingGroupDetails(mappingGroupId) {
    const result = await pool.query(
      'SELECT * FROM mapping_groups WHERE id = $1',
      [mappingGroupId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get schedule details from database
   * @private
   */
  async getScheduleDetails(scheduleId) {
    const result = await pool.query(
      'SELECT * FROM workflow_schedules WHERE id = $1',
      [scheduleId]
    );
    return result.rows[0] || null;
  }
}

module.exports = new AlertAggregationWorker();
