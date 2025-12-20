const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const visualMappingCompiler = require('../services/visualMappingCompiler');
const { v4: uuidv4 } = require('uuid');
const EmailProviderFactory = require('../services/email/EmailProviderFactory');
const emailComposer = require('../services/EmailComposer');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

/**
 * Send email notification for visual mapping execution
 * @param {Object} mapping - Visual mapping with notification_settings
 * @param {Object} jobResult - Execution result { status, jobId, message, rowsWritten, etc }
 * @param {string} executionId - Execution ID for tracking
 */
async function sendVisualMappingNotification(mapping, jobResult, executionId) {
  try {
    // Parse notification settings if needed
    let notificationSettings = mapping.notification_settings;
    if (typeof notificationSettings === 'string') {
      notificationSettings = JSON.parse(notificationSettings);
    }
    
    // Check if notifications are enabled
    if (!notificationSettings?.enabled) {
      return;
    }
    
    const isSuccess = jobResult.status === 'completed';
    const shouldNotify = (isSuccess && notificationSettings.notifyOnSuccess) || 
                         (!isSuccess && notificationSettings.notifyOnFailure);
    
    if (!shouldNotify) {
      systemLogger.debug('Skipping notification - condition not met', {
        isSuccess,
        notifyOnSuccess: notificationSettings.notifyOnSuccess,
        notifyOnFailure: notificationSettings.notifyOnFailure
      });
      return;
    }
    
    // Get email connection details
    const emailConnectionId = notificationSettings.emailConnectionId;
    if (!emailConnectionId) {
      systemLogger.warn('No email connection configured for visual mapping notification', {
        mappingId: mapping.id
      });
      return;
    }
    
    // Fetch email connection from storage_connections table (email connections are stored there)
    const connectionResult = await pool.query(
      `SELECT connection_id, type, name, config, status FROM storage_connections WHERE connection_id = $1`,
      [emailConnectionId]
    );
    
    if (connectionResult.rows.length === 0) {
      systemLogger.error('Email connection not found for visual mapping notification', {
        emailConnectionId,
        mappingId: mapping.id
      });
      return;
    }
    
    const emailConnection = connectionResult.rows[0];
    
    // Check if connection is active
    if (emailConnection.status !== 'active') {
      systemLogger.warn('Email connection is not active for visual mapping notification', {
        emailConnectionId,
        status: emailConnection.status,
        mappingId: mapping.id
      });
      return;
    }
    
    // Parse config (credentials are stored in config column)
    let config = emailConnection.config;
    if (typeof config === 'string') {
      config = JSON.parse(config);
    }
    
    systemLogger.debug('Sending visual mapping notification', {
      mappingId: mapping.id,
      emailConnectionId,
      providerType: emailConnection.type,
      recipientCount: notificationSettings.recipients?.split(',').length || 0
    });
    
    // Create email adapter using the connection type and config
    const adapter = EmailProviderFactory.createAdapter(emailConnection.type, config);
    
    // Compose email using EmailComposer
    const emailContent = await emailComposer.composeJobAlert({
      job: {
        name: mapping.name,
        id: executionId,
        project_name: mapping.project_name || 'Visual Mapping'
      },
      status: jobResult.status,
      error: jobResult.message || jobResult.error_message,
      duration: jobResult.duration || null,
      recordsProcessed: jobResult.rowsWritten || 0,
      qualityViolations: 0
    });
    
    // Parse recipients
    const recipients = notificationSettings.recipients
      ? notificationSettings.recipients.split(',').map(r => r.trim()).filter(r => r)
      : [];
    
    if (recipients.length === 0) {
      systemLogger.warn('No recipients configured for visual mapping notification', {
        mappingId: mapping.id
      });
      return;
    }
    
    // Send email (config may have 'from', 'from_email', or 'sender_email' depending on provider)
    const fromEmail = config.from || config.from_email || config.sender_email || 'noreply@filesense.app';
    const result = await adapter.send({
      from: fromEmail,
      to: recipients,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });
    
    systemLogger.info('Visual mapping notification sent', {
      mappingId: mapping.id,
      executionId,
      status: jobResult.status,
      recipients: recipients.length,
      success: result.success
    });
    
  } catch (error) {
    systemLogger.error('Failed to send visual mapping notification', {
      mappingId: mapping.id,
      executionId,
      error: error.message
    });
  }
}

