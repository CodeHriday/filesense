import React, { useState, useEffect } from 'react';
import { FiCheckCircle, FiAlertTriangle, FiClock, FiBarChart2, FiPlay, FiFilter, FiSearch, FiRefreshCw } from 'react-icons/fi';
import { getSLAStatus, getSLAViolations, runManualSLACheck, getSLASummary } from '../api/slaService';
import '../styles/global-page-styles.css';

const SLAMonitoring = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [slaStatus, setSlaStatus] = useState([]);
  const [violations, setViolations] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [runningCheck, setRunningCheck] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryRes, statusRes, violationsRes] = await Promise.all([
        getSLASummary(),
        getSLAStatus(),
        getSLAViolations({ resolved: false, limit: 50 })
      ]);

      setSummary(summaryRes.data);
      setSlaStatus(statusRes.data);
      setViolations(violationsRes.data);
    } catch (error) {
      console.error('Error fetching SLA data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async (agreementId) => {
    try {
      setRunningCheck(agreementId);
      await runManualSLACheck(agreementId);
      await fetchData();
      alert('SLA check completed successfully!');
    } catch (error) {
      console.error('Error running manual check:', error);
      alert('Failed to run SLA check: ' + (error.response?.data?.error || error.message));
    } finally {
      setRunningCheck(null);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      compliant: { icon: <FiCheckCircle />, label: 'Compliant', class: 'gps-badge gps-badge--success' },
      violated: { icon: <FiAlertTriangle />, label: 'Violated', class: 'gps-badge gps-badge--danger' },
      no_data: { icon: <FiClock />, label: 'No Data', class: 'gps-badge gps-badge--muted' },
      unknown: { icon: <FiClock />, label: 'Unknown', class: 'gps-badge gps-badge--muted' }
    };
    const badge = badges[status] || badges.unknown;
    return (
      <span className={badge.class}>
        {badge.icon} {badge.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatDelay = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const filteredStatus = slaStatus.filter(item => {
    const matchesFilter = filter === 'all' || item.compliance_status === filter;
    const matchesSearch = !searchTerm || 
      item.agreement_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.file_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading && !summary) {
    return (
      <div className="gps-page-container">
        <div className="gps-empty-state">Loading SLA monitoring data...</div>
      </div>
    );
  }

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">
            <FiBarChart2 style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            SLA Monitoring Dashboard
          </h1>
          <p className="gps-page-subtitle">Real-time vendor file delivery compliance tracking</p>
        </div>
        <div className="gps-header-actions">
          <button className="gps-btn gps-btn--secondary" onClick={fetchData}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>

      {summary && (
        <div className="gps-card-grid" style={{ marginBottom: '24px' }}>
          <div className="gps-stat-card">
            <div className="gps-stat-icon" style={{ backgroundColor: 'rgba(2, 80, 67, 0.1)', color: '#025043' }}>
              <FiBarChart2 />
            </div>
            <div className="gps-stat-content">
              <div className="gps-stat-value">{summary.active_agreements}</div>
              <div className="gps-stat-label">Active Agreements</div>
            </div>
          </div>

          <div className="gps-stat-card">
            <div className="gps-stat-icon" style={{ backgroundColor: 'rgba(22, 163, 74, 0.1)', color: '#16a34a' }}>
              <FiCheckCircle />
            </div>
            <div className="gps-stat-content">
              <div className="gps-stat-value">{summary.compliance_rate}%</div>
              <div className="gps-stat-label">Compliance Rate</div>
            </div>
          </div>

          <div className="gps-stat-card">
            <div className="gps-stat-icon" style={{ backgroundColor: 'rgba(229, 62, 62, 0.1)', color: '#e53e3e' }}>
              <FiAlertTriangle />
            </div>
            <div className="gps-stat-content">
              <div className="gps-stat-value">{summary.active_violations}</div>
              <div className="gps-stat-label">Active Violations</div>
            </div>
          </div>

          <div className="gps-stat-card">
            <div className="gps-stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
              <FiClock />
            </div>
            <div className="gps-stat-content">
              <div className="gps-stat-value">{summary.violations_last_30_days}</div>
              <div className="gps-stat-label">Last 30 Days</div>
            </div>
          </div>
        </div>
      )}

      <div className="gps-section" style={{ marginBottom: '24px' }}>
        <div className="gps-section-header">
          <h2 className="gps-section-title">SLA Status Overview</h2>
          <div className="gps-header-actions">
            <div className="gps-search-wrapper">
              <FiSearch className="gps-search-icon" />
              <input
                type="text"
                className="gps-search-input"
                placeholder="Search by vendor, agreement, or file..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="gps-filter-wrapper">
              <FiFilter style={{ color: '#666', marginRight: '4px' }} />
              <select 
                className="gps-filter-select"
                value={filter} 
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="compliant">Compliant</option>
                <option value="violated">Violated</option>
                <option value="no_data">No Data</option>
              </select>
            </div>
          </div>
        </div>

        <div className="gps-table-container">
          <table className="gps-table">
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Vendor</th>
                <th>File Pattern</th>
                <th>Frequency</th>
                <th>Expected Arrival</th>
                <th>Last Arrival</th>
                <th>Status</th>
                <th>Delay</th>
                <th>Violations (30d)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStatus.length === 0 ? (
                <tr>
                  <td colSpan="10" className="gps-table-empty">
                    {searchTerm || filter !== 'all' 
                      ? 'No SLA agreements match your filters' 
                      : 'No SLA monitoring configured yet'}
                  </td>
                </tr>
              ) : (
                filteredStatus.map((item) => (
                  <tr key={item.agreement_id} style={item.compliance_status === 'violated' ? { backgroundColor: 'rgba(229, 62, 62, 0.05)' } : {}}>
                    <td>
                      <strong>{item.agreement_code}</strong>
                    </td>
                    <td>{item.vendor_name}</td>
                    <td>
                      <code style={{ fontSize: '10px', backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{item.file_name}</code>
                    </td>
                    <td>
                      <span className="gps-badge gps-badge--info">{item.frequency_pattern}</span>
                    </td>
                    <td>{formatDate(item.expected_arrival)}</td>
                    <td>{formatDate(item.last_file_arrival)}</td>
                    <td>{getStatusBadge(item.compliance_status)}</td>
                    <td>
                      {item.delay_minutes ? (
                        <span style={{ color: '#e53e3e', fontWeight: 500 }}>{formatDelay(item.delay_minutes)}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.violations_last_30_days > 0 ? (
                        <span className="gps-badge gps-badge--danger">{item.violations_last_30_days}</span>
                      ) : (
                        <span className="gps-badge gps-badge--success">0</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="gps-btn gps-btn--secondary"
                        onClick={() => handleManualCheck(item.agreement_id)}
                        disabled={runningCheck === item.agreement_id}
                        style={{ fontSize: '10px', padding: '4px 8px' }}
                      >
                        <FiPlay /> {runningCheck === item.agreement_id ? 'Checking...' : 'Check Now'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="gps-section">
        <div className="gps-section-header">
          <h2 className="gps-section-title">Recent Violations</h2>
          <span className="gps-badge gps-badge--danger">{violations.length} Active</span>
        </div>

        {violations.length === 0 ? (
          <div className="gps-empty-state" style={{ backgroundColor: 'rgba(22, 163, 74, 0.05)', borderColor: '#16a34a' }}>
            <FiCheckCircle style={{ fontSize: '24px', color: '#16a34a', marginBottom: '8px' }} />
            <p>No active violations! All vendor files are arriving on time.</p>
          </div>
        ) : (
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Vendor</th>
                  <th>Expected Arrival</th>
                  <th>Actual Arrival</th>
                  <th>Delay</th>
                  <th>Detected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((violation) => (
                  <tr key={violation.id}>
                    <td><strong>{violation.agreement_code}</strong></td>
                    <td>{violation.vendor_name}</td>
                    <td>{formatDate(violation.expected_arrival)}</td>
                    <td>{formatDate(violation.actual_arrival)}</td>
                    <td style={{ color: '#e53e3e', fontWeight: 500 }}>{formatDelay(violation.delay_minutes)}</td>
                    <td>{formatDate(violation.created_at)}</td>
                    <td>
                      {violation.resolved_at ? (
                        <span className="gps-badge gps-badge--success">Resolved</span>
                      ) : (
                        <span className="gps-badge gps-badge--danger">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SLAMonitoring;
