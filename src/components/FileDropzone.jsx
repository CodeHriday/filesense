import React, { useCallback, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle, FiLoader } from 'react-icons/fi';
import './FileDropzone.css';
import PropTypes from 'prop-types';

function FileDropzone({ onFileDrop, onBatchFileDrop, onFilesChange, acceptedFileTypes = ['.csv', '.json', '.parquet'], maxSizeMB = 500, multiple = false, virusScan = null, externalStatus = null }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileSize, setFileSize] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [processingStep, setProcessingStep] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [completedFiles, setCompletedFiles] = useState([]);
  
  useEffect(() => {
    if (onFilesChange && uploadingFiles.length > 0) {
      onFilesChange(uploadingFiles);
    }
  }, [uploadingFiles, onFilesChange]);
  
  const getAcceptString = useCallback(() => {
    const mimeTypes = {
      '.tar.gz': 'application/gzip,application/x-gzip,application/x-compressed-tar',
      '.tgz': 'application/gzip,application/x-gzip,application/x-compressed-tar',
      '.tar.bz2': 'application/x-bzip2,application/x-bzip2-compressed-tar',
      '.tbz2': 'application/x-bzip2,application/x-bzip2-compressed-tar',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip,application/x-gzip',
      '.zip': 'application/zip,application/x-zip-compressed',
      '.7z': 'application/x-7z-compressed',
      '.avro': 'application/avro,application/x-avro,application/octet-stream',
      '.dat': 'application/octet-stream',
      '.sas7bdat': 'application/x-sas-data,application/octet-stream',
      '.xpt': 'application/x-sas-xport,application/octet-stream',
      '.parquet': 'application/vnd.apache.parquet,application/x-parquet,application/octet-stream',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv': 'text/csv,text/plain',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'text/xml,application/xml'
    };
    
    const acceptParts = [];
    acceptedFileTypes.forEach(ext => {
      acceptParts.push(ext);
      if (mimeTypes[ext]) {
        acceptParts.push(mimeTypes[ext]);
      }
    });
    
    return acceptParts.join(',');
  }, [acceptedFileTypes]);
  
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
    
    // Check file type - handle compound extensions (.tar.gz, .tar.bz2)
    const filename = file.name.toLowerCase();
    let fileExtension = '.' + filename.split('.').pop();
    
    // Check for compound extensions
    if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
      fileExtension = '.tar.gz';
    } else if (filename.endsWith('.tar.bz2') || filename.endsWith('.tbz2')) {
      fileExtension = '.tar.bz2';
    }
    
    if (!acceptedFileTypes.includes(fileExtension)) {
      return `File type ${fileExtension} is not supported. Please upload ${acceptedFileTypes.join(', ')}`;
    }
    
    return null;
  }, [acceptedFileTypes, maxSizeMB]);
  
  // Helper to process file upload with progress tracking
  const processFileUpload = useCallback((file, isMultiFile = false, updateFileStatus = null) => {
    setFileSize(formatFileSize(file.size));
    setFileName(file.name);
    
    // For multi-file, update individual file status to scanning
    if (isMultiFile && updateFileStatus) {
      updateFileStatus(file.name, 'scanning');
    }
    
    // Create handlers for upload progress tracking
    const uploadProgressHandler = (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      setUploadProgress(percentCompleted);
      
      // Note: For multi-file uploads, we keep the 'scanning' status set earlier
      // The virus scan happens on the server AFTER file upload completes
      // Status will change to 'success' after the entire upload + scan process completes
      
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
        // Extract error message from server response, or fall back to Axios error message
        const serverMessage = err.response?.data?.message || err.response?.data?.error;
        const errorMessage = serverMessage || err.message || 'Failed to upload file';
        setFileError(errorMessage);
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
      if (multiple && onBatchFileDrop && files.length > 1) {
        // Handle batch upload - all files in one request
        setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending', progress: 0 })));
        setCompletedFiles([]);
        setUploadStatus('uploading');
        
        // Validate all files first
        const validFiles = [];
        const invalidFiles = [];
        
        for (const file of files) {
          const error = validateFile(file);
          if (error) {
            invalidFiles.push({ name: file.name, error });
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error } : f
            ));
          } else {
            validFiles.push(file);
          }
        }
        
        // If we have valid files, send batch upload
        if (validFiles.length > 0) {
          try {
            // Call batch upload with progress handler
            const result = await onBatchFileDrop(validFiles, (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percentCompleted);
            });
            
            // Process batch response - update each file status based on results
            if (result.results) {
              result.results.forEach(fileResult => {
                if (fileResult.success) {
                  setUploadingFiles(prev => prev.map(f => 
                    f.name === fileResult.filename ? { ...f, status: 'success', progress: 100 } : f
                  ));
                  setCompletedFiles(prev => [...prev, fileResult.filename]);
                } else {
                  setUploadingFiles(prev => prev.map(f => 
                    f.name === fileResult.filename ? { ...f, status: 'error', error: fileResult.message } : f
                  ));
                }
              });
            }
            
            // Set overall status
            const successCount = result.successCount || 0;
            const failedCount = (result.failedCount || 0) + invalidFiles.length;
            
            if (successCount > 0 && failedCount === 0) {
              setUploadStatus('success');
            } else if (successCount === 0 && failedCount > 0) {
              setUploadStatus('error');
              setFileError(`All ${failedCount} file(s) failed to upload`);
            } else if (successCount > 0 && failedCount > 0) {
              setUploadStatus('partial');
              setFileError(`${failedCount} of ${files.length} file(s) failed to upload`);
            }
          } catch (err) {
            console.error('Batch upload error:', err);
            setUploadStatus('error');
            // Extract error message from server response
            const serverMessage = err.response?.data?.message || err.response?.data?.error;
            const errorMessage = serverMessage || err.message || 'Batch upload failed';
            setFileError(errorMessage);
            // Mark all pending files as errors with server message
            setUploadingFiles(prev => prev.map(f => 
              f.status === 'pending' ? { ...f, status: 'error', error: serverMessage || 'Upload failed' } : f
            ));
          }
        } else {
          // All files were invalid
          setUploadStatus('error');
          setFileError(`All ${files.length} file(s) failed validation`);
        }
      } else if (multiple) {
        // Handle multiple files individually (legacy mode)
        setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending', progress: 0 })));
        setCompletedFiles([]);
        setUploadStatus('uploading');
        
        let successCount = 0;
        let errorCount = 0;
        
        // Helper to update individual file status
        const updateFileStatus = (fileName, status, progress = 0) => {
          if (status === 'scanning') {
            flushSync(() => {
              setUploadingFiles(prev => prev.map(f => 
                f.name === fileName ? { ...f, status, progress } : f
              ));
            });
          } else {
            setUploadingFiles(prev => prev.map(f => 
              f.name === fileName ? { ...f, status, progress } : f
            ));
          }
        };
        
        for (const file of files) {
          const error = validateFile(file);
          if (error) {
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error } : f
            ));
            errorCount++;
            continue;
          }
          
          try {
            await processFileUpload(file, true, updateFileStatus);
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'success', progress: 100 } : f
            ));
            setCompletedFiles(prev => [...prev, file.name]);
            successCount++;
          } catch (err) {
            // Extract error message from server response
            const serverMessage = err.response?.data?.message || err.response?.data?.error;
            const errorMessage = serverMessage || err.message || 'Upload failed';
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error: errorMessage } : f
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
  }, [validateFile, processFileUpload, multiple, onBatchFileDrop]);
  
  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      if (multiple && onBatchFileDrop && files.length > 1) {
        // Handle batch upload - all files in one request
        setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending', progress: 0 })));
        setCompletedFiles([]);
        setUploadStatus('uploading');
        
        // Validate all files first
        const validFiles = [];
        const invalidFiles = [];
        
        for (const file of files) {
          const error = validateFile(file);
          if (error) {
            invalidFiles.push({ name: file.name, error });
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error } : f
            ));
          } else {
            validFiles.push(file);
          }
        }
        
        // If we have valid files, send batch upload
        if (validFiles.length > 0) {
          try {
            // Call batch upload with progress handler
            const result = await onBatchFileDrop(validFiles, (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percentCompleted);
            });
            
            // Process batch response - update each file status based on results
            if (result.results) {
              result.results.forEach(fileResult => {
                if (fileResult.success) {
                  setUploadingFiles(prev => prev.map(f => 
                    f.name === fileResult.filename ? { ...f, status: 'success', progress: 100 } : f
                  ));
                  setCompletedFiles(prev => [...prev, fileResult.filename]);
                } else {
                  setUploadingFiles(prev => prev.map(f => 
                    f.name === fileResult.filename ? { ...f, status: 'error', error: fileResult.message } : f
                  ));
                }
              });
            }
            
            // Set overall status
            const successCount = result.successCount || 0;
            const failedCount = (result.failedCount || 0) + invalidFiles.length;
            
            if (successCount > 0 && failedCount === 0) {
              setUploadStatus('success');
            } else if (successCount === 0 && failedCount > 0) {
              setUploadStatus('error');
              setFileError(`All ${failedCount} file(s) failed to upload`);
            } else if (successCount > 0 && failedCount > 0) {
              setUploadStatus('partial');
              setFileError(`${failedCount} of ${files.length} file(s) failed to upload`);
            }
          } catch (err) {
            console.error('Batch upload error:', err);
            setUploadStatus('error');
            // Extract error message from server response
            const serverMessage = err.response?.data?.message || err.response?.data?.error;
            const errorMessage = serverMessage || err.message || 'Batch upload failed';
            setFileError(errorMessage);
            // Mark all pending files as errors with server message
            setUploadingFiles(prev => prev.map(f => 
              f.status === 'pending' ? { ...f, status: 'error', error: serverMessage || 'Upload failed' } : f
            ));
          }
        } else {
          // All files were invalid
          setUploadStatus('error');
          setFileError(`All ${files.length} file(s) failed validation`);
        }
      } else if (multiple) {
        // Handle multiple files individually (legacy mode)
        setUploadingFiles(files.map(f => ({ name: f.name, status: 'pending', progress: 0 })));
        setCompletedFiles([]);
        setUploadStatus('uploading');
        
        let successCount = 0;
        let errorCount = 0;
        
        // Helper to update individual file status
        const updateFileStatus = (fileName, status, progress = 0) => {
          if (status === 'scanning') {
            flushSync(() => {
              setUploadingFiles(prev => prev.map(f => 
                f.name === fileName ? { ...f, status, progress } : f
              ));
            });
          } else {
            setUploadingFiles(prev => prev.map(f => 
              f.name === fileName ? { ...f, status, progress } : f
            ));
          }
        };
        
        for (const file of files) {
          const error = validateFile(file);
          if (error) {
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error } : f
            ));
            errorCount++;
            continue;
          }
          
          try {
            await processFileUpload(file, true, updateFileStatus);
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'success', progress: 100 } : f
            ));
            setCompletedFiles(prev => [...prev, file.name]);
            successCount++;
          } catch (err) {
            // Extract error message from server response
            const serverMessage = err.response?.data?.message || err.response?.data?.error;
            const errorMessage = serverMessage || err.message || 'Upload failed';
            setUploadingFiles(prev => prev.map(f => 
              f.name === file.name ? { ...f, status: 'error', error: errorMessage } : f
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
  }, [validateFile, processFileUpload, multiple, onBatchFileDrop]);
  
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
            <div className="success-icon-wrapper">
              <FiCheckCircle className="dropzone-success-icon" />
            </div>
            {multiple && uploadingFiles.length > 0 ? (
              <div>
                <p>{completedFiles.length} file(s) uploaded successfully!</p>
                {virusScan && (
                  <div className={`gps-dropzone-scan-banner ${virusScan.skipped ? 'gps-dropzone-scan-banner--warning' : 'gps-dropzone-scan-banner--clean'}`}>
                    <strong>Security Scan: </strong>
                    {virusScan.clean && !virusScan.skipped && (
                      <span>✓ Files scanned - No vulnerabilities found</span>
                    )}
                    {virusScan.skipped && (
                      <span>⚠ {virusScan.message}</span>
                    )}
                  </div>
                )}
                <div className="gps-dropzone-file-list">
                  {uploadingFiles.map((file, idx) => (
                    <div key={`uploading-1-${file.name || file.id || idx}`} className="gps-dropzone-file-item">
                      <span className="gps-dropzone-file-name">{file.name}</span>
                      <div className="gps-dropzone-file-status">
                        {file.error && <span className="gps-dropzone-file-error">{file.error}</span>}
                        {file.status === 'success' && <FiCheckCircle className="gps-dropzone-icon-success" />}
                        {file.status === 'error' && <FiAlertCircle className="gps-dropzone-icon-error" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p>File uploaded successfully!</p>
                {virusScan && (
                  <div className={`gps-dropzone-scan-banner ${virusScan.skipped ? 'gps-dropzone-scan-banner--warning' : 'gps-dropzone-scan-banner--clean'}`}>
                    <strong>Security Scan: </strong>
                    {virusScan.clean && !virusScan.skipped && (
                      <span>✓ File scanned - No vulnerabilities found</span>
                    )}
                    {virusScan.skipped && (
                      <span>⚠ {virusScan.message}</span>
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
              <div className="gps-dropzone-file-list">
                {uploadingFiles.map((file, idx) => (
                  <div key={`uploading-2-${file.name || file.id || idx}`} className="gps-dropzone-file-item">
                    <span className="gps-dropzone-file-name">{file.name}</span>
                    <div className="gps-dropzone-file-status">
                      {file.error && <span className="gps-dropzone-file-error">{file.error}</span>}
                      <FiAlertCircle className="gps-dropzone-icon-error" />
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
              <div className="gps-dropzone-file-list">
                {uploadingFiles.map((file, idx) => (
                  <div key={`uploading-3-${file.name || file.id || idx}`} className="gps-dropzone-file-item">
                    <span className="gps-dropzone-file-name">{file.name}</span>
                    <div className="gps-dropzone-file-status">
                      {file.error && <span className="gps-dropzone-file-error">{file.error}</span>}
                      {file.status === 'success' && <FiCheckCircle className="gps-dropzone-icon-success" />}
                      {file.status === 'error' && <FiAlertCircle className="gps-dropzone-icon-error" />}
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
                <p>Processing {uploadingFiles.length} file(s)...</p>
                <div className="gps-dropzone-file-list">
                  {uploadingFiles.map((file, idx) => (
                    <div key={`uploading-4-${file.name || file.id || idx}`} className="gps-dropzone-file-item">
                      <span className="gps-dropzone-file-name">{file.name}</span>
                      <div className="gps-dropzone-file-status">
                        {file.status === 'scanning' && (
                          <>
                            <FiLoader className="gps-dropzone-icon-pending" style={{ animation: 'spin 1s linear infinite' }} />
                            <span className="gps-dropzone-file-scanning">Scanning...</span>
                          </>
                        )}
                        {file.status === 'uploading' && (
                          <span className="gps-dropzone-file-uploading">
                            {file.progress > 0 ? `${file.progress}%` : 'Uploading...'}
                          </span>
                        )}
                        {file.status === 'success' && (
                          <>
                            <FiCheckCircle className="gps-dropzone-icon-success" />
                            <span className="gps-dropzone-file-complete">Complete</span>
                          </>
                        )}
                        {file.status === 'error' && (
                          <>
                            <FiAlertCircle className="gps-dropzone-icon-error" />
                            <span className="gps-dropzone-file-failed">Failed</span>
                          </>
                        )}
                        {file.status === 'pending' && (
                          <span className="gps-dropzone-file-pending">Waiting...</span>
                        )}
                      </div>
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
                  accept={getAcceptString()}
                  multiple={multiple}
                />
              </label>
            </div>
            <div className="file-requirements">
              <p>Supported file types: {acceptedFileTypes.join(', ')}</p>
              <p className="file-size-limit">Maximum file size: {maxSizeMB}MB</p>
              {maxSizeMB <= 25 && (
                <p className="file-size-helper">For larger files, please use ETL Mapping Jobs</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
FileDropzone.propTypes = {
  onFileDrop: PropTypes.func.isRequired,
  onBatchFileDrop: PropTypes.func,
  onFilesChange: PropTypes.func,
  acceptedFileTypes: PropTypes.arrayOf(PropTypes.string),
  maxSizeMB: PropTypes.number,
  multiple: PropTypes.bool,
  virusScan: PropTypes.shape({
    clean: PropTypes.bool,
    skipped: PropTypes.bool,
    message: PropTypes.string
  }),
  externalStatus: PropTypes.oneOf([
    'checking',
    'uploading',
    'success',
    'error',
    'partial'
  ])
};

FileDropzone.defaultProps = {
  acceptedFileTypes: ['.csv', '.json', '.parquet'],
  maxSizeMB: 500,
  multiple: false,
  virusScan: null,
  externalStatus: null,
  onBatchFileDrop: null,
  onFilesChange: null
};

export default FileDropzone;