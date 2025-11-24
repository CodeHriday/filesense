import React, { useState } from 'react';
import RdmLookupStep from '../RdmLookupStep';
import './MappingConfigModal.css';

const RdmDatasetModal = ({ isOpen, onClose, onSave, initialConfig = {}, cumulativeSchema = [] }) => {
  const [rdmConfig, setRdmConfig] = useState(initialConfig.rdmConfig || {});
  
  const handleSave = () => {
    const config = {
      rdmConfig,
      datasetName: rdmConfig.dataset_name || '',
      joinType: rdmConfig.join_type || '',
      columnMappingsCount: rdmConfig.column_mappings?.length || 0
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>RDM Dataset Lookup Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          <div className="vm-info-box">
            <p>
              Enrich your data by joining with reference datasets from the RDM system.
              Configure join conditions and select columns to include.
            </p>
          </div>
          
          <RdmLookupStep
            cumulativeSchema={cumulativeSchema}
            rdmDatasetConfig={rdmConfig}
            onRdmDatasetConfigChange={setRdmConfig}
          />
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!rdmConfig.dataset_name}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default RdmDatasetModal;
