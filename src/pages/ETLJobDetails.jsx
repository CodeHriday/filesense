import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FiArrowLeft,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiAlertCircle,
  FiFileText,
  FiActivity,
  FiDatabase,
  FiAlertTriangle,
  FiRefreshCw,
  FiX
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate } from '../utils/formatters';
import './ETLJobDetails.css';

function ETLJobDetails() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
      
      // Auto-refresh for running jobs
      const interval = setInterval(() => {
        if (job?.status === 'running') {
          fetchJobDetails();
        }
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [jobId, job?.status]);

  const fetchJobDetails = async () => {
    try {
      const [jobRes, logsRes, anomaliesRes, metricsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}/logs`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}/anomalies`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}/metrics`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      setJob(jobRes.data);
      setLogs(logsRes.data?.logs || []);
      setAnomalies(anomaliesRes.data?.anomalies || []);
      setMetrics(metricsRes.data?.metrics || []);
      setError(null);
      
      if (loading) setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job details');
      setLoading(false);
    }
  };

  const handleCancelJob = async () => {
    if (!window.confirm('Are you sure you want to cancel this job?')) {
      return;
    }

    try {
      setCancelling(true);
      await axios.post(
        `${API_BASE_URL}/api/jobs/${jobId}/cancel`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      await fetchJobDetails();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel job');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      completed: { icon: FiCheckCircle, class: 'status-success', label: 'Completed' },
      running: { icon: FiClock, class: 'status-running', label: 'Running' },
      failed: { icon: FiXCircle, class: 'status-error', label: 'Failed' },
      pending: { icon: FiAlertCircle, class: 'status-warning', label: 'Pending' },
      cancelled: { icon: FiX, class: 'status-cancelled', label: 'Cancelled' }
    };

    const statusConfig = config[status] || config.pending;
    const Icon = statusConfig.icon;

    return (
      <span className={`status-badge ${statusConfig.class}`}>
        <Icon size={16} />
        {statusConfig.label}
      </span>
    );
  };

  const getLogLevelClass = (level) => {
    switch (level) {
      case 'error': return 'log-error';
      case 'warn': return 'log-warn';
      case 'info': return 'log-info';
      default: return '';
    }
  };

  const getSeverityBadge = (severity) => {
    const config = {
      high: { class: 'severity-high', label: 'High' },
      medium: { class: 'severity-medium', label: 'Medium' },
      low: { class: 'severity-low', label: 'Low' }
    };

    const severityConfig = config[severity] || config.low;
    
    return (
      <span className={`severity-badge ${severityConfig.class}`}>
        {severityConfig.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="page-container">
        <div className="error-state">
          <FiAlertCircle size={48} />
          <h3>Error Loading Job</h3>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/mappings')}>
            <FiArrowLeft /> Back to Mappings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="job-details-header">
        <button className="btn-back" onClick={() => navigate('/mappings')}>
          <FiArrowLeft /> Back to Mappings
        </button>
        <div className="job-header-content">
          <div>
            <h1>Job Details</h1>
            <code className="job-id">{jobId}</code>
          </div>
          <div className="job-header-actions">
            {getStatusBadge(job?.status)}
            {job?.status === 'running' && (
              <button 
                className="btn btn-danger btn-sm"
                onClick={handleCancelJob}
                disabled={cancelling}
              >
                <FiX /> {cancelling ? 'Cancelling...' : 'Cancel Job'}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={fetchJobDetails}>
              <FiRefreshCw /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="job-overview-stats">
        <Card className="stat-card">
          <div className="stat-icon">
            <FiFileText />
          </div>
          <div className="stat-content">
            <div className="stat-label">Files Processed</div>
            <div className="stat-value">{job?.files_processed || 0}</div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon">
            <FiDatabase />
          </div>
          <div className="stat-content">
            <div className="stat-label">Rows Read</div>
            <div className="stat-value">
              {job?.total_rows_read?.toLocaleString() || 0}
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon">
            <FiCheckCircle />
          </div>
          <div className="stat-content">
            <div className="stat-label">Rows Written</div>
            <div className="stat-value">
              {job?.total_rows_written?.toLocaleString() || 0}
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon">
            <FiXCircle />
          </div>
          <div className="stat-content">
            <div className="stat-label">Rows Failed</div>
            <div className="stat-value">
              {job?.total_rows_failed?.toLocaleString() || 0}
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-icon">
            <FiClock />
          </div>
          <div className="stat-content">
            <div className="stat-label">Duration</div>
            <div className="stat-value">
              {job?.duration_ms ? `${(job.duration_ms / 1000).toFixed(2)}s` : '-'}
            </div>
          </div>
        </Card>
      </div>

      <div className="tabs-container">
        <div className="tabs-header" style={{ background: 'white', borderBottom: '1px solid #e2e8f0' }}>
          <button
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FiActivity /> Overview
          </button>
          <button
            className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <FiFileText /> Logs ({logs.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'anomalies' ? 'active' : ''}`}
            onClick={() => setActiveTab('anomalies')}
          >
            <FiAlertTriangle /> Anomalies ({anomalies.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <FiDatabase /> Metrics ({metrics.length})
          </button>
        </div>

        <div className="tabs-content" style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: 'none' }}>
          {activeTab === 'overview' && (
            <div className="overview-content">
              <Card>
                <h3>Job Information</h3>
                <dl className="info-list">
                  <dt>Mapping Name</dt>
                  <dd>{job?.mapping_name || '-'}</dd>
                  
                  <dt>Started At</dt>
                  <dd>{formatDate(job?.started_at)}</dd>
                  
                  <dt>Ended At</dt>
                  <dd>{job?.ended_at ? formatDate(job.ended_at) : 'Running...'}</dd>
                  
                  <dt>Status</dt>
                  <dd>{getStatusBadge(job?.status)}</dd>
                </dl>
              </Card>

              {job?.error_message && (
                <Card className="error-card">
                  <h3><FiXCircle /> Error Message</h3>
                  <pre>{job.error_message}</pre>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="logs-content">
              {logs.length === 0 ? (
                <div className="empty-state">
                  <FiFileText size={48} />
                  <p>No logs available</p>
                </div>
              ) : (
                <div className="logs-list">
                  {logs.map((log, idx) => (
                    <div key={idx} className={`log-entry ${getLogLevelClass(log.level)}`}>
                      <div className="log-header">
                        <span className="log-level">{log.level.toUpperCase()}</span>
                        <span className="log-time">{formatDate(log.created_at)}</span>
                      </div>
                      <div className="log-message">{log.message}</div>
                      {log.details && (
                        <pre className="log-details">{JSON.stringify(log.details, null, 2)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'anomalies' && (
            <div className="anomalies-content">
              {anomalies.length === 0 ? (
                <div className="empty-state">
                  <FiCheckCircle size={48} color="#10b981" />
                  <p>No anomalies detected</p>
                </div>
              ) : (
                <div className="anomalies-list">
                  {anomalies.map((anomaly) => (
                    <Card key={anomaly.id} className="anomaly-card">
                      <div className="anomaly-header">
                        <h4>{anomaly.anomaly_type.replace(/_/g, ' ')}</h4>
                        {getSeverityBadge(anomaly.severity)}
                      </div>
                      <p className="anomaly-description">{anomaly.description}</p>
                      <div className="anomaly-meta">
                        <span>File: {anomaly.file_path}</span>
                        <span>•</span>
                        <span>{formatDate(anomaly.detected_at)}</span>
                      </div>
                      {anomaly.threshold_value && (
                        <div className="anomaly-threshold">
                          Threshold: {anomaly.threshold_value}% | 
                          Actual: {anomaly.actual_value?.toFixed(2)}%
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="metrics-content">
              {metrics.length === 0 ? (
                <div className="empty-state">
                  <FiDatabase size={48} />
                  <p>No metrics available</p>
                </div>
              ) : (
                <div className="metrics-table-container">
                  <table className="metrics-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Rows</th>
                        <th>Columns</th>
                        <th>Null Count</th>
                        <th>Unique Count</th>
                        <th>Quality Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((metric, idx) => (
                        <tr key={idx}>
                          <td>{metric.file_path}</td>
                          <td>{metric.row_count?.toLocaleString()}</td>
                          <td>{metric.column_count}</td>
                          <td>{metric.null_count?.toLocaleString()}</td>
                          <td>{metric.unique_count?.toLocaleString()}</td>
                          <td>
                            <div className="quality-score" style={{
                              color: metric.quality_score >= 90 ? '#10b981' : 
                                     metric.quality_score >= 70 ? '#f59e0b' : '#ef4444'
                            }}>
                              {metric.quality_score?.toFixed(1)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ETLJobDetails;
