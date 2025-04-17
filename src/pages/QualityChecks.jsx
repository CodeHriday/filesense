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
          
          {quality && quality.overall_score !== undefined ? (
            <>
              <div className="quality-summary">
                <Card className="quality-score-card">
                  <div className="quality-score">
                    <div className="score-circle" data-score={Math.round(quality.overall_score)}>
                      <div className="score-value">{Math.round(quality.overall_score)}</div>
                      <div className="score-label">Quality Score</div>
                    </div>
                    <div className="score-timestamp">
                      File: {quality.filename || file.filename}
                    </div>
                  </div>
                </Card>
                
                <div className="quality-metrics">
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Completeness</h3>
                      <div className={`metric-score ${quality.completeness?.score >= 80 ? 'good' : quality.completeness?.score >= 60 ? 'medium' : 'poor'}`}>
                        {quality.completeness?.score?.toFixed(1) || '0'}%
                      </div>
                    </div>
                    <p>Percentage of non-empty values across all columns.</p>
                  </Card>
                  
                  {/* Display column metrics summary */}
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Columns</h3>
                      <div className="metric-score good">{quality.column_metrics?.length || 0}</div>
                    </div>
                    <p>Total number of columns analyzed in the file.</p>
                  </Card>
                  
                  {/* Calculate completeness percentage of the most complete column */}
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Best Column</h3>
                      {quality.completeness?.details && quality.completeness.details.length > 0 ? (
                        <>
                          <div className="metric-score good">
                            {Math.max(...quality.completeness.details.map(col => col.score)).toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="metric-score">N/A</div>
                      )}
                    </div>
                    {quality.completeness?.details && quality.completeness.details.length > 0 && (
                      <p>
                        {quality.completeness.details.reduce((prev, current) => 
                          (prev.score > current.score) ? prev : current).column}
                      </p>
                    )}
                    <p>Column with highest completeness score.</p>
                  </Card>
                  
                  {/* Calculate completeness percentage of the least complete column */}
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>Worst Column</h3>
                      {quality.completeness?.details && quality.completeness.details.length > 0 ? (
                        <>
                          <div className="metric-score poor">
                            {Math.min(...quality.completeness.details.map(col => col.score)).toFixed(1)}%
                          </div>
                        </>
                      ) : (
                        <div className="metric-score">N/A</div>
                      )}
                    </div>
                    {quality.completeness?.details && quality.completeness.details.length > 0 && (
                      <p>
                        {quality.completeness.details.reduce((prev, current) => 
                          (prev.score < current.score) ? prev : current).column}
                      </p>
                    )}
                    <p>Column with lowest completeness score.</p>
                  </Card>
                </div>
              </div>
              
              <div className="quality-details">
                <Card title="Column Quality Details">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Column Name</th>
                        <th>Data Type</th>
                        <th>Completeness</th>
                        <th>Unique Values</th>
                        <th>Null Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quality.column_metrics && quality.column_metrics.map((col, index) => (
                        <tr key={index}>
                          <td>{col.name}</td>
                          <td>{col.type}</td>
                          <td>
                            <span className={`check-status ${col.completeness >= 80 ? 'success' : col.completeness >= 60 ? 'warning' : 'error'}`}>
                              {col.completeness >= 80 ? (
                                <FiCheck />
                              ) : col.completeness >= 60 ? (
                                <FiAlertTriangle />
                              ) : (
                                <FiX />
                              )}
                              {col.completeness?.toFixed(1)}%
                            </span>
                          </td>
                          <td>{col.unique_count !== undefined ? col.unique_count.toLocaleString() : 'N/A'}</td>
                          <td>{col.null_count !== undefined ? col.null_count.toLocaleString() : 0}</td>
                        </tr>
                      ))}
                      
                      {(!quality.column_metrics || quality.column_metrics.length === 0) && (
                        <tr>
                          <td colSpan="5" className="empty-message">
                            No column metrics available.
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