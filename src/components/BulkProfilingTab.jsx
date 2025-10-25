import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiFolder, FiSearch, FiPlay, FiClock, FiCheck, FiX, FiDownload } from 'react-icons/fi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function BulkProfilingTab({ selectedProject }) {
  const [connections, setConnections] = useState([]);
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

  // Fetch connections on mount
  useEffect(() => {
    fetchConnections();
  }, []);

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

      setCreatedJob(response.data.job);
    } catch (err) {
      console.error('Error creating job:', err);
      setError(err.response?.data?.message || 'Failed to create profiling job');
    } finally {
      setIsCreatingJob(false);
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

  if (createdJob) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: '#f0fdf4',
          border: '2px solid #10b981',
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <FiCheck size={48} style={{ color: '#10b981', marginBottom: '1rem' }} />
          <h2 style={{ color: '#065f46', marginBottom: '1rem' }}>Bulk Profiling Job Created</h2>
          <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>
            Job "{createdJob.job_name}" has been created with {createdJob.total_files} files
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={handleReset}>
              Create Another Job
            </button>
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
          <input
            id="s3path"
            type="text"
            className="form-control"
            placeholder="s3://bucket-name/path/to/files/ or /path/to/files/"
            value={s3Path}
            onChange={(e) => setS3Path(e.target.value)}
          />
          <small style={{ color: '#666' }}>
            Enter the S3 path to scan for files (e.g., s3://my-bucket/data/2024/)
          </small>
        </div>

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
