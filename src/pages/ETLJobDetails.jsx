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
  FiX,
  FiColumns
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate } from '../utils/formatters';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import ConfirmModal from '../components/ConfirmModal';
import './ETLJobDetails.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function ETLJobDetails() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [profiles, setProfiles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [cancelling, setCancelling] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

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
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Action',
      message: 'Are you sure you want to cancel this job?',
      action: async () => {
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
      }
    });
  };

  const fetchProfileComparison = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/profiles`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setProfiles(response.data);
    } catch (err) {
      console.error('Error fetching profile comparison:', err);
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
            className={`tab-button ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('comparison');
              if (!profiles) fetchProfileComparison();
            }}
          >
            <FiColumns /> Profile Comparison
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
                  
                  <dt>Schema Validation</dt>
                  <dd>
                    {job?.schema_validation === 'Pass' && (
                      <span className="status-badge status-success">
                        <FiCheckCircle size={16} /> Pass
                      </span>
                    )}
                    {job?.schema_validation === 'Fail' && (
                      <span className="status-badge status-error">
                        <FiXCircle size={16} /> Fail - Schema Drift Detected
                      </span>
                    )}
                    {!job?.schema_validation && (
                      <span className="status-badge status-warning">
                        <FiAlertCircle size={16} /> Not Validated
                      </span>
                    )}
                  </dd>
                </dl>
              </Card>

              {job?.schema_validation === 'Fail' && (
                <Card className="error-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                  <h3><FiAlertTriangle /> Schema Drift Detected</h3>
                  <p>
                    The uploaded file schema does not match the expected schema. The file may contain extra columns 
                    or be missing required columns. Check the logs for details about which fields differ.
                  </p>
                </Card>
              )}

              {job?.error_message && (
                <Card className="error-card">
                  <h3><FiXCircle /> Error Message</h3>
                  <pre>{job.error_message}</pre>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="comparison-content">
              {!profiles ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <LoadingSpinner />
                </div>
              ) : !profiles.sourceProfile || !profiles.targetProfile ? (
                <div className="empty-state">
                  <FiColumns size={48} />
                  <p>Profile comparison not available</p>
                  <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
                    Both source and target profiles are required for comparison
                  </p>
                </div>
              ) : (
                <>
                  <Card style={{ marginBottom: '20px' }}>
                    <h3>Quality Metrics Comparison</h3>
                    <div className="comparison-grid">
                      <div className="metric-card">
                        <div className="metric-header">
                          <span className="badge badge-source">Source</span>
                          <span className="metric-label">Overall Quality</span>
                        </div>
                        <div className="metric-value">
                          {profiles.sourceProfile.overall_quality_score?.toFixed(1) || 'N/A'}%
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-header">
                          <span className="badge badge-target">Target</span>
                          <span className="metric-label">Overall Quality</span>
                        </div>
                        <div className="metric-value">
                          {profiles.targetProfile.overall_quality_score?.toFixed(1) || 'N/A'}%
                        </div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-header">
                          <span className="metric-label">Improvement</span>
                        </div>
                        <div className={`metric-value ${
                          (profiles.targetProfile.overall_quality_score || 0) >= 
                          (profiles.sourceProfile.overall_quality_score || 0) ? 'positive' : 'negative'
                        }`}>
                          {profiles.sourceProfile.overall_quality_score && profiles.targetProfile.overall_quality_score
                            ? `${(profiles.targetProfile.overall_quality_score - profiles.sourceProfile.overall_quality_score).toFixed(1)}%`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card style={{ marginBottom: '20px' }}>
                    <h3>Dimension Comparison</h3>
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Source</th>
                          <th>Target</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Rows</strong></td>
                          <td>{profiles.sourceProfile.row_count?.toLocaleString() || 0}</td>
                          <td>{profiles.targetProfile.row_count?.toLocaleString() || 0}</td>
                          <td className={
                            (profiles.targetProfile.row_count || 0) >= (profiles.sourceProfile.row_count || 0)
                              ? 'positive' : 'negative'
                          }>
                            {((profiles.targetProfile.row_count || 0) - (profiles.sourceProfile.row_count || 0)).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Columns</strong></td>
                          <td>{profiles.sourceProfile.column_count || 0}</td>
                          <td>{profiles.targetProfile.column_count || 0}</td>
                          <td className={
                            (profiles.targetProfile.column_count || 0) >= (profiles.sourceProfile.column_count || 0)
                              ? 'positive' : 'neutral'
                          }>
                            {(profiles.targetProfile.column_count || 0) - (profiles.sourceProfile.column_count || 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Card>

                  <Card>
                    <h3>Quality Dimensions</h3>
                    <div style={{ height: '350px', marginTop: '20px' }}>
                      <Line 
                        data={{
                          labels: ['Completeness', 'Consistency', 'Validity', 'Uniqueness'],
                          datasets: [
                            {
                              label: 'Source',
                              data: [
                                profiles.sourceProfile.completeness_score || 0,
                                profiles.sourceProfile.consistency_score || 0,
                                profiles.sourceProfile.validity_score || 0,
                                profiles.sourceProfile.uniqueness_score || 0
                              ],
                              borderColor: '#3b82f6',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              tension: 0.4
                            },
                            {
                              label: 'Target',
                              data: [
                                profiles.targetProfile.completeness_score || 0,
                                profiles.targetProfile.consistency_score || 0,
                                profiles.targetProfile.validity_score || 0,
                                profiles.targetProfile.uniqueness_score || 0
                              ],
                              borderColor: '#10b981',
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              tension: 0.4
                            }
                          ]
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              position: 'top',
                            },
                            title: {
                              display: true,
                              text: 'Source vs Target Quality Metrics'
                            }
                          },
                          scales: {
                            y: {
                              beginAtZero: true,
                              max: 100,
                              title: {
                                display: true,
                                text: 'Score (%)'
                              }
                            }
                          }
                        }}
                      />
                    </div>
                  </Card>
                </>
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
                    <div key={`log-${log.timestamp || log.message?.substring(0, 20) || idx}`} className={`log-entry ${getLogLevelClass(log.level)}`}>
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
                        <tr key={`metric-${metric.file_path || metric.id || idx}`}>
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

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="warning"
      />
    </div>
  );
}

export default ETLJobDetails;
