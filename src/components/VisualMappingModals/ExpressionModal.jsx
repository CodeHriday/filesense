import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import TableBasedMapper from '../TableBasedMapper';
import './MappingConfigModal.css';

const ExpressionModal = ({ isOpen, onClose, onSave, initialConfig = {}, schema = [] }) => {
  const [name, setName] = useState(initialConfig.name || '');
  const [description, setDescription] = useState(initialConfig.description || '');
  const [fieldMappings, setFieldMappings] = useState(initialConfig.fieldMappings || []);
  const [variables, setVariables] = useState(initialConfig.variables || []);
  const [piiColumns, setPiiColumns] = useState(initialConfig.piiColumns || []);
  const [dqRuleAssignments, setDqRuleAssignments] = useState(initialConfig.dqRuleAssignments || {});
  const [validationError, setValidationError] = useState(null);
  
  useEffect(() => {
    if (isOpen) {
      setName(initialConfig.name || '');
      setDescription(initialConfig.description || '');
      setFieldMappings(initialConfig.fieldMappings || []);
      setVariables(initialConfig.variables || []);
      setPiiColumns(initialConfig.piiColumns || []);
      setDqRuleAssignments(initialConfig.dqRuleAssignments || {});
      setValidationError(null);
    }
  }, [isOpen, initialConfig]);
  
  const handleSave = () => {
    if (!name.trim()) {
      setValidationError('Please enter a name for this expression configuration');
      return;
    }
    
    const config = {
      name,
      description,
      fieldMappings,
      variables,
      piiColumns,
      dqRuleAssignments,
      mappingCount: fieldMappings.length,
      variableCount: variables.length,
      dqRuleCount: Object.keys(dqRuleAssignments).length
    };
    onSave(config);
    onClose();
  };
  
  const handleMappingsChange = (mappings, vars, pii, dqAssignments) => {
    setFieldMappings(mappings);
    setVariables(vars || []);
    setPiiColumns(pii || []);
    setDqRuleAssignments(dqAssignments || {});
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay">
      <div className="vm-modal vm-modal-fullscreen">
        <div className="vm-modal-header">
          <h2>Expression Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          {validationError && (
            <div style={{ 
              padding: '8px 12px', 
              marginBottom: '12px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca', 
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ color: '#dc2626', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>
                {validationError}
              </span>
              <button 
                onClick={() => setValidationError(null)} 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#dc2626', 
                  cursor: 'pointer',
                  fontSize: '14px',
                  lineHeight: 1,
                  padding: '0 4px'
                }}
              >
                ×
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div className="vm-form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="expression-name">Name *</label>
              <input
                id="expression-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setValidationError(null); }}
                placeholder="Enter a name for this expression configuration"
                className="vm-input"
                style={validationError && !name.trim() ? { borderColor: '#dc2626' } : {}}
              />
            </div>
            
            <div className="vm-form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label htmlFor="expression-description">Description</label>
              <input
                id="expression-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="vm-input"
              />
            </div>
          </div>
          
          <TableBasedMapper
            schema={schema}
            fieldMappings={fieldMappings}
            variables={variables}
            piiColumns={piiColumns}
            dqRuleAssignments={dqRuleAssignments}
            onMappingsChange={handleMappingsChange}
          />
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="vm-btn vm-btn-primary">
            Save Configuration ({fieldMappings.length} mappings)
          </button>
        </div>
      </div>
    </div>
  );
};
ExpressionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,

  initialConfig: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    fieldMappings: PropTypes.array,
    variables: PropTypes.array,
    piiColumns: PropTypes.array,
    dqRuleAssignments: PropTypes.object
  }),

  schema: PropTypes.array
};

export default ExpressionModal;
