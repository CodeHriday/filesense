import React, { useState } from 'react';
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
  
  const handleSave = () => {
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
          <div className="vm-form-group">
            <label>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this expression configuration"
              className="vm-input"
              required
            />
          </div>
          
          <div className="vm-form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="vm-input"
              rows="2"
            />
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
