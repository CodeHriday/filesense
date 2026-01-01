/**
 * Project Management Routes
 * 
 * REST API for managing projects (workspaces)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { systemLogger } = require('../utils/logger');
const { createIdempotencyMiddleware } = require('../src/middleware/idempotency');
const AuditService = require('../services/AuditService');
const { userHasAllProjectAccess } = require('../utils/permissionHelpers');

function createProjectRoutes(dbPool) {
  const router = express.Router();
  const auditService = new AuditService(dbPool);
  
  const projectIdempotency = createIdempotencyMiddleware({
    ttlHours: 24,
    resourceType: 'project'
  });
  
  const hourlyRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
      error: 'Rate limit exceeded',
      message: 'You can only create 10 projects per hour. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `project-create-hourly:${req.user?.id || req.ip}`,
    skip: (req) => !req.user,
    handler: async (req, res) => {
      const { name, description, project_type } = req.body;
      const userId = req.user?.id;
      
      // Calculate payload hash for tracking
      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ name, description, project_type }))
        .digest('hex');
      
      // Log rate limit violation to audit trail
      await auditService.logAction({
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        actionType: 'project_create',
        entityType: 'project',
        entityId: 'N/A',
        entityName: name || 'Unknown',
        operation: 'CREATE',
        oldValues: null,
        newValues: { name, description, project_type },
        metadata: {
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          payload_hash: payloadHash,
          idempotency_key: req.get('Idempotency-Key'),
          rate_limit_type: 'hourly',
          rate_limit_max: 10,
          rate_limit_window: '1 hour'
        },
        status: 'RATE_LIMITED',
        errorMessage: 'Hourly rate limit exceeded',
        context: {
          ipAddress: req.ip,
          sessionId: req.sessionID,
          requestId: req.id,
          userId,
          userEmail: req.user?.email,
          userRole: req.user?.role
        }
      });
      
      systemLogger.warn('Hourly rate limit exceeded for project creation', {
        userId,
        ip: req.ip
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'You can only create 10 projects per hour. Please try again later.',
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
      });
    }
  });
  
  const burstRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: {
      error: 'Rate limit exceeded',
      message: 'Too many project creations. Maximum 3 per minute. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `project-create-burst:${req.user?.id || req.ip}`,
    skip: (req) => !req.user,
    handler: async (req, res) => {
      const { name, description, project_type } = req.body;
      const userId = req.user?.id;
      
      // Calculate payload hash for tracking
      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ name, description, project_type }))
        .digest('hex');
      
      // Log rate limit violation to audit trail
      await auditService.logAction({
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        actionType: 'project_create',
        entityType: 'project',
        entityId: 'N/A',
        entityName: name || 'Unknown',
        operation: 'CREATE',
        oldValues: null,
        newValues: { name, description, project_type },
        metadata: {
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          payload_hash: payloadHash,
          idempotency_key: req.get('Idempotency-Key'),
          rate_limit_type: 'burst',
          rate_limit_max: 3,
          rate_limit_window: '1 minute'
        },
        status: 'RATE_LIMITED',
        errorMessage: 'Burst rate limit exceeded',
        context: {
          ipAddress: req.ip,
          sessionId: req.sessionID,
          requestId: req.id,
          userId,
          userEmail: req.user?.email,
          userRole: req.user?.role
        }
      });
      
      systemLogger.warn('Burst rate limit exceeded for project creation', {
        userId,
        ip: req.ip
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many project creations. Maximum 3 per minute. Please slow down.',
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
      });
    }
  });

  // List all projects with member and group counts
  router.get('/', async (req, res) => {
    try {
      const { archived, search, project_type } = req.query;
      const userId = req.user?.id;
      
      // Check if user has admin-level access (permission-based, not role-name based)
      const isAdmin = userHasAllProjectAccess(req.user);
      
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
            u.username as owner_name
          FROM projects p
          LEFT JOIN users u ON p.owner_id = u.id
          WHERE p.parent_id = $1
          ORDER BY p.created_at DESC
        `, [project.id]);

        return {
          ...project,
          member_count: parseInt(project.member_count) || 0,
          group_count: parseInt(project.group_count) || 0,
          sub_project_count: parseInt(project.sub_project_count) || 0,
          sub_projects: subProjectsResult.rows.map(sp => ({
            ...sp,
            total_size: 0,
            file_count: 0
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

  /**
   * GET /api/projects/init-data
   * Batch endpoint to get all data needed for ProjectManagement page in a single call
   * Replaces 3 separate API calls: projects, users, groups
   * Permission-aware: Non-admin users only see projects they have access to
   * NOTE: This route MUST be defined before /:projectId to avoid route conflict
   */
  router.get('/init-data', async (req, res) => {
    try {
      const { search, archived } = req.query;
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      
      const isAdmin = userHasAllProjectAccess(req.user);
      let accessibleProjectIds = [];
      
      if (!isAdmin) {
        const userProjects = await getUserProjects(req.user.id);
        accessibleProjectIds = userProjects.map(p => p.id);
        
        // Non-admin with no project access gets empty data
        if (accessibleProjectIds.length === 0) {
          return res.json({
            projects: [],
            users: [],
            groups: []
          });
        }
      }
      
      // Build projects query
      let projectsQuery = `
        SELECT 
          p.*,
          parent.name as parent_project_name,
          COUNT(DISTINCT pm.user_id) as member_count,
          COUNT(DISTINCT sp.id) as sub_project_count
        FROM projects p
        LEFT JOIN projects parent ON p.parent_id = parent.id
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN projects sp ON p.id = sp.parent_id
        WHERE 1=1
      `;
      const projectsParams = [];
      let paramIndex = 1;
      
      // Always filter by accessible projects for non-admins
      if (!isAdmin) {
        projectsQuery += ` AND p.id = ANY($${paramIndex})`;
        projectsParams.push(accessibleProjectIds);
        paramIndex++;
      }
      
      if (search) {
        projectsQuery += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
        projectsParams.push(`%${search}%`);
        paramIndex++;
      }
      
      if (archived === 'true') {
        projectsQuery += ` AND p.is_archived = true`;
      } else {
        projectsQuery += ` AND (p.is_archived IS NULL OR p.is_archived = false)`;
      }
      
      projectsQuery += ` GROUP BY p.id, parent.name ORDER BY p.created_at DESC`;
      
      // Fetch all data in parallel
      const [projectsResult, usersResult, groupsResult] = await Promise.all([
        dbPool.query(projectsQuery, projectsParams),
        dbPool.query('SELECT id, username, email, full_name FROM users ORDER BY username LIMIT 1000'),
        dbPool.query('SELECT id, name, description FROM access_groups ORDER BY name')
      ]);
      
      systemLogger.info('Project management init data fetched', {
        userId: req.user?.id,
        projectCount: projectsResult.rows.length
      });

      res.json({
        projects: projectsResult.rows,
        users: usersResult.rows,
        groups: groupsResult.rows
      });
    } catch (error) {
      systemLogger.error('Error in GET /api/projects/init-data', error);
      res.status(500).json({ error: 'Failed to fetch project management data' });
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
  router.post('/', burstRateLimit, hourlyRateLimit, projectIdempotency, async (req, res) => {
    const client = await dbPool.connect();
    try {
      const { name, description, parent_id, is_default, project_type, metadata, settings, member_ids, group_ids, sub_projects, drop_location_bucket, drop_location_prefix, drop_location_connection_id } = req.body;
      const userId = req.user?.id;

      if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      if (!name.trim()) {
        return res.status(400).json({ error: 'Project name cannot be empty' });
      }

      await client.query('BEGIN');

      const duplicateCheck = await client.query(`
        SELECT id, name FROM projects 
        WHERE owner_id = $1 AND LOWER(name) = LOWER($2)
      `, [userId, name.trim()]);

      if (duplicateCheck.rows.length > 0) {
        const existingProjectId = duplicateCheck.rows[0].id;
        const existingProjectName = duplicateCheck.rows[0].name;
        
        await client.query('ROLLBACK');
        client.release(); // Release connection before audit logging
        
        // Calculate payload hash for tracking
        const payloadHash = crypto
          .createHash('sha256')
          .update(JSON.stringify({ name: name.trim(), description, project_type, parent_id }))
          .digest('hex');
        
        // Log duplicate attempt to audit trail after client is fully released
        // Use setImmediate to ensure connection is back in pool before audit reuses it
        setImmediate(async () => {
          try {
            await auditService.logAction({
              userId,
              userEmail: req.user?.email,
              userRole: req.user?.role,
              actionType: 'project_create',
              entityType: 'project',
              entityId: 'N/A',
              entityName: name.trim(),
              operation: 'CREATE',
              oldValues: null,
              newValues: { name: name.trim(), description, project_type, parent_id },
              metadata: {
                ip_address: req.ip,
                user_agent: req.get('user-agent'),
                payload_hash: payloadHash,
                idempotency_key: req.get('Idempotency-Key'),
                existing_project_id: existingProjectId,
                existing_project_name: existingProjectName
              },
              status: 'FAILED',
              errorMessage: 'Duplicate project name',
              context: {
                ipAddress: req.ip,
                sessionId: req.sessionID,
                requestId: req.id,
                userId,
                userEmail: req.user?.email,
                userRole: req.user?.role
              }
            });
          } catch (auditError) {
            systemLogger.error('Failed to log duplicate project attempt to audit', {
              userId,
              projectName: name.trim(),
              error: auditError.message
            });
          }
        });
        
        return res.status(409).json({ 
          error: 'Duplicate project name',
          message: `You already have a project named "${existingProjectName}". Please choose a different name.`
        });
      }

      const result = await client.query(`
        INSERT INTO projects (name, description, parent_id, owner_id, is_default, project_type, metadata, settings, drop_location_bucket, drop_location_prefix, drop_location_connection_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [name.trim(), description, parent_id || null, userId, is_default || false, project_type || 'internal', metadata || {}, settings || {}, drop_location_bucket || null, drop_location_prefix || null, drop_location_connection_id || null]);

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

      // Calculate payload hash for duplicate detection
      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ name: name.trim(), description, project_type, parent_id }))
        .digest('hex');

      // Log successful project creation to audit trail
      await auditService.logAction({
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        actionType: 'project_create',
        entityType: 'project',
        entityId: newProject.id.toString(),
        entityName: name.trim(),
        operation: 'CREATE',
        oldValues: null,
        newValues: {
          id: newProject.id,
          name: name.trim(),
          description,
          project_type: project_type || 'internal',
          parent_id,
          member_count: (member_ids?.length || 0) + 1,
          group_count: group_ids?.length || 0,
          sub_project_count: sub_projects?.length || 0
        },
        metadata: {
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          payload_hash: payloadHash,
          idempotency_key: req.get('Idempotency-Key')
        },
        status: 'SUCCESS',
        context: {
          ipAddress: req.ip,
          sessionId: req.sessionID,
          requestId: req.id,
          userId,
          userEmail: req.user?.email,
          userRole: req.user?.role
        },
        client
      });

      // Check for creation spike (>5 attempts in 5 minutes, including rate-limited and failed attempts)
      const spikeCheck = await client.query(`
        SELECT COUNT(*) as recent_count
        FROM audit_log
        WHERE user_id = $1
          AND action_type = 'project_create'
          AND status IN ('SUCCESS', 'FAILED', 'RATE_LIMITED')
          AND timestamp > NOW() - INTERVAL '5 minutes'
      `, [userId]);

      const recentCreations = parseInt(spikeCheck.rows[0]?.recent_count || 0);
      
      if (recentCreations > 5) {
        systemLogger.warn('Project creation spike detected', {
          userId,
          userEmail: req.user?.email,
          recentCreations,
          threshold: 5,
          timeWindow: '5 minutes'
        });
        
        // Log security event
        await auditService.logSecurityEvent({
          userId,
          userEmail: req.user?.email,
          userRole: req.user?.role,
          eventType: 'SUSPICIOUS_ACTIVITY',
          severity: 'MEDIUM',
          description: `User created ${recentCreations} projects in 5 minutes`,
          metadata: {
            recent_creations: recentCreations,
            threshold: 5,
            time_window: '5 minutes',
            ip_address: req.ip
          },
          context: {
            ipAddress: req.ip,
            sessionId: req.sessionID,
            requestId: req.id,
            userId,
            userEmail: req.user?.email,
            userRole: req.user?.role
          },
          client
        });
      }

      systemLogger.info('Project created', {
        userId,
        projectId: newProject.id,
        projectName: name,
        memberCount: (member_ids?.length || 0) + 1,
        groupCount: group_ids?.length || 0,
        subProjectCount: sub_projects?.length || 0,
        recentCreations
      });

      res.status(201).json(newProject);
    } catch (error) {
      await client.query('ROLLBACK');
      
      const userId = req.user?.id;
      const { name, description, project_type } = req.body;
      
      // Calculate payload hash for tracking
      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ name, description, project_type }))
        .digest('hex');
      
      if (error.code === '23505' && error.constraint === 'idx_projects_owner_name_unique') {
        // Log duplicate attempt to audit trail
        await auditService.logAction({
          userId,
          userEmail: req.user?.email,
          userRole: req.user?.role,
          actionType: 'project_create',
          entityType: 'project',
          entityId: 'N/A',
          entityName: name,
          operation: 'CREATE',
          oldValues: null,
          newValues: { name, description, project_type },
          metadata: {
            ip_address: req.ip,
            user_agent: req.get('user-agent'),
            payload_hash: payloadHash,
            idempotency_key: req.get('Idempotency-Key'),
            error_code: error.code,
            constraint: error.constraint
          },
          status: 'FAILED',
          errorMessage: 'Duplicate project name',
          context: {
            ipAddress: req.ip,
            sessionId: req.sessionID,
            requestId: req.id,
            userId,
            userEmail: req.user?.email,
            userRole: req.user?.role
          }
        });
        
        systemLogger.warn('Duplicate project creation attempt', {
          userId,
          projectName: name,
          error: error.message
        });
        return res.status(409).json({ 
          error: 'Duplicate project name',
          message: `You already have a project with this name. Please choose a different name.`
        });
      }
      
      // Log general error to audit trail
      await auditService.logAction({
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        actionType: 'project_create',
        entityType: 'project',
        entityId: 'N/A',
        entityName: name || 'Unknown',
        operation: 'CREATE',
        oldValues: null,
        newValues: { name, description, project_type },
        metadata: {
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          payload_hash: payloadHash,
          idempotency_key: req.get('Idempotency-Key'),
          error_code: error.code,
          error_name: error.name
        },
        status: 'FAILED',
        errorMessage: error.message,
        context: {
          ipAddress: req.ip,
          sessionId: req.sessionID,
          requestId: req.id,
          userId,
          userEmail: req.user?.email,
          userRole: req.user?.role
        }
      });
      
      systemLogger.error('Error creating project', {
        userId,
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Failed to create project' });
    } finally {
      client.release();
    }
  });

  // Get project members (all users assigned to a project - direct and group-based)
  router.get('/:projectId/members', async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Fetch all users who are members of this project (direct + group-based)
      const result = await dbPool.query(`
        SELECT DISTINCT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.full_name
        FROM users u
        WHERE u.id IN (
          -- Direct project members
          SELECT user_id FROM project_members WHERE project_id = $1
          UNION
          -- Group-based project members
          SELECT ug.user_id 
          FROM project_access_groups pag
          INNER JOIN user_groups ug ON pag.group_id = ug.group_id
          WHERE pag.project_id = $1
        )
        ORDER BY u.full_name, u.email
      `, [projectId]);

      res.json({ members: result.rows });
    } catch (error) {
      systemLogger.error('Error fetching project members', error);
      res.status(500).json({ error: 'Failed to fetch project members' });
    }
  });

  // Get vendor agreements with file schemas for a project (for contract validation)
  router.get('/:projectId/vendor-agreements-with-schemas', async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Fetch approved vendor agreements for this project with their file schemas
      const result = await dbPool.query(`
        SELECT 
          va.id,
          va.vendor_id,
          va.project_id,
          va.agreement_code,
          va.file_name,
          va.file_description,
          va.primary_contact_email,
          va.secondary_contact_email,
          v.vendor_name,
          v.vendor_code,
          json_agg(
            json_build_object(
              'id', vafs.id,
              'file_name_pattern', vafs.file_name_pattern,
              'file_type', vafs.file_type,
              'schema', vafs.schema,
              'priority', vafs.priority,
              'contains_pii', vafs.contains_pii,
              'data_classification', vafs.data_classification,
              'quality_rule_ids', vafs.quality_rule_ids
            )
            ORDER BY vafs.priority ASC
          ) FILTER (WHERE vafs.id IS NOT NULL) as file_schemas
        FROM vendor_agreements va
        LEFT JOIN vendors v ON va.vendor_id = v.id
        LEFT JOIN vendor_agreement_file_schemas vafs ON va.id = vafs.vendor_agreement_id AND vafs.is_active = true
        WHERE va.project_id = $1 
          AND va.approval_status IN ('manager_approved', 'governance_approved')
          AND va.status = 'active'
        GROUP BY va.id, va.vendor_id, va.project_id, va.agreement_code, va.file_name, va.file_description, va.primary_contact_email, va.secondary_contact_email, v.vendor_name, v.vendor_code
        ORDER BY v.vendor_name, va.file_name
      `, [projectId]);

      const agreements = result.rows.map(row => ({
        ...row,
        fileSchemas: (row.file_schemas || []).map(fileSchema => ({
          ...fileSchema,
          // Ensure schema is parsed as JSON array if it's a string
          schema: typeof fileSchema.schema === 'string' 
            ? JSON.parse(fileSchema.schema) 
            : fileSchema.schema
        }))
      }));

      res.json({ agreements });
    } catch (error) {
      systemLogger.error('Error fetching vendor agreements with schemas', error);
      res.status(500).json({ error: 'Failed to fetch vendor agreements' });
    }
  });

  // Update project
  router.put('/:projectId', async (req, res) => {
    try {
      const { projectId } = req.params;
      const { name, description, parent_id, is_archived, project_type, metadata, settings, drop_location_bucket, drop_location_prefix, drop_location_connection_id } = req.body;

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
      if (drop_location_bucket !== undefined) {
        updates.push(`drop_location_bucket = $${paramIndex}`);
        params.push(drop_location_bucket || null);
        paramIndex++;
      }
      if (drop_location_prefix !== undefined) {
        updates.push(`drop_location_prefix = $${paramIndex}`);
        params.push(drop_location_prefix || null);
        paramIndex++;
      }
      if (drop_location_connection_id !== undefined) {
        updates.push(`drop_location_connection_id = $${paramIndex}`);
        params.push(drop_location_connection_id || null);
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
