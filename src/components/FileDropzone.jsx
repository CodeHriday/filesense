import React, { useCallback, useState, useEffect } from 'react';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import './FileDropzone.css';

function FileDropzone({ onFileDrop, acceptedFileTypes = ['.csv', '.json', '.parquet'], maxSizeMB = 500 }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileSize, setFileSize] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [processingStep, setProcessingStep] = useState(null);
  
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
      });
  }, [onFileDrop]);
  
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
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
  }, [validateFile, processFileUpload]);
  
  const handleFileSelect = useCallback((e) => {
    const files = e.target.files;
    if (files.length > 0) {
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
  }, [validateFile, processFileUpload]);
  
  return (
    <div 
      className={`file-dropzone ${isDragging ? 'dragging' : ''} ${uploadStatus ? `status-${uploadStatus}` : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="dropzone-content">
        {uploadStatus === 'success' ? (
          <div className="upload-success">
            <FiCheckCircle className="success-icon" />
            <p>File uploaded successfully!</p>
          </div>
        ) : uploadStatus === 'error' ? (
          <div className="upload-error">
            <FiAlertCircle className="error-icon" />
            <p>{fileError}</p>
          </div>
        ) : uploadStatus === 'uploading' ? (
          <div className="upload-progress">
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
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <FiUpload />
            </div>
            <div className="dropzone-text">
              <p>Drag and drop file here, or</p>
              <label className="file-select-button">
                <span>Browse Files</span>
                <input 
                  type="file" 
                  className="file-input" 
                  onChange={handleFileSelect}
                  accept={acceptedFileTypes.join(',')}
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