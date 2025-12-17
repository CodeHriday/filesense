import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiCheck, FiX, FiAlertTriangle, FiBarChart2, FiInfo } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getFileDetails, getFileQuality, runQualityCheck } from '../api/fileService';
import { formatDate, getTimeSince, formatDecimal } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';
import { QualityTooltip } from '../components/QualityTooltip';
import './QualityChecks.css';

// Helper function to provide descriptions for data types
const getTypeDescription = (type) => {
  const descriptions = {
    'string': 'Text data such as names, descriptions, or categorical values.',
    'text': 'Long-form text content that may span multiple paragraphs.',
    'integer': 'Whole numbers without decimal places, such as counts or IDs.',
    'float': 'Decimal numbers that can represent measurements or calculated values.',
    'double': 'High-precision decimal numbers for scientific or financial calculations.',
    'boolean': 'True/false values representing binary states or conditions.',
    'date': 'Calendar dates without time information.',
    'datetime': 'Date and time values with precision to the second or millisecond.',
    'timestamp': 'Precise moment in time, typically stored as seconds since epoch.',
    'json': 'Structured data in JavaScript Object Notation format.',
    'array': 'Collection of values of the same type.',
    'object': 'Complex data structure with named properties and values.',
  };
  
  // Normalize the type by removing any modifiers and converting to lowercase
  // Use safer regex to prevent ReDoS - limit quantifier
  const normalizedType = type.toLowerCase().replace(/\(.{0,100}\)/, '').trim();
  
  return descriptions[normalizedType] || `Data of type ${type}`;
};

