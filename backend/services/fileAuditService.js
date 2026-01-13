const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * File Audit Service
 * Handles comprehensive file processing audit with schema versioning
 */

/**
 * Calculate schema hash for version detection
 */
function calculateSchemaHash(schema) {
  const schemaString = JSON.stringify(schema);
  return crypto.createHash('sha256').update(schemaString).digest('hex');
}

/**
 * Calculate schema diff between two schema objects
 */
function calculateSchemaDiff(oldSchema, newSchema) {
  const diff = {
    added: [],
    removed: [],
    modified: []
  };

  const oldCols = oldSchema.columns || [];
  const newCols = newSchema.columns || [];
  
  const oldColMap = new Map(oldCols.map(c => [c.name, c]));
  const newColMap = new Map(newCols.map(c => [c.name, c]));

  // Find added columns
  for (const [name, col] of newColMap) {
    if (!oldColMap.has(name)) {
      diff.added.push(col);
    }
  }

  // Find removed and modified columns
  for (const [name, oldCol] of oldColMap) {
    if (!newColMap.has(name)) {
      diff.removed.push(oldCol);
    } else {
      const newCol = newColMap.get(name);
      if (oldCol.type !== newCol.type) {
        diff.modified.push({
          name,
          old: oldCol,
          new: newCol
        });
      }
    }
  }

  return diff;
}

/**
 * Capture file audit details
 * @param {Object} pool - Database pool
 * @param {Object} auditData - Audit information
 * @param {Object} options - Additional options (retry, timeout)
 */