/**
 * GET /api/visual-mappings
 * List all visual mappings (filtered by user's accessible projects)
 */
router.get('/', async (req, res) => {
  try {
    const { project_id, sub_project_id, is_active = true } = req.query;
    
    // Get user's accessible projects
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const projectIds = userProjects.map(p => p.id);
    
    // Admin bypass check - uses permission-based check for admin-equivalent roles
    const isAdmin = userHasAdminAccess(req.user);
    
    let query = `
      SELECT 
        vm.id, vm.name, vm.description, vm.graph_data, vm.canvas_state,
        vm.created_at, vm.updated_at, vm.is_active,
        vm.last_executed_at, vm.execution_count,
        vm.project_id, vm.sub_project_id,
        p.name as project_name,
        sp.name as sub_project_name,
        u.username as created_by_username
      FROM visual_mapping_defs vm
      LEFT JOIN projects p ON vm.project_id = p.id
      LEFT JOIN projects sp ON vm.sub_project_id = sp.id
      LEFT JOIN users u ON vm.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filter by accessible projects (admins bypass)
    if (!isAdmin && projectIds.length > 0) {
      query += ` AND vm.project_id = ANY($${paramIndex}::integer[])`;
      params.push(projectIds);
      paramIndex++;
    }
    
    if (project_id) {
      query += ` AND vm.project_id = $${paramIndex}`;
      params.push(parseInt(project_id));
      paramIndex++;
    }
    
    if (sub_project_id) {
      query += ` AND vm.sub_project_id = $${paramIndex}`;
      params.push(parseInt(sub_project_id));
      paramIndex++;
    }
    
    if (is_active !== undefined) {
      query += ` AND vm.is_active = $${paramIndex}`;
      params.push(is_active === 'true' || is_active === true);
      paramIndex++;
    }
    
    query += ` ORDER BY vm.updated_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Parse JSON fields for each mapping
    const mappings = result.rows.map(mapping => {
      if (typeof mapping.graph_data === 'string') {
        mapping.graph_data = JSON.parse(mapping.graph_data);
      }
      if (typeof mapping.canvas_state === 'string') {
        mapping.canvas_state = JSON.parse(mapping.canvas_state);
      }
      return mapping;
    });
    
    res.json(mappings);
  } catch (error) {
    systemLogger.error('Failed to fetch visual mappings', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch visual mappings' });
  }
});

/**
 * GET /api/visual-mappings/:id
 * Get a specific visual mapping
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        vm.*,
        p.name as project_name,
        sp.name as sub_project_name,
        u.username as created_by_username
       FROM visual_mapping_defs vm
       LEFT JOIN projects p ON vm.project_id = p.id
       LEFT JOIN projects sp ON vm.sub_project_id = sp.id
       LEFT JOIN users u ON vm.created_by = u.id
       WHERE vm.id = $1 AND vm.is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }

    // Check project access and parse JSON fields
    const mapping = result.rows[0];
    if (typeof mapping.graph_data === 'string') {
      mapping.graph_data = JSON.parse(mapping.graph_data);
    }
    if (typeof mapping.canvas_state === 'string') {
      mapping.canvas_state = JSON.parse(mapping.canvas_state);
    }
    if (typeof mapping.notification_settings === 'string') {
      mapping.notification_settings = JSON.parse(mapping.notification_settings);
    }
    if (mapping.project_id) {
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(req.user.id);
      const hasAccess = userProjects.some(p => p.id === mapping.project_id) || userHasAdminAccess(req.user);
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this visual mapping' });
      }
    }

    res.json(mapping);
  } catch (error) {
    systemLogger.error('Failed to fetch visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch visual mapping' });
  }
});

/**
 * POST /api/visual-mappings
 * Create a new visual mapping
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, graph_data, canvas_state, project_id, sub_project_id, notification_settings } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    // Validate graph structure
    if (!graph_data.nodes || !Array.isArray(graph_data.nodes)) {
      return res.status(400).json({ error: 'graph_data must contain a nodes array' });
    }
    if (!graph_data.edges || !Array.isArray(graph_data.edges)) {
      return res.status(400).json({ error: 'graph_data must contain an edges array' });
    }

    const result = await pool.query(
      `INSERT INTO visual_mapping_defs (name, description, graph_data, canvas_state, project_id, sub_project_id, created_by, notification_settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name, 
        description || '', 
        JSON.stringify(graph_data), 
        JSON.stringify(canvas_state || { zoom: 1, position: [0, 0] }), 
        project_id || null, 
        sub_project_id || null, 
        req.user.id,
        notification_settings ? JSON.stringify(notification_settings) : null
      ]
    );

    systemLogger.info('Created visual mapping', {
      mappingId: result.rows[0].id,
      name,
      projectId: project_id,
      userId: req.user.id
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to create visual mapping', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to create visual mapping' });
  }
});

/**
 * PUT /api/visual-mappings/:id
 * Update an existing visual mapping
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, graph_data, canvas_state, project_id, sub_project_id, notification_settings } = req.body;

    if (!name || !graph_data) {
      return res.status(400).json({ error: 'Name and graph_data are required' });
    }

    // Validate graph structure
    if (!graph_data.nodes || !Array.isArray(graph_data.nodes)) {
      return res.status(400).json({ error: 'graph_data must contain a nodes array' });
    }
    if (!graph_data.edges || !Array.isArray(graph_data.edges)) {
      return res.status(400).json({ error: 'graph_data must contain an edges array' });
    }

    const result = await pool.query(
      `UPDATE visual_mapping_defs
       SET name = $1, description = $2, graph_data = $3, canvas_state = $4, 
           project_id = $5, sub_project_id = $6, notification_settings = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND is_active = true
       RETURNING *`,
      [
        name, 
        description || '', 
        JSON.stringify(graph_data), 
        JSON.stringify(canvas_state || { zoom: 1, position: [0, 0] }),
        project_id || null, 
        sub_project_id || null, 
        notification_settings ? JSON.stringify(notification_settings) : null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }

    systemLogger.info('Updated visual mapping', {
      mappingId: id,
      name,
      projectId: project_id,
      userId: req.user.id
    });

    res.json(result.rows[0]);
  } catch (error) {
    systemLogger.error('Failed to update visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to update visual mapping' });
  }
});

/**
 * DELETE /api/visual-mappings/:id
 * Soft delete a visual mapping
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE visual_mapping_defs SET is_active = false, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }

    systemLogger.info('Deleted visual mapping', {
      mappingId: id,
      userId: req.user.id
    });

    res.json({ message: 'Visual mapping deleted successfully' });
  } catch (error) {
    systemLogger.error('Failed to delete visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to delete visual mapping' });
  }
});

/**
 * POST /api/visual-mappings/:id/clone
 * Clone a visual mapping with a new name
 */
router.post('/:id/clone', async (req, res) => {
  try {
    const { id } = req.params;
    const customName = req.body?.name;
    
    // Get the original mapping
    const originalResult = await pool.query(
      `SELECT * FROM visual_mapping_defs WHERE id = $1 AND is_active = true`,
      [id]
    );
    
    if (originalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }
    
    const original = originalResult.rows[0];
    
    // Parse graph_data if stored as string
    let graphData = original.graph_data;
    if (typeof graphData === 'string') {
      graphData = JSON.parse(graphData);
    }
    
    // Generate ID mapping for nodes (old ID -> new ID)
    // FIRST PASS: Build complete nodeIdMap before any replacements
    const nodeIdMap = {};
    const timestamp = Date.now();
    
    graphData.nodes.forEach((node, index) => {
      const newId = `${node.type}-${timestamp}-${index}`;
      nodeIdMap[node.id] = newId;
    });
    
    // Helper function to replace all node ID references in an object
    const replaceNodeIds = (obj) => {
      let objStr = JSON.stringify(obj);
      // Sort by ID length descending to prevent partial replacements
      const sortedEntries = Object.entries(nodeIdMap).sort((a, b) => b[0].length - a[0].length);
      sortedEntries.forEach(([oldId, newId]) => {
        const regex = new RegExp(oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        objStr = objStr.replace(regex, newId);
      });
      return JSON.parse(objStr);
    };
    
    // Replace all node ID references in the ENTIRE graph_data object first
    // This catches all metadata including selection state, console settings, etc.
    const fullyRemappedGraphData = replaceNodeIds(graphData);
    
    // SECOND PASS: Ensure node IDs and data.nodeId are explicitly set correctly
    fullyRemappedGraphData.nodes = fullyRemappedGraphData.nodes.map((node, index) => {
      const originalNode = graphData.nodes[index];
      const newId = nodeIdMap[originalNode.id];
      // Ensure the node's own ID is set correctly
      node.id = newId;
      if (node.data) {
        node.data.nodeId = newId;
      }
      return node;
    });
    
    // Ensure edges have correct source/target and proper ReactFlow edge ID format
    fullyRemappedGraphData.edges = fullyRemappedGraphData.edges.map((edge, index) => {
      const originalEdge = graphData.edges[index];
      const newSource = nodeIdMap[originalEdge.source] || edge.source;
      const newTarget = nodeIdMap[originalEdge.target] || edge.target;
      // Use handles (which may have been remapped by replaceNodeIds)
      const sourceHandle = edge.sourceHandle || 'output';
      const targetHandle = edge.targetHandle || 'input';
      // Maintain ReactFlow edge ID format with proper delimiters
      const newEdgeId = `reactflow__edge-${timestamp}-${newSource}__${sourceHandle}--${newTarget}__${targetHandle}`;
      
      edge.id = newEdgeId;
      edge.source = newSource;
      edge.target = newTarget;
      
      return edge;
    });
    
    // Generate new name
    const newName = customName || `(Copy) ${original.name}`;
    
    // Parse canvas_state if stored as string
    let canvasState = original.canvas_state;
    if (typeof canvasState === 'string') {
      canvasState = JSON.parse(canvasState);
    }
    
    // Parse notification_settings if stored as string
    let notificationSettings = original.notification_settings;
    if (typeof notificationSettings === 'string') {
      notificationSettings = JSON.parse(notificationSettings);
    }
    
    // Insert the cloned mapping
    const result = await pool.query(
      `INSERT INTO visual_mapping_defs (
        name, description, graph_data, canvas_state, 
        project_id, sub_project_id, created_by, notification_settings,
        execution_count, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, true)
      RETURNING *`,
      [
        newName,
        original.description || '',
        JSON.stringify(fullyRemappedGraphData),
        JSON.stringify(canvasState || { zoom: 1, position: [0, 0] }),
        original.project_id,
        original.sub_project_id,
        req.user.id,
        notificationSettings ? JSON.stringify(notificationSettings) : null
      ]
    );
    
    systemLogger.info('Cloned visual mapping', {
      originalMappingId: id,
      newMappingId: result.rows[0].id,
      newName,
      userId: req.user.id
    });
    
    res.status(201).json({
      success: true,
      mapping: result.rows[0],
      message: `Successfully cloned "${original.name}" as "${newName}"`
    });
  } catch (error) {
    systemLogger.error('Failed to clone visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to clone visual mapping' });
  }
});

/**
 * POST /api/visual-mappings/:id/execute
 * Execute a visual mapping (runs in background for large jobs)
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const clientExecutionId = req.body?.execution_id;
    
    console.log(`[VISUAL-MAPPING-EXECUTE] Starting execution for mapping ${id}`);
    
    // Get the mapping with project name for notification emails
    const mappingResult = await pool.query(
      `SELECT vm.*, p.name as project_name 
       FROM visual_mapping_defs vm
       LEFT JOIN projects p ON vm.project_id = p.id
       WHERE vm.id = $1 AND vm.is_active = true`,
      [id]
    );
    
    if (mappingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }
    
    const mapping = mappingResult.rows[0];
    
    // Parse JSON fields
    if (typeof mapping.graph_data === 'string') {
      mapping.graph_data = JSON.parse(mapping.graph_data);
    }
    
    // Compile the visual mapping into transformation mapping
    const compilationResult = visualMappingCompiler.compile(mapping);
    
    if (!compilationResult.success) {
      systemLogger.error('Visual mapping compilation failed', {
        mappingId: id,
        errors: compilationResult.errors
      });
      return res.status(400).json({
        error: 'Visual mapping validation failed',
        errors: compilationResult.errors
      });
    }
    
    // Extract the compiled transformation mapping
    const transformationMapping = compilationResult.transformationMapping;
    
    // Check if there's already a running execution for this mapping
    const runningCheck = await pool.query(
      `SELECT execution_id FROM visual_mapping_executions 
       WHERE mapping_id = $1 AND status = 'running' 
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    
    if (runningCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Mapping is already executing',
        executionId: runningCheck.rows[0].execution_id,
        message: 'Please wait for the current execution to complete or check its status.'
      });
    }
    
    // Use client-provided execution ID if available
    const executionId = clientExecutionId || uuidv4();
    await pool.query(
      `INSERT INTO visual_mapping_executions (execution_id, mapping_id, status, triggered_by)
       VALUES ($1, $2, 'running', $3)`,
      [executionId, id, req.user.id]
    );
    
    // Create initial execution log record
    const runId = `vmrun-${Date.now()}`;
    await pool.query(
      `INSERT INTO visual_mapping_execution_logs 
       (mapping_id, run_id, run_name, started_at, status, logs, execution_id)
       VALUES ($1, $2, $3, NOW(), 'running', $4, $5)`,
      [id, runId, mapping.name, JSON.stringify([
        { timestamp: new Date().toISOString(), level: 'INFO', message: `Starting visual mapping execution: ${mapping.name}` }
      ]), executionId]
    );
    
    // Update last executed timestamp and increment execution count
    await pool.query(
      `UPDATE visual_mapping_defs 
       SET last_executed_at = NOW(), execution_count = execution_count + 1
       WHERE id = $1`,
      [id]
    );
    
    systemLogger.info('Visual mapping compiled successfully, starting background execution', {
      mappingId: id,
      executionId,
      userId: req.user.id
    });
    
    // Check user has permission to execute in this project
    const { getUserProjects } = require('../middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const hasAccess = userProjects.some(p => p.id === mapping.project_id) || userHasAdminAccess(req.user);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to execute this visual mapping' });
    }
    
    // Return immediately with execution ID
    res.json({
      message: 'Visual mapping execution started',
      execution_id: executionId,
      run_id: runId,
      mapping_id: id,
      mapping_name: mapping.name,
      status: 'running',
      async: true
    });
    
    // Run execution in background (fire and forget)
    setImmediate(async () => {
      const tempMappingId = `vm-${id}-${Date.now()}`;
      let transformationDbId = null;
      
      try {
        // Handle source exclusivity constraint
        const vendorAgreementId = transformationMapping.vendor_agreement_id || null;
        const sourceConnectionId = vendorAgreementId ? null : transformationMapping.source_connection_id;
        
        // Determine if RDM lookups are enabled
        const hasRdmConfigArrays = (transformationMapping.rdm_dataset_configs?.length > 0) || 
                                    (transformationMapping.rdm_crosswalk_configs?.length > 0);
        const hasRdmConfig = hasRdmConfigArrays || 
                             !!(transformationMapping.rdm_dataset_config || transformationMapping.rdm_crosswalk_config);
        const hasRdmNodes = mapping.graph_data?.nodes?.some(n => n.type === 'rdmLookup') || false;
        const rdmLookupEnabled = hasRdmConfig || hasRdmNodes;
        
        // Prepare RDM configs for storage
        const rdmDatasetConfigsToStore = transformationMapping.rdm_dataset_configs?.length > 0 
          ? transformationMapping.rdm_dataset_configs 
          : (transformationMapping.rdm_dataset_config ? [transformationMapping.rdm_dataset_config] : null);
        const rdmCrosswalkConfigsToStore = transformationMapping.rdm_crosswalk_configs?.length > 0 
          ? transformationMapping.rdm_crosswalk_configs 
          : (transformationMapping.rdm_crosswalk_config ? [transformationMapping.rdm_crosswalk_config] : null);
        
        const transformResult = await pool.query(
          `INSERT INTO transformation_mappings (
            mapping_id, mapping_name, description, project_id, sub_project_id,
            source_connection_id, file_path, source_file_pattern,
            target_connection_id, target_file_path, target_file_name, target_file_format,
            field_mappings, variables, pii_columns,
            rdm_lookup_enabled, rdm_dataset_config, rdm_crosswalk_config,
            schema_drift_handling, violation_handling,
            created_by, is_visual_mapping, visual_mapping_id, is_temporary,
            vendor_agreement_id,
            source_catalog, join_specs, has_multi_source_join, primary_source_node_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, true, $22, true, $23, $24, $25, $26, $27
          ) RETURNING id`,
          [
            tempMappingId,
            `[VM] ${transformationMapping.name || mapping.name}`,
            transformationMapping.description || mapping.description,
            transformationMapping.project_id || mapping.project_id,
            transformationMapping.sub_project_id || mapping.sub_project_id,
            sourceConnectionId,
            transformationMapping.source_file_path,
            transformationMapping.source_file_pattern || '*',
            transformationMapping.target_connection_id,
            transformationMapping.target_file_path,
            transformationMapping.target_file_name,
            transformationMapping.target_file_format || 'csv',
            JSON.stringify(transformationMapping.field_mappings || []),
            JSON.stringify(transformationMapping.variables || {}),
            JSON.stringify(transformationMapping.pii_columns || []),
            rdmLookupEnabled,
            rdmDatasetConfigsToStore ? JSON.stringify(rdmDatasetConfigsToStore) : null,
            rdmCrosswalkConfigsToStore ? JSON.stringify(rdmCrosswalkConfigsToStore) : null,
            transformationMapping.schema_drift_handling || 'warn',
            transformationMapping.violation_handling || 'continue',
            req.user.id,
            id,
            vendorAgreementId,
            JSON.stringify(transformationMapping.source_catalog || []),
            JSON.stringify(transformationMapping.join_specs || []),
            transformationMapping.has_multi_source_join || false,
            transformationMapping.primary_source_node_id || null
          ]
        );
        
        transformationDbId = transformResult.rows[0].id;
        
        console.log(`[VISUAL-MAPPING-EXECUTE] Temp mapping created: ${tempMappingId}, DB ID: ${transformationDbId}`);
        
        // Use jobExecutionEngine to execute
        const { executeTransformationJob } = require('../services/jobExecutionEngine');
        const jobResult = await executeTransformationJob(pool, tempMappingId, req.user.id, {
          visualMappingExecutionId: executionId,
          visualMappingNodes: mapping.graph_data.nodes,
          visualMappingEdges: mapping.graph_data.edges,
          nodeExecutionMap: transformationMapping.node_execution_map,
          executionOrder: compilationResult.executionOrder,
          skipInternalCleanup: true,
          // Pass user context for audit logging
          userEmail: req.user?.email,
          userRole: req.user?.role,
          userIp: req.ip || req.connection?.remoteAddress,
          sessionId: req.sessionID || req.headers['x-session-id']
        });
        
        console.log(`[VISUAL-MAPPING-EXECUTE] executeTransformationJob returned:`, JSON.stringify(jobResult, null, 2));
        
        const actualStatus = jobResult.status || 'completed';
        const isFailed = actualStatus === 'failed';
        
        // Update execution record
        await pool.query(
          `UPDATE visual_mapping_executions 
           SET job_id = $1, status = $2, transformation_id = $3, rows_processed = $4, error_message = $5, completed_at = NOW()
           WHERE execution_id = $6`,
          [jobResult.jobId, actualStatus, transformationDbId, jobResult.rowsWritten || 0, isFailed ? jobResult.message : null, executionId]
        );
        
        // Update execution logs
        const finalLogs = [
          { timestamp: new Date().toISOString(), level: 'INFO', message: `Starting visual mapping execution: ${mapping.name}` },
          { timestamp: new Date().toISOString(), level: 'INFO', message: `Rows processed: ${jobResult.rowsWritten || 0}` },
          { timestamp: new Date().toISOString(), level: isFailed ? 'ERROR' : 'INFO', 
            message: isFailed ? `Execution failed: ${jobResult.message}` : `Execution completed successfully` }
        ];
        
        await pool.query(
          `UPDATE visual_mapping_execution_logs 
           SET status = $1, logs = $2 
           WHERE mapping_id = $3 AND execution_id = $4`,
          [actualStatus, JSON.stringify(finalLogs), id, executionId]
        );
        
        // Clean up temporary transformation mapping
        await pool.query(
          `DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true`,
          [tempMappingId]
        );
        
        // Send email notification (non-blocking)
        sendVisualMappingNotification(mapping, jobResult, executionId).catch(err => {
          systemLogger.error('Failed to send notification', { error: err.message });
        });
        
        systemLogger.info('Background visual mapping execution completed', {
          mappingId: id,
          executionId,
          status: actualStatus
        });
        
      } catch (execError) {
        systemLogger.error('Background visual mapping execution failed', {
          mappingId: id,
          executionId,
          error: execError.message
        });
        
        // Update execution status to failed
        await pool.query(
          `UPDATE visual_mapping_executions 
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE execution_id = $2`,
          [execError.message, executionId]
        );
        
        // Update execution logs with error
        await pool.query(
          `UPDATE visual_mapping_execution_logs 
           SET status = 'failed', logs = $1 
           WHERE mapping_id = $2 AND execution_id = $3`,
          [JSON.stringify([
            { timestamp: new Date().toISOString(), level: 'INFO', message: `Starting visual mapping execution: ${mapping.name}` },
            { timestamp: new Date().toISOString(), level: 'ERROR', message: `Execution failed: ${execError.message}` }
          ]), id, executionId]
        );
        
        // Clean up temporary transformation mapping on failure
        if (tempMappingId) {
          await pool.query(
            `DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true`,
            [tempMappingId]
          ).catch(() => {});
        }
        
        // Send failure notification (non-blocking)
        sendVisualMappingNotification(mapping, { 
          status: 'failed', 
          message: execError.message,
          jobId: null,
          rowsWritten: 0 
        }, executionId).catch(err => {
          systemLogger.error('Failed to send failure notification', { error: err.message });
        });
      }
    });
    
  } catch (error) {
    systemLogger.error('Failed to start visual mapping execution', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to execute visual mapping' });
  }
});

/**
 * GET /api/visual-mappings/:id/execution-status/:executionId
 * Get execution status by execution ID
 */
router.get('/:id/execution-status/:executionId', async (req, res) => {
  try {
    const { id, executionId } = req.params;
    
    // Check execution logs table for the run
    const logResult = await pool.query(
      `SELECT run_id, run_name, started_at, status, logs, execution_id
       FROM visual_mapping_execution_logs
       WHERE mapping_id = $1 AND execution_id = $2`,
      [id, executionId]
    );
    
    if (logResult.rows.length > 0) {
      const row = logResult.rows[0];
      return res.json({
        executionId: row.execution_id,
        runId: row.run_id,
        runName: row.run_name,
        startedAt: row.started_at,
        status: row.status,
        logs: row.logs || [],
        isComplete: row.status !== 'running'
      });
    }
    
    // Also check the visual_mapping_executions table for more details
    const execResult = await pool.query(
      `SELECT * FROM visual_mapping_executions
       WHERE mapping_id = $1 AND execution_id = $2`,
      [id, executionId]
    );
    
    if (execResult.rows.length > 0) {
      const exec = execResult.rows[0];
      return res.json({
        executionId: exec.execution_id,
        status: exec.status,
        jobId: exec.job_id,
        rowsProcessed: exec.rows_processed,
        errorMessage: exec.error_message,
        completedAt: exec.completed_at,
        isComplete: exec.status !== 'running'
      });
    }
    
    res.status(404).json({ error: 'Execution not found' });
  } catch (error) {
    systemLogger.error('Failed to get mapping execution status', {
      error: error.message,
      mappingId: req.params.id,
      executionId: req.params.executionId,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get execution status' });
  }
});

/**
 * GET /api/visual-mappings/:id/running-execution
 * Check for any running executions for a mapping
 */
router.get('/:id/running-execution', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check execution logs for running status
    const logResult = await pool.query(
      `SELECT run_id, run_name, started_at, status, logs, execution_id
       FROM visual_mapping_execution_logs
       WHERE mapping_id = $1 AND status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
      [id]
    );
    
    if (logResult.rows.length > 0) {
      const row = logResult.rows[0];
      return res.json({
        hasRunningExecution: true,
        executionId: row.execution_id,
        runId: row.run_id,
        runName: row.run_name,
        startedAt: row.started_at,
        logs: row.logs || []
      });
    }
    
    res.json({ hasRunningExecution: false });
  } catch (error) {
    systemLogger.error('Failed to check running mapping execution', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to check running execution' });
  }
});

/**
 * POST /api/visual-mappings/:id/validate
 * Validate a visual mapping without executing it
 */
router.post('/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch the visual mapping
    const result = await pool.query(
      `SELECT * FROM visual_mapping_defs WHERE id = $1 AND is_active = true`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visual mapping not found' });
    }
    
    const mapping = result.rows[0];
    
    // Parse JSON fields
    if (typeof mapping.graph_data === 'string') {
      mapping.graph_data = JSON.parse(mapping.graph_data);
    }
    
    // Compile and validate
    const compilationResult = visualMappingCompiler.compile(mapping);
    
    if (compilationResult.success) {
      res.json({
        valid: true,
        message: 'Visual mapping is valid and ready for execution',
        executionOrder: compilationResult.executionOrder
      });
    } else {
      res.json({
        valid: false,
        errors: compilationResult.errors
      });
    }
  } catch (error) {
    systemLogger.error('Failed to validate visual mapping', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to validate visual mapping' });
  }
});

/**
 * GET /api/visual-mappings/:id/executions
 * Get execution history for a visual mapping (last 10 runs)
 */
router.get('/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT 
        vme.*,
        u.username as triggered_by_username
       FROM visual_mapping_executions vme
       LEFT JOIN users u ON vme.triggered_by = u.id
       WHERE vme.mapping_id = $1
       ORDER BY vme.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Failed to fetch execution history', {
      error: error.message,
      mappingId: req.params.id,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch execution history' });
  }
});

/**
 * POST /api/visual-mappings/executions/:executionId/logs
 * Save execution logs for a specific execution
 */
router.post('/executions/:executionId/logs', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { logs } = req.body;
    
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ error: 'Logs must be an array' });
    }
    
    // Update execution with logs
    const result = await pool.query(
      `UPDATE visual_mapping_executions 
       SET logs = $1
       WHERE execution_id = $2
       RETURNING id`,
      [JSON.stringify(logs), executionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    systemLogger.info('Execution logs saved', {
      executionId,
      logCount: logs.length
    });
    
    res.json({ success: true, logCount: logs.length });
  } catch (error) {
    systemLogger.error('Failed to save execution logs', {
      error: error.message,
      executionId: req.params.executionId
    });
    res.status(500).json({ error: 'Failed to save execution logs' });
  }
});

/**
 * GET /api/visual-mappings/:id/logs
 * Get aggregated logs from last 10 executions for a visual mapping
 */
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        vme.execution_id,
        vme.status,
        vme.created_at,
        vme.completed_at,
        vme.logs,
        vme.rows_processed,
        vme.error_message
       FROM visual_mapping_executions vme
       WHERE vme.mapping_id = $1
       ORDER BY vme.created_at DESC
       LIMIT 10`,
      [id]
    );
    
    res.json(result.rows);
  } catch (error) {
    systemLogger.error('Failed to fetch execution logs', {
      error: error.message,
      mappingId: req.params.id
    });
    res.status(500).json({ error: 'Failed to fetch execution logs' });
  }
});

/**
 * POST /api/visual-mappings/source-preview
 * Get preview data from a source configuration
 * Body: { connectionId, filePath, filePattern, limit }
 */
router.post('/source-preview', async (req, res) => {
  try {
    const { connectionId, filePath, filePattern, limit = 25 } = req.body;
    
    if (!connectionId) {
      return res.status(400).json({ error: 'Connection ID is required' });
    }
    
    if (!filePattern) {
      return res.status(400).json({ error: 'File pattern is required' });
    }
    
    // Fetch connection details
    const connectionResult = await pool.query(
      `SELECT connection_id, type, config FROM storage_connections WHERE connection_id = $1`,
      [connectionId]
    );
    
    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    const connection = connectionResult.rows[0];
    
    // Import the job execution engine functions for file processing
    const { downloadFileFromConnection, parseFileToRows, listAndFilterFiles } = require('../services/jobExecutionEngine');
    
    // Build full pattern path
    const fullPattern = filePath 
      ? `${filePath.replace(/^\//, '').replace(/\/$/, '')}/${filePattern}`
      : filePattern;
    
    // Find matching files
    const matchingFiles = await listAndFilterFiles(pool, connectionId, fullPattern);
    
    if (matchingFiles.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No files found matching the pattern',
        pattern: fullPattern,
        data: [],
        columns: []
      });
    }
    
    // Get the first matching file
    const sourceFile = matchingFiles[0];
    
    systemLogger.info('Fetching source preview', {
      connectionId,
      filePath,
      filePattern,
      matchingFile: sourceFile.filename
    });
    
    // Download and parse the file
    const fileBuffer = await downloadFileFromConnection(pool, connectionId, sourceFile.filename);
    const allRows = await parseFileToRows(fileBuffer, sourceFile.filename, pool);
    
    // Take only the first N rows for preview
    const previewRows = allRows.slice(0, Math.min(limit, allRows.length));
    
    // Extract column names from the first row
    const columns = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];
    
    res.json({
      success: true,
      filename: sourceFile.filename,
      totalRows: allRows.length,
      previewRowCount: previewRows.length,
      columns,
      data: previewRows
    });
    
  } catch (error) {
    systemLogger.error('Failed to fetch source preview', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch preview: ' + error.message 
    });
  }
});

module.exports = router;
