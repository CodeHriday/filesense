import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SubProjectMemberManagement from './SubProjectMemberManagement';
import S3FolderBrowser from './S3FolderBrowser';
import './EditSubProjectModal.css';
import PropTypes from 'prop-types';

function EditSubProjectModal({ show, onClose, projectId, subProject, onUpdate }) {
  const [activeTab, setActiveTab] = useState('details');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    drop_location_connection_id: '',
    drop_location_bucket: '',
    drop_location_prefix: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [storageConnections, setStorageConnections] = useState([]);
  const [showS3Browser, setShowS3Browser] = useState(false);

  useEffect(() => {
    if (show) {
      fetchStorageConnections();
    }
  }, [show]);

  useEffect(() => {
    if (subProject) {
      setFormData({
        name: subProject.name || '',
        description: subProject.description || '',
        is_active: subProject.is_active !== undefined ? subProject.is_active : true,
        drop_location_connection_id: subProject.drop_location_connection_id || '',
        drop_location_bucket: subProject.drop_location_bucket || '',
        drop_location_prefix: subProject.drop_location_prefix || ''
      });
    }
  }, [subProject]);

  const fetchStorageConnections = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/connections/storage', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStorageConnections(response.data || []);
    } catch (err) {
      console.error('Error fetching storage connections:', err);
    }
  };

  const handleS3PathSelect = (path) => {
    const selectedConnection = storageConnections.find(c => c.id === formData.drop_location_connection_id);
    const bucketName = selectedConnection?.bucket_name || selectedConnection?.config?.bucket_name || '';
    setFormData({
      ...formData,
      drop_location_bucket: bucketName,
      drop_location_prefix: path.startsWith('/') ? path.slice(1) : path
    });
    setShowS3Browser(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Sub-project name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const token = localStorage.getItem('token');
      await axios.put(
        `/api/projects/${projectId}/sub-projects/${subProject.id}`,
        {
          name: formData.name,
          description: formData.description,
          is_active: formData.is_active,
          drop_location_connection_id: formData.drop_location_connection_id || null,
          drop_location_bucket: formData.drop_location_bucket || null,
          drop_location_prefix: formData.drop_location_prefix || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (onUpdate) {
        await onUpdate();
      }
      
      onClose();
    } catch (err) {
      console.error('Error updating sub-project:', err);
      setError(err.response?.data?.message || 'Failed to update sub-project');
    } finally {
      setSaving(false);
    }
  };

  if (!show || !subProject) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-large">
        <div className="modal-header">
          <h2>Edit Sub-Project - {subProject.name}</h2>
          <button className="close-btn" onClick={onClose} disabled={saving}>×</button>
        </div>

        <div className="modal-body">
          <div className="edit-subproject-tabs">
            <button
              className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
              type="button"
            >
              Details
            </button>
            <button
              className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
              type="button"
            >
              Members
            </button>
            <button
              className={`tab-button ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveTab('groups')}
              type="button"
            >
              Access Groups
            </button>
          </div>

          {error && (
            <div className="alert alert-error" style={{ margin: '1rem 1.5rem' }}>
              {error}
            </div>
          )}

          <div className="tab-content">
            {activeTab === 'details' && (
              <form onSubmit={handleSave} style={{ padding: '1rem 1.5rem' }}>
                <div className="form-group">
                  <label htmlFor="subProjectName">Sub-Project Name *</label>
                  <input
                    id="subProjectName"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="subProjectDescription">Description</label>
                  <textarea
                    id="subProjectDescription"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="4"
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="subProjectActive" className="checkbox-label">
                    <input
                      id="subProjectActive"
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      disabled={saving}
                    />
                    Active
                  </label>
                </div>

                <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600 }}>File Drop Location (S3)</h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: '#6b7280' }}>
                  Override the parent project's file drop location for this sub-project.
                </p>
                
                <div className="form-group">
                  <label htmlFor="dropConnection">Storage Connection</label>
                  <select
                    id="dropConnection"
                    value={formData.drop_location_connection_id}
                    onChange={(e) => setFormData({ ...formData, drop_location_connection_id: e.target.value })}
                    disabled={saving}
                  >
                    <option value="">-- Use Parent Project Setting --</option>
                    {storageConnections.map(conn => (
                      <option key={conn.id} value={conn.id}>
                        {conn.name} ({conn.type})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="dropBucket">Bucket Name</label>
                  <input
                    id="dropBucket"
                    type="text"
                    value={formData.drop_location_bucket}
                    placeholder="Auto-populated from connection"
                    readOnly
                    disabled={saving}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="dropPrefix">Folder Prefix</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      id="dropPrefix"
                      type="text"
                      value={formData.drop_location_prefix}
                      onChange={(e) => setFormData({ ...formData, drop_location_prefix: e.target.value })}
                      placeholder="e.g., uploads/sub-project/"
                      disabled={saving}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowS3Browser(true)}
                      disabled={!formData.drop_location_connection_id || saving}
                      title={formData.drop_location_connection_id ? 'Browse folders' : 'Select a connection first'}
                      style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                    >
                      Browse
                    </button>
                  </div>
                </div>
              </form>
            )}

            {activeTab === 'members' && (
              <div style={{ padding: '1rem 1.5rem' }}>
                <SubProjectMemberManagement
                  projectId={projectId}
                  subProjectId={subProject.id}
                  subProjectName={subProject.name}
                  mode="members"
                />
              </div>
            )}

            {activeTab === 'groups' && (
              <div style={{ padding: '1rem 1.5rem' }}>
                <SubProjectMemberManagement
                  projectId={projectId}
                  subProjectId={subProject.id}
                  subProjectName={subProject.name}
                  mode="groups"
                />
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
          {activeTab === 'details' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {showS3Browser && formData.drop_location_connection_id && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal modal-large">
            <div className="modal-header">
              <h2>Browse Folder</h2>
              <button className="close-btn" onClick={() => setShowS3Browser(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '500px', overflow: 'auto' }}>
              <S3FolderBrowser
                connectionId={formData.drop_location_connection_id}
                onSelectPath={handleS3PathSelect}
                browseEndpoint="/api/bulk-profiling/browse"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowS3Browser(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
EditSubProjectModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  subProject: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string,
    description: PropTypes.string,
    is_active: PropTypes.bool
  }),
  onUpdate: PropTypes.func
};
export default EditSubProjectModal;
