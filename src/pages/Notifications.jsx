import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiBell, FiCheck, FiTrash2, FiMail,
  FiAlertCircle, FiCheckCircle, FiAlertTriangle,
  FiFileText, FiLink, FiSettings,
} from 'react-icons/fi';
import './Notifications.css';

// ── Category definitions ────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',        label: 'All' },
  { key: 'unread',     label: 'Unread' },
  { key: 'job_runs',   label: 'Job Runs' },
  { key: 'governance', label: 'Governance' },
  { key: 'workflow',   label: 'Workflow Events' },
];

function getCategory(type = '') {
  if (type.startsWith('job_run_')) return 'job_runs';
  if (type.startsWith('vendor_contract_')) return 'governance';
  if (type.startsWith('workflow_')) return 'workflow';
  return 'other';
}

// ── Strip leading emoji from stored titles ──────────────────────────────────
// Notification titles in the DB may carry a leading emoji prefix (e.g. "❌ Job Failed:…").
// We render a separate SVG icon per type, so strip the emoji here to avoid duplication.
const LEADING_EMOJI_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u;
function stripLeadingEmoji(text = '') {
  return text.replace(LEADING_EMOJI_RE, '').trim();
}

// ── SVG icon per notification type ─────────────────────────────────────────
function NotificationIcon({ type }) {
  if (type === 'job_run_completed_with_warnings') {
    return <FiAlertTriangle className="notif-icon notif-icon-warning" />;
  }
  if (type === 'job_run_completed') {
    return <FiCheckCircle className="notif-icon notif-icon-success" />;
  }
  if (type === 'job_run_failed' || type === 'job_run_aborted') {
    return <FiAlertCircle className="notif-icon notif-icon-error" />;
  }
  if (type?.startsWith('job_run_')) {
    return <FiSettings className="notif-icon notif-icon-neutral" />;
  }
  if (type?.startsWith('workflow_')) {
    return <FiLink className="notif-icon notif-icon-neutral" />;
  }
  if (type?.includes('approved')) {
    return <FiCheckCircle className="notif-icon notif-icon-success" />;
  }
  if (type?.includes('rejected')) {
    return <FiAlertCircle className="notif-icon notif-icon-error" />;
  }
  if (type?.startsWith('vendor_contract_')) {
    return <FiFileText className="notif-icon notif-icon-neutral" />;
  }
  return <FiBell className="notif-icon notif-icon-default" />;
}

// ── Colour-coded status badge ───────────────────────────────────────────────
function JobStatusBadge({ type }) {
  if (!type?.startsWith('job_run_')) return null;
  if (type === 'job_run_completed') {
    return <span className="notif-status-badge notif-status-success">Completed</span>;
  }
  if (type === 'job_run_completed_with_warnings') {
    return <span className="notif-status-badge notif-status-warning">Completed with warnings</span>;
  }
  if (type === 'job_run_failed') {
    return <span className="notif-status-badge notif-status-error">Failed</span>;
  }
  if (type === 'job_run_aborted') {
    return <span className="notif-status-badge notif-status-error">Aborted</span>;
  }
  return null;
}

// ── Rich card sub-renderers ─────────────────────────────────────────────────
function parseMeta(notification) {
  if (!notification.metadata) return {};
  try {
    return typeof notification.metadata === 'string'
      ? JSON.parse(notification.metadata)
      : notification.metadata;
  } catch {
    return {};
  }
}

