/**
 * Group Management Routes
 * 
 * REST API for managing access groups (user groups for RBAC)
 */

const express = require('express');
const { systemLogger } = require('../utils/logger');

function createGroupRoutes(dbPool) {
  const router = express.Router();

  // List all groups
  router.get('/', async (req, res) => {
    try {
      const { group_type, search } = req.query;
      
      let query = 'SELECT * FROM access_groups WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (group_type) {
        query += ` AND group_type = $${paramIndex}`;
        params.push(group_type);
        paramIndex++;
      }

      if (search) {
        query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await dbPool.query(query, params);
      
      systemLogger.info('Access groups listed', {
        userId: req.user?.id,
        count: result.rows.length
      });

      res.json(result.rows);
    } catch (error) {
      systemLogger.error('Error listing groups', error);
      res.status(500).json({ error: 'Failed to list groups' });
    }
  });

  // Get single group with members and roles
  router.get('/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;

      const groupResult = await dbPool.query(
        'SELECT * FROM access_groups WHERE id = $1',
        [groupId]
      );

      if (groupResult.rows.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Get members
      const membersResult = await dbPool.query(`
        SELECT 
          agm.*,
          u.username,
          u.email,
          u.full_name
        FROM access_group_members agm
        JOIN users u ON agm.user_id = u.id
        WHERE agm.group_id = $1
        ORDER BY agm.created_at DESC
      `, [groupId]);

      // Get role assignments
      const rolesResult = await dbPool.query(`
        SELECT 
          agr.*,
          r.name as role_name,
          r.description as role_description
        FROM access_group_roles agr
        JOIN roles r ON agr.role_id = r.id
        WHERE agr.group_id = $1
      `, [groupId]);

      const group = groupResult.rows[0];
      group.members = membersResult.rows;
      group.roles = rolesResult.rows;

      res.json(group);
    } catch (error) {
      systemLogger.error('Error fetching group', error);
      res.status(500).json({ error: 'Failed to fetch group' });
    }
  });

  // Create new group
  router.post('/', async (req, res) => {
    try {
      const { name, description, group_type, external_id, idp_sync_enabled, metadata } = req.body;
      const userId = req.user?.id;

      if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const validTypes = ['MANUAL', 'STANDARD', 'DYNAMIC'];
      const type = group_type || 'MANUAL';
      
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid group_type. Must be one of: ${validTypes.join(', ')}` });
      }

      const result = await dbPool.query(`
        INSERT INTO access_groups (name, description, group_type, external_id, idp_sync_enabled, created_by, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [name, description, type, external_id || null, idp_sync_enabled || false, userId, metadata || {}]);

      const newGroup = result.rows[0];

      systemLogger.info('Access group created', {
        userId,
        groupId: newGroup.id,
        groupName: name,
        groupType: type
      });

      res.status(201).json(newGroup);
    } catch (error) {
      systemLogger.error('Error creating group', error);
      res.status(500).json({ error: 'Failed to create group' });
    }
  });

  // Update group
  router.put('/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { name, description, external_id, idp_sync_enabled, metadata } = req.body;

      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }
      if (external_id !== undefined) {
        updates.push(`external_id = $${paramIndex}`);
        params.push(external_id);
        paramIndex++;
      }
      if (idp_sync_enabled !== undefined) {
        updates.push(`idp_sync_enabled = $${paramIndex}`);
        params.push(idp_sync_enabled);
        paramIndex++;
      }
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIndex}`);
        params.push(JSON.stringify(metadata));
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(groupId);
      const query = `
        UPDATE access_groups 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await dbPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      systemLogger.info('Access group updated', {
        userId: req.user?.id,
        groupId
      });

      res.json(result.rows[0]);
    } catch (error) {
      systemLogger.error('Error updating group', error);
      res.status(500).json({ error: 'Failed to update group' });
    }
  });

  // Delete group
  router.delete('/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;

      const result = await dbPool.query(
        'DELETE FROM access_groups WHERE id = $1 RETURNING *',
        [groupId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      systemLogger.info('Access group deleted', {
        userId: req.user?.id,
        groupId
      });

      res.json({ message: 'Group deleted successfully' });
    } catch (error) {
      systemLogger.error('Error deleting group', error);
      res.status(500).json({ error: 'Failed to delete group' });
    }
  });

  // Add member to group
  router.post('/:groupId/members', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { user_id, source } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const validSources = ['MANUAL', 'IDP_SYNCED', 'INHERITED'];
      const memberSource = source || 'MANUAL';
      
      if (!validSources.includes(memberSource)) {
        return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` });
      }

      const result = await dbPool.query(`
        INSERT INTO access_group_members (group_id, user_id, source)
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id, user_id) 
        DO UPDATE SET source = $3, updated_at = NOW()
        RETURNING *
      `, [groupId, user_id, memberSource]);

      systemLogger.info('Group member added', {
        userId: req.user?.id,
        groupId,
        memberId: user_id,
        source: memberSource
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      systemLogger.error('Error adding group member', error);
      res.status(500).json({ error: 'Failed to add group member' });
    }
  });

  // Remove member from group
  router.delete('/:groupId/members/:userId', async (req, res) => {
    try {
      const { groupId, userId } = req.params;

      const result = await dbPool.query(
        'DELETE FROM access_group_members WHERE group_id = $1 AND user_id = $2 RETURNING *',
        [groupId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Group member not found' });
      }

      systemLogger.info('Group member removed', {
        userId: req.user?.id,
        groupId,
        removedUserId: userId
      });

      res.json({ message: 'Member removed successfully' });
    } catch (error) {
      systemLogger.error('Error removing group member', error);
      res.status(500).json({ error: 'Failed to remove group member' });
    }
  });

  // Assign role to group
  router.post('/:groupId/roles', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { role_id, project_id } = req.body;

      if (!role_id) {
        return res.status(400).json({ error: 'role_id is required' });
      }

      const result = await dbPool.query(`
        INSERT INTO access_group_roles (group_id, role_id, project_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id, role_id, COALESCE(project_id, -1))
        DO NOTHING
        RETURNING *
      `, [groupId, role_id, project_id || null]);

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Role already assigned to group' });
      }

      systemLogger.info('Role assigned to group', {
        userId: req.user?.id,
        groupId,
        roleId: role_id,
        projectId: project_id
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      systemLogger.error('Error assigning role to group', error);
      res.status(500).json({ error: 'Failed to assign role to group' });
    }
  });

  // Remove role from group
  router.delete('/:groupId/roles/:roleId', async (req, res) => {
    try {
      const { groupId, roleId } = req.params;
      const { project_id } = req.query;

      let query = 'DELETE FROM access_group_roles WHERE group_id = $1 AND role_id = $2';
      const params = [groupId, roleId];

      if (project_id) {
        query += ' AND project_id = $3';
        params.push(project_id);
      } else {
        query += ' AND project_id IS NULL';
      }

      query += ' RETURNING *';

      const result = await dbPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Role assignment not found' });
      }

      systemLogger.info('Role removed from group', {
        userId: req.user?.id,
        groupId,
        roleId
      });

      res.json({ message: 'Role removed successfully' });
    } catch (error) {
      systemLogger.error('Error removing role from group', error);
      res.status(500).json({ error: 'Failed to remove role from group' });
    }
  });

  return router;
}

module.exports = createGroupRoutes;
