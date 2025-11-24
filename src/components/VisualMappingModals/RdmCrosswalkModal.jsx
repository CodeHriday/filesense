import React, { useState } from 'react';
import CrosswalkLookupStep from '../CrosswalkLookupStep';
import './MappingConfigModal.css';

const RdmCrosswalkModal = ({ isOpen, onClose, onSave, initialConfig = {}, cumulativeSchema = [] }) => {
  const [rdmConfig, setRdmConfig] = useState(initialConfig.rdmConfig || {});
  
  const handleSave = () => {
    const config = {
      rdmConfig,
      crosswalkName: rdmConfig.crosswalk_name || '',
      sourceColumn: rdmConfig.source_column || '',
      targetColumn: rdmConfig.target_column || ''
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>RDM Crosswalk Lookup Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          <div className="vm-info-box">
            <p>
              Map source values to target values using RDM crosswalk tables.
              Configure which column to transform and the target column name.
            </p>
          </div>
          
          <CrosswalkLookupStep
            cumulativeSchema={cumulativeSchema}
            rdmCrosswalkConfig={rdmConfig}
            onRdmCrosswalkConfigChange={setRdmConfig}
          />
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!rdmConfig.crosswalk_name}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default RdmCrosswalkModal;
