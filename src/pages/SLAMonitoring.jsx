import React, { useState, useEffect } from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaClock, FaChartLine, FaPlay, FaFilter } from 'react-icons/fa';
import { getSLAStatus, getSLAViolations, runManualSLACheck, getSLASummary } from '../api/slaService';
import '../styles/SLAMonitoring.css';

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
      compliant: { icon: <FaCheckCircle />, label: 'Compliant', class: 'status-compliant' },
      violated: { icon: <FaExclamationTriangle />, label: 'Violated', class: 'status-violated' },
      no_data: { icon: <FaClock />, label: 'No Data', class: 'status-no-data' },
      unknown: { icon: <FaClock />, label: 'Unknown', class: 'status-unknown' }
    };
    const badge = badges[status] || badges.unknown;
    return (
      <span className={`status-badge ${badge.class}`}>
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
      <div className="sla-monitoring-page">
        <div className="loading-state">Loading SLA monitoring data...</div>
      </div>
    );
  }

  return (
    <div className="sla-monitoring-page">
      <div className="page-header">
        <h1>
          <FaChartLine /> SLA Monitoring Dashboard
        </h1>
        <p>Real-time vendor file delivery compliance tracking</p>
      </div>

      {summary && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-icon total">
              <FaChartLine />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.active_agreements}</div>
              <div className="card-label">Active Agreements</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="card-icon compliant">
              <FaCheckCircle />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.compliance_rate}%</div>
              <div className="card-label">Compliance Rate</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="card-icon violations">
              <FaExclamationTriangle />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.active_violations}</div>
              <div className="card-label">Active Violations</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="card-icon recent">
              <FaClock />
            </div>
            <div className="card-content">
              <div className="card-value">{summary.violations_last_30_days}</div>
              <div className="card-label">Last 30 Days</div>
            </div>
          </div>
        </div>
      )}

      <div className="monitoring-section">
        <div className="section-header">
          <h2>SLA Status Overview</h2>
          <div className="controls">
            <input
              type="text"
              placeholder="Search by vendor, agreement, or file..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <div className="filter-group">
              <FaFilter /> 
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
                <option value="all">All Status</option>
                <option value="compliant">Compliant</option>
                <option value="violated">Violated</option>
                <option value="no_data">No Data</option>
              </select>
            </div>
          </div>
        </div>

        <div className="sla-table-container">
          <table className="sla-table">
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
                  <td colSpan="10" className="empty-state">
                    {searchTerm || filter !== 'all' 
                      ? 'No SLA agreements match your filters' 
                      : 'No SLA monitoring configured yet'}
                  </td>
                </tr>
              ) : (
                filteredStatus.map((item) => (
                  <tr key={item.agreement_id} className={item.compliance_status === 'violated' ? 'row-violated' : ''}>
                    <td>
                      <div className="agreement-cell">
                        <strong>{item.agreement_code}</strong>
                      </div>
                    </td>
                    <td>{item.vendor_name}</td>
                    <td>
                      <code className="file-pattern">{item.file_name}</code>
                    </td>
                    <td>
                      <span className="frequency-badge">{item.frequency_pattern}</span>
                    </td>
                    <td>{formatDate(item.expected_arrival)}</td>
                    <td>{formatDate(item.last_file_arrival)}</td>
                    <td>{getStatusBadge(item.compliance_status)}</td>
                    <td>
                      {item.delay_minutes ? (
                        <span className="delay-text">{formatDelay(item.delay_minutes)}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="text-center">
                      {item.violations_last_30_days > 0 ? (
                        <span className="violation-count">{item.violations_last_30_days}</span>
                      ) : (
                        <span className="no-violations">0</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-check"
                        onClick={() => handleManualCheck(item.agreement_id)}
                        disabled={runningCheck === item.agreement_id}
                      >
                        <FaPlay /> {runningCheck === item.agreement_id ? 'Checking...' : 'Check Now'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="violations-section">
        <div className="section-header">
          <h2>Recent Violations</h2>
          <span className="violation-badge">{violations.length} Active</span>
        </div>

        <div className="violations-list">
          {violations.length === 0 ? (
            <div className="empty-violations">
              <FaCheckCircle className="success-icon" />
              <p>No active violations! All vendor files are arriving on time.</p>
            </div>
          ) : (
            <table className="violations-table">
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
                    <td className="delay-cell">{formatDelay(violation.delay_minutes)}</td>
                    <td>{formatDate(violation.created_at)}</td>
                    <td>
                      {violation.resolved_at ? (
                        <span className="resolved-badge">Resolved</span>
                      ) : (
                        <span className="active-badge">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default SLAMonitoring;
