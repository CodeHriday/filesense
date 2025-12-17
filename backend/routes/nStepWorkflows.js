const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { executeNStepWorkflow, getWorkflowRunStatus } = require('../services/nStepWorkflowExecutionEngine');
const authorizeProjectResource = require('../middleware/authorizeProjectResource');

/**
 * Helper function to validate workflow project access
 * Returns the workflow's project_id if user has access, otherwise throws 403
 */
async function validateWorkflowAccess(workflowId, user) {
  const { getUserProjects } = require('../middleware/requireProjectAccess');
  
  // Get workflow project_id
  const result = await pool.query(
    'SELECT project_id FROM n_step_workflows WHERE id = $1',
    [workflowId]
  );
  
  if (result.rows.length === 0) {
    const error = new Error('Workflow not found');
    error.status = 404;
    throw error;
  }
  
  const workflowProjectId = result.rows[0].project_id;
  
  // Check access (admins bypass)
  const isAdmin = user?.roles?.includes('Admin');
  if (!isAdmin) {
    const userProjects = await getUserProjects(user.id);
    const projectIds = userProjects.map(p => p.id);
    
    if (!projectIds.includes(workflowProjectId)) {
      const error = new Error('You do not have access to this workflow');
      error.status = 403;
      throw error;
    }
  }
  
  return workflowProjectId;
}

/**
 * GET /api/n-step-workflows
 * List all N-step workflows (filtered by user's accessible projects)
 */
router.get('/', async (req, res) => {
  try {
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    // Get user's accessible projects
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectIds = [];
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        // User has no project access, return empty list
        return res.json({
          success: true,
          workflows: []
        });
      }
    }
    
    let query = `
      SELECT 
        w.*,
        COUNT(DISTINCT s.id) as step_count,
        p.name as project_name
      FROM n_step_workflows w
      LEFT JOIN n_step_workflow_steps s ON w.id = s.workflow_id
      LEFT JOIN projects p ON w.project_id = p.id
    `;
    
    // Filter by project membership (unless admin)
    if (!isAdmin && projectIds.length > 0) {
      query += ` WHERE w.project_id = ANY($1)`;
    }
    
    query += `
      GROUP BY w.id, p.name
      ORDER BY w.created_at DESC
    `;
    
    const params = (!isAdmin && projectIds.length > 0) ? [projectIds] : [];
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      workflows: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching workflows', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workflows'
    });
  }
});

/**
 * GET /api/n-step-workflows/:id
 * Get a specific workflow with all steps and assets
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    // Get workflow with project_id
    const workflowResult = await pool.query(
      'SELECT * FROM n_step_workflows WHERE id = $1',
      [id]
    );
    
    if (workflowResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    const workflow = workflowResult.rows[0];
    
    // Check project access (unless admin)
    const isAdmin = req.user?.roles?.includes('Admin');
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      const projectIds = userProjects.map(p => p.id);
      
      if (!projectIds.includes(workflow.project_id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have access to this workflow'
        });
      }
    }
    
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
    `, [id]);
    
    res.json({
      success: true,
      workflow: {
        ...workflow,
        steps: stepsResult.rows
      }
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error fetching workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow'
    });
  }
});

/**
 * POST /api/n-step-workflows
 * Create a new workflow
 */
router.post('/',
  authorizeProjectResource({
    resourceType: 'workflow',
    requiredPermissions: ['workflow:write'],
    getProjectId: async (req) => {
      // For POST, project_id is required - no defaults allowed for security
      if (!req.body.project_id) {
        throw new Error('project_id is required');
      }
      return parseInt(req.body.project_id, 10);
    }
  }),
  async (req, res) => {
  try {
    const { name, description, sub_project_id } = req.body;
    const userId = req.user?.id || 1;
    const assignedProjectId = req.projectId; // Set by authorization middleware, no fallback allowed
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Workflow name is required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO n_step_workflows (name, description, created_by, project_id, sub_project_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, userId, assignedProjectId, sub_project_id || null]);
    
    const workflow = result.rows[0];
    
    await pool.query(`
      INSERT INTO n_step_workflow_steps (workflow_id, step_index, is_active)
      VALUES ($1, 1, true)
    `, [workflow.id]);
    
    res.json({
      success: true,
      workflow: workflow
    });
  } catch (error) {
    systemLogger.error('Error creating workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create workflow'
    });
  }
});

