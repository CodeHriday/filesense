const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, domain, description, is_active, created_by, created_at, updated_at
      FROM allowed_email_domains
      ORDER BY domain ASC
    `);
    
    res.json({
      success: true,
      domains: result.rows
    });
  } catch (error) {
    systemLogger.error('Error fetching allowed email domains', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch allowed email domains'
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const { domain, description } = req.body;
    const userId = req.user?.id;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required'
      });
    }
    
    const normalizedDomain = domain.toLowerCase().trim();
    
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(normalizedDomain)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid domain format. Example: example.com'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO allowed_email_domains (domain, description, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, domain, description, is_active, created_by, created_at
    `, [normalizedDomain, description || null, userId]);
    
    systemLogger.info('Allowed email domain created', {
      domain: normalizedDomain,
      userId
    });
    
    res.status(201).json({
      success: true,
      domain: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Domain already exists'
      });
    }
    
    systemLogger.error('Error creating allowed email domain', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create allowed email domain'
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { domain, description, is_active } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    if (domain !== undefined) {
      const normalizedDomain = domain.toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(normalizedDomain)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid domain format'
        });
      }
      paramCount++;
      updates.push(`domain = $${paramCount}`);
      values.push(normalizedDomain);
    }
    
    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      values.push(description);
    }
    
    if (is_active !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    paramCount++;
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await pool.query(`
      UPDATE allowed_email_domains
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, domain, description, is_active, created_by, created_at, updated_at
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found'
      });
    }
    
    systemLogger.info('Allowed email domain updated', {
      domainId: id,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      domain: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Domain already exists'
      });
    }
    
    systemLogger.error('Error updating allowed email domain', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update allowed email domain'
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM allowed_email_domains
      WHERE id = $1
      RETURNING id, domain
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found'
      });
    }
    
    systemLogger.info('Allowed email domain deleted', {
      domainId: id,
      domain: result.rows[0].domain,
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    systemLogger.error('Error deleting allowed email domain', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete allowed email domain'
    });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({
        success: false,
        error: 'emails array is required'
      });
    }
    
    const domainsResult = await pool.query(`
      SELECT domain FROM allowed_email_domains WHERE is_active = true
    `);
    
    const allowedDomains = domainsResult.rows.map(r => r.domain.toLowerCase());
    
    if (allowedDomains.length === 0) {
      return res.json({
        success: true,
        valid: true,
        message: 'No domain restrictions configured'
      });
    }
    
    const invalidEmails = [];
    for (const email of emails) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain || !allowedDomains.includes(domain)) {
        invalidEmails.push({
          email,
          domain: domain || 'unknown',
          reason: `Domain '${domain || 'unknown'}' is not in the allowed list`
        });
      }
    }
    
    res.json({
      success: true,
      valid: invalidEmails.length === 0,
      invalidEmails,
      allowedDomains
    });
  } catch (error) {
    systemLogger.error('Error validating email domains', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to validate email domains'
    });
  }
});

module.exports = router;
