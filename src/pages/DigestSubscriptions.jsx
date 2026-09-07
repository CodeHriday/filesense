import React, { useState, useEffect, useCallback } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiSend, FiMail, FiClock,
  FiCheckCircle, FiAlertCircle, FiRefreshCw, FiX, FiChevronDown
} from 'react-icons/fi';
import './DigestSubscriptions.css';

const API = '/api/digest-subscriptions';
const EMAIL_API = '/api/email-connections';

const FREQUENCY_OPTIONS = [
  { value: 'hourly',  label: 'Hourly' },
  { value: 'daily',   label: 'Every 24 hours' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const CATEGORY_OPTIONS = [
  { value: 'all',               label: 'All Activity', description: 'Every category below' },
  { value: 'files_processed',   label: 'Files Processed', description: 'Jobs completed or failed' },
  { value: 'job_failures',      label: 'Job Failures', description: 'Failed transformation jobs' },
  { value: 'dq_violations',     label: 'DQ Violations', description: 'Data quality rule violations' },
  { value: 'schema_drift',      label: 'Schema Drift', description: 'Detected schema changes' },
  { value: 'profiling_failures', label: 'Profiling Failures', description: 'Files that failed profiling' },
  { value: 'data_contracts',    label: 'Data Contracts', description: 'Vendor agreements signed or pending' },
];

const EMPTY_FORM = {
  name: '',
  frequency: 'daily',
  categories: ['all'],
  recipients: '',
  email_connection_id: '',
  send_if_empty: false,
  is_active: true,
};

function statusIcon(status) {
  if (status === 'sent')    return <FiCheckCircle style={{ color: '#16a34a' }} />;
  if (status === 'failed')  return <FiAlertCircle style={{ color: '#dc2626' }} />;
  if (status === 'skipped') return <FiClock style={{ color: '#d97706' }} />;
  return null;
}

function relativeTime(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function nextSendLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = d - Date.now();
  if (diff < 0) return 'Due now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

export default function DigestSubscriptions() {
  const [subscriptions, setSubscriptions]   = useState([]);
  const [emailConnections, setEmailConnections] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [editingId, setEditingId]           = useState(null);
  const [form, setForm]                     = useState(EMPTY_FORM);
  const [saving, setSaving]                 = useState(false);
  const [testingId, setTestingId]           = useState(null);
  const [deletingId, setDeletingId]         = useState(null);
  const [toast, setToast]                   = useState(null);
  const [historyMap, setHistoryMap]         = useState({});
  const [expandedId, setExpandedId]         = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSubscriptions = useCallback(async () => {
    try {
      const r = await fetch(API, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) throw new Error('Failed to fetch');
      const data = await r.json();
      setSubscriptions(data.subscriptions || []);
    } catch {
      showToast('Failed to load digest subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmailConnections = useCallback(async () => {
    try {
      const r = await fetch(EMAIL_API, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!r.ok) return;
      const data = await r.json();
      setEmailConnections(data.connections || data || []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
    fetchEmailConnections();
  }, [fetchSubscriptions, fetchEmailConnections]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(sub) {
    setForm({
      name: sub.name || '',
      frequency: sub.frequency || 'daily',
      categories: Array.isArray(sub.categories) ? sub.categories : ['all'],
      recipients: Array.isArray(sub.recipients) ? sub.recipients.join(', ') : '',
      email_connection_id: sub.email_connection_id || '',
      send_if_empty: sub.send_if_empty || false,
      is_active: sub.is_active !== false,
    });
    setEditingId(sub.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function toggleCategory(val) {
    setForm(f => {
      let cats = [...f.categories];
      if (val === 'all') return { ...f, categories: ['all'] };
      // Remove 'all' when picking specific
      cats = cats.filter(c => c !== 'all');
      cats.includes(val) ? (cats = cats.filter(c => c !== val)) : cats.push(val);
      return { ...f, categories: cats.length ? cats : ['all'] };
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const recipients = form.recipients.split(',').map(s => s.trim()).filter(Boolean);
      const body = {
        name: form.name || 'My Digest',
        frequency: form.frequency,
        categories: form.categories,
        recipients,
        email_connection_id: form.email_connection_id || null,
        send_if_empty: form.send_if_empty,
        is_active: form.is_active,
      };

      const url  = editingId ? `${API}/${editingId}` : API;
      const method = editingId ? 'PUT' : 'POST';

      const r = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Save failed');
      showToast(editingId ? 'Subscription updated' : 'Subscription created');
      closeForm();
      fetchSubscriptions();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this digest subscription?')) return;
    setDeletingId(id);
    try {
      const r = await fetch(`${API}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!r.ok) throw new Error('Delete failed');
      showToast('Subscription deleted');
      setSubscriptions(s => s.filter(x => x.id !== id));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSendTest(id) {
    setTestingId(id);
    try {
      const r = await fetch(`${API}/${id}/send-test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data.error || 'Send failed');
      showToast('Test digest sent successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to send test digest', 'error');
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggleActive(sub) {
    try {
      const r = await fetch(`${API}/${sub.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ is_active: !sub.is_active }),
      });
      if (!r.ok) throw new Error('Update failed');
      fetchSubscriptions();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function loadHistory(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (historyMap[id]) return;
    try {
      const r = await fetch(`${API}/${id}/history`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await r.json();
      setHistoryMap(m => ({ ...m, [id]: data.history || [] }));
    } catch { /* silent */ }
  }

  return (
    <div className="digest-page">
      {/* Toast */}
      {toast && (
        <div className={`digest-toast digest-toast--${toast.type}`}>
          {toast.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="digest-header">
        <div>
          <h1 className="digest-title"><FiMail /> Digest Subscriptions</h1>
          <p className="digest-subtitle">
            Subscribe to periodic email summaries of platform-wide activity — file jobs, data quality events, schema drift, and more.
            Requires admin access.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <FiPlus /> New Subscription
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="digest-modal-overlay">
          <div className="digest-modal">
            <div className="digest-modal-header">
              <h2>{editingId ? 'Edit Subscription' : 'New Digest Subscription'}</h2>
              <button className="btn-icon" onClick={closeForm}><FiX /></button>
            </div>

            <form className="digest-form" onSubmit={handleSave}>
              {/* Name */}
              <div className="form-group">
                <label>Subscription Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Daily Ops Summary"
                  maxLength={100}
                />
              </div>

              {/* Frequency */}
              <div className="form-group">
                <label>Frequency *</label>
                <div className="freq-grid">
                  {FREQUENCY_OPTIONS.map(opt => (
                    <label key={opt.value} className={`freq-card ${form.frequency === opt.value ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="frequency"
                        value={opt.value}
                        checked={form.frequency === opt.value}
                        onChange={() => setForm(f => ({ ...f, frequency: opt.value }))}
                      />
                      <FiClock />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div className="form-group">
                <label>Categories *</label>
                <div className="category-grid">
                  {CATEGORY_OPTIONS.map(opt => (
                    <label key={opt.value} className={`category-card ${form.categories.includes(opt.value) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.categories.includes(opt.value)}
                        onChange={() => toggleCategory(opt.value)}
                      />
                      <span className="cat-label">{opt.label}</span>
                      <span className="cat-desc">{opt.description}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Recipients */}
              <div className="form-group">
                <label>Recipients * <span className="hint">(comma-separated emails)</span></label>
                <textarea
                  value={form.recipients}
                  onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))}
                  placeholder="alice@example.com, bob@example.com"
                  rows={2}
                />
              </div>

              {/* Email connection */}
              <div className="form-group">
                <label>Email Provider</label>
                <select
                  value={form.email_connection_id}
                  onChange={e => setForm(f => ({ ...f, email_connection_id: e.target.value }))}
                >
                  <option value="">— select a configured email provider —</option>
                  {emailConnections.map(c => (
                    <option key={c.connection_id || c.id} value={c.connection_id || c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                {emailConnections.length === 0 && (
                  <p className="hint-warning">No email providers configured. Add one in Email Providers settings.</p>
                )}
              </div>

              {/* Options */}
              <div className="form-row">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={form.send_if_empty}
                    onChange={e => setForm(f => ({ ...f, send_if_empty: e.target.checked }))}
                  />
                  Send digest even when there is no activity
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  />
                  Active
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <FiRefreshCw className="spinning" /> : null}
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription list */}
      {loading ? (
        <div className="digest-empty"><FiRefreshCw className="spinning" /> Loading…</div>
      ) : subscriptions.length === 0 ? (
        <div className="digest-empty">
          <FiMail size={40} />
          <p>No digest subscriptions yet.</p>
          <button className="btn-primary" onClick={openCreate}><FiPlus /> Create your first digest</button>
        </div>
      ) : (
        <div className="digest-list">
          {subscriptions.map(sub => (
            <div key={sub.id} className={`digest-card ${!sub.is_active ? 'digest-card--inactive' : ''}`}>
              <div className="digest-card-top">
                <div className="digest-card-info">
                  <span className="digest-card-name">{sub.name}</span>
                  <div className="digest-card-meta">
                    <span className="badge badge--freq">
                      <FiClock /> {FREQUENCY_OPTIONS.find(f => f.value === sub.frequency)?.label || sub.frequency}
                    </span>
                    <span className="badge badge--cats">
                      {Array.isArray(sub.categories) && sub.categories.includes('all')
                        ? 'All categories'
                        : (sub.categories || []).map(c => CATEGORY_OPTIONS.find(o => o.value === c)?.label || c).join(', ')
                      }
                    </span>
                    {sub.connection_name && (
                      <span className="badge badge--provider"><FiMail /> {sub.connection_name}</span>
                    )}
                  </div>
                  <div className="digest-card-times">
                    <span>Last sent: {relativeTime(sub.last_sent_at)}</span>
                    <span>Next: {nextSendLabel(sub.next_send_at)}</span>
                    {sub.last_digest && (
                      <span className="last-status">
                        {statusIcon(sub.last_digest.status)} {sub.last_digest.status}
                      </span>
                    )}
                  </div>
                </div>

                <div className="digest-card-actions">
                  <label className="active-toggle" title={sub.is_active ? 'Active — click to pause' : 'Paused — click to activate'}>
                    <input type="checkbox" checked={sub.is_active} onChange={() => handleToggleActive(sub)} />
                    <span className="toggle-track" />
                  </label>

                  <button
                    className="btn-icon"
                    title="Send test digest now"
                    onClick={() => handleSendTest(sub.id)}
                    disabled={testingId === sub.id}
                  >
                    {testingId === sub.id ? <FiRefreshCw className="spinning" /> : <FiSend />}
                  </button>

                  <button className="btn-icon" title="Edit" onClick={() => openEdit(sub)}>
                    <FiEdit2 />
                  </button>

                  <button
                    className="btn-icon btn-icon--danger"
                    title="Delete"
                    onClick={() => handleDelete(sub.id)}
                    disabled={deletingId === sub.id}
                  >
                    {deletingId === sub.id ? <FiRefreshCw className="spinning" /> : <FiTrash2 />}
                  </button>

                  <button
                    className="btn-icon"
                    title="Send history"
                    onClick={() => loadHistory(sub.id)}
                  >
                    <FiChevronDown style={{ transform: expandedId === sub.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                </div>
              </div>

              {/* History panel */}
              {expandedId === sub.id && (
                <div className="digest-history">
                  <h4>Send History</h4>
                  {!historyMap[sub.id] ? (
                    <p className="hint">Loading…</p>
                  ) : historyMap[sub.id].length === 0 ? (
                    <p className="hint">No sends recorded yet.</p>
                  ) : (
                    <table className="history-table">
                      <thead>
                        <tr><th>Sent At</th><th>Status</th><th>Recipients</th><th>Note</th></tr>
                      </thead>
                      <tbody>
                        {historyMap[sub.id].map(h => (
                          <tr key={h.id}>
                            <td>{new Date(h.sent_at).toLocaleString()}</td>
                            <td><span className={`status-pill status-pill--${h.status}`}>{statusIcon(h.status)} {h.status}</span></td>
                            <td>{h.recipient_count}</td>
                            <td>{h.error_message || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
