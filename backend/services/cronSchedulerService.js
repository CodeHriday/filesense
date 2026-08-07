const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');
const { executeMappingGroup } = require('./mappingGroupExecutionEngine');
const { executeNStepWorkflow } = require('./nStepWorkflowExecutionEngine');
// NOTE: VisualWorkflowExecutor is loaded lazily inside processDueSchedules() to avoid
// loading it before the DI container and database pool are initialized (same pattern as BulkProfilingService).
const parser = require('cron-parser');
const alertAggregationWorker = require('./AlertAggregationWorker');

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
    // Parse cron expression using CronExpressionParser
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
    project_id,
    sub_project_id,
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
       interval_value, interval_unit, timezone, next_run, project_id, sub_project_id, created_by, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
      project_id,
      sub_project_id || null,
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
 * Get all schedules for a specific entity type
 * @param {string} entityType - The entity type (e.g., 'bulk_profiling_job')
 * @returns {Promise<Object>} Schedules result
 */
async function getSchedulesByType(entityType) {
  try {
    const result = await pool.query(`
      SELECT * FROM schedules
      WHERE entity_type = $1
      ORDER BY created_at DESC
    `, [entityType]);
    
    return {
      success: true,
      schedules: result.rows
    };
  } catch (error) {
    systemLogger.error('Error fetching schedules by type', {
      entityType,
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
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Fetch current schedule with row lock
    const currentResult = await client.query(
      'SELECT * FROM schedules WHERE id = $1 FOR UPDATE',
      [scheduleId]
    );
    
    if (currentResult.rows.length === 0) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }
    
    const currentSchedule = currentResult.rows[0];
    
    // Detect if scheduling fields changed (using hasOwnProperty to catch null/empty values)
    const schedulingFieldsChanged = 
      ('cron_expression' in updates && updates.cron_expression !== currentSchedule.cron_expression) ||
      ('interval_value' in updates && updates.interval_value !== currentSchedule.interval_value) ||
      ('interval_unit' in updates && updates.interval_unit !== currentSchedule.interval_unit) ||
      ('schedule_type' in updates && updates.schedule_type !== currentSchedule.schedule_type) ||
      ('timezone' in updates && updates.timezone !== currentSchedule.timezone);
    
    // Recalculate next_run if scheduling fields changed
    if (schedulingFieldsChanged) {
      const scheduleType = 'schedule_type' in updates ? updates.schedule_type : currentSchedule.schedule_type;
      
      if (scheduleType === 'cron') {
        const cronExpression = 'cron_expression' in updates ? updates.cron_expression : currentSchedule.cron_expression;
        if (!cronExpression) {
          throw new Error('cron_expression is required for cron-type schedules');
        }
        updates.next_run = parseAndCalculateNextRun(cronExpression);
      } else if (scheduleType === 'interval') {
        const intervalValue = 'interval_value' in updates ? updates.interval_value : currentSchedule.interval_value;
        const intervalUnit = 'interval_unit' in updates ? updates.interval_unit : currentSchedule.interval_unit;
        
        // Normalize interval_value to Number to avoid string concatenation issues
        const normalizedIntervalValue = intervalValue !== null && intervalValue !== undefined ? Number(intervalValue) : null;
        
        if (!normalizedIntervalValue || !intervalUnit) {
          throw new Error('interval_value and interval_unit are required for interval-type schedules');
        }
        updates.next_run = calculateIntervalNextRun(normalizedIntervalValue, intervalUnit);
      }
      
      systemLogger.info('Recalculated next_run due to scheduling field changes', {
        scheduleId,
        scheduleType,
        nextRun: updates.next_run
      });
    }
    
    // Build UPDATE query
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
    
    const result = await client.query(`
      UPDATE schedules
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    await client.query('COMMIT');
    
    systemLogger.info('Schedule updated', {
      scheduleId,
      updates
    });
    
    return {
      success: true,
      schedule: result.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error updating schedule', {
      scheduleId,
      updates,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
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
    // Load BulkProfilingService here to avoid loading before DI container is initialized
    const bulkProfilingService = require('./BulkProfilingService');
    // Load VisualWorkflowExecutor here (not at top level) to avoid loading before the
    // DI container and database pool are initialized — same reason as BulkProfilingService.
    const { VisualWorkflowExecutor } = require('./visualWorkflowExecutor');
    
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
            userId,
            { scheduleId: schedule.id }
          );
        } else if (schedule.entity_type === 'mapping_group') {
          executionResult = await executeMappingGroup(
            parseInt(schedule.entity_id),
            null,
            userId,
            { scheduleId: schedule.id }
          );
        } else if (schedule.entity_type === 'workflow') {
          // Check if it's a visual workflow or n-step workflow
          const workflowIdInt = parseInt(schedule.entity_id);
          
          // Try to load as visual workflow first
          const visualWorkflowCheck = await pool.query(
            'SELECT id FROM visual_workflows WHERE id = $1 AND is_active = true',
            [workflowIdInt]
          );
          
          if (visualWorkflowCheck.rows.length > 0) {
            // Execute as visual workflow
            const visualExecutor = new VisualWorkflowExecutor(workflowIdInt, userId);
            executionResult = await visualExecutor.execute();
          } else {
            // Execute as n-step workflow
            executionResult = await executeNStepWorkflow(
              workflowIdInt,
              userId,
              { scheduleId: schedule.id }
            );
          }
        } else if (schedule.entity_type === 'bulk_profiling_job') {
          // Start the bulk profiling job
          executionResult = await bulkProfilingService.startJob(
            schedule.entity_id,
            userId
          );
        } else if (schedule.entity_type === 'vendor_agreement_expiration') {
          // Auto-disable expired vendor agreements
          // Use the service instance directly (it exports an instance, not a class)
          const vendorAgreementService = require('./vendorAgreementService');
          executionResult = await vendorAgreementService.autoDisableExpiredAgreements();
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
        
        // Emit alert event for successful schedule execution (fire-and-forget, non-blocking)
        setImmediate(() => {
          try {
            alertAggregationWorker.onScheduleExecuted(schedule.id, 'completed').catch(err => {
              systemLogger.warn('Failed to emit schedule execution success alert event', {
                scheduleId: schedule.id,
                error: err.message
              });
            });
          } catch (err) {
            systemLogger.warn('Error emitting schedule execution success alert event', {
              scheduleId: schedule.id,
              error: err.message
            });
          }
        });
        
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
        
        // Emit alert event for failed schedule execution (fire-and-forget, non-blocking)
        setImmediate(() => {
          try {
            alertAggregationWorker.onScheduleExecuted(schedule.id, 'failed').catch(err => {
              systemLogger.warn('Failed to emit schedule execution failure alert event', {
                scheduleId: schedule.id,
                error: err.message
              });
            });
          } catch (err) {
            systemLogger.warn('Error emitting schedule execution failure alert event', {
              scheduleId: schedule.id,
              error: err.message
            });
          }
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
  getSchedulesByType,
  updateSchedule,
  deleteSchedule,
  processDueSchedules,
  parseAndCalculateNextRun,
  calculateIntervalNextRun
};
