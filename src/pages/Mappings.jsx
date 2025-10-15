import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiPlay, 
  FiServer,
  FiTarget,
  FiFilter,
  FiLayers,
  FiArrowRight,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiX,
  FiEye
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import './Mappings.css';

function Mappings() {
  const { hasWritePermission, currentUser } = useAuth();
  const navigate = useNavigate();
  const [mappings, setMappings] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('mappings');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [jobDetailsModalOpen, setJobDetailsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);
  const [loadingJobDetails, setLoadingJobDetails] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [mappingsRes, jobsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/transformations`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/jobs?limit=10`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);
      
      setMappings(mappingsRes.data?.mappings || []);
      setJobs(jobsRes.data?.jobs || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load mappings data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMapping = () => {
    navigate('/mappings/create');
  };

  const handleEditMapping = (mappingId) => {
    navigate(`/mappings/edit/${mappingId}`);
  };

  const handleDeleteMapping = (mappingId, mappingName) => {
    setMappingToDelete({ id: mappingId, name: mappingName });
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!mappingToDelete) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/transformations/${mappingToDelete.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMappings(mappings.filter(m => m.mapping_id !== mappingToDelete.id));
      setDeleteModalOpen(false);
      setMappingToDelete(null);
    } catch (err) {
      console.error('Error deleting mapping:', err);
      alert(err.response?.data?.error || 'Failed to delete mapping');
    }
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setMappingToDelete(null);
  };

  const handleExecuteMapping = async (mappingId) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/${mappingId}/execute`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      const jobId = response.data.jobId;
      setExecutionResult({
        success: true,
        jobId: jobId,
        message: 'Mapping execution started successfully!'
      });
      setExecutionModalOpen(true);
      
      setActiveTab('jobs');
      fetchData();
    } catch (err) {
      console.error('Error executing mapping:', err);
      setExecutionResult({
        success: false,
        message: err.response?.data?.error || 'Failed to execute mapping'
      });
      setExecutionModalOpen(true);
    }
  };

  const closeExecutionModal = () => {
    setExecutionModalOpen(false);
    setExecutionResult(null);
  };

  const viewExecutionJob = () => {
    if (executionResult?.jobId) {
      navigate(`/etl-jobs/${executionResult.jobId}`);
      closeExecutionModal();
    }
  };

  const handleViewJob = async (jobId) => {
    setLoadingJobDetails(true);
    setJobDetailsModalOpen(true);
    
    try {
      const [jobRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get(`${API_BASE_URL}/api/jobs/${jobId}/logs`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);
      
      setSelectedJob(jobRes.data.job);
      setJobLogs(logsRes.data.logs || []);
    } catch (err) {
      console.error('Error loading job details:', err);
      setSelectedJob(null);
      setJobLogs([]);
    } finally {
      setLoadingJobDetails(false);
    }
  };

  const closeJobDetailsModal = () => {
    setJobDetailsModalOpen(false);
    setSelectedJob(null);
    setJobLogs([]);
  };

  const handleCancelJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to cancel this job?')) {
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/api/jobs/${jobId}/cancel`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      fetchData();
    } catch (err) {
      console.error('Error cancelling job:', err);
      alert(err.response?.data?.error || 'Failed to cancel job');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { icon: FiCheckCircle, class: 'status-success', label: 'Completed' },
      running: { icon: FiClock, class: 'status-running', label: 'Running' },
      failed: { icon: FiXCircle, class: 'status-error', label: 'Failed' },
      pending: { icon: FiAlertCircle, class: 'status-warning', label: 'Pending' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`status-badge ${config.class}`}>
        <Icon size={14} />
        {config.label}
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

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1 style={{ fontSize: '1.75rem' }}>ETL Mappings</h1>
          <p style={{ color: 'white' }}>Create and manage data transformation mappings with file pattern matching and quality checks</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={handleCreateMapping}
            disabled={!hasWritePermission}
          >
            <FiPlus /> Create Mapping
          </button>
        </div>
      </div>

      <div className="tabs-container">
        <div className="tabs-header" style={{ background: 'white', borderBottom: '1px solid #e2e8f0' }}>
          <button
            className={`tab-button ${activeTab === 'mappings' ? 'active' : ''}`}
            onClick={() => setActiveTab('mappings')}
            style={{ fontSize: '0.95rem' }}
          >
            <FiLayers /> Mappings ({mappings.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
            style={{ fontSize: '0.95rem' }}
          >
            <FiClock /> Recent Jobs ({jobs.length})
          </button>
        </div>

        <div className="tabs-content" style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: 'none' }}>
          {error && (
            <div className="error-message" style={{ margin: '1rem' }}>
              <FiAlertCircle /> {error}
            </div>
          )}

          {activeTab === 'mappings' && (
            <div className="mappings-table-container">
              {mappings.length === 0 ? (
                <div className="empty-state">
                  <FiLayers size={48} />
                  <h3>No mappings yet</h3>
                  <p>Create your first mapping to start transforming data files</p>
                  <button 
                    className="btn btn-primary"
                    onClick={handleCreateMapping}
                  >
                    <FiPlus /> Create Mapping
                  </button>
                </div>
              ) : (
                <table className="mappings-table">
                  <thead>
                    <tr>
                      <th>Mapping Name</th>
                      <th>Source</th>
                      <th>File Pattern</th>
                      <th>Target</th>
                      <th>Fields</th>
                      <th>Quality Rules</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map(mapping => {
                      const fieldCount = Array.isArray(mapping.field_mappings) 
                        ? mapping.field_mappings.length 
                        : (typeof mapping.field_mappings === 'string' ? JSON.parse(mapping.field_mappings).length : 0);
                      const rulesCount = mapping.anomaly_rules 
                        ? (typeof mapping.anomaly_rules === 'object' ? Object.keys(mapping.anomaly_rules).length : 0) 
                        : 0;
                      
                      return (
                        <tr key={mapping.id}>
                          <td className="mapping-name-cell">
                            <strong>{mapping.mapping_name}</strong>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <FiServer size={14} style={{ color: '#64748b' }} />
                              {mapping.source_connection_name || 'Local'}
                            </div>
                          </td>
                          <td>
                            <code style={{ fontSize: '0.85em', background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>
                              {mapping.file_path && mapping.file_path !== '' ? `${mapping.file_path}` : ''}
                              {mapping.file_name_pattern || mapping.source_file_pattern}
                            </code>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <FiTarget size={14} style={{ color: '#64748b' }} />
                              {mapping.target_connection_name || 'Local'}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{fieldCount}</td>
                          <td style={{ textAlign: 'center' }}>{rulesCount}</td>
                          <td>{formatDate(mapping.created_at)}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="icon-btn"
                                onClick={() => handleExecuteMapping(mapping.mapping_id)}
                                title="Execute mapping"
                              >
                                <FiPlay />
                              </button>
                              <button
                                className="icon-btn"
                                onClick={() => handleEditMapping(mapping.mapping_id)}
                                title="Edit mapping"
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                className="icon-btn danger"
                                onClick={() => handleDeleteMapping(mapping.mapping_id, mapping.mapping_name)}
                                title="Delete mapping"
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="jobs-list">
              {jobs.length === 0 ? (
                <div className="empty-state">
                  <FiClock size={48} />
                  <h3>No jobs yet</h3>
                  <p>Execute a mapping to see job history here</p>
                </div>
              ) : (
                <table className="jobs-table">
                  <thead>
                    <tr>
                      <th>Job ID</th>
                      <th>Mapping</th>
                      <th>Status</th>
                      <th>Files Processed</th>
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
                                onClick={() => handleCancelJob(job.job_id)}
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Mapping</h2>
              <button className="modal-close" onClick={cancelDelete}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <FiAlertCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500 }}>
                    Are you sure you want to delete this mapping?
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                    Mapping: <strong>{mappingToDelete?.name}</strong>
                  </p>
                  <p style={{ margin: 0, marginTop: '0.5rem', color: '#64748b', fontSize: '0.875em' }}>
                    This action cannot be undone. All field mappings and quality rules will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                <FiTrash2 /> Delete Mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Result Modal */}
      {executionModalOpen && executionResult && (
        <div className="modal-overlay" onClick={closeExecutionModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{executionResult.success ? 'Execution Started' : 'Execution Failed'}</h2>
              <button className="modal-close" onClick={closeExecutionModal}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                {executionResult.success ? (
                  <FiCheckCircle size={48} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <FiXCircle size={48} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <div>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 500 }}>
                    {executionResult.message}
                  </p>
                  {executionResult.jobId && (
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                      Job ID: <code style={{ background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>{executionResult.jobId}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeExecutionModal}>
                Close
              </button>
              {executionResult.success && executionResult.jobId && (
                <button className="btn btn-primary" onClick={viewExecutionJob}>
                  <FiArrowRight /> View Job Details
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {jobDetailsModalOpen && (
        <div className="modal-overlay" onClick={closeJobDetailsModal}>
          <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Job Details</h2>
              <button className="modal-close" onClick={closeJobDetailsModal}>×</button>
            </div>
            <div className="modal-body">
              {loadingJobDetails ? (
                <LoadingSpinner />
              ) : selectedJob ? (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#1e293b' }}>Overview</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Job ID</div>
                        <code style={{ fontSize: '0.85em', background: '#fff', padding: '0.25rem 0.5rem', borderRadius: '3px' }}>{selectedJob.job_id}</code>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Status</div>
                        <div>{getStatusBadge(selectedJob.status)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Mapping</div>
                        <div style={{ fontWeight: 500 }}>{selectedJob.mapping_name}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Files Processed</div>
                        <div style={{ fontWeight: 500 }}>{selectedJob.files_processed || 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Rows Read</div>
                        <div style={{ fontWeight: 500 }}>{selectedJob.rows_read ? selectedJob.rows_read.toLocaleString() : '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Rows Written</div>
                        <div style={{ fontWeight: 500 }}>{selectedJob.rows_written ? selectedJob.rows_written.toLocaleString() : '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Start Time</div>
                        <div style={{ fontSize: '0.9em' }}>{selectedJob.start_time ? formatDate(selectedJob.start_time) : '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>End Time</div>
                        <div style={{ fontSize: '0.9em' }}>{selectedJob.end_time ? formatDate(selectedJob.end_time) : '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Duration</div>
                        <div style={{ fontWeight: 500 }}>{selectedJob.duration_ms ? `${(selectedJob.duration_ms / 1000).toFixed(2)}s` : '-'}</div>
                      </div>
                      {selectedJob.error_message && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: '0.875rem', color: '#ef4444', marginBottom: '0.25rem' }}>Error Message</div>
                          <div style={{ background: '#fee', padding: '0.5rem', borderRadius: '3px', fontSize: '0.9em', color: '#dc2626' }}>
                            {selectedJob.error_message}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: '#1e293b' }}>Execution Logs</h3>
                    <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '1rem', borderRadius: '6px', maxHeight: '400px', overflow: 'auto', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {jobLogs.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No logs available</div>
                      ) : (
                        jobLogs.map((log, index) => (
                          <div key={index} style={{ marginBottom: '0.5rem', borderBottom: index < jobLogs.length - 1 ? '1px solid #334155' : 'none', paddingBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                              <span style={{ 
                                color: log.log_level === 'error' ? '#fca5a5' : log.log_level === 'warn' ? '#fcd34d' : '#86efac',
                                fontWeight: 'bold',
                                fontSize: '0.75em',
                                textTransform: 'uppercase',
                                minWidth: '50px'
                              }}>
                                {log.log_level}
                              </span>
                              <span style={{ color: '#94a3b8', fontSize: '0.85em', minWidth: '140px' }}>
                                {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                              </span>
                              <span style={{ flex: 1 }}>{log.log_message || log.message}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  <FiAlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
                  <p>Failed to load job details</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeJobDetailsModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Mappings;
