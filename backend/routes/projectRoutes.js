/**
 * Project Management Routes
 * 
 * REST API for managing projects (workspaces)
 */

const express = require('express');
const { systemLogger } = require('../utils/logger');

function createProjectRoutes(dbPool) {
  const router = express.Router();

  // List all projects (with optional filtering)
  router.get('/', async (req, res) => {
    try {
      const { archived, search } = req.query;
      
      let query = 'SELECT * FROM projects WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (archived !== undefined) {
        query += ` AND is_archived = $${paramIndex}`;
        params.push(archived === 'true');
        paramIndex++;
      }

      if (search) {
        query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await dbPool.query(query, params);
      
      systemLogger.info('Projects listed', {
        userId: req.user?.id,
        count: result.rows.length
      });

      res.json(result.rows);
    } catch (error) {
      systemLogger.error('Error listing projects', error);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  // Get single project with members
  router.get('/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params;

      const projectResult = await dbPool.query(
        'SELECT * FROM projects WHERE id = $1',
        [projectId]
      );

      if (projectResult.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const membersResult = await dbPool.query(`
        SELECT 
          pm.*,
          u.username,
          u.email,
          u.full_name
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1
        ORDER BY pm.created_at DESC
      `, [projectId]);

      const project = projectResult.rows[0];
      project.members = membersResult.rows;

      res.json(project);
    } catch (error) {
      systemLogger.error('Error fetching project', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // Create new project
  router.post('/', async (req, res) => {
    try {
      const { name, description, parent_id, is_default, metadata, settings } = req.body;
      const userId = req.user?.id;

      if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      const result = await dbPool.query(`
        INSERT INTO projects (name, description, parent_id, owner_id, is_default, metadata, settings)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [name, description, parent_id || null, userId, is_default || false, metadata || {}, settings || {}]);

      const newProject = result.rows[0];

      // Get Admin role ID (use Admin as default project owner role since project-specific roles don't exist yet)
      const roleResult = await dbPool.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', ['Admin']);
      const roleId = roleResult.rows[0]?.id || 1; // Fallback to role ID 1 if not found

      // Add creator as project owner
      await dbPool.query(`
        INSERT INTO project_members (project_id, user_id, role_id)
        VALUES ($1, $2, $3)
      `, [newProject.id, userId, roleId]);

      systemLogger.info('Project created', {
        userId,
        projectId: newProject.id,
        projectName: name
      });

      res.status(201).json(newProject);
    } catch (error) {
      systemLogger.error('Error creating project', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // Update project
  router.put('/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { name, description, parent_id, is_archived, metadata, settings } = req.body;

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
      if (parent_id !== undefined) {
        updates.push(`parent_id = $${paramIndex}`);
        params.push(parent_id);
        paramIndex++;
      }
      if (is_archived !== undefined) {
        updates.push(`is_archived = $${paramIndex}`);
        params.push(is_archived);
        paramIndex++;
      }
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIndex}`);
        params.push(JSON.stringify(metadata));
        paramIndex++;
      }
      if (settings !== undefined) {
        updates.push(`settings = $${paramIndex}`);
        params.push(JSON.stringify(settings));
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(projectId);
      const query = `
        UPDATE projects 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await dbPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      systemLogger.info('Project updated', {
        userId: req.user?.id,
        projectId
      });

      res.json(result.rows[0]);
    } catch (error) {
      systemLogger.error('Error updating project', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // Delete project
  router.delete('/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params;

      // Check if project has resources
      const resourceCheck = await dbPool.query(`
        SELECT 
          (SELECT COUNT(*) FROM files WHERE project_id = $1) as file_count,
          (SELECT COUNT(*) FROM workflow_steps WHERE project_id = $1) as workflow_count,
          (SELECT COUNT(*) FROM transformation_mappings WHERE project_id = $1) as mapping_count
      `, [projectId]);

      const counts = resourceCheck.rows[0];
      const totalResources = parseInt(counts.file_count) + 
                            parseInt(counts.workflow_count) + 
                            parseInt(counts.mapping_count);

      if (totalResources > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete project with associated resources',
          resourceCounts: counts
        });
      }

      const result = await dbPool.query(
        'DELETE FROM projects WHERE id = $1 RETURNING *',
        [projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      systemLogger.info('Project deleted', {
        userId: req.user?.id,
        projectId
      });

      res.json({ message: 'Project deleted successfully' });
    } catch (error) {
      systemLogger.error('Error deleting project', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // Add member to project
  router.post('/:projectId/members', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { user_id, role } = req.body;

      if (!user_id || !role) {
        return res.status(400).json({ error: 'user_id and role are required' });
      }

      // Get role_id from roles table
      const roleResult = await dbPool.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', [role]);
      
      if (!roleResult.rows[0]) {
        return res.status(400).json({ error: `Invalid role: ${role}` });
      }
      
      const roleId = roleResult.rows[0].id;

      const result = await dbPool.query(`
        INSERT INTO project_members (project_id, user_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, user_id, role_id) 
        DO UPDATE SET updated_at = NOW()
        RETURNING *
      `, [projectId, user_id, roleId]);

      systemLogger.info('Project member added', {
        userId: req.user?.id,
        projectId,
        memberId: user_id,
        role
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      systemLogger.error('Error adding project member', error);
      res.status(500).json({ error: 'Failed to add project member' });
    }
  });

  // Remove member from project
  router.delete('/:projectId/members/:userId', async (req, res) => {
    try {
      const { projectId, userId } = req.params;

      const result = await dbPool.query(
        'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING *',
        [projectId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project member not found' });
      }

      systemLogger.info('Project member removed', {
        userId: req.user?.id,
        projectId,
        removedUserId: userId
      });

      res.json({ message: 'Member removed successfully' });
    } catch (error) {
      systemLogger.error('Error removing project member', error);
      res.status(500).json({ error: 'Failed to remove project member' });
    }
  });

  return router;
}

module.exports = createProjectRoutes;
