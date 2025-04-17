import React, { useCallback, useState } from 'react';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import './FileDropzone.css';

function FileDropzone({ onFileDrop, acceptedFileTypes = ['.csv', '.json', '.parquet'], maxSizeMB = 10 }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  
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
      
      // Call onFileDrop callback
      if (onFileDrop) {
        onFileDrop(file)
          .then(() => {
            setUploadStatus('success');
          })
          .catch(err => {
            setFileError(err.message || 'Failed to upload file');
            setUploadStatus('error');
          });
      }
    }
  }, [onFileDrop, validateFile]);
  
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
      
      // Call onFileDrop callback
      if (onFileDrop) {
        onFileDrop(file)
          .then(() => {
            setUploadStatus('success');
          })
          .catch(err => {
            setFileError(err.message || 'Failed to upload file');
            setUploadStatus('error');
          });
      }
    }
  }, [onFileDrop, validateFile]);
  
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
            <div className="spinner"></div>
            <p>Uploading file...</p>
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