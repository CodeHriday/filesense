/**
 * Project Management Routes
 * 
 * REST API for managing projects (workspaces)
 */

const express = require('express');
const { systemLogger } = require('../utils/logger');

function createProjectRoutes(dbPool) {
  const router = express.Router();

  // List all projects with member and group counts
  router.get('/', async (req, res) => {
    try {
      const { archived, search, project_type } = req.query;
      const userId = req.user?.id;
      
      // Check if user is admin
      const isAdmin = req.user?.roles?.includes('Admin') || false;
      
      let query = `
        SELECT 
          p.*,
          COUNT(DISTINCT pm.user_id) as member_count,
          COUNT(DISTINCT pag.group_id) as group_count,
          (SELECT COUNT(*) FROM projects sub WHERE sub.parent_id = p.id) as sub_project_count
        FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN project_access_groups pag ON p.id = pag.project_id
      `;
      
      const params = [];
      let paramIndex = 1;
      
      // Non-admin users can only see projects they have access to
      if (!isAdmin) {
        query += `
        WHERE p.id IN (
          -- Projects where user is a direct member
          SELECT project_id FROM project_members WHERE user_id = $${paramIndex}
          UNION
          -- Projects accessible via user's access groups
          SELECT pag2.project_id 
          FROM project_access_groups pag2
          INNER JOIN user_groups ug ON pag2.group_id = ug.group_id
          WHERE ug.user_id = $${paramIndex}
        )
        AND p.parent_id IS NULL
        `;
        params.push(userId);
        paramIndex++;
      } else {
        query += ' WHERE p.parent_id IS NULL';
      }

      if (archived !== undefined) {
        query += ` AND p.is_archived = $${paramIndex}`;
        params.push(archived === 'true');
        paramIndex++;
      }

      if (search) {
        query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (project_type) {
        query += ` AND p.project_type = $${paramIndex}`;
        params.push(project_type);
        paramIndex++;
      }

      query += ' GROUP BY p.id ORDER BY p.created_at DESC';

      const result = await dbPool.query(query, params);
      
      // Fetch sub-projects for each project
      const projectsWithSubs = await Promise.all(result.rows.map(async (project) => {
        const subProjectsResult = await dbPool.query(`
          SELECT 
            p.*,
            u.username as owner_name,
            COALESCE(SUM(fc.file_size), 0) as total_size,
            COUNT(fc.id) as file_count
          FROM projects p
          LEFT JOIN users u ON p.owner_id = u.id
          LEFT JOIN file_catalog fc ON fc.project_id = p.id
          WHERE p.parent_id = $1
          GROUP BY p.id, u.username
          ORDER BY p.created_at DESC
        `, [project.id]);

        return {
          ...project,
          member_count: parseInt(project.member_count) || 0,
          group_count: parseInt(project.group_count) || 0,
          sub_project_count: parseInt(project.sub_project_count) || 0,
          sub_projects: subProjectsResult.rows.map(sp => ({
            ...sp,
            total_size: parseInt(sp.total_size) || 0,
            file_count: parseInt(sp.file_count) || 0
          }))
        };
      }));
      
      systemLogger.info('Projects listed', {
        userId: req.user?.id,
        isAdmin,
        count: result.rows.length
      });

      res.json(projectsWithSubs);
    } catch (error) {
      systemLogger.error('Error listing projects', error);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  // Get single project with members and groups
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
          u.full_name,
          r.name as role_name
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE pm.project_id = $1
        ORDER BY pm.created_at DESC
      `, [projectId]);

      const groupsResult = await dbPool.query(`
        SELECT 
          pag.*,
          ag.name as group_name,
          ag.description as group_description,
          ag.group_type
        FROM project_access_groups pag
        JOIN access_groups ag ON pag.group_id = ag.id
        WHERE pag.project_id = $1
        ORDER BY pag.created_at DESC
      `, [projectId]);

      const project = projectResult.rows[0];
      project.members = membersResult.rows;
      project.access_groups = groupsResult.rows;

      res.json(project);
    } catch (error) {
      systemLogger.error('Error fetching project', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // Create new project
  router.post('/', async (req, res) => {
    const client = await dbPool.connect();
    try {
      const { name, description, parent_id, is_default, project_type, metadata, settings, member_ids, group_ids, sub_projects } = req.body;
      const userId = req.user?.id;

      if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO projects (name, description, parent_id, owner_id, is_default, project_type, metadata, settings)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [name, description, parent_id || null, userId, is_default || false, project_type || 'internal', metadata || {}, settings || {}]);

      const newProject = result.rows[0];

      // Add creator as project member (permissions are determined by their global role)
      await client.query(`
        INSERT INTO project_members (project_id, user_id)
        VALUES ($1, $2)
      `, [newProject.id, userId]);

      // Add additional members if provided
      if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
        const memberValues = member_ids
          .filter(id => id !== userId) // Don't duplicate creator
          .map(id => `(${newProject.id}, ${parseInt(id, 10)})`)
          .join(', ');
        
        if (memberValues) {
          await client.query(`
            INSERT INTO project_members (project_id, user_id)
            VALUES ${memberValues}
            ON CONFLICT (project_id, user_id) DO NOTHING
          `);
        }
      }

      // Add access groups if provided
      if (group_ids && Array.isArray(group_ids) && group_ids.length > 0) {
        const groupValues = group_ids
          .map(id => `(${newProject.id}, ${parseInt(id, 10)})`)
          .join(', ');
        
        await client.query(`
          INSERT INTO project_access_groups (project_id, group_id)
          VALUES ${groupValues}
          ON CONFLICT (project_id, group_id) DO NOTHING
        `);
      }

      // Create sub-projects if provided
      if (sub_projects && Array.isArray(sub_projects) && sub_projects.length > 0) {
        for (const subProject of sub_projects) {
          if (subProject.name && subProject.name.trim()) {
            await client.query(`
              INSERT INTO projects (name, description, parent_id, owner_id, is_active, project_type)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              subProject.name.trim(),
              subProject.description || null,
              newProject.id,
              userId,
              subProject.is_active !== undefined ? subProject.is_active : true,
              project_type || 'internal'
            ]);
          }
        }
      }

      await client.query('COMMIT');

      systemLogger.info('Project created', {
        userId,
        projectId: newProject.id,
        projectName: name,
        memberCount: (member_ids?.length || 0) + 1, // +1 for creator
        groupCount: group_ids?.length || 0,
        subProjectCount: sub_projects?.length || 0
      });

      res.status(201).json(newProject);
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating project', error);
      res.status(500).json({ error: 'Failed to create project' });
    } finally {
      client.release();
    }
  });

  // Update project
  router.put('/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { name, description, parent_id, is_archived, project_type, metadata, settings } = req.body;

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
      if (project_type !== undefined) {
        updates.push(`project_type = $${paramIndex}`);
        params.push(project_type);
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
          (SELECT COUNT(*) FROM transformation_mappings WHERE project_id = $1) as mapping_count,
          (SELECT COUNT(*) FROM storage_connections WHERE project_id = $1) as connection_count,
          (SELECT COUNT(*) FROM vendor_agreements WHERE project_id = $1) as agreement_count
      `, [projectId]);

      const counts = resourceCheck.rows[0];
      const totalResources = parseInt(counts.file_count) + 
                            parseInt(counts.workflow_count) + 
                            parseInt(counts.mapping_count) +
                            parseInt(counts.connection_count) +
                            parseInt(counts.agreement_count);

      if (totalResources > 0) {
        const dependencies = [];
        if (parseInt(counts.file_count) > 0) dependencies.push(`${counts.file_count} file(s)`);
        if (parseInt(counts.workflow_count) > 0) dependencies.push(`${counts.workflow_count} workflow(s)`);
        if (parseInt(counts.mapping_count) > 0) dependencies.push(`${counts.mapping_count} transformation mapping(s)`);
        if (parseInt(counts.connection_count) > 0) dependencies.push(`${counts.connection_count} storage connection(s)`);
        if (parseInt(counts.agreement_count) > 0) dependencies.push(`${counts.agreement_count} vendor agreement(s)`);
        
        return res.status(400).json({ 
          error: `Cannot delete project - it has ${dependencies.join(', ')}. Please remove these dependencies first.`,
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
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Simply add user to project (their global role defines permissions)
      const result = await dbPool.query(`
        INSERT INTO project_members (project_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT ON CONSTRAINT project_members_project_user_unique 
        DO UPDATE SET updated_at = NOW()
        RETURNING *
      `, [projectId, user_id]);

      systemLogger.info('Project member added', {
        userId: req.user?.id,
        projectId,
        memberId: user_id
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

  // Add access group to project
  router.post('/:projectId/groups', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { group_id } = req.body;
      const userId = req.user?.id;

      if (!group_id) {
        return res.status(400).json({ error: 'group_id is required' });
      }

      const result = await dbPool.query(`
        INSERT INTO project_access_groups (project_id, group_id, added_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, group_id) DO NOTHING
        RETURNING *
      `, [projectId, group_id, userId]);

      systemLogger.info('Access group added to project', {
        userId,
        projectId,
        groupId: group_id
      });

      res.status(201).json(result.rows[0] || { project_id: projectId, group_id });
    } catch (error) {
      systemLogger.error('Error adding access group to project', error);
      res.status(500).json({ error: 'Failed to add access group to project' });
    }
  });

  // Remove access group from project
  router.delete('/:projectId/groups/:groupId', async (req, res) => {
    try {
      const { projectId, groupId } = req.params;

      const result = await dbPool.query(
        'DELETE FROM project_access_groups WHERE project_id = $1 AND group_id = $2 RETURNING *',
        [projectId, groupId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Access group not found in project' });
      }

      systemLogger.info('Access group removed from project', {
        userId: req.user?.id,
        projectId,
        groupId
      });

      res.json({ message: 'Access group removed successfully' });
    } catch (error) {
      systemLogger.error('Error removing access group from project', error);
      res.status(500).json({ error: 'Failed to remove access group from project' });
    }
  });

  return router;
}

module.exports = createProjectRoutes;
