import React, { useState } from 'react';
import TableBasedMapper from '../TableBasedMapper';
import './MappingConfigModal.css';

const ExpressionModal = ({ isOpen, onClose, onSave, initialConfig = {}, schema = [] }) => {
  const [fieldMappings, setFieldMappings] = useState(initialConfig.fieldMappings || []);
  const [variables, setVariables] = useState(initialConfig.variables || []);
  const [piiColumns, setPiiColumns] = useState(initialConfig.piiColumns || []);
  
  const handleSave = () => {
    const config = {
      fieldMappings,
      variables,
      piiColumns,
      mappingCount: fieldMappings.length,
      variableCount: variables.length
    };
    onSave(config);
    onClose();
  };
  
  const handleMappingsChange = (mappings, vars, pii) => {
    setFieldMappings(mappings);
    setVariables(vars || []);
    setPiiColumns(pii || []);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>Expression Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          <TableBasedMapper
            schema={schema}
            fieldMappings={fieldMappings}
            variables={variables}
            piiColumns={piiColumns}
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

export default ExpressionModal;
