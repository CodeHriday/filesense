import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiLink, FiEye, FiInfo, FiBarChart2, FiCalendar, FiFile } from 'react-icons/fi';
import { formatDate, getTimeSince } from '../../utils/formatters';
import { useAIFeatures } from '../../hooks';
import './RelatedDatasets.css';

/**
 * Display a list of related datasets for a file
 */
const RelatedDatasetsList = ({ fileId, limit = 5, threshold = 0.5 }) => {
  const { 
    relatedDatasets, 
    loadingRelatedDatasets, 
    error,
    fetchRelatedDatasets,
    fetchRelationshipExplanation,
    relationshipExplanation,
    loadingExplanation,
    clearRelationshipExplanation
  } = useAIFeatures();
  
  const [selectedDataset, setSelectedDataset] = useState(null);

  // Load related datasets when the component mounts or fileId changes
  useEffect(() => {
    if (fileId) {
      fetchRelatedDatasets(fileId, { limit, threshold });
    }
  }, [fileId, limit, threshold, fetchRelatedDatasets]);

  // Handle explanation request
  const handleExplanationRequest = (relatedFileId) => {
    setSelectedDataset(relatedFileId);
    fetchRelationshipExplanation(fileId, relatedFileId);
  };

  const handleCloseExplanation = () => {
    setSelectedDataset(null);
    clearRelationshipExplanation();
  };

  // Handle loading state
  if (loadingRelatedDatasets) {
    return (
      <div className="related-datasets-loading">
        <div className="spinner"></div>
        <p>Analyzing datasets...</p>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="related-datasets-error">
        <p>Error: {error}</p>
      </div>
    );
  }

  // Handle empty state
  if (!relatedDatasets || relatedDatasets.length === 0) {
    return (
      <div className="related-datasets-empty">
        <p>No related datasets found for this file.</p>
      </div>
    );
  }

  return (
    <div className="related-datasets-container">
      <h3>Related Datasets</h3>
      <div className="related-datasets-list">
        {relatedDatasets.map((dataset) => (
          <div key={dataset.file_id} className="related-dataset-item">
            <div className="dataset-header">
              <div className="dataset-title">
                <FiFile className="file-icon" />
                <Link to={`/profile/${dataset.file_id}`} className="dataset-name">
                  {dataset.filename}
                </Link>
              </div>
              <div className="similarity-score">
                <span className={`score-value score-${Math.round(dataset.similarity * 10)}`}>
                  {dataset.similarity_formatted} match
                </span>
              </div>
            </div>
            
            <div className="dataset-details">
              <div className="detail-item">
                <FiBarChart2 />
                <span>Quality: {dataset.quality_score}%</span>
              </div>
              <div className="detail-item">
                <FiCalendar />
                <span>Created: {getTimeSince(dataset.created_at)}</span>
              </div>
              <div className="detail-item">
                <FiFile />
                <span>Type: {dataset.file_type.toUpperCase()}</span>
              </div>
            </div>
            
            <div className="dataset-actions">
              <button 
                className="action-button view-button"
                onClick={() => window.open(`/profile/${dataset.file_id}`, '_blank')}
              >
                <FiEye /> View Dataset
              </button>
              <button 
                className="action-button explain-button"
                onClick={() => handleExplanationRequest(dataset.file_id)}
                disabled={loadingExplanation}
              >
                <FiInfo /> Explain Relationship
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Relationship Explanation Modal */}
      {relationshipExplanation && (
        <div className="relationship-explanation-modal">
          <div className="modal-content">
            <h3>Relationship Analysis</h3>
            <div className="relationship-type">
              <FiLink />
              <span className={`type-value type-${relationshipExplanation.relationship_type}`}>
                {relationshipExplanation.relationship_type.replace('_', ' ')}
              </span>
            </div>
            <p className="explanation-text">
              {relationshipExplanation.explanation}
            </p>
            
            {relationshipExplanation.matching_columns && relationshipExplanation.matching_columns.length > 0 && (
              <div className="matching-columns">
                <h4>Matching Columns</h4>
                <ul>
                  {relationshipExplanation.matching_columns.map((column, index) => (
                    <li key={index}>{column}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="modal-actions">
              <button 
                className="close-button"
                onClick={handleCloseExplanation}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RelatedDatasetsList;
