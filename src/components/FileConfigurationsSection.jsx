import React, { useState, useEffect, useRef } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiFileText, FiShield, FiCheckCircle, FiLock, FiEye, FiEyeOff, FiUpload, FiAlertCircle, FiPaperclip } from 'react-icons/fi';
import axios from 'axios';
import SchemaFieldEditor from './SchemaFieldEditor';
import './FileConfigurationsSection.css';
import PropTypes from 'prop-types';

function FileConfigurationsSection({ fileConfigurations, onChange }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [qualityRules, setQualityRules] = useState([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ show: false, index: null });
  const [showPassword, setShowPassword] = useState(false);
  const [headerSchemaFile, setHeaderSchemaFile] = useState(null);
  const [headerSchemaError, setHeaderSchemaError] = useState('');
  const headerSchemaInputRef = useRef(null);
  const [schemaUploadLoading, setSchemaUploadLoading] = useState({});
  const [schemaUploadError, setSchemaUploadError] = useState({});
  const schemaUploadRefs = useRef({});
  const [formData, setFormData] = useState({
    file_name_pattern_base: '',
    file_type: 'csv',
    file_description: '',
    schema: '',
    contains_pii: false,
    data_classification: '',
    quality_rule_ids: [],
    quality_rule_assignments: {},
    archive_password: '',
    has_header: true,
    header_definition: null
  });

  const GENERIC_RULE_TYPES = [
    'null_check', 'duplicate_check', 'email_validity', 'phone_validity',
    'column_completeness', 'date_format', 'timestamp_format',
    'uniqueness', 'isna_check', 'numeric_only_string', 'special_character_presence'
  ];

  const isGenericRule = (rule) => GENERIC_RULE_TYPES.includes(rule.rule_type);

  const getSchemaColumns = () => {
    if (!formData.schema || formData.schema.trim() === '') return [];
    try {
      const parsed = JSON.parse(formData.schema);
      if (Array.isArray(parsed)) {
        return parsed.map(field => ({
          name: field.name || '',
          type: field.type || 'string'
        })).filter(f => f.name);
      }
    } catch (e) {}
    return [];
  };

  const parseSchemaQualityRules = (schemaText, availableRules) => {
    if (!schemaText || !schemaText.trim() || !availableRules || availableRules.length === 0) {
      return { ruleIds: [], assignments: {} };
    }
    
    try {
      const parsed = JSON.parse(schemaText);
      if (!Array.isArray(parsed)) return { ruleIds: [], assignments: {} };
      
      const ruleIds = new Set();
      const assignments = {};
      
      parsed.forEach(field => {
        if (!field.name || !field.quality_rules || !Array.isArray(field.quality_rules)) return;
        
        field.quality_rules.forEach(ruleNameOrType => {
          const ruleNameLower = ruleNameOrType.toLowerCase();
          const ruleNameUnderscore = ruleNameLower.replace(/_/g, ' ');
          
          const matchedRule = availableRules.find(r => {
            if (r.rule_type === ruleNameOrType) return true;
            if (!r.rule_name) return false;
            const ruleName = r.rule_name.toLowerCase();
            return ruleName.replace(/\s+/g, '_') === ruleNameLower || ruleName === ruleNameUnderscore;
          });
          
          if (matchedRule) {
            ruleIds.add(matchedRule.id);
            if (!assignments[matchedRule.id]) {
              assignments[matchedRule.id] = [];
            }
            if (!assignments[matchedRule.id].includes(field.name)) {
              assignments[matchedRule.id].push(field.name);
            }
          }
        });
      });
      
      return { ruleIds: Array.from(ruleIds), assignments };
    } catch (e) {
      console.error('Error parsing schema quality rules:', e);
      return { ruleIds: [], assignments: {} };
    }
  };

  const FILE_TYPES = [
    { value: 'csv', label: 'CSV' },
    { value: 'xlsx', label: 'Excel (XLSX)' },
    { value: 'json', label: 'JSON' },
    { value: 'xml', label: 'XML' },
    { value: 'parquet', label: 'Parquet' },
    { value: 'dat', label: 'Fixed Width (.dat)' },
    { value: 'bin', label: 'Binary (.bin)' },
    { value: 'bdat', label: 'Fixed Width Binary (.bdat)' },
    // Legacy values - kept for backwards compatibility with existing data
    { value: 'fixed_width', label: 'Fixed Width (.dat)', legacy: true },
    { value: 'binary', label: 'Binary (.bin)', legacy: true },
    { value: 'sas7bdat', label: 'SAS Dataset' },
    { value: 'avro', label: 'Avro' },
    { value: 'zip', label: 'ZIP Archive' },
    { value: '7z', label: '7z Archive' },
    { value: 'tar', label: 'TAR Archive' },
    { value: 'tar.gz', label: 'TAR.GZ Archive' },
    { value: 'tar.bz2', label: 'TAR.BZ2 Archive' }
  ];
  
  // Map legacy values to preferred new values when creating new configs
  const LEGACY_TYPE_MAP = {
    'fixed_width': 'dat',
    'binary': 'bin'
  };

  const ARCHIVE_FILE_TYPES = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2'];
  // Include legacy values for backwards compatibility with existing data
  const FIXED_WIDTH_TYPES = ['dat', 'bin', 'bdat', 'fixed_width', 'binary'];
  
  const isArchiveType = (fileType) => ARCHIVE_FILE_TYPES.includes(fileType);
  const isFixedWidthType = (fileType) => FIXED_WIDTH_TYPES.includes(fileType);
  const requiresWidthInSchema = (fileType) => FIXED_WIDTH_TYPES.includes(fileType);

  const isSchemaRefToken = (schema) => {
    return schema && typeof schema === 'object' && schema._schemaRef === true && schema._pendingUpload === true;
  };

  const getSchemaRefInfo = (schema) => {
    if (!isSchemaRefToken(schema)) return null;
    return {
      type: schema._refType,
      filename: schema._refFilename || null
    };
  };

  const handleSchemaFileUpload = async (configIndex, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSchemaUploadLoading(prev => ({ ...prev, [configIndex]: true }));
    setSchemaUploadError(prev => ({ ...prev, [configIndex]: null }));

    try {
      const formData = new FormData();
      formData.append('schema', file);

      const response = await axios.post('/api/vendor-agreement-template/upload-schema', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        const updatedConfigs = [...fileConfigurations];
        updatedConfigs[configIndex] = {
          ...updatedConfigs[configIndex],
          schema: response.data.schema
        };
        onChange(updatedConfigs);
      } else {
        setSchemaUploadError(prev => ({ ...prev, [configIndex]: response.data.error || 'Upload failed' }));
      }
    } catch (error) {
      console.error('Schema upload error:', error);
      const errMsg = error.response?.data?.error || error.response?.data?.details || error.message;
      setSchemaUploadError(prev => ({ ...prev, [configIndex]: errMsg }));
    } finally {
      setSchemaUploadLoading(prev => ({ ...prev, [configIndex]: false }));
      if (schemaUploadRefs.current[configIndex]) {
        schemaUploadRefs.current[configIndex].value = '';
      }
      const updateKey = `update-${configIndex}`;
      if (schemaUploadRefs.current[updateKey]) {
        schemaUploadRefs.current[updateKey].value = '';
      }
    }
  };

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
    setFormData(prev => ({ ...prev, header_definition: null }));
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

  const [lastParsedSchema, setLastParsedSchema] = useState('');
  
  useEffect(() => {
    if (formData.schema && formData.schema !== lastParsedSchema && qualityRules.length > 0) {
      const { ruleIds, assignments } = parseSchemaQualityRules(formData.schema, qualityRules);
      
      if (ruleIds.length > 0) {
        const existingRuleIds = formData.quality_rule_ids || [];
        const existingAssignments = formData.quality_rule_assignments || {};
        
        const mergedRuleIds = [...new Set([...existingRuleIds, ...ruleIds])];
        const mergedAssignments = { ...existingAssignments };
        
        Object.entries(assignments).forEach(([ruleId, columns]) => {
          const existing = mergedAssignments[ruleId] || [];
          mergedAssignments[ruleId] = [...new Set([...existing, ...columns])];
        });
        
        setFormData(prev => ({
          ...prev,
          quality_rule_ids: mergedRuleIds,
          quality_rule_assignments: mergedAssignments
        }));
        setLastParsedSchema(formData.schema);
      }
    }
  }, [formData.schema, qualityRules]);

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
      is_active: true,
      contains_pii: formData.contains_pii,
      data_classification: formData.data_classification || null,
      quality_rule_ids: formData.quality_rule_ids || [],
      quality_rule_assignments: formData.quality_rule_assignments || {},
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
      contains_pii: false,
      data_classification: '',
      quality_rule_ids: [],
      quality_rule_assignments: {},
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
      contains_pii: config.contains_pii || false,
      data_classification: config.data_classification || '',
      quality_rule_ids: config.quality_rule_ids || [],
      quality_rule_assignments: config.quality_rule_assignments || {},
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

    // Debug logging for password handling
    console.log('=== FileConfigurationsSection handleUpdate ===');
    console.log('formData.file_type:', formData.file_type);
    console.log('isArchiveType:', isArchiveType(formData.file_type));
    console.log('formData.archive_password:', formData.archive_password ? formData.archive_password.substring(0, 3) + '***' : 'EMPTY');

    const updatedConfig = {
      ...fileConfigurations[editingIndex],
      file_name_pattern_base: formData.file_name_pattern_base.trim(),
      file_type: formData.file_type,
      file_name_pattern: getDerivedPattern(formData.file_name_pattern_base.trim(), formData.file_type),
      file_description: formData.file_description.trim(),
      schema: formData.schema ? JSON.parse(formData.schema) : null,
      is_active: true,
      contains_pii: formData.contains_pii,
      data_classification: formData.data_classification || null,
      quality_rule_ids: formData.quality_rule_ids || [],
      quality_rule_assignments: formData.quality_rule_assignments || {},
      archive_password: isArchiveType(formData.file_type) ? (formData.archive_password || '') : '',
      has_header: formData.has_header,
      header_definition: formData.header_definition
    };
    
    console.log('updatedConfig.archive_password:', updatedConfig.archive_password ? updatedConfig.archive_password.substring(0, 3) + '***' : 'EMPTY');

    const updated = [...fileConfigurations];
    updated[editingIndex] = updatedConfig;
    onChange(updated);
    
    setFormData({
      file_name_pattern_base: '',
      file_type: 'csv',
      file_description: '',
      schema: '',
      contains_pii: false,
      data_classification: '',
      quality_rule_ids: [],
      quality_rule_assignments: {},
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
      contains_pii: false,
      data_classification: '',
      quality_rule_ids: [],
      quality_rule_assignments: {},
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
    const isRemoving = currentRules.includes(ruleId);
    const newRules = isRemoving
      ? currentRules.filter(id => id !== ruleId)
      : [...currentRules, ruleId];
    
    const newAssignments = { ...formData.quality_rule_assignments };
    if (isRemoving) {
      delete newAssignments[ruleId];
    }
    
    setFormData({ ...formData, quality_rule_ids: newRules, quality_rule_assignments: newAssignments });
  };

  const handleColumnAssignment = (ruleId, columnName, isAdding) => {
    const currentAssignments = formData.quality_rule_assignments || {};
    const currentColumns = currentAssignments[ruleId] || [];
    
    const newColumns = isAdding
      ? [...currentColumns, columnName]
      : currentColumns.filter(c => c !== columnName);
    
    setFormData({
      ...formData,
      quality_rule_assignments: {
        ...currentAssignments,
        [ruleId]: newColumns
      }
    });
  };

  const toggleAllColumnsForRule = (ruleId) => {
    const schemaColumns = getSchemaColumns();
    const currentAssignments = formData.quality_rule_assignments || {};
    const currentColumns = currentAssignments[ruleId] || [];
    
    const allSelected = schemaColumns.length > 0 && schemaColumns.every(c => currentColumns.includes(c.name));
    
    setFormData({
      ...formData,
      quality_rule_assignments: {
        ...currentAssignments,
        [ruleId]: allSelected ? [] : schemaColumns.map(c => c.name)
      }
    });
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
              <label htmlFor="fileNamePatternBase">File Name Pattern * (Base pattern without extension)</label>
              <input
                id="fileNamePatternBase"
                type="text"
                value={formData.file_name_pattern_base}
                onChange={(e) => setFormData({ ...formData, file_name_pattern_base: e.target.value })}
                placeholder="e.g., customers_orders"
              />
            </div>

            <div className="form-group">
              <label htmlFor="fileType">File Type *</label>
              <select
                id="fileType"
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
                {FILE_TYPES
                  .filter(type => !type.legacy || type.value === formData.file_type)
                  .map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))
                }
              </select>
            </div>

            <div className="form-group">
              <label>Derived File Pattern</label>
              <div className="derived-pattern-display">
                <FiFileText />
                <code>{getDerivedPattern(formData.file_name_pattern_base, formData.file_type) || 'pattern*.type'}</code>
              </div>
            </div>

            {isArchiveType(formData.file_type) && (
              <div className="form-group">
                <label htmlFor="archivePassword">Archive Password (Optional)</label>
                {formData.has_archive_password && !formData.archive_password && (
                  <div className="password-configured-notice">
                    <FiLock size={14} />
                    <span>Password configured</span>
                  </div>
                )}
                <div className="password-input-wrapper">
                  <input
                    id="archivePassword"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.archive_password}
                    onChange={(e) => setFormData({ ...formData, archive_password: e.target.value })}
                    placeholder={formData.has_archive_password ? "New password" : "Password"}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="fileDescription">File Description</label>
              <input
                id="fileDescription"
                type="text"
                value={formData.file_description}
                onChange={(e) => setFormData({ ...formData, file_description: e.target.value })}
                placeholder="Brief description of this file"
              />
            </div>

            <div className="form-group">
              <label htmlFor="priority">Priority (Lower = higher priority)</label>
              <input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                min="0"
                step="1"
                placeholder="100"
              />
            </div>

            <div className="form-group full-width governance-section">
              <div className="governance-header">
                <FiShield className="governance-icon" />
                <h5>Data Governance</h5>
              </div>
              
              <div className="governance-controls">
                <div className="form-group">
                  <label htmlFor="containsPii" className="checkbox-label">
                    <input
                      id="containsPii"
                      type="checkbox"
                      checked={formData.contains_pii}
                      onChange={(e) => setFormData({ ...formData, contains_pii: e.target.checked })}
                    />
                    <span>Contains PII</span>
                  </label>
                  <small>Check if this file contains personally identifiable information</small>
                </div>

                <div className="form-group">
                  <label htmlFor="dataClassification">Data Classification</label>
                  <select
                    id="dataClassification"
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
                  <label htmlFor="qualityRules">Quality Rules</label>
                  <div id="qualityRules" className="quality-rules-selector">
                    {qualityRules.length === 0 ? (
                      <small className="no-rules-message">No quality rules available</small>
                    ) : (
                      <div className="quality-rules-list">
                        {qualityRules.map(rule => {
                          const isChecked = (formData.quality_rule_ids || []).includes(rule.id);
                          const isGeneric = isGenericRule(rule);
                          const schemaColumns = getSchemaColumns();
                          const assignedColumns = (formData.quality_rule_assignments || {})[rule.id] || [];
                          
                          return (
                            <div key={rule.id} className={`quality-rule-item-container ${isChecked ? 'checked' : ''}`}>
                              <label className="quality-rule-item">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleQualityRuleToggle(rule.id)}
                                />
                                <span className="rule-name">{rule.rule_name}</span>
                                {rule.severity && (
                                  <span className={`severity-badge severity-${rule.severity.toLowerCase()}`}>
                                    {rule.severity}
                                  </span>
                                )}
                              </label>
                              
                              {isChecked && isGeneric && schemaColumns.length > 0 && (
                                <div className="column-assignment-section">
                                  <select
                                    multiple
                                    className="column-multiselect"
                                    value={assignedColumns}
                                    onChange={(e) => {
                                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                                      setFormData(prev => ({
                                        ...prev,
                                        quality_rule_assignments: {
                                          ...prev.quality_rule_assignments,
                                          [rule.id]: selected
                                        }
                                      }));
                                    }}
                                  >
                                    {schemaColumns.map(col => (
                                      <option key={col.name} value={col.name}>
                                        {col.name} ({col.type})
                                      </option>
                                    ))}
                                  </select>
                                  <small className="multiselect-hint">Hold Ctrl/Cmd to select multiple columns</small>
                                </div>
                              )}
                              
                              {isChecked && isGeneric && schemaColumns.length === 0 && (
                                <div className="column-assignment-section">
                                  <small className="no-schema-warning">Define schema fields first to assign columns</small>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <small>Select quality rules to apply to this file. Generic rules can be assigned to specific columns.</small>
                </div>
              </div>
            </div>

            <div className="form-group full-width">
              <SchemaFieldEditor
                value={formData.schema}
                onChange={(value) => setFormData(prev => ({ ...prev, schema: value }))}
                fileType={formData.file_type}
                hasHeader={formData.has_header}
                onHasHeaderChange={(newValue) => {
                  setFormData(prev => ({ 
                    ...prev, 
                    has_header: newValue,
                    header_definition: newValue ? null : prev.header_definition
                  }));
                  if (newValue) {
                    setHeaderSchemaFile(null);
                    setHeaderSchemaError('');
                    if (headerSchemaInputRef.current) {
                      headerSchemaInputRef.current.value = '';
                    }
                  }
                }}
                showHeaderToggle={!isArchiveType(formData.file_type)}
                qualityRuleAssignments={formData.quality_rule_assignments || {}}
                qualityRules={qualityRules}
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
              <div key={`config-${config.id || config.pattern || index}`} className={`file-config-item ${editingIndex === index ? 'editing' : ''}`}>
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
                      {isSchemaRefToken(config.schema) ? (
                        <div className="schema-attachment-required">
                          <div className="schema-ref-notice">
                            <FiAlertCircle className="warning-icon" />
                            <span>
                              {getSchemaRefInfo(config.schema)?.filename 
                                ? `Schema file required: ${getSchemaRefInfo(config.schema).filename}`
                                : 'Schema attachment required'}
                            </span>
                          </div>
                          <div className="schema-upload-controls">
                            <input
                              type="file"
                              accept=".json"
                              ref={el => schemaUploadRefs.current[index] = el}
                              onChange={(e) => handleSchemaFileUpload(index, e)}
                              style={{ display: 'none' }}
                              id={`schema-upload-${index}`}
                            />
                            <button
                              type="button"
                              className="btn-attach-schema"
                              onClick={() => schemaUploadRefs.current[index]?.click()}
                              disabled={schemaUploadLoading[index]}
                            >
                              {schemaUploadLoading[index] ? (
                                <>Loading...</>
                              ) : (
                                <><FiPaperclip /> Attach Schema JSON</>
                              )}
                            </button>
                          </div>
                          {schemaUploadError[index] && (
                            <div className="schema-upload-error">
                              <FiAlertCircle /> {schemaUploadError[index]}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="schema-view-row">
                          <details>
                            <summary>View Schema ({Array.isArray(config.schema) ? config.schema.length : 0} fields)</summary>
                            <pre>{JSON.stringify(config.schema, null, 2)}</pre>
                          </details>
                          <div className="schema-update-controls">
                            <input
                              type="file"
                              accept=".json"
                              ref={el => schemaUploadRefs.current[`update-${index}`] = el}
                              onChange={(e) => handleSchemaFileUpload(index, e)}
                              style={{ display: 'none' }}
                              id={`schema-update-${index}`}
                            />
                            <button
                              type="button"
                              className="btn-upload-schema"
                              onClick={() => schemaUploadRefs.current[`update-${index}`]?.click()}
                              disabled={schemaUploadLoading[index]}
                              title="Upload new schema"
                            >
                              {schemaUploadLoading[index] ? (
                                <>Uploading...</>
                              ) : (
                                <><FiUpload /> Upload Schema</>
                              )}
                            </button>
                          </div>
                          {schemaUploadError[index] && (
                            <div className="schema-upload-error">
                              <FiAlertCircle /> {schemaUploadError[index]}
                            </div>
                          )}
                        </div>
                      )}
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
FileConfigurationsSection.propTypes = {
  fileConfigurations: PropTypes.arrayOf(
    PropTypes.shape({
      file_name_pattern: PropTypes.string,
      file_name_pattern_base: PropTypes.string,
      file_type: PropTypes.string,
      file_description: PropTypes.string,
      schema: PropTypes.oneOfType([
        PropTypes.array,
        PropTypes.object,
        PropTypes.string
      ]),
      is_active: PropTypes.bool,
      contains_pii: PropTypes.bool,
      data_classification: PropTypes.string,
      quality_rule_ids: PropTypes.arrayOf(PropTypes.number),
      quality_rule_assignments: PropTypes.object,
      archive_password: PropTypes.string,
      has_archive_password: PropTypes.bool,
      has_header: PropTypes.bool,
      header_definition: PropTypes.array,
      priority: PropTypes.number
    })
  ).isRequired,
  onChange: PropTypes.func.isRequired
};
export default FileConfigurationsSection;
