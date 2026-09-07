/**
 * Digest Subscription Routes
 *
 * CRUD for a user's digest subscriptions + a "send test now" action.
 * All routes require authentication. Users can only manage their own subscriptions.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const { authenticateToken } = require('../src/middleware/authenticate');
const { sendDigest, computeNextSendAt } = require('../services/DigestService');

// ─── Admin-only: digest summaries are platform-wide aggregates ───────────────
// Restricts to users with the Admin role or admin-equivalent permissions
// (mirrors userHasAdminAccess in server.js).
function requireAdmin(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const hasAdminRole = user.roles && (
    user.roles.includes('Admin') || user.roles.includes('admin') ||
    user.roles.some(r =>
      typeof r === 'object' && (
        r.name === 'Admin' || r.name === 'admin' ||
        r.role_name === 'Admin' || r.role_name === 'admin'
      )
    )
  );

  const hasAdminPermission = Array.isArray(user.permissions) && user.permissions.some(p => {
    const name = typeof p === 'string' ? p : (p.name || p.permission_name || p.permission_code || '');
    return ['users:write', 'roles:write', 'project_management:write'].includes(name);
  });

  if (!hasAdminRole && !hasAdminPermission) {
    return res.status(403).json({ error: 'Admin access required. Digest subscriptions contain platform-wide data.' });
  }
  next();
}

// ─── Auth + admin required for all routes ────────────────────────────────────
router.use(authenticateToken);
router.use(requireAdmin);

const VALID_FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];
const VALID_CATEGORIES  = ['all', 'files_processed', 'job_failures', 'dq_violations', 'schema_drift', 'profiling_failures', 'data_contracts'];

function validateBody(body) {
  const errors = [];
  if (body.frequency && !VALID_FREQUENCIES.includes(body.frequency)) {
    errors.push(`frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`);
  }
  if (body.categories) {
    if (!Array.isArray(body.categories) || body.categories.length === 0) {
      errors.push('categories must be a non-empty array');
    } else if (body.categories.some(c => !VALID_CATEGORIES.includes(c))) {
      errors.push(`categories must only contain: ${VALID_CATEGORIES.join(', ')}`);
    }
  }
  if (body.recipients) {
    if (!Array.isArray(body.recipients)) {
      errors.push('recipients must be an array');
    } else if (body.recipients.some(r => typeof r !== 'string' || !r.includes('@'))) {
      errors.push('all recipients must be valid email addresses');
    }
  }
  return errors;
}

// ─── GET /api/digest-subscriptions ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT ds.*,
              sc.name AS connection_name,
              (SELECT row_to_json(ed) FROM email_digests ed
               WHERE ed.subscription_id = ds.id ORDER BY ed.sent_at DESC LIMIT 1) AS last_digest
       FROM digest_subscriptions ds
       LEFT JOIN storage_connections sc ON sc.connection_id = ds.email_connection_id
       WHERE ds.user_id = $1
       ORDER BY ds.created_at DESC`,
      [userId]
    );
    res.json({ subscriptions: result.rows });
  } catch (err) {
    systemLogger.error('GET /digest-subscriptions error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch digest subscriptions' });
  }
});

// ─── GET /api/digest-subscriptions/:id ───────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await pool.query(
      `SELECT ds.*, sc.name AS connection_name
       FROM digest_subscriptions ds
       LEFT JOIN storage_connections sc ON sc.connection_id = ds.email_connection_id
       WHERE ds.id = $1 AND ds.user_id = $2`,
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ subscription: result.rows[0] });
  } catch (err) {
    systemLogger.error('GET /digest-subscriptions/:id error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch digest subscription' });
  }
});

// ─── POST /api/digest-subscriptions ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name = 'My Digest',
      frequency = 'daily',
      categories = ['all'],
      recipients = [],
      email_connection_id = null,
      send_if_empty = false,
      is_active = true,
    } = req.body;

    const errors = validateBody({ frequency, categories, recipients });
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient email is required' });
    }

    const nextSendAt = computeNextSendAt(frequency);

    const result = await pool.query(
      `INSERT INTO digest_subscriptions
         (user_id, name, frequency, categories, recipients, email_connection_id, send_if_empty, is_active, next_send_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, name, frequency, JSON.stringify(categories), JSON.stringify(recipients),
       email_connection_id || null, send_if_empty, is_active, nextSendAt]
    );

    systemLogger.info('Digest subscription created', { subscriptionId: result.rows[0].id, userId });
    res.status(201).json({ subscription: result.rows[0] });
  } catch (err) {
    systemLogger.error('POST /digest-subscriptions error', { error: err.message });
    res.status(500).json({ error: 'Failed to create digest subscription' });
  }
});

// ─── PUT /api/digest-subscriptions/:id ───────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const check = await pool.query(
      'SELECT id FROM digest_subscriptions WHERE id = $1 AND user_id = $2', [id, userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Subscription not found' });

    const {
      name, frequency, categories, recipients,
      email_connection_id, send_if_empty, is_active,
    } = req.body;

    const errors = validateBody({ frequency, categories, recipients });
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    // Recalculate next_send_at if frequency changed
    let nextSendAt;
    if (frequency) {
      nextSendAt = computeNextSendAt(frequency);
    }

    const setClauses = [];
    const values = [];
    let p = 1;

    const addField = (col, val) => { if (val !== undefined) { setClauses.push(`${col} = $${p++}`); values.push(val); } };

    addField('name', name);
    addField('frequency', frequency);
    addField('categories', categories ? JSON.stringify(categories) : undefined);
    addField('recipients', recipients ? JSON.stringify(recipients) : undefined);
    addField('email_connection_id', email_connection_id !== undefined ? (email_connection_id || null) : undefined);
    addField('send_if_empty', send_if_empty);
    addField('is_active', is_active);
    if (nextSendAt) { setClauses.push(`next_send_at = $${p++}`); values.push(nextSendAt); }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE digest_subscriptions SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );

    systemLogger.info('Digest subscription updated', { subscriptionId: id, userId });
    res.json({ subscription: result.rows[0] });
  } catch (err) {
    systemLogger.error('PUT /digest-subscriptions/:id error', { error: err.message });
    res.status(500).json({ error: 'Failed to update digest subscription' });
  }
});

// ─── DELETE /api/digest-subscriptions/:id ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM digest_subscriptions WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Subscription not found' });
    systemLogger.info('Digest subscription deleted', { subscriptionId: id, userId });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    systemLogger.error('DELETE /digest-subscriptions/:id error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete digest subscription' });
  }
});

// ─── POST /api/digest-subscriptions/:id/send-test ────────────────────────────
router.post('/:id/send-test', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const check = await pool.query(
      'SELECT * FROM digest_subscriptions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Subscription not found' });

    const subscription = check.rows[0];

    // Override send_if_empty for test sends so we always send something
    const testSub = { ...subscription, send_if_empty: true };
    const result = await sendDigest(testSub);

    res.json({ success: result.status === 'sent', status: result.status, error: result.errorMessage });
  } catch (err) {
    systemLogger.error('POST /digest-subscriptions/:id/send-test error', { error: err.message });
    res.status(500).json({ error: 'Failed to send test digest', detail: err.message });
  }
});

// ─── GET /api/digest-subscriptions/:id/history ───────────────────────────────
router.get('/:id/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const check = await pool.query(
      'SELECT id FROM digest_subscriptions WHERE id = $1 AND user_id = $2', [id, userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Subscription not found' });

    const result = await pool.query(
      `SELECT id, sent_at, recipient_count, status, error_message, created_at
       FROM email_digests WHERE subscription_id = $1 ORDER BY sent_at DESC LIMIT 50`,
      [id]
    );
    res.json({ history: result.rows });
  } catch (err) {
    systemLogger.error('GET /digest-subscriptions/:id/history error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch digest history' });
  }
});

module.exports = router;
