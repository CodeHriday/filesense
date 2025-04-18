import React, { useState, useEffect } from 'react';
import { FiBarChart2, FiCheckCircle, FiClock, FiAlertTriangle, FiTrendingUp, FiCalendar, FiExternalLink } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { getFileCatalog } from '../api/fileService';
import { getFileAlerts } from '../api/alertService';
import './Dashboard.css';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [fileStats, setFileStats] = useState({
    totalFiles: 0,
    recentlyUpdated: 0,
    qualityIssues: 0,
    filesByType: {},
    avgQualityScore: 0
  });
  const [healthMetrics, setHealthMetrics] = useState({
    completeness: 0,
    consistency: 0,
    accuracy: 0,
    validity: 0,
    timeliness: 0
  });
  const [alerts, setAlerts] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('all');
  
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Get file data
        const files = await getFileCatalog();
        
        // Get alerts
        const alertsData = await getFileAlerts();
        
        // Process files for statistics
        const fileTypes = {};
        let totalQualityScore = 0;
        let filesWithScore = 0;
        
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);
        
        // Sort files by date (newest first)
        const sortedFiles = [...files].sort((a, b) => 
          new Date(b.last_updated || b.created_at) - new Date(a.last_updated || a.created_at)
        );
        
        files.forEach(file => {
          // Count file types
          if (fileTypes[file.file_type]) {
            fileTypes[file.file_type]++;
          } else {
            fileTypes[file.file_type] = 1;
          }
          
          // Add to quality score calculation if available
          if (file.quality_score) {
            totalQualityScore += file.quality_score;
            filesWithScore++;
          }
        });
        
        // Generate recent files list
        const recent = sortedFiles.slice(0, 5);
        
        // Calculate stats
        const stats = {
          totalFiles: files.length,
          recentlyUpdated: files.filter(f => new Date(f.last_updated || f.created_at) > last7Days).length,
          qualityIssues: alertsData.length,
          filesByType: fileTypes,
          avgQualityScore: filesWithScore > 0 ? Math.round(totalQualityScore / filesWithScore) : 0
        };
        
        // Generate health metrics (in a real app this would come from the API)
        const metrics = {
          completeness: Math.round(Math.random() * 30 + 70), // 70-100
          consistency: Math.round(Math.random() * 30 + 65), // 65-95
          accuracy: Math.round(Math.random() * 25 + 70), // 70-95
          validity: Math.round(Math.random() * 20 + 75), // 75-95
          timeliness: Math.round(Math.random() * 35 + 60) // 60-95
        };
        
        // Generate trend data (in a real app this would come from the API)
        const trend = [];
        const today = new Date();
        for (let i = 30; i >= 0; i--) {
          const date = new Date();
          date.setDate(today.getDate() - i);
          
          trend.push({
            date: date.toISOString().split('T')[0],
            overall: Math.round(70 + Math.random() * 20 + (i / 3)),
            completeness: Math.round(65 + Math.random() * 15 + (i / 2)),
            consistency: Math.round(70 + Math.random() * 12 + (i / 4)),
            accuracy: Math.round(75 + Math.random() * 18 + (i / 2.5)),
            validity: Math.round(68 + Math.random() * 22 + (i / 3)),
            timeliness: Math.round(60 + Math.random() * 25 + (i / 2))
          });
        }
        
        setFileStats(stats);
        setHealthMetrics(metrics);
        setAlerts(alertsData.slice(0, 5));
        setRecentFiles(recent);
        setTrendData(trend);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);
  
  const overallHealthScore = Math.round(
    (healthMetrics.completeness + 
     healthMetrics.consistency + 
     healthMetrics.accuracy + 
     healthMetrics.validity + 
     healthMetrics.timeliness) / 5
  );
  
  const getScoreColor = (score) => {
    if (score >= 90) return '#52C41A'; // Excellent
    if (score >= 75) return '#1890FF'; // Good
    if (score >= 60) return '#FAAD14'; // Average
    return '#FF4D4F'; // Poor
  };
  
  const getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Average';
    return 'Poor';
  };
  
  const renderHealthGauge = (label, value, icon) => {
    const Icon = icon;
    const angle = (value / 100) * 180;
    const color = getScoreColor(value);
    
    return (
      <div className="health-gauge">
        <div className="gauge-header">
          <span className="gauge-label">{label}</span>
          <span className="gauge-value" style={{ color }}>{value}%</span>
        </div>
        <div className="gauge-chart">
          <div className="gauge-body">
            <div className="gauge-fill" style={{ transform: `rotate(${angle}deg)`, backgroundColor: color }}></div>
            <div className="gauge-cover">
              <Icon className="gauge-icon" />
            </div>
          </div>
          <div className="gauge-scale">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
      </div>
    );
  };
  
  const renderTrendChart = () => {
    const dataPoints = trendData.map(point => ({
      date: point.date,
      value: selectedMetric === 'all' ? point.overall : point[selectedMetric]
    }));
    
    const maxValue = Math.max(...dataPoints.map(p => p.value));
    const minValue = Math.min(...dataPoints.map(p => p.value));
    const range = maxValue - minValue;
    
    // Normalize the values for the chart height (0-100%)
    const normalizedPoints = dataPoints.map(point => ({
      ...point,
      normalized: range > 0 ? ((point.value - minValue) / range) * 100 : 50
    }));
    
    // Take only a subset of labels for display to avoid overcrowding
    const labelIndices = [0, 10, 20, 30];
    
    return (
      <div className="trend-chart">
        <div className="trend-header">
          <h3>Data Health Trend - Last 30 Days</h3>
          <div className="trend-selector">
            <button 
              className={selectedMetric === 'all' ? 'active' : ''} 
              onClick={() => setSelectedMetric('all')}
            >
              Overall
            </button>
            <button 
              className={selectedMetric === 'completeness' ? 'active' : ''} 
              onClick={() => setSelectedMetric('completeness')}
            >
              Completeness
            </button>
            <button 
              className={selectedMetric === 'consistency' ? 'active' : ''} 
              onClick={() => setSelectedMetric('consistency')}
            >
              Consistency
            </button>
            <button 
              className={selectedMetric === 'accuracy' ? 'active' : ''} 
              onClick={() => setSelectedMetric('accuracy')}
            >
              Accuracy
            </button>
            <button 
              className={selectedMetric === 'validity' ? 'active' : ''} 
              onClick={() => setSelectedMetric('validity')}
            >
              Validity
            </button>
            <button 
              className={selectedMetric === 'timeliness' ? 'active' : ''} 
              onClick={() => setSelectedMetric('timeliness')}
            >
              Timeliness
            </button>
          </div>
        </div>
        
        <div className="chart-container">
          <div className="y-axis">
            <span>{maxValue}%</span>
            <span>{Math.round((maxValue + minValue) / 2)}%</span>
            <span>{minValue}%</span>
          </div>
          
          <div className="chart-body">
            <div className="chart-grid">
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
            </div>
            
            <div className="data-line">
              {normalizedPoints.map((point, index) => (
                <div 
                  key={index} 
                  className="data-point"
                  style={{ 
                    left: `${(index / (normalizedPoints.length - 1)) * 100}%`,
                    bottom: `${point.normalized}%`
                  }}
                  title={`${point.date}: ${point.value}%`}
                >
                  <span className="point-value">{point.value}%</span>
                </div>
              ))}
              {/* Generate the smooth line connecting points */}
              <svg className="line-svg">
                <path
                  d={normalizedPoints.map((point, i) => {
                    const x = (i / (normalizedPoints.length - 1)) * 100;
                    const y = 100 - point.normalized;
                    return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                  }).join(' ')}
                  stroke={getScoreColor(dataPoints[dataPoints.length - 1].value)}
                  strokeWidth="3"
                  fill="none"
                />
              </svg>
            </div>
          </div>
          
          <div className="x-axis">
            {labelIndices.map(i => (
              <span key={i}>{normalizedPoints[i].date}</span>
            ))}
          </div>
        </div>
        
        <div className="trend-summary">
          <div className="trend-stat">
            <span className="stat-label">Current Score</span>
            <span 
              className="stat-value"
              style={{ color: getScoreColor(dataPoints[dataPoints.length - 1].value) }}
            >
              {dataPoints[dataPoints.length - 1].value}%
            </span>
          </div>
          
          <div className="trend-stat">
            <span className="stat-label">30-Day Change</span>
            {dataPoints[dataPoints.length - 1].value > dataPoints[0].value ? (
              <span className="stat-value positive">
                <FiTrendingUp /> +{(dataPoints[dataPoints.length - 1].value - dataPoints[0].value).toFixed(1)}%
              </span>
            ) : (
              <span className="stat-value negative">
                <FiTrendingUp className="down" /> {(dataPoints[dataPoints.length - 1].value - dataPoints[0].value).toFixed(1)}%
              </span>
            )}
          </div>
          
          <div className="trend-stat">
            <span className="stat-label">Classification</span>
            <span 
              className="stat-value"
              style={{ color: getScoreColor(dataPoints[dataPoints.length - 1].value) }}
            >
              {getScoreLabel(dataPoints[dataPoints.length - 1].value)}
            </span>
          </div>
        </div>
      </div>
    );
  };
  
  const renderFileTypeDistribution = () => {
    const fileTypes = Object.entries(fileStats.filesByType);
    const total = fileStats.totalFiles;
    
    if (fileTypes.length === 0) return null;
    
    return (
      <div className="file-type-distribution">
        <h3>File Type Distribution</h3>
        <div className="distribution-bars">
          {fileTypes.map(([type, count]) => {
            const percentage = Math.round((count / total) * 100);
            return (
              <div key={type} className="distribution-item">
                <div className="distribution-label">
                  <span className="type-name">{type}</span>
                  <span className="type-count">{count} files</span>
                </div>
                <div className="distribution-bar-container">
                  <div
                    className="distribution-bar"
                    style={{ width: `${percentage}%`, backgroundColor: getTypeColor(type) }}
                  ></div>
                </div>
                <span className="type-percentage">{percentage}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  const getTypeColor = (type) => {
    const colors = {
      csv: '#1890FF',
      xlsx: '#52C41A',
      json: '#722ED1',
      parquet: '#FA8C16',
      xml: '#EB2F96',
      pdf: '#F5222D'
    };
    
    return colors[type.toLowerCase()] || '#8C8C8C';
  };
  
  return (
    <div className="dashboard-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="dashboard-overview">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon files">
                  <FiBarChart2 />
                </div>
                <div className="stat-content">
                  <h3>Total Files</h3>
                  <div className="stat-value">{fileStats.totalFiles}</div>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon updated">
                  <FiClock />
                </div>
                <div className="stat-content">
                  <h3>Recently Updated</h3>
                  <div className="stat-value">{fileStats.recentlyUpdated}</div>
                  <div className="stat-subtitle">Last 7 days</div>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon issues">
                  <FiAlertTriangle />
                </div>
                <div className="stat-content">
                  <h3>Quality Issues</h3>
                  <div className="stat-value">{fileStats.qualityIssues}</div>
                  <Link to="/alerts" className="stat-action">View all &rarr;</Link>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon score">
                  <FiCheckCircle />
                </div>
                <div className="stat-content">
                  <h3>Overall Health</h3>
                  <div 
                    className="stat-value"
                    style={{ color: getScoreColor(overallHealthScore) }}
                  >
                    {overallHealthScore}%
                  </div>
                  <div className="stat-subtitle">{getScoreLabel(overallHealthScore)}</div>
                </div>
              </div>
            </div>

            <div className="health-metrics">
              <h2>Data Health Metrics</h2>
              <div className="gauge-grid">
                {renderHealthGauge('Completeness', healthMetrics.completeness, FiCheckCircle)}
                {renderHealthGauge('Consistency', healthMetrics.consistency, FiBarChart2)}
                {renderHealthGauge('Accuracy', healthMetrics.accuracy, FiCheckCircle)}
                {renderHealthGauge('Validity', healthMetrics.validity, FiAlertTriangle)}
                {renderHealthGauge('Timeliness', healthMetrics.timeliness, FiClock)}
              </div>
            </div>
          </div>
          
          <div className="dashboard-detail-row">
            <div className="dashboard-chart">
              {renderTrendChart()}
            </div>
            
            <div className="dashboard-sidebar">
              {renderFileTypeDistribution()}
              
              <div className="recent-files">
                <h3>Recent Files</h3>
                <ul className="recent-files-list">
                  {recentFiles.map(file => (
                    <li key={file.file_id} className="recent-file-item">
                      <div className="recent-file-type" style={{ backgroundColor: getTypeColor(file.file_type) }}>
                        {file.file_type.substring(0, 3).toUpperCase()}
                      </div>
                      <div className="recent-file-details">
                        <div className="recent-file-name">{file.filename}</div>
                        <div className="recent-file-meta">
                          <span className="recent-file-date">
                            <FiCalendar />
                            {new Date(file.last_updated || file.created_at).toLocaleDateString()}
                          </span>
                          {file.quality_score && (
                            <span 
                              className="recent-file-score" 
                              style={{ color: getScoreColor(file.quality_score) }}
                            >
                              {file.quality_score}%
                            </span>
                          )}
                        </div>
                      </div>
                      <Link to={`/profile/${file.file_id}`} className="recent-file-link">
                        <FiExternalLink />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="recent-alerts">
                <h3>Recent Alerts</h3>
                {alerts.length === 0 ? (
                  <div className="no-alerts">
                    <FiCheckCircle />
                    <p>No active alerts</p>
                  </div>
                ) : (
                  <ul className="alerts-list">
                    {alerts.map(alert => (
                      <li key={alert.id} className={`alert-item ${alert.severity}`}>
                        <div className="alert-icon">
                          <FiAlertTriangle />
                        </div>
                        <div className="alert-content">
                          <div className="alert-title">{alert.title}</div>
                          <div className="alert-meta">
                            <span className="alert-file">{alert.file_name}</span>
                            <span className="alert-date">{new Date(alert.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {alerts.length > 0 && (
                  <Link to="/alerts" className="view-all-link">
                    View all alerts <FiExternalLink />
                  </Link>
                )}
              </div>
            </div>
          </div>
          
          <div className="dashboard-actions">
            <Link to="/upload" className="dashboard-action-button">
              Upload New File
            </Link>
            <Link to="/monitor" className="dashboard-action-button">
              View Data Monitor
            </Link>
            <Link to="/badges" className="dashboard-action-button">
              Achievement Badges
            </Link>
            <Link to="/recommendations" className="dashboard-action-button">
              View Recommendations
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;