/**
 * PUT /api/n-step-workflows/:id
 * Update workflow metadata
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, _, sub_project_id } = req.body;
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    
    // Get workflow to check project_id
    const workflowCheck = await pool.query(
      'SELECT project_id FROM n_step_workflows WHERE id = $1',
      [id]
    );
    
    if (workflowCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    // Check project access (unless admin)
    const isAdmin = req.user?.roles?.includes('Admin');
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      const projectIds = userProjects.map(p => p.id);
      
      if (!projectIds.includes(workflowCheck.rows[0].project_id)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You do not have access to this workflow'
        });
      }
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    // Note: project_id cannot be changed after creation for security
    if (sub_project_id !== undefined) {
      updates.push(`sub_project_id = $${paramIndex++}`);
      values.push(sub_project_id || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(id);
    
    const result = await pool.query(`
      UPDATE n_step_workflows
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    res.json({
      success: true,
      workflow: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error updating workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update workflow'
    });
  }
});

/**
 * DELETE /api/n-step-workflows/:id
 * Delete a workflow
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    const result = await pool.query(
      'DELETE FROM n_step_workflows WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error deleting workflow', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete workflow'
    });
  }
});

/**
 * POST /api/n-step-workflows/:id/steps
 * Add a new step to the workflow
 */
router.post('/:id/steps', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    // Get the highest step index
    const maxStepResult = await pool.query(`
      SELECT COALESCE(MAX(step_index), 0) as max_index
      FROM n_step_workflow_steps
      WHERE workflow_id = $1
    `, [id]);
    
    const newStepIndex = maxStepResult.rows[0].max_index + 1;
    
    // Deactivate all current steps
    await pool.query(`
      UPDATE n_step_workflow_steps
      SET is_active = false
      WHERE workflow_id = $1
    `, [id]);
    
    // Create new step and make it active
    const newStepResult = await pool.query(`
      INSERT INTO n_step_workflow_steps (workflow_id, step_index, is_active)
      VALUES ($1, $2, true)
      RETURNING *
    `, [id, newStepIndex]);
    
    res.json({
      success: true,
      step: newStepResult.rows[0]
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    // Check if it's an access control error by message
    if (error.message && (error.message.includes('do not have access') || error.message.includes('not found'))) {
      const status = error.message.includes('not found') ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error adding step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to add step'
    });
  }
});

/**
 * POST /api/n-step-workflows/:id/steps/next
 * Move to next step (freeze current, activate next or create new)
 */
router.post('/:id/steps/next', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    const currentActiveResult = await pool.query(`
      SELECT * FROM n_step_workflow_steps
      WHERE workflow_id = $1 AND is_active = true
    `, [id]);
    
    if (currentActiveResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active step found'
      });
    }
    
    const currentStep = currentActiveResult.rows[0];
    const nextStepIndex = currentStep.step_index + 1;
    
    await pool.query(`
      UPDATE n_step_workflow_steps
      SET is_active = false
      WHERE id = $1
    `, [currentStep.id]);
    
    const nextStepResult = await pool.query(`
      SELECT * FROM n_step_workflow_steps
      WHERE workflow_id = $1 AND step_index = $2
    `, [id, nextStepIndex]);
    
    let nextStep;
    if (nextStepResult.rows.length === 0) {
      const createResult = await pool.query(`
        INSERT INTO n_step_workflow_steps (workflow_id, step_index, is_active)
        VALUES ($1, $2, true)
        RETURNING *
      `, [id, nextStepIndex]);
      nextStep = createResult.rows[0];
    } else {
      await pool.query(`
        UPDATE n_step_workflow_steps
        SET is_active = true
        WHERE id = $1
      `, [nextStepResult.rows[0].id]);
      nextStep = { ...nextStepResult.rows[0], is_active: true };
    }
    
    res.json({
      success: true,
      activeStep: nextStep
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error moving to next step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to move to next step'
    });
  }
});

/**
 * POST /api/n-step-workflows/:id/steps/previous
 * Move to previous step (freeze current, activate previous)
 */
