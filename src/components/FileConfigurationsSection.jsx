import React, { useState } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiFileText } from 'react-icons/fi';
import './FileConfigurationsSection.css';

function FileConfigurationsSection({ fileConfigurations, onChange }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formData, setFormData] = useState({
    file_name_pattern_base: '',
    file_type: 'csv',
    file_description: '',
    schema: '',
    priority: 100
  });

  const FILE_TYPES = [
    { value: 'csv', label: 'CSV' },
    { value: 'xlsx', label: 'Excel (XLSX)' },
    { value: 'json', label: 'JSON' },
    { value: 'xml', label: 'XML' },
    { value: 'parquet', label: 'Parquet' }
  ];

  const getDerivedPattern = (base, type) => {
    if (!base || !type) return '';
    return `${base}*.${type}`;
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

  const handleAdd = () => {
    if (!formData.file_name_pattern_base.trim()) {
      alert('File name pattern is required');
      return;
    }

    if (formData.schema && !validateSchema(formData.schema)) {
      alert('Invalid JSON schema format');
      return;
    }

    const newConfig = {
      file_name_pattern_base: formData.file_name_pattern_base.trim(),
      file_type: formData.file_type,
      file_name_pattern: getDerivedPattern(formData.file_name_pattern_base.trim(), formData.file_type),
      file_description: formData.file_description.trim(),
      schema: formData.schema ? JSON.parse(formData.schema) : null,
      priority: formData.priority || 100,
      is_active: true
    };

    onChange([...fileConfigurations, newConfig]);
    
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      priority: 100
    });
    setShowAddForm(false);
  };

  const handleEdit = (index) => {
    const config = fileConfigurations[index];
    setFormData({
      file_name_pattern_base: config.file_name_pattern_base || '',
      file_type: config.file_type || 'csv',
      file_description: config.file_description || '',
      schema: config.schema ? JSON.stringify(config.schema, null, 2) : '',
      priority: config.priority ?? 100
    });
    setEditingIndex(index);
  };

  const handleUpdate = () => {
    if (!formData.file_name_pattern_base.trim()) {
      alert('File name pattern is required');
      return;
    }

    if (formData.schema && !validateSchema(formData.schema)) {
      alert('Invalid JSON schema format');
      return;
    }

    const updatedConfig = {
      file_name_pattern_base: formData.file_name_pattern_base.trim(),
      file_type: formData.file_type,
      file_name_pattern: getDerivedPattern(formData.file_name_pattern_base.trim(), formData.file_type),
      file_description: formData.file_description.trim(),
      schema: formData.schema ? JSON.parse(formData.schema) : null,
      priority: formData.priority || 100,
      is_active: true
    };

    const updated = [...fileConfigurations];
    updated[editingIndex] = updatedConfig;
    onChange(updated);
    
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      priority: 100
    });
    setEditingIndex(null);
  };

  const handleDelete = (index) => {
    if (!confirm('Are you sure you want to remove this file configuration?')) {
      return;
    }
    const updated = fileConfigurations.filter((_, i) => i !== index);
    onChange(updated);
  };

  const cancelForm = () => {
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      priority: 100
    });
    setShowAddForm(false);
    setEditingIndex(null);
  };

  return (
    <div className="file-configurations-section">
      <div className="section-header">
        <h3 className="section-title">File Configurations</h3>
        <button
          type="button"
          className="btn-add-file-config"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm || editingIndex !== null}
        >
          <FiPlus /> Add File
        </button>
      </div>
      
      <p className="section-description">
        Define multiple file patterns for this contract. Each file can have its own schema and validation rules.
      </p>

      {/* Add/Edit Form */}
      {(showAddForm || editingIndex !== null) && (
        <div className="file-config-form">
          <div className="form-header-inline">
            <h4>{editingIndex !== null ? 'Edit File Configuration' : 'Add File Configuration'}</h4>
            <button type="button" className="btn-close-inline" onClick={cancelForm}>
              <FiX />
            </button>
          </div>

          <div className="form-grid-inline">
            <div className="form-group">
              <label>File Name Pattern *</label>
              <input
                type="text"
                value={formData.file_name_pattern_base}
                onChange={(e) => setFormData({ ...formData, file_name_pattern_base: e.target.value })}
                placeholder="e.g., customers_orders"
              />
              <small>Base pattern without extension</small>
            </div>

            <div className="form-group">
              <label>File Type *</label>
              <select
                value={formData.file_type}
                onChange={(e) => setFormData({ ...formData, file_type: e.target.value })}
              >
                {FILE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group full-width">
              <label>Derived File Pattern</label>
              <div className="derived-pattern-display">
                <FiFileText />
                <code>{getDerivedPattern(formData.file_name_pattern_base, formData.file_type) || 'pattern*.type'}</code>
              </div>
              <small>This pattern will be used for file validation</small>
            </div>

            <div className="form-group full-width">
              <label>File Description</label>
              <input
                type="text"
                value={formData.file_description}
                onChange={(e) => setFormData({ ...formData, file_description: e.target.value })}
                placeholder="Brief description of this file"
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
              <small>Lower numbers match first (default: 100)</small>
            </div>

            <div className="form-group full-width">
              <label>Schema (JSON)</label>
              <textarea
                value={formData.schema}
                onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
                placeholder='{"fields": [{"name": "column_name", "type": "string"}]}'
                rows="4"
              />
              <small>Optional: Define expected file structure as JSON</small>
            </div>
          </div>

          <div className="form-actions-inline">
            <button type="button" className="btn-cancel-inline" onClick={cancelForm}>
              <FiX /> Cancel
            </button>
            <button
              type="button"
              className="btn-save-inline"
              onClick={editingIndex !== null ? handleUpdate : handleAdd}
            >
              <FiSave /> {editingIndex !== null ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* File Configurations List */}
      {fileConfigurations.length === 0 ? (
        <div className="empty-state-inline">
          <FiFileText className="empty-icon-inline" />
          <p>No file configurations yet</p>
          <small>Click "Add File" to define file patterns for this contract</small>
        </div>
      ) : (
        <div className="file-configs-list">
          {fileConfigurations
            .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
            .map((config, index) => (
              <div key={index} className={`file-config-item ${editingIndex === index ? 'editing' : ''}`}>
                <div className="config-main-info">
                  <div className="config-pattern">
                    <FiFileText className="pattern-icon-inline" />
                    <strong>{config.file_name_pattern}</strong>
                    <span className="priority-badge-inline">Priority: {config.priority ?? 100}</span>
                  </div>
                  {config.file_description && (
                    <div className="config-description">{config.file_description}</div>
                  )}
                  {config.schema && (
                    <div className="config-schema-preview">
                      <details>
                        <summary>View Schema</summary>
                        <pre>{JSON.stringify(config.schema, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                </div>
                <div className="config-actions">
                  <button
                    type="button"
                    className="btn-edit-config"
                    onClick={() => handleEdit(index)}
                    disabled={showAddForm || (editingIndex !== null && editingIndex !== index)}
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    type="button"
                    className="btn-delete-config"
                    onClick={() => handleDelete(index)}
                    disabled={showAddForm || editingIndex !== null}
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default FileConfigurationsSection;
