import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiAlertCircle, FiFileText, FiInfo, FiShield } from 'react-icons/fi';
import axios from 'axios';
import './FileSchemaManager.css';
import PropTypes from 'prop-types';

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

  // Parse schema JSON to extract column names.
  // Handles both the array format [{name, data_type}] used by contract schemas
  // and the legacy {fields: [{name}]} object format.
  const parseSchemaColumns = (schemaText) => {
    if (!schemaText || !schemaText.trim()) return [];
    try {
      const parsed = JSON.parse(schemaText);
      // Array format: [{name: 'col', ...}] or [{column_name: 'col', ...}]
      if (Array.isArray(parsed)) {
        return parsed.map(f => f.name || f.column_name).filter(Boolean);
      }
      // Legacy object format: {fields: [{name: 'col'}]}
      if (parsed.fields && Array.isArray(parsed.fields)) {
        return parsed.fields.map(f => f.name).filter(Boolean);
      }
      return [];
    } catch (e) {
      return [];
    }
  };

  const SCHEMA_RULE_TYPES = [
    { value: 'null_check', label: 'Null Check' },
    { value: 'duplicate_check', label: 'Duplicate' },
    { value: 'email_validity', label: 'Email' },
    { value: 'phone_validity', label: 'Phone' },
    { value: 'column_completeness', label: 'Completeness' },
    { value: 'date_format', label: 'Date Format' },
    { value: 'timestamp_format', label: 'Timestamp' },
    { value: 'uniqueness', label: 'Uniqueness' },
    { value: 'isna_check', label: 'N/A Check' },
    { value: 'numeric_only_string', label: 'Numeric Only' },
    { value: 'special_character_presence', label: 'Special Chars' }
  ];
  // Note: length_check and range_check require column-specific bounds that cannot
  // yet be configured in this UI.  They remain in the enforcement engine and can
  // be present in schema JSON saved via the Data Profile builder, but are not
  // offered as selectable options here to prevent false violations from generic defaults.

  // Toggle a quality rule on/off for a column
  const toggleColumnRule = (colIdx, ruleValue) => {
    const updated = [...columnList];
    const col = { ...updated[colIdx] };
    const current = col.quality_rules || [];
    col.quality_rules = current.includes(ruleValue)
      ? current.filter(r => r !== ruleValue)
      : [...current, ruleValue];
    updated[colIdx] = col;
    setColumnList(updated);
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
        description: '',
        quality_rules: []
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
          description: col.description || null,
          quality_rules: col.quality_rules || []
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
      description: '',
      quality_rules: []
    }]);
  };

  // Build schema JSON array with quality_rules injected from columnList
  const buildSchemaWithRules = (schemaText) => {
    if (!schemaText || !schemaText.trim()) return null;
    try {
      const parsed = JSON.parse(schemaText);
      if (!Array.isArray(parsed)) return parsed;
      return parsed.map(col => {
        const colName = col.name || col.column_name;
        const colData = columnList.find(c => c.name === colName);
        if (colData && colData.quality_rules && colData.quality_rules.length > 0) {
          return { ...col, quality_rules: colData.quality_rules };
        }
        // Strip stale quality_rules if none selected
        // eslint-disable-next-line no-unused-vars
        const { quality_rules: _qr, ...rest } = col;
        return rest;
      });
    } catch (e) {
      return null;
    }
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
      const builtSchema = buildSchemaWithRules(formData.schema);
      const payload = {
        ...formData,
        schema: builtSchema !== null ? builtSchema : (formData.schema ? JSON.parse(formData.schema) : null)
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
      const builtSchema = buildSchemaWithRules(formData.schema);
      const payload = {
        ...formData,
        schema: builtSchema !== null ? builtSchema : (formData.schema ? JSON.parse(formData.schema) : null)
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

    // Extract quality_rules from schema JSON (set by schema builder / previous save)
    const schemaJson = (() => {
      try {
        const raw = schema.schema;
        if (!raw) return [];
        return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      } catch (e) { return []; }
    })();
    const schemaQualityRules = {};
    schemaJson.forEach(col => {
      const colName = col.name || col.column_name;
      if (colName && col.quality_rules) schemaQualityRules[colName] = col.quality_rules;
    });

    // Load column list by merging schema-array columns with column_metadata.
    // The schema array is the source of truth for which columns exist; metadata
    // supplements with PII flags, descriptions, and quality_rules.
    const metadata = schema.column_metadata || {};

    // Collect all column names from the schema array first (preserves order)
    const schemaColNames = schemaJson.map(col => col.name || col.column_name).filter(Boolean);

    // Then add any names present only in metadata (legacy schemas)
    const metaOnlyNames = Object.keys(metadata).filter(n => !schemaColNames.includes(n));
    const allColNames = [...schemaColNames, ...metaOnlyNames];

    const columns = allColNames.map(name => {
      const schemaCol = schemaJson.find(c => (c.name || c.column_name) === name) || {};
      const meta = metadata[name] || {};
      return {
        name,
        contains_pii: meta.contains_pii || schemaCol.contains_pii || false,
        pii_type: meta.pii_type || schemaCol.pii_type || '',
        data_type: meta.data_type || schemaCol.data_type || schemaCol.type || '',
        description: meta.description || schemaCol.description || '',
        // quality_rules: prefer schema JSON (most recently saved) over metadata fallback
        quality_rules: schemaQualityRules[name] || meta.quality_rules || []
      };
    });
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
                        <span>Quality Rules</span>
                        <span>Action</span>
                      </div>
                      {columnList.map((col, idx) => (
                        <div key={`col-${col.name || col.column_name || idx}`} className="column-table-row">
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
                          <div className="column-rules-cell">
                            <div className="column-rules-tags">
                              {(col.quality_rules || []).map(r => (
                                <span key={r} className="column-rule-tag" title={r}>
                                  {SCHEMA_RULE_TYPES.find(rt => rt.value === r)?.label || r}
                                  <button type="button" onClick={() => toggleColumnRule(idx, r)} className="column-rule-tag-remove">×</button>
                                </span>
                              ))}
                            </div>
                            <select
                              className="column-rule-add-select"
                              value=""
                              onChange={(e) => { if (e.target.value) toggleColumnRule(idx, e.target.value); }}
                              title="Add quality rule"
                            >
                              <option value="">+ Add rule</option>
                              {SCHEMA_RULE_TYPES.filter(rt => !(col.quality_rules || []).includes(rt.value)).map(rt => (
                                <option key={rt.value} value={rt.value}>{rt.label}</option>
                              ))}
                            </select>
                          </div>
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
                                <span>Quality Rules</span>
                                <span>Action</span>
                              </div>
                              {columnList.map((col, idx) => (
                                <div key={`edit-col-${col.name || col.column_name || idx}`} className="column-table-row">
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
                                  <div className="column-rules-cell">
                                    <div className="column-rules-tags">
                                      {(col.quality_rules || []).map(r => (
                                        <span key={r} className="column-rule-tag" title={r}>
                                          {SCHEMA_RULE_TYPES.find(rt => rt.value === r)?.label || r}
                                          <button type="button" onClick={() => toggleColumnRule(idx, r)} className="column-rule-tag-remove">×</button>
                                        </span>
                                      ))}
                                    </div>
                                    <select
                                      className="column-rule-add-select"
                                      value=""
                                      onChange={(e) => { if (e.target.value) toggleColumnRule(idx, e.target.value); }}
                                      title="Add quality rule"
                                    >
                                      <option value="">+ Add rule</option>
                                      {SCHEMA_RULE_TYPES.filter(rt => !(col.quality_rules || []).includes(rt.value)).map(rt => (
                                        <option key={rt.value} value={rt.value}>{rt.label}</option>
                                      ))}
                                    </select>
                                  </div>
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
FileSchemaManager.propTypes = {
  agreementId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired
};
export default FileSchemaManager;
