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
    
    return (
      <div className="profile-overview">
        <div className="file-stats-grid">
          <Card className="file-stat-card">
            <div className="stat-icon rows-icon">
              <FiFileText />
            </div>
            <div className="stat-details">
              <h3>{formatNumber(profile.row_count || 0)}</h3>
              <p>Rows</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon columns-icon">
              <FiBarChart2 />
            </div>
            <div className="stat-details">
              <h3>{file.columns ? file.columns.length : 0}</h3>
              <p>Columns</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon size-icon">
              <FiDownload />
            </div>
            <div className="stat-details">
              <h3>{file.file_size ? formatBytes(file.file_size) : 'Unknown'}</h3>
              <p>File Size</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon age-icon">
              <FiCalendar />
            </div>
            <div className="stat-details">
              <h3>{getTimeSince(file.created_at)}</h3>
              <p>Age</p>
            </div>
          </Card>
        </div>
        
        <Card title="Data Completeness">
          {profile.missing_values ? (
            <div className="completeness-bars">
              {Object.entries(profile.missing_values).map(([column, stats]) => (
                <div key={column} className="completeness-bar-container">
                  <div className="completeness-bar-label">
                    <span className="column-name">{column}</span>
                    <span className="completeness-value">
                      {Math.round((1 - stats.percentage) * 100)}%
                    </span>
                  </div>
                  <div className="completeness-bar-track">
                    <div 
                      className="completeness-bar-fill" 
                      style={{ width: `${Math.round((1 - stats.percentage) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No completeness data available.</p>
            </div>
          )}
        </Card>
        
        <Card title="Data Freshness">
          {profile.freshness ? (
            <div className="freshness-stats">
              <div className="freshness-stat">
                <h3>Last Updated</h3>
                <p>{formatDate(profile.freshness.last_updated)}</p>
              </div>
              
              <div className="freshness-stat">
                <h3>Update Frequency</h3>
                <p>{profile.freshness.update_frequency || 'Unknown'}</p>
              </div>
              
              <div className="freshness-stat">
                <h3>Data Period</h3>
                <p>{profile.freshness.data_start_date ? `${formatDate(profile.freshness.data_start_date)} - ${formatDate(profile.freshness.data_end_date)}` : 'Unknown'}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>No freshness data available.</p>
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderColumnsTab = () => {
    if (!file || !file.columns) return null;
    
    return (
      <div className="columns-tab">
        <Card title="Column Details">
          <table className="table">
            <thead>
              <tr>
                <th>Column Name</th>
                <th>Data Type</th>
                <th>Nullable</th>
                <th>Distinct Values</th>
                <th>Missing Values</th>
              </tr>
            </thead>
            <tbody>
              {file.columns.map((column) => (
                <tr key={column.column_name}>
                  <td>{column.column_name}</td>
                  <td>{column.data_type}</td>
                  <td>{column.is_nullable ? 'Yes' : 'No'}</td>
                  <td>
                    {profile && profile.column_stats && profile.column_stats[column.column_name] 
                      ? profile.column_stats[column.column_name].distinct_count 
                      : 'Unknown'}
                  </td>
                  <td>
                    {profile && profile.missing_values && profile.missing_values[column.column_name] 
                      ? `${Math.round(profile.missing_values[column.column_name].percentage * 100)}%` 
                      : '0%'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  const renderDistributionTab = () => {
    if (!profile || !profile.column_stats) return null;
    
    return (
      <div className="distribution-tab">
        <div className="distribution-cards">
          {file.columns.map((column) => (
            <Card key={column.column_name} title={column.column_name}>
              {profile.column_stats[column.column_name] ? (
                <div className="column-distribution">
                  <div className="distribution-summary">
                    <div className="summary-stat">
                      <h4>Min</h4>
                      <p>{profile.column_stats[column.column_name].min ?? 'N/A'}</p>
                    </div>
                    <div className="summary-stat">
                      <h4>Max</h4>
                      <p>{profile.column_stats[column.column_name].max ?? 'N/A'}</p>
                    </div>
                    <div className="summary-stat">
                      <h4>Mean</h4>
                      <p>{profile.column_stats[column.column_name].mean ? profile.column_stats[column.column_name].mean.toFixed(2) : 'N/A'}</p>
                    </div>
                    <div className="summary-stat">
                      <h4>Stddev</h4>
                      <p>{profile.column_stats[column.column_name].std ? profile.column_stats[column.column_name].std.toFixed(2) : 'N/A'}</p>
                    </div>
                  </div>
                  
                  <div className="distribution-visualization">
                    {/* In a real app, there would be a histogram or distribution chart here */}
                    <div className="histogram-placeholder">
                      <p>Distribution visualization would appear here.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>No distribution data available for this column.</p>
                </div>
              )}
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