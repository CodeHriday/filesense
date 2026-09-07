/**
 * JiraService
 *
 * Wraps Jira REST API v3 (POST /rest/api/3/issue).
 * Credentials are stored encrypted in storage_connections (type = 'jira').
 * All methods are static and never throw — failures are logged and null/error
 * objects returned so callers can continue without blocking the pipeline.
 */
'use strict';

const axios = require('axios');
const https = require('https');
const dns   = require('dns').promises;
const { systemLogger } = require('../utils/logger');
const { decrypt } = require('../utils/encryption');

/**
 * Check whether an IPv4 or IPv6 address string falls in a private/reserved range.
 *
 * Covers:
 *   • IPv4: loopback (127/8), RFC-1918 (10/8, 172.16/12, 192.168/16), APIPA (169.254/16),
 *           CGNAT (100.64/10), "this" network (0/8)
 *   • IPv6: loopback (::1), unspecified (::), ULA (fc00::/7 = fc– and fd–),
 *           link-local (fe80::/10 = fe80–febf), IPv4-mapped (::ffff:private)
 */
function isPrivateIp(ip) {
  const privateIPv4 = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^0\./,
  ];
  for (const p of privateIPv4) if (p.test(ip)) return true;

  const lo6 = ip.toLowerCase();
  if (lo6 === '::1' || lo6 === '::' || lo6 === '0:0:0:0:0:0:0:1' || lo6 === '0:0:0:0:0:0:0:0') return true;
  if (/^fc[0-9a-f]{2}:/i.test(lo6)) return true; // ULA fc00::/8 prefix
  if (/^fd[0-9a-f]{2}:/i.test(lo6)) return true; // ULA fd00::/8 prefix
  if (/^fe[89ab][0-9a-f]:/i.test(lo6)) return true; // link-local fe80::/10
  if (/^::ffff:/i.test(lo6)) {
    return isPrivateIp(lo6.replace(/^::ffff:/i, ''));
  }
  return false;
}

/**
 * Resolve `rawUrl`'s hostname, validate every returned address against
 * private/reserved ranges, then return a custom `https.Agent` that is
 * **pinned** to the first validated IP.
 *
 * Pinning is critical: it prevents DNS-rebinding by ensuring Axios uses the
 * same, already-validated IP for the actual TCP connect — it cannot issue a
 * second DNS lookup that might return a private address.  TLS hostname
 * verification continues to use the original hostname (Node's default), so
 * certificate checks are not weakened.
 *
 * Throws an Error if:
 *   - the URL is not HTTPS
 *   - hostname cannot be resolved
 *   - any resolved address is private/reserved
 */
async function createSsrfSafeAgent(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Invalid Jira URL'); }

  if (parsed.protocol !== 'https:') {
    throw new Error('Jira URL must use HTTPS');
  }

  // Strip brackets from IPv6 literals (e.g. "[::1]" → "::1")
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  let results;
  try {
    results = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`Cannot resolve Jira hostname "${hostname}": ${err.message}`);
  }

  if (!results || results.length === 0) {
    throw new Error(`No DNS records for "${hostname}"`);
  }

  // Reject if ANY resolved address is private — prevents split-horizon DNS attacks
  for (const { address } of results) {
    if (isPrivateIp(address)) {
      throw new Error(`Jira hostname "${hostname}" resolves to a private/reserved address (${address})`);
    }
  }

  // Pin the Axios connection to the first validated IP.
  // The custom `lookup` callback is called by Node's net/tls module at
  // connect time, not by Axios URL parsing — so this eliminates the window
  // between validation and the actual socket connect used in DNS rebinding.
  const { address: pinnedIp, family: pinnedFamily } = results[0];
  const agent = new https.Agent({
    lookup: (_h, _opts, cb) => cb(null, pinnedIp, pinnedFamily)
    // servername (SNI) defaults to the original hostname from the URL,
    // so TLS certificate verification is unaffected.
  });

  return agent;
}

class JiraService {
  /**
   * Load the first active Jira connection from storage_connections.
   * @param {Pool} pool
   * @returns {Object|null}
   */
  static async getJiraConnection(pool) {
    try {
      const result = await pool.query(
        "SELECT * FROM storage_connections WHERE type = 'jira' AND status = 'active' ORDER BY created_at ASC LIMIT 1"
      );
      return result.rows[0] || null;
    } catch (err) {
      systemLogger.warn('JiraService: failed to query Jira connection', { error: err.message });
      return null;
    }
  }

