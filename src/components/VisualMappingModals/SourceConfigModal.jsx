import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import FileBrowserModal from './FileBrowserModal';
import './MappingConfigModal.css';
import PropTypes from 'prop-types';

const SourceConfigModal = ({ isOpen, onClose, onSave, initialConfig = {} }) => {
  // Use ref to track if we have a saved file pattern - this won't trigger re-renders
  const hasSavedFilePatternRef = useRef(false);
  
  // Track whether the modal has been initialized from initialConfig
  // This prevents the vendor agreement useEffect from clearing state before hydration completes
  const hasInitializedRef = useRef(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [filePath, setFilePath] = useState('');
  const [filePattern, setFilePattern] = useState('*.csv');
  const [vendorAgreementId, setVendorAgreementId] = useState('');
  const [sourceFileOwnerId, setSourceFileOwnerId] = useState('');
  const [schemaDriftHandling, setSchemaDriftHandling] = useState('none');
  
  const [connections, setConnections] = useState([]);
  const [vendorAgreements, setVendorAgreements] = useState([]);
  const [datastewards, setDatastewards] = useState([]);
  const [agreementFiles, setAgreementFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [selectedFileType, setSelectedFileType] = useState('');
  const [hasArchivePassword, setHasArchivePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('configuration');
  const [schema, setSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  
  // Track the pending vendor agreement ID that needs to be processed after agreements load
  const pendingVendorAgreementRef = useRef(null);
  
  // Initialize state from initialConfig when modal opens
  useEffect(() => {
    if (isOpen) {
      // Restore all state from initialConfig
      setName(initialConfig.name || '');
      setDescription(initialConfig.description || '');
      setConnectionId(initialConfig.connectionId || '');
      setFilePath(initialConfig.filePath || '');
      setFilePattern(initialConfig.filePattern || '*.csv');
      setVendorAgreementId(initialConfig.vendorAgreementId || '');
      setSourceFileOwnerId(initialConfig.sourceFileOwnerId || '');
      setSchemaDriftHandling(initialConfig.schemaDriftHandling || 'none');
      setSelectedFileId(initialConfig.agreementFileId || '');
      
      // Restore file type and password status from saved config
      setSelectedFileType(initialConfig.schemaMetadata?.file_type || initialConfig.selectedFileType || '');
      setHasArchivePassword(initialConfig.hasArchivePassword || false);
      
      // Track if this is reopening with saved data
      hasSavedFilePatternRef.current = !!(initialConfig.filePattern && initialConfig.filePattern !== '*.csv');
      
      // Track if we have a pending vendor agreement to process after agreements load
      pendingVendorAgreementRef.current = initialConfig.vendorAgreementId || null;
      
      fetchConnections();
      fetchVendorAgreements();
      fetchDatastewards();
      // Reset to configuration tab when modal opens
      setActiveTab('configuration');
      setValidationError('');
      
      // Restore schema from saved config if available
      if (initialConfig.schema && initialConfig.schemaMetadata) {
        setSchema({
          columns: initialConfig.schema,
          ...initialConfig.schemaMetadata
        });
        console.log('Restored schema from saved config:', {
          columns: initialConfig.schema.length,
          source: initialConfig.schemaMetadata.source
        });
      }
      
      console.log('Modal opened - restored state from initialConfig:', {
        hasFilePattern: hasSavedFilePatternRef.current,
        filePattern: initialConfig.filePattern,
        selectedFileId: initialConfig.agreementFileId,
        hasSchema: !!initialConfig.schema,
        schemaLength: initialConfig.schema?.length,
        fileType: initialConfig.schemaMetadata?.file_type,
        hasPassword: initialConfig.hasArchivePassword
      });
      
      // Mark as initialized AFTER all state is set - this prevents premature clearing
      hasInitializedRef.current = true;
    } else {
      // Reset initialization flag when modal closes
      hasInitializedRef.current = false;
    }
  }, [isOpen]);
  
  const fetchAgreementFiles = async (agreementId, existingFileId) => {
    try {
      const response = await axios.get(`/api/vendor-agreements/${agreementId}/files`);
      const files = response.data.files || response.data || [];
      setAgreementFiles(files);
      
      // NEVER auto-populate pattern if we're reopening with saved data
      if (hasSavedFilePatternRef.current) {
        console.log('Skipping filePattern auto-populate - has saved pattern');
        return;
      }
      
      // Only auto-select first file if no existing selection
      if (files.length > 0 && !existingFileId) {
        const firstFile = files[0];
        setSelectedFileId(String(firstFile.id));
        // Auto-populate pattern from first file
        if (firstFile.file_name) {
          console.log('Auto-populating filePattern from first file:', firstFile.file_name);
          setFilePattern(firstFile.file_name);
        }
      }
    } catch (error) {
      console.error('Error fetching agreement files:', error);
      setAgreementFiles([]);
    }
  };
  
  // Process vendor agreement - either from state change or after agreements load
  const processVendorAgreement = (agreementId, agreements) => {
    const agreement = agreements.find(va => va.id === parseInt(agreementId));
    if (!agreement) return;
    
    console.log('Auto-populating from vendor agreement:', agreement);
    
    // Auto-populate connection - inject into connections list if missing
    if (agreement.vendor_connection_id) {
      const connectionIdStr = String(agreement.vendor_connection_id);
      setConnectionId(connectionIdStr);
      
      // Check if connection exists in list, if not add it
      setConnections(prev => {
        const connectionExists = prev.some(c => 
          String(c.id || c.connection_id) === connectionIdStr
        );
        if (!connectionExists && agreement.vendor_connection_name) {
          return [...prev, {
            id: connectionIdStr,
            connection_id: connectionIdStr,
            name: agreement.vendor_connection_name,
            connection_type: 'S3',
            type: 'S3'
          }];
        }
        return prev;
      });
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
      setDatastewards(prev => {
        const ownerExists = prev.some(ds => String(ds.id) === syntheticId);
        if (!ownerExists) {
          return [...prev, {
            id: syntheticId,
            username: agreement.primary_contact_name,
            full_name: agreement.primary_contact_name,
            email: agreement.primary_contact_email || ''
          }];
        }
        return prev;
      });
    }
    
    // Fetch agreement files (pass existing selection to preserve it)
    const fileIdToPreserve = selectedFileId || initialConfig.agreementFileId;
    fetchAgreementFiles(agreement.id, fileIdToPreserve);
  };
  
  // Single unified useEffect to handle vendor agreement processing
  // This prevents the race condition where two useEffects would both call processVendorAgreement
  useEffect(() => {
    // CRITICAL: Don't run this effect until the modal has been initialized from initialConfig
    // This prevents premature clearing of state before hydration completes
    if (!hasInitializedRef.current) {
      console.log('Skipping vendor agreement effect - modal not yet initialized');
      return;
    }
    
    // Case 1: We have a pending agreement from initialConfig that needs processing
    if (pendingVendorAgreementRef.current && vendorAgreements.length > 0) {
      const pendingId = pendingVendorAgreementRef.current;
      pendingVendorAgreementRef.current = null; // Clear pending to prevent re-processing
      console.log('Processing pending vendor agreement after load:', pendingId);
      processVendorAgreement(pendingId, vendorAgreements);
      return; // Exit early - we've handled the pending agreement
    }
    
    // Case 2: User manually selected a vendor agreement (not from initialConfig)
    // Only run if there's no pending ref (meaning initialConfig was already processed or didn't have one)
    if (pendingVendorAgreementRef.current === null && vendorAgreementId && vendorAgreements.length > 0) {
      processVendorAgreement(vendorAgreementId, vendorAgreements);
    } else if (!vendorAgreementId && vendorAgreements.length > 0) {
      // Case 3: User deselected vendor agreement - clear related state
      // Only run if vendorAgreements has loaded (to avoid clearing on initial mount)
      setAgreementFiles([]);
      setSelectedFileId('');
      setSchema(null);
    }
    // When vendorAgreementId is set but vendorAgreements hasn't loaded yet, do nothing - wait for it to load
  }, [vendorAgreementId, vendorAgreements]);
  
  // Update file pattern, file type, and password status when selected file changes
  // BUT NEVER overwrite pattern if we have a saved pattern
  useEffect(() => {
    if (selectedFileId && agreementFiles.length > 0) {
      const selectedFile = agreementFiles.find(f => String(f.id) === selectedFileId);
      if (selectedFile) {
        // Update file type and password status from fresh API data
        setSelectedFileType(selectedFile.file_type || '');
        setHasArchivePassword(selectedFile.has_archive_password || false);
        
        // Update file pattern (only if not reopening with saved data)
        if (!hasSavedFilePatternRef.current && selectedFile.file_name) {
          console.log('Updating filePattern from selectedFileId:', selectedFile.file_name);
          setFilePattern(selectedFile.file_name);
        }
        
        console.log('File selected from agreement:', {
          fileId: selectedFileId,
          fileType: selectedFile.file_type,
          hasPassword: selectedFile.has_archive_password,
          fileName: selectedFile.file_name
        });
      }
    } else if (!selectedFileId) {
      // Only clear file-specific state when no file is explicitly selected
      // Do NOT clear when agreementFiles is still loading (empty array but selectedFileId is set)
      setSelectedFileType('');
      setHasArchivePassword(false);
    }
    // When selectedFileId is set but agreementFiles hasn't loaded yet, keep the restored values from initialConfig
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
      setConnections(response.data || []);
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
    if (!name.trim()) {
      setValidationError('Name is required');
      return;
    }
    if (!connectionId) {
      setValidationError('Source Connection is required');
      return;
    }
    if (!filePath.trim()) {
      setValidationError('File Path is required');
      return;
    }
    
    setValidationError('');
    const selectedConnection = connections.find(c => c.id === connectionId || c.connection_id === connectionId);
    const selectedAgreement = vendorAgreements.find(va => va.id === parseInt(vendorAgreementId));
    const selectedOwner = datastewards.find(ds => String(ds.id) === String(sourceFileOwnerId));
    const selectedFile = agreementFiles.find(f => String(f.id) === selectedFileId);
    
    // Derive filePattern from selected agreement file if available, otherwise use state
    // This ensures we always use the correct pattern even if state update hasn't propagated
    const effectiveFilePattern = (selectedFile && selectedFile.file_name) 
      ? selectedFile.file_name 
      : filePattern;
    
    const config = {
      name,
      description,
      connectionId,
      connectionName: selectedConnection?.name || '',
      connectionType: selectedConnection?.connection_type || selectedConnection?.type || '',
      filePath,
      filePattern: effectiveFilePattern,
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
      // Include file type and password status for restoration (only save hasArchivePassword when true)
      selectedFileType: selectedFileType || null,
      hasArchivePassword: hasArchivePassword === true ? true : undefined,
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
    console.log('Saving Source Configuration with schema:', { 
      schemaColumnsCount: schema?.columns?.length || 0, 
      schema: schema?.columns,
      config 
    });
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  // Determine if we should show file dropdown (vendor contract with files)
  const showFileDropdown = vendorAgreementId && agreementFiles.length > 0;
  
  // Show schema tab if schema is available
  const showSchemaTab = schema !== null;
  
  return (
    <div className="vm-modal-overlay">
      <div className="vm-modal vm-modal-large">
        <div className="vm-modal-header">
          <h2>Source Configuration</h2>
          <button onClick={onClose} className="vm-modal-close" aria-label="Close modal">×</button>
        </div>
        
        {/* Tab Navigation */}
        <div className="vm-tabs">
          <button 
            className={`vm-tab ${activeTab === 'configuration' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('configuration')}
            aria-pressed={activeTab === 'configuration'}
            aria-label="Configuration tab"
          >
            Configuration
          </button>
          {showSchemaTab && (
            <button 
              className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
              onClick={() => setActiveTab('schema')}
              aria-pressed={activeTab === 'schema'}
              aria-label="Schema tab"
            >
              Schema
            </button>
          )}
        </div>
        
        <div className="vm-modal-body">
          {/* Configuration Tab */}
          {activeTab === 'configuration' && (
            <>
          {validationError && (
            <div className="vm-validation-error" role="alert" style={{ marginBottom: '16px', padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', color: '#dc2626', fontSize: '13px' }}>
              {validationError}
            </div>
          )}
          {/* Name and Description Fields */}
          <div className="vm-form-group">
            <label htmlFor="source-name-input">Name *</label>
            <input
              id="source-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this source configuration"
              className="vm-input"
              required
            />
          </div>
          
          <div className="vm-form-group">
            <label htmlFor="source-description">Description</label>
            <textarea
              id="source-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="vm-input"
              rows="2"
            />
          </div>
          
          {/* Row 1: Vendor Contract and Source File Owner (side by side) */}
          <div className="vm-form-row-two-cols">
            <div className="vm-form-group">
              <label htmlFor="vendor-agreement-select">Vendor Contract</label>
              <select
                id="vendor-agreement-select"
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
              <label htmlFor="source-file-owner-select">Source File Owner</label>
              <select
                id="source-file-owner-select"
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
            <label htmlFor="connection-select">Source Connection *</label>
            <select
              id="connection-select"
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
              <label htmlFor="file-path-input">File Path</label>
              <input
                id="file-path-input"
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
                <label htmlFor="agreement-file-select">Select File from Agreement</label>
                <select
                  id="agreement-file-select"
                  value={selectedFileId}
                  onChange={(e) => {
                    const newFileId = e.target.value;
                    setSelectedFileId(newFileId);
                    // Reset saved pattern flag when user explicitly selects a different file
                    // This allows filePattern to update to the newly selected file
                    if (newFileId) {
                      hasSavedFilePatternRef.current = false;
                    }
                  }}
                  className="vm-select"
                >
                  <option value="">Select File</option>
                  {agreementFiles.map(file => (
                    <option key={file.id} value={String(file.id)}>
                      {file.file_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="vm-form-group vm-form-group-no-margin">
                <label htmlFor="file-pattern-input">File Name Pattern</label>
                <input
                  id="file-pattern-input"
                  type="text"
                  value={filePattern}
                  onChange={(e) => setFilePattern(e.target.value)}
                  placeholder="*.csv"
                  className="vm-input"
                />
              </div>
            )}
            
            {/* File Type - shown when vendor contract is selected */}
            {showFileDropdown && (
              <div className="vm-form-group vm-form-group-no-margin" style={{ minWidth: '100px', maxWidth: '120px' }}>
                <label htmlFor="file-type-input">File Type</label>
                <input
                  id="file-type-input"
                  type="text"
                  value={selectedFileType ? selectedFileType.toUpperCase() : '-'}
                  readOnly
                  className="vm-input"
                  style={{ 
                    backgroundColor: '#f8f9fa', 
                    cursor: 'default',
                    fontWeight: 500,
                    textAlign: 'center'
                  }}
                />
              </div>
            )}
            
            <div className="vm-form-group vm-form-group-no-margin vm-form-group-browse">
              <label htmlFor="browse-button" className="sr-only">Browse files</label>
              <button 
                id="browse-button"
                onClick={handleBrowse}
                disabled={!connectionId || loading || !!vendorAgreementId}
                className="vm-btn vm-btn-browse"
                aria-label="Browse files in selected connection"
              >
                Browse
              </button>
            </div>
          </div>
          
          {/* File Type Indicators - shown below file path row when applicable */}
          {showFileDropdown && selectedFileId && (selectedFileType || hasArchivePassword) && (
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap',
              gap: '0.75rem', 
              marginTop: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              {/* Password Protected indicator for archive files */}
              {hasArchivePassword && ['zip', '7z', 'tar', 'gz'].some(ext => 
                selectedFileType?.toLowerCase() === ext || filePattern?.toLowerCase().endsWith(`.${ext}`)
              ) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  color: '#92400e'
                }}>
                  <span style={{ fontSize: '12px' }}>🔒</span>
                  <span style={{ fontWeight: 500 }}>Password Protected</span>
                  <span style={{ color: '#b45309' }}>- Password configured in contract</span>
                </div>
              )}
              
              {/* Fixed-Width Schema indicator */}
              {['dat', 'bdat'].some(ext => 
                selectedFileType?.toLowerCase() === ext || 
                filePattern?.toLowerCase().endsWith(`.${ext}`)
              ) && schema && schema.source === 'agreement' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  background: '#dbeafe',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  color: '#1e40af'
                }}>
                  <span style={{ fontSize: '12px' }}>📋</span>
                  <span style={{ fontWeight: 500 }}>Fixed-Width Schema</span>
                  <span style={{ color: '#1d4ed8' }}>- {schema.columns?.length || 0} columns from contract</span>
                </div>
              )}
            </div>
          )}
          
          {/* Row 4: Schema Drift Handling (full width) */}
          <div className="vm-form-group">
            <label htmlFor="schema-drift-select">Schema Drift Handling</label>
            <select
              id="schema-drift-select"
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
                            // PII can be in col.contains_pii, col.is_pii, col.pii, or schema.column_metadata[col.column_name]?.contains_pii
                            const isPii = col.contains_pii || col.is_pii || col.pii || 
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


SourceConfigModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,

  initialConfig: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    connectionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    connectionName: PropTypes.string,
    connectionType: PropTypes.string,

    filePath: PropTypes.string,
    filePattern: PropTypes.string,

    vendorAgreementId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    vendorAgreementName: PropTypes.string,

    sourceFileOwnerId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    sourceFileOwnerName: PropTypes.string,

    schemaDriftHandling: PropTypes.oneOf(['none', 'alert', 'abort']),

    agreementFileId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    agreementFileName: PropTypes.string,
    agreementFileDescription: PropTypes.string,

    selectedFileType: PropTypes.string,
    hasArchivePassword: PropTypes.bool,

    schema: PropTypes.arrayOf(
      PropTypes.shape({
        column_name: PropTypes.string,
        name: PropTypes.string,
        data_type: PropTypes.string,
        type: PropTypes.string,
        description: PropTypes.string,
        contains_pii: PropTypes.bool,
        pii: PropTypes.bool
      })
    ),

    schemaMetadata: PropTypes.shape({
      contains_pii: PropTypes.bool,
      data_classification: PropTypes.string,
      file_type: PropTypes.string,
      column_metadata: PropTypes.object,
      source: PropTypes.oneOf(['agreement', 'inferred'])
    })
  })
};

SourceConfigModal.defaultProps = {
  initialConfig: {}
};

export default SourceConfigModal;
