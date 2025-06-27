import React, { useState, useEffect } from 'react';
import { FiFile, FiDatabase, FiRefreshCw, FiAlertCircle, FiInfo } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from '../LoadingSpinner';
import './Transform.css';

/**
 * File Selector component for choosing a source file and loading its schema
 */
const FileSelector = ({ connection, selectedFile, onFileSelect }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  useEffect(() => {
    if (connection) {
      fetchFiles();
    }
  }, [connection]);

  const fetchFiles = async () => {
    if (!connection) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get files from the catalog that match this connection
      const response = await axios.get('/api/files', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      // Filter files based on connection type
      const availableFiles = response.data.filter(file => {
        // For now, show all files - in a real implementation, 
        // this would filter based on the connection's accessible files
        return true;
      });
      
      setFiles(availableFiles);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError('Failed to load files from connection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadFileSchema = async (file) => {
    try {
      setSchemaLoading(true);
      
      // Get file profile which includes schema information
      const response = await axios.get(`/api/files/${file.file_id}/profile`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      const profile = response.data;
      
      // Convert the profile columns to schema format
      const schema = profile.columns.map((col, index) => ({
        id: `col_${index}`,
        name: col.name,
        type: col.type,
        nullable: col.missing > 0,
        unique: col.unique,
        missing: col.missing,
        description: `${col.type} column with ${col.unique} unique values`
      }));
      
      onFileSelect(file, schema);
    } catch (err) {
      console.error('Error loading file schema:', err);
      setError('Failed to load file schema. Please try again.');
    } finally {
      setSchemaLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleDateString();
  };

  if (!connection) {
    return (
      <div className="file-selector no-connection">
        <div className="info-message">
          <FiInfo />
          <h3>No Source Connection Selected</h3>
          <p>Please select a source connection first to browse available files.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="file-selector loading">
        <LoadingSpinner />
        <p>Loading files from {connection.name || connection.connection_name}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-selector error">
        <FiAlertCircle />
        <p>{error}</p>
        <button className="btn btn-primary" onClick={fetchFiles}>
          <FiRefreshCw /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="file-selector">
      <div className="selector-header">
        <h2>Select Source File</h2>
        <p>Choose a file from <strong>{connection.name || connection.connection_name}</strong> to transform.</p>
        <button className="btn btn-secondary" onClick={fetchFiles}>
          <FiRefreshCw /> Refresh Files
        </button>
      </div>

      {files.length === 0 ? (
        <div className="no-files">
          <FiDatabase />
          <h3>No Files Available</h3>
          <p>No files were found in this connection. Make sure files are uploaded and accessible.</p>
        </div>
      ) : (
        <div className="file-grid">
          {files.map(file => (
            <div 
              key={file.file_id}
              className={`file-card ${selectedFile?.file_id === file.file_id ? 'selected' : ''}`}
              onClick={() => loadFileSchema(file)}
            >
              <div className="file-icon">
                <FiFile />
              </div>
              <div className="file-info">
                <h4>{file.filename}</h4>
                <div className="file-meta">
                  <span className="file-type">{file.file_type?.toUpperCase()}</span>
                  <span className="file-size">{formatFileSize(file.file_size)}</span>
                </div>
                <div className="file-stats">
                  <span>{file.row_count || 0} rows</span>
                  <span>{file.column_count || 0} columns</span>
                </div>
                <div className="file-date">
                  Processed: {formatDate(file.processed_at)}
                </div>
                {file.quality_score && (
                  <div className="quality-score">
                    Quality: {parseFloat(file.quality_score).toFixed(1)}%
                  </div>
                )}
              </div>
              {schemaLoading && selectedFile?.file_id === file.file_id && (
                <div className="loading-overlay">
                  <LoadingSpinner size="small" />
                  <span>Loading schema...</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedFile && (
        <div className="selected-file-summary">
          <h3>Selected File</h3>
          <div className="summary-content">
            <div className="summary-item">
              <strong>File:</strong> {selectedFile.filename}
            </div>
            <div className="summary-item">
              <strong>Type:</strong> {selectedFile.file_type?.toUpperCase()}
            </div>
            <div className="summary-item">
              <strong>Size:</strong> {formatFileSize(selectedFile.file_size)}
            </div>
            <div className="summary-item">
              <strong>Rows:</strong> {selectedFile.row_count || 0}
            </div>
            <div className="summary-item">
              <strong>Columns:</strong> {selectedFile.column_count || 0}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileSelector;