import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import './DataProfile.css';

export const DataProfile = ({ selectedFile }) => {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedFile) {
      fetchProfileData();
    } else {
      setProfileData(null);
    }
  }, [selectedFile]);

  const fetchProfileData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In a real app, this would be an API call
      // For example: const response = await api.getFileProfile(selectedFile.id);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock profile data
      const mockProfileData = {
        id: selectedFile.id,
        fileName: selectedFile.fileName,
        fileSize: selectedFile.fileSize,
        fileType: selectedFile.fileType,
        rows: selectedFile.rows,
        columns: selectedFile.columns,
        createdAt: selectedFile.processedAt,
        columnStats: generateMockColumnStats(selectedFile.columns),
        completeness: 98.2,
        duplicateRows: Math.floor(selectedFile.rows * 0.02), // 2% duplicates
        nullValues: Math.floor(selectedFile.rows * 0.03), // 3% null values
        dataTypes: {
          numeric: Math.floor(selectedFile.columns * 0.4),
          text: Math.floor(selectedFile.columns * 0.3),
          datetime: Math.floor(selectedFile.columns * 0.1),
          boolean: Math.floor(selectedFile.columns * 0.1),
          other: Math.floor(selectedFile.columns * 0.1)
        }
      };
      
      setProfileData(mockProfileData);
    } catch (err) {
      setError('Failed to fetch profile data. Please try again.');
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to generate mock column statistics
  const generateMockColumnStats = (numColumns) => {
    const columnTypes = ['text', 'numeric', 'numeric', 'datetime', 'boolean'];
    const columns = [];
    
    for (let i = 0; i < numColumns; i++) {
      const columnType = columnTypes[i % columnTypes.length];
      
      const column = {
        name: `column_${i + 1}`,
        type: columnType,
        nullCount: Math.floor(Math.random() * 50),
        uniqueCount: columnType === 'text' ? Math.floor(Math.random() * 500) + 100 : Math.floor(Math.random() * 20) + 5,
        completeness: (90 + Math.random() * 10).toFixed(1)
      };
      
      // Add type-specific stats
      if (columnType === 'numeric') {
        column.min = (Math.random() * 100).toFixed(2);
        column.max = (parseFloat(column.min) + Math.random() * 900).toFixed(2);
        column.mean = ((parseFloat(column.min) + parseFloat(column.max)) / 2).toFixed(2);
        column.stdDev = (Math.random() * 50).toFixed(2);
      } else if (columnType === 'text') {
        column.minLength = Math.floor(Math.random() * 5) + 1;
        column.maxLength = column.minLength + Math.floor(Math.random() * 20) + 5;
        column.avgLength = Math.floor((column.minLength + column.maxLength) / 2);
      }
      
      columns.push(column);
    }
    
    return columns;
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

  if (!selectedFile) {
    return (
      <div className="data-profile-container">
        <h1 className="page-title">Data Profile</h1>
        <Card>
          <div className="no-file-message">
            <p>No file selected. Please upload a file or select a file from the catalog.</p>
            <button className="btn" onClick={() => window.history.pushState({}, '', '/')}>
              Upload a File
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="data-profile-container">
        <h1 className="page-title">Data Profile</h1>
        <div className="loading">Loading profile data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-profile-container">
        <h1 className="page-title">Data Profile</h1>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="data-profile-container">
      <h1 className="page-title">Data Profile</h1>
      
      {profileData && (
        <>
          <Card title="File Overview" className="overview-card">
            <div className="overview-grid">
              <div className="overview-item">
                <div className="overview-label">File Name</div>
                <div className="overview-value">{profileData.fileName}</div>
              </div>
              <div className="overview-item">
                <div className="overview-label">File Size</div>
                <div className="overview-value">{formatBytes(profileData.fileSize)}</div>
              </div>
              <div className="overview-item">
                <div className="overview-label">File Type</div>
                <div className="overview-value">{profileData.fileType || 'Unknown'}</div>
              </div>
              <div className="overview-item">
                <div className="overview-label">Rows</div>
                <div className="overview-value">{profileData.rows.toLocaleString()}</div>
              </div>
              <div className="overview-item">
                <div className="overview-label">Columns</div>
                <div className="overview-value">{profileData.columns}</div>
              </div>
              <div className="overview-item">
                <div className="overview-label">Processed At</div>
                <div className="overview-value">{formatDate(profileData.createdAt)}</div>
              </div>
            </div>
          </Card>
          
          <div className="profile-grid">
            <Card title="Data Completeness" className="completeness-card">
              <div className="completeness-meter">
                <div className="meter-container">
                  <div 
                    className="meter-fill" 
                    style={{ width: `${profileData.completeness}%` }}
                  ></div>
                </div>
                <div className="meter-value">{profileData.completeness}%</div>
              </div>
              
              <div className="completeness-stats">
                <div className="stat-row">
                  <div className="stat-label">Null Values:</div>
                  <div className="stat-value">{profileData.nullValues.toLocaleString()}</div>
                </div>
                <div className="stat-row">
                  <div className="stat-label">Duplicate Rows:</div>
                  <div className="stat-value">{profileData.duplicateRows.toLocaleString()}</div>
                </div>
              </div>
            </Card>
            
            <Card title="Data Types Distribution" className="types-card">
              <div className="data-types-chart">
                {Object.entries(profileData.dataTypes).map(([type, count]) => (
                  <div key={type} className="data-type-item">
                    <div className="data-type-label">{type}</div>
                    <div className="data-type-bar-container">
                      <div 
                        className={`data-type-bar ${type}`}
                        style={{ 
                          width: `${(count / profileData.columns) * 100}%` 
                        }}
                      ></div>
                    </div>
                    <div className="data-type-count">{count}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          
          <Card title="Column Statistics" className="columns-card">
            <div className="column-stats-header">
              <div className="column-header name">Name</div>
              <div className="column-header type">Type</div>
              <div className="column-header completeness">Completeness</div>
              <div className="column-header unique-values">Unique Values</div>
              <div className="column-header stats">Statistics</div>
            </div>
            
            <div className="column-stats-body">
              {profileData.columnStats.map((column, index) => (
                <div key={index} className="column-stats-row">
                  <div className="column-cell name">{column.name}</div>
                  <div className="column-cell type">
                    <span className={`type-badge ${column.type}`}>
                      {column.type}
                    </span>
                  </div>
                  <div className="column-cell completeness">
                    <div className="mini-meter-container">
                      <div 
                        className="mini-meter-fill" 
                        style={{ width: `${column.completeness}%` }}
                      ></div>
                    </div>
                    <span>{column.completeness}%</span>
                  </div>
                  <div className="column-cell unique-values">{column.uniqueCount}</div>
                  <div className="column-cell stats">
                    {column.type === 'numeric' && (
                      <span>
                        Min: {column.min}, Max: {column.max}, Mean: {column.mean}
                      </span>
                    )}
                    {column.type === 'text' && (
                      <span>
                        Length: {column.minLength}-{column.maxLength} (avg: {column.avgLength})
                      </span>
                    )}
                    {(column.type === 'datetime' || column.type === 'boolean') && (
                      <span>-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};