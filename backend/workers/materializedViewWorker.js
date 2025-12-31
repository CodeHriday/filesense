/**
 * Materialized View Refresh Worker
 * 
 * Periodically refreshes materialized views to keep dashboard metrics current.
 * Uses CONCURRENTLY refresh to avoid blocking reads during refresh.
 * 
 * Refresh intervals can be configured per view based on data freshness requirements.
 */

const { query: dbQuery } = require('../config/database');
const { systemLogger } = require('../utils/logger');

// View refresh configurations
const VIEW_CONFIGS = {
  mv_dashboard_summary: {
    refreshInterval: 5 * 60 * 1000, // 5 minutes
    priority: 1,
    description: 'Dashboard summary metrics'
  },
  mv_job_trends_hourly: {
    refreshInterval: 15 * 60 * 1000, // 15 minutes
    priority: 2,
    description: 'Hourly job execution trends'
  },
  mv_file_processing_summary: {
    refreshInterval: 30 * 60 * 1000, // 30 minutes
    priority: 3,
    description: 'Daily file processing metrics'
  }
};

// Track last refresh times
const lastRefreshTimes = {};

/**
 * Refresh a single materialized view
 * @param {string} viewName - Name of the materialized view
 * @param {boolean} concurrent - Use CONCURRENTLY (non-blocking)
 * @returns {Promise<Object>} - Refresh result
 */
async function refreshView(viewName, concurrent = true) {
  const startTime = Date.now();
  
  try {
    // Check if view exists
    const viewCheck = await dbQuery(`
      SELECT EXISTS (
        SELECT FROM pg_matviews 
        WHERE matviewname = $1
      );
    `, [viewName]);

    if (!viewCheck.rows[0].exists) {
      return {
        viewName,
        success: false,
        error: 'View does not exist',
        duration: Date.now() - startTime
      };
    }

    // Refresh the view
    const refreshSQL = concurrent 
      ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`
      : `REFRESH MATERIALIZED VIEW ${viewName}`;
    
    await dbQuery(refreshSQL);
    
    const duration = Date.now() - startTime;
    lastRefreshTimes[viewName] = Date.now();

    systemLogger?.info?.(`Refreshed materialized view: ${viewName}`, { duration });

    return {
      viewName,
      success: true,
      duration,
      refreshedAt: new Date().toISOString()
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    
    // If concurrent refresh fails (no unique index), try regular refresh
    if (error.message.includes('cannot refresh') && concurrent) {
      systemLogger?.warn?.(`Concurrent refresh failed for ${viewName}, trying regular refresh`);
      return refreshView(viewName, false);
    }

    systemLogger?.error?.(`Error refreshing view ${viewName}`, { 
      error: error.message,
      duration 
    });

    return {
      viewName,
      success: false,
      error: error.message,
      duration
    };
  }
}

/**
 * Refresh all materialized views that are due
 * @returns {Promise<Array>} - Array of refresh results
 */
async function refreshDueViews() {
  const results = [];
  const now = Date.now();

  for (const [viewName, config] of Object.entries(VIEW_CONFIGS)) {
    const lastRefresh = lastRefreshTimes[viewName] || 0;
    const timeSinceRefresh = now - lastRefresh;

    if (timeSinceRefresh >= config.refreshInterval) {
      const result = await refreshView(viewName);
      results.push(result);
    }
  }

  return results;
}

/**
 * Refresh all materialized views immediately
 * @returns {Promise<Array>} - Array of refresh results
 */
async function refreshAllViews() {
  const results = [];

  // Sort by priority
  const sortedViews = Object.entries(VIEW_CONFIGS)
    .sort((a, b) => a[1].priority - b[1].priority);

  for (const [viewName] of sortedViews) {
    const result = await refreshView(viewName);
    results.push(result);
  }

  return results;
}

/**
 * Get view refresh status
 * @returns {Object} - Status of all views
 */
function getViewStatus() {
  const now = Date.now();
  const status = {};

  for (const [viewName, config] of Object.entries(VIEW_CONFIGS)) {
    const lastRefresh = lastRefreshTimes[viewName];
    const timeSinceRefresh = lastRefresh ? now - lastRefresh : null;
    const isDue = !lastRefresh || timeSinceRefresh >= config.refreshInterval;

    status[viewName] = {
      description: config.description,
      refreshInterval: config.refreshInterval,
      lastRefresh: lastRefresh ? new Date(lastRefresh).toISOString() : null,
      timeSinceRefresh,
      isDue,
      nextRefreshIn: isDue ? 0 : config.refreshInterval - timeSinceRefresh
    };
  }

  return status;
}

// Worker interval ID for cleanup
let workerInterval = null;

/**
 * Start the materialized view refresh worker
 * @param {number} checkInterval - How often to check for due views (default: 1 minute)
 */
function startWorker(checkInterval = 60 * 1000) {
  if (workerInterval) {
    console.log('Materialized view worker already running');
    return;
  }

  console.log('Starting materialized view refresh worker...');
  systemLogger?.info?.('Materialized view worker started', { checkInterval });

  // Initial refresh on startup
  refreshAllViews()
    .then(results => {
      console.log(`Initial view refresh: ${results.filter(r => r.success).length}/${results.length} successful`);
    })
    .catch(err => {
      console.error('Error during initial view refresh:', err);
    });

  // Set up periodic check
  workerInterval = setInterval(async () => {
    try {
      const results = await refreshDueViews();
      if (results.length > 0) {
        console.log(`View refresh check: ${results.filter(r => r.success).length}/${results.length} refreshed`);
      }
    } catch (error) {
      systemLogger?.error?.('Error in view refresh worker', { error: error.message });
    }
  }, checkInterval);

  return workerInterval;
}

/**
 * Stop the materialized view refresh worker
 */
function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('Materialized view worker stopped');
    systemLogger?.info?.('Materialized view worker stopped');
  }
}

/**
 * Get database table and index statistics
 * @returns {Promise<Object>} - Table and index stats
 */
async function getDatabaseStats() {
  try {
    // Get table sizes
    const tableSizes = await dbQuery(`
      SELECT
        relname as table_name,
        reltuples::BIGINT as row_estimate,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_size_pretty(pg_indexes_size(relid)) as index_size,
        pg_size_pretty(pg_relation_size(relid)) as table_size
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 20
    `);

    // Get index usage
    const indexUsage = await dbQuery(`
      SELECT
        schemaname,
        relname as table_name,
        indexrelname as index_name,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 20
    `);

    // Get cache hit ratio
    const cacheStats = await dbQuery(`
      SELECT 
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        CASE 
          WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
          ELSE sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))
        END as cache_hit_ratio
      FROM pg_statio_user_tables
    `);

    return {
      tableSizes: tableSizes.rows,
      indexUsage: indexUsage.rows,
      cacheHitRatio: parseFloat(cacheStats.rows[0]?.cache_hit_ratio || 0),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    systemLogger?.error?.('Error getting database stats', { error: error.message });
    return { error: error.message };
  }
}

module.exports = {
  refreshView,
  refreshDueViews,
  refreshAllViews,
  getViewStatus,
  getDatabaseStats,
  startWorker,
  stopWorker,
  VIEW_CONFIGS
};
