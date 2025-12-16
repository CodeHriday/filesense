import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SubProjectMemberManagement from './SubProjectMemberManagement';
import './EditSubProjectModal.css';

function EditSubProjectModal({ show, onClose, projectId, subProject, onUpdate }) {
  const [activeTab, setActiveTab] = useState('details');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (subProject) {
      setFormData({
        name: subProject.name || '',
        description: subProject.description || '',
        is_active: subProject.is_active !== undefined ? subProject.is_active : true
      });
    }
  }, [subProject]);

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
          is_active: formData.is_active
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
    </div>
  );
}

export default EditSubProjectModal;
