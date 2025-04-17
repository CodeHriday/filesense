import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiCheck, FiX, FiAlertTriangle, FiBarChart2 } from 'react-icons/fi';
import Card from '../components/Card';
import { getFileDetails, getFileQuality, runQualityCheck } from '../api/fileService';
import { formatDate, getTimeSince } from '../utils/formatters';
import './QualityChecks.css';

function QualityChecks() {
  const { fileId } = useParams();
  const [file, setFile] = useState(null);
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningCheck, setRunningCheck] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [fileData, qualityData] = await Promise.all([
          getFileDetails(fileId),
          getFileQuality(fileId)
        ]);
        
        setFile(fileData);
        setQuality(qualityData || {});
        setError(null);
      } catch (err) {
        console.error('Error fetching file quality data:', err);
        setError('Failed to load quality data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [fileId]);
  
  const handleRunQualityCheck = async () => {
    try {
      setRunningCheck(true);
      
      const result = await runQualityCheck(fileId);
      setQuality(result);
      
      setRunningCheck(false);
    } catch (err) {
      console.error('Error running quality check:', err);
      setError('Failed to run quality check. Please try again later.');
      setRunningCheck(false);
    }
  };

  return (
    <div className="quality-checks-container">
      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading quality data...</p>
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
          <div className="quality-header">
            <div className="quality-title">
              <h1>Quality Checks</h1>
              <div className="file-details">
                <span className="file-name">{file.filename}</span>
                <span className="file-date">Uploaded {getTimeSince(file.created_at)}</span>
              </div>
            </div>
            
            <div className="quality-actions">
              <button 
                className="btn btn-primary"
                onClick={handleRunQualityCheck}
                disabled={runningCheck}
              >
                {runningCheck ? 'Running Check...' : 'Run Quality Check'}
              </button>
              <Link to={`/profile/${fileId}`} className="btn btn-secondary">
                <FiBarChart2 className="btn-icon" />
                View Profile
              </Link>
            </div>
          </div>
          
          {quality && quality.quality_score !== undefined ? (
            <>
              <div className="quality-summary">
                <Card className="quality-score-card">
                  <div className="quality-score">
                    <div className="score-circle" data-score={Math.round(quality.quality_score)}>
                      <div className="score-value">{Math.round(quality.quality_score)}</div>
                      <div className="score-label">Quality Score</div>
                    </div>
                    <div className="score-timestamp">
                      Last checked: {quality.check_timestamp ? formatDate(quality.check_timestamp) : 'Never'}
                    </div>
                  </div>
                </Card>
                
                <div className="quality-metrics">
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Completeness</h3>
                      <div className="metric-score good">{quality.completeness_score}%</div>
                    </div>
                    <p>Percentage of non-empty values across all columns.</p>
                  </Card>
                  
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Consistency</h3>
                      <div className="metric-score good">{quality.consistency_score}%</div>
                    </div>
                    <p>Consistency of data types and formats.</p>
                  </Card>
                  
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Validity</h3>
                      <div className="metric-score medium">{quality.validity_score}%</div>
                    </div>
                    <p>Adherence to predefined data validation rules.</p>
                  </Card>
                  
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Uniqueness</h3>
                      <div className="metric-score good">{quality.uniqueness_score}%</div>
                    </div>
                    <p>Percentage of unique values in key columns.</p>
                  </Card>
                </div>
              </div>
              
              <div className="quality-details">
                <Card title="Quality Check Results">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Check</th>
                        <th>Column</th>
                        <th>Status</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quality.checks && quality.checks.map((check, index) => (
                        <tr key={index} className={check.status}>
                          <td>{check.check_name}</td>
                          <td>{check.column || 'All'}</td>
                          <td>
                            <span className={`check-status ${check.status}`}>
                              {check.status === 'success' ? (
                                <FiCheck />
                              ) : check.status === 'warning' ? (
                                <FiAlertTriangle />
                              ) : (
                                <FiX />
                              )}
                              {check.status.charAt(0).toUpperCase() + check.status.slice(1)}
                            </span>
                          </td>
                          <td>{check.message}</td>
                        </tr>
                      ))}
                      
                      {(!quality.checks || quality.checks.length === 0) && (
                        <tr>
                          <td colSpan="4" className="empty-message">
                            No quality checks have been run.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <div className="empty-state">
                <FiAlertTriangle className="empty-icon" />
                <h2>No Quality Data Available</h2>
                <p>Quality checks have not been run on this file yet.</p>
                <button 
                  className="btn btn-primary"
                  onClick={handleRunQualityCheck}
                  disabled={runningCheck}
                >
                  {runningCheck ? 'Running Check...' : 'Run Quality Check Now'}
                </button>
              </div>
            </Card>
          )}
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

export default QualityChecks;