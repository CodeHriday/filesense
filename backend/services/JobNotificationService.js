/**
 * JobNotificationService
 *
 * Fire-and-forget helper called at every terminal job status point, including
 * cancellation. Responsibilities:
 *
 *  1. Insert a `notifications` row for the triggering user (in-app bell).
 *  2. Find matching alert_policies (entity_type='job', enabled=true) and for each
 *     active policy whose trigger_type matches the job outcome, load recipients
 *     from alert_policy_recipients and send email via NotificationService.
 *  3. If the job came from a VM canvas, read graph_data to find any
 *     emailNotification nodes and send to those recipients too.
 *
 * Never throws — all failures are caught and logged so the job result is unaffected.
 */

const { systemLogger } = require('../utils/logger');
const ConnectionService = require('./ConnectionService');
const NotificationService = require('./NotificationService');

const _notificationService = new NotificationService();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(status) {
  const map = {
    completed: 'Completed',
    completed_with_warnings: 'Completed with Warnings',
    failed: 'Failed',
    cancelled: 'Cancelled'
  };
  return map[status] || status;
}

function statusColor(status) {
  const map = {
    completed: '#137333',
    completed_with_warnings: '#b45309',
    failed: '#c5221f',
    cancelled: '#5f6368'
  };
  return map[status] || '#5f6368';
}

function notificationIcon(status) {
  return { completed: '✅', completed_with_warnings: '⚠️', failed: '❌', cancelled: '🚫' }[status] || '🔔';
}

function buildTitle(status, jobName) {
  return `${notificationIcon(status)} Job ${statusLabel(status)}: ${jobName || 'Unknown Job'}`;
}

function buildMessage(status, metadata) {
  if (status === 'completed' || status === 'completed_with_warnings') {
    let msg = `Processed ${metadata.filesProcessed ?? 0} file(s), ${metadata.rowsWritten ?? 0} rows written`;
    if (metadata.dqViolationCount > 0) msg += `, ${metadata.dqViolationCount} DQ violation(s)`;
    if (metadata.violatedRuleNames?.length) {
      msg += `. Violated rules: ${metadata.violatedRuleNames.slice(0, 3).join(', ')}`;
    }
    return msg;
  }
  if (status === 'failed') {
    let msg = metadata.errorMessage || 'An error occurred during execution.';
    if (metadata.violatedRuleNames?.length) {
      msg += ` Violated rules: ${metadata.violatedRuleNames.slice(0, 3).join(', ')}`;
    }
    return msg;
  }
  if (status === 'cancelled') {
    return 'The job was cancelled before completing.';
  }
  return `Job status: ${status}`;
}

