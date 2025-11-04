import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUpload, FiCheckCircle, FiLoader } from 'react-icons/fi';
import FileDropzone from '../components/FileDropzone';
import S3FolderBrowser from '../components/S3FolderBrowser';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import '../styles/VendorFileUpload.css';

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

  const { hasWritePermission } = useAuth();
  const { addToast } = useToast();

  // Load vendor agreements on demand
  const loadVendorContracts = async () => {
    setLoadingAgreements(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/vendor-agreements?pageSize=1000`, {
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
      // Append timestamp to filename (format: basename_YYYYMMDDTHHMMSS.ext)
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
      
      const lastDotIndex = file.name.lastIndexOf('.');
      const hasExtension = lastDotIndex > 0;
      const baseName = hasExtension ? file.name.substring(0, lastDotIndex) : file.name;
      const fileExtension = hasExtension ? file.name.substring(lastDotIndex) : '';
      
      const timestampedFilename = `${baseName}_${timestamp}${fileExtension}`;
      
      // Create a new File object with the timestamped name
      const timestampedFile = new File([file], timestampedFilename, { type: file.type });
      
      setDiagnosticInfo(`Starting upload for ${timestampedFilename} to agreement ${agreement.agreement_code}...\n`);
      setUploadStatus('uploading');
      setUploadStage('uploading');
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('file', timestampedFile);
      
      const token = localStorage.getItem('token');
      
      // Build URL with connection and folder parameters
      let uploadUrl = `${API_BASE_URL}/api/files/drop?connectionId=${encodeURIComponent(agreement.vendor_connection_id)}`;
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
          
          if (progressHandler) {
            progressHandler(progressEvent);
          }
        }
      });
      
      setDiagnosticInfo(prev => prev + `Upload successful: ${JSON.stringify(response.data, null, 2)}\n`);
      
      const fileDetails = {
        fileId: response.data.fileId,
        fileName: timestampedFilename,
        fileType: file.type,
        fileSize: file.size,
        s3Location: response.data.file?.storage_location || response.data.file?.s3_location,
        virusScan: response.data.virusScan
      };
      
      setUploadedFile(fileDetails);
      
      // Process immediate virus scan result (scan is synchronous)
      const virusScan = response.data.virusScan;
      
      if (virusScan && virusScan.scanned && virusScan.clean) {
        // File passed virus scan
        setUploadStatus('success');
        setUploadStage(null);
        setShowSuccessNotification(true);
        
        const scanMessage = virusScan.skipped 
          ? 'File uploaded successfully! (Virus scan skipped - definitions unavailable)'
          : 'File uploaded and passed virus scan successfully!';
        
        addToast('success', 'Upload Complete', scanMessage);
        
        // Hide notification after 8 seconds
        setTimeout(() => {
          setShowSuccessNotification(false);
        }, 8000);
        
      } else if (virusScan && virusScan.scanned && !virusScan.clean) {
        // File failed virus scan (this shouldn't happen as server rejects infected files)
        setUploadStatus('error');
        setUploadStage(null);
        addToast('error', 'Upload Failed', 'File failed virus scan.');
        
      } else {
        // No virus scan data or scan failed - treat as success with warning
        setUploadStatus('success');
        setUploadStage(null);
        setShowSuccessNotification(true);
        addToast('warning', 'Upload Complete', virusScan?.message || 'File uploaded but virus scan status is unknown.');
        
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
      
      // Check if this is a schema validation error
      if (error.response?.data?.error === 'Schema validation failed' && error.response?.data?.details) {
        setSchemaValidationError(error.response.data.details);
        addToast('error', 'Schema Validation Failed', 'The uploaded file does not match the expected schema. See details below.');
      } else {
        setSchemaValidationError(null);
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
  };

  return (
    <div className="vendor-file-upload-container">
      <div className="page-header">
        <h1>Vendor File Upload</h1>
        <p className="subtitle">Upload files directly to S3 storage without profiling or analysis. Quick uploads for raw file storage.</p>
      </div>

      {/* Success Notification */}
      {showSuccessNotification && uploadedFile && (
        <div className="success-notification">
          <div className="notification-content">
            <FiCheckCircle className="notification-icon" />
            <div className="notification-text">
              <strong>File uploaded successfully!</strong>
              <p>Your file has been uploaded to S3 storage.</p>
            </div>
          </div>
          <Link to="/vendor-file-quality" className="notification-link">
            View in Vendor File Catalog →
          </Link>
        </div>
      )}

      {hasWritePermission('vendor_file_quality') || hasWritePermission('file_drop') ? (
        <>
          {/* Vendor Contract and Connection Selection - Matching Drop File (S3 Direct) design */}
          <div style={{ padding: '1rem', background: '#f8f9fa', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Vendor Contract Selection */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <label htmlFor="vendor-contract-select" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    Vendor Contract: <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  {!loadingAgreements && vendorAgreements.length === 0 && (
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={loadVendorContracts}
                      style={{ marginLeft: 'auto' }}
                    >
                      Load My Contracts
                    </button>
                  )}
                </div>
                <select 
                  id="vendor-contract-select"
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
                    border: '1px solid #ccc',
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
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                      Connection: <span style={{ color: '#e74c3c' }}>*</span>
                    </label>
                    <div style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      background: '#fff',
                      color: '#333'
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
                <div style={{ background: 'white', padding: '0.75rem', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                  {(() => {
                    const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
                    if (!agreement) return null;
                    return (
                      <>
                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                          <strong>Default Upload Path:</strong> {selectedFolder || agreement.drop_location_path || 'root'}
                        </div>
                        {agreement.vendor_connection_id && (
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => setShowFolderBrowser(!showFolderBrowser)}
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

          {/* Upload Progress Indicator */}
          {uploadStage === 'uploading' && (
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#e3f2fd',
              border: '1px solid #2196f3',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <FiLoader style={{ animation: 'spin 1s linear infinite', fontSize: '1.2rem', color: '#2196f3' }} />
                <strong style={{ color: '#1976d2' }}>
                  Uploading... {uploadProgress}%
                </strong>
              </div>
              
              <div style={{
                width: '100%',
                height: '8px',
                background: '#bbdefb',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  background: '#2196f3',
                  transition: 'width 0.3s ease'
                }} />
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
                acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
                maxSizeMB={50}
                multiple={false}
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