async function captureFileAudit(pool, auditData, options = {}) {
  const {
    retryAttempts = 3,
    retryDelay = 1000,
    parentAuditId = null
  } = options;

  const correlationId = auditData.correlationId || uuidv4();
  const startTime = Date.now();
  
  let attempt = 0;
  let lastError = null;

  while (attempt < retryAttempts) {
    try {
      attempt++;

      // Begin transaction for atomic audit write
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Calculate retention date (12 months by default)
        const retentionMonths = auditData.retentionMonths || 12;
        const retentionDate = new Date();
        retentionDate.setMonth(retentionDate.getMonth() + retentionMonths);

        // Insert audit details
        const auditResult = await client.query(`
          INSERT INTO file_audit_details (
            file_id, file_name, file_schema_id, file_hash, file_pattern,
            file_type, file_delimiter, encoding, number_of_columns, file_size_bytes,
            source, source_path, no_of_records_in_source,
            load_step_1, load_step_1_path, load_step_1_rec_cnt, load_type,
            correlation_id, parent_audit_id, transformation_job_id, mapping_name,
            user_id, user_email, ip_address, session_id,
            processing_duration_ms, status, error_message, error_type,
            retention_until, created_by, file_role
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
          ) RETURNING id
        `, [
          auditData.fileId,
          auditData.fileName,
          auditData.fileSchemaId,
          auditData.fileHash,
          auditData.filePattern,
          auditData.fileType,
          auditData.fileDelimiter,
          auditData.encoding,
          auditData.numberOfColumns,
          auditData.fileSizeBytes,
          auditData.source,
          auditData.sourcePath,
          auditData.noOfRecordsInSource,
          auditData.loadStep1,
          auditData.loadStep1Path,
          auditData.loadStep1RecCnt,
          auditData.loadType,
          correlationId,
          parentAuditId,
          auditData.transformationJobId,
          auditData.mappingName,
          auditData.userId,
          auditData.userEmail,
          auditData.ipAddress,
          auditData.sessionId,
          auditData.processingDurationMs || (Date.now() - startTime),
          auditData.status || 'success',
          auditData.errorMessage,
          auditData.errorType,
          retentionDate,
          auditData.createdBy,
          auditData.fileRole || null
        ]);

        const auditId = auditResult.rows[0].id;

        await client.query('COMMIT');
        client.release();

        return {
          success: true,
          auditId,
          correlationId
        };

      } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        throw err;
      }

    } catch (error) {
      lastError = error;
      console.error(`Audit capture attempt ${attempt} failed:`, error.message);

      if (attempt < retryAttempts) {
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  console.error('All audit capture attempts failed:', lastError);
  return {
    success: false,
    error: lastError.message,
    correlationId
  };
}

/**
 * Capture or update file schema with versioning
 * @param {Object} pool - Database pool
 * @param {Object} schemaData - Schema information
 */
async function captureFileSchema(pool, schemaData) {
  const {
    fileId,
    fileName,
    fileSchema,
    correlationId,
    createdBy
  } = schemaData;

  const schemaHash = calculateSchemaHash(fileSchema);
  const fileSchemaId = `schema_${fileId}_${Date.now()}`;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if a schema with this hash already exists for this file
      const existingSchema = await client.query(`
        SELECT id, file_schema_id, file_schema, active_flag
        FROM file_schema_details
        WHERE file_id = $1 AND schema_hash = $2
        ORDER BY created_ts DESC
        LIMIT 1
      `, [fileId, schemaHash]);

      if (existingSchema.rows.length > 0 && existingSchema.rows[0].active_flag) {
        // Schema hasn't changed and is already active, just return the existing schema ID
        await client.query('COMMIT');
        client.release();
        
        return {
          success: true,
          schemaId: existingSchema.rows[0].file_schema_id,
          isNew: false,
          message: 'Schema unchanged, using existing version'
        };
      }

      // Get current active schema for diff calculation
      const activeSchema = await client.query(`
        SELECT file_schema, file_schema_id
        FROM file_schema_details
        WHERE file_id = $1 AND active_flag = true
        ORDER BY created_ts DESC
        LIMIT 1
      `, [fileId]);

      let schemaDiff = null;
      let previousSchemaId = null;

      if (activeSchema.rows.length > 0) {
        // Calculate diff
        schemaDiff = calculateSchemaDiff(
          activeSchema.rows[0].file_schema,
          fileSchema
        );
        previousSchemaId = activeSchema.rows[0].file_schema_id;

        // Deactivate old schema
        await client.query(`
          UPDATE file_schema_details
          SET active_flag = false
          WHERE file_id = $1 AND active_flag = true
        `, [fileId]);
      }

      // Insert new schema version
      await client.query(`
        INSERT INTO file_schema_details (
          file_id, file_name, file_schema_id, file_schema,
          schema_hash, schema_diff, active_flag,
          correlation_id, previous_schema_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        fileId,
        fileName,
        fileSchemaId,
        JSON.stringify(fileSchema),
        schemaHash,
        schemaDiff ? JSON.stringify(schemaDiff) : null,
        true,
        correlationId,
        previousSchemaId,
        createdBy
      ]);

      await client.query('COMMIT');
      client.release();

      return {
        success: true,
        schemaId: fileSchemaId,
        isNew: true,
        hasChanges: previousSchemaId !== null,
        diff: schemaDiff
      };

    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }

  } catch (error) {
    console.error('Schema capture failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get file audit history with schema information
 */
async function getFileAuditHistory(pool, fileId, options = {}) {
  const {
    limit = 100,
    offset = 0,
    includeSchema = true
  } = options;

  try {
    let query = `
      SELECT 
        fad.*,
        ${includeSchema ? `
        fsd.file_schema,
        fsd.schema_hash,
        fsd.schema_diff,
        fsd.active_flag as schema_active,
        fsd.previous_schema_id,
        fsd.schema_update_ts
        ` : 'NULL as file_schema'}
      FROM file_audit_details fad
      ${includeSchema ? `
      LEFT JOIN file_schema_details fsd 
        ON fad.file_schema_id = fsd.file_schema_id
      ` : ''}
      WHERE fad.file_id = $1
      ORDER BY fad.created_dt DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [fileId, limit, offset]);

    return {
      success: true,
      audits: result.rows,
      total: result.rowCount
    };

  } catch (error) {
    console.error('Failed to fetch audit history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all audit records with filters
 */
async function getAuditRecords(pool, filters = {}) {
  const {
    startDate,
    endDate,
    status,
    source,
    fileType,
    correlationId,
    mappingName,
    loadType,
    fileRole,
    search,
    limit = 100,
    offset = 0,
    userId,
    userRoles = []
  } = filters;

  try {
    // Check if user has admin-level access
    // Note: This function receives userRoles as role names, so we check for Admin role name
    // and also check if the calling context passed userPermissions for admin-equivalent roles
    const isAdmin = userRoles.includes('Admin') || 
                   (filters.userPermissions && filters.userPermissions.some(p => 
                     ['users:write', 'roles:write', 'project_management:write'].includes(
                       typeof p === 'object' ? p.permission_code || p.permission_name || p.name : p
                     )
                   ));
    
    // Get user's accessible projects (unless admin)
    let projectIds = [];
    if (!isAdmin && userId) {
      const { getUserProjects } = require('../middleware/requireProjectAccess');
      const userProjects = await getUserProjects(userId);
      projectIds = userProjects.map(p => p.id);
      
      // Return empty if user has no projects
      if (projectIds.length === 0) {
        return {
          success: true,
          audits: [],
          total: 0
        };
      }
    }

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    // Add project filtering (unless admin)
    // Check both files table and transformation_mappings table for project association
    if (!isAdmin && projectIds.length > 0) {
      conditions.push(`(f.project_id = ANY($${paramIndex}::integer[]) OR tm.project_id = ANY($${paramIndex}::integer[]))`);
      params.push(projectIds);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`fad.created_dt >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`fad.created_dt <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (status) {
      conditions.push(`fad.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (source) {
      conditions.push(`fad.source = $${paramIndex}`);
      params.push(source);
      paramIndex++;
    }

    if (fileType) {
      conditions.push(`fad.file_type = $${paramIndex}`);
      params.push(fileType);
      paramIndex++;
    }

    if (correlationId) {
      conditions.push(`fad.correlation_id::text ILIKE $${paramIndex}`);
      params.push(`%${correlationId}%`);
      paramIndex++;
    }

    if (mappingName) {
      conditions.push(`COALESCE(fad.mapping_name, tm.mapping_name) ILIKE $${paramIndex}`);
      params.push(`%${mappingName}%`);
      paramIndex++;
    }

    if (loadType) {
      conditions.push(`fad.load_type = $${paramIndex}`);
      params.push(loadType);
      paramIndex++;
    }

    if (fileRole) {
      conditions.push(`fad.file_role = $${paramIndex}`);
      params.push(fileRole);
      paramIndex++;
    }

    if (search) {
      // Search in both mapping_name and file_name (case-insensitive)
      conditions.push(`(
        COALESCE(fad.mapping_name, tm.mapping_name) ILIKE $${paramIndex} OR
        fad.file_name ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // Get total count first
    const countQuery = `
      SELECT COUNT(*) as total
      FROM file_audit_details fad
      LEFT JOIN files f ON fad.file_id = f.file_id
      LEFT JOIN transformation_jobs tj 
        ON fad.transformation_job_id = tj.id
      LEFT JOIN transformation_mappings tm 
        ON tj.mapping_id = CAST(tm.id AS VARCHAR)
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].total);

    params.push(limit, offset);

    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (fad.id)
          fad.*,
          fsd.file_schema,
          fsd.schema_hash,
          fsd.schema_diff,
          fsd.active_flag as schema_active,
          s.schedule_name,
          mg.name as mapping_group_name,
          nw.name as workflow_name,
          COALESCE(fad.mapping_name, tm.mapping_name) as mapping_name,
          p.name as project_name,
          f.project_id,
          f.sub_project_id,
          sp.name as sub_project_name,
          f.quality_score,
          f.column_count as number_of_columns,
          f.row_count,
          tj.job_id,
          tj.schema_validation,
          lfg.has_schema_changes,
          (
            SELECT json_agg(
              json_build_object(
                'name', fc.column_name,
                'column_name', fc.column_name,
                'data_type', fc.column_type,
                'type', fc.column_type,
                'null_count', fc.null_count,
                'missing', fc.null_count,
                'unique_values', fc.unique_count,
                'distinct_count', fc.unique_count,
                'min_value', COALESCE(fc.min_value_decimal::text, fc.min_value),
                'max_value', COALESCE(fc.max_value_decimal::text, fc.max_value)
              )
              ORDER BY fc.column_index
            )
            FROM file_columns fc
            WHERE fc.file_id = fad.file_id
              AND (fc.file_role = fad.file_role OR (fc.file_role IS NULL AND fad.file_role IS NULL))
          ) as column_stats
        FROM file_audit_details fad
        LEFT JOIN files f ON fad.file_id = f.file_id
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN projects sp ON f.sub_project_id = sp.id
        LEFT JOIN logical_file_groups lfg ON f.logical_file_id = lfg.logical_file_id
        LEFT JOIN file_schema_details fsd 
          ON fad.file_schema_id = fsd.file_schema_id
        LEFT JOIN transformation_jobs tj 
          ON fad.transformation_job_id = tj.id
        LEFT JOIN schedules s 
          ON tj.schedule_id = s.id
        LEFT JOIN transformation_mappings tm 
          ON tj.mapping_id = CAST(tm.id AS VARCHAR)
        LEFT JOIN mapping_group_executions mge 
          ON tj.mapping_group_execution_id = mge.id
        LEFT JOIN mapping_groups mg 
          ON mge.group_id = mg.id
        LEFT JOIN n_step_workflow_runs nwr 
          ON tj.workflow_execution_id = nwr.id
        LEFT JOIN n_step_workflows nw 
          ON nwr.workflow_id = nw.id
        ${whereClause}
        ORDER BY fad.id, fad.created_dt DESC
      ) AS distinct_audits
      ORDER BY created_dt DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(query, params);

    return {
      success: true,
      audits: result.rows,
      total: total
    };

  } catch (error) {
    console.error('Failed to fetch audit records:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cleanup old audit records based on retention policy
 */
async function cleanupOldAudits(pool, retentionDays = 90) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // Delete old audit records
    const result = await client.query(`
      DELETE FROM file_audit_details
      WHERE created_dt < $1
      RETURNING audit_id
    `, [cutoffDate]);
    
    // Clean up orphaned schema records
    const schemaResult = await client.query(`
      DELETE FROM file_schema_details
      WHERE active_flag = false
        AND created_dt < $1
        AND schema_id NOT IN (
          SELECT DISTINCT file_schema_id 
          FROM file_audit_details 
          WHERE file_schema_id IS NOT NULL
        )
      RETURNING schema_id
    `, [cutoffDate]);
    
    await client.query('COMMIT');

    console.log(`Cleaned up ${result.rowCount} audit records and ${schemaResult.rowCount} schema records`);

    return {
      success: true,
      deletedCount: result.rowCount,
      schemasDeleted: schemaResult.rowCount,
      cutoffDate: cutoffDate.toISOString()
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Audit cleanup failed:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}

module.exports = {
  captureFileAudit,
  captureFileSchema,
  getFileAuditHistory,
  getAuditRecords,
  cleanupOldAudits,
  calculateSchemaHash,
  calculateSchemaDiff
};