function buildHtmlEmail(status, metadata, jobName) {
  const color = statusColor(status);
  const label = statusLabel(status);
  const violatedRows = (metadata.violatedRuleNames || [])
    .slice(0, 5)
    .map(n => `<li style="margin:4px 0;">${n}</li>`)
    .join('');

  const statsRows = [
    status !== 'cancelled' && metadata.filesProcessed != null
      ? `<tr><td style="padding:8px 0;color:#666;width:180px;">Files Processed</td><td>${metadata.filesProcessed}</td></tr>`
      : '',
    metadata.rowsWritten != null
      ? `<tr><td style="padding:8px 0;color:#666;">Rows Written</td><td>${metadata.rowsWritten}</td></tr>`
      : '',
    metadata.rowsFailed != null
      ? `<tr><td style="padding:8px 0;color:#666;">Rows Failed</td><td>${metadata.rowsFailed}</td></tr>`
      : '',
    metadata.dqViolationCount != null
      ? `<tr><td style="padding:8px 0;color:#666;">DQ Violations</td><td>${metadata.dqViolationCount}</td></tr>`
      : '',
    metadata.errorMessage
      ? `<tr><td style="padding:8px 0;color:#666;">Error</td><td style="color:#c5221f;">${String(metadata.errorMessage).substring(0, 200)}</td></tr>`
      : ''
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:${color};color:#fff;padding:20px 24px;">
      <h2 style="margin:0;font-size:20px;">Job ${label}</h2>
      <p style="margin:4px 0 0;opacity:.9;font-size:14px;">${jobName || 'Unknown Job'}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#666;width:180px;">Status</td>
            <td style="padding:8px 0;font-weight:600;color:${color};">${label}</td></tr>
        ${statsRows}
      </table>
      ${violatedRows
        ? `<div style="margin-top:16px;">
             <strong style="font-size:14px;">Violated Rules:</strong>
             <ul style="margin:8px 0;padding-left:20px;font-size:14px;color:#666;">${violatedRows}</ul>
           </div>`
        : ''}
    </div>
    <div style="padding:14px 24px;background:#f5f5f5;font-size:12px;color:#999;text-align:center;">
      Generated automatically by FileSense · <a href="/jobs" style="color:#1a73e8;">View Jobs</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Returns true if the given job status matches the policy's trigger_type.
 *  - 'success'  → completed | completed_with_warnings
 *  - 'failure'  → failed | cancelled
 *  - 'both'     → all terminal statuses
 */
function policyMatchesStatus(triggerType, status) {
  const success = status === 'completed' || status === 'completed_with_warnings';
  const failure = status === 'failed' || status === 'cancelled';
  if (triggerType === 'both') return success || failure;
  if (triggerType === 'success') return success;
  if (triggerType === 'failure') return failure;
  // Fallback: treat unknown trigger_type as 'both'
  return true;
}

/**
 * Load a storage_connections row by its integer numeric PK.
 * Resolves the string connection_id for use with ConnectionService.
 */
async function loadProviderByNumericId(numericId) {
  // We already have the full row from the JOIN in the policy query;
  // this helper is used when we only have the numeric id (VM nodes).
  const conn = await ConnectionService.getConnectionById(String(numericId));
  return conn;
}

/**
 * Send an email through a storage_connections row (must already be decrypted).
 */
async function _send(connRow, recipients, subject, html, text, context) {
  try {
    // Ensure the connection is active
    if (connRow.status !== 'active') {
      throw new Error(`Connection '${connRow.connection_id}' is not active (status: ${connRow.status})`);
    }
    const rawConfig = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config;
    const decrypted = _notificationService.connectionService.decryptSensitiveFields(connRow.type, rawConfig);
    const provider = { id: connRow.connection_id, type: connRow.type, name: connRow.name, config: decrypted };
    await _notificationService.sendWithProvider(provider, { to: recipients, subject, html, text });
    systemLogger.info('JobNotificationService: email sent', {
      ...context,
      recipientCount: recipients.length,
      connectionId: connRow.connection_id
    });
  } catch (err) {
    systemLogger.warn('JobNotificationService: email send failed', {
      ...context,
      connectionId: connRow.connection_id,
      error: err.message
    });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget job notification.
 *
 * @param {Pool}   pool
 * @param {Object} params
 * @param {string|number} params.userId
 * @param {string}        params.jobId            - transformation_jobs.job_id (UUID string)
 * @param {number}        [params.jobDbId]         - transformation_jobs.id (numeric PK)
 * @param {string}        [params.jobName]
 * @param {string}        params.status            - 'completed'|'completed_with_warnings'|'failed'|'cancelled'
 * @param {Object}        [params.metadata]
 * @param {string}        [params.visualMappingId]
 */
async function fireJobNotification(pool, {
  userId,
  jobId,
  jobDbId,
  jobName,
  status,
  metadata = {},
  visualMappingId = null
}) {
  try {
    if (!userId) {
      systemLogger.debug('JobNotificationService: no userId, skipping', { jobId, status });
      return;
    }

    const title = buildTitle(status, jobName);
    const message = buildMessage(status, metadata);
    const html = buildHtmlEmail(status, metadata, jobName);

    // ── 1. Insert in-app notification row ────────────────────────────────────
    try {
      await pool.query(
        `INSERT INTO notifications
           (user_id, notification_type, title, message, entity_type, entity_id, action_url, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          Number(userId),
          `job_run_${status}`,
          title,
          message,
          'transformation_job',
          jobDbId ? Number(jobDbId) : null,   // entity_id is INTEGER in notifications table
          '/jobs',
          JSON.stringify({ jobId, jobDbId, jobName, status, ...metadata })
        ]
      );
      systemLogger.info('JobNotificationService: notification row inserted', { userId, jobId, status });
    } catch (notifErr) {
      systemLogger.warn('JobNotificationService: notification insert failed', { jobId, error: notifErr.message });
    }

    // ── 2. Alert policy emails ────────────────────────────────────────────────
    try {
      // Match alert_policies the same way AlertAggregationWorker does:
      // entity_id must equal the specific job ID, the wildcard '*', or be NULL (global).
      // This prevents unrelated job policies from firing for this job.
      const policies = await pool.query(
        `SELECT ap.id, ap.trigger_type,
                sc.connection_id AS sc_connection_id,
                sc.type AS conn_type,
                sc.config AS conn_config,
                sc.name AS conn_name,
                sc.status AS conn_status
         FROM alert_policies ap
         JOIN storage_connections sc ON sc.id = ap.email_connection_id
         WHERE ap.enabled = true
           AND ap.entity_type = 'job'
           AND (ap.entity_id = $1 OR ap.entity_id = '*' OR ap.entity_id IS NULL)
           AND ap.email_connection_id IS NOT NULL
           AND sc.status = 'active'`,
        [String(jobId)]
      );

      for (const p of policies.rows) {
        if (!policyMatchesStatus(p.trigger_type, status)) continue;
        try {
          const recipientsRes = await pool.query(
            `SELECT recipient_email
             FROM alert_policy_recipients
             WHERE policy_id = $1
               AND (
                 (notify_on_success = true AND $2 = true)
                 OR (notify_on_failure = true AND $3 = true)
               )`,
            [
              p.id,
              status === 'completed' || status === 'completed_with_warnings',
              status === 'failed' || status === 'cancelled'
            ]
          );
          const recipients = recipientsRes.rows.map(r => r.recipient_email).filter(Boolean);
          if (!recipients.length) continue;

          // Build a minimal connRow compatible with _send()
          const connRow = {
            status: p.conn_status,
            connection_id: p.sc_connection_id,
            type: p.conn_type,
            name: p.conn_name,
            config: p.conn_config
          };
          await _send(connRow, recipients, title, html, message, { jobId, policyId: p.id });
        } catch (pErr) {
          systemLogger.warn('JobNotificationService: policy email failed', {
            jobId, policyId: p.id, error: pErr.message
          });
        }
      }
    } catch (policyErr) {
      systemLogger.warn('JobNotificationService: policy query failed', { jobId, error: policyErr.message });
    }

    // ── 3. VM canvas emailNotification nodes ─────────────────────────────────
    if (visualMappingId) {
      try {
        const vmRes = await pool.query(
          'SELECT graph_data FROM visual_mapping_defs WHERE id = $1',
          [visualMappingId]
        );
        if (vmRes.rows.length > 0) {
          const graphData = typeof vmRes.rows[0].graph_data === 'string'
            ? JSON.parse(vmRes.rows[0].graph_data)
            : vmRes.rows[0].graph_data;

          const emailNodes = (graphData?.nodes || []).filter(n => n.type === 'emailNotification');
          for (const emailNode of emailNodes) {
            const cfg = emailNode.data?.config || {};
            if (!cfg.emailConnectionId) continue;

            const isSuccess = status === 'completed' || status === 'completed_with_warnings';
            if (isSuccess && cfg.notifyOnSuccess === false) continue;
            if (!isSuccess && cfg.notifyOnFailure === false) continue;

            const recipients = (cfg.recipients || '')
              .split(/[,;\s]+/)
              .map(e => e.trim())
              .filter(e => e.includes('@'));
            if (!recipients.length) continue;

            const subject = (cfg.subject || title)
              .replace('{status}', statusLabel(status))
              .replace('{jobName}', jobName || '');

            try {
              // cfg.emailConnectionId is the string connection_id stored in node config
              const connFull = await ConnectionService.getConnectionById(cfg.emailConnectionId);
              await _send(connFull, recipients, subject, html, message, { jobId, vmNodeId: emailNode.id });
            } catch (vmConnErr) {
              systemLogger.warn('JobNotificationService: VM email node connection load failed', {
                jobId, vmNodeId: emailNode.id, error: vmConnErr.message
              });
            }
          }
        }
      } catch (vmErr) {
        systemLogger.warn('JobNotificationService: VM email node processing failed', {
          jobId, visualMappingId, error: vmErr.message
        });
      }
    }

  } catch (outerErr) {
    // Belt-and-suspenders: job result must never be affected
    systemLogger.warn('JobNotificationService: unexpected outer error', { jobId, error: outerErr.message });
  }
}

module.exports = { fireJobNotification };
