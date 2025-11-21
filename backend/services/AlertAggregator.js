/**
 * Alert Aggregator Service
 * 
 * Collects alert events and consolidates them for efficient email delivery.
 * Uses Redis for high-performance queuing with database fallback.
 * 
 * Architecture:
 * - Redis Queue: In-memory event collection with TTL-based expiration
 * - Database Fallback: Persistent storage when Redis unavailable
 * - Consolidation Window: Groups events by policy + time window
 * - Flush Triggers: TTL expiration or workflow completion
 */

const Redis = require('ioredis');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

class AlertAggregator {
  constructor() {
    this.redis = null;
    this.redisAvailable = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity; // Infinite retries with exponential backoff
    
    // Default consolidation window: 5 minutes
    this.DEFAULT_CONSOLIDATION_WINDOW_SECONDS = 300;
    
    // Default TTL for aggregated events in Redis: 30 minutes
    this.DEFAULT_TTL_SECONDS = 1800;
    
    // Redis key prefixes
    this.QUEUE_PREFIX = 'alert_events:';
    this.AGGREGATION_PREFIX = 'alert_aggregation:';
    
    // Initialize Redis connection
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection with graceful degradation
   */
  initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 10) {
            // After 10 retries, switch to database fallback
            systemLogger.warn('Redis connection failed after 10 retries, using database fallback');
            this.redisAvailable = false;
            return null; // Stop retrying
          }
          // Exponential backoff: 2^times * 100ms
          const delay = Math.min(Math.pow(2, times) * 100, 30000);
          systemLogger.info(`Redis retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          systemLogger.error('Redis connection error', { error: err.message });
          return true; // Try to reconnect
        }
      });

      this.redis.on('connect', () => {
        systemLogger.info('Redis connected successfully for alert aggregation');
        this.redisAvailable = true;
        this.reconnectAttempts = 0;
      });

      this.redis.on('ready', () => {
        systemLogger.info('Redis ready for alert aggregation');
        this.redisAvailable = true;
      });

      this.redis.on('error', (err) => {
        systemLogger.warn('Redis error, falling back to database', { error: err.message });
        this.redisAvailable = false;
      });

      this.redis.on('close', () => {
        systemLogger.warn('Redis connection closed, using database fallback');
        this.redisAvailable = false;
      });
    } catch (error) {
      systemLogger.error('Failed to initialize Redis for alert aggregation', {
        error: error.message
      });
      this.redisAvailable = false;
    }
  }

  /**
   * Add alert event to aggregation queue
   * @param {Object} event - { policyId, eventType, entityId, entityType, status, metadata }
   * @returns {Promise<string>} - Event ID
   */
  async addEvent(event) {
    try {
      const {
        policyId,
        eventType,
        entityId,
        entityType,
        status,
        metadata = {}
      } = event;

      // Validate required fields
      if (!policyId || !eventType || !entityId || !entityType) {
        throw new Error('Missing required event fields: policyId, eventType, entityId, entityType');
      }

      const eventId = `${entityType}_${entityId}_${Date.now()}`;
      const eventData = {
        eventId,
        policyId,
        eventType,
        entityId,
        entityType,
        status: status || 'unknown',
        metadata,
        timestamp: new Date().toISOString()
      };

      if (this.redisAvailable) {
        await this.addEventToRedis(policyId, eventData);
      } else {
        await this.addEventToDatabase(policyId, eventData);
      }

      systemLogger.info('Alert event added to aggregation queue', {
        eventId,
        policyId,
        entityType,
        entityId,
        backend: this.redisAvailable ? 'redis' : 'database'
      });

      return eventId;
    } catch (error) {
      systemLogger.error('Error adding alert event to aggregation queue', {
        event,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add event to Redis queue
   * @private
   */
  async addEventToRedis(policyId, eventData) {
    try {
      const aggregationKey = `${this.AGGREGATION_PREFIX}${policyId}`;
      
      // Add event to Redis list
      await this.redis.lpush(aggregationKey, JSON.stringify(eventData));
      
      // Set TTL if not already set
      const ttl = await this.redis.ttl(aggregationKey);
      if (ttl === -1) {
        await this.redis.expire(aggregationKey, this.DEFAULT_TTL_SECONDS);
      }
    } catch (error) {
      systemLogger.error('Error adding event to Redis', { error: error.message });
      // Fallback to database
      this.redisAvailable = false;
      await this.addEventToDatabase(policyId, eventData);
    }
  }

  /**
   * Add event to database (fallback)
   * @private
   */
  async addEventToDatabase(policyId, eventData) {
    try {
      const query = `
        INSERT INTO alert_aggregation (
          policy_id,
          event_data,
          created_at,
          expires_at
        ) VALUES ($1, $2, NOW(), NOW() + INTERVAL '${this.DEFAULT_TTL_SECONDS} seconds')
      `;
      
      await pool.query(query, [
        policyId,
        eventData
      ]);
    } catch (error) {
      systemLogger.error('Error adding event to database', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all events for a policy
   * @param {string} policyId - Policy ID
   * @returns {Promise<Array>} - Array of events
   */
  async getEvents(policyId) {
    try {
      if (this.redisAvailable) {
        return await this.getEventsFromRedis(policyId);
      } else {
        return await this.getEventsFromDatabase(policyId);
      }
    } catch (error) {
      systemLogger.error('Error getting events for policy', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get events from Redis (with database fallback merge)
   * @private
   */
  async getEventsFromRedis(policyId) {
    try {
      const aggregationKey = `${this.AGGREGATION_PREFIX}${policyId}`;
      const eventStrings = await this.redis.lrange(aggregationKey, 0, -1);
      const redisEvents = eventStrings.map(str => JSON.parse(str));
      
      // Also check database for orphaned events from previous fallback
      const dbEvents = await this.getEventsFromDatabase(policyId);
      
      // Merge and deduplicate by eventId
      const eventMap = new Map();
      [...redisEvents, ...dbEvents].forEach(event => {
        if (!eventMap.has(event.eventId)) {
          eventMap.set(event.eventId, event);
        }
      });
      
      return Array.from(eventMap.values());
    } catch (error) {
      systemLogger.error('Error getting events from Redis', { error: error.message });
      // Fallback to database only
      this.redisAvailable = false;
      return await this.getEventsFromDatabase(policyId);
    }
  }

  /**
   * Get events from database (fallback)
   * @private
   */
  async getEventsFromDatabase(policyId) {
    try {
      const query = `
        SELECT event_data, created_at
        FROM alert_aggregation
        WHERE policy_id = $1
          AND expires_at > NOW()
        ORDER BY created_at DESC
      `;
      
      const result = await pool.query(query, [policyId]);
      return result.rows.map(row => row.event_data);
    } catch (error) {
      systemLogger.error('Error getting events from database', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Flush events for a policy and trigger consolidated alert
   * @param {string} policyId - Policy ID
   * @param {string} reason - Flush reason ('ttl_expired', 'workflow_completed', 'manual')
   * @returns {Promise<Array>} - Flushed events
   */
  async flushEvents(policyId, reason = 'manual') {
    try {
      const events = await this.getEvents(policyId);
      
      if (events.length === 0) {
        systemLogger.info('No events to flush for policy', { policyId, reason });
        return [];
      }

      // Clear events from BOTH backends to prevent duplicates
      // (getEvents merges both, so we must clear both)
      await Promise.allSettled([
        this.clearEventsFromRedis(policyId),
        this.clearEventsFromDatabase(policyId)
      ]);

      systemLogger.info('Flushed alert events for policy', {
        policyId,
        eventCount: events.length,
        reason,
        backend: this.redisAvailable ? 'redis+database' : 'database'
      });

      return events;
    } catch (error) {
      systemLogger.error('Error flushing events for policy', {
        policyId,
        reason,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clear events from Redis
   * @private
   */
  async clearEventsFromRedis(policyId) {
    try {
      if (!this.redisAvailable) {
        return; // Skip if Redis unavailable
      }
      
      const aggregationKey = `${this.AGGREGATION_PREFIX}${policyId}`;
      await this.redis.del(aggregationKey);
    } catch (error) {
      systemLogger.warn('Error clearing events from Redis (non-fatal)', {
        policyId,
        error: error.message
      });
      // Don't throw - this is cleanup, other backend will be cleared
    }
  }

  /**
   * Clear events from database
   * @private
   */
  async clearEventsFromDatabase(policyId) {
    try {
      const query = `
        DELETE FROM alert_aggregation
        WHERE policy_id = $1
      `;
      
      await pool.query(query, [policyId]);
    } catch (error) {
      systemLogger.warn('Error clearing events from database (non-fatal)', {
        policyId,
        error: error.message
      });
      // Don't throw - this is cleanup, other backend will be cleared
    }
  }

  /**
   * Check for expired aggregations and flush them from BOTH backends
   * @returns {Promise<Array>} - Array of { policyId, events } for flushed aggregations
   */
  async flushExpiredAggregations() {
    try {
      const flushedPolicies = new Set(); // Track flushed policies to avoid duplicates
      const flushedAggregations = [];

      // Check Redis for expired keys (if available)
      if (this.redisAvailable) {
        try {
          const pattern = `${this.AGGREGATION_PREFIX}*`;
          const keys = await this.redis.keys(pattern);
          
          for (const key of keys) {
            const ttl = await this.redis.ttl(key);
            
            // Flush if TTL is less than 60 seconds (about to expire)
            if (ttl > 0 && ttl < 60) {
              const policyId = key.replace(this.AGGREGATION_PREFIX, '');
              flushedPolicies.add(policyId);
              
              const events = await this.flushEvents(policyId, 'ttl_expired');
              
              if (events.length > 0) {
                flushedAggregations.push({ policyId, events });
              }
            }
          }
        } catch (error) {
          systemLogger.warn('Error checking Redis for expired aggregations', {
            error: error.message
          });
        }
      }

      // ALWAYS check database for expired aggregations (even if Redis is available)
      // This ensures events from previous Redis outages are flushed
      try {
        const query = `
          SELECT DISTINCT policy_id
          FROM alert_aggregation
          WHERE expires_at <= NOW() + INTERVAL '60 seconds'
        `;
        
        const result = await pool.query(query);
        
        for (const row of result.rows) {
          // Skip if already flushed from Redis
          if (flushedPolicies.has(row.policy_id)) {
            continue;
          }
          
          flushedPolicies.add(row.policy_id);
          const events = await this.flushEvents(row.policy_id, 'ttl_expired');
          
          if (events.length > 0) {
            flushedAggregations.push({ policyId: row.policy_id, events });
          }
        }
      } catch (error) {
        systemLogger.error('Error checking database for expired aggregations', {
          error: error.message
        });
      }

      if (flushedAggregations.length > 0) {
        systemLogger.info('Flushed expired alert aggregations from both backends', {
          count: flushedAggregations.length,
          backends: 'redis+database'
        });
      }

      return flushedAggregations;
    } catch (error) {
      systemLogger.error('Error flushing expired aggregations', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get aggregation status for a policy
   * @param {string} policyId - Policy ID
   * @returns {Promise<Object>} - { eventCount, oldestEvent, newestEvent, ttlSeconds }
   */
  async getAggregationStatus(policyId) {
    try {
      const events = await this.getEvents(policyId);
      
      if (events.length === 0) {
        return {
          eventCount: 0,
          oldestEvent: null,
          newestEvent: null,
          ttlSeconds: null
        };
      }

      const timestamps = events.map(e => new Date(e.timestamp));
      const oldestEvent = new Date(Math.min(...timestamps));
      const newestEvent = new Date(Math.max(...timestamps));

      let ttlSeconds = null;
      if (this.redisAvailable) {
        const aggregationKey = `${this.AGGREGATION_PREFIX}${policyId}`;
        ttlSeconds = await this.redis.ttl(aggregationKey);
      }

      return {
        eventCount: events.length,
        oldestEvent,
        newestEvent,
        ttlSeconds,
        backend: this.redisAvailable ? 'redis' : 'database'
      };
    } catch (error) {
      systemLogger.error('Error getting aggregation status', {
        policyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Gracefully shutdown and cleanup
   */
  async shutdown() {
    try {
      if (this.redis) {
        await this.redis.quit();
        systemLogger.info('Alert aggregator Redis connection closed');
      }
    } catch (error) {
      systemLogger.error('Error shutting down alert aggregator', {
        error: error.message
      });
    }
  }
}

module.exports = new AlertAggregator();
