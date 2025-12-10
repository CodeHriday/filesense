const express = require('express');
const router = express.Router();
const ImmutableAuditLedgerService = require('../services/ImmutableAuditLedgerService');

router.get('/', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const {
    tenant_id,
    job_id,
    correlation_id,
    actor_id,
    action_type,
    action_category,
    entity_type,
    entity_id,
    log_level,
    start_date,
    end_date,
    limit = 100,
    offset = 0
  } = req.query;
  
  try {
    const result = await ledgerService.getEntries({
      tenantId: tenant_id || 'default',
      jobId: job_id,
      correlationId: correlation_id,
      actorId: actor_id,
      actionType: action_type,
      actionCategory: action_category,
      entityType: entity_type,
      entityId: entity_id,
      logLevel: log_level,
      startDate: start_date ? new Date(start_date) : null,
      endDate: end_date ? new Date(end_date) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching audit ledger entries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit ledger entries',
      details: error.message
    });
  }
});

router.get('/job/:jobId', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const { jobId } = req.params;
  const { limit = 1000, offset = 0 } = req.query;
  
  try {
    const result = await ledgerService.getEntriesByJobId(jobId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching audit ledger by job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit ledger entries',
      details: error.message
    });
  }
});

router.get('/correlation/:correlationId', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const { correlationId } = req.params;
  const { limit = 1000, offset = 0 } = req.query;
  
  try {
    const result = await ledgerService.getEntriesByCorrelationId(correlationId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching audit ledger by correlation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit ledger entries',
      details: error.message
    });
  }
});

router.post('/verify', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const {
    tenant_id = 'default',
    start_sequence = 1,
    end_sequence = null
  } = req.body;
  
  try {
    const result = await ledgerService.verifyChainIntegrity(
      tenant_id,
      parseInt(start_sequence),
      end_sequence ? parseInt(end_sequence) : null
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error verifying audit ledger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify audit ledger integrity',
      details: error.message
    });
  }
});

router.get('/verification-history', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const { tenant_id = 'default', limit = 50 } = req.query;
  
  try {
    const result = await ledgerService.getVerificationHistory(tenant_id, parseInt(limit));
    res.json(result);
  } catch (error) {
    console.error('Error fetching verification history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verification history',
      details: error.message
    });
  }
});

router.get('/export/job/:jobId', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const { jobId } = req.params;
  const { format = 'json', include_verification = 'false' } = req.query;
  
  try {
    const result = await ledgerService.getEntriesByJobId(jobId, { limit: 10000 });
    
    if (format === 'csv') {
      const csv = await ledgerService.exportToCSV(result.entries);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_ledger_${jobId}.csv"`);
      res.send(csv);
    } else {
      const json = await ledgerService.exportToJSON(
        result.entries,
        include_verification === 'true'
      );
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit_ledger_${jobId}.json"`);
      res.send(json);
    }
  } catch (error) {
    console.error('Error exporting audit ledger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export audit ledger',
      details: error.message
    });
  }
});

router.get('/export/correlation/:correlationId', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const ledgerService = new ImmutableAuditLedgerService(pool);
  
  const { correlationId } = req.params;
  const { format = 'json', include_verification = 'false' } = req.query;
  
  try {
    const result = await ledgerService.getEntriesByCorrelationId(correlationId, { limit: 10000 });
    
    if (format === 'csv') {
      const csv = await ledgerService.exportToCSV(result.entries);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_ledger_${correlationId}.csv"`);
      res.send(csv);
    } else {
      const json = await ledgerService.exportToJSON(
        result.entries,
        include_verification === 'true'
      );
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit_ledger_${correlationId}.json"`);
      res.send(json);
    }
  } catch (error) {
    console.error('Error exporting audit ledger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export audit ledger',
      details: error.message
    });
  }
});

router.get('/stats', async (req, res) => {
  const pool = req.app.locals.pool || req.app.get('db');
  const { tenant_id = 'default' } = req.query;
  
  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_entries,
        MIN(event_timestamp) as first_entry,
        MAX(event_timestamp) as last_entry,
        COUNT(DISTINCT job_id) as unique_jobs,
        COUNT(DISTINCT correlation_id) as unique_correlations,
        COUNT(DISTINCT actor_id) as unique_actors
      FROM audit_ledger
      WHERE tenant_id = $1
    `, [tenant_id]);
    
    const seqResult = await pool.query(`
      SELECT current_sequence, last_hash, updated_at
      FROM audit_ledger_sequence
      WHERE tenant_id = $1
    `, [tenant_id]);
    
    const levelCounts = await pool.query(`
      SELECT log_level, COUNT(*) as count
      FROM audit_ledger
      WHERE tenant_id = $1
      GROUP BY log_level
      ORDER BY count DESC
    `, [tenant_id]);
    
    const categoryCounts = await pool.query(`
      SELECT action_category, COUNT(*) as count
      FROM audit_ledger
      WHERE tenant_id = $1
      GROUP BY action_category
      ORDER BY count DESC
    `, [tenant_id]);
    
    res.json({
      success: true,
      stats: {
        ...statsResult.rows[0],
        sequence: seqResult.rows[0] || { current_sequence: 0 },
        byLevel: levelCounts.rows,
        byCategory: categoryCounts.rows
      }
    });
  } catch (error) {
    console.error('Error fetching audit ledger stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit ledger stats',
      details: error.message
    });
  }
});

module.exports = router;
