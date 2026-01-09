/**
 * Memory Monitoring and Circuit Breaker System
 * 
 * Prevents system crashes from memory exhaustion by:
 * - Real-time memory tracking
 * - Circuit breaker pattern (reject requests when memory high)
 * - Automatic recovery
 * - Configurable thresholds
 * 
 * Cloud-ready: Works in any environment (Replit, AWS, GCP)
 */

const os = require('os');

// Alert callback for memory circuit breaker trips
let alertCallback = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 300000; // 5 minutes between alerts

// Configuration from environment variables
const MAX_MEMORY_PERCENT = parseInt(process.env.MAX_MEMORY_PERCENT) || 85;
const WARNING_MEMORY_PERCENT = parseInt(process.env.WARNING_MEMORY_PERCENT) || 75;
const CIRCUIT_BREAKER_RECOVERY_PERCENT = parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_PERCENT) || 70;
const MEMORY_CHECK_INTERVAL = parseInt(process.env.MEMORY_CHECK_INTERVAL) || 5000; // 5 seconds

// Circuit breaker state
let circuitBreakerOpen = false;
let lastMemoryCheck = null;
let memoryStats = {
  current: 0,
  peak: 0,
  checks: 0,
  breaker_trips: 0
};

/**
 * Get current memory usage statistics
 * @returns {Object} Memory statistics
 */
function getMemoryUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercent = (usedMemory / totalMemory) * 100;
  
  // Process-specific memory
  const processMemory = process.memoryUsage();
  
  return {
    total_mb: Math.round(totalMemory / 1024 / 1024),
    used_mb: Math.round(usedMemory / 1024 / 1024),
    free_mb: Math.round(freeMemory / 1024 / 1024),
    usage_percent: Math.round(usagePercent * 100) / 100,
    process_heap_mb: Math.round(processMemory.heapUsed / 1024 / 1024),
    process_rss_mb: Math.round(processMemory.rss / 1024 / 1024),
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if memory usage is within safe limits
 * @returns {Object} Status and details
 */
function checkMemoryStatus() {
  const usage = getMemoryUsage();
  memoryStats.current = usage.usage_percent;
  memoryStats.checks++;
  
  // Update peak memory
  if (usage.usage_percent > memoryStats.peak) {
    memoryStats.peak = usage.usage_percent;
  }
  
  lastMemoryCheck = usage;
  
  // Determine status
  let status = 'ok';
  let action = 'none';
  
  if (usage.usage_percent >= MAX_MEMORY_PERCENT) {
    status = 'critical';
    action = 'reject';
    
    if (!circuitBreakerOpen) {
      circuitBreakerOpen = true;
      memoryStats.breaker_trips++;
      console.warn(`🔴 CIRCUIT BREAKER OPENED: Memory at ${usage.usage_percent}%`);
      
      // Send alert if callback is configured and cooldown has passed
      const now = Date.now();
      if (alertCallback && (now - lastAlertTime) > ALERT_COOLDOWN_MS) {
        lastAlertTime = now;
        try {
          alertCallback({
            type: 'memory_critical',
            message: `Circuit breaker opened: Memory at ${usage.usage_percent}%`,
            usage,
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          console.error('Failed to send memory alert:', err.message);
        }
      }
    }
  } else if (usage.usage_percent >= WARNING_MEMORY_PERCENT) {
    status = 'warning';
    action = 'warn';
  } else if (usage.usage_percent <= CIRCUIT_BREAKER_RECOVERY_PERCENT && circuitBreakerOpen) {
    circuitBreakerOpen = false;
    console.log(`🟢 CIRCUIT BREAKER CLOSED: Memory recovered to ${usage.usage_percent}%`);
  }
  
  return {
    status,
    action,
    usage,
    circuit_breaker_open: circuitBreakerOpen,
    thresholds: {
      warning: WARNING_MEMORY_PERCENT,
      critical: MAX_MEMORY_PERCENT,
      recovery: CIRCUIT_BREAKER_RECOVERY_PERCENT
    }
  };
}

/**
 * Express middleware for circuit breaker
 * Rejects requests when memory usage is critical
 */
function circuitBreakerMiddleware(req, res, next) {
  const status = checkMemoryStatus();
  
  if (status.circuit_breaker_open) {
    const retryAfter = 30; // seconds
    
    res.status(503).header('Retry-After', retryAfter).json({
      error: 'Service temporarily unavailable',
      reason: 'High memory usage - circuit breaker active',
      memory_usage_percent: status.usage.usage_percent,
      retry_after_seconds: retryAfter,
      details: 'The system is experiencing high memory usage. Please try again in a few moments.'
    });
    
    return;
  }
  
  // Add memory info to request for logging
  req.memoryUsage = status.usage;
  
  next();
}

/**
 * Memory monitoring middleware - logs warnings but doesn't reject
 */
function memoryMonitoringMiddleware(req, res, next) {
  const status = checkMemoryStatus();
  
  if (status.status === 'warning') {
    console.warn(`⚠️  Memory usage high: ${status.usage.usage_percent}% (threshold: ${WARNING_MEMORY_PERCENT}%)`);
  }
  
  // Add to request for logging
  req.memoryUsage = status.usage;
  
  next();
}

/**
 * Get memory statistics and circuit breaker status
 * @returns {Object} Statistics
 */
function getStats() {
  return {
    ...memoryStats,
    circuit_breaker_open: circuitBreakerOpen,
    last_check: lastMemoryCheck,
    thresholds: {
      warning: WARNING_MEMORY_PERCENT,
      critical: MAX_MEMORY_PERCENT,
      recovery: CIRCUIT_BREAKER_RECOVERY_PERCENT
    }
  };
}

/**
 * Force check memory and log status
 */
function logMemoryStatus() {
  const status = checkMemoryStatus();
  const emoji = status.status === 'critical' ? '🔴' : status.status === 'warning' ? '🟡' : '🟢';
  
  console.log(`${emoji} Memory: ${status.usage.usage_percent}% | Used: ${status.usage.used_mb}MB / ${status.usage.total_mb}MB | Breaker: ${circuitBreakerOpen ? 'OPEN' : 'CLOSED'}`);
}

/**
 * Start periodic memory monitoring
 * @param {number} interval - Interval in milliseconds
 */
function startMonitoring(interval = MEMORY_CHECK_INTERVAL) {
  console.log(`📊 Starting memory monitoring (interval: ${interval}ms, threshold: ${MAX_MEMORY_PERCENT}%)`);
  
  setInterval(() => {
    const status = checkMemoryStatus();
    
    // Only log if status is not ok
    if (status.status !== 'ok') {
      logMemoryStatus();
    }
  }, interval);
}

/**
 * Check if there's enough memory for an operation
 * @param {number} requiredMB - Required memory in MB
 * @returns {Object} Result with ok boolean and details
 */
function hasEnoughMemory(requiredMB) {
  const usage = getMemoryUsage();
  const availableMB = usage.free_mb;
  const currentPercent = usage.usage_percent;
  
  // Check if adding required memory would exceed threshold
  const projectedUsedMB = usage.used_mb + requiredMB;
  const projectedPercent = (projectedUsedMB / usage.total_mb) * 100;
  
  const ok = projectedPercent < MAX_MEMORY_PERCENT && availableMB > requiredMB;
  
  return {
    ok,
    available_mb: availableMB,
    required_mb: requiredMB,
    current_percent: currentPercent,
    projected_percent: Math.round(projectedPercent * 100) / 100,
    reason: ok ? 'Sufficient memory available' : 'Insufficient memory or would exceed threshold'
  };
}

/**
 * Set callback function to be called when circuit breaker trips
 * @param {Function} callback - Function that receives alert data
 */
function setAlertCallback(callback) {
  alertCallback = callback;
}

module.exports = {
  getMemoryUsage,
  checkMemoryStatus,
  circuitBreakerMiddleware,
  memoryMonitoringMiddleware,
  getStats,
  logMemoryStatus,
  startMonitoring,
  hasEnoughMemory,
  setAlertCallback,
  
  // Export for testing/debugging
  _test: {
    setCircuitBreaker: (state) => { circuitBreakerOpen = state; },
    resetStats: () => {
      memoryStats = { current: 0, peak: 0, checks: 0, breaker_trips: 0 };
    }
  }
};
