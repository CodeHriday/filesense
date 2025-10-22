/**
 * Policy Management Routes
 * 
 * CRUD operations for managing policies, policy attachments, and policy evaluation.
 */

const express = require('express');
const router = express.Router();
const PolicyEngine = require('../services/policyEngine');
const { systemLogger } = require('../utils/logger');

// Initialize policy engine
let policyEngine;

const initPolicyEngine = (dbPool) => {
  if (!policyEngine) {
    policyEngine = new PolicyEngine(dbPool);
  }
  return policyEngine;
};

// Make policy engine available to other modules
router.getPolicyEngine = () => policyEngine;

/**
 * GET /api/policies
 * List all policies (with optional filters)
 */
router.get('/', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const { policy_type, is_global, project_id, is_active } = req.query;
    
    let query = 'SELECT * FROM rbac_policies WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (policy_type) {
      query += ` AND policy_type = $${paramCount++}`;
      params.push(policy_type);
    }
    
    if (is_global !== undefined) {
      query += ` AND is_global = $${paramCount++}`;
      params.push(is_global === 'true');
    }
    
    if (project_id) {
      query += ` AND project_id = $${paramCount++}`;
      params.push(project_id);
    }
    
    if (is_active !== undefined) {
      query += ` AND is_active = $${paramCount++}`;
      params.push(is_active === 'true');
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Error fetching policies', error);
    res.status(500).json({ error: 'Failed to fetch policies' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/policies/:id
 * Get a specific policy
 */
router.get('/:id', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM rbac_policies WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Error fetching policy', error);
    res.status(500).json({ error: 'Failed to fetch policy' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/policies
 * Create a new policy
 */
router.post('/', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const {
      name,
      description,
      policy_type,
      project_id,
      is_global,
      policy_document
    } = req.body;
    
    // Validate required fields
    if (!name || !policy_type || !policy_document) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, policy_type, policy_document' 
      });
    }
    
    // Validate policy document structure
    if (!policy_document.Statement || !Array.isArray(policy_document.Statement)) {
      return res.status(400).json({ 
        error: 'Invalid policy document: must contain Statement array' 
      });
    }
    
    const result = await client.query(`
      INSERT INTO rbac_policies 
      (name, description, policy_type, project_id, is_global, policy_document, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      name,
      description,
      policy_type,
      project_id || null,
      is_global || false,
      JSON.stringify(policy_document),
      req.user?.id || null
    ]);
    
    systemLogger.info('Policy created', { 
      policyId: result.rows[0].id, 
      policyName: name, 
      createdBy: req.user?.id 
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.constraint === 'unique_policy_name_per_project') {
      return res.status(409).json({ 
        error: 'A policy with this name already exists in this project' 
      });
    }
    
    systemLogger.error('Error creating policy', error);
    res.status(500).json({ error: 'Failed to create policy' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/policies/:id
 * Update a policy
 */
router.put('/:id', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const {
      name,
      description,
      policy_document,
      is_active
    } = req.body;
    
    // Increment version on update
    const result = await client.query(`
      UPDATE rbac_policies
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        policy_document = COALESCE($3, policy_document),
        is_active = COALESCE($4, is_active),
        version = version + 1,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [
      name,
      description,
      policy_document ? JSON.stringify(policy_document) : null,
      is_active,
      req.params.id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    // Invalidate cache when policy is updated
    const engine = initPolicyEngine(req.app.locals.pool);
    await engine.invalidateAllCache();
    
    systemLogger.info('Policy updated', { 
      policyId: req.params.id, 
      version: result.rows[0].version 
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Error updating policy', error);
    res.status(500).json({ error: 'Failed to update policy' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/policies/:id
 * Delete a policy
 */
router.delete('/:id', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM rbac_policies WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    // Invalidate cache when policy is deleted
    const engine = initPolicyEngine(req.app.locals.pool);
    await engine.invalidateAllCache();
    
    systemLogger.info('Policy deleted', { policyId: req.params.id });
    
    res.json({ message: 'Policy deleted successfully', policy: result.rows[0] });
  } catch (error) {
    systemLogger.error('Error deleting policy', error);
    res.status(500).json({ error: 'Failed to delete policy' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/policies/:id/attach-user
 * Attach a policy to a user
 */
router.post('/:id/attach-user', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    
    await client.query(`
      INSERT INTO user_policy_attachments (user_id, policy_id, attached_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, policy_id) DO NOTHING
    `, [user_id, req.params.id, req.user?.id || null]);
    
    // Invalidate user cache
    const engine = initPolicyEngine(req.app.locals.pool);
    await engine.invalidateUserCache(user_id);
    
    systemLogger.info('Policy attached to user', { 
      policyId: req.params.id, 
      userId: user_id 
    });
    
    res.json({ message: 'Policy attached to user successfully' });
  } catch (error) {
    systemLogger.error('Error attaching policy to user', error);
    res.status(500).json({ error: 'Failed to attach policy to user' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/policies/:id/detach-user/:userId
 * Detach a policy from a user
 */
router.delete('/:id/detach-user/:userId', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    await client.query(
      'DELETE FROM user_policy_attachments WHERE user_id = $1 AND policy_id = $2',
      [req.params.userId, req.params.id]
    );
    
    // Invalidate user cache
    const engine = initPolicyEngine(req.app.locals.pool);
    await engine.invalidateUserCache(parseInt(req.params.userId));
    
    systemLogger.info('Policy detached from user', { 
      policyId: req.params.id, 
      userId: req.params.userId 
    });
    
    res.json({ message: 'Policy detached from user successfully' });
  } catch (error) {
    systemLogger.error('Error detaching policy from user', error);
    res.status(500).json({ error: 'Failed to detach policy from user' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/policies/:id/attach-group
 * Attach a policy to a group
 */
router.post('/:id/attach-group', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const { group_id } = req.body;
    
    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required' });
    }
    
    await client.query(`
      INSERT INTO group_policy_attachments (group_id, policy_id, attached_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (group_id, policy_id) DO NOTHING
    `, [group_id, req.params.id, req.user?.id || null]);
    
    // Invalidate cache for all users in the group
    const engine = initPolicyEngine(req.app.locals.pool);
    await engine.invalidateAllCache(); // Simplified - invalidate all cache
    
    systemLogger.info('Policy attached to group', { 
      policyId: req.params.id, 
      groupId: group_id 
    });
    
    res.json({ message: 'Policy attached to group successfully' });
  } catch (error) {
    systemLogger.error('Error attaching policy to group', error);
    res.status(500).json({ error: 'Failed to attach policy to group' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/policies/evaluate
 * Evaluate if a user can perform an action (testing endpoint)
 */
router.post('/evaluate', async (req, res) => {
  try {
    const { user_id, action, resource_type, resource_id, context } = req.body;
    
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action are required' });
    }
    
    const engine = initPolicyEngine(req.app.locals.pool);
    const result = await engine.evaluate(
      user_id,
      action,
      resource_type || null,
      resource_id || null,
      context || {}
    );
    
    res.json(result);
  } catch (error) {
    systemLogger.error('Error evaluating policy', error);
    res.status(500).json({ error: 'Failed to evaluate policy' });
  }
});

/**
 * GET /api/policies/user/:userId
 * Get all policies attached to a user (directly or via groups)
 */
router.get('/user/:userId', async (req, res) => {
  const client = await req.app.locals.pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT p.*, 
        CASE 
          WHEN upa.user_id IS NOT NULL THEN 'direct'
          ELSE 'group'
        END as attachment_type
      FROM rbac_policies p
      LEFT JOIN user_policy_attachments upa ON upa.policy_id = p.id AND upa.user_id = $1
      LEFT JOIN access_group_members agm ON agm.user_id = $1
      LEFT JOIN group_policy_attachments gpa ON gpa.group_id = agm.group_id AND gpa.policy_id = p.id
      WHERE (upa.user_id = $1 OR agm.user_id = $1)
      AND p.is_active = TRUE
      ORDER BY p.created_at DESC
    `, [req.params.userId]);
    
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Error fetching user policies', error);
    res.status(500).json({ error: 'Failed to fetch user policies' });
  } finally {
    client.release();
  }
});

module.exports = (dbPool) => {
  initPolicyEngine(dbPool);
  return router;
};
