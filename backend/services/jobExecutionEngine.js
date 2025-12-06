const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { XMLParser } = require('fast-xml-parser');
const { systemLogger } = require('../utils/logger');
const { validateSchemaConsistency, saveSchemaSnapshot, inferDataType } = require('./schemaService');
const { transformRow } = require('./transformationEngine');
const { executeAnomalyDetection } = require('./anomalyRulesEngine');
const { 
  downloadFileFromConnection, 
  uploadFileToConnection,
  listAndFilterFiles
} = require('../utils/cloudStorageFileList');
const { captureFileAudit, captureFileSchema } = require('./fileAuditService');
const { profileETLOutputFile, profileETLFile } = require('./etlProfilingService');
const { profileFileBuffer, downloadAndProfileFile } = require('./transformationProfilingService');
const { persistGovernanceMetadata } = require('./governanceService');
const { loadRDMContext } = require('./rdmContextLoader');
const alertAggregationWorker = require('./AlertAggregationWorker');
const visualMappingWS = require('./visualMappingWebSocket');
const crypto = require('crypto');
const ArchiveExtractionService = require('./archiveExtractionService');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Archive file type constants
const ARCHIVE_EXTENSIONS = ['zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tar.gz', 'tar.bz2'];
const FIXED_WIDTH_EXTENSIONS = ['dat', 'fixed_width', 'txt'];

/**
 * Check if a file extension indicates an archive file
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if file is an archive
 */
function isArchiveFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(`.${ext}`));
}

/**
 * Get password for an archive from the vendor agreement password vault
 * @param {Object} pool - Database connection pool
 * @param {number} vendorAgreementId - Vendor agreement ID
 * @param {string} filename - Source filename to match
 * @returns {Promise<string|null>} - Decrypted password or null
 */
async function getArchivePasswordFromVault(pool, vendorAgreementId, filename) {
  try {
    // First, find the file schema that matches this filename
    // Note: Passwords are stored in encrypted_passwords table with entity_type='vendor_agreement_file_schema'
    const schemaResult = await pool.query(`
      SELECT vafs.id, vafs.file_name_pattern
      FROM vendor_agreement_file_schemas vafs
      WHERE vafs.vendor_agreement_id = $1 AND vafs.is_active = true
      ORDER BY vafs.priority ASC NULLS LAST
    `, [vendorAgreementId]);
    
    if (schemaResult.rows.length === 0) {
      return null;
    }
    
    // Find matching schema by pattern
    let matchedSchema = null;
    for (const schema of schemaResult.rows) {
      const pattern = schema.file_name_pattern;
      if (!pattern) continue;
      
      // Convert file pattern to regex (e.g., *.csv -> .*\.csv)
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(filename)) {
        matchedSchema = schema;
        break;
      }
    }
    
    if (!matchedSchema) {
      // Use first schema as fallback
      matchedSchema = schemaResult.rows[0];
    }
    
    // Look up password in encrypted_passwords table
    const passwordResult = await pool.query(`
      SELECT ep.secret_ciphertext, ep.iv
      FROM encrypted_passwords ep
      WHERE ep.entity_type = 'vendor_agreement_file_schema' 
      AND ep.entity_id = $1
    `, [matchedSchema.id.toString()]);
    
    if (passwordResult.rows.length === 0) {
      // Also try looking up by vendor agreement ID
      const agreementPasswordResult = await pool.query(`
        SELECT ep.secret_ciphertext, ep.iv
        FROM encrypted_passwords ep
        WHERE ep.entity_type = 'vendor_agreement' 
        AND ep.entity_id = $1
      `, [vendorAgreementId.toString()]);
      
      if (agreementPasswordResult.rows.length === 0) {
        return null;
      }
      
      // Decrypt the password
      const PasswordVaultService = require('./passwordVaultService');
      const vaultService = new PasswordVaultService(pool, null, systemLogger);
      return vaultService.decrypt(
        agreementPasswordResult.rows[0].secret_ciphertext,
        agreementPasswordResult.rows[0].iv
      );
    }
    
    // Decrypt the password
    const PasswordVaultService = require('./passwordVaultService');
    const vaultService = new PasswordVaultService(pool, null, systemLogger);
    return vaultService.decrypt(
      passwordResult.rows[0].secret_ciphertext,
      passwordResult.rows[0].iv
    );
  } catch (error) {
    systemLogger.error('Failed to get archive password from vault', {
      vendorAgreementId,
      filename,
      error: error.message
    });
    return null;
  }
}

/**
 * Get fixed-width schema from vendor agreement for headerless file parsing
 * @param {Object} pool - Database connection pool
 * @param {number} vendorAgreementId - Vendor agreement ID
 * @param {string} filename - Source filename to match
 * @returns {Promise<Object|null>} - Schema with has_header and header_definition
 */
async function getFixedWidthSchemaFromAgreement(pool, vendorAgreementId, filename) {
  try {
    const result = await pool.query(`
      SELECT vafs.id, vafs.file_name_pattern, vafs.has_header, vafs.header_definition,
             vafs.file_type, vafs.schema
      FROM vendor_agreement_file_schemas vafs
      WHERE vafs.vendor_agreement_id = $1 AND vafs.is_active = true
      ORDER BY vafs.priority ASC NULLS LAST
    `, [vendorAgreementId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Find matching schema by pattern
    let matchedSchema = null;
    for (const schema of result.rows) {
      const pattern = schema.file_name_pattern;
      if (!pattern) continue;
      
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(filename)) {
        matchedSchema = schema;
        break;
      }
    }
    
    if (!matchedSchema) {
      matchedSchema = result.rows[0];
    }
    
    // Parse header_definition if it's a string
    let headerDef = matchedSchema.header_definition;
    if (typeof headerDef === 'string') {
      try {
        headerDef = JSON.parse(headerDef);
      } catch (e) {
        headerDef = null;
      }
    }
    
    return {
      schemaId: matchedSchema.id,
      fileType: matchedSchema.file_type,
      hasHeader: matchedSchema.has_header !== false,
      headerDefinition: headerDef,
      schema: matchedSchema.schema
    };
  } catch (error) {
    systemLogger.error('Failed to get fixed-width schema from agreement', {
      vendorAgreementId,
      filename,
      error: error.message
    });
    return null;
  }
}

/**
 * Parse a fixed-width file buffer using column positions from schema
 * @param {Buffer} buffer - File buffer
 * @param {Array} columns - Column definitions with name, width, start_position
 * @param {Object} options - Parsing options
 * @returns {Object} - Parsed rows and metadata
 */
function parseFixedWidthBuffer(buffer, columns, options = {}) {
  const { hasHeader = false } = options;
  const content = buffer.toString('utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  const rows = [];
  const startIndex = hasHeader ? 1 : 0;
  
  // Sort columns by start_position
  const sortedColumns = [...columns].sort((a, b) => 
    (a.start_position || 0) - (b.start_position || 0)
  );
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const row = {};
    
    for (const col of sortedColumns) {
      const start = col.start_position || 0;
      const width = col.width || 10;
      const value = line.substring(start, start + width).trim();
      row[col.name] = value;
    }
    
    rows.push(row);
  }
  
  return {
    rows,
    rowCount: rows.length,
    columns: sortedColumns.map(c => c.name)
  };
}

/**
 * Replace dynamic placeholders in file name with actual values
 * @param {string} fileName - File name with placeholders
 * @returns {string} - File name with replaced values
 */
function replacePlaceholders(fileName) {
  if (!fileName) return fileName;
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const timestampStr = Math.floor(now.getTime() / 1000).toString(); // Unix timestamp
  
  return fileName
    .replace(/<current_date>/g, dateStr)
    .replace(/<current_timestamp>/g, timestampStr);
}

/**
 * Job Execution Engine
 * Handles execution of transformation mappings with comprehensive tracking and error handling
 */

/**
 * Create a new transformation job
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @param {Object} options - Optional metadata
 * @param {number} options.mappingGroupExecutionId - Mapping group execution ID if part of a group
 * @param {number} options.scheduleId - Schedule ID if triggered by a schedule
 * @param {number} options.workflowExecutionId - Workflow execution ID if part of a workflow
 * @param {number} options.visualWorkflowExecutionId - Visual workflow execution ID if part of a visual workflow
 * @returns {Promise<Object>} - Created job record
 */
async function createJob(pool, mappingId, userId, options = {}) {
  try {
    // Get mapping details
    const mappingResult = await pool.query(
      'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
      [mappingId]
    );
    
    if (mappingResult.rows.length === 0) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }
    
    const mapping = mappingResult.rows[0];
    const jobId = `JOB-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const correlationId = jobId; // Use jobId as correlation ID for source/target file linking
    
    const result = await pool.query(`
      INSERT INTO transformation_jobs (
        job_id, mapping_id, mapping_name, executed_by, status, 
        mapping_group_execution_id, schedule_id, workflow_execution_id, visual_workflow_execution_id, project_id, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      jobId, 
      mappingId, 
      mapping.mapping_name, 
      userId, 
      'running',
      options.mappingGroupExecutionId || null,
      options.scheduleId || null,
      options.workflowExecutionId || null,
      options.visualWorkflowExecutionId || null,
      mapping.project_id,
      correlationId
    ]);
    
    const transformationJobDbId = result.rows[0].id; // Get database ID for linking to audit
    
    systemLogger.info('Transformation job created', { 
      jobId, 
      mappingId, 
      mappingGroupExecutionId: options.mappingGroupExecutionId,
      scheduleId: options.scheduleId,
      workflowExecutionId: options.workflowExecutionId,
      visualWorkflowExecutionId: options.visualWorkflowExecutionId
    });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error creating job:', error);
    throw error;
  }
}

/**
 * Log job execution details
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} details - Additional details
 * @param {string} visualExecutionId - Optional visual mapping execution ID for WebSocket logs
 */
async function logJobExecution(pool, jobId, level, message, details = {}, visualExecutionId = null) {
  try {
    await pool.query(`
      INSERT INTO transformation_logs (
        job_id, log_level, message, log_details
      ) VALUES ($1, $2, $3, $4)
    `, [jobId, level, message, JSON.stringify(details)]);
    
    // Emit log via WebSocket for visual mapping executions
    if (visualExecutionId) {
      visualMappingWS.emitExecutionLog(visualExecutionId, level, message, details);
    }
    
  } catch (error) {
    systemLogger.error('Error logging job execution:', error);
  }
}

/**
 * Update job status and statistics
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated job record
 */
