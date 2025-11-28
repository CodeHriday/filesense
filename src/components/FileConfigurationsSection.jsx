import React, { useState, useEffect, useRef } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiFileText, FiShield, FiCheckCircle, FiLock, FiEye, FiEyeOff, FiUpload, FiAlertCircle } from 'react-icons/fi';
import axios from 'axios';
import SchemaFieldEditor from './SchemaFieldEditor';
import './FileConfigurationsSection.css';

function FileConfigurationsSection({ fileConfigurations, onChange }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [qualityRules, setQualityRules] = useState([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ show: false, index: null });
  const [showPassword, setShowPassword] = useState(false);
  const [headerSchemaFile, setHeaderSchemaFile] = useState(null);
  const [headerSchemaError, setHeaderSchemaError] = useState('');
  const headerSchemaInputRef = useRef(null);
  const [formData, setFormData] = useState({
    file_name_pattern_base: '',
    file_type: 'csv',
    file_description: '',
    schema: '',
    priority: 100,
    contains_pii: false,
    data_classification: '',
    quality_rule_ids: [],
    archive_password: '',
    has_header: true,
    header_definition: null
  });

  const FILE_TYPES = [
    { value: 'csv', label: 'CSV' },
    { value: 'xlsx', label: 'Excel (XLSX)' },
    { value: 'json', label: 'JSON' },
    { value: 'xml', label: 'XML' },
    { value: 'parquet', label: 'Parquet' },
    { value: 'fixed_width', label: 'Fixed Width' },
    { value: 'binary', label: 'Binary' },
    { value: 'dat', label: 'DAT File' },
    { value: 'sas7bdat', label: 'SAS Dataset' },
    { value: 'avro', label: 'Avro' },
    { value: 'zip', label: 'ZIP Archive' },
    { value: '7z', label: '7z Archive' },
    { value: 'tar', label: 'TAR Archive' },
    { value: 'tar.gz', label: 'TAR.GZ Archive' },
    { value: 'tar.bz2', label: 'TAR.BZ2 Archive' }
  ];

  const ARCHIVE_FILE_TYPES = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2'];
  const FIXED_WIDTH_TYPES = ['fixed_width', 'binary', 'dat'];
  
  const isArchiveType = (fileType) => ARCHIVE_FILE_TYPES.includes(fileType);
  const isFixedWidthType = (fileType) => FIXED_WIDTH_TYPES.includes(fileType);
  const requiresWidthInSchema = (fileType) => FIXED_WIDTH_TYPES.includes(fileType);

  const parseHeaderSchemaFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const fileName = file.name.toLowerCase();
          let fields = [];

          if (fileName.endsWith('.json')) {
            const parsed = JSON.parse(content);
            fields = Array.isArray(parsed) ? parsed : (parsed.fields || parsed.columns || []);
          } else if (fileName.endsWith('.csv')) {
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
              reject(new Error('CSV must have a header row and at least one data row'));
              return;
            }
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
              const field = {};
              headers.forEach((header, idx) => {
                const value = values[idx] || '';
                switch (header) {
                  case 'field_name':
                  case 'name':
                  case 'column_name':
                    field.name = value;
                    break;
                  case 'data_type':
                  case 'type':
                    field.type = value.toLowerCase();
                    break;
                  case 'width':
                  case 'length':
                    field.width = parseInt(value) || null;
                    break;
                  case 'start_position':
                  case 'start':
                    field.start_position = parseInt(value) || null;
                    break;
                  case 'precision':
                    field.precision = parseInt(value) || null;
                    break;
                  case 'scale':
                    field.scale = parseInt(value) || null;
                    break;
                  case 'nullable':
                  case 'null':
                  case 'allow_null':
                    field.nullable = ['true', 'yes', '1', 'y'].includes(value.toLowerCase());
                    break;
                  case 'description':
                    field.description = value;
                    break;
                  case 'pii':
                    field.pii = ['true', 'yes', '1', 'y'].includes(value.toLowerCase());
                    break;
                  default:
                    break;
                }
              });
              if (field.name) {
                fields.push(field);
              }
            }
          } else {
            reject(new Error('Unsupported file format. Please use CSV or JSON.'));
            return;
          }

          if (fields.length === 0) {
            reject(new Error('No valid field definitions found in the file'));
            return;
          }

          const validatedFields = fields.map((f, idx) => ({
            name: f.name || `field_${idx + 1}`,
            type: f.type || 'string',
            width: f.width || null,
            start_position: f.start_position || null,
            precision: f.precision || null,
            scale: f.scale || null,
            nullable: f.nullable !== undefined ? f.nullable : true,
            description: f.description || '',
            pii: f.pii || false
          }));

          resolve(validatedFields);
        } catch (err) {
          reject(new Error(`Failed to parse file: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleHeaderSchemaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setHeaderSchemaError('');
    setHeaderSchemaFile(file);

    try {
      const fields = await parseHeaderSchemaFile(file);
      const fileType = formData.file_type;
      
      if (requiresWidthInSchema(fileType)) {
        const missingWidth = fields.filter(f => !f.width && f.width !== 0);
        if (missingWidth.length > 0) {
          setHeaderSchemaError(`Warning: ${missingWidth.length} field(s) missing width. Width is required for ${fileType} files.`);
        }
      }

      setFormData({ ...formData, header_definition: fields });
    } catch (err) {
      setHeaderSchemaError(err.message);
      setHeaderSchemaFile(null);
    }
  };

  const clearHeaderSchema = () => {
    setHeaderSchemaFile(null);
    setHeaderSchemaError('');
    setFormData({ ...formData, header_definition: null });
    if (headerSchemaInputRef.current) {
      headerSchemaInputRef.current.value = '';
    }
  };

  const DATA_CLASSIFICATIONS = [
    { value: '', label: 'Select classification' },
    { value: 'Public', label: 'Public' },
    { value: 'Internal', label: 'Internal' },
    { value: 'Confidential', label: 'Confidential' },
    { value: 'Highly Confidential', label: 'Highly Confidential' }
  ];

  useEffect(() => {
    fetchQualityRules();
  }, []);

  const fetchQualityRules = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/quality-rules?limit=1000', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQualityRules(response.data.rules || []);
    } catch (error) {
      console.error('Error fetching quality rules:', error);
    }
  };

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
      is_active: true,
      contains_pii: formData.contains_pii,
      data_classification: formData.data_classification || null,
      quality_rule_ids: formData.quality_rule_ids || [],
      archive_password: isArchiveType(formData.file_type) ? (formData.archive_password || '') : '',
      has_header: formData.has_header,
      header_definition: formData.header_definition
    };

    onChange([...fileConfigurations, newConfig]);
    
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      priority: 100,
      contains_pii: false,
      data_classification: '',
      quality_rule_ids: [],
      archive_password: '',
      has_header: true,
      header_definition: null
    });
    setShowPassword(false);
    setHeaderSchemaFile(null);
    setHeaderSchemaError('');
    setShowAddForm(false);
  };

  const handleEdit = (index) => {
    const config = fileConfigurations[index];
    setFormData({
      file_name_pattern_base: config.file_name_pattern_base || '',
      file_type: config.file_type || 'csv',
      file_description: config.file_description || '',
      schema: config.schema ? JSON.stringify(config.schema, null, 2) : '',
      priority: config.priority ?? 100,
      contains_pii: config.contains_pii || false,
      data_classification: config.data_classification || '',
      quality_rule_ids: config.quality_rule_ids || [],
      archive_password: config.archive_password || '',
      has_archive_password: config.has_archive_password || false,
      has_header: config.has_header !== undefined ? config.has_header : true,
      header_definition: config.header_definition || null
    });
    setShowPassword(false);
    setHeaderSchemaFile(null);
    setHeaderSchemaError('');
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
      ...fileConfigurations[editingIndex],
      file_name_pattern_base: formData.file_name_pattern_base.trim(),
      file_type: formData.file_type,
      file_name_pattern: getDerivedPattern(formData.file_name_pattern_base.trim(), formData.file_type),
      file_description: formData.file_description.trim(),
      schema: formData.schema ? JSON.parse(formData.schema) : null,
      priority: formData.priority || 100,
      is_active: true,
      contains_pii: formData.contains_pii,
      data_classification: formData.data_classification || null,
      quality_rule_ids: formData.quality_rule_ids || [],
      archive_password: isArchiveType(formData.file_type) ? (formData.archive_password || '') : '',
      has_header: formData.has_header,
      header_definition: formData.header_definition
    };

    const updated = [...fileConfigurations];
    updated[editingIndex] = updatedConfig;
    onChange(updated);
    
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      priority: 100,
      contains_pii: false,
      data_classification: '',
      quality_rule_ids: [],
      archive_password: '',
      has_header: true,
      header_definition: null
    });
    setShowPassword(false);
    setHeaderSchemaFile(null);
    setHeaderSchemaError('');
    setEditingIndex(null);
  };

  const handleDelete = (index) => {
    setDeleteConfirmation({ show: true, index });
  };

  const confirmDelete = () => {
    if (deleteConfirmation.index !== null) {
      const updated = fileConfigurations.filter((_, i) => i !== deleteConfirmation.index);
      onChange(updated);
    }
    setDeleteConfirmation({ show: false, index: null });
  };

  const cancelDelete = () => {
    setDeleteConfirmation({ show: false, index: null });
  };

  const cancelForm = () => {
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      priority: 100,
      contains_pii: false,
      data_classification: '',
      quality_rule_ids: [],
      archive_password: '',
      has_header: true,
      header_definition: null
    });
    setShowPassword(false);
    setHeaderSchemaFile(null);
    setHeaderSchemaError('');
    setShowAddForm(false);
    setEditingIndex(null);
  };

  const handleQualityRuleToggle = (ruleId) => {
    const currentRules = formData.quality_rule_ids || [];
    const newRules = currentRules.includes(ruleId)
      ? currentRules.filter(id => id !== ruleId)
      : [...currentRules, ruleId];
    setFormData({ ...formData, quality_rule_ids: newRules });
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
                onChange={(e) => {
                  const newType = e.target.value;
                  const updates = { file_type: newType };
                  if (!isArchiveType(newType)) {
                    updates.archive_password = '';
                  }
                  if (isFixedWidthType(newType) && formData.has_header) {
                    updates.has_header = false;
                  }
                  setFormData({ ...formData, ...updates });
                }}
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

            {isArchiveType(formData.file_type) && (
              <div className="form-group">
                <label>Archive Password (Optional)</label>
                {formData.has_archive_password && !formData.archive_password && (
                  <div className="password-configured-notice">
                    <FiLock size={14} />
                    <span>Password configured - enter new password to update</span>
                  </div>
                )}
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.archive_password}
                    onChange={(e) => setFormData({ ...formData, archive_password: e.target.value })}
                    placeholder={formData.has_archive_password ? "Enter new password to update" : "Password for encrypted archive files"}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                  </button>
                </div>
                <small>For password-protected ZIP, 7z, or TAR archives</small>
              </div>
            )}

            <div className="form-group full-width governance-section">
              <div className="governance-header">
                <FiShield className="governance-icon" />
                <h5>Data Governance</h5>
              </div>
              
              <div className="governance-controls">
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.contains_pii}
                      onChange={(e) => setFormData({ ...formData, contains_pii: e.target.checked })}
                    />
                    <span>Contains PII</span>
                  </label>
                  <small>Check if this file contains personally identifiable information</small>
                </div>

                <div className="form-group">
                  <label>Data Classification</label>
                  <select
                    value={formData.data_classification}
                    onChange={(e) => setFormData({ ...formData, data_classification: e.target.value })}
                  >
                    {DATA_CLASSIFICATIONS.map(cls => (
                      <option key={cls.value} value={cls.value}>{cls.label}</option>
                    ))}
                  </select>
                  <small>Classification level for this file</small>
                </div>

                <div className="form-group full-width">
                  <label>Quality Rules</label>
                  <div className="quality-rules-selector">
                    {qualityRules.length === 0 ? (
                      <small className="no-rules-message">No quality rules available</small>
                    ) : (
                      <div className="quality-rules-list">
                        {qualityRules.map(rule => (
                          <label key={rule.id} className="quality-rule-item">
                            <input
                              type="checkbox"
                              checked={(formData.quality_rule_ids || []).includes(rule.id)}
                              onChange={() => handleQualityRuleToggle(rule.id)}
                            />
                            <span className="rule-name">{rule.rule_name}</span>
                            {rule.severity && (
                              <span className={`severity-badge severity-${rule.severity.toLowerCase()}`}>
                                {rule.severity}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <small>Select quality rules to apply to this file</small>
                </div>
              </div>
            </div>

            <div className="form-group full-width">
              <SchemaFieldEditor
                value={formData.schema}
                onChange={(value) => setFormData({ ...formData, schema: value })}
                fileType={formData.file_type}
                hasHeader={formData.has_header}
                onHasHeaderChange={(newValue) => {
                  setFormData({ 
                    ...formData, 
                    has_header: newValue,
                    header_definition: newValue ? null : formData.header_definition
                  });
                  if (newValue) {
                    clearHeaderSchema();
                  }
                }}
                showHeaderToggle={!isArchiveType(formData.file_type)}
              />
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
                  
                  {/* Governance Badges */}
                  <div className="governance-badges">
                    {(config.archive_password || config.has_archive_password) && (
                      <span className="governance-badge password-badge">
                        <FiLock /> Password Protected
                      </span>
                    )}
                    {config.has_header === false && (
                      <span className="governance-badge no-header-badge">
                        <FiFileText /> No Header
                      </span>
                    )}
                    {config.header_definition && config.header_definition.length > 0 && (
                      <span className="governance-badge header-badge">
                        <FiFileText /> {config.header_definition.length} Fields Defined
                      </span>
                    )}
                    {config.contains_pii && (
                      <span className="governance-badge pii-badge">
                        <FiShield /> Contains PII
                      </span>
                    )}
                    {config.data_classification && (
                      <span className={`governance-badge classification-badge classification-${config.data_classification.toLowerCase().replace(/\s+/g, '-')}`}>
                        {config.data_classification}
                      </span>
                    )}
                    {config.quality_rule_ids && config.quality_rule_ids.length > 0 && (
                      <span className="governance-badge quality-badge">
                        <FiCheckCircle /> {config.quality_rule_ids.length} Quality Rule{config.quality_rule_ids.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content delete-confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Deletion</h3>
              <button className="modal-close-btn" onClick={cancelDelete}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to remove this file configuration?</p>
              {deleteConfirmation.index !== null && fileConfigurations[deleteConfirmation.index] && (
                <div className="deletion-target-info">
                  <strong>Pattern:</strong> {fileConfigurations[deleteConfirmation.index].file_name_pattern}
                </div>
              )}
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="btn-danger" onClick={confirmDelete}>
                <FiTrash2 /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileConfigurationsSection;
