/**
 * Group Management Routes
 * 
 * REST API for managing access groups (user groups for RBAC)
 */

const express = require('express');
const { systemLogger } = require('../utils/logger');
const { cache } = require('../config/redis');

/**
 * Invalidate permission cache for a user when their group membership or group roles change
 * @param {number} userId - User ID to invalidate cache for
 */
async function invalidateUserPermissionCache(userId) {
  try {
    const cacheKey = `permissions:user:${userId}`;
    await cache.del(cacheKey);
    systemLogger.info('Invalidated permission cache for user', { userId, cacheKey });
  } catch (error) {
    systemLogger.error('Error invalidating permission cache', { userId, error: error.message });
  }
}

/**
 * Invalidate permission cache for all members of a group
 * @param {Object} dbPool - Database pool
 * @param {number} groupId - Group ID
 */
async function invalidateGroupMembersPermissionCache(dbPool, groupId) {
  try {
    const membersResult = await dbPool.query(
      'SELECT user_id FROM user_groups WHERE group_id = $1',
      [groupId]
    );
    
    for (const row of membersResult.rows) {
      await invalidateUserPermissionCache(row.user_id);
    }
    
    systemLogger.info('Invalidated permission cache for all group members', { 
      groupId, 
      memberCount: membersResult.rows.length 
    });
  } catch (error) {
    systemLogger.error('Error invalidating group members permission cache', { groupId, error: error.message });
  }
}

