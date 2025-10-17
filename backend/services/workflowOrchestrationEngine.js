const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');
const { executeMappingGroup } = require('./mappingGroupExecutionEngine');

/**
 * Workflow Orchestration Engine
 * Handles execution of workflows with dependency resolution and retry logic
 */

/**
 * Build execution graph from workflow steps
 * @param {Array} steps - Workflow steps
 * @returns {Object} Execution graph with dependency information
 */
function buildExecutionGraph(steps) {
  const graph = {
    nodes: {},
    roots: [], // Steps with no dependencies
    dependents: {} // Map of step_id -> [dependent_step_ids]
  };
  
  // Build nodes
  steps.forEach(step => {
    graph.nodes[step.id] = {
      ...step,
      status: 'pending',
      retryAttempts: 0
    };
  });
  
  // Build dependency relationships
  steps.forEach(step => {
    if (!step.depends_on) {
      graph.roots.push(step.id);
    } else {
      if (!graph.dependents[step.depends_on]) {
        graph.dependents[step.depends_on] = [];
      }
      graph.dependents[step.depends_on].push(step.id);
    }
  });
  
  return graph;
}

/**
 * Execute a single workflow step with retry logic
 * @param {Object} step - The workflow step
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} retryDelay - Delay between retries in seconds
 * @param {string} triggeredBy - User who triggered execution
 * @returns {Promise<Object>} Step execution result
 */
async function executeStep(step, maxRetries = 3, retryDelay = 60, triggeredBy = null) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      systemLogger.info('Executing workflow step', {
        stepId: step.id,
        stepName: step.step_name,
        stepType: step.step_type,
        entityId: step.entity_id,
        attempt,
        maxRetries
      });
      
      let result;
      
      if (step.step_type === 'mapping') {
        // Execute single mapping
        result = await executeTransformationJob(parseInt(step.entity_id), triggeredBy);
      } else if (step.step_type === 'mapping_group') {
        // Execute mapping group
        result = await executeMappingGroup(parseInt(step.entity_id), null, triggeredBy);
      } else {
        throw new Error(`Unknown step type: ${step.step_type}`);
      }
      
      systemLogger.info('Workflow step completed successfully', {
        stepId: step.id,
        stepName: step.step_name,
        attempt
      });
      
      return {
        success: true,
        stepId: step.id,
        stepName: step.step_name,
        attempts: attempt,
        result
      };
      
    } catch (error) {
      lastError = error;
      
      systemLogger.error('Workflow step failed', {
        stepId: step.id,
        stepName: step.step_name,
        attempt,
        maxRetries,
        error: error.message
      });
      
      if (attempt < maxRetries) {
        systemLogger.info('Retrying workflow step', {
          stepId: step.id,
          stepName: step.step_name,
          nextAttempt: attempt + 1,
          delaySeconds: retryDelay
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
      }
    }
  }
  
  // All retries exhausted
  return {
    success: false,
    stepId: step.id,
    stepName: step.step_name,
    attempts: maxRetries,
    error: lastError.message
  };
}

/**
 * Execute a workflow with dependency resolution
 * @param {number} workflowId - The workflow (business_process) ID
 * @param {string} triggeredBy - User ID who triggered the execution
 * @returns {Promise<Object>} Execution result
 */