  /**
   * Decode raw config (may be string or object) and decrypt sensitive fields.
   * @returns {{ instanceUrl, projectKey, email, apiToken, defaultLabels } | null}
   */
  static _decodeConfig(rawConn) {
    try {
      const cfg = typeof rawConn.config === 'string'
        ? JSON.parse(rawConn.config)
        : rawConn.config;

      const instanceUrl = (cfg.instance_url || '').replace(/\/$/, '');
      const projectKey  = cfg.project_key;
      const email       = cfg.email ? decrypt(cfg.email) : null;
      const apiToken    = cfg.api_token ? decrypt(cfg.api_token) : null;
      const defaultLabels = Array.isArray(cfg.default_labels) ? cfg.default_labels : [];

      if (!instanceUrl || !projectKey || !email || !apiToken) return null;
      return { instanceUrl, projectKey, email, apiToken, defaultLabels };
    } catch (err) {
      systemLogger.warn('JiraService: failed to decode config', { error: err.message });
      return null;
    }
  }

  /**
   * Build Basic Auth header from email + apiToken.
   */
  static _authHeader(email, apiToken) {
    const token = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Test credentials against the Jira /rest/api/3/myself endpoint.
   * @param {{ instanceUrl: string, email: string, apiToken: string }} params
   * @returns {{ success: boolean, displayName?: string, error?: string }}
   */
  static async testConnection({ instanceUrl, email, apiToken }) {
    try {
      const baseUrl = (instanceUrl || '').replace(/\/$/, '');
      // Resolve, validate, and pin the connection — prevents DNS rebinding between
      // the validation check and the actual socket connect.
      const agent = await createSsrfSafeAgent(baseUrl);
      const url = `${baseUrl}/rest/api/3/myself`;
      const response = await axios.get(url, {
        headers: {
          Authorization: JiraService._authHeader(email, apiToken),
          Accept: 'application/json'
        },
        httpsAgent: agent,
        timeout: 8000,
        maxRedirects: 0  // never follow redirects — prevents redirect-based exfiltration
      });
      return {
        success: true,
        accountId: response.data.accountId,
        displayName: response.data.displayName
      };
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.message;
      return { success: false, error: `HTTP ${status}: ${detail}` };
    }
  }

  /**
   * Create a Jira issue for an aborted job (DQ abort or schema-drift abort).
   * Persists the returned issue key to transformation_jobs.jira_issue_key.
   *
   * @param {Pool} pool
   * @param {{
   *   jobId: string,
   *   jobName: string,
   *   mappingName: string,
   *   abortReason: string,            // 'dq_abort' | 'schema_drift'
   *   violatedRuleNames: string[],
   *   violationCount: number,
   *   appBaseUrl?: string
   * }} ctx
   * @returns {string|null} Jira issue key (e.g. "DQ-456") or null on failure
   */
  static async createIssueForAbortedJob(pool, ctx) {
    const {
      jobId, jobName, mappingName,
      abortReason = 'dq_abort',
      violatedRuleNames = [],
      violationCount = 0,
      appBaseUrl
    } = ctx;

    try {
      const conn = await JiraService.getJiraConnection(pool);
      if (!conn) {
        systemLogger.debug('JiraService: no active Jira connection — skipping', { jobId });
        return null;
      }

      const creds = JiraService._decodeConfig(conn);
      if (!creds) {
        systemLogger.warn('JiraService: Jira connection config incomplete', { jobId });
        return null;
      }

      const { instanceUrl, projectKey, email, apiToken, defaultLabels } = creds;

      const abortLabel = abortReason === 'schema_drift' ? 'Schema Drift' : 'DQ Violation';
      const summary = `${abortLabel}: ${mappingName || jobName || jobId}`;
      const deepLink = appBaseUrl ? `${appBaseUrl}/jobs` : null;

      const ruleList = violatedRuleNames.length
        ? violatedRuleNames.map(r => `  • ${r}`).join('\n')
        : '  (no specific rules identified)';

      const descriptionText =
        `Job "${mappingName || jobName || jobId}" was aborted due to ${abortLabel.toLowerCase()}.\n\n` +
        `Job ID: ${jobId}\n` +
        `Abort timestamp: ${new Date().toISOString()}\n` +
        `Total violations: ${violationCount}\n` +
        `Violated rules:\n${ruleList}` +
        (deepLink ? `\n\nView job runs: ${deepLink}` : '');

      const body = {
        fields: {
          project: { key: projectKey },
          summary,
          issuetype: { name: 'Bug' },
          priority:  { name: 'High' },
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: descriptionText }]
            }]
          },
          labels: defaultLabels
        }
      };

      // Resolve, validate, and pin the connection to prevent DNS rebinding.
      const agent = await createSsrfSafeAgent(instanceUrl);

      const response = await axios.post(
        `${instanceUrl}/rest/api/3/issue`,
        body,
        {
          headers: {
            Authorization: JiraService._authHeader(email, apiToken),
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          httpsAgent: agent,
          timeout: 10000,
          maxRedirects: 0
        }
      );

      const issueKey = response.data.key;

      // Persist issue key to transformation_jobs — safe even if column doesn't exist yet
      try {
        await pool.query(
          'UPDATE transformation_jobs SET jira_issue_key = $1 WHERE job_id = $2',
          [issueKey, jobId]
        );
      } catch (persistErr) {
        systemLogger.warn('JiraService: could not persist jira_issue_key', {
          jobId, issueKey, error: persistErr.message
        });
      }

      systemLogger.info('JiraService: Jira issue created for aborted job', { jobId, issueKey });
      return issueKey;

    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.errors || err.message;
      systemLogger.error('JiraService.createIssueForAbortedJob failed', {
        jobId, status, error: detail
      });
      return null;
    }
  }

  /**
   * Create a Jira issue from a workflow Jira Ticket node.
   *
   * @param {Pool} pool
   * @param {{
   *   summary: string,
   *   description: string,
   *   issueType: string,
   *   priority: string,
   *   assignee?: string,
   *   projectKeyOverride?: string,
   *   connectionIdOverride?: string    // UUID of a specific Jira connection
   * }} config
   * @returns {{ success: boolean, issueKey?: string, issueUrl?: string, error?: string, skipped?: boolean }}
   */
  static async createIssueFromWorkflow(pool, config) {
    const {
      summary,
      description,
      issueType = 'Task',
      priority  = 'Medium',
      assignee,
      projectKeyOverride,
      connectionIdOverride
    } = config;

    try {
      let conn;
      if (connectionIdOverride) {
        const r = await pool.query(
          "SELECT * FROM storage_connections WHERE connection_id = $1 AND type = 'jira' AND status = 'active'",
          [connectionIdOverride]
        );
        conn = r.rows[0] || null;
      } else {
        conn = await JiraService.getJiraConnection(pool);
      }

      if (!conn) {
        return { success: false, skipped: true, reason: 'No active Jira connection found' };
      }

      const creds = JiraService._decodeConfig(conn);
      if (!creds) {
        return { success: false, error: 'Jira connection configuration is incomplete' };
      }

      const { instanceUrl, projectKey, email, apiToken, defaultLabels } = creds;
      const effectiveProjectKey = projectKeyOverride || projectKey;

      const bodyFields = {
        project:   { key: effectiveProjectKey },
        summary:   summary || 'Workflow execution ticket',
        issuetype: { name: issueType },
        priority:  { name: priority },
        labels: defaultLabels
      };

      if (description) {
        bodyFields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: description }]
          }]
        };
      }

      if (assignee) {
        // Jira Cloud REST API v3 requires accountId, not name/username
        bodyFields.assignee = { accountId: assignee };
      }

      // Resolve, validate, and pin the connection to prevent DNS rebinding.
      const agent = await createSsrfSafeAgent(instanceUrl);

      const response = await axios.post(
        `${instanceUrl}/rest/api/3/issue`,
        { fields: bodyFields },
        {
          headers: {
            Authorization: JiraService._authHeader(email, apiToken),
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          httpsAgent: agent,
          timeout: 10000,
          maxRedirects: 0
        }
      );

      const issueKey = response.data.key;
      const issueUrl = `${instanceUrl}/browse/${issueKey}`;

      systemLogger.info('JiraService: Jira issue created from workflow node', { issueKey, issueUrl });
      return { success: true, issueKey, issueUrl };

    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.errors || err.message;
      systemLogger.error('JiraService.createIssueFromWorkflow failed', { status, error: detail });
      return { success: false, error: String(detail || err.message) };
    }
  }
}

module.exports = JiraService;