function createGroupRoutes(dbPool) {
  const router = express.Router();

  // List all groups with member counts
  router.get('/', async (req, res) => {
    try {
      const { group_type, search } = req.query;
      
      let query = `
        SELECT 
          ag.*,
          COUNT(ug.user_id) as member_count
        FROM access_groups ag
        LEFT JOIN user_groups ug ON ag.id = ug.group_id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (group_type) {
        query += ` AND ag.group_type = $${paramIndex}`;
        params.push(group_type);
        paramIndex++;
      }

      if (search) {
        query += ` AND (ag.name ILIKE $${paramIndex} OR ag.description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ' GROUP BY ag.id ORDER BY ag.created_at DESC';

      const result = await dbPool.query(query, params);
      
      // Map database columns to API response format
      const groups = result.rows.map(group => ({
        ...group,
        idp_sync_enabled: group.sync_enabled,
        member_count: parseInt(group.member_count) || 0
      }));
      
      systemLogger.info('Access groups listed', {
        userId: req.user?.id,
        count: result.rows.length
      });

      res.json(groups);
    } catch (error) {
      systemLogger.error('Error listing groups', error);
      res.status(500).json({ error: 'Failed to list groups' });
    }
  });

  /**
   * GET /api/groups/init-data
   * Batch endpoint to get all data needed for GroupManagement page in a single call
   * Replaces 4 separate API calls: groups, users, roles, projects
   * NOTE: This route MUST be defined before /:groupId to avoid being matched as a group ID
   */
  router.get('/init-data', async (req, res) => {
    try {
      const { group_type, search } = req.query;
      
      let groupsQuery = `
        SELECT 
          ag.*,
          COUNT(ug.user_id) as member_count
        FROM access_groups ag
        LEFT JOIN user_groups ug ON ag.id = ug.group_id
        WHERE 1=1
      `;
      const groupsParams = [];
      let paramIndex = 1;

      if (group_type) {
        groupsQuery += ` AND ag.group_type = $${paramIndex}`;
        groupsParams.push(group_type);
        paramIndex++;
      }

      if (search) {
        groupsQuery += ` AND (ag.name ILIKE $${paramIndex} OR ag.description ILIKE $${paramIndex})`;
        groupsParams.push(`%${search}%`);
        paramIndex++;
      }

      groupsQuery += ' GROUP BY ag.id ORDER BY ag.created_at DESC';
      
      const [groupsResult, usersResult, rolesResult, projectsResult] = await Promise.all([
        dbPool.query(groupsQuery, groupsParams),
        dbPool.query('SELECT id, username, email, full_name FROM users ORDER BY username LIMIT 1000'),
        dbPool.query('SELECT id, name, description FROM roles ORDER BY name'),
        dbPool.query('SELECT id, name FROM projects WHERE parent_id IS NULL ORDER BY name')
      ]);
      
      const groups = groupsResult.rows.map(group => ({
        ...group,
        idp_sync_enabled: group.sync_enabled,
        member_count: parseInt(group.member_count) || 0
      }));
      
      systemLogger.info('Group management init data fetched', {
        userId: req.user?.id,
        groupCount: groups.length
      });

      res.json({
        groups,
        users: usersResult.rows,
        roles: rolesResult.rows,
        projects: projectsResult.rows
      });
    } catch (error) {
      systemLogger.error('Error in GET /api/groups/init-data', error);
      res.status(500).json({ error: 'Failed to fetch group management data' });
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
          ug.user_id,
          ug.group_id,
          u.username,
          u.email,
          u.full_name
        FROM user_groups ug
        JOIN users u ON ug.user_id = u.id
        WHERE ug.group_id = $1
        ORDER BY u.username
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

      const group = {
        ...groupResult.rows[0],
        idp_sync_enabled: groupResult.rows[0].sync_enabled,
        members: membersResult.rows,
        roles: rolesResult.rows
      };

      res.json(group);
    } catch (error) {
      systemLogger.error('Error fetching group', error);
      res.status(500).json({ error: 'Failed to fetch group' });
    }
  });

  // Create new group
  router.post('/', async (req, res) => {
    const client = await dbPool.connect();
    try {
      const { name, description, group_type, external_id, idp_sync_enabled, metadata, member_ids, role_ids, role_id, role_project_id } = req.body;
      const userId = req.user?.id;

      if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const validTypes = ['MANUAL', 'STANDARD', 'DYNAMIC'];
      const type = group_type || 'MANUAL';
      
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid group_type. Must be one of: ${validTypes.join(', ')}` });
      }

      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO access_groups (name, description, group_type, external_group_id, sync_enabled, created_by, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [name, description, type, external_id || null, idp_sync_enabled || false, userId, metadata || {}]);

      const newGroup = result.rows[0];

      // Add members if provided
      if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
        const memberValues = member_ids
          .map(id => `(${parseInt(id, 10)}, ${newGroup.id})`)
          .join(', ');
        
        await client.query(`
          INSERT INTO user_groups (user_id, group_id)
          VALUES ${memberValues}
          ON CONFLICT (user_id, group_id) DO NOTHING
        `);
      }

      // Add role assignments if provided (support both array and single role formats)
      if (role_ids && Array.isArray(role_ids) && role_ids.length > 0) {
        // Legacy: array of role IDs (global scope only)
        for (const roleId of role_ids) {
          await client.query(`
            INSERT INTO access_group_roles (group_id, role_id, project_id)
            VALUES ($1, $2, NULL)
            ON CONFLICT DO NOTHING
          `, [newGroup.id, parseInt(roleId, 10)]);
        }
      } else if (role_id) {
        // New: single role with optional project scope
        await client.query(`
          INSERT INTO access_group_roles (group_id, role_id, project_id)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [newGroup.id, parseInt(role_id, 10), role_project_id ? parseInt(role_project_id, 10) : null]);
      }

      await client.query('COMMIT');

      const responseGroup = {
        ...newGroup,
        idp_sync_enabled: newGroup.sync_enabled
      };

      systemLogger.info('Access group created', {
        userId,
        groupId: newGroup.id,
        groupName: name,
        groupType: type,
        memberCount: member_ids?.length || 0,
        roleCount: role_ids?.length || 0
      });

      res.status(201).json(responseGroup);
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating group', error);
      res.status(500).json({ error: 'Failed to create group' });
    } finally {
      client.release();
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
        updates.push(`external_group_id = $${paramIndex}`);
        params.push(external_id);
        paramIndex++;
      }
      if (idp_sync_enabled !== undefined) {
        updates.push(`sync_enabled = $${paramIndex}`);
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

      const updatedGroup = {
        ...result.rows[0],
        idp_sync_enabled: result.rows[0].sync_enabled
      };

      systemLogger.info('Access group updated', {
        userId: req.user?.id,
        groupId
      });

      res.json(updatedGroup);
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
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const result = await dbPool.query(`
        INSERT INTO user_groups (user_id, group_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, group_id) DO NOTHING
        RETURNING *
      `, [user_id, groupId]);

      // Invalidate permission cache for the newly added user
      await invalidateUserPermissionCache(user_id);
      
      systemLogger.info('Group member added', {
        userId: req.user?.id,
        groupId,
        memberId: user_id
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
        'DELETE FROM user_groups WHERE group_id = $1 AND user_id = $2 RETURNING *',
        [groupId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Group member not found' });
      }

      // Invalidate permission cache for the removed user
      await invalidateUserPermissionCache(userId);
      
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

      // Invalidate permission cache for all group members (they now have new permissions)
      await invalidateGroupMembersPermissionCache(dbPool, groupId);
      
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

      // Invalidate permission cache for all group members (they've lost permissions)
      await invalidateGroupMembersPermissionCache(dbPool, groupId);
      
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
