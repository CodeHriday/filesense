import React, { useState, useEffect } from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import './MappingConfigModal.css';
import PropTypes from 'prop-types';


const JoinModal = ({ isOpen, onClose, onSave, initialConfig = {}, leftSchema = [], rightSchema = [], leftNodeName = '', rightNodeName = '' }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState('configuration');
  const [joinType, setJoinType] = useState('INNER');
  const [joinKeys, setJoinKeys] = useState([]);
  const [columnMappings, setColumnMappings] = useState([]);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialConfig.name || '');
      setDescription(initialConfig.description || '');
      setJoinType(initialConfig.joinType || 'INNER');
      setJoinKeys(initialConfig.joinKeys || []);
      
      if (initialConfig.columnMappings && initialConfig.columnMappings.length > 0) {
        setColumnMappings(initialConfig.columnMappings);
      } else {
        generateDefaultMappings();
      }
      
      setActiveTab('configuration');
      setValidationError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && leftSchema.length > 0 && rightSchema.length > 0) {
      if (joinKeys.length === 0) {
        addJoinKey();
      }
      if (columnMappings.length === 0) {
        generateDefaultMappings();
      }
    }
  }, [leftSchema, rightSchema, isOpen]);

  const generateDefaultMappings = () => {
    const mappings = [];
    
    leftSchema.forEach(col => {
      mappings.push({
        outputColumn: col.name,
        sourceColumn: col.name,
        sourceSide: 'left',
        include: true
      });
    });
    
    rightSchema.forEach(col => {
      const isDuplicate = leftSchema.some(leftCol => leftCol.name === col.name);
      if (!isDuplicate) {
        mappings.push({
          outputColumn: col.name,
          sourceColumn: col.name,
          sourceSide: 'right',
          include: true
        });
      }
    });
    
    setColumnMappings(mappings);
  };

  const addJoinKey = () => {
    const newKey = {
      leftColumn: leftSchema.length > 0 ? leftSchema[0].name : '',
      operator: '=',
      rightColumn: rightSchema.length > 0 ? rightSchema[0].name : ''
    };
    setJoinKeys([...joinKeys, newKey]);
  };

  const removeJoinKey = (index) => {
    setJoinKeys(joinKeys.filter((_, i) => i !== index));
  };

  const updateJoinKey = (index, field, value) => {
    const updated = [...joinKeys];
    updated[index][field] = value;
    setJoinKeys(updated);
  };

  const addColumnMapping = () => {
    const newMapping = {
      outputColumn: '',
      sourceColumn: leftSchema.length > 0 ? leftSchema[0].name : '',
      sourceSide: 'left',
      include: true
    };
    setColumnMappings([...columnMappings, newMapping]);
  };

  const removeColumnMapping = (index) => {
    setColumnMappings(columnMappings.filter((_, i) => i !== index));
  };

  const updateColumnMapping = (index, field, value) => {
    const updated = [...columnMappings];
    updated[index][field] = value;
    
    if (field === 'sourceSide' && value === 'left') {
      updated[index].sourceColumn = leftSchema.length > 0 ? leftSchema[0].name : '';
    } else if (field === 'sourceSide' && value === 'right') {
      updated[index].sourceColumn = rightSchema.length > 0 ? rightSchema[0].name : '';
    }
    
    setColumnMappings(updated);
  };

  const toggleAllLeftColumns = () => {
    const leftMappings = columnMappings.filter(m => m.sourceSide === 'left');
    const allIncluded = leftMappings.length > 0 && leftMappings.every(m => m.include);
    
    const updated = columnMappings.map(m => {
      if (m.sourceSide === 'left') {
        return { ...m, include: !allIncluded };
      }
      return m;
    });
    setColumnMappings(updated);
  };

  const toggleAllRightColumns = () => {
    const rightMappings = columnMappings.filter(m => m.sourceSide === 'right');
    const allIncluded = rightMappings.length > 0 && rightMappings.every(m => m.include);
    
    const updated = columnMappings.map(m => {
      if (m.sourceSide === 'right') {
        return { ...m, include: !allIncluded };
      }
      return m;
    });
    setColumnMappings(updated);
  };

  const getLeftIncludeState = () => {
    const leftMappings = columnMappings.filter(m => m.sourceSide === 'left');
    if (leftMappings.length === 0) return false;
    return leftMappings.every(m => m.include);
  };

  const getRightIncludeState = () => {
    const rightMappings = columnMappings.filter(m => m.sourceSide === 'right');
    if (rightMappings.length === 0) return false;
    return rightMappings.every(m => m.include);
  };

  const validateConfig = () => {
    if (joinKeys.length === 0) {
      setValidationError('At least one join key is required');
      return false;
    }

    for (let i = 0; i < joinKeys.length; i++) {
      const key = joinKeys[i];
      if (!key.leftColumn || !key.rightColumn) {
        setValidationError(`Join key ${i + 1} is incomplete`);
        return false;
      }
    }

    const outputColumns = columnMappings
      .filter(m => m.include)
      .map(m => m.outputColumn);
    
    if (outputColumns.length === 0) {
      setValidationError('At least one output column must be included');
      return false;
    }

    const duplicates = outputColumns.filter((col, index) => 
      outputColumns.indexOf(col) !== index
    );
    
    if (duplicates.length > 0) {
      setValidationError(`Duplicate output column names: ${duplicates.join(', ')}`);
      return false;
    }

    const emptyOutputColumns = columnMappings.filter(m => m.include && !m.outputColumn);
    if (emptyOutputColumns.length > 0) {
      setValidationError('All included columns must have output column names');
      return false;
    }

    setValidationError('');
    return true;
  };

  const handleSave = () => {
    if (!validateConfig()) {
      setActiveTab('configuration');
      return;
    }

    const config = {
      name,
      description,
      joinType,
      joinKeys,
      columnMappings: columnMappings.filter(m => m.include),
      outputSchema: columnMappings
        .filter(m => m.include)
        .map(m => ({
          name: m.outputColumn,
          type: 'STRING',
          source: m.sourceSide
        }))
    };
    
    onSave(config);
    onClose();
  };

  const getOutputSchema = () => {
    return columnMappings
      .filter(m => m.include)
      .map(m => m.outputColumn)
      .filter(name => name);
  };

  if (!isOpen) return null;

  return (
    <div className="vm-modal-overlay">
      <div className="vm-modal vm-modal-large">
        <div className="vm-modal-header">
          <h2>Join Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>

        <div className="vm-tabs">
          <button
            className={`vm-tab ${activeTab === 'configuration' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('configuration')}
          >
            Configuration
          </button>
          <button
            className={`vm-tab ${activeTab === 'mapping' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('mapping')}
          >
            Mapping
          </button>
        </div>

        <div className="vm-modal-body vm-modal-body-scroll">
          {validationError && (
            <div className="vm-error-message">
              {validationError}
            </div>
          )}

          {activeTab === 'configuration' && (
            <div>
              <div className="vm-form-group">
                <label htmlFor="join-name-input">Name *</label>
                <input
                  id="join-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter a name for this join configuration"
                  className="vm-input"
                  required
                />
              </div>
              
              <div className="vm-form-group">
                <label htmlFor="join-description">Description</label>
                <textarea
                  id="join-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="vm-input"
                  rows="2"
                />
              </div>
              
              <div className="vm-form-group">
                <label htmlFor="join-type-select">Join Type</label>
                <select 
                  id="join-type-select"
                  className="vm-select"
                  value={joinType}
                  onChange={(e) => setJoinType(e.target.value)}
                >
                  <option value="INNER">INNER JOIN</option>
                  <option value="LEFT">LEFT JOIN</option>
                  <option value="RIGHT">RIGHT JOIN</option>
                  <option value="FULL OUTER">FULL OUTER JOIN</option>
                </select>
                <span className="vm-help-text">
                  Select the type of join operation to perform
                </span>
              </div>

              <div className="vm-section-title">Join Keys</div>
              
              {joinKeys.length === 0 ? (
                <div className="vm-info-box">
                  <p>No join keys defined. Click "Add Join Key" to create one.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="vm-schema-table" style={{ marginBottom: '16px' }}>
                    <thead>
                      <tr>
                        <th>Left Column {leftNodeName && `(${leftNodeName})`}</th>
                        <th>Operator</th>
                        <th>Right Column {rightNodeName && `(${rightNodeName})`}</th>
                        <th style={{ width: '80px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {joinKeys.map((key, index) => (
                        <tr key={index}>
                          <td>
                            <select
                              className="vm-select"
                              value={key.leftColumn}
                              onChange={(e) => updateJoinKey(index, 'leftColumn', e.target.value)}
                            >
                              <option value="">-- Select Column --</option>
                              {leftSchema.map((col, i) => (
                                <option key={i} value={col.name}>{col.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="vm-select"
                              value={key.operator}
                              onChange={(e) => updateJoinKey(index, 'operator', e.target.value)}
                            >
                              <option value="=">=</option>
                              <option value="!=">!=</option>
                              <option value="<">&lt;</option>
                              <option value=">">&gt;</option>
                              <option value="<=">&lt;=</option>
                              <option value=">=">&gt;=</option>
                            </select>
                          </td>
                          <td>
                            <select
                              className="vm-select"
                              value={key.rightColumn}
                              onChange={(e) => updateJoinKey(index, 'rightColumn', e.target.value)}
                            >
                              <option value="">-- Select Column --</option>
                              {rightSchema.map((col, i) => (
                                <option key={i} value={col.name}>{col.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              className="vm-btn vm-btn-secondary"
                              onClick={() => removeJoinKey(index)}
                              style={{ padding: '4px 8px', fontSize: '9px' }}
                            >
                              <FaTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                className="vm-btn vm-btn-primary"
                onClick={addJoinKey}
                style={{ marginTop: '8px' }}
              >
                <FaPlus /> Add Join Key
              </button>
            </div>
          )}

          {activeTab === 'mapping' && (
            <div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 500, color: '#333' }}>
                    Include All {leftNodeName || 'Left'}
                  </span>
                  <label style={{ 
                    position: 'relative', 
                    display: 'inline-block', 
                    width: '36px', 
                    height: '20px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={getLeftIncludeState()}
                      onChange={toggleAllLeftColumns}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: getLeftIncludeState() ? '#025043' : '#ccc',
                      borderRadius: '20px',
                      transition: '0.3s'
                    }} />
                    <span style={{
                      position: 'absolute',
                      height: '14px',
                      width: '14px',
                      left: getLeftIncludeState() ? '19px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.3s'
                    }} />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'Inter, sans-serif', fontWeight: 500, color: '#333' }}>
                    Include All {rightNodeName || 'Right'}
                  </span>
                  <label style={{ 
                    position: 'relative', 
                    display: 'inline-block', 
                    width: '36px', 
                    height: '20px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={getRightIncludeState()}
                      onChange={toggleAllRightColumns}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: getRightIncludeState() ? '#025043' : '#ccc',
                      borderRadius: '20px',
                      transition: '0.3s'
                    }} />
                    <span style={{
                      position: 'absolute',
                      height: '14px',
                      width: '14px',
                      left: getRightIncludeState() ? '19px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.3s'
                    }} />
                  </label>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="vm-schema-table" style={{ marginBottom: '16px' }}>
                  <thead>
                    <tr>
                      <th>Source Side</th>
                      <th>Source Column</th>
                      <th>Output Column Name</th>
                      <th style={{ width: '80px' }}>Include</th>
                      <th style={{ width: '80px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnMappings.map((mapping, index) => (
                      <tr key={index}>
                        <td>
                          <select
                            className="vm-select"
                            value={mapping.sourceSide}
                            onChange={(e) => updateColumnMapping(index, 'sourceSide', e.target.value)}
                          >
                            <option value="left">{leftNodeName || 'Left Input'}</option>
                            <option value="right">{rightNodeName || 'Right Input'}</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="vm-select"
                            value={mapping.sourceColumn}
                            onChange={(e) => updateColumnMapping(index, 'sourceColumn', e.target.value)}
                          >
                            {mapping.sourceSide === 'left' 
                              ? leftSchema.map((col, i) => (
                                  <option key={i} value={col.name}>{col.name}</option>
                                ))
                              : rightSchema.map((col, i) => (
                                  <option key={i} value={col.name}>{col.name}</option>
                                ))
                            }
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="vm-input"
                            value={mapping.outputColumn}
                            onChange={(e) => updateColumnMapping(index, 'outputColumn', e.target.value)}
                            placeholder="Output column name"
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={mapping.include}
                            onChange={(e) => updateColumnMapping(index, 'include', e.target.checked)}
                          />
                        </td>
                        <td>
                          <button
                            className="vm-btn vm-btn-secondary"
                            onClick={() => removeColumnMapping(index)}
                            style={{ padding: '4px 8px', fontSize: '9px' }}
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                className="vm-btn vm-btn-primary"
                onClick={addColumnMapping}
                style={{ marginTop: '8px', marginBottom: '16px' }}
              >
                <FaPlus /> Add Column Mapping
              </button>

              <div className="vm-section-title">Output Schema Preview</div>
              <div className="vm-schema-meta">
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Total Output Columns:</span>
                  <span className="vm-schema-value">{getOutputSchema().length}</span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Columns:</span>
                  <span className="vm-schema-value">
                    {getOutputSchema().join(', ') || 'None'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="vm-btn vm-btn-primary">
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
JoinModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,

  initialConfig: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    joinType: PropTypes.string,
    joinKeys: PropTypes.array,
    columnMappings: PropTypes.array
  }),

  leftSchema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired
    })
  ),

  rightSchema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired
    })
  ),

  leftNodeName: PropTypes.string,
  rightNodeName: PropTypes.string
};

export default JoinModal;
