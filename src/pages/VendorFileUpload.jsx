import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiUpload, FiCheckCircle } from 'react-icons/fi';
import FileDropzone from '../components/FileDropzone';
import { useAuth } from '../context/AuthContext';
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
  const [browseFolders, setBrowseFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [browsePrefix, setBrowsePrefix] = useState('');
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [diagnosticInfo, setDiagnosticInfo] = useState('');
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);

  const { hasWritePermission } = useAuth();

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

  // Browse folders in agreement's connection
  const browseFoldersInAgreement = async (prefix = '') => {
    if (!selectedAgreement) return;
    
    const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
    if (!agreement || !agreement.vendor_connection_id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/api/vendor-browse-folders?connectionId=${agreement.vendor_connection_id}&prefix=${encodeURIComponent(prefix)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBrowseFolders(response.data.items || []);
      setBrowsePrefix(prefix);
      setSelectedFolder(prefix);
    } catch (error) {
      console.error('Error browsing folders:', error);
      setBrowseFolders([]);
    }
  };

  const handleDropFile = async (file, progressHandler) => {
    // Validate selections
    if (!selectedAgreement) {
      setUploadStatus('error');
      setDiagnosticInfo('Please select a vendor agreement before uploading\n');
      throw new Error('Agreement selection required');
    }
    
    const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
    if (!agreement || !agreement.vendor_connection_id) {
      setUploadStatus('error');
      setDiagnosticInfo('Selected agreement does not have a configured connection\n');
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
      
      const formData = new FormData();
      formData.append('file', timestampedFile);
      
      const token = localStorage.getItem('token');
      
      // Build URL with connection and folder parameters
      let uploadUrl = `${API_BASE_URL}/api/files/drop?connectionId=${encodeURIComponent(agreement.vendor_connection_id)}`;
      if (browsePrefix) {
        uploadUrl += `&folder=${encodeURIComponent(browsePrefix)}`;
      } else if (agreement.drop_location_path) {
        uploadUrl += `&folder=${encodeURIComponent(agreement.drop_location_path)}`;
      }
      
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
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
      setUploadStatus('success');
      setShowSuccessNotification(true);
      
      // Hide notification after 8 seconds
      setTimeout(() => {
        setShowSuccessNotification(false);
      }, 8000);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setDiagnosticInfo(prev => prev + `Upload error: ${error.message}\n`);
      if (error.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(error.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
      throw error;
    }
  };

  const handleUploadAnother = () => {
    setUploadStatus(null);
    setUploadedFile(null);
    setDiagnosticInfo('');
    setDropzoneKey(prev => prev + 1);
    setShowSuccessNotification(false);
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
                    setBrowseFolders([]);
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
                      {agreement.connection_name || 'S3 Connection'} (S3)
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
                          <strong>Upload Path:</strong> {agreement.drop_location_path || 'root'}
                        </div>
                        {agreement.vendor_connection_id && (
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setShowFolderBrowser(!showFolderBrowser);
                              if (!showFolderBrowser && browseFolders.length === 0) {
                                browseFoldersInAgreement('');
                              }
                            }}
                          >
                            {showFolderBrowser ? 'Hide' : 'Browse'} Folders
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {/* Folder Browser */}
                  {showFolderBrowser && (
                    <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem' }}>
                      {browsePrefix && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              const parts = browsePrefix.split('/').filter(p => p);
                              parts.pop();
                              const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
                              browseFoldersInAgreement(newPrefix);
                            }}
                          >
                            ← Back
                          </button>
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                            Current: /{browsePrefix}
                          </span>
                        </div>
                      )}
                      {browseFolders.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
                          No items found
                        </div>
                      ) : (
                        <div>
                          {browseFolders.filter(item => item.type === 'folder').map((folder, idx) => (
                            <div 
                              key={idx}
                              style={{ 
                                padding: '0.5rem', 
                                cursor: 'pointer',
                                borderBottom: '1px solid #f0f0f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}
                              onClick={() => browseFoldersInAgreement(folder.path)}
                            >
                              <span>📁</span>
                              <span>{folder.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

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
