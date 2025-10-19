import React, { useState, useEffect } from 'react';
import { FiCheck, FiArrowRight, FiTrash2, FiEdit2, FiX, FiPlus } from 'react-icons/fi';
import './TableBasedMapper.css';

const TRANSFORMATION_OPTIONS = [
  { value: 'none', label: 'None (Direct Copy)', group: 'Basic', params: [] },
  { value: 'null-to-value', label: 'Replace Null', group: 'Null Handling', params: [{ name: 'value', type: 'text', placeholder: 'Replacement value' }] },
  { value: 'coalesce', label: 'Coalesce', group: 'Null Handling', params: [{ name: 'column2', type: 'text', placeholder: 'Second column' }] },
  { value: 'UPPER', label: 'UPPERCASE', group: 'String', params: [] },
  { value: 'LOWER', label: 'lowercase', group: 'String', params: [] },
  { value: 'TRIM', label: 'Trim Whitespace', group: 'String', params: [] },
  { value: 'SUBSTRING', label: 'Substring', group: 'String', params: [
    { name: 'start', type: 'number', placeholder: 'Start position' },
    { name: 'length', type: 'number', placeholder: 'Length' }
  ]},
  { value: 'REPLACE', label: 'Find & Replace', group: 'String', params: [
    { name: 'find', type: 'text', placeholder: 'Find text' },
    { name: 'replace', type: 'text', placeholder: 'Replace with' }
  ]},
  { value: 'concat', label: 'Concatenate', group: 'String', params: [
    { name: 'column2', type: 'text', placeholder: 'Second column' },
    { name: 'separator', type: 'text', placeholder: 'Separator (optional)' }
  ]},
  { value: 'ROUND', label: 'Round', group: 'Numeric', params: [{ name: 'decimals', type: 'number', placeholder: 'Decimal places' }] },
  { value: 'FLOOR', label: 'Floor', group: 'Numeric', params: [] },
  { value: 'CEIL', label: 'Ceiling', group: 'Numeric', params: [] },
  { value: 'add', label: 'Add', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Value to add' }] },
  { value: 'subtract', label: 'Subtract', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Value to subtract' }] },
  { value: 'multiply', label: 'Multiply', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Multiplier' }] },
  { value: 'divide', label: 'Divide', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Divisor' }] },
  { value: 'date-format', label: 'Format Date', group: 'Date/Time', params: [{ name: 'format', type: 'text', placeholder: 'e.g., YYYY-MM-DD' }] },
  { value: 'current-date', label: 'Current Date', group: 'Date/Time', params: [] },
  { value: 'cast-string', label: 'To String', group: 'Type Cast', params: [] },
  { value: 'cast-integer', label: 'To Integer', group: 'Type Cast', params: [] },
  { value: 'cast-float', label: 'To Float', group: 'Type Cast', params: [] },
];

const TableBasedMapper = ({ schema, fieldMappings, onMappingsChange }) => {
  const [selectedSource, setSelectedSource] = useState(new Set());
  const [mappings, setMappings] = useState([]);
  const [editingExpression, setEditingExpression] = useState(null);
  const [searchSource, setSearchSource] = useState('');
  const [searchTarget, setSearchTarget] = useState('');
  const [addingNewColumn, setAddingNewColumn] = useState(false);
  const [newColumn, setNewColumn] = useState({
    targetField: '',
    sourceField: '',
    transformation: 'none',
    params: {}
  });

  useEffect(() => {
    if (fieldMappings && fieldMappings.length > 0) {
      setMappings(fieldMappings);
      const selectedFields = new Set(fieldMappings.map(m => m.source_field));
      setSelectedSource(selectedFields);
    }
  }, [fieldMappings]);

  const buildExpression = (mapping) => {
    if (!mapping.transformation || mapping.transformation === 'none') {
      return mapping.source_field;
    }

    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === mapping.transformation);
    if (!transform) return mapping.source_field;

    let expr = `${mapping.transformation}(${mapping.source_field}`;
    
    if (mapping.transformation_params && Object.keys(mapping.transformation_params).length > 0) {
      const params = Object.values(mapping.transformation_params).filter(v => v);
      if (params.length > 0) {
        expr += ', ' + params.map(p => typeof p === 'string' ? `'${p}'` : p).join(', ');
      }
    }
    
    expr += ')';
    return expr;
  };

  const handleSourceToggle = (fieldName) => {
    const newSelected = new Set(selectedSource);
    
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
      const newMappings = mappings.filter(m => m.source_field !== fieldName);
      setMappings(newMappings);
      onMappingsChange(newMappings);
    } else {
      newSelected.add(fieldName);
      const newMapping = {
        source_field: fieldName,
        target_field: fieldName,
        transformation: 'none',
        transformation_params: {}
      };
      const newMappings = [...mappings, newMapping];
      setMappings(newMappings);
      onMappingsChange(newMappings);
    }
    
    setSelectedSource(newSelected);
  };

  const handleAutomap = () => {
    const newMappings = schema.map(field => ({
      source_field: field.name,
      target_field: field.name,
      transformation: 'none',
      transformation_params: {}
    }));
    
    setMappings(newMappings);
    setSelectedSource(new Set(schema.map(f => f.name)));
    onMappingsChange(newMappings);
  };

  const handleClearMapping = () => {
    setMappings([]);
    setSelectedSource(new Set());
    onMappingsChange([]);
  };

  const handleRemoveMapping = (sourceField) => {
    const newMappings = mappings.filter(m => m.source_field !== sourceField);
    const newSelected = new Set(selectedSource);
    newSelected.delete(sourceField);
    
    setMappings(newMappings);
    setSelectedSource(newSelected);
    onMappingsChange(newMappings);
  };

  const handleTargetNameChange = (sourceField, newTargetName) => {
    const newMappings = mappings.map(m => 
      m.source_field === sourceField ? { ...m, target_field: newTargetName } : m
    );
    setMappings(newMappings);
    onMappingsChange(newMappings);
  };

  const handleEditExpression = (sourceField) => {
    const mapping = mappings.find(m => m.source_field === sourceField);
    if (mapping) {
      setEditingExpression({
        sourceField,
        transformation: mapping.transformation || 'none',
        params: mapping.transformation_params || {}
      });
    }
  };

  const handleSaveExpression = () => {
    if (!editingExpression) return;

    const newMappings = mappings.map(m => {
      if (m.source_field === editingExpression.sourceField) {
        return {
          ...m,
          transformation: editingExpression.transformation,
          transformation_params: editingExpression.params
        };
      }
      return m;
    });

    setMappings(newMappings);
    onMappingsChange(newMappings);
    setEditingExpression(null);
  };

  const handleTransformationChange = (value) => {
    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === value);
    setEditingExpression({
      ...editingExpression,
      transformation: value,
      params: transform && transform.params.length > 0 ? {} : {}
    });
  };

  const handleParamChange = (paramName, paramValue) => {
    setEditingExpression({
      ...editingExpression,
      params: {
        ...editingExpression.params,
        [paramName]: paramValue
      }
    });
  };

  const handleAddNewColumn = () => {
    setNewColumn({
      targetField: '',
      sourceField: '',
      transformation: 'none',
      params: {}
    });
    setAddingNewColumn(true);
  };

  const handleNewColumnChange = (field, value) => {
    setNewColumn({
      ...newColumn,
      [field]: value
    });
  };

  const handleNewColumnTransformationChange = (value) => {
    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === value);
    setNewColumn({
      ...newColumn,
      transformation: value,
      params: transform && transform.params.length > 0 ? {} : {}
    });
  };

  const handleNewColumnParamChange = (paramName, paramValue) => {
    setNewColumn({
      ...newColumn,
      params: {
        ...newColumn.params,
        [paramName]: paramValue
      }
    });
  };

  const handleSaveNewColumn = () => {
    if (!newColumn.targetField.trim()) {
      alert('Please enter a target field name');
      return;
    }

    // Check if target field name already exists
    if (mappings.some(m => m.target_field === newColumn.targetField)) {
      alert('A field with this target name already exists');
      return;
    }

    const newMapping = {
      source_field: newColumn.sourceField || `__custom_${Date.now()}__`,
      target_field: newColumn.targetField,
      transformation: newColumn.transformation,
      transformation_params: newColumn.params,
      is_custom: !newColumn.sourceField
    };

    const newMappings = [...mappings, newMapping];
    setMappings(newMappings);
    onMappingsChange(newMappings);
    setAddingNewColumn(false);
  };

  const buildExpressionForCustom = (mapping) => {
    if (mapping.is_custom) {
      if (!mapping.transformation || mapping.transformation === 'none') {
        return '(custom value)';
      }
      
      const transform = TRANSFORMATION_OPTIONS.find(t => t.value === mapping.transformation);
      if (!transform) return '(custom value)';

      let expr = `${mapping.transformation}(`;
      
      if (mapping.transformation_params && Object.keys(mapping.transformation_params).length > 0) {
        const params = Object.values(mapping.transformation_params).filter(v => v);
        expr += params.map(p => typeof p === 'string' ? `'${p}'` : p).join(', ');
      }
      
      expr += ')';
      return expr;
    }
    return buildExpression(mapping);
  };

  const filteredSourceFields = schema.filter(field => 
    field.name.toLowerCase().includes(searchSource.toLowerCase())
  );

  const filteredMappings = mappings.filter(mapping =>
    mapping.target_field.toLowerCase().includes(searchTarget.toLowerCase())
  );

  return (
    <div className="table-based-mapper">
      <div className="mapper-header">
        <h3>Field Mapping Parameter Details</h3>
        <div className="mapper-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleClearMapping}>
            Clear Mapping
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleAutomap}>
            Automap
          </button>
        </div>
      </div>

      <div className="mapper-panels">
        <div className="source-panel">
          <h4>Incoming Fields</h4>
          <div className="field-search">
            <input
              type="text"
              placeholder="Find"
              value={searchSource}
              onChange={(e) => setSearchSource(e.target.value)}
              className="form-control-sm"
            />
          </div>
          <div className="source-fields-list">
            {filteredSourceFields.map(field => (
              <div key={field.name} className="source-field-item">
                <input
                  type="checkbox"
                  id={`source-${field.name}`}
                  checked={selectedSource.has(field.name)}
                  onChange={() => handleSourceToggle(field.name)}
                />
                <label htmlFor={`source-${field.name}`}>
                  {field.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="target-panel">
          <div className="target-panel-header">
            <h4>Target Fields</h4>
            <button className="btn btn-primary btn-sm" onClick={handleAddNewColumn} title="Add a new calculated column">
              <FiPlus /> Add New Column
            </button>
          </div>
          <div className="field-search">
            <input
              type="text"
              placeholder="Find"
              value={searchTarget}
              onChange={(e) => setSearchTarget(e.target.value)}
              className="form-control-sm"
            />
          </div>
          <div className="target-table-container">
            <table className="target-mapping-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Status</th>
                  <th style={{ width: '200px' }}>Name</th>
                  <th style={{ width: '80px' }}>Actions</th>
                  <th>Expression</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map(mapping => (
                  <tr key={mapping.source_field}>
                    <td className="status-cell">
                      <FiCheck className="status-icon mapped" />
                    </td>
                    <td className="name-cell">
                      <input
                        type="text"
                        value={mapping.target_field}
                        onChange={(e) => handleTargetNameChange(mapping.source_field, e.target.value)}
                        className="target-name-input"
                      />
                    </td>
                    <td className="actions-cell">
                      {!mapping.is_custom && <FiArrowRight className="arrow-icon" title="Mapped from source" />}
                      {mapping.is_custom && <span className="custom-badge" title="Custom column">Custom</span>}
                      <button 
                        className="btn-icon-small"
                        onClick={() => handleEditExpression(mapping.source_field)}
                        title="Edit expression"
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="btn-icon-small"
                        onClick={() => handleRemoveMapping(mapping.source_field)}
                        title="Remove mapping"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                    <td className="expression-cell">
                      <span className="expression-text" onClick={() => handleEditExpression(mapping.source_field)}>
                        {buildExpressionForCustom(mapping)}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredMappings.length === 0 && (
                  <tr>
                    <td colSpan="4" className="no-mappings">
                      No field mappings. Select source fields from the left panel or click Automap.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingExpression && (
        <div className="expression-editor-modal">
          <div className="modal-overlay" onClick={() => setEditingExpression(null)}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h4>Edit Expression</h4>
              <button className="btn-close" onClick={() => setEditingExpression(null)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Source Field</label>
                <input
                  type="text"
                  value={editingExpression.sourceField}
                  disabled
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label>Transformation</label>
                <select
                  className="form-control"
                  value={editingExpression.transformation}
                  onChange={(e) => handleTransformationChange(e.target.value)}
                >
                  {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                    const lastGroup = acc[acc.length - 1];
                    if (!lastGroup || lastGroup.group !== option.group) {
                      acc.push({ group: option.group, options: [option] });
                    } else {
                      lastGroup.options.push(option);
                    }
                    return acc;
                  }, []).map((group, idx) => (
                    <optgroup key={idx} label={group.group}>
                      {group.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {TRANSFORMATION_OPTIONS.find(t => t.value === editingExpression.transformation)?.params.map(param => (
                <div key={param.name} className="form-group">
                  <label>{param.name}</label>
                  <input
                    type={param.type}
                    className="form-control"
                    value={editingExpression.params[param.name] || ''}
                    onChange={(e) => handleParamChange(param.name, e.target.value)}
                    placeholder={param.placeholder}
                  />
                </div>
              ))}

              <div className="form-group">
                <label>Preview</label>
                <div className="expression-preview">
                  {buildExpression({
                    source_field: editingExpression.sourceField,
                    transformation: editingExpression.transformation,
                    transformation_params: editingExpression.params
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingExpression(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveExpression}>
                Save Expression
              </button>
            </div>
          </div>
        </div>
      )}

      {addingNewColumn && (
        <div className="expression-editor-modal">
          <div className="modal-overlay" onClick={() => setAddingNewColumn(false)}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h4>Add New Column</h4>
              <button className="btn-close" onClick={() => setAddingNewColumn(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Target Field Name *</label>
                <input
                  type="text"
                  className="form-control"
                  value={newColumn.targetField}
                  onChange={(e) => handleNewColumnChange('targetField', e.target.value)}
                  placeholder="Enter new column name"
                />
              </div>

              <div className="form-group">
                <label>Source Field (Optional)</label>
                <select
                  className="form-control"
                  value={newColumn.sourceField}
                  onChange={(e) => handleNewColumnChange('sourceField', e.target.value)}
                >
                  <option value="">-- None (Custom Value) --</option>
                  {schema.map(field => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
                </select>
                <small className="form-text">Select a source field to base the new column on, or leave empty for a custom calculated column</small>
              </div>

              <div className="form-group">
                <label>Transformation</label>
                <select
                  className="form-control"
                  value={newColumn.transformation}
                  onChange={(e) => handleNewColumnTransformationChange(e.target.value)}
                >
                  {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                    const lastGroup = acc[acc.length - 1];
                    if (!lastGroup || lastGroup.group !== option.group) {
                      acc.push({ group: option.group, options: [option] });
                    } else {
                      lastGroup.options.push(option);
                    }
                    return acc;
                  }, []).map((group, idx) => (
                    <optgroup key={idx} label={group.group}>
                      {group.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {TRANSFORMATION_OPTIONS.find(t => t.value === newColumn.transformation)?.params.map(param => (
                <div key={param.name} className="form-group">
                  <label>{param.name} *</label>
                  <input
                    type={param.type}
                    className="form-control"
                    value={newColumn.params[param.name] || ''}
                    onChange={(e) => handleNewColumnParamChange(param.name, e.target.value)}
                    placeholder={param.placeholder}
                  />
                </div>
              ))}

              <div className="form-group">
                <label>Preview</label>
                <div className="expression-preview">
                  {newColumn.sourceField ? 
                    buildExpression({
                      source_field: newColumn.sourceField,
                      transformation: newColumn.transformation,
                      transformation_params: newColumn.params
                    }) :
                    buildExpressionForCustom({
                      is_custom: true,
                      transformation: newColumn.transformation,
                      transformation_params: newColumn.params
                    })
                  }
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAddingNewColumn(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveNewColumn}>
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mapping-summary">
        <p>{mappings.length} field(s) mapped</p>
      </div>
    </div>
  );
};

export default TableBasedMapper;
