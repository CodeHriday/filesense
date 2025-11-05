import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiFolder, FiFolderPlus, FiSave, FiX, FiAlertCircle } from 'react-icons/fi';
import axios from 'axios';
import './SubProjectManagement.css';

function SubProjectManagement({ projectId, projectName }) {
  const [subProjects, setSubProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', is_active: true });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchSubProjects();
    }
  }, [projectId]);

  const fetchSubProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/projects/${projectId}/sub-projects`);
      setSubProjects(response.data.subProjects || []);
    } catch (err) {
      console.error('Error fetching sub-projects:', err);
      setError(err.response?.data?.message || 'Failed to load sub-projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Sub-project name is required');
      return;
    }

    try {
      setSubmitting(true);
      await axios.post(`/api/projects/${projectId}/sub-projects`, formData);
      setShowCreateForm(false);
      setFormData({ name: '', description: '', is_active: true });
      await fetchSubProjects();
    } catch (err) {
      console.error('Error creating sub-project:', err);
      alert(err.response?.data?.message || 'Failed to create sub-project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (subProjectId) => {
    if (!formData.name.trim()) {
      alert('Sub-project name is required');
      return;
    }

    try {
      setSubmitting(true);
      await axios.put(`/api/projects/${projectId}/sub-projects/${subProjectId}`, formData);
      setEditingId(null);
      setFormData({ name: '', description: '', is_active: true });
      await fetchSubProjects();
    } catch (err) {
      console.error('Error updating sub-project:', err);
      alert(err.response?.data?.message || 'Failed to update sub-project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (subProjectId, subProjectName) => {
    if (!confirm(`Are you sure you want to delete the sub-project "${subProjectName}"?\n\nThis action cannot be undone. The sub-project must not contain any files.`)) {
      return;
    }

    try {
      await axios.delete(`/api/projects/${projectId}/sub-projects/${subProjectId}`);
      await fetchSubProjects();
    } catch (err) {
      console.error('Error deleting sub-project:', err);
      alert(err.response?.data?.message || 'Failed to delete sub-project');
    }
  };

  const startEdit = (subProject) => {
    setEditingId(subProject.id);
    setFormData({
      name: subProject.name,
      description: subProject.description || '',
      is_active: subProject.is_active
    });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', is_active: true });
  };

  const startCreate = () => {
    setShowCreateForm(true);
    setEditingId(null);
    setFormData({ name: '', description: '', is_active: true });
  };

  if (loading) {
    return (
      <div className="sub-project-management">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading sub-projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sub-project-management">
      <div className="sub-project-header">
        <div className="header-title">
          <FiFolder size={20} />
          <h2>Sub-Projects</h2>
          <span className="parent-project-badge">{projectName}</span>
        </div>
        <button 
          className="btn btn-primary"
          onClick={startCreate}
          disabled={showCreateForm}
        >
          <FiFolderPlus size={16} />
          Create Sub-Project
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <FiAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {showCreateForm && (
        <div className="sub-project-form-card">
          <div className="form-card-header">
            <h3><FiFolderPlus size={18} /> Create New Sub-Project</h3>
            <button className="btn-icon" onClick={() => setShowCreateForm(false)} disabled={submitting}>
              <FiX size={18} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="sub-project-form">
            <div className="form-group">
              <label>Sub-Project Name <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Marketing Data, Q1 Reports"
                required
                disabled={submitting}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-input"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description for this sub-project"
                rows={3}
                disabled={submitting}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <FiSave size={16} />
                {submitting ? 'Creating...' : 'Create Sub-Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {subProjects.length === 0 && !showCreateForm ? (
        <div className="empty-state">
          <FiFolder size={64} />
          <h3>No Sub-Projects Yet</h3>
          <p>Create sub-projects to organize files within {projectName}</p>
          <button className="btn btn-primary" onClick={startCreate}>
            <FiFolderPlus size={16} />
            Create Your First Sub-Project
          </button>
        </div>
      ) : (
        <div className="sub-projects-grid">
          {subProjects.map((subProject) => (
            <div key={subProject.id} className={`sub-project-card ${!subProject.is_active ? 'inactive' : ''}`}>
              {editingId === subProject.id ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      className="form-input"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      disabled={submitting}
                    />
                  </div>
                  <div className="form-group-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        disabled={submitting}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={submitting}>
                      <FiX size={14} /> Cancel
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(subProject.id)} disabled={submitting}>
                      <FiSave size={14} /> {submitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="card-header">
                    <div className="card-title">
                      <FiFolder size={20} className="folder-icon" />
                      <h3>{subProject.name}</h3>
                    </div>
                    <div className="card-actions">
                      <button 
                        className="btn-icon" 
                        onClick={() => startEdit(subProject)}
                        title="Edit sub-project"
                      >
                        <FiEdit2 size={16} />
                      </button>
                      <button 
                        className="btn-icon btn-icon-danger" 
                        onClick={() => handleDelete(subProject.id, subProject.name)}
                        title="Delete sub-project"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    {subProject.description && (
                      <p className="description">{subProject.description}</p>
                    )}
                    <div className="card-stats">
                      <div className="stat">
                        <span className="stat-label">Files</span>
                        <span className="stat-value">{subProject.file_count || 0}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Size</span>
                        <span className="stat-value">{formatBytes(subProject.total_size || 0)}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Status</span>
                        <span className={`status-badge ${subProject.is_active ? 'active' : 'inactive'}`}>
                          {subProject.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    {subProject.owner_name && (
                      <div className="card-footer">
                        <span className="owner-label">Owner:</span>
                        <span className="owner-name">{subProject.owner_name}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default SubProjectManagement;
