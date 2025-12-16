import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiFolder, FiSearch, FiPlay, FiClock, FiCheck, FiX, FiDownload, FiRefreshCw, FiFileText, FiAlertCircle } from 'react-icons/fi';
import S3FolderBrowser from './S3FolderBrowser';
import ErrorModal from './ErrorModal';
import { useToast } from '../context/ToastContext';
import './BulkProfilingTab.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const MAX_POLL_RETRIES = 5;

function SchemaValidationTab({ selectedProject: initialProject }) {
  const { addToast } = useToast();
  const pollRetryCount = useRef(0);
  
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
  
  const [subProjects, setSubProjects] = useState([]);
  const [selectedSubProject, setSelectedSubProject] = useState('');
  
  const [discoveredFiles, setDiscoveredFiles] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [error, setError] = useState(null);
  const [createdJob, setCreatedJob] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  
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
  
  const [fileDetails, setFileDetails] = useState([]);
  const [fileDetailsPagination, setFileDetailsPagination] = useState({ page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
  const [isLoadingFileDetails, setIsLoadingFileDetails] = useState(false);
  const [fileDetailsFilter, setFileDetailsFilter] = useState('all');
  const [showFileDetails, setShowFileDetails] = useState(false);

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
      fetchSubProjects(selectedProject);
    } else {
      setVendorAgreements([]);
      setSelectedAgreement('');
      setSubProjects([]);
      setSelectedSubProject('');
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
      
      pollRetryCount.current = 0;
      setJobStatus(response.data.job);
    } catch (err) {
      console.error('Error fetching job status:', err);
      pollRetryCount.current += 1;
      
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to fetch job status';
      
      if (pollRetryCount.current >= MAX_POLL_RETRIES) {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        setPollingStopped(true);
        setError(`Job monitoring stopped: ${errorMessage}. Please check the job configuration and try again.`);
        addToast('error', 'Job Monitoring Failed', `Unable to track job status after ${MAX_POLL_RETRIES} attempts. ${errorMessage}`);
      }
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
    setPollingStopped(false);
    pollRetryCount.current = 0;

    try {
      const token = localStorage.getItem('token');
      const jobData = {
        jobName: `Schema Validation - ${s3Path}`,
        projectId: parseInt(selectedProject),
        connectionId: selectedConnection,
        vendorAgreementId: parseInt(selectedAgreement),
        s3Path,
        filePattern,
        recursive,
        files: discoveredFiles.map(f => f.path || f.key || f.name).filter(Boolean),
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
      const errorMessage = err.response?.data?.error || err.response?.data?.message || 'Failed to create validation job';
      setError(errorMessage);
      addToast('error', 'Job Creation Failed', errorMessage);
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

  const fetchFileDetails = async (jobId, page = 1, statusFilter = null) => {
    try {
      setIsLoadingFileDetails(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '25',
        sortBy: 'id',
        sortOrder: 'asc'
      });
      
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      const response = await axios.get(
        `${API_BASE_URL}/api/schema-validation/jobs/${jobId}/files?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (response.data.success) {
        setFileDetails(response.data.files || []);
        setFileDetailsPagination(response.data.pagination || { page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
      }
    } catch (err) {
      console.error('Error fetching file details:', err);
    } finally {
      setIsLoadingFileDetails(false);
    }
  };

  const handleFileDetailsPageChange = (newPage) => {
    if (createdJob) {
      fetchFileDetails(createdJob.id, newPage, fileDetailsFilter === 'all' ? null : fileDetailsFilter);
    }
  };

  const handleFileDetailsFilterChange = (newFilter) => {
    setFileDetailsFilter(newFilter);
    if (createdJob) {
      fetchFileDetails(createdJob.id, 1, newFilter === 'all' ? null : newFilter);
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
    setPollingStopped(false);
    pollRetryCount.current = 0;
    setFileDetails([]);
    setFileDetailsPagination({ page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
    setFileDetailsFilter('all');
    setShowFileDetails(false);
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
    <div className="gps-bulk-container">
      <div className="gps-bulk-header">
        <h2 className="gps-bulk-title">Schema Validation from S3</h2>
        <p className="gps-bulk-subtitle">Validate files against vendor agreement schemas without storing to database</p>
      </div>

      <div className="gps-bulk-tabs">
        <button
          className={`gps-bulk-tab ${viewMode === 'create' ? 'gps-bulk-tab--active' : ''}`}
          onClick={() => setViewMode('create')}
        >
          Create New Job
        </button>
        <button
          className={`gps-bulk-tab ${viewMode === 'scheduled' ? 'gps-bulk-tab--active' : ''}`}
          onClick={() => setViewMode('scheduled')}
        >
          Scheduled Jobs
        </button>
        <button
          className={`gps-bulk-tab ${viewMode === 'completed' ? 'gps-bulk-tab--active' : ''}`}
          onClick={() => setViewMode('completed')}
        >
          Completed Jobs
        </button>
      </div>

      {viewMode === 'create' && (
        <>
          {createdJob ? (
            <div className="gps-bulk-section" style={{ background: '#f8fafc', padding: '20px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 className="gps-bulk-title">Validation Job: {createdJob.job_name}</h4>
                {getStatusBadge(jobStatus?.status || 'pending')}
              </div>
              
              {jobStatus && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '8px', fontFamily: 'Inter, sans-serif', fontSize: '10px' }}>
                    <span>Processed: {jobStatus.processed_count || 0} / {jobStatus.total_files || 0}</span>
                    <span style={{ color: '#065f46' }}>Valid: {jobStatus.valid_count || 0}</span>
                    <span style={{ color: '#991b1b' }}>Invalid: {jobStatus.invalid_count || 0}</span>
                  </div>
                  
                  <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        background: '#025043',
                        height: '100%',
                        transition: 'width 0.3s ease',
                        width: `${jobStatus.total_files > 0 ? ((jobStatus.processed_count || 0) / jobStatus.total_files) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {jobStatus?.status === 'completed' && (
                <>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button 
                      className="gps-bulk-btn gps-bulk-btn--primary"
                      onClick={() => handleDownloadReport(createdJob.id)}
                    >
                      <FiDownload /> Download Report
                    </button>
                    <button 
                      className="gps-bulk-btn gps-bulk-btn--secondary"
                      onClick={() => {
                        if (!showFileDetails) {
                          fetchFileDetails(createdJob.id, 1, null);
                        }
                        setShowFileDetails(!showFileDetails);
                      }}
                    >
                      <FiFileText /> {showFileDetails ? 'Hide' : 'View'} File Details
                    </button>
                    <button 
                      className="gps-bulk-btn gps-bulk-btn--secondary"
                      onClick={resetForm}
                    >
                      Create New Job
                    </button>
                  </div>
                  
                  {showFileDetails && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 className="gps-bulk-title" style={{ margin: 0 }}>File Details</h4>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <label htmlFor="file-details-filter-select" style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>Filter:</label>
                          <select
                            id="file-details-filter-select"
                            className="gps-bulk-select"
                            value={fileDetailsFilter}
                            onChange={(e) => handleFileDetailsFilterChange(e.target.value)}
                            style={{ width: 'auto', minWidth: '120px', padding: '4px 8px', fontSize: '10px' }}
                          >
                            <option value="all">All Files</option>
                            <option value="valid">Valid Only</option>
                            <option value="invalid">Invalid Only</option>
                            <option value="error">Errors Only</option>
                          </select>
                        </div>
                      </div>
                      
                      {isLoadingFileDetails ? (
                        <div className="gps-bulk-helper" style={{ textAlign: 'center', padding: '20px' }}>
                          <FiRefreshCw className="spin-animation" /> Loading file details...
                        </div>
                      ) : fileDetails.length === 0 ? (
                        <div className="gps-bulk-helper" style={{ textAlign: 'center', padding: '20px' }}>
                          No files found
                        </div>
                      ) : (
                        <>
                          <div className="gps-bulk-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            <table className="gps-bulk-table">
                              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                                <tr>
                                  <th style={{ textTransform: 'none' }}>File Name</th>
                                  <th style={{ textTransform: 'none' }}>Type</th>
                                  <th style={{ textTransform: 'none' }}>Size</th>
                                  <th style={{ textTransform: 'none' }}>Records</th>
                                  <th style={{ textTransform: 'none' }}>Schema</th>
                                  <th style={{ textTransform: 'none' }}>DQ Status</th>
                                  <th style={{ textTransform: 'none' }}>Matched Pattern</th>
                                  <th style={{ textTransform: 'none' }}>Details</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fileDetails.map((file, idx) => (
                                  <tr key={file.id || idx}>
                                    <td title={file.filePath} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {file.fileName || '-'}
                                    </td>
                                    <td>{file.fileType?.toUpperCase() || '-'}</td>
                                    <td>{file.fileSizeFormatted || '-'}</td>
                                    <td>{file.recordCount || '-'}</td>
                                    <td>
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 500,
                                        backgroundColor: file.valid ? '#d1fae5' : '#fee2e2',
                                        color: file.valid ? '#065f46' : '#991b1b'
                                      }}>
                                        {file.valid ? <FiCheck size={10} /> : <FiX size={10} />}
                                        {file.valid ? 'Valid' : 'Invalid'}
                                      </span>
                                    </td>
                                    <td>
                                      {file.dqValidation?.executed ? (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          fontSize: '10px',
                                          fontWeight: 500,
                                          backgroundColor: file.dqValidation?.status === 'passed' ? '#d1fae5' : 
                                                          file.dqValidation?.status === 'failed' ? '#fef3c7' : '#f3f4f6',
                                          color: file.dqValidation?.status === 'passed' ? '#065f46' : 
                                                file.dqValidation?.status === 'failed' ? '#92400e' : '#6b7280'
                                        }}>
                                          {file.dqValidation?.status === 'passed' ? <FiCheck size={10} /> : 
                                           file.dqValidation?.status === 'failed' ? <FiAlertCircle size={10} /> : null}
                                          {file.dqValidation?.status === 'passed' ? 'Passed' : 
                                           file.dqValidation?.status === 'failed' ? `${file.dqValidation?.violationCount || 0} Issues` : 
                                           file.dqValidation?.status || '-'}
                                        </span>
                                      ) : (
                                        <span style={{ color: '#9ca3af', fontSize: '10px' }}>
                                          {file.valid ? 'No Rules' : '-'}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {file.matchedPattern || '-'}
                                    </td>
                                    <td style={{ fontSize: '9px', maxWidth: '200px' }}>
                                      {file.missingColumns?.length > 0 && (
                                        <span style={{ color: '#991b1b' }}>
                                          Missing: {file.missingColumns.slice(0, 3).join(', ')}{file.missingColumns.length > 3 ? '...' : ''}
                                        </span>
                                      )}
                                      {!file.missingColumns?.length && file.reason && file.reason !== 'Schema matches' && (
                                        <span style={{ color: '#991b1b' }}>{file.reason}</span>
                                      )}
                                      {file.valid && 'Schema matches'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          
                          {fileDetailsPagination.totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                              <span style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>
                                Showing {((fileDetailsPagination.page - 1) * fileDetailsPagination.pageSize) + 1} - {Math.min(fileDetailsPagination.page * fileDetailsPagination.pageSize, fileDetailsPagination.totalCount)} of {fileDetailsPagination.totalCount} files
                              </span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  className="gps-bulk-btn gps-bulk-btn--secondary"
                                  onClick={() => handleFileDetailsPageChange(fileDetailsPagination.page - 1)}
                                  disabled={!fileDetailsPagination.hasPrev}
                                  style={{ padding: '4px 8px', fontSize: '10px' }}
                                >
                                  Previous
                                </button>
                                <span style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center' }}>
                                  Page {fileDetailsPagination.page} of {fileDetailsPagination.totalPages}
                                </span>
                                <button
                                  className="gps-bulk-btn gps-bulk-btn--secondary"
                                  onClick={() => handleFileDetailsPageChange(fileDetailsPagination.page + 1)}
                                  disabled={!fileDetailsPagination.hasNext}
                                  style={{ padding: '4px 8px', fontSize: '10px' }}
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {jobStatus?.status === 'failed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#991b1b', fontFamily: 'Inter, sans-serif', fontSize: '10px' }}>
                  <FiAlertCircle />
                  <span>{jobStatus.error_message || 'Job failed unexpectedly'}</span>
                  <button className="gps-bulk-btn gps-bulk-btn--secondary" onClick={resetForm}>
                    Try Again
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="gps-bulk-form-grid">
                <div className="gps-bulk-field">
                  <label htmlFor="project-select" className="gps-bulk-label" style={{ textTransform: 'none' }}>Project <span className="required">*</span></label>
                  <select
                    id="project-select"
                    className="gps-bulk-select"
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
                  <span className="gps-bulk-helper">Files will be validated for this project</span>
                </div>

                <div className="gps-bulk-field">
                  <label htmlFor="subproject-select" className="gps-bulk-label" style={{ textTransform: 'none' }}>Sub-Project</label>
                  <select
                    id="subproject-select"
                    className="gps-bulk-select"
                    value={selectedSubProject}
                    onChange={(e) => setSelectedSubProject(e.target.value)}
                    disabled={!selectedProject || subProjects.length === 0}
                  >
                    <option value="">Select a sub-project...</option>
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
                        : 'Optional: Organize files under a sub-project'}
                  </span>
                </div>

                <div className="gps-bulk-field">
                  <label htmlFor="vendor-agreement-select" className="gps-bulk-label" style={{ textTransform: 'none' }}>Vendor Agreement <span className="required">*</span></label>
                  <select
                    id="vendor-agreement-select"
                    className="gps-bulk-select"
                    value={selectedAgreement}
                    onChange={(e) => setSelectedAgreement(e.target.value)}
                    disabled={loadingAgreements || !selectedProject}
                  >
                    <option value="">Select a vendor agreement...</option>
                    {vendorAgreements.map(agreement => (
                      <option key={agreement.id} value={agreement.id}>
                        {agreement.name || agreement.agreement_name || `Agreement ${agreement.id}`} - {agreement.vendor_name || 'Unknown Vendor'}
                      </option>
                    ))}
                  </select>
                  <span className="gps-bulk-helper">Schema contract to validate against</span>
                </div>

                <div className="gps-bulk-field">
                  <label htmlFor="s3-connection-select" className="gps-bulk-label" style={{ textTransform: 'none' }}>S3 Connection <span className="required">*</span></label>
                  <select
                    id="s3-connection-select"
                    className="gps-bulk-select"
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
                  <span className="gps-bulk-helper">S3 connection to discover files from</span>
                </div>

                <div className="gps-bulk-field">
                  <label htmlFor="file-pattern-input" className="gps-bulk-label" style={{ textTransform: 'none' }}>File Pattern</label>
                  <input
                    id="file-pattern-input"
                    className="gps-bulk-input"
                    type="text"
                    value={filePattern}
                    onChange={(e) => setFilePattern(e.target.value)}
                    placeholder="*.csv, sales_*.json, etc."
                  />
                  <span className="gps-bulk-helper">Use * for all files, or patterns like sales_*.csv</span>
                </div>

                <div className="gps-bulk-checkbox-wrapper">
                  <input
                    type="checkbox"
                    className="gps-bulk-checkbox"
                    id="recursive-scan"
                    checked={recursive}
                    onChange={(e) => setRecursive(e.target.checked)}
                  />
                  <label htmlFor="recursive-scan" className="gps-bulk-checkbox-label">
                    Scan subdirectories recursively
                  </label>
                </div>
              </div>

              <div className="gps-bulk-field gps-bulk-field--full" style={{ marginTop: '16px' }}>
                <label htmlFor="s3-path-input" className="gps-bulk-label" style={{ textTransform: 'none' }}>S3 Path <span className="required">*</span></label>
                <div className="gps-bulk-input-group">
                  <input
                    id="s3-path-input"
                    className="gps-bulk-input"
                    type="text"
                    value={s3Path}
                    onChange={(e) => setS3Path(e.target.value)}
                    placeholder="s3://bucket-name/path/to/files/ or /path/to/files/"
                  />
                  <button 
                    className="gps-bulk-btn gps-bulk-btn--secondary"
                    onClick={() => setShowBrowser(true)}
                    disabled={!selectedConnection}
                  >
                    <FiFolder /> Browse
                  </button>
                </div>
                <span className="gps-bulk-helper">Select a connection first to enable browsing</span>
              </div>

              <div className="gps-bulk-section">
                <div className="gps-bulk-field">
                  <label htmlFor="execution-type-select" className="gps-bulk-label" style={{ textTransform: 'none' }}><FiClock style={{ marginRight: '4px' }} /> Execution Type</label>
                  <select
                    id="execution-type-select"
                    className="gps-bulk-select"
                    value={executionType}
                    onChange={(e) => setExecutionType(e.target.value)}
                  >
                    <option value="manual">Run Now (Manual)</option>
                    <option value="scheduled">Schedule for Later</option>
                  </select>
                </div>

                {executionType === 'scheduled' && (
                  <div className="gps-bulk-form-grid" style={{ marginTop: '16px' }}>
                    <div className="gps-bulk-field">
                      <label htmlFor="schedule-type-select" className="gps-bulk-label" style={{ textTransform: 'none' }}>Schedule Type</label>
                      <select
                        id="schedule-type-select"
                        className="gps-bulk-select"
                        value={scheduleType}
                        onChange={(e) => setScheduleType(e.target.value)}
                      >
                        <option value="recurring">Recurring (Cron)</option>
                        <option value="one-time">One-Time</option>
                      </select>
                    </div>

                    {scheduleType === 'recurring' ? (
                      <div className="gps-bulk-field">
                        <label htmlFor="cron-expression-input" className="gps-bulk-label" style={{ textTransform: 'none' }}>Cron Expression</label>
                        <input
                          id="cron-expression-input"
                          className="gps-bulk-input"
                          type="text"
                          value={cronExpression}
                          onChange={(e) => setCronExpression(e.target.value)}
                          placeholder="0 0 * * *"
                        />
                        <span className="gps-bulk-helper">e.g., 0 0 * * * (daily at midnight)</span>
                      </div>
                    ) : (
                      <div className="gps-bulk-field">
                        <label htmlFor="schedule-start-date-input" className="gps-bulk-label" style={{ textTransform: 'none' }}>Start Date & Time</label>
                        <input
                          id="schedule-start-date-input"
                          className="gps-bulk-input"
                          type="datetime-local"
                          value={scheduleStartDate}
                          onChange={(e) => setScheduleStartDate(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '24px' }}>
                <button
                  className="gps-bulk-btn gps-bulk-btn--primary"
                  onClick={handleDiscover}
                  disabled={isDiscovering || !selectedConnection || !s3Path}
                  style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                >
                  {isDiscovering ? (
                    <><FiRefreshCw className="spin-animation" /> Discovering...</>
                  ) : (
                    <><FiSearch /> Discover Files</>
                  )}
                </button>
              </div>

              {discoveredFiles.length > 0 && (
                <div className="gps-bulk-section">
                  <h4 className="gps-bulk-title" style={{ marginBottom: '12px' }}>Discovered Files ({discoveredFiles.length})</h4>
                  
                  <div className="gps-bulk-table-container">
                    <table className="gps-bulk-table">
                      <thead>
                        <tr>
                          <th style={{ textTransform: 'none' }}>File Name</th>
                          <th style={{ textTransform: 'none' }}>Size</th>
                          <th style={{ textTransform: 'none' }}>Last Modified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discoveredFiles.slice(0, 100).map((file, index) => (
                          <tr key={index}>
                            <td>{file.name || file.key || file.Key || 'Unknown'}</td>
                            <td>{formatFileSize(file.size || file.Size)}</td>
                            <td>{formatDate(file.lastModified || file.LastModified)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {discoveredFiles.length > 100 && (
                      <p className="gps-bulk-helper" style={{ marginTop: '8px', textAlign: 'center' }}>
                        ... and {discoveredFiles.length - 100} more files
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <button
                      className="gps-bulk-btn gps-bulk-btn--primary"
                      onClick={handleCreateJob}
                      disabled={isCreatingJob || !selectedAgreement}
                      style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
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
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 className="gps-bulk-title">Scheduled Schema Validation Jobs</h4>
            <button className="gps-bulk-btn gps-bulk-btn--secondary" onClick={fetchScheduledJobs}>
              <FiRefreshCw /> Refresh
            </button>
          </div>

          {isLoadingScheduled ? (
            <div className="gps-bulk-helper" style={{ textAlign: 'center', padding: '40px' }}>Loading scheduled jobs...</div>
          ) : scheduledJobs.length === 0 ? (
            <div className="gps-bulk-helper" style={{ textAlign: 'center', padding: '40px' }}>No scheduled validation jobs found</div>
          ) : (
            <div className="gps-bulk-table-container">
              <table className="gps-bulk-table">
                <thead>
                  <tr>
                    <th style={{ textTransform: 'none' }}>Job Name</th>
                    <th style={{ textTransform: 'none' }}>Schedule</th>
                    <th style={{ textTransform: 'none' }}>Next Run</th>
                    <th style={{ textTransform: 'none' }}>Status</th>
                    <th style={{ textTransform: 'none' }}>Actions</th>
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
                          className="gps-bulk-btn gps-bulk-btn--danger"
                          onClick={() => handleCancelSchedule(job.id)}
                          style={{ padding: '4px 8px', fontSize: '9px' }}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {viewMode === 'completed' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 className="gps-bulk-title">Completed Validation Jobs</h4>
            <button className="gps-bulk-btn gps-bulk-btn--secondary" onClick={fetchCompletedJobs}>
              <FiRefreshCw /> Refresh
            </button>
          </div>

          {isLoadingCompleted ? (
            <div className="gps-bulk-helper" style={{ textAlign: 'center', padding: '40px' }}>Loading completed jobs...</div>
          ) : completedJobs.length === 0 ? (
            <div className="gps-bulk-helper" style={{ textAlign: 'center', padding: '40px' }}>No completed validation jobs found</div>
          ) : (
            <div className="gps-bulk-table-container">
              <table className="gps-bulk-table">
                <thead>
                  <tr>
                    <th style={{ textTransform: 'none' }}>Job Name</th>
                    <th style={{ textTransform: 'none' }}>Files</th>
                    <th style={{ textTransform: 'none' }}>Valid</th>
                    <th style={{ textTransform: 'none' }}>Invalid</th>
                    <th style={{ textTransform: 'none' }}>Completed</th>
                    <th style={{ textTransform: 'none' }}>Report</th>
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
                            className="gps-bulk-btn gps-bulk-btn--primary"
                            onClick={() => handleDownloadReport(job.id)}
                            style={{ padding: '4px 8px', fontSize: '9px' }}
                          >
                            <FiDownload /> Download
                          </button>
                        ) : (
                          <span style={{ color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: '10px' }}>Expired</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showBrowser && selectedConnection && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBrowser(false);
            }
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600 }}>Browse S3 Location</h3>
              <button 
                onClick={() => setShowBrowser(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                &times;
              </button>
            </div>
            <S3FolderBrowser
              connectionId={selectedConnection}
              initialPath={s3Path || '/'}
              onSelectPath={(path) => {
                setS3Path(path);
                setShowBrowser(false);
                setDiscoveredFiles([]);
              }}
            />
          </div>
        </div>
      )}

      <ErrorModal 
        message={error} 
        onClose={() => setError(null)} 
      />
    </div>
  );
}

export default SchemaValidationTab;
