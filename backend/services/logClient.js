/**
 * Rust Log Service Client
 * 
 * High-performance log ingestion client that forwards logs to the Rust-based
 * log service for compression, indexing, and efficient storage.
 */

const axios = require('axios');

class LogServiceClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.LOG_SERVICE_URL || 'http://localhost:9000';
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.enabled = options.enabled !== false;
    
    this.buffer = [];
    this.flushTimer = null;
    this.isConnected = false;
    
    if (this.enabled) {
      this.startFlushTimer();
      this.checkConnection();
    }
  }

  async checkConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      this.isConnected = response.data?.status === 'healthy';
      if (this.isConnected) {
        console.log(`[LogClient] Connected to log service at ${this.baseUrl}`);
      }
    } catch (error) {
      this.isConnected = false;
      console.warn(`[LogClient] Log service not available at ${this.baseUrl}, falling back to console`);
    }
    return this.isConnected;
  }

  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Log a single event
   */
  async log(level, source, message, context = {}) {
    const event = this.createEvent(level, source, message, context);
    
    if (!this.enabled || !this.isConnected) {
      this.fallbackLog(event);
      return event.id;
    }
    
    this.buffer.push(event);
    
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
    
    return event.id;
  }

  /**
   * Create a log event object
   */
  createEvent(level, source, message, context = {}) {
    const event = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level: level.toLowerCase(),
      source: this.normalizeSource(source),
      message: typeof message === 'string' ? message : JSON.stringify(message),
      job_id: context.jobId || null,
      workflow_id: context.workflowId || null,
      mapping_id: context.mappingId || null,
      project_id: context.projectId || null,
      user_id: context.userId || null,
      execution_id: context.executionId || null,
      step_name: context.stepName || null,
      duration_ms: context.durationMs || null,
      rows_processed: context.rowsProcessed || null,
      error_code: context.errorCode || null,
      stack_trace: context.stackTrace || null,
      metadata: context.metadata || {}
    };
    
    return event;
  }

  normalizeSource(source) {
    const sourceMap = {
      'job': 'job_execution',
      'job_execution': 'job_execution',
      'workflow': 'workflow_execution',
      'workflow_execution': 'workflow_execution',
      'transformation': 'transformation',
      'scheduler': 'scheduler',
      'monitor': 'monitor',
      'system': 'system',
      'api': 'api'
    };
    return sourceMap[source?.toLowerCase()] || 'custom';
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Flush buffered logs to the service
   */
  async flush() {
    if (this.buffer.length === 0) return;
    
    const logs = [...this.buffer];
    this.buffer = [];
    
    if (!this.isConnected) {
      logs.forEach(log => this.fallbackLog(log));
      return;
    }
    
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await axios.post(`${this.baseUrl}/api/logs/batch`, { logs }, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        });
        return;
      } catch (error) {
        retries++;
        if (retries >= this.maxRetries) {
          console.error(`[LogClient] Failed to send logs after ${this.maxRetries} retries:`, error.message);
          logs.forEach(log => this.fallbackLog(log));
          this.isConnected = false;
          setTimeout(() => this.checkConnection(), 30000);
          return;
        }
        await this.sleep(this.retryDelay * retries);
      }
    }
  }

  fallbackLog(event) {
    const prefix = `[${event.timestamp}] [${event.level.toUpperCase()}] [${event.source}]`;
    const contextStr = event.job_id ? ` [job:${event.job_id}]` : 
                       event.workflow_id ? ` [workflow:${event.workflow_id}]` : '';
    console.log(`${prefix}${contextStr} ${event.message}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Query logs from the service
   */
  async query(options = {}) {
    const query = {
      start_time: options.startTime,
      end_time: options.endTime,
      levels: options.levels,
      sources: options.sources,
      job_id: options.jobId,
      workflow_id: options.workflowId,
      mapping_id: options.mappingId,
      project_id: options.projectId,
      execution_id: options.executionId,
      search_text: options.searchText,
      limit: options.limit || 100,
      offset: options.offset || 0,
      sort_desc: options.sortDesc !== false
    };
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/logs/query`, query, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      console.error('[LogClient] Query failed:', error.message);
      throw error;
    }
  }

  /**
   * Search logs using full-text search
   */
  async search(text, options = {}) {
    return this.query({ ...options, searchText: text });
  }

  /**
   * Get logs for a specific job
   */
  async getJobLogs(jobId, options = {}) {
    return this.query({ ...options, jobId });
  }

  /**
   * Get logs for a specific workflow execution
   */
  async getWorkflowLogs(workflowId, options = {}) {
    return this.query({ ...options, workflowId });
  }

  /**
   * Get logs for a specific execution
   */
  async getExecutionLogs(executionId, options = {}) {
    return this.query({ ...options, executionId });
  }

  /**
   * Get service statistics
   */
  async getStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/stats`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('[LogClient] Failed to get stats:', error.message);
      throw error;
    }
  }

  /**
   * Get segment information
   */
  async getSegments() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/segments`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('[LogClient] Failed to get segments:', error.message);
      throw error;
    }
  }

  /**
   * Convenience logging methods
   */
  trace(source, message, context = {}) {
    return this.log('trace', source, message, context);
  }

  debug(source, message, context = {}) {
    return this.log('debug', source, message, context);
  }

  info(source, message, context = {}) {
    return this.log('info', source, message, context);
  }

  warn(source, message, context = {}) {
    return this.log('warn', source, message, context);
  }

  error(source, message, context = {}) {
    return this.log('error', source, message, context);
  }

  fatal(source, message, context = {}) {
    return this.log('fatal', source, message, context);
  }

  /**
   * Job execution logging helpers
   */
  jobStart(jobId, mappingName, context = {}) {
    return this.info('job_execution', `Starting job: ${mappingName}`, {
      ...context,
      jobId,
      stepName: 'start'
    });
  }

  jobProgress(jobId, step, rowsProcessed, context = {}) {
    return this.info('job_execution', `Processing: ${step}`, {
      ...context,
      jobId,
      stepName: step,
      rowsProcessed
    });
  }

  jobComplete(jobId, rowsProcessed, durationMs, context = {}) {
    return this.info('job_execution', `Job completed successfully`, {
      ...context,
      jobId,
      stepName: 'complete',
      rowsProcessed,
      durationMs
    });
  }

  jobError(jobId, error, context = {}) {
    return this.error('job_execution', `Job failed: ${error.message || error}`, {
      ...context,
      jobId,
      stepName: 'error',
      errorCode: error.code || 'UNKNOWN',
      stackTrace: error.stack
    });
  }

  /**
   * Workflow execution logging helpers
   */
  workflowStart(workflowId, workflowName, executionId, context = {}) {
    return this.info('workflow_execution', `Starting workflow: ${workflowName}`, {
      ...context,
      workflowId,
      executionId,
      stepName: 'start'
    });
  }

  workflowStepStart(workflowId, executionId, stepName, context = {}) {
    return this.info('workflow_execution', `Starting step: ${stepName}`, {
      ...context,
      workflowId,
      executionId,
      stepName
    });
  }

  workflowStepComplete(workflowId, executionId, stepName, durationMs, context = {}) {
    return this.info('workflow_execution', `Step completed: ${stepName}`, {
      ...context,
      workflowId,
      executionId,
      stepName,
      durationMs
    });
  }

  workflowComplete(workflowId, executionId, durationMs, context = {}) {
    return this.info('workflow_execution', `Workflow completed successfully`, {
      ...context,
      workflowId,
      executionId,
      stepName: 'complete',
      durationMs
    });
  }

  workflowError(workflowId, executionId, error, context = {}) {
    return this.error('workflow_execution', `Workflow failed: ${error.message || error}`, {
      ...context,
      workflowId,
      executionId,
      stepName: 'error',
      errorCode: error.code || 'UNKNOWN',
      stackTrace: error.stack
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.stopFlushTimer();
    await this.flush();
    console.log('[LogClient] Shutdown complete');
  }
}

let defaultClient = null;

function getLogClient(options) {
  if (!defaultClient) {
    defaultClient = new LogServiceClient(options);
  }
  return defaultClient;
}

module.exports = {
  LogServiceClient,
  getLogClient
};
