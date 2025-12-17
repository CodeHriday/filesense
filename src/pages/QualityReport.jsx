import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiDownload, FiAlertTriangle, FiCheckCircle, FiBarChart2, FiPieChart, FiFileText } from 'react-icons/fi';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, RadialLinearScale } from 'chart.js';
import { Line, Bar, Pie, PolarArea } from 'react-chartjs-2';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getFileDetails, getFileProfile } from '../api/fileService';
import { runQualityCheck } from '../api/fileService';
import { formatBytes, formatDate } from '../utils/formatters';
import './QualityReport.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title, 
  Tooltip, 
  Legend
);

const QualityReport = () => {
  const { fileId: encodedFileId } = useParams();
  const fileId = decodeURIComponent(encodedFileId || '');
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const reportRef = useRef(null);
  
  useEffect(() => {
    const fetchFileData = async () => {
      try {
        setLoading(true);
        const fileData = await getFileDetails(fileId);
        setFile(fileData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching file details:', err);
        setError('Failed to load file details. Please try again.');
        setLoading(false);
      }
    };
    
    fetchFileData();
  }, [fileId]);
  
  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      setError(null);
      
      // Define rules for quality check
      const rules = [
        {
          type: 'completeness',
          column: '*',
          threshold: 80,
          description: 'All columns should be at least 80% complete'
        }
      ];
      
      // Run the quality check
      const reportData = await runQualityCheck(fileId, rules);
      setReport(reportData);
      setGenerating(false);
    } catch (err) {
      console.error('Error generating quality report:', err);
      setError('Failed to generate quality report. Please try again.');
      setGenerating(false);
    }
  };
  
  const handleGoBack = () => {
    navigate('/monitor');
  };
  
  const handleExportReport = () => {
    if (!report) return;
    
    try {
      // Create a formatted version of the report
      const reportData = {
        ...report,
        timestamp: new Date().toISOString(),
        exportedAt: new Date().toLocaleString()
      };
      
      // Convert to JSON string with nice formatting
      const jsonStr = JSON.stringify(reportData, null, 2);
      
      // Create a blob and download it
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', `quality-report-${file.filename}-${new Date().toISOString()}.json`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report. Please try again.');
    }
  };
  
  // Helper function to render a gauge-like component for scores
  const ScoreGauge = ({ score, label, color }) => {
    const gaugeColor = color || (
      score >= 90 ? '#28a745' :
      score >= 80 ? '#5cb85c' :
      score >= 70 ? '#4dabf7' :
      score >= 60 ? '#ffc107' :
      score >= 50 ? '#fd7e14' : '#dc3545'
    );
    
    // Determine rating text
    const ratingText = 
      score >= 90 ? 'Excellent' :
      score >= 80 ? 'Good' :
      score >= 70 ? 'Satisfactory' :
      score >= 60 ? 'Fair' :
      score >= 50 ? 'Poor' : 'Critical';
    
    return (
      <div className="score-gauge">
        <div className="gauge-container">
          <div className="gauge-value" style={{ 
            width: `${Math.min(100, Math.max(0, score))}%`,
            backgroundColor: gaugeColor 
          }} />
        </div>
        <div className="gauge-details">
          <span className="gauge-score">{score}</span>
          <span className="gauge-label">{label}</span>
          <span className="gauge-rating" style={{ color: gaugeColor }}>{ratingText}</span>
        </div>
      </div>
    );
  };

  ScoreGauge.propTypes = {
    score: PropTypes.number.isRequired,
    label: PropTypes.string.isRequired,
    color: PropTypes.string
  };
  
  // Generate component score data for chart
  const getComponentScoreChartData = () => {
    if (!report || !report.reliability_components) return null;
    
    const components = report.reliability_components;
    const labels = Object.keys(components).map(key => 
      components[key].description || key.charAt(0).toUpperCase() + key.slice(1)
    );
    
    const scores = Object.values(components).map(c => c.score);
    const colors = [
      'rgba(54, 162, 235, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)'
    ];
    
    return {
      labels,
      datasets: [
        {
          label: 'Component Scores',
          data: scores,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.8', '1')),
          borderWidth: 1
        }
      ]
    };
  };
  
  // Column completeness data for chart
  const getColumnCompletenessChartData = () => {
    if (!report || !report.completeness || !report.completeness.details) return null;
    
    const details = report.completeness.details;
    const sortedDetails = [...details].sort((a, b) => a.score - b.score);
    
    const labels = sortedDetails.map(d => d.column);
    const values = sortedDetails.map(d => d.score);
    
    // Create color array - red for low values, green for high
    const colors = values.map(v => 
      v >= 90 ? 'rgba(40, 167, 69, 0.7)' :
      v >= 70 ? 'rgba(77, 171, 247, 0.7)' :
      v >= 50 ? 'rgba(255, 193, 7, 0.7)' :
      'rgba(220, 53, 69, 0.7)'
    );
    
    return {
      labels,
      datasets: [
        {
          label: 'Completeness (%)',
          data: values,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.7', '1')),
          borderWidth: 1
        }
      ]
    };
  };
  
  if (loading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
        <p>Loading file details...</p>
      </div>
    );
  }
  
  if (!file) {
    return (
      <div className="error-container">
        <FiAlertTriangle className="error-icon" />
        <h2>File Not Found</h2>
        <p>The requested file could not be found.</p>
        <button className="btn btn-primary" onClick={handleGoBack}>
          Back to Files
        </button>
      </div>
    );
  }
  
  return (
    <div className="quality-report-container" ref={reportRef}>
      <div className="report-header">
        <button className="back-button" onClick={handleGoBack}>
          <FiArrowLeft /> Back to Files
        </button>
        <h1>Data Quality Report</h1>
        {report && (
          <button className="export-button" onClick={handleExportReport}>
            <FiDownload /> Export Report
          </button>
        )}
      </div>
      
      <div className="file-info-card">
        <Card>
          <div className="file-info-header">
            <div className="file-icon-container">
              <FiFileText className="file-icon" />
            </div>
            <div className="file-details">
              <h2>{file.filename}</h2>
              <div className="file-meta">
                <span><strong>Type:</strong> {file.file_type.toUpperCase()}</span>
                <span><strong>Size:</strong> {formatBytes(file.file_size)}</span>
                <span><strong>Uploaded:</strong> {formatDate(file.created_at)}</span>
                <span><strong>Rows:</strong> {file.row_count.toLocaleString()}</span>
                <span><strong>Columns:</strong> {file.column_count}</span>
              </div>
            </div>
          </div>
          
          {!report && (
            <div className="generate-report-section">
              <p>Generate a one-click comprehensive quality report for this file.</p>
              <button 
                className="btn btn-primary generate-btn" 
                onClick={handleGenerateReport}
                disabled={generating}
              >
                {generating ? 'Generating...' : 'Generate Quality Report'}
              </button>
              {error && <p className="error-message">{error}</p>}
            </div>
          )}
        </Card>
      </div>
      
      {report && (
        <div className="report-content">
          <div className="report-section report-summary">
            <Card>
              <div className="section-header">
                <h2>Quality Score Summary</h2>
                <span className="timestamp">Generated: {formatDate(report.check_time)}</span>
              </div>
              
              <div className="overall-score-container">
                <div className="overall-score">
                  <div className="score-circle" style={{ 
                    backgroundColor: report.reliability_color || '#4dabf7' 
                  }}>
                    <span>{report.quality_score || report.overall_score}</span>
                  </div>
                  <div className="score-label">
                    <h3>Overall Score</h3>
                    <p>{report.reliability_rating || 'Satisfactory'}</p>
                  </div>
                </div>
                
                <div className="report-metrics">
                  <div className="metric">
                    <span className="metric-label">Rules Passed</span>
                    <span className="metric-value">{report.rules_passed}/{report.rules_evaluated}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Issues Found</span>
                    <span className="metric-value">{report.issues_found}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Status</span>
                    <span className="metric-value status">
                      {report.passed ? (
                        <><FiCheckCircle className="status-icon success" /> Passed</>
                      ) : (
                        <><FiAlertTriangle className="status-icon warning" /> Failed</>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              
              {report.reliability_components && (
                <div className="component-scores">
                  <h3>Quality Components</h3>
                  <div className="component-scores-container">
                    {Object.entries(report.reliability_components).map(([key, component]) => (
                      <div className="component-score" key={key}>
                        <ScoreGauge 
                          score={component.score} 
                          label={key.charAt(0).toUpperCase() + key.slice(1)} 
                        />
                        <div className="component-weight">Weight: {component.weight}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
          
          <div className="report-charts">
            <div className="chart-section">
              <Card>
                <h3>Component Score Breakdown</h3>
                <div className="chart-container">
                  {getComponentScoreChartData() ? (
                    <PolarArea 
                      data={getComponentScoreChartData()} 
                      options={{
                        responsive: true,
                        plugins: {
                          legend: {
                            position: 'right',
                          },
                          title: {
                            display: true,
                            text: 'Quality Score Components'
                          }
                        },
                        scales: {
                          r: {
                            min: 0,
                            max: 100,
                            ticks: {
                              stepSize: 20
                            }
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="no-data-message">No component data available</div>
                  )}
                </div>
              </Card>
            </div>
            
            <div className="chart-section">
              <Card>
                <h3>Column Completeness</h3>
                <div className="chart-container">
                  {getColumnCompletenessChartData() ? (
                    <Bar 
                      data={getColumnCompletenessChartData()}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        plugins: {
                          legend: {
                            display: false,
                          },
                          title: {
                            display: true,
                            text: 'Data Completeness by Column (%)'
                          }
                        },
                        scales: {
                          x: {
                            min: 0,
                            max: 100,
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="no-data-message">No completeness data available</div>
                  )}
                </div>
              </Card>
            </div>
          </div>
          
          {report.anomalies_detected > 0 && report.anomaly_details && (
            <div className="report-section anomalies">
              <Card>
                <h3>
                  <FiAlertTriangle className="anomaly-icon" />
                  Detected Anomalies ({report.anomalies_detected})
                </h3>
                <div className="anomalies-list">
                  {report.anomaly_details.map((anomaly, index) => (
                    <div className="anomaly-item" key={index}>
                      <div className="anomaly-header">
                        <span className={`anomaly-severity ${anomaly.severity}`}>
                          {anomaly.severity}
                        </span>
                        <span className="anomaly-type">{anomaly.type.replace(/_/g, ' ')}</span>
                        <span className="anomaly-column">{anomaly.column}</span>
                      </div>
                      <p className="anomaly-description">{anomaly.description}</p>
                      {anomaly.details && (
                        <div className="anomaly-details">
                          {Object.entries(anomaly.details).map(([key, value]) => (
                            <div className="anomaly-detail" key={key}>
                              <span className="detail-label">{key}:</span>
                              <span className="detail-value">
                                {typeof value === 'object' ? JSON.stringify(value) : value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          
          {report.recommendations && report.recommendations.length > 0 && (
            <div className="report-section recommendations">
              <Card>
                <h3>Recommendations</h3>
                <ul className="recommendations-list">
                  {report.recommendations.map((rec, index) => (
                    <li key={index}>
                      <FiCheckCircle className="recommendation-icon" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
          
          {report.rule_results && report.rule_results.length > 0 && (
            <div className="report-section rules">
              <Card>
                <h3>Quality Rule Results</h3>
                <div className="rules-list">
                  {report.rule_results.map((rule, index) => (
                    <div className={`rule-item ${rule.passed ? 'passed' : 'failed'}`} key={index}>
                      <div className="rule-header">
                        <span className="rule-status">
                          {rule.passed ? (
                            <FiCheckCircle className="status-icon success" />
                          ) : (
                            <FiAlertTriangle className="status-icon warning" />
                          )}
                        </span>
                        <span className="rule-type">{rule.rule.type}</span>
                        {rule.rule.column && <span className="rule-column">{rule.rule.column}</span>}
                      </div>
                      <p className="rule-message">{rule.message}</p>
                      <div className="rule-details">
                        <div className="rule-detail">
                          <span className="detail-label">Expected:</span>
                          <span className="detail-value">
                            {rule.rule.threshold !== undefined ? `>= ${rule.rule.threshold}` : 
                             rule.rule.min !== undefined || rule.rule.max !== undefined ? 
                              `${rule.rule.min !== undefined ? rule.rule.min : 'any'} to ${rule.rule.max !== undefined ? rule.rule.max : 'any'}` :
                              rule.rule.pattern || 'N/A'}
                          </span>
                        </div>
                        {rule.actual !== undefined && (
                          <div className="rule-detail">
                            <span className="detail-label">Actual:</span>
                            <span className="detail-value">
                              {typeof rule.actual === 'object' ? JSON.stringify(rule.actual) : rule.actual}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QualityReport;