router.post('/:id/steps/previous', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    const currentActiveResult = await pool.query(`
      SELECT * FROM n_step_workflow_steps
      WHERE workflow_id = $1 AND is_active = true
    `, [id]);
    
    if (currentActiveResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active step found'
      });
    }
    
    const currentStep = currentActiveResult.rows[0];
    
    if (currentStep.step_index === 1) {
      return res.status(400).json({
        success: false,
        error: 'Already at first step'
      });
    }
    
    const previousStepIndex = currentStep.step_index - 1;
    
    await pool.query(`
      UPDATE n_step_workflow_steps
      SET is_active = false
      WHERE id = $1
    `, [currentStep.id]);
    
    const previousStepResult = await pool.query(`
      UPDATE n_step_workflow_steps
      SET is_active = true
      WHERE workflow_id = $1 AND step_index = $2
      RETURNING *
    `, [id, previousStepIndex]);
    
    res.json({
      success: true,
      activeStep: previousStepResult.rows[0]
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error moving to previous step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to move to previous step'
    });
  }
});

/**
 * PUT /api/n-step-workflows/:id/steps/:stepId/activate
 * Activate a specific step (deactivate all others)
 */
router.put('/:id/steps/:stepId/activate', async (req, res) => {
  try {
    const { id, stepId } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    // Deactivate all steps in the workflow
    await pool.query(`
      UPDATE n_step_workflow_steps
      SET is_active = false
      WHERE workflow_id = $1
    `, [id]);
    
    // Activate the specified step
    const result = await pool.query(`
      UPDATE n_step_workflow_steps
      SET is_active = true
      WHERE id = $1 AND workflow_id = $2
      RETURNING *
    `, [stepId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Step not found'
      });
    }
    
    res.json({
      success: true,
      activeStep: result.rows[0]
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error activating step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to activate step'
    });
  }
});

/**
 * POST /api/n-step-workflows/:id/steps/:stepId/assets
 * Add asset to a step with 10-mapping limit validation
 */
router.post('/:id/steps/:stepId/assets', async (req, res) => {
  try {
    const { id, stepId } = req.params;
    const { asset_type, asset_id } = req.body;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    if (!['mapping', 'mapping_group'].includes(asset_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid asset type'
      });
    }
    
    let expandedCount = 1;
    if (asset_type === 'mapping_group') {
      const groupResult = await pool.query(`
        SELECT COUNT(*) as mapping_count
        FROM mapping_group_members
        WHERE group_id = $1
      `, [asset_id]);
      expandedCount = parseInt(groupResult.rows[0].mapping_count);
    }
    
    const currentCountResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE a.asset_type = 'mapping') as mapping_count,
        COALESCE(SUM(
          CASE 
            WHEN a.asset_type = 'mapping_group' 
            THEN (SELECT COUNT(*) FROM mapping_group_members WHERE group_id = a.asset_id::integer)
            ELSE 0
          END
        ), 0) as group_mapping_count
      FROM n_step_workflow_assets a
      WHERE a.step_id = $1
    `, [stepId]);
    
    const currentTotal = parseInt(currentCountResult.rows[0].mapping_count) + 
                        parseInt(currentCountResult.rows[0].group_mapping_count);
    const newTotal = currentTotal + expandedCount;
    
    if (newTotal > 10) {
      return res.status(400).json({
        success: false,
        error: `Adding this ${asset_type} would exceed the 10-mapping limit (current: ${currentTotal}, would be: ${newTotal})`
      });
    }
    
    const result = await pool.query(`
      INSERT INTO n_step_workflow_assets (step_id, asset_type, asset_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [stepId, asset_type, asset_id]);
    
    res.json({
      success: true,
      asset: result.rows[0],
      expandedCount: newTotal
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error adding asset', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to add asset'
    });
  }
});

/**
 * DELETE /api/n-step-workflows/:id/steps/:stepId/assets/:assetId
 * Remove asset from a step
 */
router.delete('/:id/steps/:stepId/assets/:assetId', async (req, res) => {
  try {
    const { id, assetId } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    const result = await pool.query(
      'DELETE FROM n_step_workflow_assets WHERE id = $1 RETURNING *',
      [assetId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Asset removed successfully'
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error removing asset', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to remove asset'
    });
  }
});

/**
 * DELETE /api/n-step-workflows/:id/steps/:stepId
 * Delete a step and all its assets
 */
