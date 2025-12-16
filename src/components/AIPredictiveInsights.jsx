import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FaLightbulb, FaChartLine, FaExclamationTriangle, FaTimes, FaArrowRight } from 'react-icons/fa';
import LoadingSpinner from './LoadingSpinner';
import '../styles/AIPredictiveInsights.css';
import PropTypes from 'prop-types';

const AIPredictiveInsights = ({ fileId, onClose }) => {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!fileId) return;
    
    const fetchInsights = async () => {
      setLoading(true);
      setError('');
      
      try {
        const response = await fetch(`/api/files/${fileId}/insights`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch insights: ${response.statusText}`);
        }
        
        const data = await response.json();
        setInsights(data);
      } catch (err) {
        console.error('Error fetching AI insights:', err);
        setError('Failed to load AI insights');
      } finally {
        setLoading(false);
      }
    };
    
    if (hasPermission('insight_view')) {
      fetchInsights();
    } else {
      setError('You do not have permission to view AI insights');
      setLoading(false);
    }
  }, [fileId, hasPermission]);
  
  const renderSummary = () => {
    if (!insights || !insights.summary) {
      return <p>No summary information available</p>;
    }
    
    const { fileType, rowCount, columnCount, qualityScore, createdAt } = insights.summary;
    
    return (
      <div className="insights-summary">
        <div className="insight-item">
          <span className="label">File Type:</span>
          <span className="value">{fileType.toUpperCase()}</span>
        </div>
        <div className="insight-item">
          <span className="label">Rows:</span>
          <span className="value">{rowCount.toLocaleString()}</span>
        </div>
        <div className="insight-item">
          <span className="label">Columns:</span>
          <span className="value">{columnCount}</span>
        </div>
        <div className="insight-item">
          <span className="label">Quality Score:</span>
          <span className="value quality-score">
            {parseFloat(qualityScore).toFixed(1)}%
          </span>
        </div>
        <div className="insight-item">
          <span className="label">Created:</span>
          <span className="value">
            {new Date(createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    );
  };
  
  const renderColumnInsights = () => {
    if (!insights || !insights.columnInsights || insights.columnInsights.length === 0) {
      return <p>No column insights available</p>;
    }
    
    return (
      <div className="column-insights">
        {insights.columnInsights.map((column, index) => (
          <div key={`column-insight-${column.name || column.id || index}`} className="column-insight-item">
            <h4>{column.name}</h4>
            <div className="column-metadata">
              <span className="column-type">{column.type}</span>
              <span className="column-stat">
                Null: {column.nullPercentage ? `${(column.nullPercentage * 100).toFixed(1)}%` : 'N/A'}
              </span>
              <span className="column-stat">
                Unique: {column.uniquePercentage ? `${(column.uniquePercentage * 100).toFixed(1)}%` : 'N/A'}
              </span>
            </div>
            {column.recommendations && column.recommendations.length > 0 && (
              <div className="column-recommendations">
                <h5>Recommendations:</h5>
                <ul>
                  {column.recommendations.map((rec, idx) => (
                    <li key={`col-rec-${rec.substring(0, 20)}-${idx}`}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  const renderQualityInsights = () => {
    if (!insights || !insights.qualityInsights) {
      return <p>No quality insights available</p>;
    }
    
    const {
      overallScore,
      completenessScore,
      validityScore,
      consistencyScore,
      accuracyScore,
      issues
    } = insights.qualityInsights;
    
    return (
      <div className="quality-insights">
        <div className="quality-scores">
          <div className="quality-score-item">
            <div className="score-label">Overall:</div>
            <div className="score-value">{overallScore}%</div>
          </div>
          <div className="quality-score-item">
            <div className="score-label">Completeness:</div>
            <div className="score-value">{completenessScore}%</div>
          </div>
          <div className="quality-score-item">
            <div className="score-label">Validity:</div>
            <div className="score-value">{validityScore}%</div>
          </div>
          <div className="quality-score-item">
            <div className="score-label">Consistency:</div>
            <div className="score-value">{consistencyScore}%</div>
          </div>
          <div className="quality-score-item">
            <div className="score-label">Accuracy:</div>
            <div className="score-value">{accuracyScore}%</div>
          </div>
        </div>
        
        {issues && issues.length > 0 && (
          <div className="quality-issues">
            <h4>Identified Issues:</h4>
            <ul>
              {issues.map((issue, index) => (
                <li key={`issue-${issue.type || issue.description?.substring(0, 20) || index}`} className={`issue-severity-${issue.severity}`}>
                  <div className="issue-header">
                    <FaExclamationTriangle />
                    <span>{issue.title}</span>
                  </div>
                  <p>{issue.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };
  
  const renderRecommendations = () => {
    if (!insights || !insights.recommendations || insights.recommendations.length === 0) {
      return <p>No recommendations available</p>;
    }
    
    return (
      <div className="insights-recommendations">
        {insights.recommendations.map((rec, index) => (
          <div key={`rec-${rec.id || rec.type || rec.title?.substring(0, 20) || index}`} className={`recommendation-item priority-${rec.priority}`}>
            <div className="recommendation-header">
              <FaLightbulb className="recommendation-icon" />
              <h4>{rec.title}</h4>
            </div>
            <p>{rec.description}</p>
            {rec.actionable && (
              <div className="recommendation-actions">
                <button className="action-button">
                  Take Action <FaArrowRight />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="ai-insights-sidebar">
      <div className="insights-header">
        <h3>
          <FaLightbulb /> AI Predictive Insights
        </h3>
        <button className="close-insights-btn" onClick={onClose} aria-label="Close insights">
          <FaTimes />
        </button>
      </div>
      
      {loading ? (
        <LoadingSpinner size="small" />
      ) : error ? (
        <div className="insights-error">{error}</div>
      ) : insights ? (
        <>
          <div className="insights-tabs">
            <button 
              className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              Summary
            </button>
            <button 
              className={`tab-btn ${activeTab === 'columns' ? 'active' : ''}`}
              onClick={() => setActiveTab('columns')}
            >
              Columns
            </button>
            <button 
              className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`}
              onClick={() => setActiveTab('quality')}
            >
              Quality
            </button>
            <button 
              className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
              onClick={() => setActiveTab('recommendations')}
            >
              Tips
            </button>
          </div>
          
          <div className="insights-content">
            {activeTab === 'summary' && renderSummary()}
            {activeTab === 'columns' && renderColumnInsights()}
            {activeTab === 'quality' && renderQualityInsights()}
            {activeTab === 'recommendations' && renderRecommendations()}
          </div>
        </>
      ) : (
        <div className="no-insights">No insights available for this file.</div>
      )}
    </div>
  );
};


AIPredictiveInsights.propTypes = {
  /** File ID for which AI insights are fetched */
  fileId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired,

  /** Callback to close the insights sidebar */
  onClose: PropTypes.func.isRequired
};

export default AIPredictiveInsights;