async function updateJob(pool, jobId, updates) {
  try {
    // If end_time is being set, calculate duration_ms
    if (updates.end_time) {
      const jobResult = await pool.query(
        'SELECT start_time FROM transformation_jobs WHERE job_id = $1',
        [jobId]
      );
      
      if (jobResult.rows.length > 0) {
        const startTime = new Date(jobResult.rows[0].start_time);
        const endTime = new Date(updates.end_time);
        updates.duration_ms = endTime.getTime() - startTime.getTime();
      }
    }
    
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    values.push(jobId);
    
    const query = `
      UPDATE transformation_jobs
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error updating job:', error);
    throw error;
  }
}

/**
 * Persist quality rule violations to database
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {string} fileId - File ID (can be null)
 * @param {Array} violations - Array of violation objects from QualityValidationEngine
 * @returns {Promise<number>} - Number of violations persisted
 */
async function persistViolations(pool, jobId, fileId, violations) {
  if (!violations || violations.length === 0) {
    return 0;
  }
  
  try {
    // Build batch insert query using VALUES with multiple rows
    const values = [];
    const paramGroups = [];
    let paramIndex = 1;
    
    for (const violation of violations) {
      const paramGroup = [];
      
      // rule_id
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.rule_id);
      
      // file_id (can be null)
      paramGroup.push(`$${paramIndex++}`);
      values.push(fileId || null);
      
      // job_id
      paramGroup.push(`$${paramIndex++}`);
      values.push(jobId);
      
      // row_number
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.row_number || null);
      
      // column_name
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.column_name || null);
      
      // expected_value
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.expected_value || null);
      
      // actual_value
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.actual_value || null);
      
      // violation_details (JSONB)
      paramGroup.push(`$${paramIndex++}::jsonb`);
      values.push(JSON.stringify(violation.violation_details || {}));
      
      // severity
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.severity || 'warning');
      
      // status (default to 'new')
      paramGroup.push(`$${paramIndex++}`);
      values.push('new');
      
      // processing_action (default to 'logged')
      paramGroup.push(`$${paramIndex++}`);
      values.push('logged');
      
      // record_snapshot (JSONB)
      paramGroup.push(`$${paramIndex++}::jsonb`);
      values.push(JSON.stringify(violation.record_snapshot || {}));
      
      paramGroups.push(`(${paramGroup.join(', ')})`);
    }
    
    const query = `
      INSERT INTO quality_rule_violations (
        rule_id, file_id, job_id, row_number, column_name,
        expected_value, actual_value, violation_details, severity,
        status, processing_action, record_snapshot
      ) VALUES ${paramGroups.join(', ')}
    `;
    
    await pool.query(query, values);
    
    systemLogger.info('Quality violations persisted', {
      jobId,
      fileId,
      violationCount: violations.length
    });
    
    return violations.length;
    
  } catch (error) {
    systemLogger.error('Error persisting quality violations:', {
      jobId,
      fileId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Update transformation_executions record (called by TransformationService)
 * @param {Pool} pool - Database connection pool
 * @param {string} executionId - Execution ID
 * @param {string} status - Status (COMPLETED or FAILED)
 * @param {Object} result - Result data
 */
async function updateTransformationExecution(pool, executionId, status, result = {}) {
  if (!executionId) return; // Skip if no execution tracking
  
  try {
    await pool.query(
      `UPDATE transformation_executions
       SET status = $1,
           completed_at = NOW(),
           result = $2,
           updated_at = NOW()
       WHERE execution_id = $3`,
      [status, JSON.stringify(result), executionId]
    );
    
    systemLogger.info('Updated transformation_executions record', {
      executionId,
      status
    });
  } catch (error) {
    systemLogger.warn('Failed to update transformation_executions', {
      executionId,
      status,
      error: error.message
    });
  }
}

/**
 * Execute a transformation mapping
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Job execution result
 */
async function executeTransformationJob(pool, mappingId, userId, options = {}) {
  const {
    runSchemaValidation = true,
    runProfilingChecks = true,
    dryRun = false,
    existingJob = null,
    mappingGroupExecutionId = null,
    scheduleId = null,
    workflowExecutionId = null,
    visualWorkflowExecutionId = null,
    visualMappingExecutionId = null,  // NEW: passed directly from visual mappings route
    transformationExecutionId = null,  // NEW: passed from TransformationService for execution tracking
    visualMappingNodes = null,        // Visual mapping graph nodes for status tracking
    visualMappingEdges = null,        // Visual mapping graph edges for row count tracking
    nodeExecutionMap = null,          // Map of node ID to execution step
    executionOrder = null             // Ordered array of node IDs
  } = options;
  
  let job = existingJob;
  let mapping = null;
  let visualExecutionId = null;
  
  // Hoist node structures outside try block so they can be accessed in catch
  const nodeMap = {};
  const nodesByType = { sourceConfig: [], expression: [], rdmLookup: [], targetRules: [], join: [] };
  
  try {
    // Create job only if not provided
    if (!job) {
      job = await createJob(pool, mappingId, userId, {
        mappingGroupExecutionId,
        scheduleId,
        workflowExecutionId,
        visualWorkflowExecutionId
      });
    }
    const jobId = job.job_id;
    const transformationJobDbId = job.id; // Database ID for linking to audit
    
    await logJobExecution(pool, jobId, 'info', 'Job execution started', { mappingId, userId });
    
    // Get mapping configuration
    mapping = await getMappingConfig(pool, mappingId);
    
    // Track if this is a visual mapping execution
    const isVisualMapping = mapping.is_visual_mapping && mapping.visual_mapping_id;
    
    // Use visualMappingExecutionId from options if provided (avoids query)
    if (isVisualMapping && visualMappingExecutionId) {
      visualExecutionId = visualMappingExecutionId;
      
      // Emit execution start event
      visualMappingWS.emitExecutionProgress(visualExecutionId, 0);
      visualMappingWS.emitExecutionLog(visualExecutionId, 'info', `Execution started for job ${jobId}`);
      systemLogger.info('Visual mapping execution started - WebSocket tracking enabled', {
        visualExecutionId,
        visualMappingId: mapping.visual_mapping_id,
        jobId,
        source: 'options.visualMappingExecutionId'
      });
    }
    
    // Build node map for visual mapping status updates
    if (visualMappingNodes && Array.isArray(visualMappingNodes)) {
      visualMappingNodes.forEach(node => {
        nodeMap[node.id] = node;
        if (nodesByType[node.type]) {
          nodesByType[node.type].push(node.id);
        }
      });
    }
    
    // Helper to emit node status for visual mapping
    const emitNodeStatus = (nodeId, status, metadata = {}) => {
      if (visualExecutionId && nodeId) {
        visualMappingWS.emitNodeStatus(visualExecutionId, nodeId, status, metadata);
      }
    };
    
    // Helper to emit edge row count for visual mapping
    const emitEdgeRowCount = (sourceNodeId, targetNodeId, rowCount) => {
      if (visualExecutionId && sourceNodeId && targetNodeId && visualMappingEdges) {
        const edge = visualMappingEdges.find(e => e.source === sourceNodeId && e.target === targetNodeId);
        if (edge) {
          visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, sourceNodeId, targetNodeId, rowCount);
        }
      }
    };
    
    // Helper to emit execution logs via WebSocket (for visual mapping console panel)
    const emitLog = (level, message, details = {}) => {
      if (visualExecutionId) {
        visualMappingWS.emitExecutionLog(visualExecutionId, level, message, details);
      }
    };
    
    // Mark all nodes as pending initially
    if (executionOrder && Array.isArray(executionOrder)) {
      executionOrder.forEach(nodeId => {
        emitNodeStatus(nodeId, 'pending');
      });
    }
    
    // Load RDM context once for this job (before processing any files)
    let rdmContext = {};
    const hasRdmNodes = nodesByType.rdmLookup.length > 0;
    
    try {
      // Parse RDM configs if they're stored as JSON strings
      let rdmDatasetConfig = mapping.rdm_dataset_config;
      let rdmCrosswalkConfig = mapping.rdm_crosswalk_config;
      
      if (typeof rdmDatasetConfig === 'string') {
        rdmDatasetConfig = JSON.parse(rdmDatasetConfig);
      }
      if (typeof rdmCrosswalkConfig === 'string') {
        rdmCrosswalkConfig = JSON.parse(rdmCrosswalkConfig);
      }
      
      // Emit running status for RDM lookup nodes
      if (hasRdmNodes && (rdmDatasetConfig || rdmCrosswalkConfig)) {
        nodesByType.rdmLookup.forEach(nodeId => {
          emitNodeStatus(nodeId, 'running', { phase: 'loading_rdm_context' });
        });
      }
      
      rdmContext = await loadRDMContext(
        mapping.field_mappings || [], 
        mapping.variables || [],
        rdmDatasetConfig,
        rdmCrosswalkConfig
      );
      
      const hasRDMData = Object.keys(rdmContext.rdm?.crosswalks || {}).length > 0 || 
                         Object.keys(rdmContext.rdm?.datasets || {}).length > 0;
      
      if (hasRDMData) {
        await logJobExecution(pool, jobId, 'info', 'RDM context loaded successfully', {
          crosswalkCount: Object.keys(rdmContext.rdm.crosswalks).length,
          datasetCount: Object.keys(rdmContext.rdm.datasets).length
        });
        
        // RDM nodes stay running - they'll complete when lookups are performed during transformation
      }
    } catch (rdmError) {
      // Fatal error if RDM resources were required but failed to load
      await logJobExecution(pool, jobId, 'error', 'Failed to load required RDM resources', {
        error: rdmError.message
      });
      
      // Emit failed status for RDM lookup nodes
      nodesByType.rdmLookup.forEach(nodeId => {
        emitNodeStatus(nodeId, 'failed', { error: rdmError.message });
      });
      
      await updateJob(pool, jobId, {
        status: 'failed',
        error_message: `RDM context loading failed: ${rdmError.message}`,
        end_time: new Date()
      });
      
      // Update transformation_executions if tracking
      await updateTransformationExecution(pool, transformationExecutionId, 'FAILED', {
        error: rdmError.message
      });
      
      throw rdmError;
    }
    
    // Step 1: Build full file path and find matching files from cloud storage
    // Emit running status for source config nodes
    nodesByType.sourceConfig.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'file_matching' });
    });
    
    const filePath = mapping.file_path || '';
    const fileNamePattern = mapping.file_name_pattern || mapping.source_file_pattern;
    
    // Build full pattern: file_path + file_name_pattern
    // Ensure exactly one separator between path and pattern
    let fullPattern;
    if (filePath) {
      const normalizedPath = filePath.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
      fullPattern = normalizedPath ? `${normalizedPath}/${fileNamePattern}` : fileNamePattern;
    } else {
      fullPattern = fileNamePattern;
    }
    
    // Check if this is a single file (no wildcards) or a pattern
    const isSingleFile = !fileNamePattern.includes('*') && !fileNamePattern.includes('?');
    
    await logJobExecution(pool, jobId, 'info', 'Finding matching files from cloud storage', { 
      file_path: filePath,
      file_name_pattern: fileNamePattern,
      full_pattern: fullPattern,
      is_single_file: isSingleFile,
      connection_id: mapping.source_connection_id
    });
    
    const cloudFiles = await listAndFilterFiles(
      pool, 
      mapping.source_connection_id, 
      fullPattern
    );
    
    if (cloudFiles.length === 0) {
      const errorMessage = isSingleFile 
        ? `File not found: ${fullPattern}. Please verify the file path and name are correct.`
        : `No files matched the pattern '${fullPattern}' in cloud storage`;
      
      // Emit failed status for source nodes
      nodesByType.sourceConfig.forEach(nodeId => {
        emitNodeStatus(nodeId, 'failed', { error: errorMessage });
      });
      
      await updateJob(pool, jobId, { 
        status: 'failed', 
        error_message: errorMessage,
        end_time: new Date()
      });
      
      // Update transformation_executions if tracking
      await updateTransformationExecution(pool, transformationExecutionId, 'FAILED', {
        error: errorMessage,
        filesProcessed: 0
      });
      
      await logJobExecution(pool, jobId, 'error', errorMessage, { 
        full_pattern: fullPattern,
        file_path: filePath,
        file_name_pattern: fileNamePattern
      });
      
      return { 
        jobId, 
        status: 'failed', 
        filesProcessed: 0,
        message: errorMessage
      };
    }
    
    await logJobExecution(pool, jobId, 'info', `Found ${cloudFiles.length} matching files in cloud storage`);
    emitLog('info', `Found ${cloudFiles.length} matching file(s) in source`);
    
    // Emit completed status for source nodes with file count
    nodesByType.sourceConfig.forEach(nodeId => {
      emitNodeStatus(nodeId, 'completed', { filesFound: cloudFiles.length });
    });
    
    // Convert cloud file objects to format expected by processFile
    const matchingFiles = cloudFiles.map(file => ({
      filename: file.filename,
      file_id: null, // Cloud files don't have DB file_id
      file_size: file.size,
      row_count: 0 // Will be determined during processing
    }));
    
    // Step 1.5: Schema Drift Validation (for all source types)
    // Always run validation when schema is defined, regardless of handling policy
    const hasSchemaToValidate = mapping.vendor_agreement_id || (mapping.source_schema && mapping.source_schema.length > 0);
    
    if (hasSchemaToValidate && runSchemaValidation) {
      const sourceType = mapping.vendor_agreement_id ? 'vendor agreement' : 'connection';
      await logJobExecution(pool, jobId, 'info', `Validating file schema against ${sourceType}`);
      
      try {
        let validationResult;
        
        if (mapping.vendor_agreement_id) {
          // Vendor agreement validation
          const { validateFileSchema } = require('./schemaValidationService');
          
          const fileToValidate = cloudFiles[0];
          const fileName = fileToValidate.filename;
          const filePathPart = fileName.substring(0, fileName.lastIndexOf('/'));
          const fileNamePart = fileName.substring(fileName.lastIndexOf('/') + 1);
          
          validationResult = await validateFileSchema(
            mapping.vendor_agreement_id,
            mapping.source_connection_id,
            filePathPart,
            fileNamePart,
            mapping.vendor_agreement_file_schema_id || null
          );
        } else if (mapping.source_schema && mapping.source_schema.length > 0) {
          // Regular connection validation - compare against stored mapping schema
          const { extractSchemaFromBuffer } = require('./schemaService');
          const fileToValidate = cloudFiles[0];
          const fileBuffer = await downloadFileFromConnection(pool, mapping.source_connection_id, fileToValidate.filename, { partial: true, maxBytes: 1024 * 1024 });
          const actualSchema = await extractSchemaFromBuffer(fileBuffer, fileToValidate.filename);
          
          // Compare schemas
          const expectedSchema = mapping.source_schema;
          const expectedFields = expectedSchema.map(f => f.name).sort();
          const actualFields = actualSchema.map(f => f.name).sort();
          
          const schemaDrift = expectedFields.join(',') !== actualFields.join(',');
          
          if (schemaDrift) {
            const missingFields = expectedFields.filter(f => !actualFields.includes(f));
            const newFields = actualFields.filter(f => !expectedFields.includes(f));
            
            validationResult = {
              valid: false,
              schemaDrift: true,
              message: `Schema mismatch detected. Missing fields: [${missingFields.join(', ')}]. New fields: [${newFields.join(', ')}]`,
              actualSchema,
              expectedSchema,
              differences: { missingFields, newFields }
            };
          } else {
            validationResult = {
              valid: true,
              schemaDrift: false,
              message: 'Schema validation passed',
              actualSchema,
              expectedSchema,
              differences: null
            };
          }
        } else {
          // No schema defined, skip validation
          await logJobExecution(pool, jobId, 'info', 'No schema validation required (schema not defined in mapping)');
          validationResult = null;
        }
        
        if (validationResult) {
          await logJobExecution(pool, jobId, 'info', `Schema validation result: ${validationResult.message}`, {
            schemaDrift: validationResult.schemaDrift,
            valid: validationResult.valid
          });
          
          // Update job with schema validation status
          const schemaValidationStatus = validationResult.schemaDrift ? 'Fail' : 'Pass';
          await updateJob(pool, jobId, { 
            schema_validation: schemaValidationStatus
          });
          
          // Handle schema drift based on policy
          if (validationResult.schemaDrift) {
            const driftMessage = `Schema drift detected: ${validationResult.message}`;
            
            // Create anomaly record for schema drift
            try {
              const { v4: uuidv4 } = require('uuid');
              const anomalyId = `DRIFT-${Date.now()}-${uuidv4().substring(0, 8)}`;
              
              // Determine severity based on differences
              let severity = 'medium';
              if (validationResult.differences) {
                const { missingFields = [], newFields = [] } = validationResult.differences;
                if (missingFields.length > 0) {
                  severity = 'high';
                } else if (newFields.length > 3) {
                  severity = 'medium';
                } else {
                  severity = 'low';
                }
              }
              
              await pool.query(`
                INSERT INTO anomalies (
                  anomaly_id, file_id, file_name, mapping_id, job_id,
                  anomaly_type, severity, title, description, anomaly_details,
                  expected_value, actual_value, status, detected_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
              `, [
                anomalyId,
                sourceFileId || null,
                sourceName,
                mapping.id,
                jobId,
                'schema_drift',
                severity,
                'Schema Drift Detected',
                driftMessage,
                JSON.stringify(validationResult.differences || {}),
                JSON.stringify(validationResult.expectedSchema || []),
                JSON.stringify(validationResult.actualSchema || []),
                'active'
              ]);
              
              await logJobExecution(pool, jobId, 'info', `Anomaly record created for schema drift: ${anomalyId}`);
            } catch (anomalyError) {
              await logJobExecution(pool, jobId, 'warn', `Failed to create anomaly record: ${anomalyError.message}`);
            }
            
            if (mapping.schema_drift_handling === 'abort') {
              // Emit failed status for all nodes on schema drift abort
              if (visualExecutionId) {
                [...nodesByType.sourceConfig, ...nodesByType.expression, ...nodesByType.join, 
                 ...nodesByType.rdmLookup, ...nodesByType.targetRules].forEach(nodeId => {
                  emitNodeStatus(nodeId, 'failed', { error: 'Schema drift detected - execution aborted' });
                });
              }
              
              // Abort job execution
              await updateJob(pool, jobId, { 
                status: 'failed', 
                error_message: driftMessage,
                end_time: new Date()
              });
              
              await logJobExecution(pool, jobId, 'error', driftMessage, { 
                differences: validationResult.differences,
                actualSchema: validationResult.actualSchema,
                expectedSchema: validationResult.expectedSchema
              });
              
              return { 
                jobId, 
                status: 'failed', 
                filesProcessed: 0,
                message: driftMessage,
                schemaDrift: true
              };
            } else if (mapping.schema_drift_handling === 'alert') {
              // Log warning and continue processing
              await logJobExecution(pool, jobId, 'warn', driftMessage, { 
                differences: validationResult.differences,
                actualSchema: validationResult.actualSchema,
                expectedSchema: validationResult.expectedSchema
              });
            }
          } else {
            await logJobExecution(pool, jobId, 'info', `Schema validation passed for ${sourceType}`);
          }
        }
        
      } catch (schemaValidationError) {
        await logJobExecution(pool, jobId, 'warn', `Schema validation error: ${schemaValidationError.message}. Continuing with file processing.`);
        // Set validation status as N/A due to error
        await updateJob(pool, jobId, { 
          schema_validation: null
        });
      }
    }
    
    // Step 2: Schema validation for file patterns (multiple files)
    if (runSchemaValidation && !isSingleFile && cloudFiles.length > 1) {
      await logJobExecution(pool, jobId, 'info', 'Validating schema consistency across matched files');
      
      try {
        // Download first few bytes of each file to extract schema
        const schemas = [];
        for (const file of cloudFiles) {
          try {
            const { extractSchemaFromBuffer } = require('./schemaService');
            const fileBuffer = await downloadFileFromConnection(pool, mapping.source_connection_id, file.filename, { partial: true, maxBytes: 1024 * 1024 });
            const schema = await extractSchemaFromBuffer(fileBuffer, file.filename);
            schemas.push({ filename: file.filename, schema });
          } catch (err) {
            await logJobExecution(pool, jobId, 'warn', `Could not extract schema from ${file.filename}: ${err.message}`);
          }
        }
        
        // Check for schema mismatches
        if (schemas.length > 1) {
          const baseSchema = schemas[0].schema;
          const mismatches = [];
          
          for (let i = 1; i < schemas.length; i++) {
            const currentSchema = schemas[i].schema;
            const baseFields = baseSchema.map(f => f.name).sort().join(',');
            const currentFields = currentSchema.map(f => f.name).sort().join(',');
            
            if (baseFields !== currentFields) {
              mismatches.push({
                file: schemas[i].filename,
                baseFile: schemas[0].filename,
                baseFields: baseSchema.map(f => f.name),
                currentFields: currentSchema.map(f => f.name)
              });
            }
          }
          
          if (mismatches.length > 0) {
            const errorMessage = `Schema mismatch detected across ${mismatches.length} file(s). All files matching a pattern must have identical schemas.`;
            
            // Emit failed status for all nodes on schema validation failure
            if (visualExecutionId) {
              [...nodesByType.sourceConfig, ...nodesByType.expression, ...nodesByType.join, 
               ...nodesByType.rdmLookup, ...nodesByType.targetRules].forEach(nodeId => {
                emitNodeStatus(nodeId, 'failed', { error: 'Schema validation failed' });
              });
            }
            
            await updateJob(pool, jobId, { 
              status: 'failed', 
              error_message: errorMessage,
              end_time: new Date()
            });
            
            await logJobExecution(pool, jobId, 'error', errorMessage, { 
              mismatches,
              totalFilesChecked: schemas.length
            });
            
            return { 
              jobId, 
              status: 'failed', 
              filesProcessed: 0,
              message: errorMessage,
              details: mismatches
            };
          }
          
          await logJobExecution(pool, jobId, 'info', `Schema validation passed: All ${schemas.length} files have consistent schemas`);
        }
      } catch (schemaError) {
        await logJobExecution(pool, jobId, 'warn', `Schema validation error: ${schemaError.message}. Continuing with file processing.`);
      }
    }
    
    // Step 3: Process each file
    // Emit running status for expression and join nodes (transformation phase)
    nodesByType.expression.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'transforming' });
    });
    nodesByType.join.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'joining' });
    });
    
    // Emit running status for target nodes
    nodesByType.targetRules.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'writing_output' });
    });
    
    let totalRowsRead = 0;
    let totalRowsWritten = 0;
    let totalRowsFailed = 0;
    let filesProcessedSoFar = 0;
    
    for (const file of matchingFiles) {
      await logJobExecution(pool, jobId, 'info', `Processing file: ${file.filename}`, {
        fileId: file.file_id
      });
      emitLog('info', `Processing file: ${file.filename.split('/').pop()}`);
      
      try {
        // Create callback for real-time progress updates (called after transformation, before profiling)
        const onTransformComplete = visualExecutionId ? async (progressData) => {
          const currentRowsWritten = totalRowsWritten + progressData.rowsWritten;
          const currentRowsRead = totalRowsRead + progressData.rowsRead;
          
          // Emit edge row counts immediately after transformation completes
          if (visualMappingEdges && Array.isArray(visualMappingEdges)) {
            visualMappingEdges.forEach(edge => {
              visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, edge.source, edge.target, currentRowsWritten);
            });
          }
          
          // Emit node completion status for expression, join, rdm nodes
          nodesByType.expression.forEach(nodeId => {
            emitNodeStatus(nodeId, 'completed', { rowsProcessed: currentRowsRead });
          });
          nodesByType.join.forEach(nodeId => {
            emitNodeStatus(nodeId, 'completed', { rowsProcessed: currentRowsRead });
          });
          nodesByType.rdmLookup.forEach(nodeId => {
            emitNodeStatus(nodeId, 'completed', { rowsProcessed: currentRowsRead });
          });
          nodesByType.targetRules.forEach(nodeId => {
            emitNodeStatus(nodeId, 'completed', { rowsWritten: currentRowsWritten });
          });
          
          systemLogger.info('Real-time progress callback executed - edge counts and node status emitted before profiling', {
            visualExecutionId,
            rowsWritten: currentRowsWritten,
            rowsRead: currentRowsRead,
            filename: progressData.filename
          });
        } : null;
        
        const fileResult = await processFile(pool, file, mapping, jobId, { 
          dryRun, 
          transformationJobDbId, 
          userId,
          rdmContext,
          onTransformComplete
        });
        
        totalRowsRead += fileResult.rowsRead;
        totalRowsWritten += fileResult.rowsWritten;
        totalRowsFailed += fileResult.rowsFailed;
        filesProcessedSoFar++;
        
        // Update job progress immediately after each file for real-time tracking
        await updateJob(pool, jobId, {
          files_processed: filesProcessedSoFar,
          rows_read: totalRowsRead,
          rows_written: totalRowsWritten,
          rows_failed: totalRowsFailed
        });
        
        await logJobExecution(pool, jobId, 'info', `File processed: ${file.filename}`, {
          fileId: file.file_id,
          rowsRead: fileResult.rowsRead,
          rowsWritten: fileResult.rowsWritten,
          rowsFailed: fileResult.rowsFailed,
          progressMessage: `Completed ${filesProcessedSoFar} of ${matchingFiles.length} files`
        });
        emitLog('info', `Processed ${fileResult.rowsRead} rows, wrote ${fileResult.rowsWritten} rows (${filesProcessedSoFar}/${matchingFiles.length} files)`);
        
        // Edge row counts already emitted by onTransformComplete callback (before profiling)
        // This secondary emission serves as a final confirmation after all processing completes
        if (visualExecutionId && visualMappingEdges && Array.isArray(visualMappingEdges)) {
          visualMappingEdges.forEach(edge => {
            visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, edge.source, edge.target, totalRowsWritten);
          });
        }
        
        // Step 4: Run profiling and anomaly detection (if enabled)
        // Note: Skipped for cloud files without DB record, can be added in future
        if (runProfilingChecks && !dryRun && file.file_id) {
          await logJobExecution(pool, jobId, 'info', `Running profiling checks on: ${file.filename}`);
          
          const anomalyResults = await executeAnomalyDetection(pool, {
            fileId: file.file_id,
            filename: file.filename,
            filePattern: mapping.source_file_pattern,
            mappingId,
            jobId,
            runSchemaValidation
          });
          
          if (anomalyResults.totalAnomalies > 0) {
            await logJobExecution(pool, jobId, 'warn', 
              `Detected ${anomalyResults.totalAnomalies} anomalies in ${file.filename}`,
              anomalyResults.anomaliesByType
            );
          }
        }
        
      } catch (fileError) {
        totalRowsFailed += file.row_count || 0;
        
        // Emit failed status for all processing nodes when file processing fails
        if (visualExecutionId) {
          nodesByType.expression.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
          nodesByType.join.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
          nodesByType.rdmLookup.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
          nodesByType.targetRules.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
        }
        
        await logJobExecution(pool, jobId, 'error', `File processing failed: ${file.filename}`, {
          fileId: file.file_id,
          error: fileError.message,
          stack: fileError.stack
        });
        emitLog('error', `Failed processing file: ${fileError.message}`);
      }
    }
    
    // Update job with final statistics
    await updateJob(pool, jobId, {
      status: 'completed',
      files_processed: matchingFiles.length,
      rows_read: totalRowsRead,
      rows_written: totalRowsWritten,
      rows_failed: totalRowsFailed,
      end_time: new Date()
    });
    
    // Update transformation_executions if tracking
    await updateTransformationExecution(pool, transformationExecutionId, 'COMPLETED', {
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job execution completed', {
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    });
    emitLog('info', `Execution completed: ${matchingFiles.length} file(s), ${totalRowsRead} rows read, ${totalRowsWritten} rows written`);
    
    // Final status emissions - these are redundant confirmations after profiling completes
    // Primary real-time updates were already sent via onTransformComplete callback (before profiling)
    if (visualExecutionId) {
      // Yield event loop to ensure all previous events are flushed
      await new Promise(resolve => setImmediate(resolve));
      
      // Final edge row count confirmation (already sent by callback, this is just a redundant final update)
      if (visualMappingEdges && Array.isArray(visualMappingEdges)) {
        visualMappingEdges.forEach(edge => {
          visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, edge.source, edge.target, totalRowsWritten);
        });
      }
      
      // Emit final progress and completion
      visualMappingWS.emitExecutionProgress(visualExecutionId, 100);
      visualMappingWS.emitExecutionComplete(visualExecutionId, {
        filesProcessed: matchingFiles.length,
        rowsRead: totalRowsRead,
        rowsWritten: totalRowsWritten,
        rowsFailed: totalRowsFailed
      });
      systemLogger.info('Visual mapping execution completed - WebSocket events emitted', {
        visualExecutionId,
        jobId,
        nodesCompleted: Object.values(nodesByType).flat().length
      });
    }
    
    // Cleanup temporary transformation mapping if this was a visual mapping execution
    if (mapping.is_temporary && mapping.is_visual_mapping) {
      try {
        await pool.query(
          'DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true',
          [mappingId]
        );
        systemLogger.info('Temporary transformation mapping cleaned up', {
          mappingId,
          jobId
        });
      } catch (cleanupError) {
        systemLogger.warn('Failed to cleanup temporary transformation mapping', {
          mappingId,
          jobId,
          error: cleanupError.message
        });
      }
    }
    
    // Emit alert event (fire-and-forget, non-blocking)
    setImmediate(() => {
      try {
        alertAggregationWorker.onJobCompleted(jobId, 'completed').catch(err => {
          systemLogger.warn('Failed to emit job completion alert event', {
            jobId,
            error: err.message
          });
        });
      } catch (err) {
        systemLogger.warn('Error emitting job completion alert event', {
          jobId,
          error: err.message
        });
      }
    });
    
    return {
      jobId,
      status: 'completed',
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    };
    
  } catch (error) {
    systemLogger.error('Job execution error:', error);
    
    if (job) {
      await updateJob(pool, job.job_id, {
        status: 'failed',
        error_message: error.message,
        end_time: new Date()
      });
      
      await logJobExecution(pool, job.job_id, 'error', 'Job execution failed', {
        error: error.message,
        stack: error.stack
      });
      
      // Emit visual mapping execution error event
      if (visualExecutionId) {
        // Emit failed status for all nodes (call WebSocket directly - helpers are scoped to try block)
        const allNodeIds = [...(nodesByType.sourceConfig || []), ...(nodesByType.expression || []), 
           ...(nodesByType.join || []), ...(nodesByType.rdmLookup || []), 
           ...(nodesByType.targetRules || [])];
        allNodeIds.forEach(nodeId => {
          try {
            visualMappingWS.emitNodeStatus(visualExecutionId, nodeId, 'failed', { error: error.message });
          } catch (wsErr) {
            systemLogger.warn('Failed to emit node status in catch block', { nodeId, error: wsErr.message });
          }
        });
        
        visualMappingWS.emitExecutionError(visualExecutionId, error);
        systemLogger.info('Visual mapping execution failed - WebSocket events emitted', {
          visualExecutionId,
          jobId: job.job_id,
          error: error.message,
          nodesNotified: allNodeIds.length
        });
      }
      
      // Cleanup temporary transformation mapping on failure
      if (mapping && mapping.is_temporary && mapping.is_visual_mapping) {
        try {
          await pool.query(
            'DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true',
            [mapping.mapping_id]
          );
          systemLogger.info('Temporary transformation mapping cleaned up after failure', {
            mappingId: mapping.mapping_id,
            jobId: job.job_id
          });
        } catch (cleanupError) {
          systemLogger.warn('Failed to cleanup temporary transformation mapping after failure', {
            mappingId: mapping.mapping_id,
            jobId: job.job_id,
            error: cleanupError.message
          });
        }
      }
      
      // Emit alert event (fire-and-forget, non-blocking)
      setImmediate(() => {
        try {
          alertAggregationWorker.onJobCompleted(job.job_id, 'failed').catch(err => {
            systemLogger.warn('Failed to emit job failure alert event', {
              jobId: job.job_id,
              error: err.message
            });
          });
        } catch (err) {
          systemLogger.warn('Error emitting job failure alert event', {
            jobId: job.job_id,
            error: err.message
          });
        }
      });
    }
    
    throw error;
  }
}

/**
 * Get mapping configuration
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} - Mapping configuration
 */
async function getMappingConfig(pool, mappingId) {
  const result = await pool.query(
    'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
    [mappingId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Mapping not found: ${mappingId}`);
  }
  
  const mapping = result.rows[0];
  
  // If using vendor agreement, fetch the connection ID and metadata from the agreement
  if (mapping.vendor_agreement_id) {
    const agreementResult = await pool.query(
      `SELECT 
        vendor_connection_id, 
        primary_contact_name, 
        primary_contact_email,
        drop_location_path, 
        agreement_code 
      FROM vendor_agreements 
      WHERE id = $1`,
      [mapping.vendor_agreement_id]
    );
    
    if (agreementResult.rows.length === 0) {
      throw new Error(`Vendor agreement not found: ${mapping.vendor_agreement_id}`);
    }
    
    const agreement = agreementResult.rows[0];
    
    // Set the source_connection_id to the vendor's connection ID for job execution
    mapping.source_connection_id = agreement.vendor_connection_id;
    
    // Cache vendor agreement metadata for lineage tracking
    mapping.vendor_agreement_metadata = {
      owner: agreement.primary_contact_name || agreement.primary_contact_email || null,
      path: agreement.drop_location_path || null,
      agreement_name: agreement.agreement_code || null
    };
    
    systemLogger.info('Vendor agreement metadata loaded for lineage tracking', {
      agreementId: mapping.vendor_agreement_id,
      owner: mapping.vendor_agreement_metadata.owner,
      path: mapping.vendor_agreement_metadata.path,
      agreementName: mapping.vendor_agreement_metadata.agreement_name
    });
  }
  
  return mapping;
}

