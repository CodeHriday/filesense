import React, { useState, useEffect, useRef } from 'react';
import { FiEye, FiX, FiClock, FiCheckCircle, FiXCircle, FiAlertCircle, FiRefreshCw, FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate, formatTimestampWithMicroseconds } from '../utils/formatters';
import '../styles/global-page-styles.css';

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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const isFetching = useRef(false);

  useEffect(() => {
    fetchJobs();
  }, []);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchJobs();
      }
    }, 60000);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchJobs();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchJobs = async (isManualRefresh = false) => {
    if (isFetching.current) return;
    
    isFetching.current = true;
    if (isManualRefresh) setRefreshing(true);
    
    try {
      // Add cache-busting timestamp for manual refresh to force fresh data
      const cacheBuster = isManualRefresh ? `&_t=${Date.now()}` : '';
      const response = await axios.get(`${API_BASE_URL}/api/jobs?limit=100${cacheBuster}`, {
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          ...(isManualRefresh && { 'Cache-Control': 'no-cache' })
        }
      });
      setJobs(response.data?.jobs || []);
      setError(null);
      setLastRefreshed(new Date());
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
      const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/full`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setSelectedJob(response.data.job);
      setJobLogs(response.data.logs || []);
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

  const parseCronExpression = (cronExpr) => {
    if (!cronExpr) return null;
    
    const parts = cronExpr.trim().split(' ');
    if (parts.length < 5) return cronExpr;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every minute';
    }
    
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const interval = minute.substring(2);
      return `Every ${interval} minute${interval !== '1' ? 's' : ''}`;
    }
    
    if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && minute === '0') {
      return 'Every hour';
    }
    
    if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && minute === '0') {
      const interval = hour.substring(2);
      return `Every ${interval} hour${interval !== '1' ? 's' : ''}`;
    }
    
    if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Daily at midnight';
    }
    
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && hour !== '*' && minute !== '*' && !hour.includes('*') && !minute.includes('*')) {
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
      return `Daily at ${displayHour}:${minuteNum.toString().padStart(2, '0')} ${ampm}`;
    }
    
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && hour !== '*' && minute !== '*' && !dayOfWeek.includes('*')) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
      return `Weekly on ${dayName} at ${displayHour}:${minuteNum.toString().padStart(2, '0')} ${ampm}`;
    }
    
    if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*' && hour !== '*' && minute !== '*' && !dayOfMonth.includes('*')) {
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
      return `Monthly on day ${dayOfMonth} at ${displayHour}:${minuteNum.toString().padStart(2, '0')} ${ampm}`;
    }
    
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && hour === '*' && minute !== '*' && minute !== '0') {
      return `Hourly at minute ${minute}`;
    }
    
    return cronExpr;
  };

  const formatScheduleInfo = (job) => {
    if (!job.schedule_id) return '-';
    
    let frequency = '';
    if (job.schedule_type === 'cron' && job.cron_expression) {
      frequency = parseCronExpression(job.cron_expression);
    } else if (job.schedule_type === 'interval') {
      frequency = `Every ${job.interval_value} ${job.interval_unit}${job.interval_value > 1 ? 's' : ''}`;
    }
    
    return (
      <div style={{ fontSize: '10px' }}>
        {frequency && (
          <div style={{ fontWeight: '500', color: '#334155' }}>
            {frequency}
          </div>
        )}
        {job.schedule_name && (
          <div style={{ fontSize: '9px', color: '#64748b', marginTop: '1px' }}>
            {job.schedule_name}
          </div>
        )}
      </div>
    );
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { icon: FiClock, badgeClass: 'gps-badge gps-badge--pending', text: 'Pending' },
      running: { icon: FiRefreshCw, badgeClass: 'gps-badge gps-badge--info', text: 'Running' },
      completed: { icon: FiCheckCircle, badgeClass: 'gps-badge gps-badge--success', text: 'Completed' },
      failed: { icon: FiXCircle, badgeClass: 'gps-badge gps-badge--danger', text: 'Failed' },
      cancelled: { icon: FiAlertCircle, badgeClass: 'gps-badge gps-badge--warning', text: 'Cancelled' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={config.badgeClass} style={{ gap: '4px' }}>
        <Icon size={10} />
        {config.text}
      </span>
    );
  };

  const getSchemaValidationBadge = (validation) => {
    if (!validation) {
      return <span style={{ color: '#94a3b8', fontSize: '10px' }}>N/A</span>;
    }
    
    const isPass = validation === 'Pass';
    return (
      <span className={`gps-badge ${isPass ? 'gps-badge--success' : 'gps-badge--danger'}`} style={{ gap: '4px' }}>
        {isPass ? <FiCheckCircle size={10} /> : <FiXCircle size={10} />}
        {validation}
      </span>
    );
  };

  const filteredJobs = jobs.filter(job => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (job.job_id?.toString() || '').toLowerCase().includes(searchLower) ||
      (job.mapping_name || '').toLowerCase().includes(searchLower) ||
      (job.project_name || '').toLowerCase().includes(searchLower) ||
      (job.status || '').toLowerCase().includes(searchLower) ||
      (job.mapping_group_name || '').toLowerCase().includes(searchLower) ||
      (job.workflow_name || '').toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentJobs = filteredJobs.slice(startIndex, endIndex);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (filteredJobs.length === 0 && currentPage > 1) {
      setCurrentPage(1);
    }
  }, [filteredJobs.length, currentPage, totalPages]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="gps-page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Jobs Log</h1>
          <p className="gps-page-subtitle">Monitor and manage ETL transformation job executions</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastRefreshed && (
            <span style={{ fontSize: '10px', color: '#6b7280' }}>
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button 
            className="gps-btn gps-btn--secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh jobs"
          >
            <FiRefreshCw size={16} className={refreshing ? 'spinning' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="gps-filters">
        <div className="gps-search-container">
          <FiSearch className="gps-search-icon" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="gps-search-input"
            style={{ minWidth: '280px' }}
          />
        </div>
        <select 
          value={itemsPerPage} 
          onChange={handleItemsPerPageChange}
          className="gps-filter-select"
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>

      {error && (
        <div className="gps-alert-danger">
          <FiAlertCircle /> {error}
        </div>
      )}

      {filteredJobs.length > 0 && (
        <div className="gps-results-info">
          Showing {startIndex + 1} to {Math.min(endIndex, filteredJobs.length)} of {filteredJobs.length} jobs
          {searchTerm && ` (filtered from ${jobs.length} total)`}
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <div className="gps-empty-state">
          <FiClock size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '12px', fontWeight: 600 }}>
            {searchTerm ? 'No jobs found' : 'No jobs yet'}
          </h3>
          <p style={{ margin: 0 }}>
            {searchTerm ? 'Try adjusting your search criteria' : 'Job executions will appear here when mappings are executed'}
          </p>
        </div>
      ) : (
        <>
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Project</th>
                  <th>Mapping</th>
                  <th>Mapping Group</th>
                  <th>Workflow</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Schema Validation</th>
                  <th style={{ textAlign: 'center' }}>Files Processed</th>
                  <th>Rows</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentJobs.map(job => (
                  <tr key={job.job_id}>
                    <td>
                      <code style={{ fontSize: '10px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {job.job_id}
                      </code>
                    </td>
                    <td>{job.project_name || 'Default Project'}</td>
                    <td>{job.mapping_name}</td>
                    <td>{job.mapping_group_name || '-'}</td>
                    <td>{job.workflow_name || '-'}</td>
                    <td>{formatScheduleInfo(job)}</td>
                    <td>{getStatusBadge(job.status)}</td>
                    <td>{getSchemaValidationBadge(job.schema_validation)}</td>
                    <td style={{ textAlign: 'center' }}>{job.files_processed || 0}</td>
                    <td>
                      {job.rows_read ? (
                        <span>
                          {job.rows_read.toLocaleString()}
                          {job.rows_written && ` → ${job.rows_written.toLocaleString()}`}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {job.start_time ? formatTimestampWithMicroseconds(job.start_time) : '-'}
                    </td>
                    <td>
                      {job.end_time ? formatTimestampWithMicroseconds(job.end_time) : '-'}
                    </td>
                    <td>
                      {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(2)}s` : '-'}
                    </td>
                    <td>
                      <div className="gps-action-buttons">
                        <button
                          className="gps-icon-btn gps-icon-btn-primary"
                          onClick={() => handleViewJob(job.job_id)}
                          title="View job details"
                        >
                          <FiEye />
                        </button>
                        {job.status === 'running' && (
                          <button
                            className="gps-icon-btn gps-icon-btn-danger"
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
          
          {totalPages > 1 && (
            <div className="gps-pagination" style={{ justifyContent: 'flex-end', paddingTop: '16px' }}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="gps-btn-secondary"
                style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
              >
                <FiChevronLeft size={14} />
                Previous
              </button>

              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    return page === 1 || 
                           page === totalPages || 
                           Math.abs(page - currentPage) <= 1;
                  })
                  .map((page, index, array) => (
                    <React.Fragment key={page}>
                      {index > 0 && array[index - 1] !== page - 1 && (
                        <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(page)}
                        className={currentPage === page ? 'gps-btn-primary' : 'gps-btn-secondary'}
                        style={{ minWidth: '36px', padding: '6px 10px' }}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  ))}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="gps-btn-secondary"
                style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
              >
                Next
                <FiChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {jobDetailsModalOpen && (
        <div className="gps-modal-overlay" onClick={closeJobDetailsModal}>
          <div className="gps-modal gps-modal--large" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2>Job Details</h2>
              <button className="gps-modal-close" onClick={closeJobDetailsModal}>
                <FiX />
              </button>
            </div>
            
            <div className="gps-modal-body">
              {loadingJobDetails ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <LoadingSpinner />
                </div>
              ) : selectedJob ? (
                <div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '1rem', 
                    marginBottom: '2rem',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '11px'
                  }}>
                    <div>
                      <strong style={{ color: '#64748b' }}>Job ID:</strong>
                      <div><code style={{ fontSize: '10px' }}>{selectedJob.job_id}</code></div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>Mapping:</strong>
                      <div>{selectedJob.mapping_name}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>Status:</strong>
                      <div>{getStatusBadge(selectedJob.status)}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>Files Processed:</strong>
                      <div>{selectedJob.files_processed || 0}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>Rows Read:</strong>
                      <div>{selectedJob.rows_read?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>Rows Written:</strong>
                      <div>{selectedJob.rows_written?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>Start Time:</strong>
                      <div>{selectedJob.start_time ? formatTimestampWithMicroseconds(selectedJob.start_time) : '-'}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#64748b' }}>End Time:</strong>
                      <div>{selectedJob.end_time ? formatTimestampWithMicroseconds(selectedJob.end_time) : '-'}</div>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ marginBottom: '1rem', fontSize: '12px', fontWeight: 600, color: '#025043' }}>Execution Logs</h3>
                    <div style={{ 
                      maxHeight: '400px', 
                      overflowY: 'auto', 
                      background: '#1e293b', 
                      padding: '1rem', 
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '11px'
                    }}>
                      {jobLogs.length === 0 ? (
                        <div style={{ color: '#94a3b8' }}>No logs available</div>
                      ) : (
                        jobLogs.map((log, index) => (
                          <div 
                            key={`job-log-${log.timestamp || log.level || index}`} 
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

      {cancelModalOpen && (
        <div className="gps-modal-overlay" onClick={closeCancelModal}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2>Cancel Job</h2>
              <button className="gps-modal-close" onClick={closeCancelModal}>
                <FiX />
              </button>
            </div>
            <div className="gps-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <FiAlertCircle size={48} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <div style={{ fontSize: '11px' }}>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500 }}>
                    Are you sure you want to cancel this job?
                  </p>
                  <p style={{ margin: 0, color: '#64748b' }}>
                    Job ID: <code style={{ fontSize: '10px' }}>{jobToCancel}</code>
                  </p>
                  <p style={{ margin: 0, marginTop: '0.5rem', color: '#64748b' }}>
                    This action will stop the job execution. Any partially processed data will not be saved.
                  </p>
                </div>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button className="gps-btn-secondary" onClick={closeCancelModal}>
                No, Keep Running
              </button>
              <button className="gps-btn-danger" onClick={confirmCancelJob}>
                <FiX /> Yes, Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelResultModalOpen && cancelResult && (
        <div className="gps-modal-overlay" onClick={closeCancelResultModal}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2>{cancelResult.success ? 'Job Cancelled' : 'Cancellation Failed'}</h2>
              <button className="gps-modal-close" onClick={closeCancelResultModal}>
                <FiX />
              </button>
            </div>
            <div className="gps-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                {cancelResult.success ? (
                  <FiCheckCircle size={48} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <FiXCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <div style={{ fontSize: '11px' }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    {cancelResult.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="gps-modal-footer">
              <button className="gps-btn-primary" onClick={closeCancelResultModal}>
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
