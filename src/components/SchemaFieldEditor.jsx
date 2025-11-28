import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiAlertCircle, FiInfo, FiFileText } from 'react-icons/fi';
import './SchemaFieldEditor.css';

const FIXED_WIDTH_FILE_TYPES = ['fixed_width', 'binary', 'dat'];
const ARCHIVE_FILE_TYPES = ['zip', '7z', 'tar', 'tar.gz', 'tar.bz2'];

function SchemaFieldEditor({ value, onChange, fileType, hasHeader, onHasHeaderChange, showHeaderToggle = true }) {
  const [fields, setFields] = useState([]);
  const [error, setError] = useState(null);

  const isFixedWidthType = FIXED_WIDTH_FILE_TYPES.includes(fileType);
  const isArchiveType = ARCHIVE_FILE_TYPES.includes(fileType);
  const showExtendedFields = isFixedWidthType || hasHeader === false;

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
        if (showExtendedFields) {
          if (field.width) cleanField.width = parseInt(field.width) || field.width;
          if (field.start_position !== '' && field.start_position !== undefined) {
            cleanField.start_position = parseInt(field.start_position) || 0;
          }
          if (field.precision) cleanField.precision = parseInt(field.precision) || field.precision;
          if (field.scale) cleanField.scale = parseInt(field.scale) || field.scale;
        }
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
      nullable: true
    };
    if (showExtendedFields) {
      newField.width = '';
      newField.start_position = '';
      newField.precision = '';
      newField.scale = '';
    }
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
            <button
              type="button"
              className={`toggle-switch ${hasHeader ? 'active' : ''} ${isFixedWidthType ? 'disabled' : ''}`}
              onClick={handleToggleHeader}
              disabled={isFixedWidthType}
            >
              <span className="toggle-slider"></span>
            </button>
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

      {showExtendedFields && (
        <div className="extended-fields-notice">
          <FiInfo />
          <span>
            {isFixedWidthType 
              ? 'Fixed-width file type detected. Define each field with width and start position.'
              : 'Headerless file mode. Specify width, start position, and optionally precision/scale for numeric fields.'}
          </span>
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
          {showExtendedFields && (
            <small>For {isFixedWidthType ? 'fixed-width files' : 'headerless files'}, define each field with width and position.</small>
          )}
        </div>
      ) : (
        <div className="fields-table">
          <table>
            <thead>
              <tr>
                <th>FIELD NAME</th>
                <th>TYPE</th>
                {showExtendedFields && <th>WIDTH</th>}
                {showExtendedFields && <th>START POS</th>}
                {showExtendedFields && <th>PRECISION</th>}
                {showExtendedFields && <th>SCALE</th>}
                <th>NULLABLE</th>
                <th>PII</th>
                <th>DESCRIPTION</th>
                <th></th>
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
                  {showExtendedFields && (
                    <td>
                      <input
                        type="number"
                        value={field.width || ''}
                        onChange={(e) => handleFieldChange(index, 'width', e.target.value)}
                        placeholder="0"
                        className="field-input field-input-small"
                        min="1"
                      />
                    </td>
                  )}
                  {showExtendedFields && (
                    <td>
                      <input
                        type="number"
                        value={field.start_position || ''}
                        onChange={(e) => handleFieldChange(index, 'start_position', e.target.value)}
                        placeholder="0"
                        className="field-input field-input-small"
                        min="0"
                      />
                    </td>
                  )}
                  {showExtendedFields && (
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
                  )}
                  {showExtendedFields && (
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
                  )}
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
      )}

      <small className="editor-hint">
        {showExtendedFields 
          ? 'Define field structure with position details. For numeric types, you can also specify precision and scale in the JSON.'
          : 'Define your expected file structure. Mark sensitive fields as PII for automatic data governance.'}
      </small>
    </div>
  );
}

export default SchemaFieldEditor;
