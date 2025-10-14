import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import FileDropzone from '../components/FileDropzone';
import DuplicateFileModal from '../components/DuplicateFileModal';
import { uploadFile, testApiConnection, checkDuplicateFile, deleteFile } from '../api/fileService';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import './FileUpload.css';

function FileUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [apiStatus, setApiStatus] = useState({ checked: false, status: null });
  const [diagnosticInfo, setDiagnosticInfo] = useState('');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateFileInfo, setDuplicateFileInfo] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingProgressHandler, setPendingProgressHandler] = useState(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const [activeTab, setActiveTab] = useState('upload-profile');
  const [dropLocationConfigured, setDropLocationConfigured] = useState(false);
  const [dropLocationChecking, setDropLocationChecking] = useState(true);
  const [showDropLocationModal, setShowDropLocationModal] = useState(false);
  const navigate = useNavigate();
  const { hasWritePermission, currentUser } = useAuth();
  
  const isAdmin = currentUser?.roles?.includes('Admin');
  
  // Test API connection when component mounts
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const result = await testApiConnection();
        setApiStatus({ 
          checked: true, 
          status: result.status === 'ok' ? 'connected' : 'error',
          details: result 
        });
        setDiagnosticInfo(prev => prev + `\nAPI health check: ${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        setApiStatus({ checked: true, status: 'error', error: err.message });
        setDiagnosticInfo(prev => prev + `\nAPI health check error: ${err.message}`);
      }
    };
    
    checkApiStatus();
    checkDropLocationConfig();
  }, []);
  
  const checkDropLocationConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token || !isAdmin) {
        setDropLocationChecking(false);
        return;
      }
      
      const response = await axios.get(`${API_BASE_URL}/api/drop-location/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setDropLocationConfigured(response.data.configured);
    } catch (err) {
      console.error('Error checking drop location:', err);
      setDropLocationConfigured(false);
    } finally {
      setDropLocationChecking(false);
    }
  };
  
  const handleTestConnection = async () => {
    setDiagnosticInfo('Running API connection test...\n');
    try {
      const result = await testApiConnection();
      setDiagnosticInfo(prev => prev + `API connection test result: ${JSON.stringify(result, null, 2)}\n`);
      setApiStatus({ 
        checked: true, 
        status: result.status === 'ok' ? 'connected' : 'error',
        details: result 
      });
    } catch (err) {
      setDiagnosticInfo(prev => prev + `API connection test error: ${err.message}\n`);
      setApiStatus({ checked: true, status: 'error', error: err.message });
    }
  };
  
  const handleDirectUpload = async () => {
    setDiagnosticInfo('Attempting direct file upload...\n');
    try {
      // Create a blob from test data
      const csvData = 'id,name,email\n1,Test User,test@example.com';
      const blob = new Blob([csvData], { type: 'text/csv' });
      const testFile = new File([blob], 'test-upload.csv', { type: 'text/csv' });
      
      setDiagnosticInfo(prev => prev + `Created test file: ${testFile.name} (${testFile.size} bytes)\n`);
      setUploadStatus('uploading');
      
      // Manually create FormData
      const formData = new FormData();
      formData.append('file', testFile);
      
      setDiagnosticInfo(prev => prev + 'Sending direct axios request...\n');
      
      // Send direct request without using uploadFile function
      const response = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      
      setDiagnosticInfo(prev => prev + `Upload response: ${JSON.stringify(response.data, null, 2)}\n`);
      setUploadStatus('success');
      
    } catch (err) {
      setDiagnosticInfo(prev => prev + `Direct upload error: ${err.message}\n`);
      if (err.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(err.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
    }
  };
  
  const handleFileDrop = async (file, progressHandler) => {
    try {
      setDiagnosticInfo(`Checking for duplicate file: ${file.name}...\n`);
      setUploadStatus('checking');
      
      // Check for duplicate file first
      const duplicateCheck = await checkDuplicateFile(file);
      
      if (duplicateCheck.isDuplicate) {
        // Show duplicate modal
        setDuplicateFileInfo(duplicateCheck.existingFile);
        setPendingFile(file);
        setPendingProgressHandler(() => progressHandler);
        setShowDuplicateModal(true);
        setUploadStatus(null);
        return;
      }
      
      // If not duplicate, proceed with upload
      await proceedWithUpload(file, progressHandler);
    } catch (error) {
      console.error('Error checking for duplicate or uploading file:', error);
      setDiagnosticInfo(prev => prev + `Error: ${error.message}\n`);
      setUploadStatus('error');
      throw error;
    }
  };

  const proceedWithUpload = async (file, progressHandler) => {
    try {
      setDiagnosticInfo(`Starting file upload for ${file.name} (${file.size} bytes, type: ${file.type})...\n`);
      setUploadStatus('uploading');
      
      // Upload the file with progress tracking
      const result = await uploadFile(file, progressHandler);
      
      setDiagnosticInfo(prev => prev + `Upload successful: ${JSON.stringify(result, null, 2)}\n`);
      
      // Extract fileId from either result.fileId or result.file.file_id
      const fileId = result.fileId || (result.file && result.file.file_id);
      console.log('Extracted file ID from result:', fileId);
      
      const fileDetails = {
        fileId: fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      };
      
      setUploadedFile(fileDetails);
      setUploadStatus('success');
      
      // Automatically redirect to profile page after a short delay
      console.log('File uploaded successfully, will redirect to profile shortly. File ID:', fileId);
      
      // Use a longer timeout to ensure the file processing has started on the server
      setTimeout(() => {
        console.log('Now redirecting to profile page for file:', fileId);
        // Add a timestamp parameter to force a fresh load
        navigate(`/profile/${fileId}?t=${Date.now()}`);
      }, 2000); // Increased delay to ensure server has time to process the file
      
      return result;
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

  const handleReplaceFile = async () => {
    setShowDuplicateModal(false);
    
    // Guard against null pendingFile
    if (!pendingFile || !pendingProgressHandler) {
      setDiagnosticInfo(prev => prev + `Error: No pending file to upload\n`);
      setUploadStatus('error');
      return;
    }
    
    try {
      // Upload new file FIRST
      await proceedWithUpload(pendingFile, pendingProgressHandler);
      
      // Only delete existing file after successful upload
      try {
        await deleteFile(duplicateFileInfo.fileId);
        setDiagnosticInfo(prev => prev + `Replaced existing file: ${duplicateFileInfo.filename}\n`);
      } catch (deleteError) {
        // Log deletion error but don't fail the upload since new file is already uploaded
        console.error('Error deleting existing file:', deleteError);
        setDiagnosticInfo(prev => prev + `Warning: Could not delete existing file: ${deleteError.message}\n`);
      }
      
      // Clean up state after successful replace
      setPendingFile(null);
      setPendingProgressHandler(null);
      setDuplicateFileInfo(null);
    } catch (error) {
      console.error('Error uploading replacement file:', error);
      setDiagnosticInfo(prev => prev + `Error uploading replacement file: ${error.message}\n`);
      setUploadStatus('error');
    }
  };

  const handleKeepBoth = async () => {
    setShowDuplicateModal(false);
    
    // Guard against null pendingFile
    if (!pendingFile || !pendingProgressHandler) {
      setDiagnosticInfo(prev => prev + `Error: No pending file to upload\n`);
      setUploadStatus('error');
      return;
    }
    
    try {
      // Simply proceed with upload (keeps both files)
      await proceedWithUpload(pendingFile, pendingProgressHandler);
      
      // Clean up state after successful upload
      setPendingFile(null);
      setPendingProgressHandler(null);
      setDuplicateFileInfo(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      setDiagnosticInfo(prev => prev + `Error uploading file: ${error.message}\n`);
      setUploadStatus('error');
    }
  };

  const handleCancelUpload = () => {
    setShowDuplicateModal(false);
    setPendingFile(null);
    setPendingProgressHandler(null);
    setDuplicateFileInfo(null);
    setUploadStatus(null);
    setDropzoneKey(prev => prev + 1); // Reset FileDropzone component
  };
  
  const handleViewProfile = () => {
    if (uploadedFile && uploadedFile.fileId) {
      console.log('Manually navigating to profile for file:', uploadedFile.fileId);
      // Add a timestamp parameter to force a fresh load
      navigate(`/profile/${uploadedFile.fileId}?t=${Date.now()}`);
    }
  };
  
  const handleUploadAnother = () => {
    setUploadStatus(null);
    setUploadedFile(null);
    setDropzoneKey(prev => prev + 1); // Reset FileDropzone component
  };
  
  const handleDropFile = async (file, progressHandler) => {
    // Check if drop location is configured
    if (!dropLocationConfigured) {
      setShowDropLocationModal(true);
      return;
    }
    
    try {
      setDiagnosticInfo(`Starting drop file upload for ${file.name}...\n`);
      setUploadStatus('uploading');
      
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/api/files/drop`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressHandler) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            progressHandler(progress);
          }
        }
      });
      
      setDiagnosticInfo(prev => prev + `Drop upload successful: ${JSON.stringify(response.data, null, 2)}\n`);
      
      const fileDetails = {
        fileId: response.data.fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        s3Location: response.data.file.s3_location
      };
      
      setUploadedFile(fileDetails);
      setUploadStatus('success');
      
    } catch (error) {
      console.error('Error dropping file:', error);
      setDiagnosticInfo(prev => prev + `Drop upload error: ${error.message}\n`);
      if (error.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(error.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
      throw error;
    }
  };

  return (
    <div className="file-upload-container">
      <h1>Upload File</h1>
      
      {showDuplicateModal && duplicateFileInfo && (
        <DuplicateFileModal
          existingFile={duplicateFileInfo}
          onReplace={handleReplaceFile}
          onKeepBoth={handleKeepBoth}
          onCancel={handleCancelUpload}
        />
      )}
      
      {/* Drop Location Not Configured Modal */}
      {showDropLocationModal && (
        <div className="modal-overlay" onClick={() => setShowDropLocationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Drop Location Not Configured</h2>
            <p>
              {isAdmin 
                ? 'The S3 drop location has not been configured yet. Please go to Connections to configure it.'
                : 'The drop file feature is not available. Please contact your administrator to configure the drop location.'}
            </p>
            <div className="modal-actions">
              {isAdmin && (
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    setShowDropLocationModal(false);
                    navigate('/connections');
                  }}
                >
                  Go to Connections
                </button>
              )}
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDropLocationModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <Card>
        {/* Upload Mode Tabs */}
        <div className="upload-tabs">
          <button 
            className={`tab-button ${activeTab === 'upload-profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload-profile')}
          >
            Upload & Profile
          </button>
          {hasWritePermission('file_drop') && (
            <button 
              className={`tab-button ${activeTab === 'drop-file' ? 'active' : ''}`}
              onClick={() => setActiveTab('drop-file')}
            >
              Drop File (S3 Direct)
            </button>
          )}
        </div>
        
        <div className="upload-instructions">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>
                {activeTab === 'drop-file' 
                  ? 'Drop file to S3 storage'
                  : 'Add a new file to the observatory'}
              </h2>
              <p>
                {activeTab === 'drop-file'
                  ? 'Upload files directly to S3 storage without profiling or analysis. Quick uploads for raw file storage.'
                  : 'Upload a data file to analyze its structure, profile its content, and track changes over time. Supported file types include CSV, JSON, Parquet, Excel, and XML.'}
              </p>
            </div>
            {(uploadStatus || uploadedFile) && (
              <button 
                className="btn btn-secondary"
                onClick={handleUploadAnother}
                style={{ alignSelf: 'flex-start' }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        
        {activeTab === 'upload-profile' ? (
          hasWritePermission('file') ? (
            <FileDropzone 
              key={`profile-${dropzoneKey}`}
              onFileDrop={handleFileDrop}
              acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
              maxSizeMB={50}
            />
          ) : (
            <div className="access-denied-message">
              <p>You do not have permission to upload files. Please contact an administrator.</p>
            </div>
          )
        ) : (
          hasWritePermission('file_drop') ? (
            <FileDropzone 
              key={`drop-${dropzoneKey}`}
              onFileDrop={handleDropFile}
              acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
              maxSizeMB={50}
            />
          ) : (
            <div className="access-denied-message">
              <p>You do not have permission to drop files. Please contact an administrator.</p>
            </div>
          )
        )}
        
        {uploadStatus === 'success' && uploadedFile && (
          <>
            <div className="upload-success-actions">
              <button 
                className="btn btn-primary"
                onClick={handleViewProfile}
              >
                View File Profile
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleUploadAnother}
              >
                Upload Another File
              </button>
            </div>
          </>
        )}
      </Card>

      {/* Debug Tools */}
      <Card>
        <div className="debug-section">
          <h2>API Diagnostics</h2>
          <div className="debug-status">
            <div className="api-status">
              <span>API Status: </span>
              <span className={`status-badge ${apiStatus.status}`}>
                {!apiStatus.checked ? 'Checking...' : 
                  apiStatus.status === 'connected' ? 'Connected' : 'Error'}
              </span>
            </div>
            
            <div className="debug-actions">
              <button 
                className="btn btn-secondary"
                onClick={handleTestConnection}
              >
                Test API Connection
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleDirectUpload}
              >
                Test Direct Upload
              </button>
            </div>
          </div>
          
          <div className="diagnostic-info">
            <h3>Diagnostic Information</h3>
            <pre>
              {diagnosticInfo || 'No diagnostic information available yet.'}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default FileUpload;