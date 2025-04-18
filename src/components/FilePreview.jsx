import React, { useState, useEffect } from 'react';
import { FiDownload, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import axios from 'axios';
import './FilePreview.css';

const FilePreview = ({ fileId, maxRows = 100 }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  
  useEffect(() => {
    if (fileId) {
      fetchPreviewData();
    }
  }, [fileId]);
  
  const fetchPreviewData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get(`/api/files/${fileId}/preview?limit=${maxRows}`);
      setPreviewData(response.data);
    } catch (err) {
      console.error('Error fetching file preview:', err);
      setError(err.response?.data?.error || 'Failed to load file preview');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="file-preview-loading">
        <div className="loading-spinner"></div>
        <p>Loading file preview...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="file-preview-error">
        <FiAlertTriangle size={24} />
        <p>{error}</p>
        <button className="refresh-button" onClick={fetchPreviewData}>
          <FiRefreshCw /> Try Again
        </button>
      </div>
    );
  }
  
  if (!previewData || !previewData.data || previewData.data.length === 0) {
    return (
      <div className="file-preview-empty">
        <p>No data available to preview.</p>
      </div>
    );
  }
  
  // Extract column names from the first data row
  const columns = Object.keys(previewData.data[0]);
  
  return (
    <div className="file-preview-container">
      <div className="file-preview-header">
        <div className="preview-info">
          <h3>File Preview</h3>
          <span className="preview-count">
            Showing {previewData.data.length} of {previewData.total_rows} rows
          </span>
        </div>
        <div className="preview-actions">
          <button className="refresh-button" onClick={fetchPreviewData}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>
      
      <div className="preview-table-container">
        <table className="preview-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={index}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column, colIndex) => (
                  <td key={colIndex}>
                    {row[column] !== null && row[column] !== undefined 
                      ? String(row[column]) 
                      : <span className="null-value">NULL</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="file-preview-footer">
        <div className="file-details">
          <span className="file-name">{previewData.filename}</span>
          <span className="file-type">{previewData.file_type.toUpperCase()}</span>
        </div>
        
        <div className="preview-notice">
          {previewData.data.length < previewData.total_rows && (
            <span>Only showing first {previewData.data.length} records</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreview;