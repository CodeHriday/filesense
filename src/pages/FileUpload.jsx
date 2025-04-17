import React, { useState } from 'react';
import { Card } from '../components/Card';
import { FileDropzone } from '../components/FileDropzone';
import './FileUpload.css';

export const FileUpload = ({ onFileSelect }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processSuccess, setProcessSuccess] = useState(false);
  const [processError, setProcessError] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setProcessSuccess(false);
    setProcessError(null);
    setFileMetadata(null);
    onFileSelect && onFileSelect(null); // Reset the parent's selected file
  };

  const processFile = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    setProcessSuccess(false);
    setProcessError(null);
    
    try {
      // In a real application, this would be an API call to process the file
      // For example: const response = await api.uploadFile(selectedFile);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock result from file processing
      const metadata = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        rows: Math.floor(Math.random() * 10000) + 1000,
        columns: Math.floor(Math.random() * 20) + 5,
        processedAt: new Date().toISOString(),
        id: 'file_' + Math.random().toString(36).substr(2, 9)
      };
      
      setFileMetadata(metadata);
      setProcessSuccess(true);
      onFileSelect && onFileSelect(metadata);
    } catch (err) {
      setProcessError('Failed to process file. Please try again.');
      console.error('File processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="file-upload-container">
      <h1 className="page-title">File Upload</h1>
      
      <Card title="Upload Data File">
        <p className="upload-instructions">
          Upload your data files (CSV, JSON, or Parquet) to analyze their structure, 
          quality, and track changes over time.
        </p>
        
        <FileDropzone onFileSelect={handleFileSelect} />
        
        {selectedFile && (
          <div className="selected-file-info">
            <h3>Selected File:</h3>
            <p><strong>Name:</strong> {selectedFile.name}</p>
            <p><strong>Size:</strong> {formatBytes(selectedFile.size)}</p>
            <p><strong>Type:</strong> {selectedFile.type || 'Unknown'}</p>
            
            <button 
              className={`btn ${isProcessing ? 'btn-disabled' : ''}`}
              onClick={processFile}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Process File'}
            </button>
          </div>
        )}
        
        {processError && (
          <div className="alert alert-error">
            {processError}
          </div>
        )}
        
        {processSuccess && fileMetadata && (
          <div className="process-success">
            <div className="alert alert-success">
              File processed successfully!
            </div>
            
            <div className="file-metadata">
              <h3>File Metadata:</h3>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="metadata-label">ID:</span>
                  <span className="metadata-value">{fileMetadata.id}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Rows:</span>
                  <span className="metadata-value">{fileMetadata.rows.toLocaleString()}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Columns:</span>
                  <span className="metadata-value">{fileMetadata.columns}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Processed At:</span>
                  <span className="metadata-value">{formatDate(fileMetadata.processedAt)}</span>
                </div>
              </div>
              
              <div className="next-steps">
                <p>Next Steps:</p>
                <ul>
                  <li>View the <strong>Data Profile</strong> for detailed statistics</li>
                  <li>Run <strong>Quality Checks</strong> to validate your data</li>
                  <li>Configure <strong>Alerts</strong> for data quality issues</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </Card>
      
      <Card title="Supported File Formats">
        <div className="supported-formats">
          <div className="format-item">
            <div className="format-icon">📄</div>
            <div className="format-details">
              <h3>CSV</h3>
              <p>Comma-separated values files with headers. Both standard CSV and TSV (tab-separated) formats are supported.</p>
            </div>
          </div>
          
          <div className="format-item">
            <div className="format-icon">🔠</div>
            <div className="format-details">
              <h3>JSON</h3>
              <p>JSON files containing arrays of objects or newline-delimited JSON records.</p>
            </div>
          </div>
          
          <div className="format-item">
            <div className="format-icon">📊</div>
            <div className="format-details">
              <h3>Parquet</h3>
              <p>Apache Parquet columnar storage files, commonly used for big data processing.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};