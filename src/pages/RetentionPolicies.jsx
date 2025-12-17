import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiPlay, FiClock, FiArchive, FiAlertCircle } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import './RetentionPolicies.css';

const RetentionPolicies = () => {
  const [policies, setPolicies] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    enabled: true,
    retention_days: '',
    min_quality_score: '',
    max_file_size_mb: '',
    file_types: [],
    tags: [],
    access_pattern: '',
    custom_condition: '',
    archive_storage_type: 'local',
    archive_connection_id: '',
    archive_path_prefix: '',
    priority: 50,
    run_frequency: 'daily'
  });

  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    fetchData();
  }, [currentUser, navigate]);

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const [policiesResponse, connectionsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/retention-policies`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/storage-connections`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setPolicies(policiesResponse.data.policies || []);
      setConnections(connectionsResponse.data.connections || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load retention policies');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setSelectedPolicy(null);
    setFormData({
      name: '',
      description: '',
      enabled: true,
      retention_days: '',
      min_quality_score: '',
      max_file_size_mb: '',
      file_types: [],
      tags: [],
      access_pattern: '',
      custom_condition: '',
      archive_storage_type: 'local',
      archive_connection_id: '',
      archive_path_prefix: '',
      priority: 50,
      run_frequency: 'daily'
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (policy) => {
    setModalMode('edit');
    setSelectedPolicy(policy);
    setFormData({
      name: policy.name || '',
      description: policy.description || '',
      enabled: policy.enabled,
      retention_days: policy.retention_days || '',
      min_quality_score: policy.min_quality_score || '',
      max_file_size_mb: policy.max_file_size_mb || '',
      file_types: policy.file_types || [],
      tags: policy.tags || [],
      access_pattern: policy.access_pattern || '',
      custom_condition: policy.custom_condition || '',
      archive_storage_type: policy.archive_storage_type || 'local',
      archive_connection_id: policy.archive_connection_id || '',
      archive_path_prefix: policy.archive_path_prefix || '',
      priority: policy.priority || 50,
      run_frequency: policy.run_frequency || 'daily'
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedPolicy(null);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleArrayInputChange = (e) => {
    const { name, value } = e.target;
    const arrayValue = value.split(',').map(item => item.trim()).filter(item => item);
    setFormData(prev => ({
      ...prev,
      [name]: arrayValue
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Clean up form data - remove empty values
      const payload = {
        ...formData,
        retention_days: formData.retention_days ? parseInt(formData.retention_days) : null,
        min_quality_score: formData.min_quality_score ? parseFloat(formData.min_quality_score) : null,
        max_file_size_mb: formData.max_file_size_mb ? parseInt(formData.max_file_size_mb) : null,
        priority: parseInt(formData.priority),
        archive_connection_id: formData.archive_connection_id || null,
        custom_condition: formData.custom_condition || null,
        access_pattern: formData.access_pattern || null
      };

      if (modalMode === 'create') {
        await axios.post(`${API_BASE_URL}/api/retention-policies`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.put(`${API_BASE_URL}/api/retention-policies/${selectedPolicy.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      handleCloseModal();
      fetchData();
    } catch (error) {
      console.error('Error saving policy:', error);
      setError(error.response?.data?.error || 'Failed to save policy');
    }
  };

  const handleDeleteConfirm = (policy) => {
    setPolicyToDelete(policy);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/api/retention-policies/${policyToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setDeleteModalOpen(false);
      setPolicyToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting policy:', error);
      setError(error.response?.data?.error || 'Failed to delete policy');
    }
  };

  const handleExecutePolicy = async (policy) => {
    if (!confirm(`Execute retention policy "${policy.name}" now?`)) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/retention-policies/${policy.id}/execute`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      alert('Policy execution started successfully');
      fetchData();
    } catch (error) {
      console.error('Error executing policy:', error);
      setError(error.response?.data?.error || 'Failed to execute policy');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="retention-policies-container">
      <div className="page-header">
        <div>
          <h1>Retention & Archival Policies</h1>
          <p className="page-description">
            Configure automated data lifecycle management rules for file archival and retention
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <FiArchive /> Create Policy
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <FiAlertCircle /> {error}
        </div>
      )}

      <div className="policies-grid">
        {policies.length === 0 ? (
          <div className="empty-state">
            <FiArchive size={48} />
            <h3>No Retention Policies</h3>
            <p>Create your first retention policy to automate file archival</p>
            <button className="btn btn-primary" onClick={handleOpenCreateModal}>
              Create Policy
            </button>
          </div>
        ) : (
          policies.map(policy => (
            <div key={policy.id} className={`policy-card ${!policy.enabled ? 'disabled' : ''}`}>
              <div className="policy-header">
                <div className="policy-title-row">
                  <h3>{policy.name}</h3>
                  <span className={`badge ${policy.enabled ? 'badge-success' : 'badge-secondary'}`}>
                    {policy.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {policy.description && <p className="policy-description">{policy.description}</p>}
              </div>

              <div className="policy-stats">
                <div className="stat">
                  <FiArchive />
                  <div>
                    <div className="stat-value">{policy.archived_files_count || 0}</div>
                    <div className="stat-label">Archived Files</div>
                  </div>
                </div>
                <div className="stat">
                  <FiClock />
                  <div>
                    <div className="stat-value">{formatBytes(policy.total_bytes_archived)}</div>
                    <div className="stat-label">Storage Saved</div>
                  </div>
                </div>
              </div>

              <div className="policy-rules">
                <div className="rule-item">
                  <strong>Priority:</strong> {policy.priority}
                </div>
                {policy.retention_days && (
                  <div className="rule-item">
                    <strong>Age:</strong> Files older than {policy.retention_days} days
                  </div>
                )}
                {policy.min_quality_score && (
                  <div className="rule-item">
                    <strong>Quality:</strong> Below {policy.min_quality_score}%
                  </div>
                )}
                {policy.file_types && policy.file_types.length > 0 && (
                  <div className="rule-item">
                    <strong>Types:</strong> {policy.file_types.join(', ')}
                  </div>
                )}
                <div className="rule-item">
                  <strong>Storage:</strong> {policy.archive_storage_type.toUpperCase()}
                  {policy.archive_path_prefix && ` (${policy.archive_path_prefix})`}
                </div>
                <div className="rule-item">
                  <strong>Frequency:</strong> {policy.run_frequency}
                </div>
              </div>

              <div className="policy-actions">
                <button 
                  className="btn btn-sm btn-primary" 
                  onClick={() => handleExecutePolicy(policy)}
                  disabled={!policy.enabled}
                  title="Run policy now"
                >
                  <FiPlay /> Execute
                </button>
                <button 
                  className="btn btn-sm btn-outline" 
                  onClick={() => handleOpenEditModal(policy)}
                  title="Edit policy"
                >
                  <FiEdit2 /> Edit
                </button>
                <button 
                  className="btn btn-sm btn-danger" 
                  onClick={() => handleDeleteConfirm(policy)}
                  title="Delete policy"
                >
                  <FiTrash2 /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content retention-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? 'Create Retention Policy' : 'Edit Retention Policy'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="policy-name">Policy Name *</label>
                    <input
                      id="policy-name"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      placeholder="e.g., Archive Old Low-Quality Files"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="policy-priority">Priority</label>
                    <input
                      id="policy-priority"
                      type="number"
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      min="1"
                      max="100"
                      placeholder="Lower = higher priority"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="policy-description">Description</label>
                    <textarea
                      id="policy-description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows="2"
                      placeholder="Describe what this policy does"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="policy-enabled">
                      <input
                        id="policy-enabled"
                        type="checkbox"
                        name="enabled"
                        checked={formData.enabled}
                        onChange={handleInputChange}
                      />
                      {' '}Enabled
                    </label>
                  </div>

                  <div className="form-group">
                    <label htmlFor="run-frequency">Run Frequency</label>
                    <select
                      id="run-frequency"
                      name="run_frequency"
                      value={formData.run_frequency}
                      onChange={handleInputChange}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <h3 className="section-title">Archive Criteria</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="retention-days">Retention Days</label>
                    <input
                      id="retention-days"
                      type="number"
                      name="retention_days"
                      value={formData.retention_days}
                      onChange={handleInputChange}
                      min="1"
                      placeholder="Archive files older than (days)"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="min-quality-score">Min Quality Score (%)</label>
                    <input
                      id="min-quality-score"
                      type="number"
                      name="min_quality_score"
                      value={formData.min_quality_score}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="Archive files below this score"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="max-file-size">Max File Size (MB)</label>
                    <input
                      id="max-file-size"
                      type="number"
                      name="max_file_size_mb"
                      value={formData.max_file_size_mb}
                      onChange={handleInputChange}
                      min="1"
                      placeholder="Archive files larger than (MB)"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="access-pattern">Access Pattern</label>
                    <select
                      id="access-pattern"
                      name="access_pattern"
                      value={formData.access_pattern}
                      onChange={handleInputChange}
                    >
                      <option value="">Any</option>
                      <option value="cold">Cold (rarely accessed)</option>
                      <option value="warm">Warm</option>
                      <option value="hot">Hot</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="file-types">File Types (comma-separated)</label>
                    <input
                      id="file-types"
                      type="text"
                      name="file_types"
                      value={formData.file_types.join(', ')}
                      onChange={handleArrayInputChange}
                      placeholder="e.g., csv, xlsx, json"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="policy-tags">Tags (comma-separated)</label>
                    <input
                      id="policy-tags"
                      type="text"
                      name="tags"
                      value={formData.tags.join(', ')}
                      onChange={handleArrayInputChange}
                      placeholder="e.g., temp, processed, old"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="custom-condition">Custom SQL Condition (Advanced)</label>
                    <textarea
                      id="custom-condition"
                      name="custom_condition"
                      value={formData.custom_condition}
                      onChange={handleInputChange}
                      rows="2"
                      placeholder="e.g., row_count < 100 AND quality_score < 80"
                    />
                  </div>
                </div>

                <h3 className="section-title">Archive Destination</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="storage-type">Storage Type *</label>
                    <select
                      id="storage-type"
                      name="archive_storage_type"
                      value={formData.archive_storage_type}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="local">Local Storage</option>
                      <option value="s3">Amazon S3</option>
                      <option value="gcs">Google Cloud Storage</option>
                      <option value="azure">Azure Blob Storage</option>
                    </select>
                  </div>

                  {formData.archive_storage_type !== 'local' && (
                    <div className="form-group">
                      <label htmlFor="storage-connection">Storage Connection</label>
                      <select
                        id="storage-connection"
                        name="archive_connection_id"
                        value={formData.archive_connection_id}
                        onChange={handleInputChange}
                      >
                        <option value="">Select Connection</option>
                        {connections
                          .filter(conn => conn.connection_type === formData.archive_storage_type)
                          .map(conn => (
                            <option key={conn.id} value={conn.id}>
                              {conn.connection_name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group full-width">
                    <label htmlFor="archive-path-prefix">Archive Path Prefix</label>
                    <input
                      id="archive-path-prefix"
                      type="text"
                      name="archive_path_prefix"
                      value={formData.archive_path_prefix}
                      onChange={handleInputChange}
                      placeholder="e.g., archived/2025/ or archives/"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'create' ? 'Create Policy' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Retention Policy</h2>
              <button className="modal-close" onClick={() => setDeleteModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete the policy "{policyToDelete?.name}"?</p>
              <p className="text-warning">This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete Policy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RetentionPolicies;
