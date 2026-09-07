/**
 * Digest Service
 *
 * Manages scheduled activity digest emails:
 *  - Gathers per-category counts from operational tables for a time window
 *  - Renders an HTML summary email
 *  - Sends via the configured email provider (direct sendWithProvider path)
 *  - Writes audit rows to email_digests
 *  - processDigests() is called by schedulerWorker on each tick
 */

const pool = require('../db');
const { systemLogger } = require('../utils/logger');
const NotificationService = require('./NotificationService');
const ConnectionService = require('./ConnectionService');
const EmailProviderFactory = require('./email/EmailProviderFactory');

const notificationService = new NotificationService();

/**
 * Load an email provider using the correct storage_connections schema
 * (connection_id / status columns — NOT id / is_active).
 * Mirrors the pattern in emailConnectionRoutes.js lines 273-304.
 */
async function loadEmailProvider(connectionId) {
  const connection = await ConnectionService.getConnectionById(connectionId);
  if (!connection) {
    throw new Error(`Email connection '${connectionId}' not found`);
  }
  if (connection.status !== 'active') {
    throw new Error(`Email connection '${connectionId}' is not active (status: ${connection.status})`);
  }

  const rawConfig = typeof connection.config === 'string'
    ? JSON.parse(connection.config)
    : connection.config;

  const decryptedConfig = notificationService.connectionService.decryptSensitiveFields(
    connection.type,
    rawConfig
  );

  return {
    id: connection.connection_id,
    type: connection.type,
    name: connection.name,
    config: decryptedConfig,
  };
}

// ─── Frequency helpers ────────────────────────────────────────────────────────

/**
 * Return the window { start, end } that the digest covers.
 * "end" is always now; "start" is now − frequency.
 */
function computeWindow(frequency) {
  const end = new Date();
  const start = new Date(end);
  switch (frequency) {
    case 'hourly':  start.setHours(start.getHours() - 1); break;
    case 'daily':   start.setDate(start.getDate() - 1); break;
    case 'weekly':  start.setDate(start.getDate() - 7); break;
    case 'monthly': start.setMonth(start.getMonth() - 1); break;
    default:        start.setDate(start.getDate() - 1);
  }
  return { start, end };
}

/**
 * Compute the next send timestamp from the current time.
 */
function computeNextSendAt(frequency, from = new Date()) {
  const next = new Date(from);
  switch (frequency) {
    case 'hourly':  next.setHours(next.getHours() + 1); break;
    case 'daily':   next.setDate(next.getDate() + 1); break;
    case 'weekly':  next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    default:        next.setDate(next.getDate() + 1);
  }
  return next;
}

// ─── Summary query ────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'files_processed',
  'job_failures',
  'dq_violations',
  'schema_drift',
  'profiling_failures',
  'data_contracts',
];

/**
 * Query all requested metric categories for the given time window.
 * Returns a structured summary object.
 */