/**
 * Fetch governance metadata for mapping job from vendor agreement
 * Mirrors Contract Validation's applyAgreementGovernance logic for mapping jobs
 * @param {Pool} pool - Database connection pool
 * @param {Object} mapping - Mapping configuration
 * @param {string} sourceFilename - Source filename to match against patterns
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} - Governance metadata {containsPii, dataClassification, piiColumns}
 */
async function fetchGovernanceForMapping(pool, mapping, sourceFilename, projectId) {
  // Only fetch governance if mapping uses vendor agreement
  if (!mapping.vendor_agreement_id) {
    systemLogger.info('No vendor agreement for mapping, skipping governance fetch');
    return {
      containsPii: false,
      dataClassification: null,
      piiColumns: [],
      fileTags: []
    };
  }
  
  try {
    systemLogger.info('Fetching governance metadata from vendor agreement', {
      agreementId: mapping.vendor_agreement_id,
      sourceFilename,
      projectId
    });
    
    // Fetch vendor agreement with file schemas (including quality_rule_ids for file tags)
    const agreementResult = await pool.query(`
      SELECT 
        va.id,
        va.agreement_code,
        vafs.id as schema_id,
        vafs.file_name_pattern,
        vafs.schema,
        vafs.contains_pii,
        vafs.data_classification,
        vafs.quality_rule_ids,
        vafs.priority
      FROM vendor_agreements va
      LEFT JOIN vendor_agreement_file_schemas vafs ON va.id = vafs.vendor_agreement_id AND vafs.is_active = true
      WHERE va.id = $1 AND va.project_id = $2
      ORDER BY vafs.priority ASC NULLS LAST
    `, [mapping.vendor_agreement_id, projectId]);
    
    if (agreementResult.rows.length === 0) {
      systemLogger.warn('Vendor agreement not found or no file schemas', {
        agreementId: mapping.vendor_agreement_id,
        projectId
      });
      return {
        containsPii: false,
        dataClassification: null,
        piiColumns: [],
        fileTags: []
      };
    }
    
    systemLogger.info('Fetched agreement schemas for governance', {
      agreementId: mapping.vendor_agreement_id,
      schemaCount: agreementResult.rows.length,
      patterns: agreementResult.rows.map(r => r.file_name_pattern)
    });
    
    // Match filename against patterns (same logic as Contract Validation)
    const { matchesPattern } = require('../utils/filePatternMatcher');
    let matchedSchema = null;
    
    for (const row of agreementResult.rows) {
      if (row.file_name_pattern && matchesPattern(sourceFilename, row.file_name_pattern)) {
        matchedSchema = row;
        systemLogger.info('Matched governance schema by pattern', {
          sourceFilename,
          pattern: row.file_name_pattern,
          schema_id: row.schema_id,
          contains_pii: row.contains_pii,
          classification: row.data_classification,
          quality_rules: row.quality_rule_ids
        });
        break;
      }
    }
    
    // Fallback to first schema if no pattern match
    if (!matchedSchema && agreementResult.rows[0].schema) {
      matchedSchema = agreementResult.rows[0];
      systemLogger.info('Using fallback governance schema (first schema)', {
        agreementId: mapping.vendor_agreement_id,
        sourceFilename,
        fallback_pattern: matchedSchema.file_name_pattern,
        fallback_classification: matchedSchema.data_classification
      });
    }
    
    if (!matchedSchema || !matchedSchema.schema) {
      systemLogger.warn('No matching schema found for governance', {
        agreementId: mapping.vendor_agreement_id,
        sourceFilename
      });
      return {
        containsPii: false,
        dataClassification: null,
        piiColumns: [],
        fileTags: []
      };
    }
    
    // Extract PII columns from schema (same logic as Contract Validation)
    const schemaObj = typeof matchedSchema.schema === 'string' 
      ? JSON.parse(matchedSchema.schema) 
      : matchedSchema.schema;
    
    const piiColumns = [];
    if (Array.isArray(schemaObj) && schemaObj.length > 0) {
      for (const column of schemaObj) {
        const isPii = column.is_pii === true || column.is_pii === 'true';
        if (isPii) {
          const columnName = column.name || column.column_name;
          if (columnName) {
            piiColumns.push(columnName);
          }
        }
      }
    }
    
    // Extract file-level tags from quality_rule_ids
    let fileTags = [];
    if (matchedSchema.quality_rule_ids && Array.isArray(matchedSchema.quality_rule_ids)) {
      try {
        const rulesResult = await pool.query(`
          SELECT id, rule_name 
          FROM quality_rules 
          WHERE id = ANY($1::int[])
        `, [matchedSchema.quality_rule_ids]);
        
        fileTags = rulesResult.rows.map(r => r.rule_name);
        
        systemLogger.info('Extracted file-level tags from quality rules', {
          sourceFilename,
          ruleIds: matchedSchema.quality_rule_ids,
          tags: fileTags
        });
      } catch (tagError) {
        systemLogger.warn('Failed to fetch quality rule names for tags', {
          sourceFilename,
          error: tagError.message
        });
      }
    }
    
    systemLogger.info('Extracted governance metadata for mapping', {
      sourceFilename,
      containsPii: matchedSchema.contains_pii || false,
      dataClassification: matchedSchema.data_classification,
      piiColumnCount: piiColumns.length,
      piiColumns: piiColumns,
      fileTagCount: fileTags.length,
      fileTags: fileTags
    });
    
    return {
      containsPii: matchedSchema.contains_pii || false,
      dataClassification: matchedSchema.data_classification || null,
      piiColumns: piiColumns,
      fileTags: fileTags
    };
    
  } catch (error) {
    systemLogger.error('Error fetching governance metadata', {
      agreementId: mapping.vendor_agreement_id,
      sourceFilename,
      error: error.message
    });
    // Return empty governance on error (don't fail the job)
    return {
      containsPii: false,
      dataClassification: null,
      piiColumns: [],
      fileTags: []
    };
  }
}

