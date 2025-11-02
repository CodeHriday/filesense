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

  // Auto-load vendor agreements on mount
  useEffect(() => {
    const loadAgreements = async () => {
      setLoadingAgreements(true);
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_BASE_URL}/api/vendor-agreements?pageSize=1000`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const agreements = response.data.agreements || [];
        // Only show approved agreements for file upload
        const approvedAgreements = agreements.filter(a => a.approval_status === 'fully_approved');
        setVendorAgreements(approvedAgreements);
      } catch (error) {
        console.error('Error loading vendor agreements:', error);
        setVendorAgreements([]);
      } finally {
        setLoadingAgreements(false);
      }
    };

    loadAgreements();
  }, []);

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
        <p className="subtitle">Upload files to your designated S3 storage location</p>
      </div>

      {/* Success Notification */}
      {showSuccessNotification && uploadedFile && (
        <div className="success-notification">
          <div className="notification-content">
            <FiCheckCircle className="notification-icon" />
            <div className="notification-text">
              <strong>File uploaded successfully!</strong>
              <p>Your file has been uploaded and is being profiled.</p>
            </div>
          </div>
          <Link to="/vendor-file-quality" className="notification-link">
            View in Vendor File Catalog →
          </Link>
        </div>
      )}

      {hasWritePermission('vendor_file_quality') || hasWritePermission('file_drop') ? (
        <>
          {/* Vendor Agreement Selection */}
          <div className="selection-panel">
            <div className="selection-row">
              <div className="form-group">
                <label htmlFor="vendor-agreement-select">
                  Vendor Agreement: <span className="required">*</span>
                </label>
                <select 
                  id="vendor-agreement-select"
                  value={selectedAgreement || ''}
                  onChange={(e) => {
                    const agreementId = Number(e.target.value);
                    setSelectedAgreement(agreementId);
                    setShowFolderBrowser(false);
                    setBrowseFolders([]);
                  }}
                  disabled={loadingAgreements}
                  className="form-select"
                >
                  {loadingAgreements ? (
                    <option>Loading agreements...</option>
                  ) : vendorAgreements.length === 0 ? (
                    <option>No approved agreements available</option>
                  ) : (
                    <>
                      <option value="">Select an agreement...</option>
                      {vendorAgreements.map(agreement => (
                        <option key={agreement.id} value={agreement.id}>
                          {agreement.agreement_code} - {agreement.file_description || agreement.file_name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Agreement Details and Folder Browser */}
            {selectedAgreement && (
              <div className="connection-details">
                {(() => {
                  const agreement = vendorAgreements.find(a => a.id === selectedAgreement);
                  if (!agreement) return null;
                  return (
                    <>
                      <div className="upload-path">
                        <strong>Upload Path:</strong> {agreement.drop_location_path || 'root'}
                      </div>
                      {agreement.vendor_connection_id && (
                        <button 
                          className="btn btn-secondary btn-sm"
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
                  <div className="folder-browser">
                    {browsePrefix && (
                      <div className="folder-navigation">
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
                        <span className="current-path">
                          Current: /{browsePrefix}
                        </span>
                      </div>
                    )}
                    {browseFolders.length === 0 ? (
                      <div className="empty-folder">
                        No items found
                      </div>
                    ) : (
                      <div className="folder-list">
                        {browseFolders.filter(item => item.type === 'folder').map((folder, idx) => (
                          <div 
                            key={idx}
                            className="folder-item"
                            onClick={() => browseFoldersInAgreement(folder.path)}
                          >
                            <span className="folder-icon">📁</span>
                            <span className="folder-name">{folder.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* File Drop Zone */}
          {selectedAgreement ? (
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
                <div className="upload-actions">
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
            <div className="placeholder-dropzone">
              <FiUpload size={48} />
              <p>
                Please select a vendor agreement above to upload files
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
