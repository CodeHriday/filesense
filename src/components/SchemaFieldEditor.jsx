import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiAlertCircle } from 'react-icons/fi';
import './SchemaFieldEditor.css';

function SchemaFieldEditor({ value, onChange }) {
  const [fields, setFields] = useState([]);
  const [error, setError] = useState(null);

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
          pii: field.pii || false
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
      onChange(JSON.stringify(newFields, null, 2));
    }
  };

  const handleAddField = () => {
    const newFields = [...fields, { name: '', type: 'string', description: '', pii: false }];
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

  return (
    <div className="schema-field-editor">
      <div className="editor-header">
        <label>Schema Fields</label>
        <button
          type="button"
          className="btn-add-field"
          onClick={handleAddField}
        >
          <FiPlus /> Add Field
        </button>
      </div>

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
        <div className="fields-table">
          <table>
            <thead>
              <tr>
                <th>Field Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>PII</th>
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
                  <td>
                    <input
                      type="text"
                      value={field.description}
                      onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                      placeholder="Field description"
                      className="field-input"
                    />
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
        Define your expected file structure. Mark sensitive fields as PII for automatic data governance.
      </small>
    </div>
  );
}

export default SchemaFieldEditor;
