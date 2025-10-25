const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');
const { executeMappingGroup } = require('./mappingGroupExecutionEngine');
const { executeNStepWorkflow } = require('./nStepWorkflowExecutionEngine');
const bulkProfilingService = require('./BulkProfilingService');
const parser = require('cron-parser');

/**
 * Cron Scheduler Service
 * Handles scheduling with cron expressions and interval-based schedules
 */

/**
 * Parse cron expression and calculate next run time
 * Uses cron-parser library for full cron syntax support
 * Supports: wildcards, ranges (1-5), lists (1,3,5), steps (star/5), weekdays, etc.
 * @param {string} cronExpression - The cron expression (5 or 6 fields)
 * @param {Date} fromDate - Starting date for calculation
 * @returns {Date} Next run time
 */
function parseAndCalculateNextRun(cronExpression, fromDate = new Date()) {
  try {
    // Parse cron expression using CronExpressionParser.parse static method
    const interval = parser.CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
      tz: 'UTC'
    });
    
    // Get next occurrence
    const nextRun = interval.next().toDate();
    
    return nextRun;
  } catch (error) {
    systemLogger.error('Error parsing cron expression', {
      cronExpression,
      error: error.message
    });
    throw new Error(`Invalid cron expression: ${cronExpression}. ${error.message}`);
  }
}

/**
 * Calculate next run time for interval-based schedule
 * NOTE: Uses naive calendar math - may drift across DST transitions
 * TODO: Implement timezone-aware arithmetic using luxon/temporal for production use
 * @param {number} intervalValue - The interval value
 * @param {string} intervalUnit - The interval unit (minute, hour, day, week, month, year)
 * @param {Date} fromDate - Starting date for calculation
 * @returns {Date} Next run time
 */
function calculateIntervalNextRun(intervalValue, intervalUnit, fromDate = new Date()) {
  const nextRun = new Date(fromDate);
  
  switch (intervalUnit) {
    case 'minute':
      nextRun.setMinutes(nextRun.getMinutes() + intervalValue);
      break;
    case 'hour':
      nextRun.setHours(nextRun.getHours() + intervalValue);
      break;
    case 'day':
      nextRun.setDate(nextRun.getDate() + intervalValue);
      break;
    case 'week':
      nextRun.setDate(nextRun.getDate() + (intervalValue * 7));
      break;
    case 'month':
      nextRun.setMonth(nextRun.getMonth() + intervalValue);
      break;
    case 'year':
      nextRun.setFullYear(nextRun.getFullYear() + intervalValue);
      break;
    default:
      throw new Error(`Invalid interval unit: ${intervalUnit}`);
  }
  
  return nextRun;
}

/**
 * Create a schedule for an entity
 * @param {Object} scheduleData - Schedule configuration
 * @returns {Promise<Object>} Created schedule
 */
