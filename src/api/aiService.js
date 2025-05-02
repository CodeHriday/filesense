/**
 * AI Service for frontend
 * 
 * Provides functions to communicate with AI-related backend endpoints
 */

import axios from 'axios';

const API_URL = '/api';

/**
 * Get related datasets for a file
 * 
 * @param {string} fileId - ID of the file to find related datasets for
 * @param {Object} options - Options for the request
 * @param {number} options.limit - Maximum number of datasets to return
 * @param {number} options.threshold - Minimum similarity threshold (0-1)
 * @returns {Promise<Array>} - Array of related datasets with similarity scores
 */
export const getRelatedDatasets = async (fileId, { limit = 5, threshold = 0.5 } = {}) => {
  try {
    console.log(`Finding related datasets for file ${fileId}...`);
    const response = await axios.get(`${API_URL}/ai/related-datasets/${fileId}`, {
      params: { limit, threshold }
    });
    return response.data;
  } catch (error) {
    console.error('Error finding related datasets:', error);
    // For now, return empty array to avoid breaking the UI
    // In real implementation, we would throw the error
    return [];
  }
};

/**
 * Get explanation of relationship between two datasets
 * 
 * @param {string} fileId1 - ID of the first file
 * @param {string} fileId2 - ID of the second file
 * @returns {Promise<Object>} - Explanation object with details
 */
export const getRelationshipExplanation = async (fileId1, fileId2) => {
  try {
    console.log(`Getting relationship explanation for files ${fileId1} and ${fileId2}...`);
    const response = await axios.get(`${API_URL}/ai/relationship-explanation`, {
      params: { fileId1, fileId2 }
    });
    return response.data;
  } catch (error) {
    console.error('Error getting relationship explanation:', error);
    return {
      relationship_type: 'error',
      explanation: error.response?.data?.error || 'Failed to get relationship explanation'
    };
  }
};

/**
 * Generate embedding for a file
 * 
 * @param {string} fileId - ID of the file to generate embedding for
 * @returns {Promise<Object>} - Response with embedding info
 */
export const generateFileEmbedding = async (fileId) => {
  try {
    console.log(`Generating file embedding for file ${fileId}...`);
    const response = await axios.get(`${API_URL}/ai/file-embedding/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Error generating file embedding:', error);
    throw new Error(error.response?.data?.error || 'Failed to generate file embedding');
  }
};

/**
 * Chat with a dataset using natural language
 * 
 * @param {string} fileId - ID of the file to chat about
 * @param {string} message - User message
 * @param {Array} chatHistory - Previous chat messages (optional)
 * @returns {Promise<Object>} - AI response
 */
export const chatWithDataset = async (fileId, message, chatHistory = []) => {
  try {
    console.log(`Sending chat message for file ${fileId}...`);
    const response = await axios.post(`${API_URL}/ai/chat`, {
      fileId,
      message,
      chatHistory
    });
    return response.data;
  } catch (error) {
    console.error('Error in chat with dataset:', error);
    return {
      response: error.response?.data?.error || 'Failed to process chat message. Please try again later.',
      error: true
    };
  }
};
