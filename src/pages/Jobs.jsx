import React, { useState, useEffect, useRef } from 'react';
import { FiEye, FiX, FiClock, FiCheckCircle, FiXCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate } from '../utils/formatters';
import '../styles/Jobs.css';

const Jobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [jobDetailsModalOpen, setJobDetailsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);
  const [loadingJobDetails, setLoadingJobDetails] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [jobToCancel, setJobToCancel] = useState(null);
  const [cancelResult, setCancelResult] = useState(null);
  const [cancelResultModalOpen, setCancelResultModalOpen] = useState(false);
  const isFetching = useRef(false);

  useEffect(() => {
    fetchJobs();
    // Refresh jobs every 10 seconds
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchJobs = async (isManualRefresh = false) => {
    // Prevent concurrent fetches
    if (isFetching.current) return;
    
    isFetching.current = true;
    if (isManualRefresh) setRefreshing(true);
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/jobs?limit=100`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setJobs(response.data?.jobs || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError(err.response?.data?.error || 'Failed to load jobs');
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
      isFetching.current = false;
    }
  };

  const handleRefresh = () => {
    fetchJobs(true);
  };

  const handleViewJob = async (jobId) => {
    setLoadingJobDetails(true);
    setJobDetailsModalOpen(true);
    setSelectedJob(null);
    setJobLogs([]);

    try {
      const [jobRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}/logs`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      setSelectedJob(jobRes.data);
      setJobLogs(logsRes.data?.logs || []);
    } catch (err) {
      console.error('Error fetching job details:', err);
      setError('Failed to load job details');
    } finally {
      setLoadingJobDetails(false);
    }
  };

  const openCancelModal = (jobId) => {
    setJobToCancel(jobId);
    setCancelModalOpen(true);
  };

  const closeCancelModal = () => {
    setCancelModalOpen(false);
    setJobToCancel(null);
  };

  const confirmCancelJob = async () => {
    if (!jobToCancel) return;

    closeCancelModal();

    try {
      const response = await axios.post(`${API_BASE_URL}/api/jobs/${jobToCancel}/cancel`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setCancelResult({
        success: true,
        message: response.data.message || 'Job cancelled successfully'
      });
      setCancelResultModalOpen(true);
      fetchJobs();
    } catch (err) {
      console.error('Error cancelling job:', err);
      setCancelResult({
        success: false,
        message: err.response?.data?.error || 'Failed to cancel job'
      });
      setCancelResultModalOpen(true);
    }
  };

  const closeCancelResultModal = () => {
    setCancelResultModalOpen(false);
    setCancelResult(null);
  };

  const closeJobDetailsModal = () => {
    setJobDetailsModalOpen(false);
    setSelectedJob(null);
    setJobLogs([]);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { icon: FiClock, color: '#64748b', bg: '#f1f5f9', text: 'Pending' },
      running: { icon: FiRefreshCw, color: '#3b82f6', bg: '#dbeafe', text: 'Running' },
      completed: { icon: FiCheckCircle, color: '#10b981', bg: '#d1fae5', text: 'Completed' },
      failed: { icon: FiXCircle, color: '#ef4444', bg: '#fee2e2', text: 'Failed' },
      cancelled: { icon: FiAlertCircle, color: '#f59e0b', bg: '#fef3c7', text: 'Cancelled' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.35rem',
          padding: '0.25rem 0.75rem',
          borderRadius: '12px',
          fontSize: '0.8rem',
          fontWeight: '500',
          color: config.color,
          backgroundColor: config.bg
        }}
      >
        <Icon size={12} />
        {config.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1>Transformation Jobs</h1>
          <p style={{ color: 'white' }}>Monitor and manage ETL transformation job executions</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh jobs"
          >
            <FiRefreshCw className={refreshing ? 'spinning' : ''} /> 
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ margin: '1rem' }}>
          <FiAlertCircle /> {error}
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        {jobs.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <FiClock size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
            <h3>No jobs yet</h3>
            <p>Job executions will appear here when mappings are executed</p>
          </div>
        ) : (
          <div className="jobs-table-container">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Mapping</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Files Processed</th>
                  <th>Rows</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.job_id}>
                    <td className="job-id-cell">
                      <code style={{ fontSize: '0.8em' }}>{job.job_id}</code>
                    </td>
                    <td>{job.mapping_name}</td>
                    <td>{getStatusBadge(job.status)}</td>
                    <td style={{ textAlign: 'center' }}>{job.files_processed || 0}</td>
                    <td>
                      {job.rows_read ? (
                        <span style={{ fontSize: '0.9em' }}>
                          {job.rows_read.toLocaleString()}
                          {job.rows_written && ` → ${job.rows_written.toLocaleString()}`}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ fontSize: '0.9em' }}>
                      {job.start_time ? formatDate(job.start_time) : '-'}
                    </td>
                    <td style={{ fontSize: '0.9em' }}>
                      {job.end_time ? formatDate(job.end_time) : '-'}
                    </td>
                    <td>
                      {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(2)}s` : '-'}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-btn"
                          onClick={() => handleViewJob(job.job_id)}
                          title="View job details"
                        >
                          <FiEye />
                        </button>
                        {job.status === 'running' && (
                          <button
                            className="icon-btn danger"
                            onClick={() => openCancelModal(job.job_id)}
                            title="Cancel job"
                          >
                            <FiX />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {jobDetailsModalOpen && (
        <div className="modal-overlay" onClick={closeJobDetailsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h2>Job Details</h2>
              <button className="modal-close" onClick={closeJobDetailsModal}>
                <FiX />
              </button>
            </div>
            
            <div className="modal-body">
              {loadingJobDetails ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <LoadingSpinner />
                </div>
              ) : selectedJob ? (
                <div>
                  <div className="job-details-grid" style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '1rem', 
                    marginBottom: '2rem',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <strong>Job ID:</strong>
                      <div><code>{selectedJob.job_id}</code></div>
                    </div>
                    <div>
                      <strong>Mapping:</strong>
                      <div>{selectedJob.mapping_name}</div>
                    </div>
                    <div>
                      <strong>Status:</strong>
                      <div>{getStatusBadge(selectedJob.status)}</div>
                    </div>
                    <div>
                      <strong>Files Processed:</strong>
                      <div>{selectedJob.files_processed || 0}</div>
                    </div>
                    <div>
                      <strong>Rows Read:</strong>
                      <div>{selectedJob.rows_read?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <strong>Rows Written:</strong>
                      <div>{selectedJob.rows_written?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <strong>Start Time:</strong>
                      <div>{selectedJob.start_time ? formatDate(selectedJob.start_time) : '-'}</div>
                    </div>
                    <div>
                      <strong>End Time:</strong>
                      <div>{selectedJob.end_time ? formatDate(selectedJob.end_time) : '-'}</div>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ marginBottom: '1rem' }}>Execution Logs</h3>
                    <div style={{ 
                      maxHeight: '400px', 
                      overflowY: 'auto', 
                      background: '#1e293b', 
                      padding: '1rem', 
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem'
                    }}>
                      {jobLogs.length === 0 ? (
                        <div style={{ color: '#94a3b8' }}>No logs available</div>
                      ) : (
                        jobLogs.map((log, index) => (
                          <div 
                            key={index} 
                            style={{ 
                              marginBottom: '0.5rem',
                              color: log.log_level === 'error' ? '#fca5a5' : 
                                     log.log_level === 'warn' ? '#fcd34d' : 
                                     log.log_level === 'info' ? '#93c5fd' : '#e2e8f0'
                            }}
                          >
                            <span style={{ color: '#64748b' }}>
                              [{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}]
                            </span>{' '}
                            <span style={{ color: '#94a3b8', textTransform: 'uppercase' }}>
                              [{log.log_level}]
                            </span>{' '}
                            {log.message}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>No job details available</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div className="modal-overlay" onClick={closeCancelModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cancel Job</h2>
              <button className="modal-close" onClick={closeCancelModal}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <FiAlertCircle size={48} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500 }}>
                    Are you sure you want to cancel this job?
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                    Job ID: <code>{jobToCancel}</code>
                  </p>
                  <p style={{ margin: 0, marginTop: '0.5rem', color: '#64748b', fontSize: '0.875em' }}>
                    This action will stop the job execution. Any partially processed data will not be saved.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeCancelModal}>
                No, Keep Running
              </button>
              <button className="btn btn-danger" onClick={confirmCancelJob}>
                <FiX /> Yes, Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Result Modal */}
      {cancelResultModalOpen && cancelResult && (
        <div className="modal-overlay" onClick={closeCancelResultModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{cancelResult.success ? 'Job Cancelled' : 'Cancellation Failed'}</h2>
              <button className="modal-close" onClick={closeCancelResultModal}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                {cancelResult.success ? (
                  <FiCheckCircle size={48} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <FiXCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    {cancelResult.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeCancelResultModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Jobs;
