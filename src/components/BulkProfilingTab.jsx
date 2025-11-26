import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiFolder, FiSearch, FiPlay, FiClock, FiCheck, FiX, FiDownload, FiRefreshCw } from 'react-icons/fi';
import S3FolderBrowser from './S3FolderBrowser';
import ErrorModal from './ErrorModal';
import './BulkProfilingTab.css';

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
  
  // Sub-project support
  const [subProjects, setSubProjects] = useState([]);
  const [selectedSubProject, setSelectedSubProject] = useState('');
  
  // Quality rules support
  const [availableQualityRules, setAvailableQualityRules] = useState([]);
  const [selectedQualityRules, setSelectedQualityRules] = useState([]);
  
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

  // Fetch sub-projects when project changes
  useEffect(() => {
    if (selectedProject) {
      fetchSubProjects(selectedProject);
      fetchQualityRules();
    } else {
      setSubProjects([]);
      setSelectedSubProject('');
      setAvailableQualityRules([]);
      setSelectedQualityRules([]);
    }
  }, [selectedProject]);

  // Fetch quality rules when sub-project changes
  useEffect(() => {
    if (selectedProject) {
      fetchQualityRules();
    }
  }, [selectedSubProject]);

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

  const fetchSubProjects = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/projects/${projectId}/sub-projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSubProjects(response.data.subProjects || []);
      setSelectedSubProject('');
    } catch (err) {
      console.error('Error fetching sub-projects:', err);
      setSubProjects([]);
    }
  };

  const fetchQualityRules = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      
      if (selectedProject) {
        params.append('project_id', selectedProject);
      }
      
      if (selectedSubProject) {
        params.append('sub_project_id', selectedSubProject);
      }
      
      params.append('enabled', 'true');
      
      const response = await axios.get(`${API_BASE_URL}/api/quality-rules?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAvailableQualityRules(response.data.rules || []);
    } catch (err) {
      console.error('Error fetching quality rules:', err);
      setAvailableQualityRules([]);
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

      // Add sub-project if selected
      if (selectedSubProject) {
        jobData.subProjectId = selectedSubProject;
      }

      // Add quality rules if selected
      if (selectedQualityRules.length > 0) {
        jobData.qualityRuleIds = selectedQualityRules;
      }

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
    <div className="gps-bulk-container">
      <ErrorModal 
        message={error}
        onClose={() => setError(null)}
      />
      
      <div className="gps-bulk-header">
        <h2 className="gps-bulk-title">Bulk Profiling from S3</h2>
        <p className="gps-bulk-subtitle">
          Discover and profile multiple files from an S3 location automatically
        </p>
      </div>

      {/* View Mode Toggle */}
      <div className="gps-bulk-tabs">
        <button
          onClick={() => setViewMode('create')}
          className={`gps-bulk-tab ${viewMode === 'create' ? 'gps-bulk-tab--active' : ''}`}
        >
          Create New Job
        </button>
        <button
          onClick={() => {
            setViewMode('scheduled');
            fetchScheduledJobs();
          }}
          className={`gps-bulk-tab ${viewMode === 'scheduled' ? 'gps-bulk-tab--active' : ''}`}
        >
          Scheduled Jobs
        </button>
      </div>

      {/* Scheduled Jobs View */}
      {viewMode === 'scheduled' && (
        <div>
          <h3 className="gps-bulk-title">Scheduled Bulk Profiling Jobs</h3>
          {isLoadingScheduled ? (
            <div className="gps-bulk-loading">Loading...</div>
          ) : scheduledJobs.length === 0 ? (
            <div className="gps-bulk-empty">
              <p className="gps-bulk-empty-text">
                No scheduled jobs found. Create a new job with scheduling enabled to see it here.
              </p>
            </div>
          ) : (
            <div className="gps-bulk-table-container" style={{ maxHeight: 'none' }}>
              <table className="gps-bulk-table">
                <thead>
                  <tr>
                    <th>Job Name</th>
                    <th>Frequency</th>
                    <th>Cron Expression</th>
                    <th>Status</th>
                    <th>Next Run</th>
                    <th>Last Run</th>
                    <th className="gps-bulk-table th--center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledJobs.map((schedule) => (
                    <tr key={schedule.id}>
                      <td>{schedule.job_name}</td>
                      <td>{schedule.frequency}</td>
                      <td>
                        <code className="gps-bulk-code">{schedule.cron_expression}</code>
                      </td>
                      <td>
                        <span className={`gps-bulk-status ${schedule.is_active ? 'gps-bulk-status--completed' : 'gps-bulk-status--failed'}`}>
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{schedule.next_run ? new Date(schedule.next_run).toLocaleString() : '-'}</td>
                      <td>{schedule.last_run ? new Date(schedule.last_run).toLocaleString() : '-'}</td>
                      <td className="gps-bulk-table td--center">
                        <div className="gps-bulk-table-actions">
                          <button
                            className="gps-bulk-table-btn gps-bulk-table-btn--edit"
                            onClick={() => setEditingSchedule(schedule)}
                          >
                            Edit
                          </button>
                          <button
                            className="gps-bulk-table-btn gps-bulk-table-btn--cancel"
                            onClick={() => handleCancelSchedule(schedule.id)}
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
      {/* Configuration Section with 2-Column Grid Layout */}
      <div>
        {/* 2-Column Grid for Form Fields */}
        <div className="gps-bulk-form-grid">
          {/* Row 1: Project | Sub-Project */}
          <div className="gps-bulk-field">
            <label className="gps-bulk-label" htmlFor="project">
              Project <span className="required">*</span>
            </label>
            <select
              id="project"
              className="gps-bulk-select"
              value={selectedProject || ''}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setSelectedSubProject('');
              }}
            >
              <option value="">Select a project...</option>
              {projects.map(proj => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
            <span className="gps-bulk-helper">
              Files will be organized under this project
            </span>
          </div>

          <div className="gps-bulk-field">
            <label className="gps-bulk-label" htmlFor="subProject">Sub-Project</label>
            <select
              id="subProject"
              className="gps-bulk-select"
              value={selectedSubProject}
              onChange={(e) => setSelectedSubProject(e.target.value)}
              disabled={!selectedProject || subProjects.length === 0}
            >
              <option value="">None (Parent Project Level)</option>
              {subProjects.map(subProj => (
                <option key={subProj.id} value={subProj.id}>
                  {subProj.name}
                </option>
              ))}
            </select>
            <span className="gps-bulk-helper">
              {!selectedProject 
                ? 'Select a project first'
                : subProjects.length === 0 
                  ? 'No sub-projects available'
                  : 'Optional: Organize files under a sub-project'
              }
            </span>
          </div>

          {/* Row 2: S3 Connection | File Pattern */}
          <div className="gps-bulk-field">
            <label className="gps-bulk-label" htmlFor="connection">
              S3 Connection <span className="required">*</span>
            </label>
            <select
              id="connection"
              className="gps-bulk-select"
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
            <span className="gps-bulk-helper">
              S3 connection to discover files from
            </span>
          </div>

          <div className="gps-bulk-field">
            <label className="gps-bulk-label" htmlFor="pattern">File Pattern</label>
            <input
              id="pattern"
              type="text"
              className="gps-bulk-input"
              placeholder="*"
              value={filePattern}
              onChange={(e) => setFilePattern(e.target.value)}
            />
            <span className="gps-bulk-helper">
              Use * for all files, or patterns like sales_*.csv
            </span>
          </div>

          {/* Row 4: Duplicate Handling | Recursive Checkbox */}
          <div className="gps-bulk-field">
            <label className="gps-bulk-label" htmlFor="duplicate">Duplicate Handling</label>
            <select
              id="duplicate"
              className="gps-bulk-select"
              value={duplicateHandling}
              onChange={(e) => setDuplicateHandling(e.target.value)}
            >
              <option value="skip">Skip if already profiled</option>
              <option value="reprefilit">Re-profile (create new version)</option>
              <option value="ask">Ask me for each duplicate</option>
            </select>
            <span className="gps-bulk-helper">
              How to handle files already profiled
            </span>
          </div>

          <div className="gps-bulk-checkbox-wrapper">
            <input
              type="checkbox"
              id="recursive"
              className="gps-bulk-checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
            />
            <label htmlFor="recursive" className="gps-bulk-checkbox-label">
              Scan subdirectories recursively
            </label>
          </div>
        </div>

        {/* Row 3: S3 Path (Full Width) */}
        <div className="gps-bulk-field gps-bulk-field--full">
          <label className="gps-bulk-label" htmlFor="s3path">
            S3 Path <span className="required">*</span>
          </label>
          <div className="gps-bulk-input-group">
            <input
              id="s3path"
              type="text"
              className="gps-bulk-input"
              placeholder="s3://bucket-name/path/to/files/ or /path/to/files/"
              value={s3Path}
              onChange={(e) => setS3Path(e.target.value)}
            />
            <button
              type="button"
              className="gps-bulk-btn gps-bulk-btn--secondary"
              onClick={() => setShowBrowser(!showBrowser)}
              disabled={!selectedConnection}
            >
              <FiFolder />
              Browse
            </button>
          </div>
          <span className="gps-bulk-helper">
            {selectedConnection 
              ? 'Enter the S3 path or click Browse to navigate folders'
              : 'Select a connection first to enable browsing'
            }
          </span>
        </div>

        {showBrowser && selectedConnection && (
          <div className="gps-bulk-field">
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

        {/* Row 5: Execution Type (Full Width) */}
        <div className="gps-bulk-section">
          <div className="gps-bulk-field">
            <label className="gps-bulk-label" htmlFor="executionType">
              <FiClock /> Execution Type
            </label>
            <select
              id="executionType"
              className="gps-bulk-select"
              value={executionType}
              onChange={(e) => setExecutionType(e.target.value)}
            >
              <option value="manual">Run Now (Manual)</option>
              <option value="scheduled">Schedule for Later</option>
            </select>
          </div>
        </div>

        {/* Scheduling Options (when scheduled is selected) */}
        {executionType === 'scheduled' && (
          <div className="gps-bulk-form-grid" style={{ marginTop: '16px' }}>
            <div className="gps-bulk-field">
              <label className="gps-bulk-label" htmlFor="scheduleType">Schedule Type</label>
              <select
                id="scheduleType"
                className="gps-bulk-select"
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
              >
                <option value="recurring">Recurring (Cron)</option>
                <option value="one-time">One-time</option>
              </select>
            </div>

            {scheduleType === 'recurring' ? (
              <div className="gps-bulk-field">
                <label className="gps-bulk-label" htmlFor="cronExpression">Cron Expression</label>
                <input
                  id="cronExpression"
                  type="text"
                  className="gps-bulk-input"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 0 * * * (Daily at midnight)"
                />
                <span className="gps-bulk-helper">
                  Examples: <code className="gps-bulk-code">0 0 * * *</code> (daily), <code className="gps-bulk-code">0 */6 * * *</code> (every 6 hours)
                </span>
              </div>
            ) : (
              <div className="gps-bulk-field">
                <label className="gps-bulk-label" htmlFor="scheduleStartDate">Start Date & Time</label>
                <input
                  id="scheduleStartDate"
                  type="datetime-local"
                  className="gps-bulk-input"
                  value={scheduleStartDate}
                  onChange={(e) => setScheduleStartDate(e.target.value)}
                />
                <span className="gps-bulk-helper">
                  Choose when to run this profiling job
                </span>
              </div>
            )}
          </div>
        )}

        {/* Quality Rules Multi-Select Section (Full Width) */}
        {availableQualityRules.length > 0 && (
          <div className="gps-bulk-quality-section">
            <label className="gps-bulk-label">Quality Rules (Optional)</label>
            <p className="gps-bulk-helper" style={{ marginBottom: '12px' }}>
              Select quality rules to apply during profiling. These rules will be validated against the profiled data.
            </p>
            {availableQualityRules.length === 0 ? (
              <div className="gps-bulk-empty">
                <p className="gps-bulk-empty-text">
                  No quality rules available for the selected project{selectedSubProject ? ' and sub-project' : ''}.
                </p>
              </div>
            ) : (
              <div className="gps-bulk-quality-grid">
                {availableQualityRules.map((rule) => (
                  <label
                    key={rule.id}
                    className={`gps-bulk-quality-item ${selectedQualityRules.includes(rule.id) ? 'gps-bulk-quality-item--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="gps-bulk-quality-checkbox"
                      checked={selectedQualityRules.includes(rule.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQualityRules([...selectedQualityRules, rule.id]);
                        } else {
                          setSelectedQualityRules(selectedQualityRules.filter(id => id !== rule.id));
                        }
                      }}
                    />
                    <div>
                      <div className="gps-bulk-quality-label" style={{ fontWeight: 500, marginBottom: '4px' }}>
                        {rule.rule_name}
                      </div>
                      <div className="gps-bulk-helper">
                        Type: {rule.rule_type} | Severity: {rule.severity}
                      </div>
                      {rule.column_name && (
                        <div className="gps-bulk-helper">
                          Column: {rule.column_name}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
            {selectedQualityRules.length > 0 && (
              <div className="gps-bulk-banner gps-bulk-banner--info" style={{ marginTop: '12px', padding: '12px' }}>
                <strong>{selectedQualityRules.length}</strong> quality rule{selectedQualityRules.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>
        )}

        <div className="gps-bulk-actions" style={{ marginTop: '20px' }}>
          <button
            className="gps-bulk-btn gps-bulk-btn--primary"
            onClick={handleDiscover}
            disabled={isDiscovering || !selectedConnection || !s3Path}
          >
            <FiSearch />
            {isDiscovering ? 'Discovering Files...' : 'Discover Files'}
          </button>
        </div>
      </div>

      {/* Discovered Files Section */}
      {discoveredFiles.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div className="gps-bulk-files-header">
            <h3 className="gps-bulk-files-title">Discovered Files</h3>
            <span className="gps-bulk-files-count">{discoveredFiles.length} files found</span>
          </div>

          <div className="gps-bulk-table-container" style={{ maxHeight: '400px' }}>
            <table className="gps-bulk-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {discoveredFiles.map((file, index) => (
                  <tr key={index}>
                    <td>{file.name}</td>
                    <td>
                      <span className="gps-bulk-status gps-bulk-status--processing">
                        {file.type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatFileSize(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="gps-bulk-actions">
            <button
              className="gps-bulk-btn gps-bulk-btn--primary"
              onClick={handleCreateJob}
              disabled={isCreatingJob}
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
