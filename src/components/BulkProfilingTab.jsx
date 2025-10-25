import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiFolder, FiSearch, FiPlay, FiClock, FiCheck, FiX, FiDownload } from 'react-icons/fi';
import S3FolderBrowser from './S3FolderBrowser';

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

    setIsCreatingJob(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/api/bulk-profiling/jobs`,
        {
          jobName: `Bulk Profile - ${s3Path}`,
          projectId: selectedProject,
          connectionId: selectedConnection,
          s3Path,
          filePattern,
          duplicateHandling,
          recursive
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const job = response.data.job;
      setCreatedJob(job);
      
      // Automatically start the job
      handleStartJob(job.id);
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
      <h2 style={{ marginBottom: '1.5rem' }}>Bulk Profiling from S3</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Discover and profile multiple files from an S3 location automatically
      </p>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #ef4444',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1.5rem',
          color: '#991b1b'
        }}>
          {error}
        </div>
      )}

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

        <button
          className="btn btn-primary"
          onClick={handleDiscover}
          disabled={isDiscovering || !selectedConnection || !s3Path}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
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
            {isCreatingJob ? 'Creating Job...' : `Start Profiling ${discoveredFiles.length} Files`}
          </button>
        </div>
      )}
    </div>
  );
}

export default BulkProfilingTab;
