import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import FileDropzone from '../components/FileDropzone';
import { uploadFile } from '../api/fileService';
import './FileUpload.css';

function FileUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const navigate = useNavigate();
  
  const handleFileDrop = async (file) => {
    try {
      setUploadStatus('uploading');
      
      // Upload the file
      const result = await uploadFile(file);
      
      setUploadedFile({
        fileId: result.fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });
      
      setUploadStatus('success');
      
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus('error');
      throw error;
    }
  };
  
  const handleViewProfile = () => {
    if (uploadedFile && uploadedFile.fileId) {
      navigate(`/profile/${uploadedFile.fileId}`);
    }
  };
  
  const handleUploadAnother = () => {
    setUploadStatus(null);
    setUploadedFile(null);
  };

  return (
    <div className="file-upload-container">
      <h1>Upload File</h1>
      
      <Card>
        <div className="upload-instructions">
          <h2>Add a new file to the observatory</h2>
          <p>
            Upload a data file to analyze its structure, profile its content, and track
            changes over time. Supported file types include CSV, JSON, and Parquet.
          </p>
        </div>
        
        <FileDropzone 
          onFileDrop={handleFileDrop}
          acceptedFileTypes={['.csv', '.json', '.parquet']}
          maxSizeMB={50}
        />
        
        {uploadStatus === 'success' && uploadedFile && (
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
        )}
      </Card>
    </div>
  );
}

export default FileUpload;