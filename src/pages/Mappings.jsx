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
  FiAlertCircle
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

  const handleDeleteMapping = async (mappingId) => {
    if (!window.confirm('Are you sure you want to delete this mapping?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/api/transformations/${mappingId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMappings(mappings.filter(m => m.id !== mappingId));
    } catch (err) {
      console.error('Error deleting mapping:', err);
      alert(err.response?.data?.error || 'Failed to delete mapping');
    }
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
      alert(`Mapping execution started! Job ID: ${jobId}`);
      
      setActiveTab('jobs');
      fetchData();
    } catch (err) {
      console.error('Error executing mapping:', err);
      alert(err.response?.data?.error || 'Failed to execute mapping');
    }
  };

  const handleViewJob = (jobId) => {
    navigate(`/etl-jobs/${jobId}`);
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
          <h1>ETL Mappings</h1>
          <p>Create and manage data transformation mappings with file pattern matching and quality checks</p>
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
          >
            <FiLayers /> Mappings ({mappings.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
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
            <div className="mappings-grid">
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
                mappings.map(mapping => (
                  <Card key={mapping.id} className="mapping-card">
                    <div className="mapping-card-header">
                      <h3>{mapping.mapping_name}</h3>
                      <div className="mapping-card-actions">
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
                          onClick={() => handleDeleteMapping(mapping.mapping_id)}
                          title="Delete mapping"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>

                    <div className="mapping-card-body">
                      <div className="mapping-detail">
                        <FiServer className="detail-icon" />
                        <div>
                          <span className="detail-label">Source</span>
                          <span className="detail-value">
                            {mapping.source_connection_id || 'Local Files'}
                          </span>
                        </div>
                      </div>

                      <div className="mapping-detail">
                        <FiFilter className="detail-icon" />
                        <div>
                          <span className="detail-label">File Pattern</span>
                          <span className="detail-value">{mapping.source_file_pattern}</span>
                        </div>
                      </div>

                      <FiArrowRight className="flow-arrow" />

                      <div className="mapping-detail">
                        <FiTarget className="detail-icon" />
                        <div>
                          <span className="detail-label">Target</span>
                          <span className="detail-value">
                            {mapping.target_connection_id || 'Local Files'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mapping-card-footer">
                      <div className="mapping-stats">
                        <span>{Array.isArray(mapping.field_mappings) ? mapping.field_mappings.length : (typeof mapping.field_mappings === 'string' ? JSON.parse(mapping.field_mappings).length : 0)} fields mapped</span>
                        <span>•</span>
                        <span>{mapping.anomaly_rules ? (typeof mapping.anomaly_rules === 'object' ? Object.keys(mapping.anomaly_rules).length : 0) : 0} quality rules</span>
                      </div>
                      <div className="mapping-meta">
                        Created {formatDate(mapping.created_at)}
                      </div>
                    </div>
                  </Card>
                ))
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
                      <th>Duration</th>
                      <th>Started</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(job => (
                      <tr key={job.job_id}>
                        <td className="job-id-cell">
                          <code>{job.job_id}</code>
                        </td>
                        <td>{job.mapping_name}</td>
                        <td>{getStatusBadge(job.status)}</td>
                        <td>{job.files_processed || 0}</td>
                        <td>
                          {job.total_rows_read ? (
                            <span>
                              {job.total_rows_read.toLocaleString()} read
                              {job.total_rows_written && ` → ${job.total_rows_written.toLocaleString()} written`}
                            </span>
                          ) : '-'}
                        </td>
                        <td>
                          {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(2)}s` : '-'}
                        </td>
                        <td>{formatDate(job.started_at)}</td>
                        <td>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleViewJob(job.job_id)}
                          >
                            View Details
                          </button>
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
    </div>
  );
}

export default Mappings;