function QualityChecks() {
  const { fileId: encodedFileId } = useParams();
  const fileId = decodeURIComponent(encodedFileId || '');
  const [file, setFile] = useState(null);
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningCheck, setRunningCheck] = useState(false);
  const { hasWritePermission } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [fileData, qualityData] = await Promise.all([
          getFileDetails(fileId),
          getFileQuality(fileId)
        ]);
        
        console.log('File Data:', fileData);
        console.log('Quality Data:', qualityData);
        
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
        <LoadingSpinner />
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
              {hasWritePermission('quality') ? (
                <button 
                  className="btn btn-primary"
                  onClick={handleRunQualityCheck}
                  disabled={runningCheck}
                >
                  {runningCheck ? 'Running Check...' : 'Run Quality Check'}
                </button>
              ) : (
                <button 
                  className="btn btn-primary disabled"
                  disabled={true}
                  title="You don't have permission to run quality checks"
                >
                  Run Quality Check
                </button>
              )}
              <Link to={`/profile/${encodeURIComponent(fileId)}`} className="btn btn-secondary">
                <FiBarChart2 className="btn-icon" />
                View Profile
              </Link>
            </div>
          </div>
          
          {quality && quality.qualityScore !== undefined ? (
            <>
              <div className="quality-summary">
                <Card className="quality-score-card">
                  <div className="quality-score">
                    <QualityTooltip
                      score={parseFloat(quality.qualityScore || "0")}
                      components={{
                        completeness: quality.checks?.find(c => c.type === 'completeness')?.score || 0,
                        consistency: quality.checks?.find(c => c.type === 'consistency')?.score || 0,
                        validity: quality.checks?.find(c => c.type === 'validity')?.score || 0,
                        uniqueness: quality.checks?.find(c => c.type === 'uniqueness')?.score || 0,
                        timeliness: quality.checks?.find(c => c.type === 'timeliness')?.score || 0
                      }}
                      position="right"
                      animated={true}
                    >
                      <div className="score-circle" data-score={Math.round(parseFloat(quality.qualityScore || "0"))}>
                        <div className="score-value">{Math.round(parseFloat(quality.qualityScore || "0"))}</div>
                        <div className="score-label">Quality Score</div>
                      </div>
                    </QualityTooltip>
                    <div className="score-timestamp">
                      File: {quality.filename || file.filename}
                    </div>
                  </div>
                </Card>
                
                <div className="quality-metrics">
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>
                        Completeness
                        <Tooltip
                          content="Measures the percentage of non-empty values across all columns in the dataset."
                          position="top"
                          type="info"
                          animated={true}
                        >
                          <FiInfo className="info-icon" />
                        </Tooltip>
                      </h3>
                      {quality.checks?.find(c => c.type === 'completeness')?.score ? (
                        <Tooltip
                          content={`Weight: ${quality.checks.find(c => c.type === 'completeness')?.details?.weight || '30%'}`}
                          position="left"
                          type="info"
                          animated={true}
                        >
                          <div className={`metric-score ${parseFloat(quality.checks.find(c => c.type === 'completeness').score) >= 80 ? 'good' : parseFloat(quality.checks.find(c => c.type === 'completeness').score) >= 60 ? 'medium' : 'poor'}`}>
                            {formatDecimal(quality.checks.find(c => c.type === 'completeness').score, 1)}%
                          </div>
                        </Tooltip>
                      ) : (
                        <div className="metric-score">0.0%</div>
                      )}
                    </div>
                    <p>Percentage of non-empty values across all columns.</p>
                  </Card>
                  
                  {/* Display column metrics summary */}
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>
                        Columns
                        <Tooltip
                          content="Total number of columns detected in the dataset."
                          position="top"
                          type="info"
                          animated={true}
                        >
                          <FiInfo className="info-icon" />
                        </Tooltip>
                      </h3>
                      <Tooltip
                        content={`File contains ${file.column_count || 0} columns with various data types and characteristics.`}
                        position="left"
                        type="info"
                        animated={true}
                      >
                        <div className="metric-score good">{file.column_count || 0}</div>
                      </Tooltip>
                    </div>
                    <p>Total number of columns analyzed in the file.</p>
                  </Card>
                  
                  {/* Duplicate Records */}
                  <Card className="metric-card">
                    <div className="metric-header">
                      <h3>
                        Duplicate Records
                        <Tooltip
                          content="Number of exact duplicate rows found in the dataset."
                          position="top"
                          type="info"
                          animated={true}
                        >
                          <FiInfo className="info-icon" />
                        </Tooltip>
                      </h3>
                      {(() => {
                        const duplicateCount = file.duplicate_records_count || 0;
                        const duplicatePercentage = file.duplicate_records_percentage || 0;
                        const scoreClass = duplicatePercentage === 0 ? 'good' : duplicatePercentage < 5 ? 'medium' : 'poor';
                        
                        return (
                          <Tooltip
                            content={`${duplicateCount} duplicate rows found (${duplicatePercentage}% of total records)`}
                            position="left"
                            type={duplicatePercentage === 0 ? 'success' : duplicatePercentage < 5 ? 'warning' : 'error'}
                            animated={true}
                          >
                            <div className={`metric-score ${scoreClass}`}>
                              {formatDecimal(duplicatePercentage, 1)}%
                            </div>
                          </Tooltip>
                        );
                      })()}
                    </div>
                    <p>
                      {(file.duplicate_records_count || 0).toLocaleString()} duplicate{(file.duplicate_records_count || 0) !== 1 ? 's' : ''}
                    </p>
                    <p>Exact duplicate rows in the dataset.</p>
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
                      {file?.columns && file.columns.map((col, index) => (
                        <tr key={index}>
                          <td>
                            <Tooltip
                              content={`${col.column_name}: ${col.description || 'No description available'}`}
                              position="top"
                              type="info"
                              animated={true}
                            >
                              {col.column_name}
                            </Tooltip>
                          </td>
                          <td>
                            <Tooltip
                              content={getTypeDescription(col.column_type)}
                              position="top"
                              type="info"
                              animated={true}
                            >
                              {col.column_type}
                            </Tooltip>
                          </td>
                          <td>
                            {col.null_count !== undefined && (
                              <Tooltip
                                content={`${formatDecimal(col.null_count / file.row_count * 100, 1)}% missing values (${col.null_count} out of ${file.row_count} rows)`}
                                position="top"
                                type={(100 - (col.null_count / file.row_count * 100)) >= 80 ? 'success' : (100 - (col.null_count / file.row_count * 100)) >= 60 ? 'warning' : 'error'}
                                animated={true}
                              >
                                <span className={`check-status ${(100 - (col.null_count / file.row_count * 100)) >= 80 ? 'success' : (100 - (col.null_count / file.row_count * 100)) >= 60 ? 'warning' : 'error'}`}>
                                  {(100 - (col.null_count / file.row_count * 100)) >= 80 ? (
                                    <FiCheck />
                                  ) : (100 - (col.null_count / file.row_count * 100)) >= 60 ? (
                                    <FiAlertTriangle />
                                  ) : (
                                    <FiX />
                                  )}
                                  {formatDecimal(100 - (col.null_count / file.row_count * 100), 1)}%
                                </span>
                              </Tooltip>
                            )}
                          </td>
                          <td>
                            {col.unique_count !== undefined ? (
                              <Tooltip
                                content={`${formatDecimal(col.unique_count / file.row_count * 100, 1)}% of values are unique in this column`}
                                position="top"
                                type="info"
                                animated={true}
                              >
                                {col.unique_count.toLocaleString()}
                              </Tooltip>
                            ) : 'N/A'}
                          </td>
                          <td>
                            {col.null_count !== undefined ? (
                              <Tooltip
                                content={`${formatDecimal(col.null_count / file.row_count * 100, 1)}% of rows have missing values in this column`}
                                position="top"
                                type="info"
                                animated={true}
                              >
                                {col.null_count.toLocaleString()}
                              </Tooltip>
                            ) : 0}
                          </td>
                        </tr>
                      ))}
                      
                      {(!file?.columns || file.columns.length === 0) && (
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
                {hasWritePermission('quality') ? (
                  <button 
                    className="btn btn-primary"
                    onClick={handleRunQualityCheck}
                    disabled={runningCheck}
                  >
                    {runningCheck ? 'Running Check...' : 'Run Quality Check Now'}
                  </button>
                ) : (
                  <button 
                    className="btn btn-primary disabled"
                    disabled={true}
                    title="You don't have permission to run quality checks"
                  >
                    Run Quality Check Now
                  </button>
                )}
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