/**
 * Calculate column statistics from transformed rows
 * @param {Array} rows - Array of transformed data rows
 * @param {Array} schema - Schema definition with column names and types
 * @returns {Object} - Column statistics object keyed by column name
 */
function calculateColumnStatistics(rows, schema) {
  const stats = {};
  
  if (!rows || rows.length === 0 || !schema) {
    return stats;
  }

  // Initialize stats for each column
  schema.forEach(col => {
    stats[col.name] = {
      total_count: rows.length,
      null_count: 0,
      unique_values: new Set(),
      numeric_sum: 0,
      numeric_min: null,
      numeric_max: null,
      string_lengths: [],
      string_values: []  // Track all string values to find shortest/longest
    };
  });

  // Process each row to collect statistics
  rows.forEach(row => {
    schema.forEach(col => {
      const value = row[col.name];
      const colStats = stats[col.name];

      // Count nulls
      if (value === null || value === undefined || value === '') {
        colStats.null_count++;
        return;
      }

      // Track unique values
      colStats.unique_values.add(String(value));

      // Numeric statistics
      if (col.type && (col.type.includes('integer') || col.type.includes('float') || 
          col.type.includes('number') || col.type.includes('decimal'))) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          colStats.numeric_sum += numValue;
          colStats.numeric_min = colStats.numeric_min === null ? numValue : Math.min(colStats.numeric_min, numValue);
          colStats.numeric_max = colStats.numeric_max === null ? numValue : Math.max(colStats.numeric_max, numValue);
        }
      }

      // String statistics
      if (typeof value === 'string') {
        colStats.string_lengths.push(value.length);
        colStats.string_values.push(value);
      }
    });
  });

  // Finalize statistics
  schema.forEach(col => {
    const colStats = stats[col.name];
    
    // Calculate averages
    const nonNullCount = colStats.total_count - colStats.null_count;
    if (nonNullCount > 0 && colStats.numeric_sum !== 0) {
      colStats.numeric_avg = colStats.numeric_sum / nonNullCount;
    }

    // Calculate string length stats and find shortest/longest strings
    if (colStats.string_lengths.length > 0 && colStats.string_values.length > 0) {
      colStats.string_min_length = Math.min(...colStats.string_lengths);
      colStats.string_max_length = Math.max(...colStats.string_lengths);
      
      // Find shortest and longest strings by length
      const minLengthIdx = colStats.string_lengths.indexOf(colStats.string_min_length);
      const maxLengthIdx = colStats.string_lengths.indexOf(colStats.string_max_length);
      colStats.string_min_value = colStats.string_values[minLengthIdx];
      colStats.string_max_value = colStats.string_values[maxLengthIdx];
    }

    // Convert unique values set to count
    colStats.unique_count = colStats.unique_values.size;
    
    // Remove temporary data
    delete colStats.unique_values;
    delete colStats.string_lengths;
    delete colStats.string_values;

    // Clean up null values in numeric fields
    if (colStats.numeric_min === null) delete colStats.numeric_min;
    if (colStats.numeric_max === null) delete colStats.numeric_max;
    if (!colStats.numeric_avg) delete colStats.numeric_avg;
    if (colStats.numeric_sum === 0) delete colStats.numeric_sum;
    
    // Clean up empty string fields
    if (!colStats.string_min_length) delete colStats.string_min_length;
    if (!colStats.string_max_length) delete colStats.string_max_length;
    if (!colStats.string_min_value) delete colStats.string_min_value;
    if (!colStats.string_max_value) delete colStats.string_max_value;
  });

  return stats;
}

/**
 * Process a single file with transformations
 * @param {Pool} pool - Database connection pool
 * @param {Object} file - File record
 * @param {Object} mapping - Mapping configuration
 * @param {string} jobId - Job ID
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing result
 */