async function gatherSummary(subscription, window) {
  const { start, end } = window;
  const rawCategories = subscription.categories || ['all'];
  const categories = rawCategories.includes('all') ? ALL_CATEGORIES : rawCategories;

  const summary = {
    period: { start: start.toISOString(), end: end.toISOString() },
    frequency: subscription.frequency,
    categories: {},
    hasActivity: false,
  };

  const tasks = [];

  if (categories.includes('files_processed')) {
    tasks.push(
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
           COUNT(*) AS total
         FROM transformation_jobs
         WHERE created_at >= $1 AND created_at < $2`,
        [start, end]
      ).then(r => {
        const row = r.rows[0];
        summary.categories.files_processed = {
          label: 'Files Processed',
          total: parseInt(row.total) || 0,
          completed: parseInt(row.completed) || 0,
          failed: parseInt(row.failed) || 0,
        };
      })
    );
  }

  if (categories.includes('job_failures')) {
    tasks.push(
      pool.query(
        `SELECT COUNT(*) AS count
         FROM transformation_jobs
         WHERE status IN ('failed', 'error') AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ).then(r => {
        summary.categories.job_failures = {
          label: 'Job Failures',
          count: parseInt(r.rows[0].count) || 0,
        };
      })
    );
  }

  if (categories.includes('dq_violations')) {
    tasks.push(
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'open') AS open,
           COUNT(*) FILTER (WHERE status = 'resolved') AS resolved
         FROM quality_rule_violations
         WHERE created_at >= $1 AND created_at < $2`,
        [start, end]
      ).then(r => {
        const row = r.rows[0];
        summary.categories.dq_violations = {
          label: 'Data Quality Violations',
          total: parseInt(row.total) || 0,
          open: parseInt(row.open) || 0,
          resolved: parseInt(row.resolved) || 0,
        };
      }).catch(() => {
        // Table may not exist in all environments
        summary.categories.dq_violations = { label: 'Data Quality Violations', total: 0, open: 0, resolved: 0 };
      })
    );
  }

  if (categories.includes('schema_drift')) {
    tasks.push(
      pool.query(
        `SELECT COUNT(*) AS count
         FROM anomalies
         WHERE anomaly_type ILIKE '%schema%' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ).then(r => {
        summary.categories.schema_drift = {
          label: 'Schema Drift Events',
          count: parseInt(r.rows[0].count) || 0,
        };
      }).catch(() => {
        summary.categories.schema_drift = { label: 'Schema Drift Events', count: 0 };
      })
    );
  }

  if (categories.includes('profiling_failures')) {
    tasks.push(
      pool.query(
        `SELECT COUNT(*) AS count
         FROM files
         WHERE processing_step = 'failed' AND updated_at >= $1 AND updated_at < $2`,
        [start, end]
      ).then(r => {
        summary.categories.profiling_failures = {
          label: 'Profiling Failures',
          count: parseInt(r.rows[0].count) || 0,
        };
      }).catch(() => {
        summary.categories.profiling_failures = { label: 'Profiling Failures', count: 0 };
      })
    );
  }

  if (categories.includes('data_contracts')) {
    tasks.push(
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'active') AS signed,
           COUNT(*) FILTER (WHERE status = 'pending') AS pending
         FROM vendor_agreements
         WHERE created_at >= $1 AND created_at < $2`,
        [start, end]
      ).then(r => {
        const row = r.rows[0];
        summary.categories.data_contracts = {
          label: 'Data Contracts',
          total: parseInt(row.total) || 0,
          signed: parseInt(row.signed) || 0,
          pending: parseInt(row.pending) || 0,
        };
      }).catch(() => {
        summary.categories.data_contracts = { label: 'Data Contracts', total: 0, signed: 0, pending: 0 };
      })
    );
  }

  await Promise.allSettled(tasks);

  // Determine if any category has non-zero activity
  summary.hasActivity = Object.values(summary.categories).some(cat => {
    return Object.entries(cat)
      .filter(([k]) => k !== 'label')
      .some(([, v]) => typeof v === 'number' && v > 0);
  });

  return summary;
}

// ─── HTML email template ──────────────────────────────────────────────────────

function frequencyLabel(f) {
  return { hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[f] || f;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

function trend(value, good = 'low') {
  if (value === 0) return '<span style="color:#16a34a;">✓ None</span>';
  if (good === 'high') return `<span style="color:#16a34a;">↑ ${value}</span>`;
  return `<span style="color:#dc2626;">↑ ${value}</span>`;
}

function renderCategory(cat) {
  const rows = [];

  if (cat.total !== undefined && cat.completed !== undefined) {
    // files_processed style
    rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Total</td><td style="padding:4px 8px;font-weight:600;">${cat.total}</td></tr>`);
    rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Completed</td><td style="padding:4px 8px;">${trend(cat.completed, 'high')}</td></tr>`);
    rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Failed</td><td style="padding:4px 8px;">${trend(cat.failed)}</td></tr>`);
  } else if (cat.total !== undefined && cat.open !== undefined) {
    // dq_violations / data_contracts style
    rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Total</td><td style="padding:4px 8px;font-weight:600;">${cat.total}</td></tr>`);
    if (cat.open !== undefined)     rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Open</td><td style="padding:4px 8px;">${trend(cat.open)}</td></tr>`);
    if (cat.resolved !== undefined) rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Resolved</td><td style="padding:4px 8px;">${trend(cat.resolved, 'high')}</td></tr>`);
    if (cat.signed !== undefined)   rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Signed</td><td style="padding:4px 8px;">${trend(cat.signed, 'high')}</td></tr>`);
    if (cat.pending !== undefined)  rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Pending</td><td style="padding:4px 8px;">${cat.pending}</td></tr>`);
  } else if (cat.count !== undefined) {
    // single count style
    const goodIfLow = !['files_processed'].includes(cat.label);
    rows.push(`<tr><td style="padding:4px 8px;color:#6b7280;">Count</td><td style="padding:4px 8px;">${trend(cat.count, goodIfLow ? 'low' : 'high')}</td></tr>`);
  }

  return `
    <div style="margin-bottom:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#1e40af;color:#fff;padding:10px 16px;font-weight:600;font-size:14px;">
        ${cat.label}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${rows.join('')}
      </table>
    </div>`;
}

function buildHtmlEmail(summary, subscriptionName, appUrl = '') {
  const categoryBlocks = Object.values(summary.categories).map(renderCategory).join('');
  const noActivityNote = !summary.hasActivity
    ? `<p style="color:#6b7280;font-style:italic;margin:16px 0;">No activity was recorded during this period.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Activity Digest</title></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#1e3a8a;padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">📊 Activity Digest</h1>
            <p style="margin:6px 0 0;color:#93c5fd;font-size:13px;">${subscriptionName}</p>
          </td>
        </tr>
        <!-- Period -->
        <tr>
          <td style="padding:20px 32px 8px;background:#eff6ff;border-bottom:1px solid #dbeafe;">
            <p style="margin:0;font-size:13px;color:#1e40af;">
              <strong>${frequencyLabel(summary.frequency)} Summary</strong> &nbsp;·&nbsp;
              ${formatDate(summary.period.start)} → ${formatDate(summary.period.end)}
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:24px 32px;">
            ${noActivityNote}
            ${categoryBlocks}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
            ${appUrl ? `<a href="${appUrl}" style="display:inline-block;padding:10px 24px;background:#1e40af;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View in App →</a>` : ''}
            <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">
              You are receiving this because you subscribed to digest notifications.<br>
              To unsubscribe, visit your Digest Subscriptions settings.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Send a single digest ─────────────────────────────────────────────────────

