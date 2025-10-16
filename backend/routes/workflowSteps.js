const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { systemLogger } = require('../utils/logger');
const {
  executeWorkflow,
  getWorkflowExecutionStatus,
  getWorkflowExecutionHistory
} = require('../services/workflowOrchestrationEngine');

/**
 * Workflow Steps API Routes
 * Handles workflow step management and execution
 */

// Get all steps for a workflow
router.get('/workflow/:workflowId/steps', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM workflow_steps
      WHERE workflow_id = $1
      ORDER BY execution_order ASC, id ASC
    `, [workflowId]);
    
    res.json({
      success: true,
      steps: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching workflow steps', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow steps'
    });
  }
});

// Get a single step
router.get('/steps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM workflow_steps WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }
    
    res.json({
      success: true,
      step: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error fetching workflow step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow step'
    });
  }
});

// Create a workflow step
router.post('/workflow/:workflowId/steps', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const {
      step_name,
      step_type,
      entity_id,
      depends_on = null,
      retry_count = 3,
      retry_delay_seconds = 60,
      execution_order = 0
    } = req.body;
    
    if (!step_name || !step_type || !entity_id) {
      return res.status(400).json({
        success: false,
        error: 'step_name, step_type, and entity_id are required'
      });
    }
    
    if (!['mapping', 'mapping_group'].includes(step_type)) {
      return res.status(400).json({
        success: false,
        error: 'step_type must be either "mapping" or "mapping_group"'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO workflow_steps 
      (workflow_id, step_name, step_type, entity_id, depends_on, retry_count, retry_delay_seconds, execution_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [workflowId, step_name, step_type, String(entity_id), depends_on, retry_count, retry_delay_seconds, execution_order]);
    
    systemLogger.info('Workflow step created', { stepId: result.rows[0].id, workflowId });
    
    res.status(201).json({
      success: true,
      step: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error creating workflow step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create workflow step'
    });
  }
});

// Update a workflow step
router.put('/steps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      step_name, 
      step_type, 
      entity_id, 
      depends_on, 
      retry_count, 
      retry_delay_seconds, 
      execution_order 
    } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (step_name !== undefined) {
      updates.push(`step_name = $${paramIndex++}`);
      values.push(step_name);
    }
    if (step_type !== undefined) {
      updates.push(`step_type = $${paramIndex++}`);
      values.push(step_type);
    }
    if (entity_id !== undefined) {
      updates.push(`entity_id = $${paramIndex++}`);
      values.push(String(entity_id));
    }
    if (depends_on !== undefined) {
      updates.push(`depends_on = $${paramIndex++}`);
      values.push(depends_on);
    }
    if (retry_count !== undefined) {
      updates.push(`retry_count = $${paramIndex++}`);
      values.push(retry_count);
    }
    if (retry_delay_seconds !== undefined) {
      updates.push(`retry_delay_seconds = $${paramIndex++}`);
      values.push(retry_delay_seconds);
    }
    if (execution_order !== undefined) {
      updates.push(`execution_order = $${paramIndex++}`);
      values.push(execution_order);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(id);
    
    const result = await pool.query(`
      UPDATE workflow_steps
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }
    
    systemLogger.info('Workflow step updated', { stepId: id });
    
    res.json({
      success: true,
      step: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error updating workflow step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update workflow step'
    });
  }
});

// Delete a workflow step
router.delete('/steps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM workflow_steps WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow step not found'
      });
    }
    
    systemLogger.info('Workflow step deleted', { stepId: id });
    
    res.json({
      success: true,
      message: 'Workflow step deleted successfully'
    });
  } catch (error) {
    systemLogger.error('Error deleting workflow step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete workflow step'
    });
  }
});

// Execute a workflow
router.post('/workflow/:workflowId/execute', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { triggered_by } = req.body;
    
    // Execute workflow asynchronously
    executeWorkflow(parseInt(workflowId), triggered_by)
      .then(result => {
        systemLogger.info('Workflow execution completed', { 
          workflowId, 
          executionId: result.executionId 
        });
      })
      .catch(error => {
        systemLogger.error('Workflow execution failed', { 
          workflowId, 
          error: error.message 
        });
      });
    
    res.status(202).json({
      success: true,
      message: 'Workflow execution started',
      workflowId: parseInt(workflowId)
    });
  } catch (error) {
    systemLogger.error('Error starting workflow execution', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to start workflow execution'
    });
  }
});

// Get execution history for a workflow
router.get('/workflow/:workflowId/executions', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await getWorkflowExecutionHistory(parseInt(workflowId), limit);
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching workflow execution history', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution history'
    });
  }
});

// Get specific execution status
router.get('/executions/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const result = await getWorkflowExecutionStatus(parseInt(executionId));
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching execution status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution status'
    });
  }
});

module.exports = router;
