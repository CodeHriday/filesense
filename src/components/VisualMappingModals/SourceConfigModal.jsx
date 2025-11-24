import React, { useState, useEffect } from 'react';
import axios from 'axios';
import FileBrowserModal from './FileBrowserModal';
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
  const [agreementFiles, setAgreementFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(initialConfig.agreementFileId || '');
  const [loading, setLoading] = useState(false);
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('configuration');
  const [schema, setSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      fetchConnections();
      fetchVendorAgreements();
      fetchDatastewards();
      // Reset to configuration tab when modal opens
      setActiveTab('configuration');
    }
  }, [isOpen]);
  
  const fetchAgreementFiles = async (agreementId, existingFileId, skipFilePatternUpdate = false) => {
    try {
      const response = await axios.get(`/api/vendor-agreements/${agreementId}/files`);
      const files = response.data.files || response.data || [];
      setAgreementFiles(files);
      
      // Only auto-populate if not reopening with saved data
      if (skipFilePatternUpdate) {
        // Just restore the selection, don't change filePattern
        return;
      }
      
      // Only auto-select first file if no existing selection
      if (files.length > 0 && !existingFileId) {
        const firstFile = files[0];
        setSelectedFileId(String(firstFile.id));
        // Auto-populate pattern from first file
        if (firstFile.file_name) {
          setFilePattern(firstFile.file_name);
        }
      } else if (existingFileId) {
        // Preserve existing selection but DON'T overwrite saved filePattern
        const existingFile = files.find(f => String(f.id) === String(existingFileId));
        if (existingFile && existingFile.file_name && !initialConfig.filePattern) {
          // Only set pattern if no saved pattern exists
          setFilePattern(existingFile.file_name);
        }
      }
    } catch (error) {
      console.error('Error fetching agreement files:', error);
      setAgreementFiles([]);
    }
  };
  
  // Auto-populate when vendor agreement is selected
  useEffect(() => {
    if (vendorAgreementId && vendorAgreements.length > 0) {
      const agreement = vendorAgreements.find(va => va.id === parseInt(vendorAgreementId));
      if (agreement) {
        console.log('Auto-populating from vendor agreement:', agreement);
        
        // Auto-populate connection - inject into connections list if missing
        if (agreement.vendor_connection_id) {
          const connectionIdStr = String(agreement.vendor_connection_id);
          setConnectionId(connectionIdStr);
          
          // Check if connection exists in list, if not add it
          const connectionExists = connections.some(c => 
            String(c.id || c.connection_id) === connectionIdStr
          );
          if (!connectionExists && agreement.vendor_connection_name) {
            setConnections(prev => [...prev, {
              id: connectionIdStr,
              connection_id: connectionIdStr,
              name: agreement.vendor_connection_name,
              connection_type: 'S3',
              type: 'S3'
            }]);
          }
        }
        
        // Auto-populate file path
        if (agreement.drop_location_path) {
          setFilePath(agreement.drop_location_path);
        }
        
        // Auto-populate file owner using primary_contact_name
        if (agreement.primary_contact_name) {
          // Create a synthetic ID based on the contact name
          const syntheticId = `contact_${agreement.id}`;
          setSourceFileOwnerId(syntheticId);
          
          // Inject primary contact into datastewards list
          const ownerExists = datastewards.some(ds => String(ds.id) === syntheticId);
          if (!ownerExists) {
            setDatastewards(prev => [...prev, {
              id: syntheticId,
              username: agreement.primary_contact_name,
              full_name: agreement.primary_contact_name,
              email: agreement.primary_contact_email || ''
            }]);
          }
        }
        
        // Fetch agreement files (pass existing selection to preserve it)
        // Include isOpen to ensure this runs when modal reopens with initialConfig
        const fileIdToPreserve = selectedFileId || initialConfig.agreementFileId;
        // Skip filePattern update when reopening with saved config
        const hasExistingConfig = initialConfig.filePattern && initialConfig.filePattern !== '*.csv';
        fetchAgreementFiles(agreement.id, fileIdToPreserve, hasExistingConfig);
      }
    } else {
      // Clear agreement files when no vendor contract selected
      setAgreementFiles([]);
      setSelectedFileId('');
      setSchema(null);
    }
  }, [vendorAgreementId, vendorAgreements, isOpen]);
  
  // Update file pattern when selected file changes
  // BUT don't overwrite if we're reopening with saved data
  useEffect(() => {
    if (selectedFileId && agreementFiles.length > 0) {
      const selectedFile = agreementFiles.find(f => String(f.id) === selectedFileId);
      if (selectedFile && selectedFile.file_name) {
        // Only update if we don't have a saved filePattern (i.e., not reopening modal)
        // Check if current filePattern is the default or matches what we're about to set
        if (!initialConfig.filePattern || initialConfig.filePattern === '*.csv' || filePattern === selectedFile.file_name) {
          setFilePattern(selectedFile.file_name);
        }
      }
    }
  }, [selectedFileId, agreementFiles]);
  
  // Fetch schema when agreement file is selected
  useEffect(() => {
    if (selectedFileId && vendorAgreementId) {
      fetchSchemaFromAgreement(selectedFileId);
    } else if (filePattern && connectionId && !vendorAgreementId) {
      // Infer schema from file when using direct connection
      inferSchemaFromFile();
    } else {
      setSchema(null);
    }
  }, [selectedFileId, vendorAgreementId, filePattern, connectionId]);
  
  const fetchSchemaFromAgreement = async (fileId) => {
    setSchemaLoading(true);
    try {
      const response = await axios.get(`/api/vendor-agreements/${vendorAgreementId}/file-schemas/${fileId}`);
      if (response.data.success && response.data.fileSchema) {
        setSchema({
          columns: response.data.fileSchema.schema || [],
          contains_pii: response.data.fileSchema.contains_pii,
          data_classification: response.data.fileSchema.data_classification,
          file_type: response.data.fileSchema.file_type,
          column_metadata: response.data.fileSchema.column_metadata || {},
          source: 'agreement'
        });
      }
    } catch (error) {
      console.error('Error fetching schema from agreement:', error);
      setSchema(null);
    } finally {
      setSchemaLoading(false);
    }
  };
  
  const inferSchemaFromFile = async () => {
    if (!connectionId || !filePath || !filePattern) return;
    
    setSchemaLoading(true);
    try {
      const response = await axios.post('/api/connections/infer-schema', {
        connection_id: connectionId,
        path: filePath,
        pattern: filePattern
      });
      if (response.data.success && response.data.schema) {
        setSchema({
          columns: response.data.schema,
          source: 'inferred'
        });
      }
    } catch (error) {
      console.error('Error inferring schema from file:', error);
      setSchema(null);
    } finally {
      setSchemaLoading(false);
    }
  };
  
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
  
  const handleBrowse = () => {
    if (!connectionId) {
      alert('Please select a connection first');
      return;
    }
    
    setFileBrowserOpen(true);
  };
  
  const handleFileBrowserSelect = (selection) => {
    setFilePath(selection.filePath);
    setFilePattern(selection.fileName);
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
    const selectedOwner = datastewards.find(ds => String(ds.id) === String(sourceFileOwnerId));
    const selectedFile = agreementFiles.find(f => String(f.id) === selectedFileId);
    
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
      matchingFilesCount: matchingFiles.length,
      // Include file metadata if from vendor agreement
      agreementFileId: selectedFileId || null,
      agreementFileName: selectedFile?.file_name || null,
      agreementFileDescription: selectedFile?.file_description || null,
      // Include schema for downstream propagation
      schema: schema?.columns || [],
      schemaMetadata: schema ? {
        contains_pii: schema.contains_pii,
        data_classification: schema.data_classification,
        file_type: schema.file_type,
        column_metadata: schema.column_metadata || {},
        source: schema.source
      } : null
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  // Determine if we should show file dropdown (vendor contract with files)
  const showFileDropdown = vendorAgreementId && agreementFiles.length > 0;
  
  // Show schema tab if schema is available
  const showSchemaTab = schema !== null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>Source Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        {/* Tab Navigation */}
        <div className="vm-tabs">
          <button 
            className={`vm-tab ${activeTab === 'configuration' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('configuration')}
          >
            Configuration
          </button>
          {showSchemaTab && (
            <button 
              className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
              onClick={() => setActiveTab('schema')}
            >
              Schema
            </button>
          )}
        </div>
        
        <div className="vm-modal-body">
          {/* Configuration Tab */}
          {activeTab === 'configuration' && (
            <>
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
          
          {/* Row 3: File Path, File Selection/Pattern, and Browse */}
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
                {vendorAgreementId ? 'Auto-populated from vendor contract' : 'Path to the directory containing source files'}
              </small>
            </div>
            
            {showFileDropdown ? (
              <div className="vm-form-group vm-form-group-no-margin">
                <label>Select File from Agreement</label>
                <select
                  value={selectedFileId}
                  onChange={(e) => setSelectedFileId(e.target.value)}
                  className="vm-select"
                >
                  <option value="">Select File</option>
                  {agreementFiles.map(file => (
                    <option key={file.id} value={file.id}>
                      {file.file_name} {file.file_description ? `- ${file.file_description}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
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
            )}
            
            <div className="vm-form-group vm-form-group-no-margin vm-form-group-browse">
              <label>&nbsp;</label>
              <button 
                onClick={handleBrowse}
                disabled={!connectionId || loading || !!vendorAgreementId}
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
            </>
          )}
          
          {/* Schema Tab */}
          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              {schemaLoading ? (
                <div className="vm-loading">Loading schema...</div>
              ) : schema ? (
                <>
                  <div className="vm-schema-meta">
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Source:</span>
                      <span className="vm-schema-value">
                        {schema.source === 'agreement' ? 'Vendor Agreement File Schema' : 'Inferred from File'}
                      </span>
                    </div>
                    {schema.file_type && (
                      <div className="vm-schema-meta-row">
                        <span className="vm-schema-label">File Type:</span>
                        <span className="vm-schema-value">{schema.file_type.toUpperCase()}</span>
                      </div>
                    )}
                    {schema.data_classification && (
                      <div className="vm-schema-meta-row">
                        <span className="vm-schema-label">Data Classification:</span>
                        <span className="vm-schema-value">{schema.data_classification}</span>
                      </div>
                    )}
                    {schema.contains_pii !== undefined && (
                      <div className="vm-schema-meta-row">
                        <span className="vm-schema-label">Contains PII:</span>
                        <span className="vm-schema-value">
                          {schema.contains_pii ? 'Yes' : 'No'}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="vm-schema-table-container">
                    <table className="vm-schema-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Column Name</th>
                          <th>Data Type</th>
                          <th>PII</th>
                          {schema.source === 'agreement' && <th>Description</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {schema.columns && schema.columns.length > 0 ? (
                          schema.columns.map((col, idx) => {
                            // Check if column is marked as PII
                            // PII can be in col.contains_pii, col.is_pii, or schema.column_metadata[col.column_name]?.contains_pii
                            const isPii = col.contains_pii || col.is_pii || 
                              (schema.column_metadata && schema.column_metadata[col.column_name || col.name]?.contains_pii);
                            
                            return (
                              <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td className="vm-schema-col-name">{col.column_name || col.name}</td>
                                <td className="vm-schema-col-type">{col.data_type || col.type}</td>
                                <td className="vm-schema-col-pii">
                                  {isPii ? (
                                    <span className="vm-pii-indicator vm-pii-yes">Yes</span>
                                  ) : (
                                    <span className="vm-pii-indicator vm-pii-no">No</span>
                                  )}
                                </td>
                                {schema.source === 'agreement' && (
                                  <td className="vm-schema-col-desc">{col.description || '-'}</td>
                                )}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={schema.source === 'agreement' ? 5 : 4} className="vm-empty-state">
                              No columns defined in schema
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="vm-schema-note">
                    <strong>Note:</strong> This schema is read-only. To modify the data structure, 
                    use the Expressions or Target Rules nodes in your mapping flow.
                  </div>
                </>
              ) : (
                <div className="vm-empty-state">No schema available</div>
              )}
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={!connectionId || !filePath || (!filePattern && !selectedFileId)}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
      
      {/* File Browser Modal */}
      {fileBrowserOpen && (
        <FileBrowserModal
          isOpen={fileBrowserOpen}
          onClose={() => setFileBrowserOpen(false)}
          onSelect={handleFileBrowserSelect}
          connectionId={connectionId}
          connectionName={connections.find(c => (c.id || c.connection_id) === connectionId)?.name || 'Connection'}
        />
      )}
    </div>
  );
};

export default SourceConfigModal;
