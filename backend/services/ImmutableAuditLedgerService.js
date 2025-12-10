const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class ImmutableAuditLedgerService {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.hashAlgorithm = 'sha256';
  }

  computeHash(data) {
    const canonical = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash(this.hashAlgorithm).update(canonical).digest('hex');
  }

  computeRecordHash(prevHash, payload) {
    const dataToHash = {
      prev_hash: prevHash || 'GENESIS',
      payload: payload
    };
    return this.computeHash(dataToHash);
  }

  async appendEntry({
    tenantId = 'default',
    jobId = null,
    correlationId = null,
    parentEntryId = null,
    actorId = null,
    actorEmail = null,
    actorRole = null,
    actorIp = null,
    actionType,
    actionCategory = 'EXECUTION',
    entityType = null,
    entityId = null,
    entityName = null,
    logLevel = 'INFO',
    message,
    payload = null,
    eventTimestamp = null
  }) {
    const client = await this.dbPool.connect();
    
    try {
      await client.query('BEGIN');
      
      const seqResult = await client.query(`
        UPDATE audit_ledger_sequence
        SET current_sequence = current_sequence + 1,
            updated_at = NOW()
        WHERE tenant_id = $1
        RETURNING current_sequence, last_hash
      `, [tenantId]);
      
      let sequenceNumber, prevHash;
      
      if (seqResult.rows.length === 0) {
        await client.query(`
          INSERT INTO audit_ledger_sequence (tenant_id, current_sequence, last_hash)
          VALUES ($1, 1, NULL)
        `, [tenantId]);
        sequenceNumber = 1;
        prevHash = null;
      } else {
        sequenceNumber = seqResult.rows[0].current_sequence;
        prevHash = seqResult.rows[0].last_hash;
      }
      
      const entryId = uuidv4();
      const timestamp = eventTimestamp || new Date();
      
      const hashPayload = {
        entry_id: entryId,
        tenant_id: tenantId,
        job_id: jobId,
        correlation_id: correlationId,
        actor_id: actorId,
        action_type: actionType,
        action_category: actionCategory,
        entity_type: entityType,
        entity_id: entityId,
        log_level: logLevel,
        message: message,
        payload: payload,
        event_timestamp: timestamp.toISOString(),
        sequence_number: sequenceNumber
      };
      
      const recordHash = this.computeRecordHash(prevHash, hashPayload);
      
      const insertResult = await client.query(`
        INSERT INTO audit_ledger (
          entry_id, tenant_id, job_id, correlation_id, parent_entry_id,
          actor_id, actor_email, actor_role, actor_ip,
          action_type, action_category, entity_type, entity_id, entity_name,
          log_level, message, payload,
          event_timestamp, sequence_number, prev_hash, record_hash
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        RETURNING id, entry_id, sequence_number, record_hash
      `, [
        entryId, tenantId, jobId, correlationId, parentEntryId,
        actorId, actorEmail, actorRole, actorIp,
        actionType, actionCategory, entityType, entityId, entityName,
        logLevel, message, payload ? JSON.stringify(payload) : null,
        timestamp, sequenceNumber, prevHash, recordHash
      ]);
      
      await client.query(`
        UPDATE audit_ledger_sequence
        SET last_hash = $1
        WHERE tenant_id = $2
      `, [recordHash, tenantId]);
      
      await client.query('COMMIT');
      
      return {
        success: true,
        entry: insertResult.rows[0]
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error appending to audit ledger:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async appendBatch(entries, tenantId = 'default') {
    const client = await this.dbPool.connect();
    const results = [];
    
    try {
      await client.query('BEGIN');
      
      const seqResult = await client.query(`
        SELECT current_sequence, last_hash
        FROM audit_ledger_sequence
        WHERE tenant_id = $1
        FOR UPDATE
      `, [tenantId]);
      
      let currentSequence = seqResult.rows.length > 0 ? seqResult.rows[0].current_sequence : 0;
      let prevHash = seqResult.rows.length > 0 ? seqResult.rows[0].last_hash : null;
      
      for (const entry of entries) {
        currentSequence++;
        const entryId = uuidv4();
        const timestamp = entry.eventTimestamp || new Date();
        
        const hashPayload = {
          entry_id: entryId,
          tenant_id: tenantId,
          job_id: entry.jobId,
          correlation_id: entry.correlationId,
          actor_id: entry.actorId,
          action_type: entry.actionType,
          action_category: entry.actionCategory || 'EXECUTION',
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          log_level: entry.logLevel || 'INFO',
          message: entry.message,
          payload: entry.payload,
          event_timestamp: timestamp.toISOString(),
          sequence_number: currentSequence
        };
        
        const recordHash = this.computeRecordHash(prevHash, hashPayload);
        
        const insertResult = await client.query(`
          INSERT INTO audit_ledger (
            entry_id, tenant_id, job_id, correlation_id, parent_entry_id,
            actor_id, actor_email, actor_role, actor_ip,
            action_type, action_category, entity_type, entity_id, entity_name,
            log_level, message, payload,
            event_timestamp, sequence_number, prev_hash, record_hash
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
          RETURNING id, entry_id, sequence_number, record_hash
        `, [
          entryId, tenantId, entry.jobId, entry.correlationId, entry.parentEntryId,
          entry.actorId, entry.actorEmail, entry.actorRole, entry.actorIp,
          entry.actionType, entry.actionCategory || 'EXECUTION',
          entry.entityType, entry.entityId, entry.entityName,
          entry.logLevel || 'INFO', entry.message,
          entry.payload ? JSON.stringify(entry.payload) : null,
          timestamp, currentSequence, prevHash, recordHash
        ]);
        
        results.push(insertResult.rows[0]);
        prevHash = recordHash;
      }
      
      await client.query(`
        INSERT INTO audit_ledger_sequence (tenant_id, current_sequence, last_hash, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (tenant_id) DO UPDATE SET
          current_sequence = $2,
          last_hash = $3,
          updated_at = NOW()
      `, [tenantId, currentSequence, prevHash]);
      
      await client.query('COMMIT');
      
      return {
        success: true,
        entries: results,
        count: results.length
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error appending batch to audit ledger:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getEntriesByJobId(jobId, { limit = 1000, offset = 0 } = {}) {
    try {
      const result = await this.dbPool.query(`
        SELECT 
          id, entry_id, tenant_id, job_id, correlation_id, parent_entry_id,
          actor_id, actor_email, actor_role, actor_ip,
          action_type, action_category, entity_type, entity_id, entity_name,
          log_level, message, payload,
          event_timestamp, created_at,
          sequence_number, prev_hash, record_hash
        FROM audit_ledger
        WHERE job_id = $1
        ORDER BY sequence_number ASC
        LIMIT $2 OFFSET $3
      `, [jobId, limit, offset]);
      
      const countResult = await this.dbPool.query(
        'SELECT COUNT(*) as total FROM audit_ledger WHERE job_id = $1',
        [jobId]
      );
      
      return {
        success: true,
        entries: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      };
    } catch (error) {
      console.error('Error fetching ledger entries by job:', error);
      throw error;
    }
  }

  async getEntriesByCorrelationId(correlationId, { limit = 1000, offset = 0 } = {}) {
    try {
      const result = await this.dbPool.query(`
        SELECT 
          id, entry_id, tenant_id, job_id, correlation_id, parent_entry_id,
          actor_id, actor_email, actor_role, actor_ip,
          action_type, action_category, entity_type, entity_id, entity_name,
          log_level, message, payload,
          event_timestamp, created_at,
          sequence_number, prev_hash, record_hash
        FROM audit_ledger
        WHERE correlation_id = $1
        ORDER BY sequence_number ASC
        LIMIT $2 OFFSET $3
      `, [correlationId, limit, offset]);
      
      const countResult = await this.dbPool.query(
        'SELECT COUNT(*) as total FROM audit_ledger WHERE correlation_id = $1',
        [correlationId]
      );
      
      return {
        success: true,
        entries: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      };
    } catch (error) {
      console.error('Error fetching ledger entries by correlation:', error);
      throw error;
    }
  }

  async getEntries({
    tenantId = 'default',
    jobId = null,
    correlationId = null,
    actorId = null,
    actionType = null,
    actionCategory = null,
    entityType = null,
    entityId = null,
    logLevel = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  } = {}) {
    try {
      const conditions = ['tenant_id = $1'];
      const values = [tenantId];
      let paramIndex = 2;
      
      if (jobId) {
        conditions.push(`job_id = $${paramIndex++}`);
        values.push(jobId);
      }
      if (correlationId) {
        conditions.push(`correlation_id = $${paramIndex++}`);
        values.push(correlationId);
      }
      if (actorId) {
        conditions.push(`actor_id = $${paramIndex++}`);
        values.push(actorId);
      }
      if (actionType) {
        conditions.push(`action_type = $${paramIndex++}`);
        values.push(actionType);
      }
      if (actionCategory) {
        conditions.push(`action_category = $${paramIndex++}`);
        values.push(actionCategory);
      }
      if (entityType) {
        conditions.push(`entity_type = $${paramIndex++}`);
        values.push(entityType);
      }
      if (entityId) {
        conditions.push(`entity_id = $${paramIndex++}`);
        values.push(entityId);
      }
      if (logLevel) {
        conditions.push(`log_level = $${paramIndex++}`);
        values.push(logLevel);
      }
      if (startDate) {
        conditions.push(`event_timestamp >= $${paramIndex++}`);
        values.push(startDate);
      }
      if (endDate) {
        conditions.push(`event_timestamp <= $${paramIndex++}`);
        values.push(endDate);
      }
      
      const whereClause = conditions.join(' AND ');
      values.push(limit, offset);
      
      const result = await this.dbPool.query(`
        SELECT 
          id, entry_id, tenant_id, job_id, correlation_id, parent_entry_id,
          actor_id, actor_email, actor_role, actor_ip,
          action_type, action_category, entity_type, entity_id, entity_name,
          log_level, message, payload,
          event_timestamp, created_at,
          sequence_number, prev_hash, record_hash
        FROM audit_ledger
        WHERE ${whereClause}
        ORDER BY sequence_number DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, values);
      
      const countValues = values.slice(0, -2);
      const countResult = await this.dbPool.query(
        `SELECT COUNT(*) as total FROM audit_ledger WHERE ${whereClause}`,
        countValues
      );
      
      return {
        success: true,
        entries: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      };
    } catch (error) {
      console.error('Error fetching ledger entries:', error);
      throw error;
    }
  }

  async verifyChainIntegrity(tenantId = 'default', startSequence = 1, endSequence = null) {
    const client = await this.dbPool.connect();
    
    try {
      let query = `
        SELECT sequence_number, prev_hash, record_hash,
               entry_id, tenant_id, job_id, correlation_id,
               actor_id, action_type, action_category, entity_type, entity_id,
               log_level, message, payload, event_timestamp
        FROM audit_ledger
        WHERE tenant_id = $1 AND sequence_number >= $2
      `;
      const values = [tenantId, startSequence];
      
      if (endSequence) {
        query += ' AND sequence_number <= $3';
        values.push(endSequence);
      }
      
      query += ' ORDER BY sequence_number ASC';
      
      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        return {
          success: true,
          verified: true,
          entriesVerified: 0,
          message: 'No entries to verify in the specified range'
        };
      }
      
      let entriesVerified = 0;
      let expectedPrevHash = null;
      
      if (startSequence > 1) {
        const prevResult = await client.query(`
          SELECT record_hash FROM audit_ledger
          WHERE tenant_id = $1 AND sequence_number = $2
        `, [tenantId, startSequence - 1]);
        
        if (prevResult.rows.length > 0) {
          expectedPrevHash = prevResult.rows[0].record_hash;
        }
      }
      
      for (const entry of result.rows) {
        if (entry.prev_hash !== expectedPrevHash) {
          const verificationId = uuidv4();
          await client.query(`
            INSERT INTO audit_ledger_verification (
              verification_id, tenant_id, start_sequence, end_sequence,
              status, entries_verified, entries_failed,
              first_failed_sequence, failure_reason, completed_at, duration_ms, verified_by
            ) VALUES ($1, $2, $3, $4, 'FAILED', $5, 1, $6, $7, NOW(), 0, 'SYSTEM')
          `, [
            verificationId, tenantId, startSequence, endSequence || entry.sequence_number,
            entriesVerified, entry.sequence_number,
            `Chain broken at sequence ${entry.sequence_number}: expected prev_hash ${expectedPrevHash}, got ${entry.prev_hash}`
          ]);
          
          return {
            success: true,
            verified: false,
            entriesVerified,
            failedAtSequence: entry.sequence_number,
            error: 'Chain integrity broken: prev_hash mismatch'
          };
        }
        
        const hashPayload = {
          entry_id: entry.entry_id,
          tenant_id: entry.tenant_id,
          job_id: entry.job_id,
          correlation_id: entry.correlation_id,
          actor_id: entry.actor_id,
          action_type: entry.action_type,
          action_category: entry.action_category,
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          log_level: entry.log_level,
          message: entry.message,
          payload: entry.payload,
          event_timestamp: entry.event_timestamp.toISOString(),
          sequence_number: parseInt(entry.sequence_number)
        };
        
        const computedHash = this.computeRecordHash(entry.prev_hash, hashPayload);
        
        if (computedHash !== entry.record_hash) {
          return {
            success: true,
            verified: false,
            entriesVerified,
            failedAtSequence: entry.sequence_number,
            error: 'Record hash mismatch: data may have been tampered with'
          };
        }
        
        expectedPrevHash = entry.record_hash;
        entriesVerified++;
      }
      
      const verificationId = uuidv4();
      await client.query(`
        INSERT INTO audit_ledger_verification (
          verification_id, tenant_id, start_sequence, end_sequence,
          status, entries_verified, entries_failed,
          completed_at, duration_ms, verified_by
        ) VALUES ($1, $2, $3, $4, 'PASSED', $5, 0, NOW(), 0, 'SYSTEM')
      `, [
        verificationId, tenantId, startSequence,
        endSequence || result.rows[result.rows.length - 1].sequence_number,
        entriesVerified
      ]);
      
      return {
        success: true,
        verified: true,
        entriesVerified,
        message: `Successfully verified ${entriesVerified} entries`
      };
      
    } catch (error) {
      console.error('Error verifying chain integrity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getVerificationHistory(tenantId = 'default', limit = 50) {
    try {
      const result = await this.dbPool.query(`
        SELECT *
        FROM audit_ledger_verification
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [tenantId, limit]);
      
      return {
        success: true,
        verifications: result.rows
      };
    } catch (error) {
      console.error('Error fetching verification history:', error);
      throw error;
    }
  }

  async exportToCSV(entries) {
    const headers = [
      'Entry ID', 'Timestamp', 'Job ID', 'Correlation ID',
      'Actor ID', 'Actor Email', 'Actor Role',
      'Action Type', 'Category', 'Log Level',
      'Entity Type', 'Entity ID', 'Entity Name',
      'Message', 'Sequence', 'Record Hash'
    ];
    
    const rows = entries.map(e => [
      e.entry_id,
      e.event_timestamp,
      e.job_id || '',
      e.correlation_id || '',
      e.actor_id || '',
      e.actor_email || '',
      e.actor_role || '',
      e.action_type,
      e.action_category,
      e.log_level,
      e.entity_type || '',
      e.entity_id || '',
      e.entity_name || '',
      `"${(e.message || '').replace(/"/g, '""')}"`,
      e.sequence_number,
      e.record_hash
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async exportToJSON(entries, includeVerification = false) {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: entries.length,
      entries: entries
    };
    
    if (includeVerification && entries.length > 0) {
      const firstSeq = entries[0].sequence_number;
      const lastSeq = entries[entries.length - 1].sequence_number;
      const tenantId = entries[0].tenant_id;
      
      const verification = await this.verifyChainIntegrity(tenantId, firstSeq, lastSeq);
      exportData.verification = verification;
    }
    
    return JSON.stringify(exportData, null, 2);
  }
}

module.exports = ImmutableAuditLedgerService;
