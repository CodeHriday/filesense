import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiAlertCircle, FiInfo, FiFileText, FiCheckCircle } from 'react-icons/fi';
import './SchemaFieldEditor.css';

const FIXED_WIDTH_FILE_TYPES = ['fixed_width', 'binary', 'dat'];
const ARCHIVE_FILE_TYPES = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2'];

function SchemaFieldEditor({ value, onChange, fileType, hasHeader, onHasHeaderChange, showHeaderToggle = true, qualityRuleAssignments = {}, qualityRules = [] }) {
  const [fields, setFields] = useState([]);
  const [error, setError] = useState(null);

  const isFixedWidthType = FIXED_WIDTH_FILE_TYPES.includes(fileType);
  const isArchiveType = ARCHIVE_FILE_TYPES.includes(fileType);

  useEffect(() => {
    if (!value || value.trim() === '') {
      setFields([]);
      setError(null);
      return;
    }

    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        setFields(parsed.map(field => ({
          name: field.name || '',
          type: field.type || 'string',
          description: field.description || '',
          pii: field.pii || false,
          width: field.width || '',
          start_position: field.start_position || '',
          precision: field.precision || '',
          scale: field.scale || '',
          nullable: field.nullable !== undefined ? field.nullable : true
        })));
        setError(null);
      } else {
        setError('Schema must be an array of field objects');
      }
    } catch (e) {
      setError('Invalid JSON format');
    }
  }, [value]);

  const updateParent = (newFields) => {
    if (newFields.length === 0) {
      onChange('');
    } else {
      const cleanedFields = newFields.map(field => {
        const cleanField = {
          name: field.name,
          type: field.type,
          description: field.description,
          pii: field.pii,
          nullable: field.nullable
        };
        if (field.width) cleanField.width = parseInt(field.width) || field.width;
        if (field.start_position !== '' && field.start_position !== undefined) {
          cleanField.start_position = parseInt(field.start_position) || 0;
        }
        if (field.precision) cleanField.precision = parseInt(field.precision) || field.precision;
        if (field.scale) cleanField.scale = parseInt(field.scale) || field.scale;
        return cleanField;
      });
      onChange(JSON.stringify(cleanedFields, null, 2));
    }
  };

  const handleAddField = () => {
    const newField = { 
      name: '', 
      type: 'string', 
      description: '', 
      pii: false,
      nullable: true,
      width: '',
      start_position: '',
      precision: '',
      scale: ''
    };
    const newFields = [...fields, newField];
    setFields(newFields);
    updateParent(newFields);
  };

  const handleRemoveField = (index) => {
    const newFields = fields.filter((_, i) => i !== index);
    setFields(newFields);
    updateParent(newFields);
  };

  const handleFieldChange = (index, property, value) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [property]: value };
    setFields(newFields);
    updateParent(newFields);
  };

  const FIELD_TYPES = [
    'string',
    'integer',
    'float',
    'boolean',
    'date',
    'timestamp',
    'json'
  ];

  const RULE_TYPE_LABELS = {
    'null_check': 'Null',
    'duplicate_check': 'Duplicate',
    'email_validity': 'Email',
    'phone_validity': 'Phone',
    'column_completeness': 'Completeness',
    'date_format': 'Date',
    'timestamp_format': 'Timestamp',
    'validity_check': 'Validity',
    'length_check': 'Length',
    'range_check': 'Range',
    'uniqueness': 'Unique',
    'isna_check': 'NA Check',
    'special_character_presence': 'Special Chars'
  };

  const getRuleDisplayLabel = (rule) => {
    if (rule.rule_type && RULE_TYPE_LABELS[rule.rule_type]) {
      return RULE_TYPE_LABELS[rule.rule_type];
    }
    return rule.rule_name.split(' ')[0];
  };

  const getFieldQualityRules = (fieldName) => {
    const assignedRules = [];
    for (const [ruleId, columns] of Object.entries(qualityRuleAssignments)) {
      if (columns && columns.includes(fieldName)) {
        const rule = qualityRules.find(r => r.id === parseInt(ruleId));
        if (rule) {
          assignedRules.push(rule);
        }
      }
    }
    return assignedRules;
  };

  const handleToggleHeader = () => {
    if (isFixedWidthType || !onHasHeaderChange) return;
    onHasHeaderChange(!hasHeader);
  };

  return (
    <div className="schema-field-editor">
      <div className="editor-header">
        <div className="editor-title-row">
          <FiFileText className="editor-icon" />
          <label>Schema Fields</label>
        </div>
        <button
          type="button"
          className="btn-add-field"
          onClick={handleAddField}
        >
          <FiPlus /> Add Field
        </button>
      </div>

      {/* Header Toggle - integrated into Schema Fields section */}
      {showHeaderToggle && !isArchiveType && (
        <div className="header-toggle-row">
          <div className="header-toggle-content">
            <span className="header-toggle-label">File Has Header Row</span>
            <div 
              className={`toggle-switch ${hasHeader ? 'on' : 'off'} ${isFixedWidthType ? 'disabled' : ''}`}
              onClick={isFixedWidthType ? undefined : handleToggleHeader}
              role="button"
              tabIndex={isFixedWidthType ? -1 : 0}
              onKeyDown={(e) => {
                if (!isFixedWidthType && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleToggleHeader();
                }
              }}
            >
              <span className="toggle-slider"></span>
              <span className="toggle-knob"></span>
            </div>
          </div>
          <small className="header-toggle-help">
            {isFixedWidthType 
              ? 'Fixed-width/binary files require explicit field definitions with width and position'
              : hasHeader 
                ? 'File includes a header row with column names'
                : 'No header row - define fields with width and start position below'}
          </small>
        </div>
      )}


      {error && (
        <div className="schema-error">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="empty-schema">
          <p>No fields defined. Click "Add Field" to start building your schema.</p>
        </div>
      ) : (
        <div className="fields-table-container">
          <div className="fields-table">
            <table>
              <thead>
                <tr>
                  <th className="th-field-name">Field Name</th>
                  <th className="th-type">Type</th>
                  <th className="th-width">Width</th>
                  <th className="th-start-pos">Start Pos</th>
                  <th className="th-precision">Precision</th>
                  <th className="th-scale">Scale</th>
                  <th className="th-nullable">Nullable</th>
                  <th className="th-pii">PII</th>
                  <th className="th-description">Description</th>
                  <th className="th-quality-rules">Quality Rules</th>
                  <th className="th-actions"></th>
                </tr>
              </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => handleFieldChange(index, 'name', e.target.value)}
                      placeholder="field_name"
                      className="field-input"
                    />
                  </td>
                  <td>
                    <select
                      value={field.type}
                      onChange={(e) => handleFieldChange(index, 'type', e.target.value)}
                      className="field-select"
                    >
                      {FIELD_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={field.width || ''}
                      onChange={(e) => handleFieldChange(index, 'width', e.target.value)}
                      placeholder="-"
                      className="field-input field-input-small"
                      min="1"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={field.start_position || ''}
                      onChange={(e) => handleFieldChange(index, 'start_position', e.target.value)}
                      placeholder="-"
                      className="field-input field-input-small"
                      min="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={field.precision || ''}
                      onChange={(e) => handleFieldChange(index, 'precision', e.target.value)}
                      placeholder="-"
                      className="field-input field-input-small"
                      min="1"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={field.scale || ''}
                      onChange={(e) => handleFieldChange(index, 'scale', e.target.value)}
                      placeholder="-"
                      className="field-input field-input-small"
                      min="0"
                    />
                  </td>
                  <td className="nullable-cell">
                    <label className="nullable-checkbox">
                      <input
                        type="checkbox"
                        checked={field.nullable !== false}
                        onChange={(e) => handleFieldChange(index, 'nullable', e.target.checked)}
                      />
                      <span>{field.nullable !== false ? 'Yes' : 'No'}</span>
                    </label>
                  </td>
                  <td className="pii-cell">
                    <label className="pii-checkbox">
                      <input
                        type="checkbox"
                        checked={field.pii}
                        onChange={(e) => handleFieldChange(index, 'pii', e.target.checked)}
                      />
                      <span className={field.pii ? 'pii-active' : ''}>
                        {field.pii ? 'Yes' : 'No'}
                      </span>
                    </label>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={field.description}
                      onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="field-input"
                    />
                  </td>
                  <td className="quality-rules-cell">
                    {(() => {
                      const assignedRules = getFieldQualityRules(field.name);
                      if (assignedRules.length === 0) {
                        return <span className="no-rules">-</span>;
                      }
                      return (
                        <div className="field-quality-rules">
                          {assignedRules.map(rule => (
                            <span key={rule.id} className={`rule-tag severity-${(rule.severity || 'medium').toLowerCase()}`} title={rule.rule_name}>
                              {getRuleDisplayLabel(rule)}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="btn-remove-field"
                      onClick={() => handleRemoveField(index)}
                      title="Remove field"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <small className="editor-hint">
        Define your expected file structure. Width is used for fixed-width/delimited files. Mark sensitive fields as PII for automatic data governance.
      </small>
    </div>
  );
}

export default SchemaFieldEditor;
