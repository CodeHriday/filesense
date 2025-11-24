import React, { useState, useEffect, useRef } from 'react';
import { FiEye, FiX, FiClock, FiCheckCircle, FiXCircle, FiAlertCircle, FiRefreshCw, FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate, formatTimestampWithMicroseconds } from '../utils/formatters';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const isFetching = useRef(false);

  useEffect(() => {
    fetchJobs();
    
    // Refresh jobs every 60 seconds (reduced from 10s to prevent rate limiting)
    const interval = setInterval(() => {
      // Only poll if tab is visible
      if (document.visibilityState === 'visible') {
        fetchJobs();
      }
    }, 60000);
    
    // Resume polling when tab becomes visible
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

  const parseCronExpression = (cronExpr) => {
    if (!cronExpr) return null;
    
    const parts = cronExpr.trim().split(' ');
    if (parts.length < 5) return cronExpr;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    // Every minute: * * * * *
    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every minute';
    }
    
    // Every N minutes: */N * * * *
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const interval = minute.substring(2);
      return `Every ${interval} minute${interval !== '1' ? 's' : ''}`;
    }
    
    // Every hour: 0 * * * *
    if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && minute === '0') {
      return 'Every hour';
    }
    
    // Every N hours: 0 */N * * *
    if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && minute === '0') {
      const interval = hour.substring(2);
      return `Every ${interval} hour${interval !== '1' ? 's' : ''}`;
    }
    
    // Daily at midnight: 0 0 * * *
    if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Daily at midnight';
    }
    
    // Daily at specific time
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && hour !== '*' && minute !== '*' && !hour.includes('*') && !minute.includes('*')) {
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
      return `Daily at ${displayHour}:${minuteNum.toString().padStart(2, '0')} ${ampm}`;
    }
    
    // Weekly on specific day
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*' && hour !== '*' && minute !== '*' && !dayOfWeek.includes('*')) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
      return `Weekly on ${dayName} at ${displayHour}:${minuteNum.toString().padStart(2, '0')} ${ampm}`;
    }
    
    // Monthly on specific day
    if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*' && hour !== '*' && minute !== '*' && !dayOfMonth.includes('*')) {
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const displayHour = hourNum > 12 ? hourNum - 12 : (hourNum === 0 ? 12 : hourNum);
      return `Monthly on day ${dayOfMonth} at ${displayHour}:${minuteNum.toString().padStart(2, '0')} ${ampm}`;
    }
    
    // Hourly at specific minute
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && hour === '*' && minute !== '*' && minute !== '0') {
      return `Hourly at minute ${minute}`;
    }
    
    // Return original if no pattern matches
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
          gap: '0.25rem',
          padding: '0.15rem 0.5rem',
          borderRadius: '10px',
          fontSize: '10px',
          fontWeight: '500',
          color: config.color,
          backgroundColor: config.bg
        }}
      >
        <Icon size={10} />
        {config.text}
      </span>
    );
  };

  // Filter jobs based on search term
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentJobs = filteredJobs.slice(startIndex, endIndex);

  // Clamp currentPage when filtered results shrink
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
    setCurrentPage(1); // Reset to first page
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="jobs-container">
      <div className="jobs-header">
        <div>
          <h1 className="jobs-title">Jobs Log</h1>
          <p className="jobs-subtitle">Monitor and manage ETL transformation job executions</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: '300px' }}>
            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.5rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>
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
        {filteredJobs.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <FiClock size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
            <h3>{searchTerm ? 'No jobs found' : 'No jobs yet'}</h3>
            <p>{searchTerm ? 'Try adjusting your search criteria' : 'Job executions will appear here when mappings are executed'}</p>
          </div>
        ) : (
          <>
            <div className="jobs-table-container">
              <table className="jobs-table">
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
                      <td className="job-id-cell">
                        <code>{job.job_id}</code>
                      </td>
                      <td>{job.project_name || 'Default Project'}</td>
                      <td>{job.mapping_name}</td>
                      <td>{job.mapping_group_name || '-'}</td>
                      <td>{job.workflow_name || '-'}</td>
                      <td>{formatScheduleInfo(job)}</td>
                      <td>{getStatusBadge(job.status)}</td>
                      <td>
                        {job.schema_validation ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.25rem',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: '500',
                              backgroundColor: job.schema_validation === 'Pass' ? '#d1fae5' : '#fee2e2',
                              color: job.schema_validation === 'Pass' ? '#10b981' : '#ef4444'
                            }}
                          >
                            {job.schema_validation === 'Pass' ? <FiCheckCircle size={10} /> : <FiXCircle size={10} />}
                            {job.schema_validation}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '10px' }}>N/A</span>
                        )}
                      </td>
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
            
            {/* Pagination Controls */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1rem', 
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredJobs.length)} of {filteredJobs.length} jobs
                  {searchTerm && ` (filtered from ${jobs.length} total)`}
                </span>
                <select 
                  value={itemsPerPage} 
                  onChange={handleItemsPerPageChange}
                  style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px', 
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: currentPage === 1 ? '#f1f5f9' : 'white',
                    color: currentPage === 1 ? '#94a3b8' : '#334155',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.9rem'
                  }}
                >
                  <FiChevronLeft size={16} />
                  Previous
                </button>

                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      return page === 1 || 
                             page === totalPages || 
                             Math.abs(page - currentPage) <= 1;
                    })
                    .map((page, index, array) => (
                      <React.Fragment key={page}>
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span style={{ padding: '0 0.25rem', color: '#94a3b8' }}>...</span>
                        )}
                        <button
                          onClick={() => handlePageChange(page)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: currentPage === page ? '#3b82f6' : 'white',
                            color: currentPage === page ? 'white' : '#334155',
                            cursor: 'pointer',
                            fontWeight: currentPage === page ? '600' : '400',
                            minWidth: '40px',
                            fontSize: '0.9rem'
                          }}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: currentPage === totalPages ? '#f1f5f9' : 'white',
                    color: currentPage === totalPages ? '#94a3b8' : '#334155',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.9rem'
                  }}
                >
                  Next
                  <FiChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
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
                      <div>{selectedJob.start_time ? formatTimestampWithMicroseconds(selectedJob.start_time) : '-'}</div>
                    </div>
                    <div>
                      <strong>End Time:</strong>
                      <div>{selectedJob.end_time ? formatTimestampWithMicroseconds(selectedJob.end_time) : '-'}</div>
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
