/**
 * Scheduler Worker
 * 
 * Automatically processes due schedules at regular intervals:
 * - Checks for schedules with next_run <= current time
 * - Executes transformations, mapping groups, and workflows
 * - Updates next_run times for recurring schedules
 * 
 * Runs independently of queue system for reliability
 */

const { processDueSchedules } = require('../services/cronSchedulerService');
const { processDigests } = require('../services/DigestService');

class SchedulerWorker {
  constructor(logger, intervalMs = 60000) { // Default: check every minute
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.intervalHandle = null;
    this.isProcessing = false;
  }

  /**
   * Start the scheduler worker
   */
  async start() {
    this.logger.info('🕐 Scheduler worker started', {
      checkIntervalSeconds: this.intervalMs / 1000
    });

    // Process immediately on startup
    this.processSchedules();

    // Then process at regular intervals
    this.intervalHandle = setInterval(() => {
      this.processSchedules();
    }, this.intervalMs);
  }

  /**
   * Process due schedules
   * Prevents overlapping executions
   */
  async processSchedules() {
    // Skip if already processing
    if (this.isProcessing) {
      this.logger.debug('Scheduler already processing, skipping this interval');
      return;
    }

    this.isProcessing = true;

    try {
      const [scheduleResult, digestResult] = await Promise.allSettled([
        processDueSchedules(),
        processDigests(),
      ]);

      if (scheduleResult.status === 'fulfilled' && scheduleResult.value.processed > 0) {
        this.logger.info('Scheduler processed due schedules', {
          processed: scheduleResult.value.processed,
          schedules: (scheduleResult.value.schedules || []).map(s => ({
            id: s.scheduleId,
            entityType: s.entityType,
            entityId: s.entityId,
            success: s.success
          }))
        });
      }
      if (scheduleResult.status === 'rejected') {
        this.logger.error('Error in processDueSchedules', {
          error: scheduleResult.reason?.message,
          stack: scheduleResult.reason?.stack
        });
      }

      if (digestResult.status === 'fulfilled' && digestResult.value.processed > 0) {
        this.logger.info('Digest worker processed due digests', {
          processed: digestResult.value.processed,
        });
      }
      if (digestResult.status === 'rejected') {
        this.logger.error('Error in processDigests', {
          error: digestResult.reason?.message,
        });
      }
    } catch (error) {
      this.logger.error('Error in scheduler worker', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stop the scheduler worker
   */
  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info('Scheduler worker stopped');
    }
  }
}

module.exports = SchedulerWorker;
