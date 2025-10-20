const { systemLogger } = require('../utils/logger');
const FileInsightsService = require('../services/fileInsightsService');

/**
 * Insights Aggregation Worker
 * Runs daily to aggregate file metrics and clean up old records
 */
class InsightsAggregationWorker {
  constructor(dbPool, scheduleTime = '02:00') {
    this.pool = dbPool;
    this.scheduleTime = scheduleTime; // Format: 'HH:MM'
    this.insightsService = new FileInsightsService(dbPool);
    this.isProcessing = false;
    this.intervalId = null;
  }

  /**
   * Start the worker
   */
  start() {
    systemLogger.info('Starting insights aggregation worker', {
      scheduleTime: this.scheduleTime
    });

    // Check every hour if it's time to run
    this.intervalId = setInterval(() => {
      this.checkAndRun();
    }, 60 * 60 * 1000); // Check every hour

    // Also run immediately if last run was yesterday
    this.checkAndRun();

    systemLogger.info('Insights aggregation worker started');
  }

  /**
   * Stop the worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    systemLogger.info('Insights aggregation worker stopped');
  }

  /**
   * Check if it's time to run and execute if needed
   */
  async checkAndRun() {
    if (this.isProcessing) {
      systemLogger.debug('Aggregation already in progress, skipping');
      return;
    }

    const now = new Date();
    const [targetHour, targetMinute] = this.scheduleTime.split(':').map(Number);
    
    // Check if current hour matches schedule time
    if (now.getHours() === targetHour && now.getMinutes() >= targetMinute && now.getMinutes() < targetMinute + 60) {
      // Check if we already ran today
      const lastRun = await this.getLastRunDate();
      const today = now.toISOString().split('T')[0];
      
      if (lastRun !== today) {
        await this.run();
      }
    }
  }

  /**
   * Get the last run date from the database
   */
  async getLastRunDate() {
    try {
      const result = await this.pool.query(`
        SELECT MAX(metric_date)::TEXT as last_run
        FROM file_pattern_metrics
      `);
      return result.rows[0]?.last_run || null;
    } catch (error) {
      systemLogger.error('Error getting last run date', { error: error.message });
      return null;
    }
  }

  /**
   * Run the aggregation and cleanup
   */
  async run() {
    if (this.isProcessing) {
      systemLogger.warn('Aggregation already in progress');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      systemLogger.info('Starting daily insights aggregation');

      // Aggregate metrics for yesterday (data is typically complete by 2 AM)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const aggregationResult = await this.insightsService.aggregateDailyMetrics(yesterday);
      
      systemLogger.info('Daily aggregation completed', {
        duration_ms: Date.now() - startTime,
        result: aggregationResult
      });

      // Run cleanup weekly (every 7th day)
      const dayOfMonth = new Date().getDate();
      if (dayOfMonth % 7 === 0) {
        systemLogger.info('Starting weekly cleanup');
        const cleanupResult = await this.insightsService.cleanupOldRecords();
        
        systemLogger.info('Cleanup completed', {
          result: cleanupResult
        });
      }

    } catch (error) {
      systemLogger.error('Error in insights aggregation worker', {
        error: error.message,
        stack: error.stack,
        duration_ms: Date.now() - startTime
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manual trigger (for testing or admin actions)
   */
  async triggerNow(targetDate = null) {
    return this.insightsService.aggregateDailyMetrics(targetDate || new Date());
  }
}

module.exports = InsightsAggregationWorker;