async function createSchedule(scheduleData) {
  const {
    entity_type,
    entity_id,
    schedule_name,
    schedule_type,
    cron_expression,
    interval_value,
    interval_unit,
    timezone = 'UTC',
    created_by,
    is_active = true
  } = scheduleData;
  
  try {
    // Calculate next run time
    let nextRun;
    if (schedule_type === 'cron') {
      nextRun = parseAndCalculateNextRun(cron_expression);
    } else if (schedule_type === 'interval') {
      nextRun = calculateIntervalNextRun(interval_value, interval_unit);
    } else {
      throw new Error(`Invalid schedule type: ${schedule_type}`);
    }
    
    // Create schedule record
    const result = await pool.query(`
      INSERT INTO schedules 
      (entity_type, entity_id, schedule_name, schedule_type, cron_expression, 
       interval_value, interval_unit, timezone, next_run, created_by, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      entity_type,
      String(entity_id),
      schedule_name,
      schedule_type,
      cron_expression || null,
      interval_value || null,
      interval_unit || null,
      timezone,
      nextRun,
      created_by,
      is_active
    ]);
    
    systemLogger.info('Schedule created', {
      scheduleId: result.rows[0].id,
      entityType: entity_type,
      entityId: entity_id,
      scheduleType: schedule_type,
      nextRun
    });
    
    return {
      success: true,
      schedule: result.rows[0]
    };
  } catch (error) {
    systemLogger.error('Error creating schedule', {
      scheduleData,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get all schedules for an entity
 * @param {string} entityType - Type of entity (mapping, mapping_group, workflow)
 * @param {string} entityId - ID of the entity
 * @returns {Promise<Array>} List of schedules
 */
async function getEntitySchedules(entityType, entityId) {
  try {
    const result = await pool.query(`
      SELECT * FROM schedules
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
    `, [entityType, String(entityId)]);
    
    return {
      success: true,
      schedules: result.rows
    };
  } catch (error) {
    systemLogger.error('Error fetching entity schedules', {
      entityType,
      entityId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update a schedule
 * @param {number} scheduleId - Schedule ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated schedule
 */
async function updateSchedule(scheduleId, updates) {
  try {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });
    
    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(scheduleId);
    
    const result = await pool.query(`
      UPDATE schedules
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }
    
    systemLogger.info('Schedule updated', {
      scheduleId,
      updates
    });
    
    return {
      success: true,
      schedule: result.rows[0]
    };
  } catch (error) {
    systemLogger.error('Error updating schedule', {
      scheduleId,
      updates,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a schedule
 * @param {number} scheduleId - Schedule ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteSchedule(scheduleId) {
  try {
    const result = await pool.query(`
      DELETE FROM schedules WHERE id = $1 RETURNING *
    `, [scheduleId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }
    
    systemLogger.info('Schedule deleted', { scheduleId });
    
    return {
      success: true,
      deleted: result.rows[0]
    };
  } catch (error) {
    systemLogger.error('Error deleting schedule', {
      scheduleId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Process due schedules
 * Should be called periodically (e.g., every minute) by a cron job
 * @returns {Promise<Object>} Processing result
 */
async function processDueSchedules() {
  try {
    const now = new Date();
    
    // Fetch all active schedules that are due
    const result = await pool.query(`
      SELECT * FROM schedules
      WHERE is_active = true AND next_run <= $1
      ORDER BY next_run ASC
    `, [now]);
    
    const dueSchedules = result.rows;
    
    if (dueSchedules.length === 0) {
      return {
        success: true,
        processed: 0,
        schedules: []
      };
    }
    
    systemLogger.info('Processing due schedules', {
      count: dueSchedules.length
    });
    
    const results = [];
    
    for (const schedule of dueSchedules) {
      try {
        // Execute the scheduled entity with schedule creator's userId
        // Use null if no created_by (system will handle it as automated execution)
        const userId = schedule.created_by || null;
        let executionResult;
        
        if (schedule.entity_type === 'mapping') {
          executionResult = await executeTransformationJob(
            parseInt(schedule.entity_id),
            userId
          );
        } else if (schedule.entity_type === 'mapping_group') {
          executionResult = await executeMappingGroup(
            parseInt(schedule.entity_id),
            null,
            userId
          );
        } else if (schedule.entity_type === 'workflow') {
          executionResult = await executeNStepWorkflow(
            parseInt(schedule.entity_id),
            userId
          );
        } else if (schedule.entity_type === 'bulk_profiling_job') {
          // Start the bulk profiling job
          executionResult = await bulkProfilingService.startJob(
            schedule.entity_id,
            userId
          );
        } else {
          throw new Error(`Unknown entity type: ${schedule.entity_type}`);
        }
        
        // Calculate next run time
        let nextRun;
        if (schedule.schedule_type === 'cron') {
          nextRun = parseAndCalculateNextRun(schedule.cron_expression, now);
        } else if (schedule.schedule_type === 'interval') {
          nextRun = calculateIntervalNextRun(
            schedule.interval_value,
            schedule.interval_unit,
            now
          );
        }
        
        // Update schedule with last run and next run
        await pool.query(`
          UPDATE schedules
          SET last_run = $1, next_run = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [now, nextRun, schedule.id]);
        
        results.push({
          scheduleId: schedule.id,
          entityType: schedule.entity_type,
          entityId: schedule.entity_id,
          success: true,
          executionResult
        });
        
      } catch (error) {
        systemLogger.error('Error executing scheduled entity', {
          scheduleId: schedule.id,
          entityType: schedule.entity_type,
          entityId: schedule.entity_id,
          error: error.message
        });
        
        results.push({
          scheduleId: schedule.id,
          entityType: schedule.entity_type,
          entityId: schedule.entity_id,
          success: false,
          error: error.message
        });
      }
    }
    
    return {
      success: true,
      processed: dueSchedules.length,
      schedules: results
    };
    
  } catch (error) {
    systemLogger.error('Error processing due schedules', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createSchedule,
  getEntitySchedules,
  updateSchedule,
  deleteSchedule,
  processDueSchedules,
  parseAndCalculateNextRun,
  calculateIntervalNextRun
};
