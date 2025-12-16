import React, { useState, useEffect } from 'react';
import { FiFile, FiDatabase, FiRefreshCw, FiAlertCircle, FiInfo } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from '../LoadingSpinner';
import './Transform.css';
import PropTypes from 'prop-types';


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
        <div className="file-dropdown-section">
          <div className="dropdown-container">
            <label htmlFor="file-select" className="dropdown-label">
              Choose File:
            </label>
            <select 
              id="file-select"
              className="file-dropdown"
              value={selectedFile?.file_id || ''}
              onChange={(e) => {
                const selectedFileId = e.target.value;
                if (selectedFileId) {
                  const file = files.find(f => f.file_id === selectedFileId);
                  if (file) {
                    loadFileSchema(file);
                  }
                }
              }}
            >
              <option value="">Select a file...</option>
              {files.map(file => (
                <option key={file.file_id} value={file.file_id}>
                  {file.filename} - {file.file_type?.toUpperCase()} ({file.row_count} rows, {file.column_count} cols)
                </option>
              ))}
            </select>
          </div>

          {/* File Details Section */}
          {selectedFile && (
            <div className="selected-file-summary">
              <h3>Selected File Details</h3>
              <div className="file-details-grid">
                <div className="detail-item">
                  <span className="label">Filename:</span>
                  <span className="value">{selectedFile.filename}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Type:</span>
                  <span className="value">{selectedFile.file_type?.toUpperCase()}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Size:</span>
                  <span className="value">{formatFileSize(parseInt(selectedFile.file_size))}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Rows:</span>
                  <span className="value">{selectedFile.row_count || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Columns:</span>
                  <span className="value">{selectedFile.column_count || 0}</span>
                </div>
                {selectedFile.quality_score && (
                  <div className="detail-item">
                    <span className="label">Quality Score:</span>
                    <span className="value">{parseFloat(selectedFile.quality_score).toFixed(1)}%</span>
                  </div>
                )}
                <div className="detail-item">
                  <span className="label">Last Updated:</span>
                  <span className="value">{formatDate(selectedFile.updated_at)}</span>
                </div>
              </div>
            </div>
          )}

          {schemaLoading && (
            <div className="schema-loading">
              <LoadingSpinner size="small" />
              <span>Loading file schema...</span>
            </div>
          )}
        </div>
      )}


    </div>
  );
};

FileSelector.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
    connection_name: PropTypes.string,
    type: PropTypes.string
  }),

  selectedFile: PropTypes.shape({
    file_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    filename: PropTypes.string,
    file_type: PropTypes.string,
    file_size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    row_count: PropTypes.number,
    column_count: PropTypes.number,
    quality_score: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    updated_at: PropTypes.string
  }),

  onFileSelect: PropTypes.func.isRequired
};

export default FileSelector;