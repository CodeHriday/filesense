import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiAlertCircle, FiFileText, FiInfo, FiShield } from 'react-icons/fi';
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
    is_active: true,
    column_metadata: {}
  });
  const [columnList, setColumnList] = useState([]);
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

  // Parse schema JSON to extract column names
  const parseSchemaColumns = (schemaText) => {
    if (!schemaText.trim()) return [];
    try {
      const parsed = JSON.parse(schemaText);
      if (parsed.fields && Array.isArray(parsed.fields)) {
        return parsed.fields.map(f => f.name).filter(Boolean);
      }
      return [];
    } catch (e) {
      return [];
    }
  };

  // Sync column list when schema changes
  useEffect(() => {
    const schemaColumns = parseSchemaColumns(formData.schema);
    const existingColumns = columnList.map(c => c.name);
    
    // Add new schema columns not in list
    const newColumns = schemaColumns
      .filter(name => !existingColumns.includes(name))
      .map(name => ({
        name,
        contains_pii: false,
        pii_type: '',
        data_type: '',
        description: ''
      }));
    
    if (newColumns.length > 0) {
      setColumnList([...columnList, ...newColumns]);
    }
  }, [formData.schema]);

  // Update column metadata in formData when columnList changes
  useEffect(() => {
    const metadata = {};
    columnList.forEach(col => {
      if (col.name) {
        metadata[col.name] = {
          contains_pii: col.contains_pii,
          pii_type: col.pii_type || null,
          data_type: col.data_type || null,
          description: col.description || null
        };
      }
    });
    setFormData(prev => ({ ...prev, column_metadata: metadata }));
  }, [columnList]);

  // Add a new column to the list
  const addColumn = () => {
    setColumnList([...columnList, {
      name: '',
      contains_pii: false,
      pii_type: '',
      data_type: '',
      description: ''
    }]);
  };

  // Remove a column from the list
  const removeColumn = (index) => {
    setColumnList(columnList.filter((_, i) => i !== index));
  };

  // Update column at index
  const updateColumn = (index, field, value) => {
    const updated = [...columnList];
    updated[index] = { ...updated[index], [field]: value };
    setColumnList(updated);
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
        is_active: true,
        column_metadata: {}
      });
      setColumnList([]);
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
        is_active: true,
        column_metadata: {}
      });
      setColumnList([]);
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
      is_active: schema.is_active !== false,
      column_metadata: schema.column_metadata || {}
    });
    
    // Load column metadata into editable list
    const metadata = schema.column_metadata || {};
    const columns = Object.keys(metadata).map(name => ({
      name,
      contains_pii: metadata[name].contains_pii || false,
      pii_type: metadata[name].pii_type || '',
      data_type: metadata[name].data_type || '',
      description: metadata[name].description || ''
    }));
    setColumnList(columns);
    
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      file_name_pattern: '',
      file_description: '',
      schema: '',
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
              <div className="form-group full-width">
                <label htmlFor="fileNamePattern">File Name Pattern *</label>
                <input
                  id="fileNamePattern"
                  type="text"
                  value={formData.file_name_pattern}
                  onChange={(e) => setFormData({ ...formData, file_name_pattern: e.target.value })}
                  placeholder="e.g., customer_*.csv"
                  required
                />
                <small>Use * for multiple characters, ? for single character</small>
              </div>

              <div className="form-group full-width">
                <label htmlFor="fileDescription">File Description</label>
                <input
                  id="fileDescription"
                  type="text"
                  value={formData.file_description}
                  onChange={(e) => setFormData({ ...formData, file_description: e.target.value })}
                  placeholder="Brief description of files matching this pattern"
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="schemaJson">Schema (JSON)</label>
                <textarea
                  id="schemaJson"
                  value={formData.schema}
                  onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
                  placeholder='{"fields": [{"name": "column_name", "type": "string"}]}'
                  rows="6"
                />
                <small>Optional: Define expected file structure as JSON</small>
              </div>

              <div className="form-group full-width">
                <label style={{marginBottom: '0.75rem', display: 'block', fontWeight: 600}}>
                  <FiShield style={{marginRight: '0.5rem'}} />
                  Column-Level PII Tags
                </label>
                <div className="column-governance-section">
                  {columnList.length > 0 ? (
                    <div className="column-table">
                      <div className="column-table-header">
                        <span>Column Name</span>
                        <span>Contains PII</span>
                        <span>PII Type</span>
                        <span>Data Type</span>
                        <span>Description</span>
                        <span>Action</span>
                      </div>
                      {columnList.map((col, idx) => (
                        <div key={idx} className="column-table-row">
                          <input
                            type="text"
                            value={col.name}
                            onChange={(e) => updateColumn(idx, 'name', e.target.value)}
                            placeholder="column_name"
                            className="column-input"
                          />
                          <input
                            type="checkbox"
                            checked={col.contains_pii}
                            onChange={(e) => updateColumn(idx, 'contains_pii', e.target.checked)}
                            className="column-checkbox"
                          />
                          <select
                            value={col.pii_type}
                            onChange={(e) => updateColumn(idx, 'pii_type', e.target.value)}
                            disabled={!col.contains_pii}
                            className="column-select"
                          >
                            <option value="">None</option>
                            <option value="email">Email</option>
                            <option value="phone">Phone</option>
                            <option value="ssn">SSN</option>
                            <option value="address">Address</option>
                            <option value="name">Name</option>
                            <option value="dob">Date of Birth</option>
                            <option value="financial">Financial</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            type="text"
                            value={col.data_type}
                            onChange={(e) => updateColumn(idx, 'data_type', e.target.value)}
                            placeholder="string"
                            className="column-input"
                          />
                          <input
                            type="text"
                            value={col.description}
                            onChange={(e) => updateColumn(idx, 'description', e.target.value)}
                            placeholder="Optional description"
                            className="column-input"
                          />
                          <button
                            type="button"
                            onClick={() => removeColumn(idx)}
                            className="btn-remove-column"
                            title="Remove column"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{color: '#666', fontSize: '0.875rem', marginBottom: '0.75rem'}}>
                      No columns defined. Add columns manually or define a schema JSON above.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={addColumn}
                    className="btn-add-column"
                  >
                    <FiPlus /> Add Column
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="isActive" className="checkbox-label">
                  <input
                    id="isActive"
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
          fileSchemas.map((schema) => (
              <div
                key={schema.id}
                className={`schema-item ${editingId === schema.id ? 'editing' : ''} ${!schema.is_active ? 'inactive' : ''}`}
              >
                {editingId === schema.id ? (
                  <form className="schema-edit-form" onSubmit={(e) => { e.preventDefault(); handleUpdate(schema.id); }}>
                    <div className="form-grid">
                      <div className="form-group full-width">
                        <label htmlFor="editFileNamePattern">File Name Pattern *</label>
                        <input
                          id="editFileNamePattern"
                          type="text"
                          value={formData.file_name_pattern}
                          onChange={(e) => setFormData({ ...formData, file_name_pattern: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group full-width">
                        <label htmlFor="editFileDescription">File Description</label>
                        <input
                          id="editFileDescription"
                          type="text"
                          value={formData.file_description}
                          onChange={(e) => setFormData({ ...formData, file_description: e.target.value })}
                        />
                      </div>

                      <div className="form-group full-width">
                        <label htmlFor="editSchemaJson">Schema (JSON)</label>
                        <textarea
                          id="editSchemaJson"
                          value={formData.schema}
                          onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
                          rows="6"
                        />
                      </div>

                      <div className="form-group full-width">
                        <label style={{marginBottom: '0.75rem', display: 'block', fontWeight: 600}}>
                          <FiShield style={{marginRight: '0.5rem'}} />
                          Column-Level PII Tags
                        </label>
                        <div className="column-governance-section">
                          {columnList.length > 0 ? (
                            <div className="column-table">
                              <div className="column-table-header">
                                <span>Column Name</span>
                                <span>Contains PII</span>
                                <span>PII Type</span>
                                <span>Data Type</span>
                                <span>Description</span>
                                <span>Action</span>
                              </div>
                              {columnList.map((col, idx) => (
                                <div key={idx} className="column-table-row">
                                  <input
                                    type="text"
                                    value={col.name}
                                    onChange={(e) => updateColumn(idx, 'name', e.target.value)}
                                    placeholder="column_name"
                                    className="column-input"
                                  />
                                  <input
                                    type="checkbox"
                                    checked={col.contains_pii}
                                    onChange={(e) => updateColumn(idx, 'contains_pii', e.target.checked)}
                                    className="column-checkbox"
                                  />
                                  <select
                                    value={col.pii_type}
                                    onChange={(e) => updateColumn(idx, 'pii_type', e.target.value)}
                                    disabled={!col.contains_pii}
                                    className="column-select"
                                  >
                                    <option value="">None</option>
                                    <option value="email">Email</option>
                                    <option value="phone">Phone</option>
                                    <option value="ssn">SSN</option>
                                    <option value="address">Address</option>
                                    <option value="name">Name</option>
                                    <option value="dob">Date of Birth</option>
                                    <option value="financial">Financial</option>
                                    <option value="other">Other</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={col.data_type}
                                    onChange={(e) => updateColumn(idx, 'data_type', e.target.value)}
                                    placeholder="string"
                                    className="column-input"
                                  />
                                  <input
                                    type="text"
                                    value={col.description}
                                    onChange={(e) => updateColumn(idx, 'description', e.target.value)}
                                    placeholder="Optional description"
                                    className="column-input"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeColumn(idx)}
                                    className="btn-remove-column"
                                    title="Remove column"
                                  >
                                    <FiTrash2 />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{color: '#666', fontSize: '0.875rem', marginBottom: '0.75rem'}}>
                              No columns defined. Add columns manually or define a schema JSON above.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={addColumn}
                            className="btn-add-column"
                          >
                            <FiPlus /> Add Column
                          </button>
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="editIsActive" className="checkbox-label">
                          <input
                            id="editIsActive"
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
