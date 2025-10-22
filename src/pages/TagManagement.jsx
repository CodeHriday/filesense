import React, { useState, useEffect } from 'react';
import { FiTag, FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import Card from '../components/Card';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import './TagManagement.css';

function TagManagement() {
  const [tags, setTags] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [currentTag, setCurrentTag] = useState(null);
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

  const handleDelete = async (tag) => {
    if (!confirm(`Are you sure you want to delete the tag "${tag.tag_name}"?`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/governance-tags/${tag.tag_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTags();
    } catch (error) {
      console.error('Error deleting tag:', error);
      alert(error.response?.data?.error || 'Failed to delete tag');
    }
  };

  if (!isAdmin) {
    return (
      <div className="tag-management-container">
        <h1>Access Denied</h1>
        <p>You do not have permission to manage governance tags.</p>
      </div>
    );
  }

  return (
    <div className="tag-management-container">
      <div className="page-header">
        <div>
          <h1>
            <FiTag className="header-icon" />
            Data Governance Tags
          </h1>
          <p className="page-description">
            Define and manage tags for classifying and organizing your data files.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal('create')}>
          <FiPlus /> Create Tag
        </button>
      </div>

      <Card>
        {tags.length === 0 ? (
          <div className="empty-state">
            <FiTag size={48} />
            <h3>No tags defined yet</h3>
            <p>Create your first tag to start organizing your data files.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal('create')}>
              <FiPlus /> Create Tag
            </button>
          </div>
        ) : (
          <div className="tags-table-container">
            <table className="tags-table">
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
                    <td className="tag-name-cell">{tag.tag_name}</td>
                    <td className="tag-description-cell">{tag.description || '-'}</td>
                    <td className="tag-preview-cell">
                      <span 
                        className="tag-badge" 
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.tag_name}
                      </span>
                    </td>
                    <td className="tag-permission-cell">
                      <span className={`permission-badge permission-${(tag.permission_level || 'Public').toLowerCase()}`}>
                        {tag.permission_level || 'Public'}
                      </span>
                    </td>
                    <td className="tag-sensitivity-cell">
                      <span className={`sensitivity-badge sensitivity-${(tag.sensitivity_level || 'Low').toLowerCase()}`}>
                        {tag.sensitivity_level || 'Low'}
                      </span>
                    </td>
                    <td className="tag-date-cell">
                      {new Date(tag.created_at).toLocaleDateString()}
                    </td>
                    <td className="tag-actions-cell">
                      <button
                        className="btn-icon"
                        onClick={() => handleOpenModal('edit', tag)}
                        title="Edit tag"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        className="btn-icon btn-icon-danger"
                        onClick={() => handleDelete(tag)}
                        title="Delete tag"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content tag-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modalMode === 'create' ? 'Create New Tag' : 'Edit Tag'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="tag_name">Tag Name *</label>
                <input
                  id="tag_name"
                  type="text"
                  value={formData.tag_name}
                  onChange={(e) => setFormData({ ...formData, tag_name: e.target.value })}
                  required
                  placeholder="e.g., PII, Financial, Sensitive"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this tag represents..."
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label htmlFor="color">Badge Color</label>
                <div className="color-picker-group">
                  <input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                  <span 
                    className="color-preview" 
                    style={{ backgroundColor: formData.color }}
                  >
                    {formData.tag_name || 'Preview'}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="permission_level">Permission Level *</label>
                <select
                  id="permission_level"
                  value={formData.permission_level}
                  onChange={(e) => setFormData({ ...formData, permission_level: e.target.value })}
                  required
                >
                  <option value="Public">Public - Everyone can view</option>
                  <option value="Restricted">Restricted - Requires specific permissions</option>
                  <option value="Private">Private - Admin only</option>
                </select>
                <small className="field-help">
                  Controls who can access columns tagged with this tag
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="sensitivity_level">Sensitivity Level *</label>
                <select
                  id="sensitivity_level"
                  value={formData.sensitivity_level}
                  onChange={(e) => setFormData({ ...formData, sensitivity_level: e.target.value })}
                  required
                >
                  <option value="Low">Low - General information</option>
                  <option value="Medium">Medium - Internal use</option>
                  <option value="High">High - Confidential</option>
                  <option value="Critical">Critical - Highly sensitive (PII, Financial)</option>
                </select>
                <small className="field-help">
                  Classification level for data governance and compliance
                </small>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'create' ? 'Create' : 'Update'} Tag
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TagManagement;
