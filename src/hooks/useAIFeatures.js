/**
 * Hook for AI features including related datasets and chat with dataset
 */

import { useState, useCallback } from 'react';
import { getRelatedDatasets, getRelationshipExplanation, chatWithDataset } from '../api/aiService';

/**
 * Hook for AI-related features
 * 
 * @returns {Object} Hook functions and state
 */
const useAIFeatures = () => {
  const [relatedDatasets, setRelatedDatasets] = useState([]);
  const [loadingRelatedDatasets, setLoadingRelatedDatasets] = useState(false);
  const [relationshipExplanation, setRelationshipExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [error, setError] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  /**
   * Fetch related datasets for a file
   * 
   * @param {string} fileId - ID of the file to find related datasets for
   * @param {Object} options - Options for the request
   */
  const fetchRelatedDatasets = useCallback(async (fileId, options = {}) => {
    try {
      setLoadingRelatedDatasets(true);
      setError(null);
      
      const datasets = await getRelatedDatasets(fileId, options);
      
      // Format the similarity score for display
      const formattedDatasets = datasets.map(dataset => ({
        ...dataset,
        similarity_formatted: `${Math.round(dataset.similarity * 100)}%`,
        similarity_value: dataset.similarity // Keep the raw value for sorting/filtering
      }));
      
      setRelatedDatasets(formattedDatasets);
    } catch (err) {
      console.error('Error in fetchRelatedDatasets:', err);
      setError('Failed to load related datasets');
      setRelatedDatasets([]);
    } finally {
      setLoadingRelatedDatasets(false);
    }
  }, []);

  /**
   * Fetch relationship explanation between two files
   * 
   * @param {string} fileId1 - ID of the first file
   * @param {string} fileId2 - ID of the second file
   */
  const fetchRelationshipExplanation = useCallback(async (fileId1, fileId2) => {
    try {
      setLoadingExplanation(true);
      setError(null);
      
      const explanation = await getRelationshipExplanation(fileId1, fileId2);
      setRelationshipExplanation(explanation);
    } catch (err) {
      console.error('Error in fetchRelationshipExplanation:', err);
      setError('Failed to load relationship explanation');
      setRelationshipExplanation(null);
    } finally {
      setLoadingExplanation(false);
    }
  }, []);

  /**
   * Clear the related datasets and reset the state
   */
  const clearRelatedDatasets = useCallback(() => {
    setRelatedDatasets([]);
    setError(null);
  }, []);

  /**
   * Clear the relationship explanation and reset the state
   */
  const clearRelationshipExplanation = useCallback(() => {
    setRelationshipExplanation(null);
    setError(null);
  }, []);

  return {
    // State
    relatedDatasets,
    loadingRelatedDatasets,
    relationshipExplanation,
    loadingExplanation,
    error,
    
    // Functions
    fetchRelatedDatasets,
    fetchRelationshipExplanation,
    clearRelatedDatasets,
    clearRelationshipExplanation
  };
};

export default useAIFeatures;