async function processFile(pool, file, mapping, jobId, options = {}) {
  const { dryRun = false, transformationJobDbId = null, userId = null, rdmContext = {}, onTransformComplete = null } = options;
  
  let rowsRead = 0;
  let rowsWritten = 0;
  let rowsFailed = 0;
  const transformedRows = [];
  
  // Get correlation_id from job record for source/target file linking
  const jobResult = await pool.query('SELECT correlation_id FROM transformation_jobs WHERE job_id = $1', [jobId]);
  const correlationId = jobResult.rows[0]?.correlation_id;
  
  try {
    // Step 1: Download file from source cloud storage
    await logJobExecution(pool, jobId, 'info', `Downloading file: ${file.filename}`, {
      source_connection_id: mapping.source_connection_id
    });
    
    const fileBuffer = await downloadFileFromConnection(
      pool, 
      mapping.source_connection_id, 
      file.filename
    );
    
    await logJobExecution(pool, jobId, 'info', `File downloaded: ${file.filename}`, {
      size: fileBuffer.length
    });
    
    // Step 2: Determine file type from filename
    let fileExtension = file.filename.split('.').pop().toLowerCase();
    
    // Step 2.1: Check if this is an archive file - archives need special handling
    if (isArchiveFile(file.filename)) {
      await logJobExecution(pool, jobId, 'info', `Detected archive file: ${file.filename}`, {
        extension: fileExtension,
        hasVendorAgreement: !!mapping.vendor_agreement_id
      });
      
      // Archives require a vendor agreement with password configuration
      if (!mapping.vendor_agreement_id) {
        throw new Error(
          `Unsupported file type: ${fileExtension}. ` +
          `Archive files (ZIP, TAR, 7z) require a vendor agreement with password configuration. ` +
          `Supported data file types: CSV, JSON, XLSX, XLS, Parquet, XML, DAT (fixed-width).`
        );
      }
      
      // Get password from vendor agreement vault
      const archivePassword = await getArchivePasswordFromVault(pool, mapping.vendor_agreement_id, file.filename);
      
      await logJobExecution(pool, jobId, 'info', `Archive password lookup completed`, {
        hasPassword: !!archivePassword,
        filename: file.filename
      });
      
      // Write archive buffer to temp file for extraction
      const tempDir = os.tmpdir();
      const tempArchivePath = path.join(tempDir, `archive_${Date.now()}_${path.basename(file.filename)}`);
      
      try {
        await fs.promises.writeFile(tempArchivePath, fileBuffer);
        
        await logJobExecution(pool, jobId, 'info', `Starting archive extraction`, {
          filename: file.filename,
          tempPath: tempArchivePath,
          size: fileBuffer.length
        });
        
        // Create virus scan service mock (extraction service requires it)
        const virusScanService = {
          scanFile: async (filePath) => ({ isInfected: false, skipped: true, viruses: [] })
        };
        
        // Create extraction service instance
        const archiveExtractionService = new ArchiveExtractionService(pool, virusScanService, systemLogger);
        
        // Extract archive with password (if available)
        const extractionResult = await archiveExtractionService.extractArchive(
          tempArchivePath,
          null, // We don't have a file ID in the files table yet
          archivePassword,
          null // userId
        );
        
        await logJobExecution(pool, jobId, 'info', `Archive extracted successfully`, {
          filename: file.filename,
          extractedCount: extractionResult.extractedCount,
          files: extractionResult.files.map(f => f.fileName)
        });
        
        // Process each extracted file through the transformation pipeline
        let totalRowsRead = 0;
        let totalRowsWritten = 0;
        let totalRowsFailed = 0;
        const allTransformedRows = [];
        const allSourceRows = [];
        
        for (const extractedFile of extractionResult.files) {
          const extractedBuffer = await fs.promises.readFile(extractedFile.fullPath);
          const extractedExtension = extractedFile.fileName.split('.').pop().toLowerCase();
          
          await logJobExecution(pool, jobId, 'info', `Processing extracted file: ${extractedFile.fileName}`, {
            extension: extractedExtension,
            size: extractedBuffer.length
          });
          
          // Skip nested archives or unsupported files
          if (isArchiveFile(extractedFile.fileName)) {
            await logJobExecution(pool, jobId, 'warn', `Skipping nested archive: ${extractedFile.fileName}`);
            continue;
          }
          
          // Process the extracted file based on its type
          let extractedParseResult = null;
          
          try {
            if (extractedExtension === 'csv') {
              extractedParseResult = await parseAndTransformCSV(
                extractedBuffer, 
                mapping.field_mappings,
                mapping.variables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'json') {
              extractedParseResult = await parseAndTransformJSON(
                extractedBuffer, 
                mapping.field_mappings,
                mapping.variables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'xlsx' || extractedExtension === 'xls') {
              extractedParseResult = await parseAndTransformXLSX(
                extractedBuffer, 
                mapping.field_mappings,
                mapping.variables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'xml') {
              extractedParseResult = await parseAndTransformXML(
                extractedBuffer, 
                mapping.field_mappings,
                mapping.variables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'parquet') {
              extractedParseResult = await parseAndTransformParquet(
                extractedBuffer, 
                mapping.field_mappings,
                mapping.variables,
                jobId, 
                pool,
                rdmContext
              );
            } else {
              await logJobExecution(pool, jobId, 'warn', `Skipping unsupported file type: ${extractedFile.fileName}`);
              continue;
            }
            
            if (extractedParseResult) {
              totalRowsRead += extractedParseResult.rowsRead || 0;
              totalRowsWritten += extractedParseResult.rowsWritten || 0;
              totalRowsFailed += extractedParseResult.rowsFailed || 0;
              
              if (extractedParseResult.transformedRows) {
                allTransformedRows.push(...extractedParseResult.transformedRows);
              }
              if (extractedParseResult.sourceRows) {
                allSourceRows.push(...extractedParseResult.sourceRows.slice(0, 100));
              }
            }
            
            await logJobExecution(pool, jobId, 'info', `Processed extracted file: ${extractedFile.fileName}`, {
              rowsRead: extractedParseResult?.rowsRead || 0,
              rowsWritten: extractedParseResult?.rowsWritten || 0
            });
            
          } catch (extractedErr) {
            await logJobExecution(pool, jobId, 'error', `Error processing extracted file ${extractedFile.fileName}: ${extractedErr.message}`);
            totalRowsFailed++;
          }
          
          // Clean up extracted file
          await fs.promises.unlink(extractedFile.fullPath).catch(() => {});
        }
        
        // Clean up temp archive
        await fs.promises.unlink(tempArchivePath).catch(() => {});
        
        // Return aggregated results from all extracted files
        return {
          rowsRead: totalRowsRead,
          rowsWritten: totalRowsWritten,
          rowsFailed: totalRowsFailed,
          transformedRows: allTransformedRows,
          sourceRows: allSourceRows.slice(0, 1000),
          archiveExtraction: {
            extractedCount: extractionResult.extractedCount,
            files: extractionResult.files.map(f => f.fileName)
          }
        };
        
      } catch (extractionError) {
        // Clean up temp file on error
        await fs.promises.unlink(tempArchivePath).catch(() => {});
        
        await logJobExecution(pool, jobId, 'error', `Archive extraction failed: ${extractionError.message}`, {
          filename: file.filename
        });
        
        throw new Error(
          `Failed to extract archive ${file.filename}: ${extractionError.message}. ` +
          `Ensure the password is correctly configured in the vendor agreement.`
        );
      }
    }
    
    // Step 2.2: Check for fixed-width/headerless files that need schema from vendor agreement
    let fixedWidthSchema = null;
    const isFixedWidthType = FIXED_WIDTH_EXTENSIONS.includes(fileExtension);
    
    if (mapping.vendor_agreement_id && (isFixedWidthType || fileExtension === 'csv')) {
      // Get schema from vendor agreement to check if it's headerless
      fixedWidthSchema = await getFixedWidthSchemaFromAgreement(
        pool, 
        mapping.vendor_agreement_id, 
        file.filename
      );
      
      if (fixedWidthSchema) {
        await logJobExecution(pool, jobId, 'info', `Found vendor agreement schema for file`, {
          filename: file.filename,
          fileType: fixedWidthSchema.fileType,
          hasHeader: fixedWidthSchema.hasHeader,
          hasHeaderDefinition: !!fixedWidthSchema.headerDefinition
        });
      }
    }
    
    // Step 2.5: Fetch governance metadata from vendor agreement (if applicable)
    let governance = null;
    if (mapping.vendor_agreement_id && mapping.project_id) {
      try {
        governance = await fetchGovernanceForMapping(pool, mapping, file.filename, mapping.project_id);
        await logJobExecution(pool, jobId, 'info', `Governance metadata fetched for source file`, {
          filename: file.filename,
          containsPii: governance.containsPii,
          dataClassification: governance.dataClassification,
          piiColumnCount: governance.piiColumns.length
        });
      } catch (govError) {
        await logJobExecution(pool, jobId, 'warn', `Failed to fetch governance metadata: ${govError.message}`);
        // Continue processing even if governance fetch fails
        governance = {
          containsPii: false,
          dataClassification: null,
          piiColumns: [],
          fileTags: []
        };
      }
    } else {
      // No vendor agreement, use empty governance
      governance = {
        containsPii: false,
        dataClassification: null,
        piiColumns: [],
        fileTags: []
      };
    }
    
    // Step 3: Parse file and apply transformations
    await logJobExecution(pool, jobId, 'info', `Parsing and transforming ${fileExtension.toUpperCase()} file`, {
      filename: file.filename,
      field_mappings_count: mapping.field_mappings?.length || 0
    });
    
    let parseResult;
    
    // Check if this is a fixed-width file that needs special parsing
    const isFixedWidth = fixedWidthSchema && 
      (fixedWidthSchema.fileType === 'fixed_width' || 
       fixedWidthSchema.fileType === 'dat' || 
       fixedWidthSchema.fileType === 'binary');
    
    // Check if this is a headerless CSV that needs column names from schema
    const isHeaderlessCSV = fileExtension === 'csv' && 
      fixedWidthSchema && 
      fixedWidthSchema.hasHeader === false;
    
    if (isFixedWidth && fixedWidthSchema.headerDefinition) {
      // Parse fixed-width file using schema from vendor agreement
      await logJobExecution(pool, jobId, 'info', `Parsing fixed-width file using vendor agreement schema`, {
        filename: file.filename,
        columnCount: fixedWidthSchema.headerDefinition.length,
        hasHeader: fixedWidthSchema.hasHeader
      });
      
      const fixedResult = parseFixedWidthBuffer(
        fileBuffer,
        fixedWidthSchema.headerDefinition,
        { hasHeader: fixedWidthSchema.hasHeader }
      );
      
      // Convert field mappings and variables to expected format (same as other parsers)
      const convertedMappings = convertFieldMappings(mapping.field_mappings);
      const convertedVariables = convertVariables(mapping.variables);
      
      // Transform the parsed rows using the same pipeline as CSV/JSON
      const transformedFixedRows = [];
      const sourceRows = []; // Track source rows for profiling
      let fixedRowsFailed = 0;
      const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
      
      for (let i = 0; i < fixedResult.rows.length; i++) {
        const row = fixedResult.rows[i];
        
        // Capture source rows for profiling
        if (i < MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...row});
        }
        
        try {
          const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
          if (transformedRow && Object.keys(transformedRow).length > 0) {
            transformedFixedRows.push(transformedRow);
          }
        } catch (err) {
          fixedRowsFailed++;
          systemLogger.warn('Fixed-width row transformation error', {
            rowNumber: i + 1,
            error: err.message
          });
        }
      }
      
      parseResult = {
        rowsRead: fixedResult.rowCount,
        rowsWritten: transformedFixedRows.length,
        rowsFailed: fixedRowsFailed,
        transformedRows: transformedFixedRows,
        sourceRows // Include for profiling
      };
    } else if (isHeaderlessCSV && fixedWidthSchema.headerDefinition) {
      // Parse headerless CSV using column names from vendor agreement
      await logJobExecution(pool, jobId, 'info', `Parsing headerless CSV using vendor agreement schema`, {
        filename: file.filename,
        columnCount: fixedWidthSchema.headerDefinition.length
      });
      
      // Pass column names to CSV parser
      const columnNames = fixedWidthSchema.headerDefinition.map(col => col.name);
      parseResult = await parseAndTransformCSV(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool,
        rdmContext,
        { headers: columnNames, skipFirstRow: false }
      );
    } else if (fileExtension === 'csv') {
      parseResult = await parseAndTransformCSV(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'json') {
      parseResult = await parseAndTransformJSON(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      parseResult = await parseAndTransformXLSX(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'parquet') {
      parseResult = await parseAndTransformParquet(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'xml') {
      parseResult = await parseAndTransformXML(
        fileBuffer, 
        mapping.field_mappings,
        mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (FIXED_WIDTH_EXTENSIONS.includes(fileExtension)) {
      // Fixed-width file without vendor agreement schema
      throw new Error(
        `Fixed-width file detected: ${file.filename}. ` +
        `Fixed-width files require a vendor agreement with column definitions (width, start_position). ` +
        `Please configure a vendor agreement with the file schema.`
      );
    } else {
      throw new Error(
        `Unsupported file type: ${fileExtension}. ` +
        `Supported types: CSV, JSON, XLSX, XLS, Parquet, XML, DAT (fixed-width with vendor agreement).`
      );
    }
    
    // Extract results from parseResult
    rowsRead = parseResult.rowsRead;
    rowsWritten = parseResult.rowsWritten;
    rowsFailed = parseResult.rowsFailed;
    transformedRows.push(...parseResult.transformedRows);
    
    await logJobExecution(pool, jobId, 'info', `Transformation complete`, {
      rows_read: rowsRead,
      rows_transformed: transformedRows.length,
      rows_failed: rowsFailed
    });
    
    // Step 3.2: Apply RDM lookups (dataset join + crosswalk) if enabled
    if (mapping.rdm_lookup_enabled) {
      await logJobExecution(pool, jobId, 'info', `Applying RDM enrichment phase`, {
        inputRows: transformedRows.length,
        hasDatasetJoin: !!mapping.rdm_dataset_config,
        hasCrosswalkLookup: !!mapping.rdm_crosswalk_config
      });
      
      try {
        const { applyRDMLookups } = require('./rdmLookupProcessor');
        const enrichedRows = applyRDMLookups(transformedRows, mapping, rdmContext);
        
        // Replace transformedRows with enriched data
        transformedRows.length = 0; // Clear array
        transformedRows.push(...enrichedRows);
        
        await logJobExecution(pool, jobId, 'info', `RDM enrichment complete`, {
          outputRows: transformedRows.length
        });
      } catch (rdmError) {
        await logJobExecution(pool, jobId, 'error', `RDM enrichment failed: ${rdmError.message}`, {
          error: rdmError.stack
        });
        throw new Error(`RDM enrichment failed: ${rdmError.message}`);
      }
    }
    
    // Step 3.3: Run quality validation on transformed data (if quality rules are defined)
    try {
      const qualityRulesResult = await pool.query(`
        SELECT qr.* 
        FROM transformation_quality_rules tqr
        INNER JOIN quality_rules qr ON tqr.quality_rule_id = qr.id
        WHERE tqr.mapping_id = $1 AND qr.enabled = true
        ORDER BY qr.id
      `, [mapping.mapping_id]);
      
      if (qualityRulesResult.rows.length > 0 && transformedRows.length > 0) {
        await logJobExecution(pool, jobId, 'info', `Running quality validation with ${qualityRulesResult.rows.length} rules`, {
          rule_count: qualityRulesResult.rows.length,
          row_count: transformedRows.length
        });
        
        const QualityValidationEngine = require('./qualityValidationEngine');
        const qualityEngine = new QualityValidationEngine(pool);
        
        const validationMetadata = {
          job_id: jobId,
          file_id: file.file_id || null,
          file_name: file.filename,
          mapping_id: mapping.mapping_id,
          upload_date: new Date()
        };
        
        const validationResult = await qualityEngine.validateData(
          qualityRulesResult.rows,
          transformedRows,
          validationMetadata
        );
        
        await logJobExecution(pool, jobId, 'info', `Quality validation complete`, {
          violations_found: validationResult.summary.violations_found,
          critical_count: validationResult.summary.critical_count,
          error_count: validationResult.summary.error_count,
          warning_count: validationResult.summary.warning_count
        });
        
        // Persist violations to database
        if (validationResult.violations.length > 0) {
          const violationsPersisted = await persistViolations(pool, jobId, file.file_id, validationResult.violations);
          
          await logJobExecution(pool, jobId, 'info', `Quality violations persisted`, {
            violations_count: violationsPersisted
          });
          
          // Handle violations based on violation_handling policy
          const violationHandling = mapping.violation_handling || 'log_continue';
          
          if (violationHandling === 'log_abort') {
            const abortMessage = `Quality violations detected (${validationResult.summary.violations_found} total). Aborting job per violation_handling policy.`;
            
            await updateJob(pool, jobId, {
              status: 'failed',
              error_message: abortMessage,
              end_time: new Date()
            });
            
            await logJobExecution(pool, jobId, 'error', abortMessage, {
              violations_summary: validationResult.summary,
              violation_handling: violationHandling
            });
            
            throw new Error(abortMessage);
          } else {
            // log_continue - just log and proceed
            await logJobExecution(pool, jobId, 'warn', `Quality violations detected but continuing per violation_handling policy`, {
              violations_summary: validationResult.summary,
              violation_handling: violationHandling
            });
          }
        }
      } else if (qualityRulesResult.rows.length > 0 && transformedRows.length === 0) {
        await logJobExecution(pool, jobId, 'info', `Skipping quality validation - no data to validate`);
      }
    } catch (qualityValidationError) {
      await logJobExecution(pool, jobId, 'error', `Quality validation failed: ${qualityValidationError.message}`, {
        error: qualityValidationError.stack
      });
      // Re-throw if this was an abort due to violations
      if (qualityValidationError.message.includes('Aborting job per violation_handling policy')) {
        throw qualityValidationError;
      }
      // Otherwise, log error but continue processing
    }
    
    // Create execution timestamp for profiling correlation (used for both source and target)
    const executionTimestamp = new Date();
    
    // IMPORTANT: Emit progress callback BEFORE heavy profiling operations
    // This allows WebSocket events to be sent immediately after transformation
    if (onTransformComplete) {
      await onTransformComplete({
        rowsRead,
        rowsWritten,
        rowsFailed,
        transformedRows: transformedRows.length,
        filename: file.filename
      });
      // Yield event loop to ensure WebSocket events are flushed before blocking profiling
      await new Promise(resolve => setImmediate(resolve));
    }
    
    // Step 3.5: Profile SOURCE file using Python profilers (same as file upload)
    // This downloads and profiles the actual S3 file instead of in-memory data
    // fileId will be auto-generated from file content hash if not already set
    if (!dryRun && fileBuffer && fileBuffer.length > 0) {
      try {
        await logJobExecution(pool, jobId, 'info', 
          `Profiling SOURCE file using Python profilers (matching file upload flow)`, {
          filename: file.filename,
          fileSize: fileBuffer.length,
          fileIdProvided: !!file.file_id
        });
        
        // Profile source file buffer using Python scripts (same as file upload)
        // Pass file.file_id if it exists (from vendor upload), otherwise let it auto-generate from hash
        // Include governance metadata from vendor agreement
        const sourceProfilingResult = await profileFileBuffer({
          fileBuffer,
          filename: file.filename,
          fileType: fileExtension,
          pool,
          fileId: file.file_id, // Will use hash if undefined
          fileRole: 'source',
          mappingId: mapping.mapping_id,
          jobId,
          userId,
          projectId: mapping.project_id,
          containsPii: governance.containsPii,
          dataClassification: governance.dataClassification,
          piiColumns: governance.piiColumns
        });
        
        if (sourceProfilingResult.success) {
          await logJobExecution(pool, jobId, 'info', 
            `SOURCE file profiling completed`, {
            fileId: sourceProfilingResult.fileId,
            fileRole: 'source',
            rowCount: sourceProfilingResult.rowCount,
            columnCount: sourceProfilingResult.columnCount,
            qualityScore: sourceProfilingResult.qualityScore
          });
          
          // Persist governance metadata using unified service (after profiling completes)
          try {
            const governanceResult = await persistGovernanceMetadata(pool, {
              fileId: sourceProfilingResult.fileId,
              containsPii: governance.containsPii,
              dataClassification: governance.dataClassification,
              fileTags: governance.fileTags || [],
              piiColumns: governance.piiColumns || [],
              profiledSchema: sourceProfilingResult.schema || []
            });
            
            if (governanceResult.success) {
              await logJobExecution(pool, jobId, 'info', 
                `SOURCE file governance metadata persisted`, {
                fileId: sourceProfilingResult.fileId,
                governanceApplied: governanceResult.governanceApplied
              });
            } else {
              await logJobExecution(pool, jobId, 'warn', 
                `Failed to persist SOURCE file governance metadata: ${governanceResult.error}`, {
                fileId: sourceProfilingResult.fileId
              });
            }
          } catch (govError) {
            await logJobExecution(pool, jobId, 'warn', 
              `Error persisting SOURCE file governance metadata: ${govError.message}`, {
              fileId: sourceProfilingResult.fileId
            });
          }
        } else {
          await logJobExecution(pool, jobId, 'warn', 
            `SOURCE file profiling failed: ${sourceProfilingResult.error}`, {
            fileId: sourceProfilingResult.fileId,
            fileRole: 'source'
          });
        }
      } catch (sourceProfilingError) {
        // Log but don't fail the job if source profiling fails
        await logJobExecution(pool, jobId, 'warn', 
          `SOURCE file profiling failed: ${sourceProfilingError.message}`, {
          error: sourceProfilingError.stack
        });
      }
    }
    
    // Step 4: Upload transformed data to target (if not dry run)
    if (!dryRun && transformedRows.length > 0 && mapping.target_connection_id) {
      // Determine output format (use target_file_format from mapping, default to csv)
      const outputFormat = (mapping.target_file_format || mapping.output_format || 'csv').toLowerCase().trim();
      
      await logJobExecution(pool, jobId, 'info', 
        `Uploading transformed data to target`, {
        target_connection_id: mapping.target_connection_id,
        rows: transformedRows.length,
        output_format: outputFormat
      });
      
      // Generate output filename with correct extension
      let outputFilename;
      if (mapping.target_file_name) {
        // Use custom target file name with placeholder replacement
        outputFilename = replacePlaceholders(mapping.target_file_name);
        // Ensure it has the correct extension
        if (!outputFilename.endsWith(`.${outputFormat}`)) {
          outputFilename = `${outputFilename.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
        }
      } else {
        // Generate default filename
        outputFilename = generateOutputFilename(file.filename, mapping.mapping_name, outputFormat);
      }
      
      // Prepend target file path if specified (for directory/folder structure in cloud storage)
      if (mapping.target_file_path) {
        const normalizedPath = mapping.target_file_path.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
        outputFilename = normalizedPath ? `${normalizedPath}/${outputFilename}` : outputFilename;
      }
      
      // Convert transformed rows to specified output format
      const outputBuffer = await convertToFormat(transformedRows, outputFormat);
      
      await logJobExecution(pool, jobId, 'info', 
        `Converted data to ${outputFormat.toUpperCase()} format`, {
        buffer_size: outputBuffer.length
      });
      
      // Upload to target connection
      const uploadResult = await uploadFileToConnection(
        pool,
        mapping.target_connection_id,
        outputFilename,
        outputBuffer
      );
      
      await logJobExecution(pool, jobId, 'info', 
        `Data uploaded to target: ${uploadResult.location}`
      );
      
      // Step 5: Capture file audit for transformation job
      try {
        // Use correlation_id from job record (retrieved at start of function)
        // This links source and target files together
        
        // Calculate source file hash
        const sourceFileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        // Extract schema from transformed rows (if we have any)
        const outputSchema = transformedRows.length > 0 
          ? Object.keys(transformedRows[0]).map(key => ({
              name: key,
              type: inferDataType(transformedRows[0][key])
            }))
          : [];
        
        // Capture schema for output file
        const schemaResult = await captureFileSchema(pool, {
          fileId: `transformed_${jobId}_${file.filename}`,
          fileName: outputFilename,
          fileSchema: {
            columns: outputSchema,
            encoding: 'utf-8',
            delimiter: outputFormat === 'csv' ? ',' : null
          },
          correlationId,
          createdBy: null // System-generated transformation
        });
        
        // Capture source file audit
        const sourceAuditId = await captureFileAudit(pool, {
          fileId: file.file_id || `source_${file.filename}`,
          fileName: file.filename,
          fileSchemaId: null, // Source schema not tracked here
          fileHash: sourceFileHash,
          filePattern: mapping.source_file_pattern || mapping.file_name_pattern,
          fileType: fileExtension,
          fileDelimiter: fileExtension === 'csv' ? ',' : null,
          encoding: 'utf-8',
          numberOfColumns: null,
          fileSizeBytes: fileBuffer.length,
          source: 'transformation',
          sourcePath: file.filename,
          noOfRecordsInSource: rowsRead,
          loadStep1: 'download',
          loadStep1Path: file.filename,
          loadStep1RecCnt: rowsRead,
          loadType: 'etl_transformation',
          correlationId,
          transformationJobId: transformationJobDbId,
          mappingName: mapping.mapping_name,
          userId: userId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: userId,
          fileRole: 'source'
        });
        
        // Fetch vendor agreement file schema data classification if available
        let dataClassification = null;
        if (mapping.vendor_agreement_file_schema_id) {
          try {
            const fileSchemaResult = await pool.query(
              'SELECT data_classification FROM vendor_agreement_file_schemas WHERE id = $1',
              [mapping.vendor_agreement_file_schema_id]
            );
            if (fileSchemaResult.rows.length > 0) {
              dataClassification = fileSchemaResult.rows[0].data_classification;
            }
          } catch (schemaError) {
            systemLogger.error('Error fetching vendor agreement file schema', { 
              error: schemaError.message,
              vendor_agreement_file_schema_id: mapping.vendor_agreement_file_schema_id
            });
          }
        }
        
        // Capture target file audit (output file)
        await captureFileAudit(pool, {
          fileId: `transformed_${jobId}_${file.filename}`,
          fileName: outputFilename,
          fileSchemaId: schemaResult.schemaId,
          fileHash: crypto.createHash('sha256').update(outputBuffer).digest('hex'),
          filePattern: null,
          fileType: outputFormat,
          fileDelimiter: outputFormat === 'csv' ? ',' : null,
          encoding: 'utf-8',
          numberOfColumns: outputSchema.length,
          fileSizeBytes: outputBuffer.length,
          source: 'transformation',
          sourcePath: file.filename,
          noOfRecordsInSource: rowsRead,
          loadStep1: 'upload',
          loadStep1Path: uploadResult.location,
          loadStep1RecCnt: rowsWritten,
          loadType: 'etl_transformation',
          parentAuditId: sourceAuditId,
          correlationId,
          transformationJobId: transformationJobDbId,
          mappingName: mapping.mapping_name,
          userId: userId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: null,
          fileRole: 'target',
          metadata: JSON.stringify({
            pii_columns: mapping.pii_columns || [],
            transformation_id: mapping.mapping_id,
            data_classification: dataClassification
          })
        });
        
        await logJobExecution(pool, jobId, 'info', 
          `File audit captured for transformation`, {
          correlationId,
          sourceFile: file.filename,
          targetFile: outputFilename
        });
        
        // Create transformation lineage record (only if schema changed)
        try {
          const { generateSchemaFingerprint } = require('../utils/schemaFingerprint');
          
          // Build source schema from field mappings
          const sourceFields = new Set();
          if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
            mapping.field_mappings.forEach(fieldMapping => {
              if (fieldMapping.sourceFields && Array.isArray(fieldMapping.sourceFields)) {
                fieldMapping.sourceFields.forEach(sf => sourceFields.add(sf));
              }
            });
          }
          
          const sourceSchema = Array.from(sourceFields).map(name => ({
            name,
            type: 'string' // Type will be inferred from actual data
          }));
          
          // Generate schema fingerprints
          const sourceFingerprint = generateSchemaFingerprint(sourceSchema);
          const targetFingerprint = generateSchemaFingerprint(outputSchema);
          const combinedFingerprint = crypto.createHash('sha256')
            .update(sourceFingerprint + '_to_' + targetFingerprint)
            .digest('hex');
          
          // Check if lineage with same schema already exists for this mapping
          const existingLineageCheck = await pool.query(`
            SELECT id, schema_fingerprint 
            FROM transformation_lineage 
            WHERE mapping_id = $1 
              AND lineage_type = 'file-specific'
              AND schema_fingerprint = $2
            ORDER BY created_at DESC 
            LIMIT 1
          `, [mapping.mapping_id, combinedFingerprint]);
          
          if (existingLineageCheck.rows.length > 0) {
            // Schema unchanged - update existing lineage timestamp and column mappings
            
            // Build column-level PII mappings even for updates (in case metadata changed)
            let columnMappings = [];
            
            try {
              // Fetch column_metadata from vendor agreement file schema if available
              let columnMetadata = {};
              
              if (mapping.vendor_agreement_id && mapping.vendor_agreement_file_schema_id) {
                const schemaResult = await pool.query(
                  'SELECT column_metadata FROM vendor_agreement_file_schemas WHERE id = $1',
                  [mapping.vendor_agreement_file_schema_id]
                );
                
                if (schemaResult.rows.length > 0 && schemaResult.rows[0].column_metadata) {
                  columnMetadata = schemaResult.rows[0].column_metadata;
                }
              }
              
              // If no vendor metadata, fetch PII info from upstream lineage (for chained transformations)
              if (Object.keys(columnMetadata).length === 0 && file.file_id) {
                const upstreamLineageResult = await pool.query(`
                  SELECT column_mappings 
                  FROM transformation_lineage 
                  WHERE output_file_id = $1 
                  ORDER BY created_at DESC 
                  LIMIT 1
                `, [file.file_id]);
                
                if (upstreamLineageResult.rows.length > 0 && upstreamLineageResult.rows[0].column_mappings) {
                  const upstreamMappings = upstreamLineageResult.rows[0].column_mappings;
                  // Build columnMetadata from upstream target columns
                  upstreamMappings.forEach(mapping => {
                    if (mapping.target_column && mapping.contains_pii) {
                      columnMetadata[mapping.target_column] = {
                        contains_pii: mapping.contains_pii,
                        pii_type: mapping.pii_type
                      };
                    }
                  });
                  
                  const piiColumnsFound = Object.keys(columnMetadata).filter(col => columnMetadata[col].contains_pii);
                  if (piiColumnsFound.length > 0) {
                    await logJobExecution(pool, jobId, 'info', 
                      `PII metadata inherited from upstream lineage (chained transformation)`, {
                      sourceFileId: file.file_id,
                      piiColumnsInherited: piiColumnsFound.length,
                      piiColumns: piiColumnsFound
                    });
                  }
                }
              }
              
              // Build column mappings from field_mappings with PII propagation
              if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
                columnMappings = mapping.field_mappings.map(fieldMapping => {
                  // Handle both old (sourceFields array) and new (source_field string) formats
                  const sourceColumn = fieldMapping.source_field || 
                    (fieldMapping.sourceFields && fieldMapping.sourceFields.length > 0 ? fieldMapping.sourceFields[0] : null);
                  const targetColumn = fieldMapping.target_field || fieldMapping.targetField || null;
                  
                  // Check if source column has PII metadata
                  const sourcePiiInfo = sourceColumn && columnMetadata[sourceColumn] 
                    ? columnMetadata[sourceColumn] 
                    : null;
                  
                  return {
                    source_column: sourceColumn,
                    target_column: targetColumn,
                    contains_pii: sourcePiiInfo?.contains_pii || false,
                    pii_type: sourcePiiInfo?.pii_type || null,
                    transformation_applied: fieldMapping.transformation || 
                      (fieldMapping.transformations && fieldMapping.transformations.length > 0
                        ? fieldMapping.transformations.map(t => t.type).join(', ')
                        : null)
                  };
                }).filter(cm => cm.source_column && cm.target_column);
              }
            } catch (columnMappingError) {
              await logJobExecution(pool, jobId, 'warn', 
                `Failed to build column-level PII mappings for update: ${columnMappingError.message}`, {
                error: columnMappingError.stack
              });
            }
            
            const updateQuery = `
              UPDATE transformation_lineage 
              SET created_at = NOW(),
                  execution_id = $1,
                  output_file_id = $2,
                  column_mappings = $3
              WHERE id = $4
              RETURNING id
            `;
            
            await pool.query(updateQuery, [
              transformationJobDbId,
              `transformed_${jobId}_${file.filename}`,
              JSON.stringify(columnMappings),
              existingLineageCheck.rows[0].id
            ]);
            
            await logJobExecution(pool, jobId, 'info', 
              `Lineage updated with latest timestamp and column mappings`, {
              mappingId: mapping.mapping_id,
              lineageId: existingLineageCheck.rows[0].id,
              schemaFingerprint: combinedFingerprint,
              columnMappingsCount: columnMappings.length,
              piiColumnsTracked: columnMappings.filter(cm => cm.contains_pii).length
            });
          } else {
            // Schema changed or first time - create lineage record
            
            // Build column-level PII mappings for lineage tracking
            let columnMappings = [];
            
            try {
              // Fetch column_metadata from vendor agreement file schema if available
              let columnMetadata = {};
              
              if (mapping.vendor_agreement_id && mapping.vendor_agreement_file_schema_id) {
                const schemaResult = await pool.query(
                  'SELECT column_metadata FROM vendor_agreement_file_schemas WHERE id = $1',
                  [mapping.vendor_agreement_file_schema_id]
                );
                
                if (schemaResult.rows.length > 0 && schemaResult.rows[0].column_metadata) {
                  columnMetadata = schemaResult.rows[0].column_metadata;
                }
              }
              
              // If no vendor metadata, fetch PII info from upstream lineage (for chained transformations)
              if (Object.keys(columnMetadata).length === 0 && file.file_id) {
                const upstreamLineageResult = await pool.query(`
                  SELECT column_mappings 
                  FROM transformation_lineage 
                  WHERE output_file_id = $1 
                  ORDER BY created_at DESC 
                  LIMIT 1
                `, [file.file_id]);
                
                if (upstreamLineageResult.rows.length > 0 && upstreamLineageResult.rows[0].column_mappings) {
                  const upstreamMappings = upstreamLineageResult.rows[0].column_mappings;
                  // Build columnMetadata from upstream target columns
                  upstreamMappings.forEach(mapping => {
                    if (mapping.target_column && mapping.contains_pii) {
                      columnMetadata[mapping.target_column] = {
                        contains_pii: mapping.contains_pii,
                        pii_type: mapping.pii_type
                      };
                    }
                  });
                  
                  const piiColumnsFound = Object.keys(columnMetadata).filter(col => columnMetadata[col].contains_pii);
                  if (piiColumnsFound.length > 0) {
                    await logJobExecution(pool, jobId, 'info', 
                      `PII metadata inherited from upstream lineage (chained transformation)`, {
                      sourceFileId: file.file_id,
                      piiColumnsInherited: piiColumnsFound.length,
                      piiColumns: piiColumnsFound
                    });
                  }
                }
              }
              
              // Get PII columns array from mapping configuration (user-tagged PII fields)
              const piiColumnsArray = mapping.pii_columns || [];
              if (piiColumnsArray.length > 0) {
                await logJobExecution(pool, jobId, 'info', 
                  `PII columns defined in mapping configuration`, {
                  piiColumns: piiColumnsArray,
                  count: piiColumnsArray.length
                });
              }
              
              // Build column mappings from field_mappings with PII propagation
              if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
                columnMappings = mapping.field_mappings.map(fieldMapping => {
                  // Handle both old (sourceFields array) and new (source_field string) formats
                  const sourceColumn = fieldMapping.source_field || 
                    (fieldMapping.sourceFields && fieldMapping.sourceFields.length > 0 ? fieldMapping.sourceFields[0] : null);
                  const targetColumn = fieldMapping.target_field || fieldMapping.targetField || null;
                  
                  // Check if source column has PII metadata from vendor schema or upstream lineage
                  const sourcePiiInfo = sourceColumn && columnMetadata[sourceColumn] 
                    ? columnMetadata[sourceColumn] 
                    : null;
                  
                  // Check if target column is marked as PII in mapping configuration
                  const isTargetPii = targetColumn && piiColumnsArray.includes(targetColumn);
                  
                  // Target field has PII if either:
                  // 1. Source field has PII (propagated)
                  // 2. Target field is explicitly marked as PII in mapping config
                  const containsPii = sourcePiiInfo?.contains_pii || isTargetPii || false;
                  const piiType = sourcePiiInfo?.pii_type || (isTargetPii ? 'PII' : null);
                  
                  return {
                    source_column: sourceColumn,
                    target_column: targetColumn,
                    contains_pii: containsPii,
                    pii_type: piiType,
                    transformation_applied: fieldMapping.transformation || 
                      (fieldMapping.transformations && fieldMapping.transformations.length > 0
                        ? fieldMapping.transformations.map(t => t.type).join(', ')
                        : null)
                  };
                }).filter(cm => cm.source_column && cm.target_column); // Only include mappings with both source and target
              }
            } catch (columnMappingError) {
              await logJobExecution(pool, jobId, 'warn', 
                `Failed to build column-level PII mappings: ${columnMappingError.message}`, {
                error: columnMappingError.stack
              });
            }
            
            // Prepare source/target metadata based on source type
            let sourceOwner, sourcePath, sourceAgreementName;
            
            if (mapping.vendor_agreement_id && mapping.vendor_agreement_metadata) {
              // Vendor agreement source
              sourceOwner = mapping.vendor_agreement_metadata.owner;
              sourcePath = mapping.vendor_agreement_metadata.path;
              sourceAgreementName = mapping.vendor_agreement_metadata.agreement_name;
              
              if (!sourceOwner) {
                await logJobExecution(pool, jobId, 'warn', 
                  'Vendor agreement missing primary contact for lineage tracking', {
                  agreementId: mapping.vendor_agreement_id
                });
              }
            } else {
              // Regular connection source
              sourceOwner = mapping.source_owner || null;
              // Extract path from filename (everything before last slash)
              const lastSlash = file.filename.lastIndexOf('/');
              sourcePath = lastSlash !== -1 ? file.filename.substring(0, lastSlash) : (mapping.file_path || null);
              sourceAgreementName = null;
            }
            
            const targetOwner = mapping.target_owner || null;
            const targetPath = mapping.target_file_path || null;
            
            const lineageQuery = `
              INSERT INTO transformation_lineage (
                transformation_id, 
                mapping_id,
                input_file_id, 
                output_file_id, 
                execution_id,
                schema_fingerprint,
                lineage_type,
                source_schema,
                target_schema,
                column_mappings,
                source_owner,
                target_owner,
                source_path,
                target_path,
                source_agreement_name,
                created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
              RETURNING id
            `;
            
            const lineageResult = await pool.query(lineageQuery, [
              mapping.transformation_id || `transform_${mapping.mapping_id}`,
              mapping.mapping_id,
              file.file_id || `source_${file.filename}`,
              `transformed_${jobId}_${file.filename}`,
              transformationJobDbId,
              combinedFingerprint,
              'file-specific',
              JSON.stringify(sourceSchema),
              JSON.stringify(outputSchema),
              JSON.stringify(columnMappings),
              sourceOwner,
              targetOwner,
              sourcePath,
              targetPath,
              sourceAgreementName
            ]);
            
            await logJobExecution(pool, jobId, 'info', 
              `Transformation lineage created`, {
              lineageId: lineageResult.rows[0]?.id,
              mappingId: mapping.mapping_id,
              inputFile: file.filename,
              outputFile: outputFilename,
              schemaFingerprint: combinedFingerprint,
              sourceFieldsCount: sourceSchema.length,
              targetFieldsCount: outputSchema.length,
              columnMappingsCount: columnMappings.length,
              piiColumnsTracked: columnMappings.filter(cm => cm.contains_pii).length
            });
          }
        } catch (lineageError) {
          // Log but don't fail the job if lineage creation fails
          await logJobExecution(pool, jobId, 'warn', 
            `Transformation lineage creation failed: ${lineageError.message}`, {
            error: lineageError.stack
          });
        }

        // Step 6: Profile the TARGET file using Python profilers (same as file upload)
        // Profile in-memory buffer to avoid redundant S3 download (performance optimization)
        try {
          // Use same file ID as audit/lineage for consistency
          const targetFileId = `transformed_${jobId}_${file.filename}`;
          
          await logJobExecution(pool, jobId, 'info', 
            `Profiling TARGET file from in-memory buffer using Python profilers`, {
            filename: outputFilename,
            fileRole: 'target',
            bufferSize: outputBuffer.length,
            fileId: targetFileId
          });

          // Profile the in-memory outputBuffer directly (avoids redundant S3 download)
          // Pass explicit fileId to match audit trail and ensure PII tags use same ID
          // Propagate governance metadata from source file to target file
          const targetProfilingResult = await profileFileBuffer({
            pool,
            fileBuffer: outputBuffer,
            filename: outputFilename,
            fileType: outputFormat,
            fileId: targetFileId,
            fileRole: 'target',
            mappingId: mapping.mapping_id,
            jobId,
            userId,
            projectId: mapping.project_id,
            containsPii: governance.containsPii,
            dataClassification: governance.dataClassification,
            piiColumns: governance.piiColumns,
            metadata: {
              pii_columns: mapping.pii_columns || governance.piiColumns || [],
              transformation_id: mapping.mapping_id,
              data_classification: governance.dataClassification || dataClassification
            }
          });

          if (targetProfilingResult.success) {
            await logJobExecution(pool, jobId, 'info', 
              `TARGET file profiling completed`, {
              fileId: targetProfilingResult.fileId,
              fileRole: 'target',
              rowCount: targetProfilingResult.rowCount,
              columnCount: targetProfilingResult.columnCount,
              qualityScore: targetProfilingResult.qualityScore
            });
            
            // Persist governance metadata using unified service (after profiling completes)
            try {
              // Combine governance from vendor agreement and mapping-specific PII columns
              const combinedPiiColumns = [
                ...(governance.piiColumns || []),
                ...(mapping.pii_columns || [])
              ];
              
              // Remove duplicates
              const uniquePiiColumns = [...new Set(combinedPiiColumns)];
              
              const governanceResult = await persistGovernanceMetadata(pool, {
                fileId: targetProfilingResult.fileId,
                containsPii: governance.containsPii || uniquePiiColumns.length > 0,
                dataClassification: governance.dataClassification,
                fileTags: governance.fileTags || [],
                piiColumns: uniquePiiColumns,
                profiledSchema: targetProfilingResult.schema || []
              });
              
              if (governanceResult.success) {
                await logJobExecution(pool, jobId, 'info', 
                  `TARGET file governance metadata persisted`, {
                  fileId: targetProfilingResult.fileId,
                  governanceApplied: governanceResult.governanceApplied
                });
              } else {
                await logJobExecution(pool, jobId, 'warn', 
                  `Failed to persist TARGET file governance metadata: ${governanceResult.error}`, {
                  fileId: targetProfilingResult.fileId
                });
              }
            } catch (govError) {
              await logJobExecution(pool, jobId, 'warn', 
                `Error persisting TARGET file governance metadata: ${govError.message}`, {
                fileId: targetProfilingResult.fileId
              });
            }
          } else {
            await logJobExecution(pool, jobId, 'warn', 
              `TARGET file profiling failed: ${targetProfilingResult.error}`, {
              fileRole: 'target'
            });
          }
        } catch (profilingError) {
          // Log but don't fail the job if profiling fails
          await logJobExecution(pool, jobId, 'warn', 
            `TARGET file profiling failed: ${profilingError.message}`, {
            error: profilingError.stack
          });
        }
      } catch (auditError) {
        // Log but don't fail the job if audit fails
        await logJobExecution(pool, jobId, 'warn', 
          `File audit capture failed: ${auditError.message}`, {
          error: auditError.stack
        });
      }
    }
    
    return {
      rowsRead,
      rowsWritten,
      rowsFailed
    };
    
  } catch (error) {
    await logJobExecution(pool, jobId, 'error', 
      `File processing error: ${file.filename}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Convert database field mapping format to transformRow expected format
 * @param {Array} dbFieldMappings - Field mappings from database
 * @returns {Array} - Converted field mappings for transformRow
 */
function convertFieldMappings(dbFieldMappings) {
  if (!dbFieldMappings || dbFieldMappings.length === 0) {
    return [];
  }
  
  const { parseExpressionToTransformation, evaluateTransformationConfig } = require('./expressionParser');
  
  return dbFieldMappings.map(mapping => {
    const converted = {
      targetField: mapping.target_field,
      sourceFields: [],
      transformations: []
    };
    
    // NEW FORMAT: expression field (from visual builder)
    if (mapping.expression) {
      try {
        const transformConfig = parseExpressionToTransformation(mapping.expression);
        
        if (transformConfig) {
          const { sourceFields, transformations } = evaluateTransformationConfig(transformConfig);
          converted.sourceFields = sourceFields;
          converted.transformations = transformations;
        }
      } catch (error) {
        systemLogger.error('Expression parsing failed for mapping:', {
          target_field: mapping.target_field,
          expression: mapping.expression,
          error: error.message
        });
        // Fall through to legacy format or empty
      }
    } 
    // LEGACY FORMAT: transformation + transformation_params
    else if (mapping.transformation && mapping.transformation !== 'none') {
      // Handle source_field - it can be a string, array, or null from JSONB storage
      if (mapping.source_field) {
        if (Array.isArray(mapping.source_field)) {
          converted.sourceFields = mapping.source_field;
        } else {
          converted.sourceFields = [mapping.source_field];
        }
      }
      
      // Normalize transformation name (handle hyphenated and uppercase variants)
      let transformationType = mapping.transformation.toLowerCase().replace(/-/g, '_');
      
      // Map common UI names to engine names
      const legacyTypeMap = {
        'cast_string': 'cast',
        'cast_integer': 'cast',
        'cast_float': 'cast',
        'cast_boolean': 'cast',
        'null_to_value': 'null_to_value',
        'trim': 'trim',
        'round': 'round',
        'ceil': 'ceil',
        'floor': 'floor',
        'upper': 'upper',
        'lower': 'lower'
      };
      
      transformationType = legacyTypeMap[transformationType] || transformationType;
      
      // Adjust params based on type
      let params = { ...(mapping.transformation_params || {}) };
      if (transformationType === 'cast') {
        // Infer target type from original transformation name
        const originalName = mapping.transformation.toLowerCase().replace(/-/g, '_');
        if (originalName.includes('string')) params.targetType = 'string';
        else if (originalName.includes('integer')) params.targetType = 'integer';
        else if (originalName.includes('float')) params.targetType = 'float';
        else if (originalName.includes('boolean')) params.targetType = 'boolean';
        else if (!params.targetType) params.targetType = 'string';
      } else if (transformationType === 'null_to_value' && params.value && !params.defaultValue) {
        // Map 'value' param to 'defaultValue'
        params.defaultValue = params.value;
        delete params.value;
      }
      
      converted.transformations.push({
        type: transformationType,
        params
      });
    }
    // SIMPLE PASS-THROUGH: just source to target
    else if (mapping.source_field) {
      if (Array.isArray(mapping.source_field)) {
        converted.sourceFields = mapping.source_field;
      } else {
        converted.sourceFields = [mapping.source_field];
      }
    }
    
    return converted;
  });
}

/**
 * Convert database variable definitions to transformRow expected format
 * @param {Array} dbVariables - Variables from database
 * @returns {Array} - Converted variables for transformRow
 */
function convertVariables(dbVariables) {
  if (!dbVariables || dbVariables.length === 0) {
    return [];
  }
  
  const { parseExpressionToTransformation, evaluateTransformationConfig } = require('./expressionParser');
  
  // Sort by sequence to ensure correct evaluation order
  const sortedVariables = [...dbVariables].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  
  return sortedVariables.map(variable => {
    const converted = {
      name: variable.name,
      sourceFields: [],
      transformations: []
    };
    
    // NEW FORMAT: expression field
    if (variable.expression) {
      try {
        const transformConfig = parseExpressionToTransformation(variable.expression);
        
        if (transformConfig) {
          const { sourceFields, transformations } = evaluateTransformationConfig(transformConfig);
          converted.sourceFields = sourceFields;
          converted.transformations = transformations;
        }
      } catch (error) {
        systemLogger.error('Expression parsing failed for variable:', {
          name: variable.name,
          expression: variable.expression,
          error: error.message
        });
      }
    }
    // LEGACY FORMAT: transformation + params
    else if (variable.transformation) {
      if (variable.source_field) {
        converted.sourceFields = Array.isArray(variable.source_field) 
          ? variable.source_field 
          : [variable.source_field];
      }
      
      if (variable.transformation !== 'none') {
        converted.transformations.push({
          type: variable.transformation,
          params: variable.params || {}
        });
      }
    }
    
    return converted;
  });
}

/**
 * Parse CSV and apply transformations
 * @param {Buffer} buffer - File buffer
 * @param {Array} fieldMappings - Field mappings
 * @param {Object} variables - Variables
 * @param {string} jobId - Job ID
 * @param {Object} pool - Database pool
 * @param {Object} rdmContext - RDM context
 * @param {Object} options - Additional options
 * @param {Array} options.headers - Custom column headers for headerless files
 * @param {boolean} options.skipFirstRow - Whether to skip first row (default true for files with headers)
 */
async function parseAndTransformCSV(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const { headers: customHeaders = null, skipFirstRow = true } = options;
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    let firstRow = null;
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000; // Limit memory usage
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    const stream = Readable.from(buffer);
    
    // Configure CSV parser options
    const csvOptions = {};
    if (customHeaders) {
      // Use custom headers for headerless files
      csvOptions.headers = customHeaders;
      csvOptions.skipLines = skipFirstRow ? 0 : 0; // Don't skip any lines for headerless files
      systemLogger.info('CSV parsing with custom headers', {
        headers: customHeaders,
        headerCount: customHeaders.length
      });
    }
    
    stream
      .pipe(csv(csvOptions))
      .on('data', (row) => {
        rowsRead++;
        
        // Capture source row for profiling (limit to first 1000 rows)
        if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...row}); // Clone the row
        }
        
        // Log first row for debugging (only column names, not data)
        if (rowsRead === 1) {
          firstRow = row;
          systemLogger.info('CSV first row columns:', { 
            columns: Object.keys(row),
            fieldMappingsCount: convertedMappings?.length || 0
          });
          systemLogger.info('Converted field mappings sample:', {
            sample: convertedMappings.slice(0, 3)
          });
        }
        
        try {
          const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
          
          // Debug first transformed row
          if (rowsRead === 1) {
            systemLogger.info('First transformed row structure:', {
              keys: Object.keys(transformedRow),
              valueTypes: Object.keys(transformedRow).reduce((acc, key) => {
                acc[key] = typeof transformedRow[key];
                return acc;
              }, {})
            });
          }
          
          // Check if transformedRow has any data
          if (Object.keys(transformedRow).length === 0) {
            systemLogger.warn('Transformed row is empty', {
              rowNumber: rowsRead,
              columnCount: Object.keys(row).length
            });
          }
          
          transformedRows.push(transformedRow);
          rowsWritten++;
        } catch (error) {
          rowsFailed++;
          systemLogger.error('Row transformation error', { 
            row: rowsRead, 
            error: error.message
          });
        }
      })
      .on('end', () => {
        systemLogger.info('CSV parsing complete', {
          rowsRead,
          rowsWritten,
          rowsFailed,
          transformedRowsCount: transformedRows.length,
          sourceRowsCount: sourceRows.length,
          hasData: transformedRows.length > 0
        });
        
        resolve({ 
          transformedRows,
          sourceRows, // Include source rows for profiling
          rowsRead, 
          rowsWritten, 
          rowsFailed 
        });
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
  });
}

/**
 * Parse JSON and apply transformations
 */
async function parseAndTransformJSON(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    const jsonData = JSON.parse(buffer.toString());
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of dataArray) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`JSON parsing error: ${error.message}`);
  }
}

/**
 * Parse XLSX (Excel) and apply transformations
 */
async function parseAndTransformXLSX(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    // Parse XLSX file
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of jsonData) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`XLSX parsing error: ${error.message}`);
  }
}

/**
 * Parse Parquet and apply transformations
 */
async function parseAndTransformParquet(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    // Dynamic import for hyparquet (ES module)
    const { parquetReadObjects } = await import('hyparquet');
    
    // Convert Node.js Buffer to ArrayBuffer for hyparquet
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset, 
      buffer.byteOffset + buffer.byteLength
    );
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    systemLogger.info('Parquet parsing started');
    
    // Read parquet file as async iterator
    const parquetIterator = await parquetReadObjects({ file: arrayBuffer });
    
    // Consume async iterator properly
    for await (const row of parquetIterator) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        // Log first row for debugging
        if (rowsRead === 1) {
          systemLogger.info('Parquet first row columns:', { 
            columns: Object.keys(row),
            sample: Object.keys(row).slice(0, 5)
          });
        }
        
        const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    systemLogger.info('Parquet parsing complete', {
      rowsRead,
      rowsWritten,
      rowsFailed,
      sourceRowsCount: sourceRows.length
    });
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    systemLogger.error('Parquet parsing error:', error);
    throw new Error(`Parquet parsing error: ${error.message}`);
  }
}

/**
 * Flatten nested object into dot notation
 * Handles arrays of objects by flattening the first element to extract schema
 * Example: { user: { name: 'John', address: { city: 'NYC' } } }
 * becomes: { 'user.name': 'John', 'user.address.city': 'NYC' }
 * Example: { items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}] }
 * becomes: { 'items.id': 1, 'items.name': 'A' }
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        // Null or undefined values
        flattened[newKey] = value;
      } else if (Array.isArray(value)) {
        // Handle arrays
        if (value.length === 0) {
          // Empty array
          flattened[newKey] = '';
        } else if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
          // Array of objects - flatten the first object to extract schema
          const firstElement = value[0];
          Object.assign(flattened, flattenObject(firstElement, newKey));
        } else {
          // Array of primitives - convert to comma-separated string
          flattened[newKey] = value.join(', ');
        }
      } else if (typeof value === 'object') {
        // Nested object - recursively flatten
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        // Primitive value
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

/**
 * Parse XML and apply transformations
 * Enhanced to handle multiple XML structures similar to file upload feature
 */
async function parseAndTransformXML(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true
    });
    
    const xmlData = parser.parse(buffer.toString());
    
    systemLogger.info('XML structure parsed', { 
      rootKeys: Object.keys(xmlData),
      jobId 
    });
    
    // Extract records - handle various XML structures
    let records = [];
    
    // Strategy 1: Check if entire parsed data is already an array
    if (Array.isArray(xmlData)) {
      records = xmlData;
      systemLogger.info('XML: Root is array', { count: records.length, jobId });
    } 
    // Strategy 2: Navigate through root element
    else if (typeof xmlData === 'object' && xmlData !== null) {
      const rootKeys = Object.keys(xmlData).filter(key => key !== '?xml');
      
      if (rootKeys.length === 0) {
        throw new Error('XML file appears to be empty');
      }
      
      // Get the root element (usually there's only one)
      const rootElement = xmlData[rootKeys[0]];
      
      systemLogger.info('XML: Examining root element', { 
        rootKey: rootKeys[0], 
        isArray: Array.isArray(rootElement),
        isObject: typeof rootElement === 'object',
        jobId 
      });
      
      // Strategy 2a: Root element is directly an array
      if (Array.isArray(rootElement)) {
        records = rootElement;
        systemLogger.info('XML: Root element is array', { count: records.length, jobId });
      }
      // Strategy 2b: Root element is object - find arrays within it
      else if (typeof rootElement === 'object' && rootElement !== null) {
        // Look for array properties (common pattern: <root><records><record>...</record></records></root>)
        const arrayKeys = Object.keys(rootElement).filter(key => Array.isArray(rootElement[key]));
        
        if (arrayKeys.length > 0) {
          // Use the first array found (or the largest one)
          let selectedKey = arrayKeys[0];
          if (arrayKeys.length > 1) {
            // Choose the array with the most elements
            selectedKey = arrayKeys.reduce((largest, key) => {
              return rootElement[key].length > rootElement[largest].length ? key : largest;
            }, arrayKeys[0]);
          }
          
          records = rootElement[selectedKey];
          systemLogger.info('XML: Found array in root element', { 
            key: selectedKey, 
            count: records.length,
            availableKeys: arrayKeys,
            jobId 
          });
        }
        // Strategy 2c: Root element is a single object (single record XML)
        else {
          records = [rootElement];
          systemLogger.info('XML: Single record XML', { jobId });
        }
      }
      // Strategy 2d: Root element is primitive (unusual but handle it)
      else {
        records = [{ value: rootElement }];
        systemLogger.warn('XML: Root element is primitive value', { jobId });
      }
    }
    
    if (records.length === 0) {
      systemLogger.warn('XML: No records extracted from file', { 
        xmlStructure: JSON.stringify(xmlData).substring(0, 200),
        jobId 
      });
      throw new Error('No records found in XML file. Please check the XML structure.');
    }
    
    systemLogger.info('XML: Starting transformation', { 
      recordCount: records.length,
      jobId 
    });
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of records) {
      rowsRead++;
      try {
        // Flatten nested XML structure before transformation
        const flattenedRow = flattenObject(row);
        
        // Capture source row for profiling (limit to first 1000 rows)
        if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...flattenedRow});
        }
        
        // Log first flattened row for debugging
        if (rowsRead === 1) {
          systemLogger.info('XML first row (flattened):', { 
            keys: Object.keys(flattenedRow),
            sampleKeys: Object.keys(flattenedRow).slice(0, 10),
            jobId
          });
        }
        
        const transformedRow = transformRow(flattenedRow, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message,
          stack: error.stack,
          jobId
        });
      }
    }
    
    systemLogger.info('XML transformation complete', {
      rowsRead,
      rowsWritten,
      rowsFailed,
      sourceRowsCount: sourceRows.length,
      jobId
    });
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    systemLogger.error('XML parsing failed', {
      error: error.message,
      stack: error.stack,
      jobId
    });
    throw new Error(`XML parsing error: ${error.message}`);
  }
}

