const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeTransformationJob } = require('./jobExecutionEngine');
const { executeMappingGroup } = require('./mappingGroupExecutionEngine');

/**
 * Execute an N-step workflow
 * Steps run sequentially, assets within each step run in parallel
 */
async function executeNStepWorkflow(workflowId, triggeredBy) {
  const runId = `WFRUN-${Date.now()}-${uuidv4().substring(0, 8)}`;
  const startTime = new Date();
  
  let runRecordId = null;
  
  try {
    const workflowResult = await pool.query(
      'SELECT * FROM n_step_workflows WHERE id = $1',
      [workflowId]
    );
    
    if (workflowResult.rows.length === 0) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    
    const workflow = workflowResult.rows[0];
    
    const stepsResult = await pool.query(`
      SELECT 
        s.*,
        json_agg(
          json_build_object(
            'id', a.id,
            'asset_type', a.asset_type,
            'asset_id', a.asset_id
          ) ORDER BY a.created_at
        ) FILTER (WHERE a.id IS NOT NULL) as assets
      FROM n_step_workflow_steps s
      LEFT JOIN n_step_workflow_assets a ON s.id = a.step_id
      WHERE s.workflow_id = $1
      GROUP BY s.id
      ORDER BY s.step_index
    `, [workflowId]);
    
    const steps = stepsResult.rows;
    
    if (steps.length === 0) {
      throw new Error(`No steps found in workflow ${workflowId}`);
    }
    
    systemLogger.info('Starting N-step workflow execution', {
      runId,
      workflowId,
      workflowName: workflow.name,
      totalSteps: steps.length
    });
    
    const runResult = await pool.query(`
      INSERT INTO n_step_workflow_runs 
      (workflow_id, run_id, status, triggered_by, start_time)
      VALUES ($1, $2, 'running', $3, $4)
      RETURNING id
    `, [workflowId, runId, triggeredBy, startTime]);
    
    runRecordId = runResult.rows[0].id;
    
    for (const step of steps) {
      const stepStartTime = new Date();
      
      systemLogger.info('Executing workflow step', {
        runId,
        stepIndex: step.step_index,
        assetsCount: step.assets?.length || 0
      });
      
      const stepRunResult = await pool.query(`
        INSERT INTO n_step_workflow_run_steps 
        (run_id, step_index, status, start_time)
        VALUES ($1, $2, 'running', $3)
        RETURNING id
      `, [runRecordId, step.step_index, stepStartTime]);
      
      const stepRunId = stepRunResult.rows[0].id;
      
      if (!step.assets || step.assets.length === 0) {
        await pool.query(`
          UPDATE n_step_workflow_run_steps
          SET status = 'completed',
              end_time = CURRENT_TIMESTAMP,
              duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)) * 1000
          WHERE id = $1
        `, [stepRunId]);
        continue;
      }
      
      systemLogger.info('Executing step assets in parallel', {
        runId,
        stepIndex: step.step_index,
        assetsCount: step.assets.length
      });
      
      const jobPromises = step.assets.map(async (asset) => {
        try {
          if (asset.asset_type === 'mapping') {
            const jobResult = await executeTransformationJob(
              pool,
              asset.asset_id,
              triggeredBy,
              { workflowExecutionId: runRecordId }
            );
            return { success: true, asset, jobResult };
          } else if (asset.asset_type === 'mapping_group') {
            const groupResult = await executeMappingGroup(
              asset.asset_id,
              10, // default concurrency
              triggeredBy,
              { workflowExecutionId: runRecordId }
            );
            return { success: true, asset, groupResult };
          }
        } catch (error) {
          systemLogger.error('Asset execution failed in workflow step', {
            runId,
            stepIndex: step.step_index,
            asset,
            error: error.message
          });
          return { success: false, asset, error: error.message };
        }
      });
      
      const results = await Promise.all(jobPromises);
      
      const completedCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      
      const stepEndTime = new Date();
      const stepDuration = stepEndTime.getTime() - stepStartTime.getTime();
      
      const stepStatus = failedCount > 0 ? 'failed' : 'completed';
      
      await pool.query(`
        UPDATE n_step_workflow_run_steps
        SET status = $1,
            jobs_count = $2,
            jobs_completed = $3,
            jobs_failed = $4,
            end_time = $5,
            duration_ms = $6
        WHERE id = $7
      `, [stepStatus, results.length, completedCount, failedCount, stepEndTime, stepDuration, stepRunId]);
      
      if (failedCount > 0) {
        const errorMessage = `Step ${step.step_index} failed: ${failedCount} asset(s) failed`;
        
        await pool.query(`
          UPDATE n_step_workflow_runs
          SET status = 'failed',
              error_message = $1,
              end_time = CURRENT_TIMESTAMP,
              duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)) * 1000
          WHERE id = $2
        `, [errorMessage, runRecordId]);
        
        throw new Error(errorMessage);
      }
    }
    
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    
    await pool.query(`
      UPDATE n_step_workflow_runs
      SET status = 'completed',
          end_time = $1,
          duration_ms = $2
      WHERE id = $3
    `, [endTime, durationMs, runRecordId]);
    
    systemLogger.info('N-step workflow execution completed', {
      runId,
      workflowId,
      totalSteps: steps.length,
      durationMs
    });
    
    return {
      runId,
      status: 'completed',
      durationMs
    };
    
  } catch (error) {
    systemLogger.error('N-step workflow execution failed', {
      runId,
      workflowId,
      error: error.message,
      stack: error.stack
    });
    
    if (runRecordId) {
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      
      await pool.query(`
        UPDATE n_step_workflow_runs
        SET status = 'failed',
            error_message = $1,
            end_time = $2,
            duration_ms = $3
        WHERE id = $4
      `, [error.message, endTime, durationMs, runRecordId]);
    }
    
    throw error;
  }
}


/**
 * Get workflow run status
 */
async function getWorkflowRunStatus(runId) {
  try {
    const runResult = await pool.query(`
      SELECT 
        wr.*,
        w.name as workflow_name
      FROM n_step_workflow_runs wr
      JOIN n_step_workflows w ON wr.workflow_id = w.id
      WHERE wr.run_id = $1
    `, [runId]);
    
    if (runResult.rows.length === 0) {
      throw new Error(`Run ${runId} not found`);
    }
    
    const run = runResult.rows[0];
    
    const stepsResult = await pool.query(`
      SELECT * FROM n_step_workflow_run_steps
      WHERE run_id = $1
      ORDER BY step_index
    `, [run.id]);
    
    const jobsResult = await pool.query(`
      SELECT * FROM transformation_jobs
      WHERE workflow_execution_id = $1
      ORDER BY created_at
    `, [run.id]);
    
    return {
      run,
      steps: stepsResult.rows,
      jobs: jobsResult.rows
    };
  } catch (error) {
    systemLogger.error('Error getting workflow run status:', error);
    throw error;
  }
}

module.exports = {
  executeNStepWorkflow,
  getWorkflowRunStatus
};