async function sendDigest(subscription) {
  const now = new Date();
  const window = computeWindow(subscription.frequency);
  const nextSendAt = computeNextSendAt(subscription.frequency, now);

  let status = 'failed';
  let errorMessage = null;
  let summary = null;
  let recipientCount = 0;

  try {
    summary = await gatherSummary(subscription, window);

    if (!summary.hasActivity && !subscription.send_if_empty) {
      // Skip — no activity and user doesn't want empty digests
      status = 'skipped';
      systemLogger.info('Digest skipped — no activity', { subscriptionId: subscription.id });
    } else {
      const recipients = Array.isArray(subscription.recipients) ? subscription.recipients : [];
      if (recipients.length === 0) {
        throw new Error('No recipients configured for digest subscription');
      }

      if (!subscription.email_connection_id) {
        throw new Error('No email connection configured for digest subscription');
      }

      const provider = await loadEmailProvider(subscription.email_connection_id);

      const html = buildHtmlEmail(summary, subscription.name || 'Activity Digest');
      const subject = `[${frequencyLabel(subscription.frequency)} Digest] Platform Activity Summary`;

      const sendResult = await notificationService.sendWithProvider(provider, {
        to: recipients,
        subject,
        html,
        text: `Activity Digest — ${frequencyLabel(subscription.frequency)} Summary\n\nPeriod: ${window.start.toISOString()} → ${window.end.toISOString()}\n\nOpen the app to view the full report.`,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Email send failed');
      }

      status = 'sent';
      recipientCount = recipients.length;
      systemLogger.info('Digest sent', { subscriptionId: subscription.id, recipients: recipients.length });
    }
  } catch (err) {
    errorMessage = err.message;
    systemLogger.error('Digest send error', { subscriptionId: subscription.id, error: err.message });
  }

  // Write audit row
  try {
    await pool.query(
      `INSERT INTO email_digests (subscription_id, sent_at, recipient_count, status, summary, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [subscription.id, now, recipientCount, status, summary ? JSON.stringify(summary) : null, errorMessage]
    );
  } catch (auditErr) {
    systemLogger.error('Failed to write email_digests audit row', { subscriptionId: subscription.id, error: auditErr.message });
  }

  // Always update next_send_at and last_sent_at regardless of success
  try {
    await pool.query(
      `UPDATE digest_subscriptions
       SET next_send_at = $1, last_sent_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextSendAt, now, subscription.id]
    );
  } catch (updateErr) {
    systemLogger.error('Failed to update digest next_send_at', { subscriptionId: subscription.id, error: updateErr.message });
  }

  return { status, errorMessage };
}

// ─── Main scheduler hook ──────────────────────────────────────────────────────

/**
 * Find all active subscriptions whose next_send_at is due and send them.
 * Called by schedulerWorker on each tick (alongside processDueSchedules).
 */
async function processDigests() {
  const now = new Date();

  let dueSubscriptions;
  try {
    const result = await pool.query(
      `SELECT * FROM digest_subscriptions
       WHERE is_active = true AND next_send_at <= $1
       ORDER BY next_send_at ASC`,
      [now]
    );
    dueSubscriptions = result.rows;
  } catch (err) {
    // Table may not exist yet (migration pending) — fail silently
    if (err.code === '42P01') return { processed: 0 };
    systemLogger.error('processDigests query error', { error: err.message });
    return { processed: 0, error: err.message };
  }

  if (dueSubscriptions.length === 0) {
    return { processed: 0 };
  }

  systemLogger.info('Processing due digests', { count: dueSubscriptions.length });

  let processed = 0;
  for (const sub of dueSubscriptions) {
    try {
      await sendDigest(sub);
      processed++;
    } catch (err) {
      systemLogger.error('Unhandled error processing digest', { subscriptionId: sub.id, error: err.message });
    }
  }

  return { processed };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  processDigests,
  sendDigest,
  gatherSummary,
  computeWindow,
  computeNextSendAt,
  buildHtmlEmail,
};
