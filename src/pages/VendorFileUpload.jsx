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
  const [vendorProjects, setVendorProjects] = useState([]);
  const [selectedVendorProject, setSelectedVendorProject] = useState(null);
  const [vendorConnections, setVendorConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [loadingVendorProjects, setLoadingVendorProjects] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [browseFolders, setBrowseFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [browsePrefix, setBrowsePrefix] = useState('');
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [diagnosticInfo, setDiagnosticInfo] = useState('');
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);

  const { hasWritePermission } = useAuth();

  // Auto-load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      setLoadingVendorProjects(true);
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_BASE_URL}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setVendorProjects(response.data || []);
      } catch (error) {
        console.error('Error loading projects:', error);
        setVendorProjects([]);
      } finally {
        setLoadingVendorProjects(false);
      }
    };

    loadProjects();
  }, []);

  // Load connections for selected project
  const loadVendorConnections = async (projectId) => {
    if (!projectId) return;
    
    setLoadingConnections(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/connections?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVendorConnections(response.data || []);
    } catch (error) {
      console.error('Error loading connections:', error);
      setVendorConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  };

  // Browse folders in connection
  const browseFoldersInConnection = async (connectionId, prefix = '') => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE_URL}/api/vendor-browse-folders?connectionId=${connectionId}&prefix=${encodeURIComponent(prefix)}`,
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
    if (!selectedVendorProject) {
      setUploadStatus('error');
      setDiagnosticInfo('Please select a project before uploading\n');
      throw new Error('Project selection required');
    }
    
    if (!selectedConnection) {
      setUploadStatus('error');
      setDiagnosticInfo('Please select a connection before uploading\n');
      throw new Error('Connection selection required');
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
      
      setDiagnosticInfo(`Starting upload for ${timestampedFilename} to connection ${selectedConnection}...\n`);
      setUploadStatus('uploading');
      
      const formData = new FormData();
      formData.append('file', timestampedFile);
      
      const token = localStorage.getItem('token');
      
      // Build URL with connection and folder parameters
      let uploadUrl = `${API_BASE_URL}/api/files/drop?connectionId=${encodeURIComponent(selectedConnection)}`;
      if (browsePrefix) {
        uploadUrl += `&folder=${encodeURIComponent(browsePrefix)}`;
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
          <Link to="/vendor-file-catalog" className="notification-link">
            View in Vendor File Catalog →
          </Link>
        </div>
      )}

      {hasWritePermission('file_drop') ? (
        <>
          {/* Project and Connection Selection */}
          <div className="selection-panel">
            <div className="selection-row">
              {/* Project Selection */}
              <div className="form-group">
                <label htmlFor="vendor-project-select">
                  Project: <span className="required">*</span>
                </label>
                <select 
                  id="vendor-project-select"
                  value={selectedVendorProject || ''}
                  onChange={(e) => {
                    const projectId = Number(e.target.value);
                    setSelectedVendorProject(projectId);
                    if (projectId) {
                      loadVendorConnections(projectId);
                    } else {
                      setVendorConnections([]);
                      setSelectedConnection(null);
                    }
                  }}
                  disabled={loadingVendorProjects}
                  className="form-select"
                >
                  {loadingVendorProjects ? (
                    <option>Loading projects...</option>
                  ) : (
                    <>
                      <option value="">Select a project...</option>
                      {vendorProjects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Connection Selection */}
              {selectedVendorProject && (
                <div className="form-group">
                  <label htmlFor="vendor-connection-select">
                    Connection: <span className="required">*</span>
                  </label>
                  <select 
                    id="vendor-connection-select"
                    value={selectedConnection || ''}
                    onChange={(e) => {
                      setSelectedConnection(e.target.value);
                      setShowFolderBrowser(false);
                      setBrowseFolders([]);
                    }}
                    disabled={loadingConnections || vendorConnections.length === 0}
                    className="form-select"
                  >
                    {loadingConnections ? (
                      <option>Loading connections...</option>
                    ) : vendorConnections.length === 0 ? (
                      <option>No connections available for this project</option>
                    ) : (
                      <>
                        <option value="">Select a connection...</option>
                        {vendorConnections.map(conn => {
                          const connId = conn.id || conn.connection_id;
                          return (
                            <option key={connId} value={connId}>
                              {conn.name} ({conn.type.toUpperCase()})
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Connection Details and Folder Browser */}
            {selectedConnection && (
              <div className="connection-details">
                {(() => {
                  const conn = vendorConnections.find(c => (c.id || c.connection_id) === selectedConnection);
                  if (!conn) return null;
                  return (
                    <>
                      <div className="upload-path">
                        <strong>Upload Path:</strong> {conn.path || conn.drop_location_path || 'root'}
                      </div>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setShowFolderBrowser(!showFolderBrowser);
                          if (!showFolderBrowser && browseFolders.length === 0) {
                            browseFoldersInConnection(selectedConnection, '');
                          }
                        }}
                      >
                        {showFolderBrowser ? 'Hide' : 'Browse'} Folders
                      </button>
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
                            browseFoldersInConnection(selectedConnection, newPrefix);
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
                            onClick={() => browseFoldersInConnection(selectedConnection, folder.path)}
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
          {selectedVendorProject && selectedConnection ? (
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
                {!selectedVendorProject ? 'Please select a project above to continue' : 'Please select a connection to upload files'}
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