router.delete('/:id/steps/:stepId', async (req, res) => {
  try {
    const { id, stepId } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    // First, delete all assets associated with this step
    await pool.query(
      'DELETE FROM n_step_workflow_assets WHERE step_id = $1',
      [stepId]
    );
    
    // Get the step to be deleted
    const stepResult = await pool.query(
      'SELECT step_index FROM n_step_workflow_steps WHERE id = $1 AND workflow_id = $2',
      [stepId, id]
    );
    
    if (stepResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Step not found'
      });
    }
    
    const deletedStepIndex = stepResult.rows[0].step_index;
    
    // Delete the step
    await pool.query(
      'DELETE FROM n_step_workflow_steps WHERE id = $1',
      [stepId]
    );
    
    // Renumber remaining steps to fill the gap
    await pool.query(`
      UPDATE n_step_workflow_steps
      SET step_index = step_index - 1
      WHERE workflow_id = $1 AND step_index > $2
    `, [id, deletedStepIndex]);
    
    // If the deleted step was active, make step 1 active (if it exists)
    const activeStepExists = await pool.query(
      'SELECT id FROM n_step_workflow_steps WHERE workflow_id = $1 AND is_active = true',
      [id]
    );
    
    if (activeStepExists.rows.length === 0) {
      await pool.query(
        'UPDATE n_step_workflow_steps SET is_active = true WHERE workflow_id = $1 AND step_index = 1',
        [id]
      );
    }
    
    res.json({
      success: true,
      message: 'Step deleted successfully'
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    // Check if it's an access control error by message
    if (error.message && (error.message.includes('do not have access') || error.message.includes('not found'))) {
      const status = error.message.includes('not found') ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error deleting step', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete step'
    });
  }
});

/**
 * GET /api/n-step-workflows/:id/steps/:stepId/expanded-count
 * Get expanded mapping count for a step
 */
router.get('/:id/steps/:stepId/expanded-count', async (req, res) => {
  try {
    const { stepId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE a.asset_type = 'mapping') as mapping_count,
        COALESCE(SUM(
          CASE 
            WHEN a.asset_type = 'mapping_group' 
            THEN (SELECT COUNT(*) FROM mapping_group_members WHERE group_id = a.asset_id::integer)
            ELSE 0
          END
        ), 0) as group_mapping_count
      FROM n_step_workflow_assets a
      WHERE a.step_id = $1
    `, [stepId]);
    
    const total = parseInt(result.rows[0].mapping_count) + 
                 parseInt(result.rows[0].group_mapping_count);
    
    res.json({
      success: true,
      expandedCount: total
    });
  } catch (error) {
    systemLogger.error('Error getting expanded count', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get expanded count'
    });
  }
});

/**
 * POST /api/n-step-workflows/:id/execute
 * Execute a workflow asynchronously
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate project access
    await validateWorkflowAccess(id, req.user);
    
    // Check if user has workflow:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('workflow:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to execute workflows. Contact your administrator.'
      });
    }
    
    const userId = req.user?.id || 1;
    
    // Get workflow details
    const workflowResult = await pool.query('SELECT name FROM n_step_workflows WHERE id = $1', [id]);
    if (workflowResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }
    
    // Execute workflow asynchronously (fire-and-forget)
    executeNStepWorkflow(id, userId)
      .then(result => {
        systemLogger.info('Workflow execution completed', { 
          workflowId: id, 
          runId: result.runId 
        });
      })
      .catch(error => {
        systemLogger.error('Workflow execution failed', { 
          workflowId: id, 
          error: error.message 
        });
      });
    
    // Return immediately with 202 Accepted
    res.status(202).json({
      success: true,
      message: 'Workflow execution started in the background',
      workflowId: id,
      workflowName: workflowResult.rows[0].name
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    // Check if it's an access control error by message
    if (error.message && (error.message.includes('do not have access') || error.message.includes('not found'))) {
      const status = error.message.includes('not found') ? 404 : 403;
      return res.status(status).json({
        success: false,
        error: error.message
      });
    }
    systemLogger.error('Error starting workflow execution', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to start workflow execution: ' + error.message
    });
  }
});

/**
 * GET /api/n-step-workflows/runs/:runId
 * Get workflow run status
 */
router.get('/runs/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    
    const result = await getWorkflowRunStatus(runId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    systemLogger.error('Error getting workflow run status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow run status'
    });
  }
});

module.exports = router;
