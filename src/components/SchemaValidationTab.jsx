import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiFolder, FiSearch, FiPlay, FiClock, FiCheck, FiX, FiDownload, FiRefreshCw, FiFileText, FiAlertCircle } from 'react-icons/fi';
import S3FolderBrowser from './S3FolderBrowser';
import ErrorModal from './ErrorModal';
import './BulkProfilingTab.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function SchemaValidationTab({ selectedProject: initialProject }) {
  const [connections, setConnections] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(initialProject || null);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [s3Path, setS3Path] = useState('');
  const [filePattern, setFilePattern] = useState('*');
  const [recursive, setRecursive] = useState(false);
  
  const [vendorAgreements, setVendorAgreements] = useState([]);
  const [selectedAgreement, setSelectedAgreement] = useState('');
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  
  const [discoveredFiles, setDiscoveredFiles] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [error, setError] = useState(null);
  const [createdJob, setCreatedJob] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  
  const [viewMode, setViewMode] = useState('create');
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  
  const [executionType, setExecutionType] = useState('manual');
  const [scheduleType, setScheduleType] = useState('recurring');
  const [cronExpression, setCronExpression] = useState('0 0 * * *');
  const [scheduleStartDate, setScheduleStartDate] = useState('');

  useEffect(() => {
    if (initialProject) {
      setSelectedProject(initialProject);
    }
  }, [initialProject]);

  useEffect(() => {
    fetchConnections();
    fetchProjects();
  }, []);
  
  useEffect(() => {
    if (createdJob && ['running', 'pending'].includes(jobStatus?.status)) {
      const interval = setInterval(() => {
        fetchJobStatus(createdJob.id);
      }, 2000);
      
      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [createdJob, jobStatus]);

  useEffect(() => {
    if (viewMode === 'scheduled') {
      fetchScheduledJobs();
    } else if (viewMode === 'completed') {
      fetchCompletedJobs();
    }
  }, [viewMode]);

  useEffect(() => {
    if (selectedProject) {
      fetchVendorAgreements(selectedProject);
    } else {
      setVendorAgreements([]);
      setSelectedAgreement('');
    }
  }, [selectedProject]);

  const fetchConnections = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/connections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const awsConnections = response.data.filter(conn => conn.type === 'aws');
      setConnections(awsConnections);
    } catch (err) {
      console.error('Error fetching connections:', err);
      setError('Failed to load connections');
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setProjects(response.data);
      
      if (!selectedProject) {
        const defaultProject = response.data.find(p => p.name === 'Default Project' || p.is_default);
        if (defaultProject) {
          setSelectedProject(defaultProject.id);
        }
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchVendorAgreements = async (projectId) => {
    setLoadingAgreements(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/vendor-agreements`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { project_id: projectId }
      });
      
      setVendorAgreements(response.data.agreements || response.data || []);
    } catch (err) {
      console.error('Error fetching vendor agreements:', err);
      setVendorAgreements([]);
    } finally {
      setLoadingAgreements(false);
    }
  };

  const fetchScheduledJobs = async () => {
    setIsLoadingScheduled(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/schema-validation/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setScheduledJobs(response.data.schedules || []);
    } catch (err) {
      console.error('Error fetching scheduled jobs:', err);
      setError('Failed to load scheduled jobs');
    } finally {
      setIsLoadingScheduled(false);
    }
  };

  const fetchCompletedJobs = async () => {
    setIsLoadingCompleted(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/schema-validation/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'completed' }
      });
      
      setCompletedJobs(response.data.jobs || []);
    } catch (err) {
      console.error('Error fetching completed jobs:', err);
      setError('Failed to load completed jobs');
    } finally {
      setIsLoadingCompleted(false);
    }
  };

  const handleCancelSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to cancel this scheduled job?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/api/schema-validation/schedules/${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      fetchScheduledJobs();
    } catch (err) {
      console.error('Error canceling schedule:', err);
      setError('Failed to cancel schedule');
    }
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule) return;

    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_BASE_URL}/api/schema-validation/schedules/${editingSchedule.id}`,
        {
          cronExpression: editingSchedule.cron_expression,
          isActive: editingSchedule.is_active
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      setEditingSchedule(null);
      fetchScheduledJobs();
    } catch (err) {
      console.error('Error updating schedule:', err);
      setError('Failed to update schedule');
    }
  };

  const handleDiscover = async () => {
    if (!selectedConnection || !s3Path) {
      setError('Please select a connection and enter an S3 path');
      return;
    }

    setIsDiscovering(true);
    setError(null);
    setDiscoveredFiles([]);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/api/bulk-profiling/discover`,
        {
          connectionId: selectedConnection,
          s3Path,
          filePattern,
          recursive
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setDiscoveredFiles(response.data.files);
      if (response.data.files.length === 0) {
        setError('No compatible files found at the specified location');
      }
    } catch (err) {
      console.error('Error discovering files:', err);
      setError(err.response?.data?.message || 'Failed to discover files');
    } finally {
      setIsDiscovering(false);
    }
  };

  const fetchJobStatus = async (jobId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/api/schema-validation/jobs/${jobId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      setJobStatus(response.data.job);
    } catch (err) {
      console.error('Error fetching job status:', err);
    }
  };

  const handleCreateJob = async () => {
    if (discoveredFiles.length === 0) {
      setError('No files to validate');
      return;
    }

    if (!selectedProject) {
      setError('Please select a project');
      return;
    }

    if (!selectedAgreement) {
      setError('Please select a vendor agreement for schema validation');
      return;
    }

    if (executionType === 'scheduled') {
      if (scheduleType === 'recurring' && !cronExpression) {
        setError('Please provide a cron expression');
        return;
      }
      if (scheduleType === 'one-time' && !scheduleStartDate) {
        setError('Please select a start date and time');
        return;
      }
    }

    setIsCreatingJob(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const jobData = {
        jobName: `Schema Validation - ${s3Path}`,
        projectId: selectedProject,
        connectionId: selectedConnection,
        vendorAgreementId: selectedAgreement,
        s3Path,
        filePattern,
        recursive,
        files: discoveredFiles.map(f => f.key),
        executionType,
        scheduleType: executionType === 'scheduled' ? scheduleType : null,
        cronExpression: executionType === 'scheduled' && scheduleType === 'recurring' ? cronExpression : null,
        scheduleStartDate: executionType === 'scheduled' && scheduleType === 'one-time' ? scheduleStartDate : null
      };

      const response = await axios.post(
        `${API_BASE_URL}/api/schema-validation/jobs`,
        jobData,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (executionType === 'scheduled') {
        setViewMode('scheduled');
        fetchScheduledJobs();
      } else {
        setCreatedJob(response.data.job);
        setJobStatus(response.data.job);
      }
    } catch (err) {
      console.error('Error creating job:', err);
      setError(err.response?.data?.message || 'Failed to create validation job');
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleDownloadReport = async (jobId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/api/schema-validation/jobs/${jobId}/report`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      const contentDisposition = response.headers['content-disposition'];
      let filename = `schema-validation-report-${jobId}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) filename = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading report:', err);
      setError('Failed to download report');
    }
  };

  const handleSelectPath = (path) => {
    setS3Path(path);
    setShowBrowser(false);
    setDiscoveredFiles([]);
  };

  const resetForm = () => {
    setCreatedJob(null);
    setJobStatus(null);
    setDiscoveredFiles([]);
    setS3Path('');
    setFilePattern('*');
    setRecursive(false);
    setSelectedAgreement('');
    setExecutionType('manual');
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: { bg: '#fef3c7', color: '#92400e', icon: FiClock },
      running: { bg: '#dbeafe', color: '#1e40af', icon: FiRefreshCw },
      completed: { bg: '#d1fae5', color: '#065f46', icon: FiCheck },
      failed: { bg: '#fee2e2', color: '#991b1b', icon: FiX }
    };

    const style = statusStyles[status] || statusStyles.pending;
    const Icon = style.icon;

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.color
      }}>
        <Icon size={12} className={status === 'running' ? 'spin-animation' : ''} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="bulk-profiling-tab">
      <div className="bulk-profiling-header">
        <div>
          <h3>Schema Validation from S3</h3>
          <p>Validate files against vendor agreement schemas without storing to database</p>
        </div>
      </div>

      <div className="bulk-profiling-tabs">
        <button
          className={`bulk-profiling-tab-btn ${viewMode === 'create' ? 'active' : ''}`}
          onClick={() => setViewMode('create')}
        >
          Create New Job
        </button>
        <button
          className={`bulk-profiling-tab-btn ${viewMode === 'scheduled' ? 'active' : ''}`}
          onClick={() => setViewMode('scheduled')}
        >
          Scheduled Jobs
        </button>
        <button
          className={`bulk-profiling-tab-btn ${viewMode === 'completed' ? 'active' : ''}`}
          onClick={() => setViewMode('completed')}
        >
          Completed Jobs
        </button>
      </div>

      {viewMode === 'create' && (
        <>
          {createdJob ? (
            <div className="job-status-section">
              <div className="job-status-header">
                <h4>Validation Job: {createdJob.job_name}</h4>
                {getStatusBadge(jobStatus?.status || 'pending')}
              </div>
              
              {jobStatus && (
                <div className="job-progress">
                  <div className="progress-stats">
                    <span>Processed: {jobStatus.processed_count || 0} / {jobStatus.total_files || 0}</span>
                    <span>Valid: {jobStatus.valid_count || 0}</span>
                    <span>Invalid: {jobStatus.invalid_count || 0}</span>
                  </div>
                  
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${jobStatus.total_files > 0 ? ((jobStatus.processed_count || 0) / jobStatus.total_files) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {jobStatus?.status === 'completed' && (
                <div className="job-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleDownloadReport(createdJob.id)}
                  >
                    <FiDownload /> Download Report
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={resetForm}
                  >
                    Create New Job
                  </button>
                </div>
              )}

              {jobStatus?.status === 'failed' && (
                <div className="job-error">
                  <FiAlertCircle />
                  <span>{jobStatus.error_message || 'Job failed unexpectedly'}</span>
                  <button className="btn btn-secondary" onClick={resetForm}>
                    Try Again
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="bulk-profiling-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Project <span className="required">*</span></label>
                    <select
                      value={selectedProject || ''}
                      onChange={(e) => setSelectedProject(Number(e.target.value))}
                    >
                      <option value="">Select a project...</option>
                      {projects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <span className="form-help">Files will be validated for this project</span>
                  </div>

                  <div className="form-group">
                    <label>Vendor Agreement <span className="required">*</span></label>
                    <select
                      value={selectedAgreement}
                      onChange={(e) => setSelectedAgreement(e.target.value)}
                      disabled={loadingAgreements || !selectedProject}
                    >
                      <option value="">Select a vendor agreement...</option>
                      {vendorAgreements.map(agreement => (
                        <option key={agreement.id} value={agreement.id}>
                          {agreement.vendor_name} - {agreement.name}
                        </option>
                      ))}
                    </select>
                    <span className="form-help">Schema contract to validate against</span>
                  </div>

                  <div className="form-group">
                    <label>S3 Connection <span className="required">*</span></label>
                    <select
                      value={selectedConnection}
                      onChange={(e) => setSelectedConnection(e.target.value)}
                    >
                      <option value="">Select a connection...</option>
                      {connections.map(conn => (
                        <option key={conn.id} value={conn.id}>
                          {conn.name}
                        </option>
                      ))}
                    </select>
                    <span className="form-help">S3 connection to discover files from</span>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>File Pattern</label>
                    <input
                      type="text"
                      value={filePattern}
                      onChange={(e) => setFilePattern(e.target.value)}
                      placeholder="*.csv, sales_*.json, etc."
                    />
                    <span className="form-help">Use * for all files, or patterns like sales_*.csv</span>
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={recursive}
                        onChange={(e) => setRecursive(e.target.checked)}
                      />
                      Scan subdirectories recursively
                    </label>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group form-group-wide">
                    <label>S3 Path <span className="required">*</span></label>
                    <div className="path-input-container">
                      <input
                        type="text"
                        value={s3Path}
                        onChange={(e) => setS3Path(e.target.value)}
                        placeholder="s3://bucket-name/path/to/files/ or /path/to/files/"
                      />
                      <button 
                        className="btn btn-secondary"
                        onClick={() => setShowBrowser(true)}
                        disabled={!selectedConnection}
                      >
                        <FiFolder /> Browse
                      </button>
                    </div>
                    <span className="form-help">Select a connection first to enable browsing</span>
                  </div>
                </div>

                <div className="form-section">
                  <h4><FiClock /> Execution Type</h4>
                  <div className="form-row">
                    <div className="form-group form-group-wide">
                      <select
                        value={executionType}
                        onChange={(e) => setExecutionType(e.target.value)}
                      >
                        <option value="manual">Run Now (Manual)</option>
                        <option value="scheduled">Schedule for Later</option>
                      </select>
                    </div>
                  </div>

                  {executionType === 'scheduled' && (
                    <div className="schedule-options">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Schedule Type</label>
                          <select
                            value={scheduleType}
                            onChange={(e) => setScheduleType(e.target.value)}
                          >
                            <option value="recurring">Recurring (Cron)</option>
                            <option value="one-time">One-Time</option>
                          </select>
                        </div>

                        {scheduleType === 'recurring' ? (
                          <div className="form-group">
                            <label>Cron Expression</label>
                            <input
                              type="text"
                              value={cronExpression}
                              onChange={(e) => setCronExpression(e.target.value)}
                              placeholder="0 0 * * *"
                            />
                            <span className="form-help">e.g., 0 0 * * * (daily at midnight)</span>
                          </div>
                        ) : (
                          <div className="form-group">
                            <label>Start Date & Time</label>
                            <input
                              type="datetime-local"
                              value={scheduleStartDate}
                              onChange={(e) => setScheduleStartDate(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={handleDiscover}
                    disabled={isDiscovering || !selectedConnection || !s3Path}
                  >
                    {isDiscovering ? (
                      <><FiRefreshCw className="spin-animation" /> Discovering...</>
                    ) : (
                      <><FiSearch /> Discover Files</>
                    )}
                  </button>
                </div>
              </div>

              {discoveredFiles.length > 0 && (
                <div className="discovered-files-section">
                  <div className="discovered-files-header">
                    <h4>Discovered Files ({discoveredFiles.length})</h4>
                  </div>
                  
                  <div className="discovered-files-list">
                    <table className="files-table">
                      <thead>
                        <tr>
                          <th>File Name</th>
                          <th>Size</th>
                          <th>Last Modified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discoveredFiles.slice(0, 100).map((file, index) => (
                          <tr key={index}>
                            <td>{file.key}</td>
                            <td>{formatFileSize(file.size)}</td>
                            <td>{formatDate(file.lastModified)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {discoveredFiles.length > 100 && (
                      <div className="more-files-note">
                        ... and {discoveredFiles.length - 100} more files
                      </div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleCreateJob}
                      disabled={isCreatingJob || !selectedAgreement}
                    >
                      {isCreatingJob ? (
                        <><FiRefreshCw className="spin-animation" /> Creating Job...</>
                      ) : executionType === 'scheduled' ? (
                        <><FiClock /> Schedule Validation Job</>
                      ) : (
                        <><FiPlay /> Start Validation</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {viewMode === 'scheduled' && (
        <div className="scheduled-jobs-section">
          <div className="scheduled-jobs-header">
            <h4>Scheduled Schema Validation Jobs</h4>
            <button className="btn btn-secondary" onClick={fetchScheduledJobs}>
              <FiRefreshCw /> Refresh
            </button>
          </div>

          {isLoadingScheduled ? (
            <div className="loading-state">Loading scheduled jobs...</div>
          ) : scheduledJobs.length === 0 ? (
            <div className="empty-state">No scheduled validation jobs found</div>
          ) : (
            <table className="scheduled-jobs-table">
              <thead>
                <tr>
                  <th>Job Name</th>
                  <th>Schedule</th>
                  <th>Next Run</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scheduledJobs.map(job => (
                  <tr key={job.id}>
                    <td>{job.job_name}</td>
                    <td>{job.cron_expression || 'One-time'}</td>
                    <td>{formatDate(job.next_run_at)}</td>
                    <td>{getStatusBadge(job.is_active ? 'pending' : 'paused')}</td>
                    <td>
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleCancelSchedule(job.id)}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {viewMode === 'completed' && (
        <div className="completed-jobs-section">
          <div className="completed-jobs-header">
            <h4>Completed Validation Jobs</h4>
            <button className="btn btn-secondary" onClick={fetchCompletedJobs}>
              <FiRefreshCw /> Refresh
            </button>
          </div>

          {isLoadingCompleted ? (
            <div className="loading-state">Loading completed jobs...</div>
          ) : completedJobs.length === 0 ? (
            <div className="empty-state">No completed validation jobs found</div>
          ) : (
            <table className="completed-jobs-table">
              <thead>
                <tr>
                  <th>Job Name</th>
                  <th>Files</th>
                  <th>Valid</th>
                  <th>Invalid</th>
                  <th>Completed</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {completedJobs.map(job => (
                  <tr key={job.id}>
                    <td>{job.job_name}</td>
                    <td>{job.total_files}</td>
                    <td style={{ color: '#065f46' }}>{job.valid_count}</td>
                    <td style={{ color: job.invalid_count > 0 ? '#991b1b' : '#065f46' }}>
                      {job.invalid_count}
                    </td>
                    <td>{formatDate(job.completed_at)}</td>
                    <td>
                      {job.report_path ? (
                        <button
                          className="btn btn-small btn-primary"
                          onClick={() => handleDownloadReport(job.id)}
                        >
                          <FiDownload /> Download
                        </button>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Expired</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showBrowser && (
        <S3FolderBrowser
          connectionId={selectedConnection}
          onSelect={handleSelectPath}
          onClose={() => setShowBrowser(false)}
        />
      )}

      <ErrorModal 
        message={error} 
        onClose={() => setError(null)} 
      />
    </div>
  );
}

export default SchemaValidationTab;
