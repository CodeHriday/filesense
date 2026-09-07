'use strict';

/**
 * Jira integration routes
 *
 * GET    /api/jira/connections         — list saved Jira connections (authenticated users)
 * POST   /api/jira/connections/test    — test credentials before saving (admins only)
 * POST   /api/jira/connections         — create a new Jira connection (admins only)
 * PUT    /api/jira/connections/:id     — update a Jira connection (admins only)
 * DELETE /api/jira/connections/:id     — delete a Jira connection (admins only)
 *
 * Security model
 * --------------
 * - Mutating endpoints (create / update / delete / test) require admin access.
 * - The /test endpoint for an EXISTING connection NEVER accepts a caller-supplied
 *   instanceUrl — it uses only the URL stored with the connection. This prevents
 *   an attacker from redirecting stored, decrypted credentials to an arbitrary host.
 * - Stored credentials (email, apiToken) are never returned to the client.
 */

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { encrypt, decrypt } = require('../utils/encryption');
const { systemLogger } = require('../utils/logger');
const { userHasAdminAccess } = require('../utils/permissionHelpers');
const JiraService = require('../services/JiraService');

/**
 * Validate that a Jira instance URL is safe to use as a credential target.
 *
 * Requirements:
 *  - Must be a valid URL
 *  - Protocol must be HTTPS (prevents plaintext credential exposure)
 *  - Hostname must not be localhost, a loopback, link-local, or any RFC-1918
 *    private address (prevents SSRF and credential exfiltration to internal services)
 *
 * Returns { ok: true } or { ok: false, error: string }.
 */
function validateJiraInstanceUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'instanceUrl is not a valid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'instanceUrl must use HTTPS' };
  }

  const host = parsed.hostname.toLowerCase();

  // Strip brackets from IPv6 literals, e.g. "[::1]" → "::1"
  const rawHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // Block well-known local names / IPv6 unspecified / loopback
  const localNames = ['localhost', '0.0.0.0', '::1', '::', '0:0:0:0:0:0:0:1', '0:0:0:0:0:0:0:0'];
  if (localNames.includes(rawHost)) {
    return { ok: false, error: 'instanceUrl must not point to a local address' };
  }

  // Block private / reserved IPv4 ranges (RFC-1918, loopback, APIPA, CGNAT)
  const privateIPv4Patterns = [
    /^127\./,           // loopback (127.0.0.0/8)
    /^10\./,            // class A private (10.0.0.0/8)
    /^172\.(1[6-9]|2\d|3[01])\./, // class B private (172.16–172.31)
    /^192\.168\./,      // class C private (192.168.0.0/16)
    /^169\.254\./,      // APIPA / link-local (169.254.0.0/16)
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (100.64–100.127)
    /^0\./,             // "This" network (0.0.0.0/8)
  ];
  for (const pattern of privateIPv4Patterns) {
    if (pattern.test(rawHost)) {
      return { ok: false, error: 'instanceUrl must not point to a private network address' };
    }
  }

  // Block private / reserved IPv6 ranges
  const privateIPv6Patterns = [
    /^::ffff:127\./i,             // IPv4-mapped loopback
    /^::ffff:10\./i,              // IPv4-mapped class A
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./i, // IPv4-mapped class B
    /^::ffff:192\.168\./i,        // IPv4-mapped class C
    /^::ffff:169\.254\./i,        // IPv4-mapped APIPA
    /^fc[0-9a-f]{2}:/i,           // ULA (fc00::/7 — fc00:: to fdff::)
    /^fd[0-9a-f]{2}:/i,           // ULA continuation
    /^fe[89ab][0-9a-f]:/i,        // link-local (fe80::/10 — fe80:: to febf::)
    /^::$/,                       // unspecified
  ];
  for (const pattern of privateIPv6Patterns) {
    if (pattern.test(rawHost)) {
      return { ok: false, error: 'instanceUrl must not point to a private network address' };
    }
  }

  return { ok: true };
}

