import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiFolder, FiSearch, FiPlay, FiClock, FiCheck, FiX, FiDownload, FiRefreshCw } from 'react-icons/fi';
import S3FolderBrowser from './S3FolderBrowser';
import ErrorModal from './ErrorModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function BulkProfilingTab({ selectedProject: initialProject }) {
  const [connections, setConnections] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(initialProject || null);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [s3Path, setS3Path] = useState('');
  const [filePattern, setFilePattern] = useState('*');
  const [duplicateHandling, setDuplicateHandling] = useState('skip');
  const [recursive, setRecursive] = useState(false);
  
  const [discoveredFiles, setDiscoveredFiles] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [error, setError] = useState(null);
  const [createdJob, setCreatedJob] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  
  // View mode: 'create' or 'scheduled'
  const [viewMode, setViewMode] = useState('create');
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  
  // Scheduling fields
  const [executionType, setExecutionType] = useState('manual'); // 'manual' or 'scheduled'
  const [scheduleType, setScheduleType] = useState('recurring'); // 'one-time' or 'recurring'
  const [cronExpression, setCronExpression] = useState('0 0 * * *'); // Daily at midnight
  const [scheduleStartDate, setScheduleStartDate] = useState('');

  // Update selected project when prop changes
  useEffect(() => {
    if (initialProject) {
      setSelectedProject(initialProject);
    }
  }, [initialProject]);

  // Fetch connections and projects on mount
  useEffect(() => {
    fetchConnections();
    fetchProjects();
  }, []);
  
  // Poll for job status when job is running
  useEffect(() => {
    if (createdJob && ['running', 'pending'].includes(jobStatus?.status)) {
      const interval = setInterval(() => {
        fetchJobStatus(createdJob.id);
      }, 2000); // Poll every 2 seconds
      
      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [createdJob, jobStatus]);

  // Fetch scheduled jobs when switching to scheduled view
  useEffect(() => {
    if (viewMode === 'scheduled') {
      fetchScheduledJobs();
    }
  }, [viewMode]);

  const fetchConnections = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/connections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filter to show only AWS S3 connections
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
      
      // If no project selected yet, try to select default
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

  const fetchScheduledJobs = async () => {
    setIsLoadingScheduled(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/bulk-profiling/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setScheduledJobs(response.data.schedules);
    } catch (err) {
      console.error('Error fetching scheduled jobs:', err);
      setError('Failed to load scheduled jobs');
    } finally {
      setIsLoadingScheduled(false);
    }
  };

  const handleCancelSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to cancel this scheduled job?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/api/bulk-profiling/schedules/${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh the list
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
        `${API_BASE_URL}/api/bulk-profiling/schedules/${editingSchedule.id}`,
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
        `${API_BASE_URL}/api/bulk-profiling/jobs/${jobId}`,
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
      setError('No files to profile');
      return;
    }

    if (!selectedProject) {
      setError('Please select a project');
      return;
    }

    // Validate scheduling fields
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
        jobName: `Bulk Profile - ${s3Path}`,
        projectId: selectedProject,
        connectionId: selectedConnection,
        s3Path,
        filePattern,
        duplicateHandling,
        recursive,
        executionType
      };

      // Add scheduling data if scheduled
      if (executionType === 'scheduled') {
        jobData.scheduleType = scheduleType;
        if (scheduleType === 'recurring') {
          jobData.cronExpression = cronExpression;
        } else {
          jobData.scheduleStartDate = scheduleStartDate;
        }
      }

      const response = await axios.post(
        `${API_BASE_URL}/api/bulk-profiling/jobs`,
        jobData,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const job = response.data.job;
      setCreatedJob(job);
      
      // Auto-scroll to top to show results
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Only start immediately if manual execution
      if (executionType === 'manual') {
        handleStartJob(job.id);
      }
    } catch (err) {
      console.error('Error creating job:', err);
      setError(err.response?.data?.message || 'Failed to create profiling job');
    } finally {
      setIsCreatingJob(false);
    }
  };
  
  const handleStartJob = async (jobId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/api/bulk-profiling/jobs/${jobId}/start`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      // Start polling for status
      fetchJobStatus(jobId);
    } catch (err) {
      console.error('Error starting job:', err);
      setError(err.response?.data?.message || 'Failed to start profiling job');
    }
  };

  const handleReset = () => {
    setS3Path('');
    setFilePattern('*');
    setDiscoveredFiles([]);
    setCreatedJob(null);
    setError(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  // Show scheduled job confirmation
  if (createdJob && createdJob.execution_type === 'scheduled' && !jobStatus) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: '#f0fdf4',
          border: '2px solid #10b981',
          borderRadius: '8px',
          padding: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
            <FiCheck size={32} style={{ color: '#10b981', marginRight: '1rem' }} />
            <div>
              <h2 style={{ margin: 0 }}>Bulk Profiling Job Scheduled</h2>
              <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                Job: {createdJob.job_name}
              </p>
            </div>
          </div>
          
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ marginBottom: '0.75rem' }}>
              <strong>Files to process:</strong> {createdJob.total_files} files
            </p>
            <p style={{ marginBottom: '0.75rem' }}>
              <strong>Schedule:</strong> {createdJob.schedule_type === 'recurring' ? 'Recurring' : 'One-time'}
            </p>
            {createdJob.schedule_type === 'recurring' && (
              <>
                <p style={{ marginBottom: '0.5rem' }}>
                  <strong>Frequency:</strong> {createdJob.frequency || 'Custom Schedule'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>Cron expression:</strong> <code style={{ 
                    background: '#f3f4f6', 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px' 
                  }}>{createdJob.cron_expression}</code>
                </p>
              </>
            )}
          </div>
          
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FiRefreshCw />
            Schedule Another Job
          </button>
        </div>
      </div>
    );
  }
  
  if (createdJob && jobStatus) {
    const isRunning = jobStatus.status === 'running' || jobStatus.status === 'pending';
    const isCompleted = jobStatus.status === 'completed';
    const isFailed = jobStatus.status === 'failed';
    const progress = jobStatus.total_files > 0 ? (jobStatus.processed_files / jobStatus.total_files) * 100 : 0;
    
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: isCompleted ? '#f0fdf4' : isFailed ? '#fef2f2' : '#f8f9fa',
          border: `2px solid ${isCompleted ? '#10b981' : isFailed ? '#ef4444' : '#6b7280'}`,
          borderRadius: '8px',
          padding: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
            {isRunning && <FiClock size={32} style={{ color: '#f59e0b', marginRight: '1rem' }} />}
            {isCompleted && <FiCheck size={32} style={{ color: '#10b981', marginRight: '1rem' }} />}
            {isFailed && <FiX size={32} style={{ color: '#ef4444', marginRight: '1rem' }} />}
            <div>
              <h2 style={{ margin: 0 }}>
                {isRunning && 'Bulk Profiling In Progress'}
                {isCompleted && 'Bulk Profiling Completed'}
                {isFailed && 'Bulk Profiling Failed'}
              </h2>
              <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                Job: {jobStatus.job_name}
              </p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              color: '#666'
            }}>
              <span>Progress: {jobStatus.processed_files} / {jobStatus.total_files} files</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              background: '#e5e7eb',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: isCompleted ? '#10b981' : isFailed ? '#ef4444' : '#3b82f6',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          
          {/* Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'white', borderRadius: '4px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                {jobStatus.successful_files}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>Successful</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'white', borderRadius: '4px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>
                {jobStatus.failed_files}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>Failed</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'white', borderRadius: '4px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6b7280' }}>
                {jobStatus.total_files - jobStatus.processed_files}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666' }}>Remaining</div>
            </div>
          </div>
          
          {/* File Details */}
          {jobStatus.files && jobStatus.files.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>File Details</h3>
              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                background: 'white'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                    <tr>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>File</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobStatus.files.map((file, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.5rem' }}>{file.file_name}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            background: 
                              file.status === 'completed' ? '#d1fae5' :
                              file.status === 'failed' ? '#fee2e2' :
                              file.status === 'processing' ? '#dbeafe' :
                              file.status === 'skipped' ? '#fef3c7' : '#f3f4f6',
                            color:
                              file.status === 'completed' ? '#065f46' :
                              file.status === 'failed' ? '#991b1b' :
                              file.status === 'processing' ? '#1e40af' :
                              file.status === 'skipped' ? '#92400e' : '#6b7280'
                          }}>
                            {file.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Error Message */}
          {jobStatus.error_message && (
            <div style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '4px',
              marginBottom: '1.5rem',
              color: '#991b1b'
            }}>
              <strong>Error:</strong> {jobStatus.error_message}
            </div>
          )}
          
          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            {!isRunning && (
              <button className="btn btn-secondary" onClick={handleReset}>
                Create Another Job
              </button>
            )}
            <button className="btn btn-primary" onClick={() => window.location.href = '/monitor'}>
              View in Monitor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <ErrorModal 
        message={error}
        onClose={() => setError(null)}
      />
      
      <h2 style={{ marginBottom: '1.5rem' }}>Bulk Profiling from S3</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Discover and profile multiple files from an S3 location automatically
      </p>

      {/* View Mode Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <button
          onClick={() => setViewMode('create')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: viewMode === 'create' ? '3px solid #3b82f6' : '3px solid transparent',
            color: viewMode === 'create' ? '#3b82f6' : '#6b7280',
            fontWeight: viewMode === 'create' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Create New Job
        </button>
        <button
          onClick={() => {
            setViewMode('scheduled');
            fetchScheduledJobs();
          }}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: viewMode === 'scheduled' ? '3px solid #3b82f6' : '3px solid transparent',
            color: viewMode === 'scheduled' ? '#3b82f6' : '#6b7280',
            fontWeight: viewMode === 'scheduled' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Scheduled Jobs
        </button>
      </div>

      {/* Scheduled Jobs View */}
      {viewMode === 'scheduled' && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>Scheduled Bulk Profiling Jobs</h3>
          {isLoadingScheduled ? (
            <p>Loading...</p>
          ) : scheduledJobs.length === 0 ? (
            <p style={{ color: '#666', padding: '2rem', textAlign: 'center', background: '#f9fafb', borderRadius: '8px' }}>
              No scheduled jobs found. Create a new job with scheduling enabled to see it here.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Job Name</th>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Frequency</th>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Cron Expression</th>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Next Run</th>
                    <th style={{ padding: '1rem', textAlign: 'left' }}>Last Run</th>
                    <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledJobs.map((schedule) => (
                    <tr key={schedule.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem' }}>{schedule.job_name}</td>
                      <td style={{ padding: '1rem' }}>{schedule.frequency}</td>
                      <td style={{ padding: '1rem' }}>
                        <code style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                          {schedule.cron_expression}
                        </code>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.875rem',
                          background: schedule.is_active ? '#d1fae5' : '#fee2e2',
                          color: schedule.is_active ? '#065f46' : '#991b1b'
                        }}>
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                        {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                        {schedule.last_run ? new Date(schedule.last_run).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setEditingSchedule(schedule)}
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn"
                            onClick={() => handleCancelSchedule(schedule.id)}
                            style={{ 
                              padding: '0.375rem 0.75rem', 
                              fontSize: '0.875rem',
                              background: '#ef4444',
                              color: 'white'
                            }}
                          >
                            Cancel
                          </button>
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

      {/* Create New Job View */}
      {viewMode === 'create' && (
        <>
      {/* Configuration Section */}
      <div style={{ marginBottom: '2rem' }}>
        <div className="form-group">
          <label htmlFor="project">Project *</label>
          <select
            id="project"
            className="form-control"
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            <option value="">Select a project...</option>
            {projects.map(proj => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
          </select>
          <small style={{ color: '#666' }}>
            Files will be organized under this project
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="connection">S3 Connection *</label>
          <select
            id="connection"
            className="form-control"
            value={selectedConnection}
            onChange={(e) => setSelectedConnection(e.target.value)}
          >
            <option value="">Select a connection...</option>
            {connections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.bucket_name})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="s3path">S3 Path *</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="s3path"
              type="text"
              className="form-control"
              placeholder="s3://bucket-name/path/to/files/ or /path/to/files/"
              value={s3Path}
              onChange={(e) => setS3Path(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowBrowser(!showBrowser)}
              disabled={!selectedConnection}
              style={{ whiteSpace: 'nowrap' }}
            >
              <FiFolder style={{ marginRight: '0.5rem' }} />
              Browse
            </button>
          </div>
          <small style={{ color: '#666' }}>
            {selectedConnection 
              ? 'Enter the S3 path or click Browse to navigate folders'
              : 'Select a connection first to enable browsing'
            }
          </small>
        </div>

        {showBrowser && selectedConnection && (
          <div className="form-group">
            <S3FolderBrowser
              connectionId={selectedConnection}
              initialPath={s3Path || '/'}
              onSelectPath={(path) => {
                setS3Path(path);
                setShowBrowser(false);
              }}
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="pattern">File Pattern</label>
          <input
            id="pattern"
            type="text"
            className="form-control"
            placeholder="* for all compatible files"
            value={filePattern}
            onChange={(e) => setFilePattern(e.target.value)}
          />
          <small style={{ color: '#666' }}>
            Use * for all files, or patterns like sales_*.csv, data_2024*
          </small>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              style={{ marginRight: '0.5rem' }}
            />
            Scan subdirectories recursively
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="duplicate">Duplicate Handling</label>
          <select
            id="duplicate"
            className="form-control"
            value={duplicateHandling}
            onChange={(e) => setDuplicateHandling(e.target.value)}
          >
            <option value="skip">Skip if already profiled</option>
            <option value="reprefilit">Re-profile (create new version)</option>
            <option value="ask">Ask me for each duplicate</option>
          </select>
        </div>

        {/* Scheduling Section */}
        <div className="form-group" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <label htmlFor="executionType">
            <FiClock style={{ marginRight: '0.5rem' }} />
            Execution Type
          </label>
          <select
            id="executionType"
            className="form-control"
            value={executionType}
            onChange={(e) => setExecutionType(e.target.value)}
          >
            <option value="manual">Run Now (Manual)</option>
            <option value="scheduled">Schedule for Later</option>
          </select>
        </div>

        {executionType === 'scheduled' && (
          <>
            <div className="form-group">
              <label htmlFor="scheduleType">Schedule Type</label>
              <select
                id="scheduleType"
                className="form-control"
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
              >
                <option value="recurring">Recurring (Cron)</option>
                <option value="one-time">One-time</option>
              </select>
            </div>

            {scheduleType === 'recurring' && (
              <div className="form-group">
                <label htmlFor="cronExpression">Cron Expression</label>
                <input
                  id="cronExpression"
                  type="text"
                  className="form-control"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 0 * * * (Daily at midnight)"
                />
                <small style={{ color: '#666' }}>
                  Examples: <code>0 0 * * *</code> (daily at midnight), <code>0 */6 * * *</code> (every 6 hours)
                </small>
              </div>
            )}

            {scheduleType === 'one-time' && (
              <div className="form-group">
                <label htmlFor="scheduleStartDate">Start Date & Time</label>
                <input
                  id="scheduleStartDate"
                  type="datetime-local"
                  className="form-control"
                  value={scheduleStartDate}
                  onChange={(e) => setScheduleStartDate(e.target.value)}
                />
                <small style={{ color: '#666' }}>
                  Choose when to run this profiling job
                </small>
              </div>
            )}
          </>
        )}

        <button
          className="btn btn-primary"
          onClick={handleDiscover}
          disabled={isDiscovering || !selectedConnection || !s3Path}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}
        >
          <FiSearch />
          {isDiscovering ? 'Discovering Files...' : 'Discover Files'}
        </button>
      </div>

      {/* Discovered Files Section */}
      {discoveredFiles.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>
            Discovered Files ({discoveredFiles.length})
          </h3>

          <div style={{
            maxHeight: '400px',
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            marginBottom: '1.5rem'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>File Name</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {discoveredFiles.map((file, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>{file.name}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: '#eff6ff',
                        color: '#1e40af',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}>
                        {file.type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatFileSize(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleCreateJob}
            disabled={isCreatingJob}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FiPlay />
            {isCreatingJob 
              ? 'Creating Job...' 
              : executionType === 'scheduled'
                ? `Schedule Profiling Job (${discoveredFiles.length} Files)`
                : `Start Profiling ${discoveredFiles.length} Files`
            }
          </button>
        </div>
      )}
        </>
      )}

      {/* Edit Schedule Modal */}
      {editingSchedule && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Edit Schedule</h3>
            
            <div className="form-group">
              <label>Job Name</label>
              <input
                type="text"
                className="form-control"
                value={editingSchedule.job_name}
                disabled
                style={{ background: '#f9fafb' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="editCronExpression">Cron Expression</label>
              <input
                id="editCronExpression"
                type="text"
                className="form-control"
                value={editingSchedule.cron_expression}
                onChange={(e) => setEditingSchedule({
                  ...editingSchedule,
                  cron_expression: e.target.value
                })}
              />
              <small style={{ color: '#666' }}>
                Examples: <code>0 0 * * *</code> (daily at midnight), <code>* * * * *</code> (every minute)
              </small>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={editingSchedule.is_active}
                  onChange={(e) => setEditingSchedule({
                    ...editingSchedule,
                    is_active: e.target.checked
                  })}
                />
                Active
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setEditingSchedule(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpdateSchedule}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BulkProfilingTab;