async function executeWorkflow(workflowId, triggeredBy = null) {
  const executionId = `WORKFLOW-${Date.now()}-${uuidv4().substring(0, 8)}`;
  const startTime = new Date();
  
  let executionRecordId = null;
  
  try {
    // 1. Fetch workflow details
    const workflowQuery = await pool.query(
      'SELECT * FROM business_processes WHERE id = $1',
      [workflowId]
    );
    
    if (workflowQuery.rows.length === 0) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    
    const workflow = workflowQuery.rows[0];
    
    // 2. Fetch workflow steps
    const stepsQuery = await pool.query(`
      SELECT * FROM workflow_steps
      WHERE workflow_id = $1
      ORDER BY execution_order ASC, id ASC
    `, [workflowId]);
    
    const steps = stepsQuery.rows;
    
    if (steps.length === 0) {
      throw new Error(`No steps found in workflow ${workflowId}`);
    }
    
    systemLogger.info('Starting workflow execution', {
      executionId,
      workflowId,
      workflowName: workflow.name,
      totalSteps: steps.length
    });
    
    // 3. Create execution record
    const execResult = await pool.query(`
      INSERT INTO workflow_executions 
      (workflow_id, execution_id, status, total_steps, triggered_by, start_time)
      VALUES ($1, $2, 'running', $3, $4, $5)
      RETURNING id
    `, [workflowId, executionId, steps.length, triggeredBy, startTime]);
    
    executionRecordId = execResult.rows[0].id;
    
    // 4. Build execution graph
    const graph = buildExecutionGraph(steps);
    
    // 5. Execute steps based on dependencies
    const completedSteps = new Set();
    const failedSteps = new Set();
    const stepResults = [];
    
    // Process steps level by level (topological sort)
    let currentLevel = [...graph.roots];
    
    while (currentLevel.length > 0) {
      systemLogger.info('Processing workflow level', {
        executionId,
        levelSteps: currentLevel.length,
        steps: currentLevel
      });
      
      // Execute all steps in current level in parallel
      const levelPromises = currentLevel.map(async (stepId) => {
        const step = graph.nodes[stepId];
        
        // Update current step in execution record
        await pool.query(`
          UPDATE workflow_executions
          SET current_step_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [stepId, executionRecordId]);
        
        // Execute step with retry logic
        const result = await executeStep(
          step, 
          step.retry_count || 3, 
          step.retry_delay_seconds || 60,
          triggeredBy
        );
        
        if (result.success) {
          completedSteps.add(stepId);
          
          // Update execution record
          await pool.query(`
            UPDATE workflow_executions
            SET completed_steps = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [completedSteps.size, executionRecordId]);
        } else {
          failedSteps.add(stepId);
          
          // Update execution record
          await pool.query(`
            UPDATE workflow_executions
            SET failed_steps = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [failedSteps.size, executionRecordId]);
        }
        
        return result;
      });
      
      const levelResults = await Promise.all(levelPromises);
      stepResults.push(...levelResults);
      
      // Check if any step failed
      const levelFailed = levelResults.some(r => !r.success);
      
      if (levelFailed) {
        systemLogger.error('Workflow level failed, aborting', {
          executionId,
          failedSteps: levelResults.filter(r => !r.success).map(r => r.stepName)
        });
        
        // Abort workflow execution
        const endTime = new Date();
        const durationMs = endTime - startTime;
        
        await pool.query(`
          UPDATE workflow_executions
          SET status = 'failed',
              error_message = 'Workflow aborted due to step failures after retries',
              end_time = $1,
              duration_ms = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [endTime, durationMs, executionRecordId]);
        
        return {
          success: false,
          executionId,
          executionRecordId,
          workflowId,
          workflowName: workflow.name,
          totalSteps: steps.length,
          completed: completedSteps.size,
          failed: failedSteps.size,
          durationMs,
          stepResults,
          error: 'Workflow aborted due to step failures after retries'
        };
      }
      
      // Get next level (steps whose dependencies are all completed)
      const nextLevel = [];
      currentLevel.forEach(stepId => {
        const dependents = graph.dependents[stepId] || [];
        dependents.forEach(depId => {
          const depStep = graph.nodes[depId];
          // Check if all dependencies are completed
          if (completedSteps.has(depStep.depends_on)) {
            nextLevel.push(depId);
          }
        });
      });
      
      currentLevel = nextLevel;
    }
    
    // 6. Calculate final statistics
    const endTime = new Date();
    const durationMs = endTime - startTime;
    
    // 7. Update execution record with final status
    await pool.query(`
      UPDATE workflow_executions
      SET status = 'completed',
          completed_steps = $1,
          end_time = $2,
          duration_ms = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [completedSteps.size, endTime, durationMs, executionRecordId]);
    
    systemLogger.info('Workflow execution completed', {
      executionId,
      workflowId,
      totalSteps: steps.length,
      completed: completedSteps.size,
      failed: failedSteps.size,
      durationMs
    });
    
    return {
      success: true,
      executionId,
      executionRecordId,
      workflowId,
      workflowName: workflow.name,
      totalSteps: steps.length,
      completed: completedSteps.size,
      failed: failedSteps.size,
      durationMs,
      stepResults
    };
    
  } catch (error) {
    systemLogger.error('Workflow execution failed', {
      executionId,
      workflowId,
      error: error.message,
      stack: error.stack
    });
    
    // Update execution record as failed if it was created
    if (executionRecordId) {
      const endTime = new Date();
      const durationMs = endTime - startTime;
      
      await pool.query(`
        UPDATE workflow_executions
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
 * Get execution status for a workflow
 * @param {number} executionRecordId - The execution record ID
 * @returns {Promise<Object>} Execution details
 */
async function getWorkflowExecutionStatus(executionRecordId) {
  try {
    const result = await pool.query(`
      SELECT we.*, bp.name as workflow_name, ws.step_name as current_step_name
      FROM workflow_executions we
      JOIN business_processes bp ON we.workflow_id = bp.id
      LEFT JOIN workflow_steps ws ON we.current_step_id = ws.id
      WHERE we.id = $1
    `, [executionRecordId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Execution record ${executionRecordId} not found`);
    }
    
    return {
      success: true,
      execution: result.rows[0]
    };
  } catch (error) {
    systemLogger.error('Error fetching workflow execution status', {
      executionRecordId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get execution history for a workflow
 * @param {number} workflowId - The workflow ID
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} List of executions
 */
async function getWorkflowExecutionHistory(workflowId, limit = 50) {
  try {
    const result = await pool.query(`
      SELECT we.*, bp.name as workflow_name
      FROM workflow_executions we
      JOIN business_processes bp ON we.workflow_id = bp.id
      WHERE we.workflow_id = $1
      ORDER BY we.created_at DESC
      LIMIT $2
    `, [workflowId, limit]);
    
    return {
      success: true,
      executions: result.rows
    };
  } catch (error) {
    systemLogger.error('Error fetching workflow execution history', {
      workflowId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  executeWorkflow,
  getWorkflowExecutionStatus,
  getWorkflowExecutionHistory
};
