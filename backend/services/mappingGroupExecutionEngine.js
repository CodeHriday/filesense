const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');

/**
 * Mapping Group Execution Engine
 * Handles execution of mapping groups with batching and concurrency control
 */

/**
 * Execute a mapping group with batching based on max concurrency
 * @param {number} groupId - The mapping group ID
 * @param {number} maxConcurrency - Maximum number of concurrent executions
 * @param {string} triggeredBy - User ID who triggered the execution
 * @returns {Promise<Object>} Execution result
 */
async function executeMappingGroup(groupId, maxConcurrency = 10, triggeredBy = null) {
  const executionId = `GROUP-${Date.now()}-${uuidv4().substring(0, 8)}`;
  const startTime = new Date();
  
  let executionRecordId = null;
  
  try {
    // 1. Fetch group details and member mappings
    const groupQuery = await pool.query(
      'SELECT * FROM mapping_groups WHERE id = $1',
      [groupId]
    );
    
    if (groupQuery.rows.length === 0) {
      throw new Error(`Mapping group ${groupId} not found`);
    }
    
    const group = groupQuery.rows[0];
    const concurrency = maxConcurrency || group.max_concurrency || 10;
    
    // 2. Fetch all member mappings
    const membersQuery = await pool.query(`
      SELECT mgm.*, tm.mapping_name, tm.source_connection_id, tm.target_connection_id, 
             tm.source_file_pattern, tm.field_mappings, tm.mapping_id as tm_mapping_id
      FROM mapping_group_members mgm
      JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
      WHERE mgm.group_id = $1
      ORDER BY mgm.execution_order ASC, mgm.id ASC
    `, [groupId]);
    
    const mappings = membersQuery.rows;
    
    if (mappings.length === 0) {
      throw new Error(`No mappings found in group ${groupId}`);
    }
    
    systemLogger.info('Starting mapping group execution', {
      executionId,
      groupId,
      groupName: group.name,
      totalMappings: mappings.length,
      concurrency
    });
    
    // 3. Create execution record
    const execResult = await pool.query(`
      INSERT INTO mapping_group_executions 
      (group_id, execution_id, status, total_mappings, triggered_by, start_time)
      VALUES ($1, $2, 'running', $3, $4, $5)
      RETURNING id
    `, [groupId, executionId, mappings.length, triggeredBy, startTime]);
    
    executionRecordId = execResult.rows[0].id;
    
    // 4. Execute mappings in batches
    const results = [];
    let completedCount = 0;
    let failedCount = 0;
    
    // Process mappings in batches
    for (let i = 0; i < mappings.length; i += concurrency) {
      const batch = mappings.slice(i, i + concurrency);
      
      systemLogger.info('Processing batch', {
        executionId,
        batchNumber: Math.floor(i / concurrency) + 1,
        batchSize: batch.length,
        startIndex: i,
        endIndex: Math.min(i + concurrency, mappings.length)
      });
      
      // Execute batch in parallel
      const batchPromises = batch.map(async (mapping) => {
        try {
          systemLogger.info('Executing mapping in group', {
            executionId,
            mappingId: mapping.mapping_id,
            mappingName: mapping.mapping_name
          });
          
          // Execute the transformation job
          const jobResult = await executeTransformationJob(pool, mapping.mapping_id, triggeredBy);
          
          completedCount++;
          
          // Update execution progress
          await pool.query(`
            UPDATE mapping_group_executions 
            SET completed_mappings = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [completedCount, executionRecordId]);
          
          return {
            mappingId: mapping.mapping_id,
            mappingName: mapping.mapping_name,
            status: 'completed',
            jobId: jobResult.jobId
          };
          
        } catch (error) {
          failedCount++;
          
          systemLogger.error('Mapping execution failed in group', {
            executionId,
            mappingId: mapping.mapping_id,
            mappingName: mapping.mapping_name,
            error: error.message
          });
          
          // Update execution progress
          await pool.query(`
            UPDATE mapping_group_executions 
            SET failed_mappings = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [failedCount, executionRecordId]);
          
          return {
            mappingId: mapping.mapping_id,
            mappingName: mapping.mapping_name,
            status: 'failed',
            error: error.message
          };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    // 5. Calculate final statistics
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const finalStatus = failedCount > 0 ? 'completed' : 'completed'; // Always completed if it finishes
    
    // 6. Update execution record with final status
    await pool.query(`
      UPDATE mapping_group_executions
      SET status = $1,
          completed_mappings = $2,
          failed_mappings = $3,
          end_time = $4,
          duration_ms = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [finalStatus, completedCount, failedCount, endTime, durationMs, executionRecordId]);
    
    systemLogger.info('Mapping group execution completed', {
      executionId,
      groupId,
      totalMappings: mappings.length,
      completed: completedCount,
      failed: failedCount,
      durationMs
    });
    
    return {
      success: true,
      executionId,
      executionRecordId,
      groupId,
      groupName: group.name,
      totalMappings: mappings.length,
      completed: completedCount,
      failed: failedCount,
      durationMs,
      results
    };
    
  } catch (error) {
    systemLogger.error('Mapping group execution failed', {
      executionId,
      groupId,
      error: error.message,
      stack: error.stack
    });
    
    // Update execution record as failed if it was created
    if (executionRecordId) {
      const endTime = new Date();
      const durationMs = endTime - startTime;
      
      await pool.query(`
        UPDATE mapping_group_executions
        SET status = 'failed',
            error_message = $1,
            end_time = $2,
            duration_ms = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [error.message, endTime, durationMs, executionRecordId]);
    }
    
    throw error;
  }
}

/**
 * Get execution status for a mapping group
 * @param {number} executionRecordId - The execution record ID
 * @returns {Promise<Object>} Execution details
 */
async function getGroupExecutionStatus(executionRecordId) {
  try {
    const result = await pool.query(`
      SELECT mge.*, mg.name as group_name
      FROM mapping_group_executions mge
      JOIN mapping_groups mg ON mge.group_id = mg.id
      WHERE mge.id = $1
    `, [executionRecordId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Execution record ${executionRecordId} not found`);
    }
    
    return {
      success: true,
      execution: result.rows[0]
    };
  } catch (error) {
    systemLogger.error('Error fetching group execution status', {
      executionRecordId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get execution history for a mapping group
 * @param {number} groupId - The mapping group ID
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} List of executions
 */
async function getGroupExecutionHistory(groupId, limit = 50) {
  try {
    const result = await pool.query(`
      SELECT mge.*, mg.name as group_name
      FROM mapping_group_executions mge
      JOIN mapping_groups mg ON mge.group_id = mg.id
      WHERE mge.group_id = $1
      ORDER BY mge.created_at DESC
      LIMIT $2
    `, [groupId, limit]);
    
    return {
      success: true,
      executions: result.rows
    };
  } catch (error) {
    systemLogger.error('Error fetching group execution history', {
      groupId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  executeMappingGroup,
  getGroupExecutionStatus,
  getGroupExecutionHistory
};
