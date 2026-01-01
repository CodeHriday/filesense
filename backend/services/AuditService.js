const { v4: uuidv4 } = require('uuid');

class AuditService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  createContext() {
    return {};
  }

  getCurrentIp(context) {
    return context?.ipAddress || null;
  }

  getCurrentSession(context) {
    return context?.sessionId || null;
  }

  getRequestId(context) {
    return context?.requestId || null;
  }

  getCurrentUser(context) {
    return {
      userId: context?.userId || null,
      userEmail: context?.userEmail || null,
      userRole: context?.userRole || null
    };
  }

  calculateDiff(oldValues, newValues) {
    if (!oldValues && !newValues) {
      return null;
    }

    if (!oldValues) {
      return { _action: 'created', ...newValues };
    }

    if (!newValues) {
      return { _action: 'deleted', ...oldValues };
    }

    const changes = {};
    const allKeys = new Set([
      ...Object.keys(oldValues || {}),
      ...Object.keys(newValues || {})
    ]);

    for (const key of allKeys) {
      const oldValue = oldValues[key];
      const newValue = newValues[key];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[key] = {
          from: oldValue,
          to: newValue
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  async logAction({
    userId,
    userEmail,
    userRole,
    actionType,
    entityType,
    entityId,
    entityName,
    operation,
    oldValues,
    newValues,
    metadata,
    status = 'SUCCESS',
    errorMessage = null,
    context = null,
    client = null
  }) {
    try {
      const user = this.getCurrentUser(context);
      const changes = this.calculateDiff(oldValues, newValues);

      // Use provided transaction client or pool
      const dbClient = client || this.dbPool;

      const result = await dbClient.query(`
        INSERT INTO audit_log (
          user_id, user_email, user_role,
          ip_address, session_id, request_id,
          action_type, entity_type, entity_id, entity_name,
          operation, old_values, new_values, changes,
          status, error_message, metadata,
          api_endpoint, http_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING audit_id
      `, [
        userId || user.userId,
        userEmail || user.userEmail,
        userRole || user.userRole,
        this.getCurrentIp(context),
        this.getCurrentSession(context),
        this.getRequestId(context),
        actionType,
        entityType,
        entityId,
        entityName,
        operation,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        changes ? JSON.stringify(changes) : null,
        status,
        errorMessage,
        metadata ? JSON.stringify(metadata) : null,
        context?.apiEndpoint || null,
        context?.httpMethod || null
      ]);

      return result.rows[0].audit_id;
    } catch (error) {
      console.error('Error logging audit action:', error);
      throw error;
    }
  }

  async updateAudit(auditId, updates) {
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (updates.entityId !== undefined) {
        setClauses.push(`entity_id = $${paramIndex++}`);
        values.push(updates.entityId);
      }

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }

      if (updates.errorMessage !== undefined) {
        setClauses.push(`error_message = $${paramIndex++}`);
        values.push(updates.errorMessage);
      }

      if (updates.newValues !== undefined) {
        setClauses.push(`new_values = $${paramIndex++}`);
        values.push(JSON.stringify(updates.newValues));
      }

      if (setClauses.length === 0) {
        return;
      }

      values.push(auditId);
      
      await this.dbPool.query(`
        UPDATE audit_log
        SET ${setClauses.join(', ')}
        WHERE audit_id = $${paramIndex}
      `, values);
    } catch (error) {
      console.error('Error updating audit:', error);
      throw error;
    }
  }

  async logExecutionStateChange({
    executionId,
    executionType,
    entityId,
    entityName,
    previousStatus,
    newStatus,
    statusReason = null,
    triggeredByUser = null,
    triggerType = 'manual',
    parentExecutionId = null,
    executionDurationMs = null,
    cpuUsagePercent = null,
    memoryUsageMb = null,
    rowsProcessed = null,
    recordsAffected = null,
    qualityScore = null,
    validationErrors = null,
    metadata = null,
    context = null
  }) {
    try {
      const user = this.getCurrentUser(context);

      await this.dbPool.query(`
        INSERT INTO execution_audit (
          execution_id, execution_type, entity_id, entity_name,
          previous_status, new_status, status_reason,
          triggered_by_user, trigger_type, parent_execution_id,
          execution_duration_ms,
          cpu_usage_percent, memory_usage_mb,
          rows_processed, records_affected,
          quality_score, validation_errors,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        executionId,
        executionType,
        entityId,
        entityName,
        previousStatus,
        newStatus,
        statusReason,
        triggeredByUser || user.userId,
        triggerType,
        parentExecutionId,
        executionDurationMs,
        cpuUsagePercent,
        memoryUsageMb,
        rowsProcessed,
        recordsAffected,
        qualityScore,
        validationErrors ? JSON.stringify(validationErrors) : null,
        metadata ? JSON.stringify(metadata) : null
      ]);
    } catch (error) {
      console.error('Error logging execution state change:', error);
      throw error;
    }
  }

  async logDataAccess({
    userId,
    userRole,
    accessType,
    fileId = null,
    fileName = null,
    tableName = null,
    columnNames = null,
    accessMethod = 'UI',
    queryText = null,
    filtersApplied = null,
    rowsAccessed = null,
    bytesAccessed = null,
    accessPurpose = null,
    projectName = null,
    containsPii = false,
    dataClassification = 'internal',
    metadata = null,
    context = null
  }) {
    try {
      const user = this.getCurrentUser(context);

      await this.dbPool.query(`
        INSERT INTO data_access_log (
          user_id, user_role, ip_address,
          access_type, file_id, file_name, table_name, column_names,
          access_method, query_text, filters_applied,
          rows_accessed, bytes_accessed,
          access_purpose, project_name,
          contains_pii, data_classification,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        userId || user.userId,
        userRole || user.userRole,
        this.getCurrentIp(context),
        accessType,
        fileId,
        fileName,
        tableName,
        columnNames,
        accessMethod,
        queryText,
        filtersApplied ? JSON.stringify(filtersApplied) : null,
        rowsAccessed,
        bytesAccessed,
        accessPurpose,
        projectName,
        containsPii,
        dataClassification,
        metadata ? JSON.stringify(metadata) : null
      ]);
    } catch (error) {
      console.error('Error logging data access:', error);
      throw error;
    }
  }

  async logConfigChange({
    changedByUser,
    changedByRole,
    configType,
    entityType,
    entityId,
    fieldName,
    oldValue,
    newValue,
    changeReason = null,
    ticketReference = null,
    requiresApproval = false,
    canRollback = true,
    rollbackScript = null,
    metadata = null,
    context = null
  }) {
    try {
      const user = this.getCurrentUser(context);

      await this.dbPool.query(`
        INSERT INTO config_change_history (
          changed_by_user, changed_by_role,
          config_type, entity_type, entity_id,
          field_name, old_value, new_value,
          change_reason, ticket_reference,
          requires_approval, can_rollback, rollback_script,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        changedByUser || user.userId,
        changedByRole || user.userRole,
        configType,
        entityType,
        entityId,
        fieldName,
        oldValue,
        newValue,
        changeReason,
        ticketReference,
        requiresApproval,
        canRollback,
        rollbackScript,
        metadata ? JSON.stringify(metadata) : null
      ]);
    } catch (error) {
      console.error('Error logging config change:', error);
      throw error;
    }
  }

  async logSecurityEvent({
    eventType,
    severity = 'INFO',
    userId = null,
    username = null,
    authenticationMethod = null,
    permissionRequired = null,
    permissionGranted = null,
    denialReason = null,
    riskScore = 0,
    flags = null,
    metadata = null,
    context = null
  }) {
    try {
      await this.dbPool.query(`
        INSERT INTO security_audit_log (
          event_type, severity,
          user_id, username, ip_address, user_agent,
          authentication_method,
          permission_required, permission_granted, denial_reason,
          risk_score, flags,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        eventType,
        severity,
        userId,
        username,
        this.getCurrentIp(context),
        context?.userAgent || null,
        authenticationMethod,
        permissionRequired,
        permissionGranted,
        denialReason,
        riskScore,
        flags ? JSON.stringify(flags) : null,
        metadata ? JSON.stringify(metadata) : null
      ]);
    } catch (error) {
      console.error('Error logging security event:', error);
      throw error;
    }
  }

  async getAuditLogs({
    userId = null,
    entityType = null,
    entityId = null,
    actionType = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  }) {
    try {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (userId) {
        conditions.push(`(user_email ILIKE $${paramIndex} OR CAST(user_id AS TEXT) ILIKE $${paramIndex})`);
        values.push(`%${userId}%`);
        paramIndex++;
      }

      if (entityType) {
        conditions.push(`entity_type = $${paramIndex++}`);
        values.push(entityType);
      }

      if (entityId) {
        conditions.push(`entity_id = $${paramIndex++}`);
        values.push(entityId);
      }

      if (actionType) {
        conditions.push(`action_type = $${paramIndex++}`);
        values.push(actionType);
      }

      if (startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        values.push(startDate);
      }

      if (endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        values.push(endDate);
      }

      const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';

      values.push(limit, offset);

      const result = await this.dbPool.query(`
        SELECT *
        FROM audit_log
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, values);

      return result.rows;
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  async getExecutionAudit(executionId) {
    try {
      const result = await this.dbPool.query(`
        SELECT *
        FROM execution_audit
        WHERE execution_id = $1
        ORDER BY timestamp ASC
      `, [executionId]);

      return result.rows;
    } catch (error) {
      console.error('Error fetching execution audit:', error);
      throw error;
    }
  }

  async getDataAccessLogs({
    userId = null,
    fileId = null,
    containsPii = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  }) {
    try {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(userId);
      }

      if (fileId) {
        conditions.push(`file_id = $${paramIndex++}`);
        values.push(fileId);
      }

      if (containsPii !== null) {
        conditions.push(`contains_pii = $${paramIndex++}`);
        values.push(containsPii);
      }

      if (startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        values.push(startDate);
      }

      if (endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        values.push(endDate);
      }

      const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';

      values.push(limit, offset);

      const result = await this.dbPool.query(`
        SELECT *
        FROM data_access_log
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, values);

      return result.rows;
    } catch (error) {
      console.error('Error fetching data access logs:', error);
      throw error;
    }
  }

  async logSystemCleanup(userId, username, categories, deletedCounts) {
    try {
      await this.logAction({
        userId,
        userEmail: username,
        userRole: 'Admin',
        actionType: 'SYSTEM_CLEANUP',
        entityType: 'SYSTEM',
        entityId: 'cleanup_operation',
        entityName: 'System Data Cleanup',
        operation: 'DELETE',
        oldValues: null,
        newValues: null,
        metadata: {
          categories,
          deletedCounts,
          timestamp: new Date().toISOString()
        },
        status: 'SUCCESS'
      });
    } catch (error) {
      console.error('Error logging system cleanup:', error);
    }
  }
}

module.exports = AuditService;
