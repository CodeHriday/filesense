/**
 * SLA Monitor Worker
 * 
 * Automatically monitors vendor agreement file arrival SLAs at regular intervals:
 * - Checks all active agreements with sla_enabled = true
 * - Calculates expected arrival windows based on frequency patterns
 * - Records violations when files don't arrive within threshold
 * - Resolves violations when files eventually arrive
 * 
 * Runs independently every 15 minutes for proactive monitoring
 */

class SLAMonitorWorker {
  constructor(slaMonitorService, logger, intervalMs = 900000) { // Default: check every 15 minutes
    this.slaMonitorService = slaMonitorService;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.intervalHandle = null;
    this.isProcessing = false;
  }

  /**
   * Start the SLA monitor worker
   */
  async start() {
    this.logger.info('🔔 SLA monitor worker started', {
      checkIntervalMinutes: this.intervalMs / 60000
    });

    // Process immediately on startup
    this.processSLAs();

    // Then process at regular intervals
    this.intervalHandle = setInterval(() => {
      this.processSLAs();
    }, this.intervalMs);
  }

  /**
   * Process vendor SLA checks
   * Prevents overlapping executions
   */
  async processSLAs() {
    // Skip if already processing
    if (this.isProcessing) {
      this.logger.debug('SLA monitor already processing, skipping this interval');
      return;
    }

    this.isProcessing = true;

    try {
      const result = await this.slaMonitorService.processVendorSLAs();
      
      if (result.processed > 0) {
        this.logger.info('SLA monitor processed vendor agreements', {
          processed: result.processed,
          violations: result.violations,
          compliant: result.compliant,
          errors: result.errors.length
        });

        // Log details of any new violations
        if (result.violations > 0) {
          const violationDetails = result.details
            .filter(d => d.status === 'violation')
            .map(d => ({
              agreement: d.agreementCode,
              expectedTime: d.expectedArrival,
              delayMinutes: d.delayMinutes
            }));

          this.logger.warn('SLA violations detected', {
            count: result.violations,
            violations: violationDetails
          });
        }
      }
    } catch (error) {
      this.logger.error('Error in SLA monitor worker', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stop the SLA monitor worker
   */
  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info('SLA monitor worker stopped');
    }
  }
}

module.exports = SLAMonitorWorker;
