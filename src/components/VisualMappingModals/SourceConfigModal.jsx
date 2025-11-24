import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MappingConfigModal.css';

const SourceConfigModal = ({ isOpen, onClose, onSave, initialConfig = {} }) => {
  const [connectionId, setConnectionId] = useState(initialConfig.connectionId || '');
  const [filePath, setFilePath] = useState(initialConfig.filePath || '');
  const [filePattern, setFilePattern] = useState(initialConfig.filePattern || '*.csv');
  const [schemaDriftHandling, setSchemaDriftHandling] = useState(initialConfig.schemaDriftHandling || 'none');
  
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [matchingFiles, setMatchingFiles] = useState([]);
  
  useEffect(() => {
    if (isOpen) {
      fetchConnections();
    }
  }, [isOpen]);
  
  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/connections');
      setConnections(response.data.filter(c => 
        ['s3', 'gcs', 'azure', 'local'].includes(c.connection_type?.toLowerCase())
      ));
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const validateFiles = async () => {
    if (!connectionId || !filePath || !filePattern) return;
    
    setLoading(true);
    try {
      const response = await axios.post('/api/connections/list-files', {
        connection_id: connectionId,
        path: filePath,
        pattern: filePattern
      });
      setMatchingFiles(response.data.files || []);
    } catch (error) {
      console.error('Error validating files:', error);
      setMatchingFiles([]);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = () => {
    const selectedConnection = connections.find(c => c.id === parseInt(connectionId));
    const config = {
      connectionId,
      connectionName: selectedConnection?.name || '',
      connectionType: selectedConnection?.connection_type || '',
      filePath,
      filePattern,
      schemaDriftHandling,
      matchingFilesCount: matchingFiles.length
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>Source Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body">
          <div className="vm-form-group">
            <label>Source Connection *</label>
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
              placeholder="e.g., /data/raw/"
              className="vm-input"
            />
            <small className="vm-help-text">
              Path to the directory containing source files
            </small>
          </div>
          
          <div className="vm-form-group">
            <label>File Name Pattern *</label>
            <input
              type="text"
              value={filePattern}
              onChange={(e) => setFilePattern(e.target.value)}
              placeholder="e.g., *.csv, sales_*.parquet"
              className="vm-input"
            />
            <small className="vm-help-text">
              Use wildcards (*) to match multiple files
            </small>
          </div>
          
          <div className="vm-form-group">
            <label>Schema Drift Handling</label>
            <select
              value={schemaDriftHandling}
              onChange={(e) => setSchemaDriftHandling(e.target.value)}
              className="vm-select"
            >
              <option value="none">Ignore - Process anyway</option>
              <option value="alert">Alert - Log warning but continue</option>
              <option value="abort">Abort - Stop execution on drift</option>
            </select>
            <small className="vm-help-text">
              How to handle schema changes in source files
            </small>
          </div>
          
          <div className="vm-form-actions">
            <button 
              onClick={validateFiles} 
              disabled={!connectionId || !filePath || !filePattern || loading}
              className="vm-btn vm-btn-secondary"
            >
              {loading ? 'Validating...' : 'Validate Files'}
            </button>
            {matchingFiles.length > 0 && (
              <span className="vm-validation-success">
                ✓ Found {matchingFiles.length} matching file(s)
              </span>
            )}
          </div>
          
          {matchingFiles.length > 0 && (
            <div className="vm-matching-files">
              <strong>Matching Files:</strong>
              <ul>
                {matchingFiles.slice(0, 5).map((file, idx) => (
                  <li key={idx}>{file}</li>
                ))}
                {matchingFiles.length > 5 && (
                  <li>... and {matchingFiles.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={!connectionId || !filePath || !filePattern}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SourceConfigModal;