/** Middleware helper — returns 403 for non-admins. */
function requireAdmin(req, res, next) {
  if (!userHasAdminAccess(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── GET /api/jira/connections ─────────────────────────────────────────────────
// Available to all authenticated users so the node config modals can populate
// connection drop-downs without requiring admin rights.
router.get('/connections', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT connection_id, name, status, config, created_at, updated_at
         FROM storage_connections
        WHERE type = 'jira'
        ORDER BY created_at DESC`
    );

    const connections = result.rows.map(row => {
      const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      return {
        connection_id:  row.connection_id,
        name:           row.name,
        status:         row.status,
        instance_url:   cfg.instance_url,
        project_key:    cfg.project_key,
        email_display:  cfg.email_display || '(encrypted)',
        default_labels: cfg.default_labels || [],
        has_api_token:  !!cfg.api_token,
        created_at:     row.created_at,
        updated_at:     row.updated_at
      };
    });

    res.json(connections);
  } catch (err) {
    systemLogger.error('GET /api/jira/connections failed', { error: err.message });
    res.status(500).json({ error: 'Failed to list Jira connections' });
  }
});

// ── POST /api/jira/connections/test ──────────────────────────────────────────
// SECURITY: When testing a stored connection (connectionId provided) the stored
// instance_url is ALWAYS used — the caller cannot supply a different URL. This
// prevents credential exfiltration via redirect to an attacker-controlled host.
// When testing new (unsaved) credentials the caller supplies all three fields.
router.post('/connections/test', requireAdmin, async (req, res) => {
  const { email, apiToken, connectionId } = req.body;
  // Note: intentionally NOT reading req.body.instanceUrl when connectionId is present.

  let resolvedEmail    = email;
  let resolvedApiToken = apiToken;
  let resolvedUrl;

  if (connectionId) {
    // Testing an existing stored connection — use ONLY stored URL and (optionally)
    // override credentials if fresh ones are supplied by the admin.
    try {
      const r = await pool.query(
        "SELECT config FROM storage_connections WHERE connection_id = $1 AND type = 'jira'",
        [connectionId]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Jira connection not found' });
      }
      const cfg = typeof r.rows[0].config === 'string'
        ? JSON.parse(r.rows[0].config)
        : r.rows[0].config;
      // URL always comes from stored config — never from the request body.
      resolvedUrl      = cfg.instance_url;
      resolvedEmail    = resolvedEmail    || (cfg.email     ? decrypt(cfg.email)     : null);
      resolvedApiToken = resolvedApiToken || (cfg.api_token ? decrypt(cfg.api_token) : null);
    } catch (err) {
      systemLogger.warn('Failed to load stored Jira credentials for test', { error: err.message });
      return res.status(500).json({ error: 'Failed to load connection credentials' });
    }
  } else {
    // Testing new (unsaved) credentials — caller must supply all three fields.
    resolvedUrl = req.body.instanceUrl;
  }

  if (!resolvedUrl || !resolvedEmail || !resolvedApiToken) {
    return res.status(400).json({
      error: connectionId
        ? 'Connection credentials are incomplete'
        : 'instanceUrl, email, and apiToken are required'
    });
  }

  // Always validate the URL before using stored credentials — catches cases
  // where an admin updates a connection URL to a malicious host and immediately
  // tests it (update-then-test credential exfiltration vector).
  const urlCheck = validateJiraInstanceUrl(resolvedUrl);
  if (!urlCheck.ok) {
    return res.status(400).json({ error: urlCheck.error });
  }

  const result = await JiraService.testConnection({
    instanceUrl: resolvedUrl,
    email:       resolvedEmail,
    apiToken:    resolvedApiToken
  });

  res.json(result);
});

// ── POST /api/jira/connections ────────────────────────────────────────────────
router.post('/connections', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      instanceUrl,
      email,
      apiToken,
      projectKey,
      defaultLabels = []
    } = req.body;

    if (!name || !instanceUrl || !email || !apiToken || !projectKey) {
      return res.status(400).json({
        error: 'name, instanceUrl, email, apiToken, and projectKey are required'
      });
    }

    const urlCheck = validateJiraInstanceUrl(instanceUrl);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: urlCheck.error });
    }

    const connectionId = uuidv4();
    const config = {
      instance_url:   (instanceUrl || '').replace(/\/$/, ''),
      project_key:    projectKey,
      email:          encrypt(email),
      email_display:  email.replace(/(.{2}).*(@.*)/, '$1***$2'),
      api_token:      encrypt(apiToken),
      default_labels: defaultLabels
    };

    await pool.query(
      `INSERT INTO storage_connections
         (connection_id, name, type, status, config, created_at, updated_at)
       VALUES ($1, $2, 'jira', 'active', $3, NOW(), NOW())`,
      [connectionId, name, JSON.stringify(config)]
    );

    systemLogger.info('Jira connection created', { connectionId, name, createdBy: req.user?.id });
    res.status(201).json({ connection_id: connectionId, name, status: 'active' });
  } catch (err) {
    systemLogger.error('POST /api/jira/connections failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create Jira connection' });
  }
});

// ── PUT /api/jira/connections/:id ─────────────────────────────────────────────
// SECURITY: instanceUrl update is only accepted from admins (guarded above).
// The stored URL is the canonical authority for credential routing.
router.put('/connections/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, instanceUrl, email, apiToken, projectKey, defaultLabels, status } = req.body;

    const existing = await pool.query(
      "SELECT config FROM storage_connections WHERE connection_id = $1 AND type = 'jira'",
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Jira connection not found' });
    }

    const oldCfg = typeof existing.rows[0].config === 'string'
      ? JSON.parse(existing.rows[0].config)
      : existing.rows[0].config;

    // Validate any updated URL before storing it — prevents persisting a malicious
    // URL that could later be used to exfiltrate stored credentials via the test endpoint.
    if (instanceUrl) {
      const urlCheck = validateJiraInstanceUrl(instanceUrl);
      if (!urlCheck.ok) {
        return res.status(400).json({ error: urlCheck.error });
      }
    }

    const newCfg = { ...oldCfg };
    if (instanceUrl)                    newCfg.instance_url   = (instanceUrl || '').replace(/\/$/, '');
    if (projectKey)                     newCfg.project_key    = projectKey;
    if (defaultLabels !== undefined)    newCfg.default_labels = defaultLabels;
    if (email) {
      newCfg.email         = encrypt(email);
      newCfg.email_display = email.replace(/(.{2}).*(@.*)/, '$1***$2');
    }
    if (apiToken) {
      newCfg.api_token = encrypt(apiToken);
    }

    await pool.query(
      `UPDATE storage_connections
          SET name = COALESCE($1, name),
              config = $2,
              status = COALESCE($3, status),
              updated_at = NOW()
        WHERE connection_id = $4 AND type = 'jira'`,
      [name || null, JSON.stringify(newCfg), status || null, id]
    );

    systemLogger.info('Jira connection updated', { connectionId: id, updatedBy: req.user?.id });
    res.json({ success: true });
  } catch (err) {
    systemLogger.error('PUT /api/jira/connections/:id failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update Jira connection' });
  }
});

// ── DELETE /api/jira/connections/:id ─────────────────────────────────────────
router.delete('/connections/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM storage_connections WHERE connection_id = $1 AND type = 'jira'",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Jira connection not found' });
    }

    systemLogger.info('Jira connection deleted', { connectionId: id, deletedBy: req.user?.id });
    res.json({ success: true });
  } catch (err) {
    systemLogger.error('DELETE /api/jira/connections/:id failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete Jira connection' });
  }
});

module.exports = router;
