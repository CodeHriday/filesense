import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FiUpload, FiCheckCircle, FiLoader, FiChevronDown, FiChevronRight, FiFile, FiDatabase, FiAlertCircle } from 'react-icons/fi';
import FileDropzone from '../components/FileDropzone';
import S3FolderBrowser from '../components/S3FolderBrowser';
import StepProgress from '../components/StepProgress';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import '../styles/VendorFileUpload.css';

// Map file type values to friendly display labels
const FILE_TYPE_LABELS = {
  'csv': 'CSV',
  'xlsx': 'Excel (XLSX)',
  'json': 'JSON',
  'xml': 'XML',
  'parquet': 'Parquet',
  'dat': 'Fixed Width (.dat)',
  'bin': 'Binary (.bin)',
  'bdat': 'Fixed Width Binary (.bdat)',
  'fixed_width': 'Fixed Width (.dat)',
  'binary': 'Binary (.bin)',
  'sas7bdat': 'SAS Dataset',
  'avro': 'Avro',
  'zip': 'ZIP Archive',
  '7z': '7z Archive',
  'tar': 'TAR Archive',
  'tar.gz': 'TAR.GZ Archive',
  'tar.bz2': 'TAR.BZ2 Archive'
};

const getFileTypeLabel = (fileType) => {
  if (!fileType) return '';
  return FILE_TYPE_LABELS[fileType] || fileType.toUpperCase();
};

function VendorFileUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const [vendorAgreements, setVendorAgreements] = useState([]);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [diagnosticInfo, setDiagnosticInfo] = useState('');
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [uploadStage, setUploadStage] = useState(null); // uploading | scanning | processing
  const [uploadProgress, setUploadProgress] = useState(0);
  const [schemaValidationError, setSchemaValidationError] = useState(null);
  const [filenameValidationError, setFilenameValidationError] = useState(null);
  const [fileSchemas, setFileSchemas] = useState([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [uploadingFiles, setUploadingFiles] = useState([]);

  const { hasWritePermission } = useAuth();
  const { addToast } = useToast();

  // Load file schemas when an agreement is selected
  useEffect(() => {
    const loadFileSchemas = async () => {
      if (!selectedAgreement) {
        setFileSchemas([]);
        setExpandedSchemas({});
        return;
      }
      
      setLoadingSchemas(true);
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_BASE_URL}/api/vendor-agreements/${selectedAgreement}/file-schemas`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setFileSchemas(response.data.fileSchemas || []);
      } catch (error) {
        console.error('Error loading file schemas:', error);
        setFileSchemas([]);
      } finally {
        setLoadingSchemas(false);
      }
    };
    
    loadFileSchemas();
  }, [selectedAgreement]);

  // Toggle schema expansion
  const toggleSchemaExpansion = (schemaId) => {
    setExpandedSchemas(prev => ({
      ...prev,
      [schemaId]: !prev[schemaId]
    }));
  };

  // Load vendor agreements on demand
  // Uses filterByMyVendor=true to only show agreements for the user's own vendor organization
  const loadVendorContracts = async () => {
    setLoadingAgreements(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/vendor-agreements?pageSize=1000&filterByMyVendor=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const agreements = response.data.agreements || [];
      // Only show approved and locked agreements for file upload
      const approvedAgreements = agreements.filter(a => 
        a.approval_status === 'governance_approved' && a.is_locked === true
      );
      setVendorAgreements(approvedAgreements);
    } catch (error) {
      console.error('Error loading vendor agreements:', error);
      setVendorAgreements([]);
    } finally {
      setLoadingAgreements(false);
    }
  };

  const handleDropFile = async (file, progressHandler) => {
    // Clear any previous validation errors
    setSchemaValidationError(null);
    setFilenameValidationError(null);
    
    // Validate selections
    if (!selectedAgreement) {
      setUploadStatus('error');
      setDiagnosticInfo('Please select a vendor agreement before uploading\n');
      addToast('error', 'Selection Required', 'Please select a vendor agreement before uploading');
      throw new Error('Agreement selection required');
    }
    
    const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
    if (!agreement || !agreement.vendor_connection_id) {
      setUploadStatus('error');
      setDiagnosticInfo('Selected agreement does not have a configured connection\n');
      addToast('error', 'Configuration Error', 'Selected agreement does not have a configured connection');
      throw new Error('Agreement connection not configured');
    }
    
    try {
      // Upload file with original filename (no renaming)
      setDiagnosticInfo(`Starting upload for ${file.name} to agreement ${agreement.agreement_code}...\n`);
      setUploadStatus('uploading');
      setUploadStage('uploading');
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      
      // Build URL with connection, agreement, and folder parameters
      let uploadUrl = `${API_BASE_URL}/api/files/drop?connectionId=${encodeURIComponent(agreement.vendor_connection_id)}&agreementId=${encodeURIComponent(agreement.id)}`;
      if (selectedFolder) {
        uploadUrl += `&folder=${encodeURIComponent(selectedFolder)}`;
      } else if (agreement.drop_location_path) {
        uploadUrl += `&folder=${encodeURIComponent(agreement.drop_location_path)}`;
      }
      
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
          
          // When upload reaches 100%, transition to scanning stage
          if (percentCompleted === 100) {
            setUploadStage('scanning');
          }
          
          if (progressHandler) {
            progressHandler(progressEvent);
          }
        }
      });
      
      // Move to complete stage on successful response
      setUploadStage('complete');
      setDiagnosticInfo(prev => prev + `Upload successful: ${JSON.stringify(response.data, null, 2)}\n`);
      
      const fileDetails = {
        fileId: response.data.fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        s3Location: response.data.file?.storage_location || response.data.file?.s3_location,
        virusScan: response.data.virusScan
      };
      
      setUploadedFile(fileDetails);
      
      // Process immediate virus scan result (scan is synchronous)
      const virusScan = response.data.virusScan;
      
      if (virusScan && virusScan.scanned && virusScan.clean) {
        // File passed virus scan - keep 'complete' stage visible
        setUploadStatus('success');
        setShowSuccessNotification(true);
        
        const scanMessage = virusScan.skipped 
          ? 'File uploaded successfully! (Virus scan skipped - definitions unavailable)'
          : 'File uploaded and passed virus scan successfully!';
        
        addToast('success', 'Upload Complete', scanMessage);
        
        // Dispatch event to notify other components/tabs to refresh
        window.dispatchEvent(new CustomEvent('vendorFileUploaded', { 
          detail: { fileId: fileDetails.fileId, fileName: fileDetails.fileName }
        }));
        
        // Hide notification after 8 seconds, but keep progress bar visible
        setTimeout(() => {
          setShowSuccessNotification(false);
        }, 8000);
        
      } else if (virusScan && virusScan.scanned && !virusScan.clean) {
        // File failed virus scan (this shouldn't happen as server rejects infected files)
        setUploadStatus('error');
        setUploadStage(null);
        addToast('error', 'Upload Failed', 'File failed virus scan.');
        
      } else {
        // No virus scan data or scan failed - treat as success with warning, keep 'complete' stage visible
        setUploadStatus('success');
        setShowSuccessNotification(true);
        addToast('warning', 'Upload Complete', virusScan?.message || 'File uploaded but virus scan status is unknown.');
        
        // Dispatch event to notify other components/tabs to refresh
        window.dispatchEvent(new CustomEvent('vendorFileUploaded', { 
          detail: { fileId: fileDetails.fileId, fileName: fileDetails.fileName }
        }));
        
        setTimeout(() => {
          setShowSuccessNotification(false);
        }, 8000);
      }
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setDiagnosticInfo(prev => prev + `Upload error: ${error.message}\n`);
      if (error.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(error.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
      setUploadStage(null);
      
      // Check if this is a file pattern validation error (new detailed format)
      if (error.response?.data?.error === 'File pattern validation failed' && error.response?.data?.details) {
        setFilenameValidationError(error.response.data.details);
        addToast('error', 'File Pattern Validation Failed', error.response.data.message || 'The uploaded file does not match the expected pattern for this contract.');
      }
      // Check if this is a filename pattern validation error (legacy format)
      else if (error.response?.data?.error === 'Filename pattern validation failed' && error.response?.data?.details) {
        setFilenameValidationError(error.response.data.details);
        addToast('error', 'Filename Validation Failed', 'The uploaded filename does not match the expected pattern. See details below.');
      }
      // Check if this is a schema validation error
      else if (error.response?.data?.error === 'Schema validation failed' && error.response?.data?.details) {
        setSchemaValidationError(error.response.data.details);
        addToast('error', 'Schema Validation Failed', 'The uploaded file does not match the expected schema. See details below.');
      } else {
        setSchemaValidationError(null);
        setFilenameValidationError(null);
        const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
        addToast('error', 'Upload Failed', errorMessage);
      }
      
      throw error;
    }
  };

  const handleUploadAnother = () => {
    setUploadStatus(null);
    setUploadedFile(null);
    setDiagnosticInfo('');
    setDropzoneKey(prev => prev + 1);
    setShowSuccessNotification(false);
    setUploadStage(null);
    setUploadProgress(0);
    setSchemaValidationError(null);
    setFilenameValidationError(null);
    setUploadingFiles([]);
  };
  
  const handleFilesChange = useCallback((files) => {
    setUploadingFiles(files);
  }, []);

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Vendor File Upload</h1>
          <p className="gps-page-subtitle">Upload files directly to S3 storage without profiling or analysis. Quick uploads for raw file storage.</p>
        </div>
      </div>

      {/* Success Notification */}
      {showSuccessNotification && uploadedFile && (
        <div className="gps-alert gps-alert--success" style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          borderRadius: '6px',
          border: '1px solid var(--gps-success-green, #38a169)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem' 
          }}>
            <FiCheckCircle style={{ 
              color: 'var(--gps-success-green, #38a169)', 
              fontSize: '24px',
              flexShrink: 0
            }} />
            <div>
              <strong style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '13px',
                fontWeight: 600,
                color: '#166534',
                display: 'block',
                marginBottom: '0.25rem'
              }}>
                File Uploaded Successfully!
              </strong>
              <p style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '11px',
                color: '#166534',
                margin: 0
              }}>
                Your file has been uploaded to S3 storage.
              </p>
            </div>
          </div>
          <Link 
            to="/vendor-file-quality" 
            className="gps-btn gps-btn--primary"
            style={{ 
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '11px',
              padding: '0.5rem 1rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            View in Vendor File Catalog →
          </Link>
        </div>
      )}

      {/* Filename Validation Error Display */}
      {filenameValidationError && (
        <div className="gps-alert gps-alert--error" style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          borderRadius: '6px',
          border: '1px solid #fecaca'
        }}>
          <h3 style={{ 
            fontFamily: 'Inter, system-ui, sans-serif',
            color: 'var(--gps-danger-red, #e53e3e)', 
            marginTop: 0, 
            marginBottom: '0.875rem',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.01em'
          }}>
            File Pattern Validation Failed
          </h3>
          
          <div style={{ 
            background: 'white', 
            padding: '0.875rem', 
            borderRadius: '4px',
            marginBottom: '0.875rem',
            border: '1px solid #fecaca'
          }}>
            {filenameValidationError.contractCode && (
              <div style={{ marginBottom: '0.625rem' }}>
                <strong style={{ 
                  fontFamily: 'Inter, system-ui, sans-serif',
                  color: 'var(--gps-text-dark, #333333)', 
                  display: 'block', 
                  marginBottom: '0.25rem',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  Contract:
                </strong>
                <span style={{ 
                  fontFamily: 'Inter, system-ui, sans-serif',
                  color: 'var(--gps-text-muted, #666666)', 
                  fontSize: '11px' 
                }}>
                  {filenameValidationError.contractCode}
                </span>
              </div>
            )}

            <div style={{ marginBottom: '0.625rem' }}>
              <strong style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--gps-danger-red, #e53e3e)', 
                display: 'block', 
                marginBottom: '0.25rem',
                fontSize: '11px',
                fontWeight: 600
              }}>
                Uploaded File:
              </strong>
              <code style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                background: '#fee2e2', 
                padding: '3px 6px', 
                borderRadius: '3px',
                fontSize: '10px',
                color: '#991b1b',
                display: 'inline-block'
              }}>
                {filenameValidationError.uploadedFile || `${filenameValidationError.actualBase}${filenameValidationError.actualExt}`}
              </code>
            </div>

            <div>
              <strong style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--gps-text-dark, #333333)', 
                display: 'block', 
                marginBottom: '0.375rem',
                fontSize: '11px',
                fontWeight: 600
              }}>
                Expected File Patterns ({filenameValidationError.patternCount || filenameValidationError.expectedPatterns?.length || 0}):
              </strong>
              <ul style={{ 
                margin: '0 0 0 1.25rem', 
                padding: 0,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--gps-text-muted, #666666)'
              }}>
                {filenameValidationError.expectedPatterns?.map((pattern, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem', fontSize: '11px' }}>
                    <code style={{ 
                      fontFamily: 'Inter, system-ui, sans-serif',
                      background: '#dcfce7', 
                      padding: '2px 5px', 
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: '#166534'
                    }}>
                      {pattern}
                    </code>
                  </li>
                )) || (
                  <li style={{ fontSize: '11px' }}>
                    <code style={{ 
                      fontFamily: 'Inter, system-ui, sans-serif',
                      background: '#dcfce7', 
                      padding: '2px 5px', 
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: '#166534'
                    }}>
                      {filenameValidationError.expectedBase}{filenameValidationError.expectedExt}
                    </code>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="gps-alert gps-alert--warning" style={{ 
            padding: '0.625rem 0.75rem',
            borderRadius: '4px',
            fontSize: '10px',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            <strong style={{ fontWeight: 600 }}>Tip: </strong>
            File patterns may include wildcards: * (matches any characters) and ? (matches single character). 
            Your filename must match at least one of the patterns listed above for this contract.
          </div>
        </div>
      )}

      {/* Schema Validation Error Display */}
      {schemaValidationError && (
        <div className="gps-alert gps-alert--error" style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          borderRadius: '6px',
          border: '1px solid #fecaca'
        }}>
          <h3 style={{ 
            fontFamily: 'Inter, system-ui, sans-serif',
            color: 'var(--gps-danger-red, #e53e3e)', 
            marginTop: 0, 
            marginBottom: '0.875rem',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.01em'
          }}>
            Schema Validation Failed
          </h3>
          
          <p style={{ 
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#991b1b', 
            marginBottom: '0.875rem',
            fontSize: '11px'
          }}>
            The uploaded file does not match the expected schema defined in the vendor agreement. Please correct the following issues:
          </p>

          {/* Missing Columns */}
          {schemaValidationError.missingColumns && schemaValidationError.missingColumns.length > 0 && (
            <div style={{ marginBottom: '0.875rem' }}>
              <h4 style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--gps-danger-red, #e53e3e)', 
                fontSize: '11px', 
                marginBottom: '0.375rem',
                fontWeight: 600
              }}>
                Missing Required Columns ({schemaValidationError.missingColumns.length})
              </h4>
              <ul style={{ 
                margin: '0 0 0 1.25rem', 
                padding: 0,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#991b1b',
                fontSize: '11px'
              }}>
                {schemaValidationError.missingColumns.map((col, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>
                    <strong style={{ fontWeight: 600 }}>{col}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* General Errors */}
          {schemaValidationError.errors && schemaValidationError.errors.length > 0 && (
            <div style={{ marginBottom: '0.875rem' }}>
              <h4 style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--gps-danger-red, #e53e3e)', 
                fontSize: '11px', 
                marginBottom: '0.375rem',
                fontWeight: 600
              }}>
                Additional Issues
              </h4>
              <ul style={{ 
                margin: '0 0 0 1.25rem', 
                padding: 0,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#991b1b',
                fontSize: '11px'
              }}>
                {schemaValidationError.errors.map((error, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings (informational) */}
          {schemaValidationError.warnings && schemaValidationError.warnings.length > 0 && (
            <div className="gps-alert gps-alert--warning" style={{ 
              marginTop: '0.875rem',
              padding: '0.625rem 0.75rem',
              borderRadius: '4px'
            }}>
              <h4 style={{ 
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#92400e', 
                fontSize: '11px', 
                marginTop: 0,
                marginBottom: '0.375rem',
                fontWeight: 600
              }}>
                Warnings
              </h4>
              <ul style={{ 
                margin: 0, 
                padding: '0 0 0 1.25rem',
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#92400e',
                fontSize: '10px'
              }}>
                {schemaValidationError.warnings.map((warning, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {hasWritePermission('vendor_file_quality') || hasWritePermission('file_drop') ? (
        <>
          {/* Vendor Contract and Connection Selection - Matching Drop File (S3 Direct) design */}
          <div className="gps-card" style={{ 
            padding: '1rem', 
            marginBottom: '1rem', 
            borderRadius: '6px' 
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {/* Vendor Contract Selection */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <label htmlFor="vendor-contract-select" style={{ 
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: 600, 
                    whiteSpace: 'nowrap',
                    fontSize: '11px',
                    color: 'var(--gps-text-dark, #333333)'
                  }}>
                    Vendor Contract: <span style={{ color: 'var(--gps-danger-red, #e53e3e)' }}>*</span>
                  </label>
                  {!loadingAgreements && vendorAgreements.length === 0 && (
                    <button 
                      className="gps-btn gps-btn--primary gps-btn--sm"
                      onClick={loadVendorContracts}
                      style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: '10px' }}
                    >
                      Load My Contracts
                    </button>
                  )}
                </div>
                <select 
                  id="vendor-contract-select"
                  className="gps-select"
                  value={selectedAgreement || ''}
                  onChange={(e) => {
                    const agreementId = Number(e.target.value);
                    setSelectedAgreement(agreementId);
                    setShowFolderBrowser(false);
                    setSelectedFolder('');
                  }}
                  disabled={loadingAgreements || vendorAgreements.length === 0}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--gps-border-input, #d1d5db)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  {loadingAgreements ? (
                    <option>Loading contracts...</option>
                  ) : vendorAgreements.length === 0 ? (
                    <option>Click "Load My Contracts" to view your approved contracts</option>
                  ) : (
                    <>
                      <option value="">Select a contract...</option>
                      {vendorAgreements.map(agreement => (
                        <option key={agreement.id} value={agreement.id}>
                          {agreement.agreement_code} - {agreement.file_description || agreement.file_name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Connection Display (Auto-derived from contract) */}
              {selectedAgreement && (() => {
                const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
                if (!agreement || !agreement.vendor_connection_id) return null;
                
                return (
                  <div>
                    <label style={{ 
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontWeight: 600, 
                      display: 'block', 
                      marginBottom: '0.375rem',
                      fontSize: '11px',
                      color: 'var(--gps-text-dark, #333333)'
                    }}>
                      Connection: <span style={{ color: 'var(--gps-danger-red, #e53e3e)' }}>*</span>
                    </label>
                    <div style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--gps-border-input, #d1d5db)',
                      background: '#fff',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: '11px',
                      color: 'var(--gps-text-dark, #333333)'
                    }}>
                      {agreement.vendor_connection_name || 'Vendor S3 Connection'} (S3)
                    </div>
                  </div>
                );
              })()}

              {/* Connection Details and Folder Browser */}
              {selectedAgreement && (() => {
                const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
                return agreement?.vendor_connection_id;
              })() && (
                <div style={{ 
                  background: 'white', 
                  padding: '0.625rem 0.75rem', 
                  borderRadius: '4px', 
                  border: '1px solid var(--gps-border-light, #e5e7eb)' 
                }}>
                  {(() => {
                    const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
                    if (!agreement) return null;
                    return (
                      <>
                        <div style={{ 
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontSize: '10px', 
                          color: 'var(--gps-text-muted, #666666)', 
                          marginBottom: '0.375rem' 
                        }}>
                          <strong style={{ fontWeight: 600 }}>Default Upload Path:</strong> {selectedFolder || agreement.drop_location_path || 'root'}
                        </div>
                        {agreement.vendor_connection_id && (
                          <button 
                            className="gps-btn gps-btn--secondary gps-btn--sm"
                            onClick={() => setShowFolderBrowser(!showFolderBrowser)}
                            style={{ fontSize: '10px' }}
                          >
                            {showFolderBrowser ? 'Hide' : 'Browse'} Folders
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {/* S3 Folder Browser */}
                  {showFolderBrowser && (() => {
                    const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
                    if (!agreement) return null;
                    
                    return (
                      <div style={{ marginTop: '1rem' }}>
                        <S3FolderBrowser 
                          agreementId={selectedAgreement}
                          browseEndpoint="/api/vendor-access/browse"
                          initialPath={agreement.drop_location_path || '/'}
                          onSelectPath={(path) => {
                            setSelectedFolder(path);
                            setShowFolderBrowser(false);
                          }}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Expected Files and Schema Reference */}
          {selectedAgreement && fileSchemas.length > 0 && (
            <div className="gps-card" style={{ 
              padding: '1rem', 
              marginBottom: '1rem', 
              borderRadius: '6px' 
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                marginBottom: '0.75rem' 
              }}>
                <FiDatabase style={{ 
                  color: 'var(--gps-primary, #2563eb)', 
                  fontSize: '14px' 
                }} />
                <h3 style={{ 
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--gps-text-dark, #333333)',
                  margin: 0
                }}>
                  Expected Files for This Contract
                </h3>
                <span style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '10px',
                  color: 'var(--gps-text-muted, #666666)',
                  background: '#f3f4f6',
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}>
                  {fileSchemas.length} file pattern{fileSchemas.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              {loadingSchemas ? (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  padding: '0.75rem',
                  color: 'var(--gps-text-muted, #666666)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '11px'
                }}>
                  <FiLoader className="spin" />
                  Loading file schemas...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {fileSchemas.map((schema) => {
                    const isExpanded = expandedSchemas[schema.id];
                    let schemaFields = [];
                    try {
                      schemaFields = typeof schema.schema === 'string' 
                        ? JSON.parse(schema.schema) 
                        : schema.schema || [];
                    } catch (e) {
                      schemaFields = [];
                    }
                    
                    return (
                      <div 
                        key={schema.id}
                        style={{
                          border: '1px solid var(--gps-border-light, #e5e7eb)',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}
                      >
                        <div 
                          onClick={() => toggleSchemaExpansion(schema.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.625rem 0.75rem',
                            background: isExpanded ? '#f8fafc' : '#fff',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {isExpanded ? (
                            <FiChevronDown style={{ color: 'var(--gps-text-muted, #666666)', fontSize: '12px', flexShrink: 0 }} />
                          ) : (
                            <FiChevronRight style={{ color: 'var(--gps-text-muted, #666666)', fontSize: '12px', flexShrink: 0 }} />
                          )}
                          <FiFile style={{ color: 'var(--gps-primary, #2563eb)', fontSize: '12px', flexShrink: 0 }} />
                          <code style={{
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--gps-text-dark, #333333)',
                            background: '#e0e7ff',
                            padding: '2px 6px',
                            borderRadius: '3px'
                          }}>
                            {schema.file_name_pattern}
                          </code>
                          {schema.file_type && (
                            <span style={{
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontSize: '9px',
                              color: '#6366f1',
                              background: '#eef2ff',
                              padding: '2px 5px',
                              borderRadius: '3px'
                            }}>
                              {getFileTypeLabel(schema.file_type)}
                            </span>
                          )}
                          {schema.has_archive_password && (
                            <span style={{
                              fontFamily: 'Inter, system-ui, sans-serif',
                              fontSize: '9px',
                              color: '#059669',
                              background: '#d1fae5',
                              padding: '2px 5px',
                              borderRadius: '3px'
                            }}>
                              Password Protected
                            </span>
                          )}
                          <span style={{
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontSize: '10px',
                            color: 'var(--gps-text-muted, #666666)',
                            marginLeft: 'auto'
                          }}>
                            {schemaFields.length} field{schemaFields.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        {isExpanded && schemaFields.length > 0 && (
                          <div style={{
                            padding: '0.75rem',
                            background: '#fafafa',
                            borderTop: '1px solid var(--gps-border-light, #e5e7eb)'
                          }}>
                            {schema.file_description && (
                              <p style={{
                                fontFamily: 'Inter, system-ui, sans-serif',
                                fontSize: '10px',
                                color: 'var(--gps-text-muted, #666666)',
                                margin: '0 0 0.75rem 0',
                                fontStyle: 'italic'
                              }}>
                                {schema.file_description}
                              </p>
                            )}
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                              gap: '0.375rem'
                            }}>
                              {schemaFields.map((field, idx) => {
                                const fieldName = field.column_name || field.name || 'Unknown';
                                const fieldType = field.data_type || field.type || '';
                                return (
                                  <div 
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.375rem',
                                      padding: '0.375rem 0.5rem',
                                      background: 'white',
                                      border: '1px solid #e5e7eb',
                                      borderRadius: '3px'
                                    }}
                                  >
                                    <span style={{
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      fontSize: '10px',
                                      fontWeight: 500,
                                      color: 'var(--gps-text-dark, #333333)'
                                    }}>
                                      {fieldName}
                                    </span>
                                    <span style={{
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      fontSize: '9px',
                                      color: '#6b7280',
                                      background: '#f3f4f6',
                                      padding: '1px 4px',
                                      borderRadius: '2px',
                                      marginLeft: 'auto'
                                    }}>
                                      {fieldType}
                                    </span>
                                    {(field.is_required || field.required) && (
                                      <span style={{
                                        color: 'var(--gps-danger-red, #e53e3e)',
                                        fontSize: '10px',
                                        fontWeight: 600
                                      }}>*</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {schema.data_classification && (
                              <div style={{
                                marginTop: '0.625rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{
                                  fontFamily: 'Inter, system-ui, sans-serif',
                                  fontSize: '9px',
                                  color: 'var(--gps-text-muted, #666666)'
                                }}>
                                  Classification:
                                </span>
                                <span style={{
                                  fontFamily: 'Inter, system-ui, sans-serif',
                                  fontSize: '9px',
                                  color: schema.data_classification === 'Highly Confidential' ? '#dc2626' :
                                         schema.data_classification === 'Confidential' ? '#ea580c' :
                                         schema.data_classification === 'Internal' ? '#ca8a04' : '#059669',
                                  background: schema.data_classification === 'Highly Confidential' ? '#fef2f2' :
                                              schema.data_classification === 'Confidential' ? '#fff7ed' :
                                              schema.data_classification === 'Internal' ? '#fefce8' : '#f0fdf4',
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  fontWeight: 500
                                }}>
                                  {schema.data_classification}
                                </span>
                                {schema.contains_pii && (
                                  <span style={{
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    fontSize: '9px',
                                    color: '#dc2626',
                                    background: '#fef2f2',
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    fontWeight: 500
                                  }}>
                                    Contains PII
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upload Progress Indicator - 3-step progress bar */}
          {uploadStage && (
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px'
            }}>
              <StepProgress 
                currentStep={uploadStage} 
                uploadProgress={uploadStage === 'uploading' ? uploadProgress : null}
              />
            </div>
          )}

          {/* Multi-file Upload Status - displayed below progress, above dropzone */}
          {uploadingFiles.length > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px'
            }}>
              <h4 style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--gps-text-dark, #333)',
                margin: '0 0 0.75rem 0'
              }}>
                File Processing Status
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {uploadingFiles.map((file, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: file.status === 'success' ? '#f0fdf4' : 
                                file.status === 'error' ? '#fef2f2' : '#fff',
                    border: '1px solid',
                    borderColor: file.status === 'success' ? '#86efac' : 
                                 file.status === 'error' ? '#fecaca' : '#e2e8f0',
                    borderRadius: '4px'
                  }}>
                    <span style={{
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: '10px',
                      color: 'var(--gps-text-dark, #333)',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '60%'
                    }}>
                      {file.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {file.status === 'scanning' && (
                        <>
                          <FiLoader style={{ animation: 'spin 1s linear infinite', color: '#3b82f6', fontSize: '12px' }} />
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#3b82f6' }}>Scanning...</span>
                        </>
                      )}
                      {file.status === 'uploading' && (
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#3b82f6' }}>
                          {file.progress > 0 ? `${file.progress}%` : 'Uploading...'}
                        </span>
                      )}
                      {file.status === 'success' && (
                        <>
                          <FiCheckCircle style={{ color: '#22c55e', fontSize: '12px' }} />
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#22c55e' }}>Complete</span>
                        </>
                      )}
                      {file.status === 'error' && (
                        <>
                          <FiAlertCircle style={{ color: '#ef4444', fontSize: '12px' }} />
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#ef4444' }}>
                            {file.error || 'Failed'}
                          </span>
                        </>
                      )}
                      {file.status === 'pending' && (
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#6b7280' }}>Waiting...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Drop Zone */}
          {selectedAgreement && (() => {
            const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
            return agreement?.vendor_connection_id;
          })() ? (
            <>
              <FileDropzone 
                key={`drop-${dropzoneKey}`}
                onFileDrop={handleDropFile}
                onFilesChange={handleFilesChange}
                acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml', '.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.gz', '.7z', '.sas7bdat', '.xpt', '.avro', '.dat']}
                maxSizeMB={50}
                multiple={true}
                virusScan={uploadedFile?.virusScan}
                externalStatus={uploadStatus}
              />
              
              {/* Reset button */}
              {(uploadStatus === 'success' || uploadStatus === 'error') && (
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                  <button 
                    className="btn btn-primary"
                    onClick={handleUploadAnother}
                  >
                    Upload Another File
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{
              padding: '3rem',
              border: '2px dashed #ccc',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#999',
              background: '#f9f9f9'
            }}>
              <FiUpload size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <p style={{ fontSize: '1.1rem', margin: 0 }}>
                Please select a vendor contract above to continue
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="access-denied">
          <p>You do not have permission to upload files. Please contact an administrator.</p>
        </div>
      )}
    </div>
  );
}

export default VendorFileUpload;
