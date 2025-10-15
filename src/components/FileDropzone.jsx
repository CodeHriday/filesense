import React, { useCallback, useState, useEffect } from 'react';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle, FiLoader } from 'react-icons/fi';
import './FileDropzone.css';

function FileDropzone({ onFileDrop, acceptedFileTypes = ['.csv', '.json', '.parquet'], maxSizeMB = 500, multiple = false, virusScan = null, externalStatus = null }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileSize, setFileSize] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [processingStep, setProcessingStep] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [completedFiles, setCompletedFiles] = useState([]);
  
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  // Format file size in a readable format
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  // Reset the component state when completed successfully
  useEffect(() => {
    if (uploadStatus === 'success') {
      // Auto-reset after success (if we're not redirecting)
      const timer = setTimeout(() => {
        setUploadProgress(0);
        setProcessingStep(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [uploadStatus]);
  
  const validateFile = useCallback((file) => {
    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return `File size exceeds maximum allowed size (${maxSizeMB}MB)`;
    }
    
    // Check file type
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!acceptedFileTypes.includes(fileExtension)) {
      return `File type ${fileExtension} is not supported. Please upload ${acceptedFileTypes.join(', ')}`;
    }
    
    return null;
  }, [acceptedFileTypes, maxSizeMB]);
  
  // Helper to process file upload with progress tracking
  const processFileUpload = useCallback((file) => {
    setFileSize(formatFileSize(file.size));
    setFileName(file.name);
    
    // Create handlers for upload progress tracking
    const uploadProgressHandler = (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      setUploadProgress(percentCompleted);
      
      // Track processing steps based on progress
      if (percentCompleted < 50) {
        setProcessingStep('Uploading file...');
      } else if (percentCompleted >= 50 && percentCompleted < 75) {
        setProcessingStep('Processing data...');
      } else if (percentCompleted >= 75 && percentCompleted < 95) {
        setProcessingStep('Analyzing file structure...');
      } else {
        setProcessingStep('Finalizing...');
      }
    };
    
    // Call onFileDrop callback with progress handler
    return onFileDrop(file, uploadProgressHandler)
      .then(() => {
        setUploadStatus('success');
        setProcessingStep('Complete!');
        setUploadProgress(100);
      })
      .catch(err => {
        console.error('Upload error:', err);
        setFileError(err.message || 'Failed to upload file');
        setUploadStatus('error');
        setProcessingStep(null);
        // Rethrow to allow caller to handle the error
        throw err;
      });
  }, [onFileDrop]);
  
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (multiple) {
        // Handle multiple files
        setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending' })));
        setCompletedFiles([]);
        setUploadStatus('uploading');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const file of files) {
          const error = validateFile(file);
          if (error) {
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error } : f
            ));
            errorCount++;
            continue;
          }
          
          setUploadingFiles(prev => prev.map(f => 
            f.name === file.name ? { ...f, status: 'uploading' } : f
          ));
          
          try {
            await processFileUpload(file);
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'success' } : f
            ));
            setCompletedFiles(prev => [...prev, file.name]);
            successCount++;
          } catch (err) {
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error: err.message } : f
            ));
            errorCount++;
          }
        }
        
        // Set status based on results
        if (successCount > 0 && errorCount === 0) {
          setUploadStatus('success');
        } else if (successCount === 0 && errorCount > 0) {
          setUploadStatus('error');
          setFileError(`All ${errorCount} file(s) failed to upload`);
        } else if (successCount > 0 && errorCount > 0) {
          setUploadStatus('partial');
          setFileError(`${errorCount} of ${files.length} file(s) failed to upload`);
        }
      } else {
        // Handle single file
        const file = files[0];
        const error = validateFile(file);
        
        if (error) {
          setFileError(error);
          setUploadStatus('error');
          return;
        }
        
        setFileError(null);
        setUploadStatus('uploading');
        setUploadProgress(0);
        
        // Process the file upload
        processFileUpload(file);
      }
    }
  }, [validateFile, processFileUpload, multiple]);
  
  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      if (multiple) {
        // Handle multiple files
        setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending' })));
        setCompletedFiles([]);
        setUploadStatus('uploading');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const file of files) {
          const error = validateFile(file);
          if (error) {
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error } : f
            ));
            errorCount++;
            continue;
          }
          
          setUploadingFiles(prev => prev.map(f => 
            f.name === file.name ? { ...f, status: 'uploading' } : f
          ));
          
          try {
            await processFileUpload(file);
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'success' } : f
            ));
            setCompletedFiles(prev => [...prev, file.name]);
            successCount++;
          } catch (err) {
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error: err.message } : f
            ));
            errorCount++;
          }
        }
        
        // Set status based on results
        if (successCount > 0 && errorCount === 0) {
          setUploadStatus('success');
        } else if (successCount === 0 && errorCount > 0) {
          setUploadStatus('error');
          setFileError(`All ${errorCount} file(s) failed to upload`);
        } else if (successCount > 0 && errorCount > 0) {
          setUploadStatus('partial');
          setFileError(`${errorCount} of ${files.length} file(s) failed to upload`);
        }
      } else {
        // Handle single file
        const file = files[0];
        const error = validateFile(file);
        
        if (error) {
          setFileError(error);
          setUploadStatus('error');
          return;
        }
        
        setFileError(null);
        setUploadStatus('uploading');
        setUploadProgress(0);
        
        // Process the file upload
        processFileUpload(file);
      }
    }
  }, [validateFile, processFileUpload, multiple]);
  
  // Use externalStatus if provided, otherwise use internal uploadStatus
  const currentStatus = externalStatus || uploadStatus;
  
  return (
    <div 
      className={`file-dropzone ${isDragging ? 'dragging' : ''} ${currentStatus ? `status-${currentStatus}` : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="dropzone-content">
        {currentStatus === 'checking' ? (
          <div className="upload-scanning">
            <FiLoader className="scanning-icon" />
            <p className="scanning-text">Scanning file for viruses...</p>
            <p className="scanning-subtext">Please wait while we ensure your file is safe</p>
          </div>
        ) : currentStatus === 'success' ? (
          <div className="upload-success">
            <FiCheckCircle className="success-icon" />
            {multiple && uploadingFiles.length > 0 ? (
              <div>
                <p>{completedFiles.length} file(s) uploaded successfully!</p>
                {virusScan && (
                  <div style={{ 
                    marginTop: '1rem', 
                    marginBottom: '1rem',
                    padding: '0.75rem', 
                    backgroundColor: virusScan.skipped ? '#fff3cd' : '#d4edda',
                    borderRadius: '4px',
                    fontSize: '0.9rem'
                  }}>
                    <strong>Security Scan: </strong>
                    {virusScan.clean && !virusScan.skipped && (
                      <span style={{ color: '#155724' }}>✓ Files scanned - No vulnerabilities found</span>
                    )}
                    {virusScan.skipped && (
                      <span style={{ color: '#856404' }}>⚠ {virusScan.message}</span>
                    )}
                  </div>
                )}
                <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {uploadingFiles.map((file, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '0.5rem', 
                      borderBottom: '1px solid #eee' 
                    }}>
                      <span style={{ flex: 1 }}>{file.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {file.error && <span style={{ fontSize: '0.85rem', color: 'red' }}>{file.error}</span>}
                        {file.status === 'success' && <FiCheckCircle style={{ color: 'green' }} />}
                        {file.status === 'error' && <FiAlertCircle style={{ color: 'red' }} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p>File uploaded successfully!</p>
                {virusScan && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '0.75rem', 
                    backgroundColor: virusScan.skipped ? '#fff3cd' : '#d4edda',
                    borderRadius: '4px',
                    fontSize: '0.9rem'
                  }}>
                    <strong>Security Scan: </strong>
                    {virusScan.clean && !virusScan.skipped && (
                      <span style={{ color: '#155724' }}>✓ File scanned - No vulnerabilities found</span>
                    )}
                    {virusScan.skipped && (
                      <span style={{ color: '#856404' }}>⚠ {virusScan.message}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : uploadStatus === 'error' ? (
          <div className="upload-error">
            <FiAlertCircle className="error-icon" />
            <p>{fileError}</p>
            {multiple && uploadingFiles.length > 0 && (
              <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                {uploadingFiles.map((file, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '0.5rem', 
                    borderBottom: '1px solid #eee' 
                  }}>
                    <span style={{ flex: 1 }}>{file.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {file.error && <span style={{ fontSize: '0.85rem', color: 'red' }}>{file.error}</span>}
                      <FiAlertCircle style={{ color: 'red' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : uploadStatus === 'partial' ? (
          <div className="upload-error">
            <FiAlertCircle className="error-icon" />
            <p>{fileError}</p>
            {multiple && uploadingFiles.length > 0 && (
              <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                {uploadingFiles.map((file, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '0.5rem', 
                    borderBottom: '1px solid #eee' 
                  }}>
                    <span style={{ flex: 1 }}>{file.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {file.error && <span style={{ fontSize: '0.85rem', color: 'red' }}>{file.error}</span>}
                      {file.status === 'success' && <FiCheckCircle style={{ color: 'green' }} />}
                      {file.status === 'error' && <FiAlertCircle style={{ color: 'red' }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : uploadStatus === 'uploading' ? (
          <div className="upload-progress">
            {multiple && uploadingFiles.length > 0 ? (
              <div>
                <p>Uploading {uploadingFiles.length} file(s)...</p>
                <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {uploadingFiles.map((file, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '0.5rem', 
                      borderBottom: '1px solid #eee' 
                    }}>
                      <span>{file.name}</span>
                      <span style={{ 
                        color: file.status === 'success' ? 'green' : 
                               file.status === 'error' ? 'red' : 
                               file.status === 'uploading' ? 'blue' : 'gray' 
                      }}>
                        {file.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="file-info">
                  {fileName && <p className="file-name">{fileName}</p>}
                  {fileSize && <p className="file-size">{fileSize}</p>}
                </div>
                
                <div className="progress-container">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${uploadProgress}%` }}
                  >
                    <span className="progress-text">{uploadProgress}%</span>
                  </div>
                </div>
                
                {processingStep && <p className="processing-step">{processingStep}</p>}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <FiUpload />
            </div>
            <div className="dropzone-text">
              <p>Drag and drop {multiple ? 'files' : 'file'} here, or</p>
              <label className="file-select-button">
                <span>Browse Files</span>
                <input 
                  type="file" 
                  className="file-input" 
                  onChange={handleFileSelect}
                  accept={acceptedFileTypes.join(',')}
                  multiple={multiple}
                />
              </label>
            </div>
            <div className="file-requirements">
              <p>Supported file types: {acceptedFileTypes.join(', ')}</p>
              <p>Maximum file size: {maxSizeMB}MB</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default FileDropzone;