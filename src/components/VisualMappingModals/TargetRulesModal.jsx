import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MappingConfigModal.css';

const TargetRulesModal = ({ isOpen, onClose, onSave, initialConfig = {} }) => {
  const [connectionId, setConnectionId] = useState(initialConfig.connectionId || '');
  const [filePath, setFilePath] = useState(initialConfig.filePath || '');
  const [fileName, setFileName] = useState(initialConfig.fileName || '');
  const [fileFormat, setFileFormat] = useState(initialConfig.fileFormat || 'csv');
  const [violationHandling, setViolationHandling] = useState(initialConfig.violationHandling || 'log_continue');
  const [selectedQualityRules, setSelectedQualityRules] = useState(initialConfig.selectedQualityRules || []);
  const [anomalyDetection, setAnomalyDetection] = useState(initialConfig.anomalyDetection || false);
  
  const [connections, setConnections] = useState([]);
  const [qualityRules, setQualityRules] = useState([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      fetchConnections();
      fetchQualityRules();
    }
  }, [isOpen]);
  
  const fetchConnections = async () => {
    try {
      const response = await axios.get('/api/connections');
      setConnections(response.data.filter(c => 
        ['s3', 'gcs', 'azure', 'local'].includes(c.connection_type?.toLowerCase())
      ));
    } catch (error) {
      console.error('Error fetching connections:', error);
    }
  };
  
  const fetchQualityRules = async () => {
    try {
      const response = await axios.get('/api/quality-rules');
      setQualityRules(response.data || []);
    } catch (error) {
      console.error('Error fetching quality rules:', error);
    }
  };
  
  const toggleQualityRule = (ruleId) => {
    setSelectedQualityRules(prev => {
      if (prev.includes(ruleId)) {
        return prev.filter(id => id !== ruleId);
      } else {
        return [...prev, ruleId];
      }
    });
  };
  
  const handleSave = () => {
    const selectedConnection = connections.find(c => c.id === parseInt(connectionId));
    const config = {
      connectionId,
      connectionName: selectedConnection?.name || '',
      connectionType: selectedConnection?.connection_type || '',
      filePath,
      fileName,
      fileFormat,
      violationHandling,
      selectedQualityRules,
      qualityRulesCount: selectedQualityRules.length,
      anomalyDetection
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>Target Rules Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body vm-modal-body-scroll">
          <h3 className="vm-section-title">Target Destination</h3>
          
          <div className="vm-form-group">
            <label>Target Connection *</label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="vm-select"
            >
              <option value="">Select Connection</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.connection_type})
                </option>
              ))}
            </select>
          </div>
          
          <div className="vm-form-group">
            <label>File Path *</label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="e.g., /data/processed/"
              className="vm-input"
            />
          </div>
          
          <div className="vm-form-group">
            <label>File Name *</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g., output.csv"
              className="vm-input"
            />
          </div>
          
          <div className="vm-form-group">
            <label>File Format</label>
            <select
              value={fileFormat}
              onChange={(e) => setFileFormat(e.target.value)}
              className="vm-select"
            >
              <option value="csv">CSV</option>
              <option value="parquet">Parquet</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel (XLSX)</option>
            </select>
          </div>
          
          <h3 className="vm-section-title">Quality Rules</h3>
          
          <div className="vm-form-group">
            <label>Violation Handling</label>
            <select
              value={violationHandling}
              onChange={(e) => setViolationHandling(e.target.value)}
              className="vm-select"
            >
              <option value="log_continue">Log and Continue</option>
              <option value="log_abort">Log and Abort</option>
            </select>
          </div>
          
          {qualityRules.length > 0 && (
            <div className="vm-quality-rules-list">
              <label>Select Quality Rules to Apply:</label>
              {qualityRules.map(rule => (
                <div key={rule.id} className="vm-quality-rule-item">
                  <input
                    type="checkbox"
                    id={`rule-${rule.id}`}
                    checked={selectedQualityRules.includes(rule.id)}
                    onChange={() => toggleQualityRule(rule.id)}
                  />
                  <label htmlFor={`rule-${rule.id}`}>
                    <strong>{rule.rule_name}</strong> - {rule.rule_type}
                  </label>
                </div>
              ))}
            </div>
          )}
          
          <h3 className="vm-section-title">Anomaly Detection</h3>
          
          <div className="vm-form-group">
            <label className="vm-checkbox-label">
              <input
                type="checkbox"
                checked={anomalyDetection}
                onChange={(e) => setAnomalyDetection(e.target.checked)}
              />
              Enable anomaly detection for numeric deviation, row count, and null spikes
            </label>
          </div>
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={!connectionId || !filePath || !fileName}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default TargetRulesModal;
