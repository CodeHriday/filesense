import React, { useState, useEffect, useMemo } from 'react';
import {
  FiFilter, FiX, FiChevronDown, FiChevronUp, FiDownload,
  FiChevronRight, FiTrash2, FiSearch
} from 'react-icons/fi';
import { getProjects } from '../api/qualityRulesService';
import { bulkDeleteViolations } from '../api/errorReviewService';
import '../styles/global-page-styles.css';
import '../styles/ErrorReview.css';

const API_BASE = '/api/error-review';
const INNER_PAGE_SIZE = 25;

/* ── Date helpers ── */
const formatDateLabel = (dateStr) => {
  if (!dateStr) return 'Unknown Date';
  // dateStr is a YYYY-MM-DD string from DATE() in Postgres
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTimestamp = (ts) => {
  if (!ts) return null;
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const formatDateStr = (d) => d ? new Date(d).toLocaleString() : '-';

/* ── Key builders for expand Sets ── */
const spKey  = (proj, sp)       => `${proj}||${sp}`;
const dateKey = (proj, sp, dt)  => `${proj}||${sp}||${dt}`;

const ErrorReview = () => {
  const [activeTab, setActiveTab] = useState('file-upload');

  // Outer tier: list of file/job groups (summary with violation counts)
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 0 });

  // Inner tier: per-group violation rows, loaded lazily on expand
  const [groupViolations, setGroupViolations] = useState({});

  const [projects, setProjects] = useState([]);

  // Expansion state — four levels
  const [expandedProjects,    setExpandedProjects]    = useState(new Set());
  const [expandedSubProjects, setExpandedSubProjects] = useState(new Set());
  const [expandedDates,       setExpandedDates]       = useState(new Set());
  const [expandedGroups,      setExpandedGroups]      = useState(new Set());
  const [expandedRows,        setExpandedRows]        = useState(new Set());

  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleting,  setIsDeleting]  = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    project_id: '',
    rule_type:  'all',
    severity:   'all',
    status:     'all',
    search:     '',
    date_from:  '',
    date_to:    '',
    page:       1,
    limit:      10
  });

  useEffect(() => { fetchProjects(); }, []);

  // Re-fetch groups and clear all inner caches whenever tab or filters change
  useEffect(() => {
    fetchGroups();
    setSelectedIds([]);
    setGroupViolations({});
    setExpandedSubProjects(new Set());
    setExpandedDates(new Set());
    setExpandedGroups(new Set());
  }, [activeTab, filters]);

  const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}` });

  const fetchProjects = async () => {
    try { setProjects(await getProjects()); } catch { /* non-fatal */ }
  };

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = activeTab === 'file-upload'
        ? `${API_BASE}/file-upload-violations/groups`
        : `${API_BASE}/mapping-job-violations/groups`;

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'all' && v !== '') params.append(k, v);
      });

      const res = await fetch(`${endpoint}?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setGroups(data.groups || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 10, totalPages: 0 });
    } catch (err) {
      setError(`Failed to load violations: ${err.message}`);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupViolations = async (groupKey, page = 1, append = false) => {
    setGroupViolations(prev => ({
      ...prev,
      [groupKey]: { ...(prev[groupKey] || {}), loading: true }
    }));
    try {
      const isFileUpload = activeTab === 'file-upload';
      const endpoint = isFileUpload
        ? `${API_BASE}/file-upload-violations`
        : `${API_BASE}/mapping-job-violations`;

      const params = new URLSearchParams();
      params.append(isFileUpload ? 'file_id' : 'job_id', groupKey);
      params.append('page', page);
      params.append('limit', INNER_PAGE_SIZE);
      if (filters.rule_type && filters.rule_type !== 'all') params.append('rule_type', filters.rule_type);
      if (filters.severity && filters.severity !== 'all') params.append('severity', filters.severity);
      if (filters.status   && filters.status   !== 'all') params.append('status',   filters.status);
      if (filters.search) params.append('search', filters.search);

      const res = await fetch(`${endpoint}?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setGroupViolations(prev => {
        const existing = prev[groupKey] || {};
        return {
          ...prev,
          [groupKey]: {
            violations: append
              ? [...(existing.violations || []), ...(data.violations || [])]
              : (data.violations || []),
            loading: false,
            page:    data.pagination.page,
            hasMore: data.pagination.page < data.pagination.totalPages
          }
        };
      });
    } catch (err) {
      console.error('Error fetching group violations:', err);
      setGroupViolations(prev => ({
        ...prev,
        [groupKey]: { ...(prev[groupKey] || {}), loading: false, error: err.message }
      }));
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  // Page-level download (all results, respects active filters)
  const handleDownload = async (format) => {
    try {
      const endpoint = activeTab === 'file-upload'
        ? `${API_BASE}/file-upload-violations/download`
        : `${API_BASE}/mapping-job-violations/download`;
      const params = new URLSearchParams();
      params.append('format', format);
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'all' && v !== '' && k !== 'page' && k !== 'limit') params.append(k, v);
      });
      const res = await fetch(`${endpoint}?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      triggerDownload(await res.blob(), format === 'excel' ? `${activeTab}-violations.xlsx` : `${activeTab}-violations.csv`);
    } catch (err) { alert(`Download failed: ${err.message}`); }
  };

  // Per-group download (one file or job → Excel)
  const handleGroupDownload = async (group) => {
    try {
      const isFileUpload = activeTab === 'file-upload';
      const endpoint = isFileUpload
        ? `${API_BASE}/file-upload-violations/download`
        : `${API_BASE}/mapping-job-violations/download`;
      const params = new URLSearchParams();
      params.append('format', 'excel');
      params.append(isFileUpload ? 'file_id' : 'job_id', isFileUpload ? group.file_id : group.job_id);
      const rawLabel = isFileUpload ? group.filename : group.mapping_name;
      if (rawLabel) params.append('label', rawLabel.split('/').pop());

      const res = await fetch(`${endpoint}?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const rawName = (isFileUpload ? group.filename : group.mapping_name) || 'violations';
      const baseName = rawName.split('/').pop().replace(/[^\w.\-]/g, '_');
      triggerDownload(await res.blob(), `${baseName}-violations.xlsx`);
    } catch (err) { alert(`Download failed: ${err.message}`); }
  };

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  /* ── Toggle helpers ── */
  const toggle = (setter, key) => setter(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleGroupExpansion = (groupKey) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
        if (!groupViolations[groupKey]?.violations) {
          fetchGroupViolations(groupKey, 1, false);
        }
      }
      return next;
    });
  };

  const handleGroupSelectAll = (groupKey, checked) => {
    const ids = (groupViolations[groupKey]?.violations || []).map(v => v.id);
    if (checked) {
      setSelectedIds(prev => [...new Set([...prev, ...ids])]);
    } else {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    }
  };

  const handleSelectRow = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} violation(s)? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      const result = await bulkDeleteViolations(selectedIds);
      if (result.success) {
        alert(`Deleted ${result.deleted} violation record(s)`);
        setSelectedIds([]);
        setGroupViolations({});
        fetchGroups();
      }
    } catch (err) {
      alert(`Delete failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  /* ── Four-level nested grouping ──
     Result shape:
     {
       projectName: {
         violationTotal,
         subProjects: {
           subLabel: {
             violationTotal,
             dates: {
               dateKey: { violationTotal, groups: [...] }
             }
           }
         }
       }
     }
  */
  const groupedByProject = useMemo(() => {
    const isFileUpload = activeTab === 'file-upload';
    const result = {};

    groups.forEach(g => {
      const proj  = g.project_name    || 'Unknown Project';
      const sub   = g.sub_project_name || '—';
      const dt    = isFileUpload
        ? (g.upload_date  ? String(g.upload_date).slice(0, 10)  : 'unknown-date')
        : (g.job_date     ? String(g.job_date).slice(0, 10)     : 'unknown-date');
      const count = parseInt(g.violation_count, 10) || 0;

      if (!result[proj]) result[proj] = { violationTotal: 0, subProjects: {} };
      result[proj].violationTotal += count;

      if (!result[proj].subProjects[sub]) result[proj].subProjects[sub] = { violationTotal: 0, dates: {} };
      result[proj].subProjects[sub].violationTotal += count;

      if (!result[proj].subProjects[sub].dates[dt]) result[proj].subProjects[sub].dates[dt] = { violationTotal: 0, groups: [] };
      result[proj].subProjects[sub].dates[dt].violationTotal += count;
      result[proj].subProjects[sub].dates[dt].groups.push(g);
    });

    return result;
  }, [groups, activeTab]);

  /* ── Helpers ── */
  const getSeverityBadge = (severity) => {
    const cls = {
      critical: 'gps-badge-danger', high: 'gps-badge-warning',
      error: 'gps-badge-warning', warning: 'gps-badge-info', low: 'gps-badge-secondary'
    };
    return <span className={`gps-badge ${cls[severity] || 'gps-badge-secondary'}`}>{severity?.toUpperCase() || 'UNKNOWN'}</span>;
  };

  const getStatusBadge = (status) => {
    const cls = {
      new: 'gps-badge-info', reviewed: 'gps-badge-primary',
      acknowledged: 'gps-badge-warning', resolved: 'gps-badge-success'
    };
    return <span className={`gps-badge ${cls[status] || 'gps-badge-secondary'}`}>{status || 'new'}</span>;
  };

  const renderFullRecord = (snap) => {
    if (!snap || typeof snap !== 'object')
      return <div className="gps-text-muted" style={{ fontStyle: 'italic' }}>No record data available</div>;
    return (
      <div className="quality-violations-record-snapshot">
        <div className="quality-violations-record-header">Full Record Data:</div>
        <div className="quality-violations-record-content">
          {Object.entries(snap).map(([k, v]) => (
            <div key={k} className="quality-violations-record-field">
              <span className="quality-violations-record-field-key">{k}:</span>
              <span className="quality-violations-record-field-value">{v != null ? String(v) : 'null'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ── Inner violation table ── */
  const renderGroupTable = (groupKey, totalCount) => {
    const gv = groupViolations[groupKey];
    if (!gv) return null;

    const violations  = gv.violations || [];
    const isFileUpload = activeTab === 'file-upload';
    const groupIds    = violations.map(v => v.id);
    const allSelected = groupIds.length > 0 && groupIds.every(id => selectedIds.includes(id));
    const colSpan     = isFileUpload ? 11 : 13;

    return (
      <div className="gps-table-container qv-inner-table">
        {gv.loading && !violations.length ? (
          <div className="gps-empty-state" style={{ padding: '1rem 1.5rem' }}>Loading violations…</div>
        ) : !violations.length ? (
          <div className="gps-empty-state" style={{ padding: '1rem 1.5rem' }}>No violations match the current filters</div>
        ) : (
          <>
            <table className="gps-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={allSelected}
                      onChange={(e) => handleGroupSelectAll(groupKey, e.target.checked)}
                      title="Select all visible" />
                  </th>
                  <th style={{ width: 40 }}></th>
                  <th>Sub-Project</th>
                  {!isFileUpload && <th>Filename</th>}
                  <th>Rule</th>
                  <th>Column</th>
                  <th>Row #</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Severity</th>
                  <th>Created Date</th>
                  {!isFileUpload && <th>Executed By</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.map(v => (
                  <React.Fragment key={v.id}>
                    <tr className={selectedIds.includes(v.id) ? 'selected-row' : ''}>
                      <td>
                        <input type="checkbox" checked={selectedIds.includes(v.id)}
                          onChange={(e) => handleSelectRow(v.id, e)}
                          onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td>
                        <button className="gps-icon-btn"
                          onClick={() => toggle(setExpandedRows, v.id)}
                          title="View full record">
                          {expandedRows.has(v.id) ? <FiChevronUp /> : <FiChevronDown />}
                        </button>
                      </td>
                      <td>{v.sub_project_name || '-'}</td>
                      {!isFileUpload && <td className="filename-cell">{v.filename || '-'}</td>}
                      <td>{v.rule_name      || '-'}</td>
                      <td>{v.column_name    || '-'}</td>
                      <td>{v.row_number     ?? '-'}</td>
                      <td>{v.expected_value || '-'}</td>
                      <td>{v.actual_value   || '-'}</td>
                      <td>{getSeverityBadge(v.severity)}</td>
                      <td>{formatDateStr(v.created_at)}</td>
                      {!isFileUpload && <td>{v.executed_by_fullname || v.executed_by_username || '-'}</td>}
                      <td>{getStatusBadge(v.status)}</td>
                    </tr>
                    {expandedRows.has(v.id) && (
                      <tr className="expanded-row">
                        <td></td>
                        <td colSpan={colSpan}>
                          {renderFullRecord(v.record_snapshot)}
                          {!isFileUpload && v.mapping_name && (
                            <div className="quality-violations-mapping-info">
                              <strong>Mapping:</strong> {v.mapping_name}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {(gv.hasMore || gv.loading) && (
              <div className="qv-load-more">
                <button className="gps-btn gps-btn-secondary"
                  onClick={() => fetchGroupViolations(groupKey, gv.page + 1, true)}
                  disabled={gv.loading}>
                  {gv.loading ? 'Loading…' : 'Load more'}
                </button>
                <span className="qv-load-more-hint">
                  Showing {violations.length} of {totalCount?.toLocaleString() ?? '…'} violations
                </span>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /* ── Main content tree: Project → Sub-Project → Date → File/Job → Rows ── */
  const renderContent = () => {
    if (loading) return <div className="gps-empty-state">Loading…</div>;
    if (error)   return <div className="gps-alert gps-alert-danger">{error}</div>;
    if (!groups.length) return <div className="gps-empty-state"><p>No violations found</p></div>;

    const isFileUpload = activeTab === 'file-upload';

    return Object.entries(groupedByProject)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([projectName, { violationTotal, subProjects }]) => {
        const isProjExpanded = expandedProjects.has(projectName);

        return (
          <div key={projectName} className="quality-violations-project-group">
            {/* ── Level 1: Project ── */}
            <div className="quality-violations-project-header"
              onClick={() => toggle(setExpandedProjects, projectName)}>
              <button className="gps-icon-btn" style={{ border: 'none', background: 'none' }}>
                {isProjExpanded ? <FiChevronDown /> : <FiChevronRight />}
              </button>
              <h3 className="project-name">{projectName}</h3>
              <span className="gps-badge gps-badge-info qv-project-count">
                {violationTotal.toLocaleString()} violations
              </span>
            </div>

            {isProjExpanded && (
              <div className="qv-subproject-list">
                {Object.entries(subProjects)
                  .sort(([a], [b]) => a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b))
                  .map(([subLabel, { violationTotal: spTotal, dates }]) => {
                    const sk = spKey(projectName, subLabel);
                    const isSpExpanded = expandedSubProjects.has(sk);

                    return (
                      <div key={subLabel} className="qv-subproject-group">
                        {/* ── Level 2: Sub-Project ── */}
                        <div className="qv-subproject-header"
                          onClick={() => toggle(setExpandedSubProjects, sk)}>
                          <button className="gps-icon-btn qv-toggle-btn">
                            {isSpExpanded ? <FiChevronDown /> : <FiChevronRight />}
                          </button>
                          <span className="qv-subproject-name">
                            {subLabel === '—' ? <em className="qv-no-subproject">No Sub-Project</em> : subLabel}
                          </span>
                          <span className="qv-file-count">{spTotal.toLocaleString()} violations</span>
                        </div>

                        {isSpExpanded && (
                          <div className="qv-date-list">
                            {Object.entries(dates)
                              .sort(([a], [b]) => b.localeCompare(a)) /* newest date first */
                              .map(([dt, { violationTotal: dtTotal, groups: dateGroups }]) => {
                                const dk = dateKey(projectName, subLabel, dt);
                                const isDtExpanded = expandedDates.has(dk);

                                return (
                                  <div key={dt} className="qv-date-group">
                                    {/* ── Level 3: Date ── */}
                                    <div className="qv-date-header"
                                      onClick={() => toggle(setExpandedDates, dk)}>
                                      <button className="gps-icon-btn qv-toggle-btn">
                                        {isDtExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                      </button>
                                      <span className="qv-date-label">
                                        {dt === 'unknown-date' ? 'Date unknown' : formatDateLabel(dt)}
                                      </span>
                                      <span className="qv-date-count">
                                        {dtTotal.toLocaleString()} violations
                                      </span>
                                    </div>

                                    {isDtExpanded && (
                                      <div className="qv-file-groups">
                                        {/* ── Level 4: File / Job ── */}
                                        {dateGroups.map(group => {
                                          const groupKey  = isFileUpload ? group.file_id : group.job_id;
                                          const rawLabel  = isFileUpload ? group.filename : group.mapping_name;
                                          const groupLabel = rawLabel
                                            ? rawLabel.split('/').pop()
                                            : (isFileUpload ? 'Unknown file' : 'Unknown job');
                                          const ts = isFileUpload
                                            ? formatTimestamp(group.file_uploaded_at)
                                            : formatTimestamp(group.job_start_time);
                                          const isGroupExpanded = expandedGroups.has(groupKey);

                                          return (
                                            <div key={groupKey} className="qv-file-group">
                                              <div className="qv-file-header">
                                                <button className="gps-icon-btn qv-toggle-btn"
                                                  onClick={() => toggleGroupExpansion(groupKey)}
                                                  title={isGroupExpanded ? 'Collapse' : 'Expand'}>
                                                  {isGroupExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                                </button>

                                                <span className="qv-file-name-block" title={rawLabel || ''}>
                                                  <span className="qv-file-label">{groupLabel}</span>
                                                  {ts && <span className="qv-file-timestamp">{ts}</span>}
                                                </span>

                                                <span className="qv-file-count">
                                                  {parseInt(group.violation_count, 10).toLocaleString()} violations
                                                </span>

                                                <button className="gps-icon-btn qv-download-btn"
                                                  onClick={(e) => { e.stopPropagation(); handleGroupDownload(group); }}
                                                  title={`Download all violations for this ${isFileUpload ? 'file' : 'mapping job'} as Excel`}>
                                                  <FiDownload />
                                                </button>
                                              </div>

                                              {isGroupExpanded && renderGroupTable(groupKey, parseInt(group.violation_count, 10))}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      });
  };

  /* ── Page shell ── */
  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Quality Violations</h1>
          <p className="gps-page-subtitle">Review and manage data quality rule violations</p>
        </div>
        <div className="gps-page-header-right" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="download-dropdown">
            <button className="gps-btn gps-btn-primary"><FiDownload /> Download</button>
            <div className="download-menu">
              <button onClick={() => handleDownload('csv')}>Download as CSV</button>
              <button onClick={() => handleDownload('excel')}>Download as Excel</button>
            </div>
          </div>
          <button
            className={`gps-btn gps-btn-secondary ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(s => !s)}>
            <FiFilter /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      <div className="gps-tabs">
        <button
          className={`gps-tab ${activeTab === 'file-upload' ? 'gps-tab--active' : ''}`}
          onClick={() => { setActiveTab('file-upload'); setFilters(prev => ({ ...prev, page: 1 })); }}>
          File Upload Violations
          {activeTab === 'file-upload' && pagination.total > 0 && (
            <span className="gps-tab-count">{pagination.total}</span>
          )}
        </button>
        <button
          className={`gps-tab ${activeTab === 'mapping-job' ? 'gps-tab--active' : ''}`}
          onClick={() => { setActiveTab('mapping-job'); setFilters(prev => ({ ...prev, page: 1 })); }}>
          Mapping Job Violations
          {activeTab === 'mapping-job' && pagination.total > 0 && (
            <span className="gps-tab-count">{pagination.total}</span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="gps-filters">
          <select className="gps-filter-select" value={filters.project_id}
            onChange={(e) => handleFilterChange('project_id', e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select className="gps-filter-select" value={filters.rule_type}
            onChange={(e) => handleFilterChange('rule_type', e.target.value)}>
            <option value="all">All Rule Types</option>
            <option value="completeness">Completeness</option>
            <option value="validity">Validity</option>
            <option value="consistency">Consistency</option>
            <option value="uniqueness">Uniqueness</option>
            <option value="freshness">Freshness</option>
          </select>

          <select className="gps-filter-select" value={filters.severity}
            onChange={(e) => handleFilterChange('severity', e.target.value)}>
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="low">Low</option>
          </select>

          <select className="gps-filter-select" value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>

          <div className="gps-search-container">
            <FiSearch className="gps-search-icon" />
            <input type="text" className="gps-search-input" placeholder="Search violations…"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)} />
          </div>

          <input
            type="date"
            className="gps-filter-select"
            title="From date"
            value={filters.date_from}
            onChange={(e) => handleFilterChange('date_from', e.target.value)}
          />

          <input
            type="date"
            className="gps-filter-select"
            title="To date"
            value={filters.date_to}
            onChange={(e) => handleFilterChange('date_to', e.target.value)}
          />

          <button className="gps-btn gps-btn-secondary" onClick={() => setFilters({
            project_id: '', rule_type: 'all', severity: 'all',
            status: 'all', search: '', date_from: '', date_to: '', page: 1, limit: 10
          })}>
            <FiX /> Clear Filters
          </button>
        </div>
      )}

      <div className="gps-results-info">
        {loading
          ? 'Loading…'
          : (() => {
              let info = `${pagination.total} ${activeTab === 'file-upload' ? 'file(s)' : 'mapping job(s)'} with violations`;
              if (filters.date_from || filters.date_to) {
                const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '…';
                info += ` — ${fmt(filters.date_from)} – ${fmt(filters.date_to)}`;
              }
              if (pagination.totalPages > 1) info += ` — Page ${pagination.page} of ${pagination.totalPages}`;
              return info;
            })()}
      </div>

      {selectedIds.length > 0 && (
        <div className="quality-violations-bulk-actions-bar">
          <span className="quality-violations-selected-count">{selectedIds.length} violation(s) selected</span>
          <button className="gps-btn gps-btn-danger" onClick={handleBulkDelete} disabled={isDeleting}>
            <FiTrash2 /> {isDeleting ? 'Deleting…' : `Delete Selected (${selectedIds.length})`}
          </button>
        </div>
      )}

      {renderContent()}

      {!loading && groups.length > 0 && pagination.totalPages > 1 && (
        <div className="gps-pagination">
          <div className="gps-pagination-controls">
            {filters.page > 1 && (
              <button onClick={() => handlePageChange(filters.page - 1)} className="gps-btn gps-btn-secondary">
                Previous
              </button>
            )}
            <span className="gps-pagination-info">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} groups)
            </span>
            {filters.page < pagination.totalPages && (
              <button onClick={() => handlePageChange(filters.page + 1)} className="gps-btn gps-btn-secondary">
                Next
              </button>
            )}
          </div>
          <div className="gps-pagination-size">
            <label>Groups per page:</label>
            <select value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value, 10))}
              className="gps-filter-select">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorReview;
