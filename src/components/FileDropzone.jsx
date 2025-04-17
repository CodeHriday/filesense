import React, { useState, useRef } from 'react';
import './FileDropzone.css';

export const FileDropzone = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const validateFile = (file) => {
    // Check file type
    const validTypes = ['.csv', '.json', '.parquet', 'text/csv', 'application/json', 'application/octet-stream'];
    const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isValidType = validTypes.some(type => 
      type.startsWith('.') ? fileExtension === type : file.type === type
    );
    
    if (!isValidType) {
      return 'Invalid file type. Please upload CSV, JSON, or Parquet files.';
    }
    
    // Check file size (limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return 'File is too large. Maximum file size is 10MB.';
    }
    
    return null;
  };
  
  const processFile = (file) => {
    const validationError = validateFile(file);
    
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setError(null);
    onFileSelect && onFileSelect(file);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };
  
  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processFile(file);
    }
  };
  
  const handleButtonClick = () => {
    fileInputRef.current && fileInputRef.current.click();
  };
  
  return (
    <div className="file-dropzone-container">
      <div 
        className={`file-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone-content">
          <div className="dropzone-icon">📁</div>
          <div className="dropzone-text">
            <p>Drag and drop your file here, or</p>
            <button className="btn" onClick={handleButtonClick}>
              Browse Files
            </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef}
            className="file-input"
            onChange={handleFileInputChange}
            accept=".csv,.json,.parquet"
          />
        </div>
      </div>
      
      {error && (
        <div className="alert alert-error file-error">
          {error}
        </div>
      )}
      
      <div className="dropzone-help">
        <p>Supported file formats: CSV, JSON, Parquet</p>
        <p>Maximum file size: 10MB</p>
      </div>
    </div>
  );
};