const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { 
  executeMappingGroup, 
  getGroupExecutionStatus,
  getGroupExecutionHistory 
} = require('../services/mappingGroupExecutionEngine');

/**
 * Mapping Groups API Routes
 * Handles CRUD operations and execution for mapping groups
 */

// Get all mapping groups
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mg.*, 
             COUNT(mgm.id) as mapping_count,
             (SELECT COUNT(*) FROM mapping_group_executions WHERE group_id = mg.id) as execution_count
      FROM mapping_groups mg
      LEFT JOIN mapping_group_members mgm ON mg.id = mgm.group_id
      GROUP BY mg.id
      ORDER BY mg.created_at DESC
    `);
    
    res.json({
      success: true,
      groups: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching mapping groups', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch mapping groups'
    });
  }
});

// Get a single mapping group by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const groupResult = await pool.query(`
      SELECT mg.*, 
             COUNT(mgm.id) as mapping_count
      FROM mapping_groups mg
      LEFT JOIN mapping_group_members mgm ON mg.id = mgm.group_id
      WHERE mg.id = $1
      GROUP BY mg.id
    `, [id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    // Get group members
    const membersResult = await pool.query(`
      SELECT mgm.*, tm.mapping_name, tm.file_name_pattern
      FROM mapping_group_members mgm
      JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
      WHERE mgm.group_id = $1
      ORDER BY mgm.execution_order ASC, mgm.id ASC
    `, [id]);
    
    const group = groupResult.rows[0];
    res.json({
      success: true,
      ...group,
      group_name: group.name,
      concurrency_limit: group.max_concurrency,
      members: membersResult.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching mapping group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch mapping group'
    });
  }
});

// Create a new mapping group
router.post('/', async (req, res) => {
  try {
    const { name, description, max_concurrency = 10, created_by } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO mapping_groups (name, description, max_concurrency, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description, max_concurrency, created_by]);
    
    systemLogger.info('Mapping group created', { groupId: result.rows[0].id });
    
    res.status(201).json({
      success: true,
      group: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error creating mapping group', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create mapping group'
    });
  }
});

// Update a mapping group
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, max_concurrency, status } = req.body;
    
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
    if (max_concurrency !== undefined) {
      updates.push(`max_concurrency = $${paramIndex++}`);
      values.push(max_concurrency);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(id);
    
    const result = await pool.query(`
      UPDATE mapping_groups
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    systemLogger.info('Mapping group updated', { groupId: id });
    
    res.json({
      success: true,
      group: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error updating mapping group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update mapping group'
    });
  }
});

// Delete a mapping group
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM mapping_groups WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Mapping group not found'
      });
    }
    
    systemLogger.info('Mapping group deleted', { groupId: id });
    
    res.json({
      success: true,
      message: 'Mapping group deleted successfully'
    });
  } catch (error) {
    systemLogger.error('Error deleting mapping group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete mapping group'
    });
  }
});

// Get group members
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    
    const membersResult = await pool.query(`
      SELECT mgm.*, tm.mapping_name, tm.file_name_pattern
      FROM mapping_group_members mgm
      JOIN transformation_mappings tm ON mgm.mapping_id = tm.mapping_id
      WHERE mgm.group_id = $1
      ORDER BY mgm.execution_order ASC, mgm.id ASC
    `, [id]);
    
    res.json({
      success: true,
      members: membersResult.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching group members', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group members'
    });
  }
});

// Add mapping to group
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { mapping_id, execution_order = 0 } = req.body;
    
    if (!mapping_id) {
      return res.status(400).json({
        success: false,
        error: 'mapping_id is required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO mapping_group_members (group_id, mapping_id, execution_order)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, mapping_id, execution_order]);
    
    systemLogger.info('Mapping added to group', { groupId: id, mappingId: mapping_id });
    
    res.status(201).json({
      success: true,
      member: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error adding mapping to group', { 
      groupId: req.params.id, 
      error: error.message 
    });
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: 'Mapping already exists in this group'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add mapping to group'
    });
  }
});

// Remove mapping from group
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    
    const result = await pool.query(`
      DELETE FROM mapping_group_members 
      WHERE id = $1 AND group_id = $2
      RETURNING *
    `, [memberId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Group member not found'
      });
    }
    
    systemLogger.info('Mapping removed from group', { 
      groupId: id, 
      memberId 
    });
    
    res.json({
      success: true,
      message: 'Mapping removed from group successfully'
    });
  } catch (error) {
    systemLogger.error('Error removing mapping from group', { 
      groupId: req.params.id, 
      memberId: req.params.memberId,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove mapping from group'
    });
  }
});

// Execute a mapping group
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { max_concurrency, triggered_by } = req.body;
    
    // Execute group asynchronously
    executeMappingGroup(parseInt(id), max_concurrency, triggered_by)
      .then(result => {
        systemLogger.info('Mapping group execution completed', { 
          groupId: id, 
          executionId: result.executionId 
        });
      })
      .catch(error => {
        systemLogger.error('Mapping group execution failed', { 
          groupId: id, 
          error: error.message 
        });
      });
    
    res.status(202).json({
      success: true,
      message: 'Mapping group execution started',
      groupId: parseInt(id)
    });
  } catch (error) {
    systemLogger.error('Error starting mapping group execution', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start mapping group execution'
    });
  }
});

// Get execution history for a group
router.get('/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await getGroupExecutionHistory(parseInt(id), limit);
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching group execution history', { 
      groupId: req.params.id, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution history'
    });
  }
});

// Get specific execution status
router.get('/:id/executions/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const result = await getGroupExecutionStatus(parseInt(executionId));
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error fetching execution status', { 
      executionId: req.params.executionId, 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch execution status'
    });
  }
});

module.exports = router;
