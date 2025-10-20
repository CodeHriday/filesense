/**
 * File Insights API Service
 * Handles communication with the file insights backend
 */

const API_BASE = '/api/insights';

/**
 * Get list of all file patterns with statistics
 */
export const getFilePatterns = async (limit = 100, offset = 0) => {
  const response = await fetch(
    `${API_BASE}/file-patterns?limit=${limit}&offset=${offset}`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch file patterns');
  }
  
  return response.json();
};

/**
 * Get time-series metrics for a specific file pattern
 * @param {string} pattern - File pattern (e.g., "orders*.csv")
 * @param {string} granularity - Time granularity: 'daily', 'weekly', or 'monthly'
 * @param {string|number} range - Range in days or formatted string (e.g., "7d", "12w", "18m", "5y")
 */
export const getPatternMetrics = async (pattern, granularity = 'daily', range = 30) => {
  const encodedPattern = encodeURIComponent(pattern);
  const response = await fetch(
    `${API_BASE}/file-patterns/${encodedPattern}/metrics?granularity=${granularity}&range=${range}`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch pattern metrics');
  }
  
  return response.json();
};

/**
 * Get alerts for a specific file pattern
 */
export const getPatternAlerts = async (pattern, limit = 50) => {
  const encodedPattern = encodeURIComponent(pattern);
  const response = await fetch(
    `${API_BASE}/file-patterns/${encodedPattern}/alerts?limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch pattern alerts');
  }
  
  return response.json();
};

/**
 * Trigger daily metrics aggregation (admin only)
 */
export const aggregateMetrics = async (date = null) => {
  const response = await fetch(`${API_BASE}/aggregate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ date })
  });
  
  if (!response.ok) {
    throw new Error('Failed to aggregate metrics');
  }
  
  return response.json();
};

/**
 * Get overall insights statistics
 */
export const getInsightsStats = async () => {
  const response = await fetch(`${API_BASE}/stats`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch insights stats');
  }
  
  return response.json();
};

/**
 * Clean up old records (admin only)
 */
export const cleanupOldRecords = async () => {
  const response = await fetch(`${API_BASE}/cleanup`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to cleanup old records');
  }
  
  return response.json();
};
