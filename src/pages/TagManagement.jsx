import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FiTag, FiPlus, FiEdit2, FiTrash2, FiAlertCircle, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/global-page-styles.css';

function ConfirmDeleteModal({ tagName, onConfirm, onCancel }) {
  return (
    <div className="gps-modal-overlay" onClick={onCancel}>
      <div className="gps-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="gps-modal-header">
          <h2 className="gps-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiAlertCircle style={{ color: '#f59e0b' }} />
            Confirm Delete
          </h2>
          <button className="gps-modal-close" onClick={onCancel}>
            <FiX />
          </button>
        </div>
        <div className="gps-modal-body">
          <p>Are you sure you want to delete the tag <strong>"{tagName}"</strong>?</p>
          <p className="gps-text-muted" style={{ fontSize: '10px' }}>This action cannot be undone.</p>
        </div>
        <div className="gps-modal-footer">
          <button className="gps-btn gps-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="gps-btn gps-btn--danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmDeleteModal.propTypes = {
  tagName: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

function TagManagement() {
  const [tags, setTags] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [currentTag, setCurrentTag] = useState(null);
  const [tagToDelete, setTagToDelete] = useState(null);
  const [formData, setFormData] = useState({
    tag_name: '',
    description: '',
    color: '#3B82F6',
    badge_style: 'default',
    permission_level: 'Public',
    sensitivity_level: 'Low'
  });
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.roles?.includes('Admin');

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/governance-tags', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTags(response.data);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const handleOpenModal = (mode, tag = null) => {
    setModalMode(mode);
    setCurrentTag(tag);
    if (mode === 'edit' && tag) {
      setFormData({
        tag_name: tag.tag_name,
        description: tag.description || '',
        color: tag.color || '#3B82F6',
        badge_style: tag.badge_style || 'default',
        permission_level: tag.permission_level || 'Public',
        sensitivity_level: tag.sensitivity_level || 'Low'
      });
    } else {
      setFormData({
        tag_name: '',
        description: '',
        color: '#3B82F6',
        badge_style: 'default',
        permission_level: 'Public',
        sensitivity_level: 'Low'
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCurrentTag(null);
    setFormData({
      tag_name: '',
      description: '',
      color: '#3B82F6',
      badge_style: 'default',
      permission_level: 'Public',
      sensitivity_level: 'Low'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      
      if (modalMode === 'create') {
        await axios.post('/api/governance-tags', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.put(`/api/governance-tags/${currentTag.tag_id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      handleCloseModal();
      fetchTags();
    } catch (error) {
      console.error('Error saving tag:', error);
      alert(error.response?.data?.error || 'Failed to save tag');
    }
  };

  const handleDelete = (tag) => {
    setTagToDelete(tag);
  };

  const confirmDelete = async () => {
    if (!tagToDelete) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/governance-tags/${tagToDelete.tag_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTagToDelete(null);
      fetchTags();
    } catch (error) {
      console.error('Error deleting tag:', error);
      alert(error.response?.data?.error || 'Failed to delete tag');
      setTagToDelete(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="gps-page-container">
        <div className="gps-empty-state">
          <h1>Access Denied</h1>
          <p>You do not have permission to manage governance tags.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">
            <FiTag style={{ marginRight: '8px', color: '#025043' }} />
            Data Governance Tags
          </h1>
          <p className="gps-page-subtitle">
            Define and manage tags for classifying and organizing your data files.
          </p>
        </div>
        <div className="gps-header-actions">
          <button className="gps-btn gps-btn--primary" onClick={() => handleOpenModal('create')}>
            <FiPlus /> Create Tag
          </button>
        </div>
      </div>

      {tags.length === 0 ? (
        <div className="gps-empty-state">
          <FiTag style={{ fontSize: '48px', color: '#9ca3af', marginBottom: '16px' }} />
          <h3>No tags defined yet</h3>
          <p>Create your first tag to start organizing your data files.</p>
          <button className="gps-btn gps-btn--primary" onClick={() => handleOpenModal('create')}>
            <FiPlus /> Create Tag
          </button>
        </div>
      ) : (
        <div className="gps-table-container">
          <table className="gps-table">
            <thead>
              <tr>
                <th>Tag Name</th>
                <th>Description</th>
                <th>Preview</th>
                <th>Permission Level</th>
                <th>Sensitivity</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.tag_id}>
                  <td style={{ fontWeight: 500 }}>{tag.tag_name}</td>
                  <td>{tag.description || '-'}</td>
                  <td>
                    <span 
                      className="gps-badge" 
                      style={{ backgroundColor: tag.color, color: '#fff' }}
                    >
                      {tag.tag_name}
                    </span>
                  </td>
                  <td>
                    <span className={`gps-badge ${
                      tag.permission_level === 'Private' ? 'gps-badge--danger' :
                      tag.permission_level === 'Restricted' ? 'gps-badge--warning' :
                      'gps-badge--success'
                    }`}>
                      {tag.permission_level || 'Public'}
                    </span>
                  </td>
                  <td>
                    <span className={`gps-badge ${
                      tag.sensitivity_level === 'Critical' ? 'gps-badge--danger' :
                      tag.sensitivity_level === 'High' ? 'gps-badge--warning' :
                      tag.sensitivity_level === 'Medium' ? 'gps-badge--info' :
                      'gps-badge--muted'
                    }`}>
                      {tag.sensitivity_level || 'Low'}
                    </span>
                  </td>
                  <td>
                    {new Date(tag.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="gps-action-buttons">
                      <button
                        className="gps-icon-btn gps-icon-btn--edit"
                        onClick={() => handleOpenModal('edit', tag)}
                        title="Edit tag"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        className="gps-icon-btn gps-icon-btn--delete"
                        onClick={() => handleDelete(tag)}
                        title="Delete tag"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="gps-modal-overlay">
          <div className="gps-modal" style={{ maxWidth: '500px' }}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">{modalMode === 'create' ? 'Create New Tag' : 'Edit Tag'}</h2>
              <button className="gps-modal-close" onClick={handleCloseModal}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="gps-modal-body">
                <div className="gps-form-group">
                  <label htmlFor="tag-name" className="gps-label">Tag Name *</label>
                  <input
                    id="tag-name"
                    type="text"
                    className="gps-input"
                    value={formData.tag_name}
                    onChange={(e) => setFormData({ ...formData, tag_name: e.target.value })}
                    required
                    placeholder="e.g., PII, Financial, Sensitive"
                  />
                </div>

                <div className="gps-form-group">
                  <label htmlFor="tag-description" className="gps-label">Description</label>
                  <textarea
                    id="tag-description"
                    className="gps-textarea"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this tag represents..."
                    rows="3"
                  />
                </div>

                <div className="gps-form-group">
                  <label htmlFor="badge-color" className="gps-label">Badge Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      id="badge-color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      style={{ width: '40px', height: '32px', padding: 0, border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }}
                    />
                    <span 
                      className="gps-badge" 
                      style={{ backgroundColor: formData.color, color: '#fff' }}
                    >
                      {formData.tag_name || 'Preview'}
                    </span>
                  </div>
                </div>

                <div className="gps-form-group">
                  <label htmlFor="permission-level" className="gps-label">Permission Level *</label>
                  <select
                    id="permission-level"
                    className="gps-select"
                    value={formData.permission_level}
                    onChange={(e) => setFormData({ ...formData, permission_level: e.target.value })}
                    required
                  >
                    <option value="Public">Public - Everyone can view</option>
                    <option value="Restricted">Restricted - Requires specific permissions</option>
                    <option value="Private">Private - Admin only</option>
                  </select>
                  <small className="gps-text-muted" style={{ fontSize: '9px', marginTop: '4px', display: 'block' }}>
                    Controls who can access columns tagged with this tag
                  </small>
                </div>

                <div className="gps-form-group">
                  <label htmlFor="sensitivity-level" className="gps-label">Sensitivity Level *</label>
                  <select
                    id="sensitivity-level"
                    className="gps-select"
                    value={formData.sensitivity_level}
                    onChange={(e) => setFormData({ ...formData, sensitivity_level: e.target.value })}
                    required
                  >
                    <option value="Low">Low - General information</option>
                    <option value="Medium">Medium - Internal use</option>
                    <option value="High">High - Confidential</option>
                    <option value="Critical">Critical - Highly sensitive (PII, Financial)</option>
                  </select>
                  <small className="gps-text-muted" style={{ fontSize: '9px', marginTop: '4px', display: 'block' }}>
                    Classification level for data governance and compliance
                  </small>
                </div>
              </div>
              <div className="gps-modal-footer">
                <button type="button" className="gps-btn gps-btn--secondary" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="gps-btn gps-btn--primary">
                  {modalMode === 'create' ? 'Create' : 'Update'} Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tagToDelete && (
        <ConfirmDeleteModal
          tagName={tagToDelete.tag_name}
          onConfirm={confirmDelete}
          onCancel={() => setTagToDelete(null)}
        />
      )}
    </div>
  );
}

export default TagManagement;