/**
 * Generate output filename with correct extension based on output format
 */
function generateOutputFilename(inputFilename, mappingName, outputFormat = 'csv') {
  // Remove original extension
  const nameWithoutExt = inputFilename.replace(/\.[^/.]+$/, '');
  
  // Add new extension based on output format
  const extension = outputFormat.toLowerCase();
  return `${nameWithoutExt}.${extension}`;
}

/**
 * Convert transformed rows to specified format
 */
async function convertToFormat(rows, format = 'csv') {
  if (rows.length === 0) return Buffer.from('');
  
  const formatLower = format.toLowerCase();
  
  switch (formatLower) {
    case 'csv':
      return convertToCSV(rows);
    case 'json':
      return convertToJSON(rows);
    case 'xlsx':
      return convertToXLSX(rows);
    case 'parquet':
      return convertToParquet(rows);
    case 'xml':
      return convertToXML(rows);
    default:
      systemLogger.warn(`Unsupported output format: ${format}, defaulting to CSV`);
      return convertToCSV(rows);
  }
}

/**
 * Convert transformed rows to CSV format
 */
function convertToCSV(rows) {
  if (rows.length === 0) return Buffer.from('');
  
  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Build CSV string
  let csv = headers.join(',') + '\n';
  
  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Escape values containing commas or quotes
      if (value.toString().includes(',') || value.toString().includes('"')) {
        return `"${value.toString().replace(/"/g, '""')}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  }
  
  return Buffer.from(csv);
}

/**
 * Convert transformed rows to JSON format
 */
function convertToJSON(rows) {
  if (rows.length === 0) return Buffer.from('[]');
  
  const jsonString = JSON.stringify(rows, null, 2);
  return Buffer.from(jsonString);
}

/**
 * Convert transformed rows to XLSX (Excel) format
 */
function convertToXLSX(rows) {
  if (rows.length === 0) {
    // Create empty workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([]);
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
  
  // Convert rows to worksheet
  const ws = xlsx.utils.json_to_sheet(rows);
  
  // Create workbook and add worksheet
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  
  // Write to buffer
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

/**
 * Convert transformed rows to Parquet format
 * Note: Parquet writing requires hyparquet-writer which may not be available
 */
async function convertToParquet(rows) {
  try {
    if (rows.length === 0) {
      return Buffer.from('');
    }
    
    // Import hyparquet-writer
    const { parquetWriteBuffer } = await import('hyparquet-writer');
    
    // Text encoder for converting strings to Uint8Array
    const encoder = new TextEncoder();
    
    // Convert row-based data to column-based format
    const columnData = [];
    const columnNames = Object.keys(rows[0]);
    
    for (const columnName of columnNames) {
      const rawValues = rows.map(row => row[columnName]);
      
      // Infer column type from first non-null value
      let type = 'STRING'; // default type
      let processedValues = rawValues;
      
      for (const value of rawValues) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'INT32' : 'DOUBLE';
          } else if (typeof value === 'boolean') {
            type = 'BOOLEAN';
          } else if (value instanceof Date) {
            type = 'INT64'; // timestamp in milliseconds
            processedValues = rawValues.map(v => v instanceof Date ? v.getTime() : v);
          }
          break;
        }
      }
      
      // For STRING type, encode values as Uint8Array
      if (type === 'STRING') {
        processedValues = rawValues.map(value => {
          if (value === null || value === undefined) {
            return null;
          }
          const strValue = String(value);
          return encoder.encode(strValue);
        });
      }
      
      columnData.push({
        name: columnName,
        data: processedValues,
        type: type
      });
    }
    
    // Write parquet file to buffer
    const arrayBuffer = parquetWriteBuffer({ columnData });
    return Buffer.from(arrayBuffer);
    
  } catch (error) {
    systemLogger.warn('Parquet writing not available, falling back to JSON', {
      error: error.message
    });
    // Fallback to JSON if parquet writer not available
    return convertToJSON(rows);
  }
}

/**
 * Convert transformed rows to XML format
 * Creates a well-formed XML document with nested structure
 */
function convertToXML(rows) {
  if (rows.length === 0) {
    return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<root></root>');
  }
  
  const { XMLBuilder } = require('fast-xml-parser');
  
  // Configure XML builder
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: false
  });
  
  // Reconstruct nested objects from dot-notation keys
  const reconstructedRows = rows.map(row => {
    const reconstructed = {};
    
    for (const key in row) {
      // Prevent prototype pollution by checking hasOwnProperty and dangerous keys
      if (!row.hasOwnProperty(key)) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`Skipping dangerous key in XML conversion: ${key}`);
        continue;
      }
      
      const value = row[key];
      const parts = key.split('.');
      
      // If it's a simple key (no dots), just assign it
      if (parts.length === 1) {
        reconstructed[key] = value;
      } else {
        // Reconstruct nested structure with prototype pollution protection
        let current = reconstructed;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          // Check for dangerous property names at each level
          if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
            console.warn(`Skipping dangerous nested key in XML conversion: ${part}`);
            break;
          }
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        if (lastPart !== '__proto__' && lastPart !== 'constructor' && lastPart !== 'prototype') {
          current[lastPart] = value;
        }
      }
    }
    
    return reconstructed;
  });
  
  // Build XML structure
  const xmlStructure = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8'
    },
    root: {
      record: reconstructedRows
    }
  };
  
  // Convert to XML string
  const xmlString = builder.build(xmlStructure);
  
  return Buffer.from(xmlString);
}

/**
 * Get job status
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status with logs
 */
async function getJobStatus(pool, jobId) {
  try {
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const logsResult = await pool.query(
      'SELECT * FROM transformation_logs WHERE job_id = $1 ORDER BY timestamp ASC',
      [jobId]
    );
    
    return {
      job: jobResult.rows[0],
      logs: logsResult.rows
    };
    
  } catch (error) {
    systemLogger.error('Error getting job status:', error);
    throw error;
  }
}

/**
 * Cancel a running job
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Updated job record
 */
async function cancelJob(pool, jobId) {
  try {
    // Check current job status
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const currentStatus = jobResult.rows[0].status;
    
    // Check if job is in a terminal state
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      const error = new Error(`Cannot cancel job: Job is already ${currentStatus}`);
      error.statusCode = 409; // Conflict
      throw error;
    }
    
    // Only cancel if job is in a cancellable state (pending, running)
    const result = await updateJob(pool, jobId, {
      status: 'cancelled',
      end_time: new Date()
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job cancelled by user');
    
    systemLogger.info('Job cancelled', { jobId, previousStatus: currentStatus });
    
    return result;
    
  } catch (error) {
    systemLogger.error('Error cancelling job:', error);
    throw error;
  }
}

module.exports = {
  createJob,
  executeTransformationJob,
  getJobStatus,
  updateJob,
  cancelJob,
  logJobExecution,
  getMappingConfig,
  processFile
};