function JobRunCard({ notification }) {
  const meta = parseMeta(notification);
  const stats = [];
  if (meta.jobName)                  stats.push({ label: 'Job',          value: meta.jobName });
  if (meta.mappingName)              stats.push({ label: 'Mapping',       value: meta.mappingName });
  if (meta.filesProcessed != null)   stats.push({ label: 'Files',         value: meta.filesProcessed });
  if (meta.recordsProcessed != null) stats.push({ label: 'Records',       value: meta.recordsProcessed.toLocaleString() });
  if (meta.rowsWritten != null)      stats.push({ label: 'Rows written',  value: meta.rowsWritten.toLocaleString() });
  if (meta.qualityScore != null)     stats.push({ label: 'Quality score', value: `${meta.qualityScore}%` });
  if (meta.dqViolationCount > 0)     stats.push({ label: 'DQ violations', value: meta.dqViolationCount, highlight: 'warn' });

  const topRules = Array.isArray(meta.violatedRuleNames) ? meta.violatedRuleNames.slice(0, 3) : [];
  if (!stats.length && !topRules.length) return null;

  return (
    <div className="notif-rich-card">
      {stats.length > 0 && (
        <div className="notif-card-stats">
          {stats.map(({ label, value, highlight }) => (
            <span key={label} className={`notif-stat${highlight ? ` notif-stat-${highlight}` : ''}`}>
              <span className="notif-stat-label">{label}</span>
              <span className="notif-stat-value">{value}</span>
            </span>
          ))}
        </div>
      )}
      {topRules.length > 0 && (
        <div className="notif-violated-rules">
          <span className="notif-violated-rules-label">Violated rules:</span>
          {topRules.map(r => (
            <span key={r} className="notif-rule-pill">{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowEventCard({ notification }) {
  const meta = parseMeta(notification);
  const type = notification.notification_type;

  if (type === 'workflow_jira_ticket' && meta.issueKey) {
    return (
      <div className="notif-rich-card notif-card-workflow">
        <span className="notif-workflow-detail">
          <span className="notif-stat-label">Jira issue</span>
          <span className="notif-workflow-value notif-jira-key">{meta.issueKey}</span>
        </span>
        {meta.issueUrl && (
          <a
            href={meta.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="notif-external-link"
            onClick={e => e.stopPropagation()}
          >
            Open in Jira ↗
          </a>
        )}
      </div>
    );
  }

  if (type === 'workflow_email_sent') {
    const recipients = Array.isArray(meta.recipients)
      ? meta.recipients.join(', ')
      : (meta.recipients || '');
    return (
      <div className="notif-rich-card notif-card-workflow">
        {recipients && (
          <span className="notif-workflow-detail">
            <span className="notif-stat-label">To</span>
            <span className="notif-workflow-value">{recipients}</span>
          </span>
        )}
        {meta.sendStatus && (
          <span className={`notif-status-badge ${meta.sendStatus === 'sent' ? 'notif-status-success' : 'notif-status-warning'}`}>
            {meta.sendStatus}
          </span>
        )}
      </div>
    );
  }

  const pairs = Object.entries(meta).filter(([k]) =>
    ['nodeType', 'workflowId', 'workflowName', 'result'].includes(k)
  );
  if (!pairs.length) return null;
  return (
    <div className="notif-rich-card notif-card-workflow">
      <div className="notif-card-stats">
        {pairs.map(([k, v]) => (
          <span key={k} className="notif-stat">
            <span className="notif-stat-label">{k}</span>
            <span className="notif-stat-value">{String(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Timestamp helper ────────────────────────────────────────────────────────
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// ── Main page ───────────────────────────────────────────────────────────────
function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (category === 'unread') params.unread_only = 'true';
      else if (category !== 'all') params.category = category;
      const response = await axios.get('/api/notifications', { params });
      setNotifications(response.data.notifications || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
      setTimeout(() => setError(''), 3000);
    }
  };

  const markAsUnread = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/unread`);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: false } : n)
      );
    } catch (err) {
      console.error('Error marking notification as unread:', err);
      setError('Failed to mark notification as unread');
      setTimeout(() => setError(''), 3000);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!window.confirm('Are you sure you want to delete this notification?')) return;
    try {
      await axios.delete(`/api/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      console.error('Error deleting notification:', err);
      setError('Failed to delete notification');
      setTimeout(() => setError(''), 3000);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      setError('Failed to mark all notifications as read');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) await markAsRead(notification.id);
    if (notification.action_url) navigate(notification.action_url);
  };

  const counts = {
    all:        notifications.length,
    unread:     notifications.filter(n => !n.is_read).length,
    job_runs:   notifications.filter(n => getCategory(n.notification_type) === 'job_runs').length,
    governance: notifications.filter(n => getCategory(n.notification_type) === 'governance').length,
    workflow:   notifications.filter(n => getCategory(n.notification_type) === 'workflow').length,
  };

  if (loading) {
    return (
      <div className="notifications-page">
        <div className="notifications-header">
          <div className="notif-header-left">
            <FiBell className="notif-page-icon" />
            <h1 className="notifications-title">Notifications</h1>
          </div>
        </div>
        <div className="notif-loading">Loading notifications…</div>
      </div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <div className="notif-header-left">
          <FiBell className="notif-page-icon" />
          <h1 className="notifications-title">Notifications</h1>
          {counts.unread > 0 && (
            <span className="notif-unread-badge">{counts.unread}</span>
          )}
        </div>
        <button
          className="notif-mark-all-btn"
          onClick={markAllAsRead}
          disabled={counts.unread === 0}
        >
          <FiCheck />
          Mark all as read
        </button>
      </div>

      {error && <div className="notif-error-banner">{error}</div>}

      {/* Category filter tabs */}
      <div className="notifications-filters">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`notif-filter-tab${category === cat.key ? ' active' : ''}`}
            onClick={() => setCategory(cat.key)}
          >
            {cat.label}
            {counts[cat.key] != null && (
              <span className={`notif-tab-count${cat.key === 'unread' && counts.unread > 0 ? ' notif-tab-count-unread' : ''}`}>
                {counts[cat.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="notif-empty-state">
            <FiBell className="notif-empty-icon" />
            <p>No {category !== 'all' ? CATEGORIES.find(c => c.key === category)?.label.toLowerCase() : ''} notifications</p>
          </div>
        ) : (
          notifications.map(notification => {
            const type = notification.notification_type;
            const isJobRun  = type?.startsWith('job_run_');
            const isWorkflow = type?.startsWith('workflow_');
            const displayTitle = stripLeadingEmoji(notification.title);

            return (
              <div
                key={notification.id}
                className={[
                  'notification-item',
                  !notification.is_read ? 'unread' : '',
                  isJobRun   ? 'notif-job'      : '',
                  isWorkflow ? 'notif-workflow'  : '',
                ].filter(Boolean).join(' ')}
              >
                <div
                  className="notification-content-wrapper"
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Single SVG icon — no emoji */}
                  <div className="notification-icon-col">
                    <NotificationIcon type={type} />
                  </div>

                  <div className="notification-details">
                    <div className="notification-title-row">
                      <span className="notification-title-text">{displayTitle}</span>
                      {isJobRun && <JobStatusBadge type={type} />}
                      {!notification.is_read && <span className="notif-unread-dot" />}
                    </div>
                    <div className="notification-message">{notification.message}</div>

                    {isJobRun   && <JobRunCard notification={notification} />}
                    {isWorkflow && <WorkflowEventCard notification={notification} />}

                    <div className="notification-timestamp">
                      {formatTimestamp(notification.created_at)}
                    </div>
                  </div>
                </div>

                <div className="notification-actions">
                  {!notification.is_read ? (
                    <button
                      className="notif-action-btn"
                      onClick={e => { e.stopPropagation(); markAsRead(notification.id); }}
                      title="Mark as read"
                    >
                      <FiCheck />
                    </button>
                  ) : (
                    <button
                      className="notif-action-btn"
                      onClick={e => { e.stopPropagation(); markAsUnread(notification.id); }}
                      title="Mark as unread"
                    >
                      <FiMail />
                    </button>
                  )}
                  <button
                    className="notif-action-btn notif-action-delete"
                    onClick={e => { e.stopPropagation(); deleteNotification(notification.id); }}
                    title="Delete"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Notifications;
