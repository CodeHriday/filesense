import React, { useState, useEffect } from 'react';
import { FiDownload, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import axios from 'axios';
import './FilePreview.css';

const FilePreview = ({ fileId, maxRows = 100, columnQualityData = [] }) => {
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
      
      console.log('Fetching preview data for fileId:', fileId);
      const response = await axios.get(`/api/files/${fileId}/preview?limit=${maxRows}`, {
        timeout: 60000 // 60 second timeout for preview loading
      });
      console.log('Preview data received:', response.data);
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
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <LoadingSpinner />
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
  
  if (!previewData || (!previewData.rows && !previewData.data) || (previewData.rows && previewData.rows.length === 0) || (previewData.data && previewData.data.length === 0)) {
    return (
      <div className="file-preview-empty">
        <p>No data available to preview.</p>
      </div>
    );
  }
  
  // Helper function to get quality score for a column
  const getColumnQualityScore = (columnName) => {
    if (!columnQualityData || !columnQualityData.length) return null;
    
    const columnData = columnQualityData.find(col => col.name === columnName);
    if (!columnData) return null;
    
    // Calculate quality score based on the existing formula components
    const totalRows = previewData?.rows?.length || previewData?.data?.length || 100;
    
    // Component weights from our quality formula
    const weights = {
      completeness: 0.30,
      uniqueness: 0.15,
      validity: 0.20,
      consistency: 0.25,
      timeliness: 0.10
    };
    
    // Calculate component scores
    const completeness = columnData.missing !== undefined ? 
      ((totalRows - columnData.missing) / totalRows) * 100 : 100;
    
    // Calculate uniqueness only if it makes sense for this column
    // Higher uniqueness is better for ID columns, but not for category columns
    const uniqueness = columnData.unique !== undefined ? 
      (columnData.unique / totalRows) * 100 : 100;
    
    // For simplicity, assume validity and consistency are high if we don't have specific data
    const validity = 95;
    const consistency = 90;
    
    // Timeliness is based on the file's freshness, not column-specific
    const timeliness = 100;
    
    // Calculate weighted score
    const score = (
      weights.completeness * completeness +
      weights.uniqueness * uniqueness +
      weights.validity * validity +
      weights.consistency * consistency +
      weights.timeliness * timeliness
    );
    
    return Math.round(score) / 100; // Return on a scale of 0-1
  };
  
  // Get color for quality score
  const getScoreColor = (score) => {
    if (score === null) return '#999'; // Gray for no score
    if (score >= 0.9) return '#27ae60'; // Green
    if (score >= 0.7) return '#2ecc71'; // Light green
    if (score >= 0.5) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
  };
  
  // Check the structure of the data
  const rows = previewData.rows || previewData.data || [];
  const totalRows = previewData.totalRows || previewData.total_rows || rows.length;
  
  // Get column names - if columns array is empty or undefined, extract from first row
  const columnNames = (previewData.columns && previewData.columns.length > 0) ? 
                      previewData.columns.map(col => col.name) : 
                      (rows.length > 0 ? Object.keys(rows[0]) : []);
  
  // Render a quality score indicator
  const renderQualityScore = (columnName) => {
    const qualityScore = getColumnQualityScore(columnName);
    if (qualityScore === null) return null;
    
    const scoreColor = getScoreColor(qualityScore);
    const scorePercentage = Math.round(qualityScore * 100);
    
    return (
      <div 
        className="quality-score-circle" 
        style={{ backgroundColor: scoreColor }}
        title={`Quality Score: ${scorePercentage}%
Completeness: 30%
Consistency: 25%
Validity: 20%
Uniqueness: 15%
Timeliness: 10%`}
      >
        {scorePercentage}
      </div>
    );
  };

  return (
    <div className="file-preview-container">
      <div className="file-preview-header">
        <div className="preview-info">
          <h3>File Preview</h3>
          <span className="preview-count">
            Showing {rows.length} of {totalRows} rows
          </span>
        </div>
        <div className="preview-actions">
          <button className="refresh-button" onClick={fetchPreviewData}>
            <FiRefreshCw /> Refresh
          </button>
        </div>
      </div>
      
      <div className="preview-table-wrapper">
        <table className="preview-table">
          <thead>
            <tr>
              {columnNames.map((column, index) => (
                <th key={index}>
                  <div className="header-cell">
                    <span className="column-name">{column}</span>
                    {renderQualityScore(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columnNames.map((column, colIndex) => (
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
          <span className="file-name">{previewData.filename || previewData.fileId}</span>
          <span className="file-type">{previewData.file_type ? previewData.file_type.toUpperCase() : 'FILE'}</span>
        </div>
        
        <div className="preview-notice">
          {rows.length < totalRows && (
            <span>Only showing first {rows.length} records</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreview;