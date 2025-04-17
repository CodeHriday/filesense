import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiFileText, FiAlertTriangle, FiBarChart2, FiCalendar, FiTrash2 } from 'react-icons/fi';
import Card from '../components/Card';
import { getFileCatalog, deleteFile } from '../api/fileService';
import { getAlertHistory } from '../api/alertService';
import { formatBytes, formatDate, getTimeSince } from '../utils/formatters';
import './Dashboard.css';

function Dashboard() {
  const [files, setFiles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [filesData, alertsData] = await Promise.all([
          getFileCatalog(),
          getAlertHistory()
        ]);
        
        setFiles(filesData || []);
        setAlerts(alertsData || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const handleDeleteFile = async (fileId) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        await deleteFile(fileId);
        setFiles(files.filter(file => file.file_id !== fileId));
      } catch (err) {
        console.error('Error deleting file:', err);
        alert('Failed to delete file. Please try again.');
      }
    }
  };

  return (
    <div className="dashboard-container">
      <h1>Dashboard</h1>
      
      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading dashboard data...</p>
        </div>
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="summary-cards">
            <Card className="summary-card">
              <div className="summary-icon files-icon">
                <FiFileText />
              </div>
              <div className="summary-details">
                <h3>{files.length}</h3>
                <p>Files Tracked</p>
              </div>
            </Card>
            
            <Card className="summary-card">
              <div className="summary-icon alerts-icon">
                <FiAlertTriangle />
              </div>
              <div className="summary-details">
                <h3>{alerts.length}</h3>
                <p>Alerts</p>
              </div>
            </Card>
          </div>
          
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Recent Files</h2>
              <Link to="/upload" className="btn btn-primary">Upload New File</Link>
            </div>
            
            {files.length === 0 ? (
              <Card>
                <div className="empty-state">
                  <p>No files have been uploaded yet.</p>
                  <Link to="/upload" className="btn btn-primary">Upload Your First File</Link>
                </div>
              </Card>
            ) : (
              <div className="files-list">
                <table className="table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Uploaded</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.slice(0, 5).map(file => (
                      <tr key={file.file_id}>
                        <td>{file.filename}</td>
                        <td>{file.file_type.toUpperCase()}</td>
                        <td>{file.file_size ? formatBytes(file.file_size) : 'Unknown'}</td>
                        <td title={formatDate(file.created_at)}>{getTimeSince(file.created_at)}</td>
                        <td>
                          <div className="file-actions">
                            <Link to={`/profile/${file.file_id}`} className="action-button" title="View Profile">
                              <FiBarChart2 />
                            </Link>
                            <Link to={`/quality/${file.file_id}`} className="action-button" title="View Quality">
                              <FiAlertTriangle />
                            </Link>
                            <button 
                              className="action-button delete-button" 
                              title="Delete File"
                              onClick={() => handleDeleteFile(file.file_id)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {files.length > 5 && (
                  <div className="view-all">
                    <Link to="/files">View All Files</Link>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Recent Alerts</h2>
              <Link to="/alerts" className="btn btn-primary">View All Alerts</Link>
            </div>
            
            {alerts.length === 0 ? (
              <Card>
                <div className="empty-state">
                  <p>No alerts have been triggered.</p>
                </div>
              </Card>
            ) : (
              <div className="alerts-list">
                {alerts.slice(0, 5).map(alert => (
                  <Card key={alert.id} className="alert-card">
                    <div className="alert-header">
                      <h3>{alert.rule_name}</h3>
                      <span className={`badge badge-${alert.severity.toLowerCase()}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="alert-content">
                      <p>{alert.message}</p>
                      <p className="alert-file">
                        <span>File:</span> {alert.filename}
                      </p>
                    </div>
                    <div className="alert-footer">
                      <div className="alert-time">
                        <FiCalendar />
                        <span title={formatDate(alert.triggered_at)}>{getTimeSince(alert.triggered_at)}</span>
                      </div>
                      <Link to={`/profile/${alert.file_id}`} className="alert-action">
                        View File
                      </Link>
                    </div>
                  </Card>
                ))}
                
                {alerts.length > 5 && (
                  <div className="view-all">
                    <Link to="/alerts">View All Alerts</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;