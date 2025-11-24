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
  
  // Auto-populate when vendor agreement is selected
  useEffect(() => {
    if (vendorAgreementId && vendorAgreements.length > 0) {
      const agreement = vendorAgreements.find(va => va.id === parseInt(vendorAgreementId));
      if (agreement) {
        console.log('Auto-populating from vendor agreement:', agreement);
        
        // Auto-populate connection, file path, file pattern, and file owner
        if (agreement.vendor_connection_id) {
          setConnectionId(String(agreement.vendor_connection_id));
        }
        if (agreement.drop_location_path) {
          setFilePath(agreement.drop_location_path);
        }
        if (agreement.file_name) {
          setFilePattern(agreement.file_name);
        }
        if (agreement.file_owner_user_id) {
          const ownerIdStr = String(agreement.file_owner_user_id);
          console.log('Setting file owner to:', ownerIdStr);
          setSourceFileOwnerId(ownerIdStr);
        }
      }
    }
  }, [vendorAgreementId, vendorAgreements]);
  
  const fetchConnections = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/connections');
      // Filter to only show source connections
      const sourceConnections = (response.data || []).filter(
        conn => !conn.connection_direction || conn.connection_direction === 'source'
      );
      setConnections(sourceConnections);
    } catch (error) {
      console.error('Error fetching connections:', error);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchVendorAgreements = async () => {
    try {
      const response = await axios.get('/api/vendor-agreements?status=active');
      const agreements = Array.isArray(response.data) ? response.data : (response.data.agreements || []);
      setVendorAgreements(agreements);
    } catch (error) {
      console.error('Error fetching vendor agreements:', error);
      setVendorAgreements([]);
    }
  };
  
  const fetchDatastewards = async () => {
    try {
      const response = await axios.get('/api/users/data-stewards');
      const users = Array.isArray(response.data) ? response.data : (response.data.users || []);
      setDatastewards(users);
    } catch (error) {
      console.error('Error fetching data stewards:', error);
      setDatastewards([]);
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
    const selectedConnection = connections.find(c => c.id === connectionId || c.connection_id === connectionId);
    const selectedAgreement = vendorAgreements.find(va => va.id === parseInt(vendorAgreementId));
    const selectedOwner = datastewards.find(ds => ds.id === parseInt(sourceFileOwnerId));
    
    const config = {
      connectionId,
      connectionName: selectedConnection?.name || '',
      connectionType: selectedConnection?.connection_type || selectedConnection?.type || '',
      filePath,
      filePattern,
      vendorAgreementId,
      vendorAgreementName: selectedAgreement?.agreement_name || selectedAgreement?.agreement_code || '',
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
          {/* Row 1: Vendor Contract and Source File Owner (side by side) */}
          <div className="vm-form-row-two-cols">
            <div className="vm-form-group">
              <label>Vendor Contract</label>
              <select
                value={vendorAgreementId}
                onChange={(e) => setVendorAgreementId(e.target.value)}
                className="vm-select"
              >
                <option value="">Select Vendor Contract (Optional)</option>
                {vendorAgreements.map(va => (
                  <option key={va.id} value={va.id}>
                    {va.vendor_name} - {va.agreement_code || va.agreement_name}
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
          </div>
          
          {/* Row 2: Source Connection (full width) */}
          <div className="vm-form-group">
            <label>Source Connection *</label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="vm-select"
              disabled={!!vendorAgreementId}
            >
              <option value="">Select Connection</option>
              {connections.map(c => (
                <option key={c.id || c.connection_id} value={c.id || c.connection_id}>
                  {c.name} ({c.connection_type || c.type})
                </option>
              ))}
            </select>
            {vendorAgreementId && (
              <small className="vm-help-text">
                Auto-populated from vendor contract
              </small>
            )}
          </div>
          
          {/* Row 3: File Path, Name Pattern, and Browse (with individual labels) */}
          <div className="vm-form-row-file-path">
            <div className="vm-form-group vm-form-group-no-margin">
              <label>File Path</label>
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
            
            <div className="vm-form-group vm-form-group-no-margin">
              <label>File Name Pattern</label>
              <input
                type="text"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
                placeholder="*.csv"
                className="vm-input"
              />
            </div>
            
            <div className="vm-form-group vm-form-group-no-margin vm-form-group-browse">
              <label>&nbsp;</label>
              <button 
                onClick={handleBrowse}
                disabled={!connectionId || loading}
                className="vm-btn vm-btn-browse"
              >
                Browse
              </button>
            </div>
          </div>
          
          {/* Row 4: Schema Drift Handling (full width) */}
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
