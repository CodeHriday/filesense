import React, { useState, useEffect } from 'react';
import { FiRefreshCw, FiAlertTriangle, FiTrash2, FiLock, FiEyeOff } from 'react-icons/fi';
import LoadingSpinner from './LoadingSpinner';
import axios from 'axios';
import '../styles/global-page-styles.css';
import './FilePreview.css';
import PropTypes from 'prop-types';

const FilePreview = ({ fileId, maxRows = 100, columnQualityData = [] }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [columnAccess, setColumnAccess] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState(null);
  
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
      const response = await axios.get(`/api/files/${encodeURIComponent(fileId)}/preview?limit=${maxRows}`, {
        timeout: 60000 // 60 second timeout for preview loading
      });
      console.log('Preview data received:', response.data);
      setPreviewData(response.data);
      
      // Store column access metadata if available
      if (response.data.columnAccess) {
        setColumnAccess(response.data.columnAccess);
      }
    } catch (err) {
      console.error('Error fetching file preview:', err);
      setError(err.response?.data?.error || 'Failed to load file preview');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeletePreviewData = async () => {
    try {
      setDeleting(true);
      const token = localStorage.getItem('token');
      await axios.delete(`/api/files/${encodeURIComponent(fileId)}/preview-data`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      // Clear preview data from state
      setPreviewData({ ...previewData, rows: [] });
      setShowDeleteConfirm(false);
      setNotification({
        type: 'success',
        message: 'Preview data deleted successfully'
      });
    } catch (err) {
      console.error('Error deleting preview data:', err);
      setShowDeleteConfirm(false);
      setNotification({
        type: 'error',
        message: 'Failed to delete preview data: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setDeleting(false);
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
        <p>No preview data available. Preview data has been deleted for security.</p>
      </div>
    );
  }
  
  // Helper function to get quality score for a column
  const getColumnQualityScore = (columnName) => {
    if (!columnQualityData || !columnQualityData.length) return null;
    
    const columnData = columnQualityData.find(col => col.name === columnName);
    if (!columnData) return null;
    
    // Use the actual total rows from the dataset, not the preview length
    const rows = previewData.rows || previewData.data || [];
    const totalRows = previewData.totalRows || previewData.total_rows || rows.length;
    
    // Quality score is based on completeness (non-null percentage)
    // This is the most accurate indicator of column data quality
    const completeness = columnData.missing !== undefined ? 
      Math.min(((totalRows - columnData.missing) / totalRows) * 100, 100) : 100;
    
    return Math.round(completeness) / 100; // Return on a scale of 0-1
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
  
  // Check if a column is masked or denied
  const getColumnAccessStatus = (columnName) => {
    // Check columnAccess object first (from preview API response)
    if (columnAccess) {
      const maskedColumn = columnAccess.masked?.find(col => col.name === columnName);
      if (maskedColumn) {
        return {
          status: 'masked',
          tags: maskedColumn.tags || [],
          requiredPermissions: maskedColumn.requiresPermission || []
        };
      }
      
      const deniedColumn = columnAccess.denied?.find(col => col.name === columnName);
      if (deniedColumn) {
        return {
          status: 'denied',
          tags: deniedColumn.tags || [],
          requiredPermissions: deniedColumn.requiresPermission || []
        };
      }
    }
    
    // Also check columnQualityData for _accessLevel property (from profile data)
    if (columnQualityData && columnQualityData.length > 0) {
      const qualityColumn = columnQualityData.find(col => col.name === columnName);
      if (qualityColumn) {
        const accessLevel = qualityColumn._accessLevel || qualityColumn.accessLevel;
        if (accessLevel === 'masked') {
          return {
            status: 'masked',
            tags: [],
            requiredPermissions: []
          };
        }
        if (accessLevel === 'none') {
          return {
            status: 'denied',
            tags: [],
            requiredPermissions: []
          };
        }
      }
    }
    
    return { status: 'allowed' };
  };
  
  // Helper function to check if a column value should be masked
  const shouldMaskColumnValue = (columnName) => {
    const accessStatus = getColumnAccessStatus(columnName);
    // Mask both 'masked' and 'denied' columns to prevent data exposure
    return accessStatus.status === 'masked' || accessStatus.status === 'denied';
  };

  // Render column access indicator (lock icon with tooltip)
  const renderColumnAccessIndicator = (columnName) => {
    const accessStatus = getColumnAccessStatus(columnName);
    
    if (accessStatus.status === 'allowed') return null;
    
    const isMasked = accessStatus.status === 'masked';
    const isDenied = accessStatus.status === 'denied';
    
    const tooltipText = isMasked 
      ? `Data Masked: You need ${accessStatus.requiredPermissions.join(' or ')} permission to view this column. Tagged: ${accessStatus.tags.join(', ')}`
      : `Access Denied: You need ${accessStatus.requiredPermissions.join(' or ')} permission to access this column. Tagged: ${accessStatus.tags.join(', ')}`;
    
    return (
      <div 
        className={`column-access-indicator ${isMasked ? 'masked' : 'denied'}`}
        title={tooltipText}
      >
        {isMasked ? <FiLock size={14} /> : <FiEyeOff size={14} />}
      </div>
    );
  };

  // Render a quality score indicator
  const renderQualityScore = (columnName) => {
    const qualityScore = getColumnQualityScore(columnName);
    if (qualityScore === null) return null;
    
    const scoreColor = getScoreColor(qualityScore);
    const scorePercentage = Math.round(qualityScore * 100);
    
    const columnData = columnQualityData.find(col => col.name === columnName);
    const nullCount = columnData?.missing || 0;
    const totalRows = previewData.totalRows || previewData.total_rows || (previewData.rows || previewData.data || []).length;
    const nonNullCount = totalRows - nullCount;
    
    return (
      <div 
        className="quality-score-circle" 
        style={{ backgroundColor: scoreColor }}
        title={`Data Completeness: ${scorePercentage}%
${nonNullCount} of ${totalRows} values present
${nullCount} null values`}
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
          <button 
            className="delete-preview-button" 
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete preview data for security"
          >
            <FiTrash2 /> Delete Preview Data
          </button>
        </div>
      </div>
      
      {showDeleteConfirm && (
        <div className="delete-confirm-modal">
          <div className="delete-confirm-content">
            <h3>Delete Preview Data?</h3>
            <p>
              This will permanently delete the {rows.length} preview rows stored for this file. 
              The file metadata and statistics will be retained.
            </p>
            <p className="warning-text">
              <FiAlertTriangle /> This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button 
                className="btn btn-danger"
                onClick={handleDeletePreviewData}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Preview Data'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {notification && (
        <div className="notification-modal">
          <div className={`notification-content notification-${notification.type}`}>
            <div className="notification-header">
              {notification.type === 'success' ? '✓' : '✕'}
            </div>
            <p>{notification.message}</p>
            <button 
              className="btn btn-primary"
              onClick={() => setNotification(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
      
      <div className="preview-table-wrapper">
        <table className="preview-table">
          <thead>
            <tr>
              {columnNames.map((column, index) => (
                <th key={`header-${column}-${index}`}>
                  <div className="header-cell">
                    <span className="column-name">{column}</span>
                    {renderColumnAccessIndicator(column)}
                    {renderQualityScore(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columnNames.map((column, colIndex) => (
                  <td key={`cell-${column}-${colIndex}`}>
                    {shouldMaskColumnValue(column) ? (
                      <span className="masked-value">****</span>
                    ) : (
                      row[column] !== null && row[column] !== undefined 
                        ? String(row[column]) 
                        : <span className="null-value">NULL</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {rows.length < totalRows && (
        <div className="file-preview-footer">
          <div className="preview-notice">
            <span>Only showing first {rows.length} records</span>
          </div>
        </div>
      )}
    </div>
  );
};
FilePreview.propTypes = {
  fileId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  maxRows: PropTypes.number,
  columnQualityData: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      missing: PropTypes.number,
      accessLevel: PropTypes.string,
      _accessLevel: PropTypes.string
    })
  )
};

FilePreview.defaultProps = {
  maxRows: 100,
  columnQualityData: []
};
export default FilePreview;