import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MappingConfigModal.css';

const SourceConfigModal = ({ isOpen, onClose, onSave, initialConfig = {} }) => {
  const [connectionId, setConnectionId] = useState(initialConfig.connectionId || '');
  const [filePath, setFilePath] = useState(initialConfig.filePath || '');
  const [filePattern, setFilePattern] = useState(initialConfig.filePattern || '*.csv');
  const [vendorAgreementId, setVendorAgreementId] = useState(initialConfig.vendorAgreementId || '');
  const [sourceFileOwnerId, setSourceFileOwnerId] = useState(initialConfig.sourceFileOwnerId || '');
  const [schemaDriftHandling, setSchemaDriftHandling] = useState(initialConfig.schemaDriftHandling || 'none');
  
  const [connections, setConnections] = useState([]);
  const [vendorAgreements, setVendorAgreements] = useState([]);
  const [datastewards, setDatastewards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [matchingFiles, setMatchingFiles] = useState([]);
  
  useEffect(() => {
    if (isOpen) {
      fetchConnections();
      fetchVendorAgreements();
      fetchDatastewards();
    }
  }, [isOpen]);
  
  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/connections');
      // Show all connections, no filtering
      setConnections(response.data || []);
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchVendorAgreements = async () => {
    try {
      const response = await axios.get('/api/vendor-agreements?status=active');
      setVendorAgreements(response.data || []);
    } catch (error) {
      console.error('Error fetching vendor agreements:', error);
    }
  };
  
  const fetchDatastewards = async () => {
    try {
      const response = await axios.get('/api/users/data-stewards');
      setDatastewards(response.data || []);
    } catch (error) {
      console.error('Error fetching data stewards:', error);
    }
  };
  
  const handleBrowse = async () => {
    if (!connectionId) {
      alert('Please select a connection first');
      return;
    }
    
    // This would open a file browser dialog
    // For now, we'll just trigger the validate files function
    validateFiles();
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
    const selectedAgreement = vendorAgreements.find(va => va.id === parseInt(vendorAgreementId));
    const selectedOwner = datastewards.find(ds => ds.id === parseInt(sourceFileOwnerId));
    
    const config = {
      connectionId,
      connectionName: selectedConnection?.name || '',
      connectionType: selectedConnection?.connection_type || '',
      filePath,
      filePattern,
      vendorAgreementId,
      vendorAgreementName: selectedAgreement?.agreement_name || '',
      sourceFileOwnerId,
      sourceFileOwnerName: selectedOwner?.full_name || selectedOwner?.username || '',
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
            <label>Vendor Contract</label>
            <select
              value={vendorAgreementId}
              onChange={(e) => setVendorAgreementId(e.target.value)}
              className="vm-select"
            >
              <option value="">Select Vendor Agreement (Optional)</option>
              {vendorAgreements.map(va => (
                <option key={va.id} value={va.id}>
                  {va.agreement_name} - {va.vendor_name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="vm-form-group">
            <label>Source File Owner</label>
            <select
              value={sourceFileOwnerId}
              onChange={(e) => setSourceFileOwnerId(e.target.value)}
              className="vm-select"
            >
              <option value="">Select File Owner (Optional)</option>
              {datastewards.map(ds => (
                <option key={ds.id} value={ds.id}>
                  {ds.full_name || ds.username}
                </option>
              ))}
            </select>
          </div>
          
          <div className="vm-form-group">
            <label>File Path, Name Pattern and Browse</label>
            <div className="vm-file-path-row">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="e.g., /data/raw/"
                className="vm-input vm-input-file-path"
              />
              <input
                type="text"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
                placeholder="*.csv"
                className="vm-input vm-input-file-pattern"
              />
              <button 
                onClick={handleBrowse}
                disabled={!connectionId || loading}
                className="vm-btn vm-btn-browse"
              >
                Browse
              </button>
            </div>
            <small className="vm-help-text">
              Path to the directory containing source files
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
          
          {matchingFiles.length > 0 && (
            <div className="vm-form-actions">
              <span className="vm-validation-success">
                ✓ Found {matchingFiles.length} matching file(s)
              </span>
            </div>
          )}
          
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
