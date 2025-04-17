import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import './Dashboard.css';

export const Dashboard = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    totalFiles: 0,
    processedFiles: 0,
    totalRows: 0,
    avgQualityScore: 0
  });
  
  const [recentFiles, setRecentFiles] = useState([]);
  const [qualityIssues, setQualityIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // In a real app, this would fetch data from APIs
    fetchDashboardData();
  }, []);
  
  const fetchDashboardData = async () => {
    setLoading(true);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock data for the dashboard
      const mockStats = {
        totalFiles: 42,
        processedFiles: 38,
        totalRows: 1250000,
        avgQualityScore: 87.5
      };
      
      const mockRecentFiles = [
        {
          id: 'file_1',
          fileName: 'sales_data.csv',
          fileType: 'csv',
          processedAt: '2025-04-15T14:30:00Z',
          rows: 15250,
          columns: 12,
          qualityScore: 92.5
        },
        {
          id: 'file_2',
          fileName: 'customer_data.csv',
          fileType: 'csv',
          processedAt: '2025-04-12T10:15:00Z',
          rows: 42000,
          columns: 18,
          qualityScore: 87.2
        },
        {
          id: 'file_3',
          fileName: 'inventory.json',
          fileType: 'json',
          processedAt: '2025-04-10T09:45:00Z',
          rows: 8500,
          columns: 9,
          qualityScore: 95.0
        },
        {
          id: 'file_4',
          fileName: 'transactions.parquet',
          fileType: 'parquet',
          processedAt: '2025-04-08T16:20:00Z',
          rows: 125000,
          columns: 15,
          qualityScore: 79.8
        }
      ];
      
      const mockQualityIssues = [
        {
          id: 'issue_1',
          fileName: 'transactions.parquet',
          fileId: 'file_4',
          issueType: 'data_quality',
          severity: 'high',
          description: 'High number of null values in payment_method column (15%)',
          detectedAt: '2025-04-08T16:22:35Z'
        },
        {
          id: 'issue_2',
          fileName: 'customer_data.csv',
          fileId: 'file_2',
          issueType: 'schema_change',
          severity: 'medium',
          description: 'New column added: customer_segment',
          detectedAt: '2025-04-12T10:17:20Z'
        },
        {
          id: 'issue_3',
          fileName: 'product_catalog.json',
          fileId: 'file_5',
          issueType: 'data_quality',
          severity: 'low',
          description: 'Some price values (3%) outside expected range',
          detectedAt: '2025-04-05T11:12:15Z'
        }
      ];
      
      setStats(mockStats);
      setRecentFiles(mockRecentFiles);
      setQualityIssues(mockQualityIssues);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const formatNumber = (num) => {
    return num.toLocaleString();
  };
  
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  const getQualityClass = (score) => {
    if (score >= 90) return 'high';
    if (score >= 70) return 'medium';
    return 'low';
  };
  
  const getSeverityClass = (severity) => {
    if (severity === 'high') return 'severe';
    if (severity === 'medium') return 'warning';
    return 'minor';
  };
  
  const handleFileClick = (fileId) => {
    // In a real app, this would navigate to the file profile page
    onNavigate && onNavigate('profile', { fileId });
  };
  
  const handleViewAllFiles = () => {
    onNavigate && onNavigate('catalog');
  };
  
  const handleViewAllIssues = () => {
    onNavigate && onNavigate('quality');
  };
  
  const handleUploadFile = () => {
    onNavigate && onNavigate('upload');
  };
  
  if (loading) {
    return (
      <div className="dashboard-container">
        <h1 className="page-title">Dashboard</h1>
        <div className="loading">Loading dashboard data...</div>
      </div>
    );
  }
  
  return (
    <div className="dashboard-container">
      <h1 className="page-title">Dashboard</h1>
      
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon files-icon">📁</div>
          <div className="stat-content">
            <div className="stat-value">{formatNumber(stats.totalFiles)}</div>
            <div className="stat-label">Total Files</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon processed-icon">✓</div>
          <div className="stat-content">
            <div className="stat-value">{formatNumber(stats.processedFiles)}</div>
            <div className="stat-label">Processed Files</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon rows-icon">🔢</div>
          <div className="stat-content">
            <div className="stat-value">{formatNumber(stats.totalRows)}</div>
            <div className="stat-label">Total Rows</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon quality-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgQualityScore}%</div>
            <div className="stat-label">Avg Quality Score</div>
          </div>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <Card title="Recent Files" className="recent-files-card">
          <div className="card-actions">
            <button className="btn" onClick={handleUploadFile}>
              Upload New File
            </button>
            <button className="btn-link" onClick={handleViewAllFiles}>
              View All Files
            </button>
          </div>
          
          <div className="files-list">
            {recentFiles.length > 0 ? (
              recentFiles.map(file => (
                <div 
                  key={file.id} 
                  className="file-item"
                  onClick={() => handleFileClick(file.id)}
                >
                  <div className="file-item-header">
                    <div className="file-item-name">
                      <span className="file-icon">
                        {file.fileType === 'csv' ? '📄' : 
                         file.fileType === 'json' ? '🔠' : '📊'}
                      </span>
                      {file.fileName}
                    </div>
                    <div className={`quality-badge ${getQualityClass(file.qualityScore)}`}>
                      {file.qualityScore}%
                    </div>
                  </div>
                  
                  <div className="file-item-details">
                    <div className="file-detail">
                      <span className="detail-label">Rows:</span>
                      <span className="detail-value">{formatNumber(file.rows)}</span>
                    </div>
                    <div className="file-detail">
                      <span className="detail-label">Columns:</span>
                      <span className="detail-value">{file.columns}</span>
                    </div>
                    <div className="file-detail">
                      <span className="detail-label">Processed:</span>
                      <span className="detail-value">{formatDate(file.processedAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data-message">
                No files have been processed yet.
              </div>
            )}
          </div>
        </Card>
        
        <Card title="Quality Issues" className="quality-issues-card">
          <div className="card-actions">
            <button className="btn-link" onClick={handleViewAllIssues}>
              View All Issues
            </button>
          </div>
          
          <div className="issues-list">
            {qualityIssues.length > 0 ? (
              qualityIssues.map(issue => (
                <div 
                  key={issue.id} 
                  className="issue-item"
                  onClick={() => handleFileClick(issue.fileId)}
                >
                  <div className="issue-item-header">
                    <div className="issue-file-name">{issue.fileName}</div>
                    <div className={`severity-badge ${getSeverityClass(issue.severity)}`}>
                      {issue.severity}
                    </div>
                  </div>
                  
                  <div className="issue-description">
                    {issue.description}
                  </div>
                  
                  <div className="issue-footer">
                    <div className="issue-type">
                      {issue.issueType === 'data_quality' ? 'Data Quality Issue' : 
                       issue.issueType === 'schema_change' ? 'Schema Change' : 
                       'Other Issue'}
                    </div>
                    <div className="issue-time">
                      {formatDate(issue.detectedAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data-message">
                No quality issues detected.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};