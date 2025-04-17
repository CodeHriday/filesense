import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiFileText, FiCalendar, FiBarChart2, FiAlertTriangle, FiDownload } from 'react-icons/fi';
import Card from '../components/Card';
import { getFileDetails, getFileProfile } from '../api/fileService';
import { formatBytes, formatDate, getTimeSince, formatNumber } from '../utils/formatters';
import './DataProfile.css';

function DataProfile() {
  const { fileId } = useParams();
  const [file, setFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [fileData, profileData] = await Promise.all([
          getFileDetails(fileId),
          getFileProfile(fileId)
        ]);
        
        setFile(fileData);
        setProfile(profileData || {});
        setError(null);
      } catch (err) {
        console.error('Error fetching file data:', err);
        setError('Failed to load file data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [fileId]);

  const renderOverviewTab = () => {
    if (!file || !profile) return null;
    
    // Get data from the updated API response format
    const basicInfo = profile.basic_info || {};
    const columns = profile.columns || [];
    
    return (
      <div className="profile-overview">
        <div className="file-stats-grid">
          <Card className="file-stat-card">
            <div className="stat-icon rows-icon">
              <FiFileText />
            </div>
            <div className="stat-details">
              <h3>{formatNumber(basicInfo.row_count || 0)}</h3>
              <p>Rows</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon columns-icon">
              <FiBarChart2 />
            </div>
            <div className="stat-details">
              <h3>{basicInfo.column_count || columns.length || 0}</h3>
              <p>Columns</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon size-icon">
              <FiDownload />
            </div>
            <div className="stat-details">
              <h3>{basicInfo.file_size ? formatBytes(basicInfo.file_size) : (file.file_size ? formatBytes(file.file_size) : 'Unknown')}</h3>
              <p>File Size</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon age-icon">
              <FiCalendar />
            </div>
            <div className="stat-details">
              <h3>{getTimeSince(basicInfo.created_at || file.created_at)}</h3>
              <p>Age</p>
            </div>
          </Card>
        </div>
        
        <Card title="Data Completeness">
          {columns && columns.length > 0 ? (
            <div className="completeness-bars">
              {columns.map((column) => {
                const totalRows = basicInfo.row_count || 100;
                const nullCount = column.null_count || 0;
                const completeness = Math.round(((totalRows - nullCount) / totalRows) * 100);
                
                return (
                  <div key={column.name} className="completeness-bar-container">
                    <div className="completeness-bar-label">
                      <span className="column-name">{column.name}</span>
                      <span className="completeness-value">
                        {completeness}%
                      </span>
                    </div>
                    <div className="completeness-bar-track">
                      <div 
                        className="completeness-bar-fill" 
                        style={{ width: `${completeness}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>No completeness data available.</p>
            </div>
          )}
        </Card>
        
        <Card title="Data Freshness">
          <div className="freshness-stats">
            <div className="freshness-stat">
              <h3>Last Updated</h3>
              <p>{formatDate(basicInfo.updated_at || basicInfo.created_at || file.created_at)}</p>
            </div>
            
            <div className="freshness-stat">
              <h3>Created At</h3>
              <p>{formatDate(basicInfo.created_at || file.created_at)}</p>
            </div>
            
            <div className="freshness-stat">
              <h3>File Type</h3>
              <p>{basicInfo.file_type || file.file_type || 'Unknown'}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const renderColumnsTab = () => {
    if (!profile || !profile.columns) return null;
    
    const columns = profile.columns;
    const basicInfo = profile.basic_info || {};
    const totalRows = basicInfo.row_count || 100;
    
    return (
      <div className="columns-tab">
        <Card title="Column Details">
          <table className="table">
            <thead>
              <tr>
                <th>Column Name</th>
                <th>Data Type</th>
                <th>Unique Values</th>
                <th>Missing Values</th>
                <th>Min Value</th>
                <th>Max Value</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => {
                const nullCount = column.null_count || 0;
                const missingPercentage = Math.round((nullCount / totalRows) * 100);
                
                return (
                  <tr key={column.name}>
                    <td>{column.name}</td>
                    <td>{column.type}</td>
                    <td>{column.unique_count !== undefined ? column.unique_count.toLocaleString() : 'N/A'}</td>
                    <td>{`${nullCount.toLocaleString()} (${missingPercentage}%)`}</td>
                    <td>{column.min_value !== undefined && column.min_value !== null ? column.min_value : 'N/A'}</td>
                    <td>{column.max_value !== undefined && column.max_value !== null ? column.max_value : 'N/A'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  const renderDistributionTab = () => {
    if (!profile || !profile.columns) return null;
    
    const columns = profile.columns;
    
    return (
      <div className="distribution-tab">
        <div className="distribution-cards">
          {columns.map((column) => (
            <Card key={column.name} title={column.name}>
              <div className="column-distribution">
                <div className="distribution-summary">
                  <div className="summary-stat">
                    <h4>Type</h4>
                    <p>{column.type || 'Unknown'}</p>
                  </div>
                  <div className="summary-stat">
                    <h4>Min</h4>
                    <p>{column.min_value !== undefined && column.min_value !== null ? column.min_value : 'N/A'}</p>
                  </div>
                  <div className="summary-stat">
                    <h4>Max</h4>
                    <p>{column.max_value !== undefined && column.max_value !== null ? column.max_value : 'N/A'}</p>
                  </div>
                  <div className="summary-stat">
                    <h4>Unique Values</h4>
                    <p>{column.unique_count !== undefined ? column.unique_count.toLocaleString() : 'N/A'}</p>
                  </div>
                </div>
                
                <div className="distribution-visualization">
                  <div className="histogram-container">
                    <div className="histogram-title">Value Distribution</div>
                    <div className="pseudo-histogram">
                      {column.type === 'integer' || column.type === 'decimal' || column.type === 'number' ? (
                        // Create a simple pseudo-histogram for numeric data
                        <div className="bars">
                          {[...Array(8)].map((_, i) => (
                            <div 
                              key={i} 
                              className="bar" 
                              style={{ 
                                height: `${20 + Math.floor(Math.random() * 80)}%`,
                                backgroundColor: `rgba(52, 152, 219, ${0.4 + (i / 10)})`
                              }}
                            ></div>
                          ))}
                        </div>
                      ) : (
                        // Create a simple pseudo-distribution for categorical data
                        <div className="categorical-distribution">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="category-row">
                              <div className="category-label">Category {i+1}</div>
                              <div className="category-bar-container">
                                <div 
                                  className="category-bar" 
                                  style={{ 
                                    width: `${20 + Math.floor(Math.random() * 80)}%`,
                                    backgroundColor: `rgba(52, 152, 219, ${0.4 + (i / 10)})`
                                  }}
                                ></div>
                              </div>
                              <div className="category-percentage">{`${Math.floor(Math.random() * 30) + 5}%`}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="histogram-footer">
                      <div className="note">Note: This is a visualization placeholder.</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="data-profile-container">
      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading file data...</p>
        </div>
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : file ? (
        <>
          <div className="profile-header">
            <div className="profile-title">
              <h1>
                <span className="file-type">{file.file_type.toUpperCase()}</span>
                {file.filename}
              </h1>
              <div className="file-details">
                <span className="file-size">{file.file_size ? formatBytes(file.file_size) : 'Unknown size'}</span>
                <span className="file-date">Uploaded {getTimeSince(file.created_at)}</span>
              </div>
            </div>
            
            <div className="profile-actions">
              <Link to={`/quality/${fileId}`} className="btn btn-primary">
                <FiAlertTriangle className="btn-icon" />
                View Quality Checks
              </Link>
            </div>
          </div>
          
          <div className="profile-tabs">
            <button 
              className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              className={`tab-button ${activeTab === 'columns' ? 'active' : ''}`}
              onClick={() => setActiveTab('columns')}
            >
              Columns
            </button>
            <button 
              className={`tab-button ${activeTab === 'distribution' ? 'active' : ''}`}
              onClick={() => setActiveTab('distribution')}
            >
              Distribution
            </button>
          </div>
          
          <div className="profile-content">
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'columns' && renderColumnsTab()}
            {activeTab === 'distribution' && renderDistributionTab()}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>File not found.</p>
          <Link to="/" className="btn btn-primary">Return to Dashboard</Link>
        </div>
      )}
    </div>
  );
}

export default DataProfile;