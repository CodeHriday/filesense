import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiAlertCircle, FiFileText, FiInfo } from 'react-icons/fi';
import axios from 'axios';
import './FileSchemaManager.css';

function FileSchemaManager({ agreementId }) {
  const [fileSchemas, setFileSchemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    file_name_pattern: '',
    file_description: '',
    schema: '',
    priority: 100,
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (agreementId) {
      fetchFileSchemas();
    }
  }, [agreementId]);

  const fetchFileSchemas = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`/api/vendor-agreements/${agreementId}/file-schemas`);
      setFileSchemas(response.data.fileSchemas || response.data || []);
    } catch (err) {
      console.error('Error fetching file schemas:', err);
      setError(err.response?.data?.message || 'Failed to load file schemas');
    } finally {
      setLoading(false);
    }
  };

  const validateSchema = (schemaText) => {
    if (!schemaText.trim()) return true;
    
    try {
      JSON.parse(schemaText);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.file_name_pattern.trim()) {
      alert('File name pattern is required');
      return;
    }

    if (formData.schema && !validateSchema(formData.schema)) {
      alert('Invalid JSON schema format');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        schema: formData.schema ? JSON.parse(formData.schema) : null
      };
      await axios.post(`/api/vendor-agreements/${agreementId}/file-schemas`, payload);
      setShowCreateForm(false);
      setFormData({
        file_name_pattern: '',
        file_description: '',
        schema: '',
        priority: 100,
        is_active: true
      });
      await fetchFileSchemas();
    } catch (err) {
      console.error('Error creating file schema:', err);
      alert(err.response?.data?.message || 'Failed to create file schema');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (schemaId) => {
    if (!formData.file_name_pattern.trim()) {
      alert('File name pattern is required');
      return;
    }

    if (formData.schema && !validateSchema(formData.schema)) {
      alert('Invalid JSON schema format');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        schema: formData.schema ? JSON.parse(formData.schema) : null
      };
      await axios.put(`/api/vendor-agreements/${agreementId}/file-schemas/${schemaId}`, payload);
      setEditingId(null);
      setFormData({
        file_name_pattern: '',
        file_description: '',
        schema: '',
        priority: 100,
        is_active: true
      });
      await fetchFileSchemas();
    } catch (err) {
      console.error('Error updating file schema:', err);
      alert(err.response?.data?.message || 'Failed to update file schema');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (schemaId, pattern) => {
    if (!confirm(`Are you sure you want to delete the file schema for pattern "${pattern}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`/api/vendor-agreements/${agreementId}/file-schemas/${schemaId}`);
      await fetchFileSchemas();
    } catch (err) {
      console.error('Error deleting file schema:', err);
      alert(err.response?.data?.message || 'Failed to delete file schema');
    }
  };

  const startEdit = (schema) => {
    setEditingId(schema.id);
    setFormData({
      file_name_pattern: schema.file_name_pattern,
      file_description: schema.file_description || '',
      schema: schema.schema ? JSON.stringify(schema.schema, null, 2) : '',
      priority: schema.priority ?? 100,
      is_active: schema.is_active !== false
    });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      file_name_pattern: '',
      file_description: '',
      schema: '',
      priority: 100,
      is_active: true
    });
  };

  const startCreate = () => {
    setShowCreateForm(true);
    setEditingId(null);
    setFormData({
      file_name_pattern: '',
      file_description: '',
      schema: '',
      priority: 100,
      is_active: true
    });
  };

  if (loading) {
    return (
      <div className="file-schema-manager">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading file schemas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="file-schema-manager">
      <div className="schema-header">
        <div className="header-title">
          <FiFileText className="header-icon" />
          <h3>File Schemas</h3>
        </div>
        <button
          className="btn-create-schema"
          onClick={startCreate}
          disabled={showCreateForm}
        >
          <FiPlus /> Add File Schema
        </button>
      </div>

      {error && (
        <div className="error-message">
          <FiAlertCircle /> {error}
        </div>
      )}

      <div className="schema-info-box">
        <FiInfo className="info-icon" />
        <div className="info-content">
          <strong>Pattern Matching:</strong> Use glob patterns with wildcards (* and ?) to match multiple files.
          <br />
          <em>Examples:</em> customer_*.csv, order_*.xlsx, invoice_2024*.json
          <br />
          <strong>Priority:</strong> Lower numbers are matched first (e.g., priority 1 checked before priority 100)
        </div>
      </div>

      {showCreateForm && (
        <div className="schema-form-container">
          <form className="schema-form" onSubmit={handleCreate}>
            <div className="form-header">
              <h4><FiPlus /> Create New File Schema</h4>
              <button type="button" className="btn-close" onClick={() => setShowCreateForm(false)}>
                <FiX />
              </button>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>File Name Pattern *</label>
                <input
                  type="text"
                  value={formData.file_name_pattern}
                  onChange={(e) => setFormData({ ...formData, file_name_pattern: e.target.value })}
                  placeholder="e.g., customer_*.csv"
                  required
                />
                <small>Use * for multiple characters, ? for single character</small>
              </div>

              <div className="form-group">
                <label>Priority</label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  min="0"
                  step="1"
                />
                <small>Lower numbers are matched first (default: 100)</small>
              </div>

              <div className="form-group full-width">
                <label>File Description</label>
                <input
                  type="text"
                  value={formData.file_description}
                  onChange={(e) => setFormData({ ...formData, file_description: e.target.value })}
                  placeholder="Brief description of files matching this pattern"
                />
              </div>

              <div className="form-group full-width">
                <label>Schema (JSON)</label>
                <textarea
                  value={formData.schema}
                  onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
                  placeholder='{"fields": [{"name": "column_name", "type": "string"}]}'
                  rows="6"
                />
                <small>Optional: Define expected file structure as JSON</small>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => setShowCreateForm(false)}>
                <FiX /> Cancel
              </button>
              <button type="submit" className="btn-save" disabled={submitting}>
                <FiSave /> {submitting ? 'Creating...' : 'Create Schema'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="schemas-list">
        {fileSchemas.length === 0 ? (
          <div className="empty-state">
            <FiFileText className="empty-icon" />
            <p>No file schemas defined yet</p>
            <small>Add file schemas to support multiple file patterns with different validation rules</small>
          </div>
        ) : (
          fileSchemas
            .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
            .map((schema) => (
              <div
                key={schema.id}
                className={`schema-item ${editingId === schema.id ? 'editing' : ''} ${!schema.is_active ? 'inactive' : ''}`}
              >
                {editingId === schema.id ? (
                  <form className="schema-edit-form" onSubmit={(e) => { e.preventDefault(); handleUpdate(schema.id); }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>File Name Pattern *</label>
                        <input
                          type="text"
                          value={formData.file_name_pattern}
                          onChange={(e) => setFormData({ ...formData, file_name_pattern: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Priority</label>
                        <input
                          type="number"
                          value={formData.priority}
                          onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                          min="0"
                          step="1"
                        />
                      </div>

                      <div className="form-group full-width">
                        <label>File Description</label>
                        <input
                          type="text"
                          value={formData.file_description}
                          onChange={(e) => setFormData({ ...formData, file_description: e.target.value })}
                        />
                      </div>

                      <div className="form-group full-width">
                        <label>Schema (JSON)</label>
                        <textarea
                          value={formData.schema}
                          onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
                          rows="6"
                        />
                      </div>

                      <div className="form-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          />
                          <span>Active</span>
                        </label>
                      </div>
                    </div>

                    <div className="form-actions">
                      <button type="button" className="btn-cancel-small" onClick={cancelEdit}>
                        <FiX /> Cancel
                      </button>
                      <button type="submit" className="btn-save-small" disabled={submitting}>
                        <FiSave /> {submitting ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="schema-content">
                      <div className="schema-main-info">
                        <div className="schema-pattern">
                          <FiFileText className="pattern-icon" />
                          <strong>{schema.file_name_pattern}</strong>
                          <span className="priority-badge">Priority: {schema.priority ?? 100}</span>
                          {!schema.is_active && <span className="inactive-badge">Inactive</span>}
                        </div>
                        {schema.file_description && (
                          <div className="schema-description">{schema.file_description}</div>
                        )}
                        {schema.schema && (
                          <div className="schema-preview">
                            <details>
                              <summary>View Schema</summary>
                              <pre>{JSON.stringify(schema.schema, null, 2)}</pre>
                            </details>
                          </div>
                        )}
                      </div>
                      <div className="schema-actions">
                        <button
                          className="btn-edit-schema"
                          onClick={() => startEdit(schema)}
                          title="Edit schema"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          className="btn-delete-schema"
                          onClick={() => handleDelete(schema.id, schema.file_name_pattern)}
                          title="Delete schema"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
}

export default FileSchemaManager;
