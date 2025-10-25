import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUpload } from 'react-icons/fi';
import Card from '../components/Card';
import FileDropzone from '../components/FileDropzone';
import DuplicateFileModal from '../components/DuplicateFileModal';
import StepProgress from '../components/StepProgress';
import { uploadFile, uploadFilesBatch, testApiConnection, checkDuplicateFile, deleteFile } from '../api/fileService';
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
  const [currentStep, setCurrentStep] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileOwner, setFileOwner] = useState('');
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [tempOwner, setTempOwner] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [batchUploadStatus, setBatchUploadStatus] = useState(null); // Track batch upload progress
  const [batchResults, setBatchResults] = useState(null); // Store batch upload results
  const pollingInterval = useRef(null);
  const navigate = useNavigate();
  const { hasWritePermission, currentUser } = useAuth();
  
  const isAdmin = currentUser?.roles?.includes('Admin');
  
  useEffect(() => {
    if (currentUser?.email) {
      setFileOwner(currentUser.email);
    }
  }, [currentUser]);
  
  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoadingProjects(false);
          return;
        }
        
        const response = await axios.get(`${API_BASE_URL}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setProjects(response.data);
        
        // Find and select Default Project by default
        const defaultProject = response.data.find(p => p.name === 'Default Project' || p.is_default);
        if (defaultProject) {
          setSelectedProject(defaultProject.id);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };
    
    fetchProjects();
  }, []);
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);
  
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
  
  const pollProcessingStatus = async (fileId) => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.get(`${API_BASE_URL}/api/files/${fileId}/status`, {
        headers
      });
      
      const { step, isComplete } = response.data;
      
      if (step) {
        setCurrentStep(step);
      }
      
      if (isComplete) {
        // Stop polling
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        
        setIsProcessing(false);
        
        // Redirect to profile page after a short delay
        setTimeout(() => {
          navigate(`/profile/${fileId}?t=${Date.now()}`);
        }, 1500);
      }
    } catch (error) {
      console.error('Error polling processing status:', error);
    }
  };
  
  const startPolling = (fileId) => {
    // Clear any existing polling
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }
    
    // Poll every 500ms for real-time updates
    pollingInterval.current = setInterval(() => {
      pollProcessingStatus(fileId);
    }, 500);
    
    // Also poll immediately
    pollProcessingStatus(fileId);
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
      formData.append('files', testFile);
      
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
      
      // Check for duplicate file first (scoped to selected project)
      const duplicateCheck = await checkDuplicateFile(file, selectedProject);
      
      if (duplicateCheck.isDuplicate) {
        // Show duplicate modal
        setDuplicateFileInfo(duplicateCheck.existingFile);
        setPendingFile(file);
        setPendingProgressHandler(() => progressHandler);
        setShowDuplicateModal(true);
        setUploadStatus(null);
        setCurrentStep(null);
        setIsProcessing(false);
        return;
      }
      
      // If not duplicate, proceed with upload
      await proceedWithUpload(file, progressHandler);
    } catch (error) {
      console.error('Error checking for duplicate or uploading file:', error);
      setDiagnosticInfo(prev => prev + `Error: ${error.message}\n`);
      setUploadStatus('error');
      setCurrentStep(null);
      setIsProcessing(false);
      throw error;
    }
  };

  const handleBatchFileDrop = async (files, progressHandler) => {
    try {
      setDiagnosticInfo(`Starting batch upload for ${files.length} files...\n`);
      setUploadStatus('uploading');
      setIsProcessing(true);
      setCurrentStep('uploading');
      setUploadProgress(0);
      setBatchUploadStatus({ total: files.length, current: 0, currentFile: null });
      setBatchResults(null); // Clear previous results
      
      // Validate project selection
      if (!selectedProject) {
        throw new Error('Please select a project before uploading');
      }
      
      const results = [];
      let successCount = 0;
      let failedCount = 0;
      
      // Process each file sequentially to show individual progress
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNumber = i + 1;
        
        try {
          // Update batch status
          setBatchUploadStatus({ 
            total: files.length, 
            current: fileNumber, 
            currentFile: file.name 
          });
          
          setDiagnosticInfo(prev => prev + `\n📁 Uploading file ${fileNumber} of ${files.length}: ${file.name}\n`);
          
          // Create a wrapped progress handler for this specific file
          const wrappedProgressHandler = (progressEvent) => {
            const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentage);
            
            // Call the original progress handler
            if (progressHandler) {
              progressHandler(progressEvent);
            }
          };
          
          // Upload individual file
          const result = await uploadFile(file, wrappedProgressHandler, fileOwner, selectedProject);
          
          // Extract fileId from result
          let fileId;
          if (result.results && result.results.length > 0) {
            const firstResult = result.results[0];
            fileId = firstResult.fileId || (firstResult.file && firstResult.file.file_id);
          } else {
            fileId = result.fileId || (result.file && result.file.file_id);
          }
          
          setDiagnosticInfo(prev => prev + `✅ File ${fileNumber} uploaded successfully: ${file.name} (ID: ${fileId})\n`);
          
          results.push({
            success: true,
            filename: file.name,
            fileId: fileId
          });
          successCount++;
          
          // Add a small delay between files to make progress visible (400ms)
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
          
        } catch (error) {
          console.error(`Error uploading file ${fileNumber} (${file.name}):`, error);
          setDiagnosticInfo(prev => prev + `❌ File ${fileNumber} failed: ${file.name} - ${error.message}\n`);
          
          results.push({
            success: false,
            filename: file.name,
            error: error.message
          });
          failedCount++;
          
          // Add delay even on error to show the failure
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }
      }
      
      // Show final summary
      setDiagnosticInfo(prev => prev + `\n📊 Batch upload complete: ${successCount} succeeded, ${failedCount} failed\n`);
      
      // Set status based on results
      if (successCount === 0) {
        // All files failed
        setUploadStatus('error');
        setCurrentStep(null);
      } else if (failedCount > 0) {
        // Partial success
        setUploadStatus('warning');
        setCurrentStep('complete');
      } else {
        // All succeeded
        setUploadStatus('success');
        setCurrentStep('complete');
      }
      
      setIsProcessing(false);
      setBatchUploadStatus(null);
      
      // Store results for display (do NOT auto-redirect)
      setBatchResults({
        total: files.length,
        successCount,
        failedCount,
        results
      });
      
      return {
        success: successCount > 0,
        successCount,
        failedCount,
        results
      };
    } catch (error) {
      console.error('Error in batch upload:', error);
      setDiagnosticInfo(prev => prev + `Batch upload error: ${error.message}\n`);
      setUploadStatus('error');
      setCurrentStep(null);
      setIsProcessing(false);
      setBatchUploadStatus(null);
      throw error;
    }
  };

  const proceedWithUpload = async (file, progressHandler, replaceFileId = null) => {
    try {
      setDiagnosticInfo(`Starting file upload for ${file.name} (${file.size} bytes, type: ${file.type})...\n`);
      setUploadStatus('uploading');
      setIsProcessing(true);
      setCurrentStep('uploading');
      setUploadProgress(0);
      
      // Create a wrapped progress handler that updates our state
      const wrappedProgressHandler = (progressEvent) => {
        const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentage);
        
        // Call the original progress handler
        if (progressHandler) {
          progressHandler(progressEvent);
        }
      };
      
      // Validate project selection
      if (!selectedProject) {
        throw new Error('Please select a project before uploading');
      }
      
      // Upload the file with progress tracking (optionally with atomic replacement)
      const result = await uploadFile(file, wrappedProgressHandler, fileOwner, selectedProject, replaceFileId);
      
      setDiagnosticInfo(prev => prev + `Upload successful: ${JSON.stringify(result, null, 2)}\n`);
      
      // Extract fileId - handle both batch response (results array) and legacy single response
      let fileId;
      if (result.results && result.results.length > 0) {
        // Batch response: extract from first result
        const firstResult = result.results[0];
        fileId = firstResult.fileId || (firstResult.file && firstResult.file.file_id);
      } else {
        // Legacy single file response
        fileId = result.fileId || (result.file && result.file.file_id);
      }
      console.log('Extracted file ID from result:', fileId);
      
      const fileDetails = {
        fileId: fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      };
      
      setUploadedFile(fileDetails);
      setUploadStatus('success');
      
      // Move to scanning step (virus scan happens on server after upload)
      setCurrentStep('scanning');
      
      // Start polling for processing status
      console.log('File uploaded successfully, starting status polling. File ID:', fileId);
      startPolling(fileId);
      
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
      setDiagnosticInfo(prev => prev + `Upload error: ${error.message}\n`);
      if (error.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(error.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
      setCurrentStep(null);
      setIsProcessing(false);
      throw error;
    }
  };

  const proceedWithUploadWithReplacement = async (file, progressHandler, replaceFileId) => {
    return proceedWithUpload(file, progressHandler, replaceFileId);
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
      // Upload new file with atomic replacement (backend handles deletion)
      const result = await proceedWithUploadWithReplacement(pendingFile, pendingProgressHandler, duplicateFileInfo.fileId);
      
      // Check if replacement was successful
      if (result && result.results && result.results.length > 0 && result.results[0].replaced) {
        setDiagnosticInfo(prev => prev + `Successfully replaced file: ${duplicateFileInfo.filename}\n`);
      } else {
        setDiagnosticInfo(prev => prev + `New file uploaded. Note: Old file may not have been deleted.\n`);
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
    // Clear any polling
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    setUploadStatus(null);
    setUploadedFile(null);
    setCurrentStep(null);
    setUploadProgress(0);
    setIsProcessing(false);
    setBatchResults(null); // Clear batch results
    setDropzoneKey(prev => prev + 1); // Reset FileDropzone component
  };
  
  const handleOpenOwnerModal = () => {
    setTempOwner(fileOwner);
    setShowOwnerModal(true);
  };
  
  const handleSaveOwner = () => {
    setFileOwner(tempOwner);
    setShowOwnerModal(false);
  };
  
  const handleCancelOwnerModal = () => {
    setTempOwner('');
    setShowOwnerModal(false);
  };
  
  const handleResetOwnerToDefault = () => {
    const defaultOwner = currentUser?.email || '';
    setTempOwner(defaultOwner);
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
      formData.append('files', file);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/api/files/drop`, formData, {
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
      
      setDiagnosticInfo(prev => prev + `Drop upload successful: ${JSON.stringify(response.data, null, 2)}\n`);
      
      const fileDetails = {
        fileId: response.data.fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        s3Location: response.data.file.storage_location || response.data.file.s3_location,
        virusScan: response.data.virusScan
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
      
      {/* Owner Edit Modal */}
      {showOwnerModal && (
        <div className="modal-overlay" onClick={handleCancelOwnerModal}>
          <div className="modal-content ownership-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit File Owner</h2>
            <p className="modal-description">
              Set the owner for files you upload. This defaults to your email address.
            </p>
            <div className="form-group">
              <label htmlFor="owner-input">Owner Email:</label>
              <input
                id="owner-input"
                type="email"
                value={tempOwner}
                onChange={(e) => setTempOwner(e.target.value)}
                placeholder="owner@example.com"
                className="form-control"
              />
            </div>
            <div className="modal-actions">
              <button 
                className="btn btn-primary"
                onClick={handleSaveOwner}
              >
                Save
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleResetOwnerToDefault}
              >
                Reset to Default
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleCancelOwnerModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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
        
        {/* Project and Owner Section - Combined */}
        {!isProcessing && activeTab === 'upload-profile' && hasWritePermission('file') && (
          <div style={{ padding: '1rem', background: 'transparent', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Project Selection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                <label htmlFor="project-select" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Project: <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <select 
                  id="project-select"
                  value={selectedProject || ''}
                  onChange={(e) => setSelectedProject(Number(e.target.value))}
                  disabled={loadingProjects}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    cursor: 'pointer',
                    minWidth: '200px'
                  }}
                >
                  {loadingProjects ? (
                    <option>Loading projects...</option>
                  ) : projects.length === 0 ? (
                    <option>No projects available</option>
                  ) : (
                    <>
                      <option value="">Select a project...</option>
                      {projects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* File Owner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>File Owner:</span>
                <span style={{ flex: 1 }}>{fileOwner || 'Not set'}</span>
                <button 
                  className="btn-link"
                  onClick={handleOpenOwnerModal}
                  title="Edit owner"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Edit
                </button>
              </div>
            </div>
            {!selectedProject && (
              <div style={{ marginTop: '0.75rem', color: '#e74c3c', fontSize: '0.875rem' }}>
                Please select a project to upload files
              </div>
            )}
          </div>
        )}
        
        {/* Show StepProgress when processing */}
        {isProcessing && currentStep && activeTab === 'upload-profile' && (
          <>
            <StepProgress 
              currentStep={currentStep}
              uploadProgress={currentStep === 'uploading' ? uploadProgress : null}
            />
            {batchUploadStatus && (
              <div style={{
                margin: '1rem',
                padding: '1rem',
                background: '#f0f9ff',
                border: '1px solid #3b82f6',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e40af', marginBottom: '0.5rem' }}>
                  Uploading file {batchUploadStatus.current} of {batchUploadStatus.total}
                </div>
                {batchUploadStatus.currentFile && (
                  <div style={{ fontSize: '0.95rem', color: '#475569' }}>
                    {batchUploadStatus.currentFile}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {/* Show upload dropzone when not processing */}
        {!isProcessing && activeTab === 'upload-profile' ? (
          hasWritePermission('file') ? (
            selectedProject ? (
              <FileDropzone 
                key={`profile-${dropzoneKey}`}
                onFileDrop={handleFileDrop}
                onBatchFileDrop={handleBatchFileDrop}
                acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
                maxSizeMB={50}
                multiple={true}
                externalStatus={uploadStatus}
              />
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
                <p style={{ fontSize: '1.1rem', margin: 0 }}>Please select a project above to upload files</p>
              </div>
            )
          ) : (
            <div className="access-denied-message">
              <p>You do not have permission to upload files. Please contact an administrator.</p>
            </div>
          )
        ) : null}
        
        {/* Drop file tab (separate from upload-profile) */}
        {activeTab === 'drop-file' && (
          hasWritePermission('file_drop') ? (
            <FileDropzone 
              key={`drop-${dropzoneKey}`}
              onFileDrop={handleDropFile}
              onBatchFileDrop={handleBatchFileDrop}
              acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
              maxSizeMB={50}
              multiple={true}
              virusScan={uploadedFile?.virusScan}
            />
          ) : (
            <div className="access-denied-message">
              <p>You do not have permission to drop files. Please contact an administrator.</p>
            </div>
          )
        )}
        
        {uploadStatus === 'success' && uploadedFile && activeTab === 'upload-profile' && !isProcessing && !batchResults && (
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
        
        {/* Batch Upload Results Summary */}
        {batchResults && activeTab === 'upload-profile' && !isProcessing && (
          <div style={{
            margin: '2rem 0',
            padding: '1.5rem',
            background: batchResults.successCount === batchResults.total ? '#f0fdf4' : 
                        batchResults.successCount === 0 ? '#fef2f2' : '#fefce8',
            border: `2px solid ${batchResults.successCount === batchResults.total ? '#10b981' : 
                                  batchResults.successCount === 0 ? '#ef4444' : '#f59e0b'}`,
            borderRadius: '8px'
          }}>
            <h3 style={{ 
              margin: '0 0 1rem 0', 
              color: batchResults.successCount === batchResults.total ? '#065f46' : 
                     batchResults.successCount === 0 ? '#991b1b' : '#92400e'
            }}>
              Batch Upload Complete
            </h3>
            
            <div style={{ 
              fontSize: '1.1rem', 
              fontWeight: 'bold', 
              marginBottom: '1rem',
              color: '#1f2937'
            }}>
              {batchResults.successCount} of {batchResults.total} files uploaded successfully
              {batchResults.failedCount > 0 && ` • ${batchResults.failedCount} failed`}
            </div>
            
            {/* File-by-file results */}
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              {batchResults.results.map((result, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem',
                  borderBottom: index < batchResults.results.length - 1 ? '1px solid #f3f4f6' : 'none'
                }}>
                  <span style={{ 
                    marginRight: '0.75rem', 
                    fontSize: '1.2rem'
                  }}>
                    {result.success ? '✅' : '❌'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', color: '#374151' }}>
                      {result.filename}
                    </div>
                    {!result.success && result.error && (
                      <div style={{ fontSize: '0.875rem', color: '#ef4444', marginTop: '0.25rem' }}>
                        {result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              {batchResults.successCount > 0 && (
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/files')}
                  style={{ flex: 1 }}
                >
                  View File Catalog
                </button>
              )}
              <button 
                className="btn btn-secondary"
                onClick={handleUploadAnother}
                style={{ flex: 1 }}
              >
                Upload More Files
              </button>
            </div>
          </div>
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