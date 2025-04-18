import axios from 'axios';
import { 
  generateRecommendations, 
  generateSystemRecommendations,
  getRecommendedActions
} from '../utils/recommendationEngine';

/**
 * Get recommendations for a specific file
 * @param {string} fileId - The file ID to get recommendations for
 * @returns {Promise<Array>} Array of recommendation objects
 */
export const getFileRecommendations = async (fileId) => {
  try {
    // Get file data
    const fileResponse = await axios.get(`/api/files/${fileId}`);
    const fileData = fileResponse.data;
    
    // Get lineage data
    let lineageData = [];
    try {
      const lineageResponse = await axios.get(`/api/lineage/file/${fileId}`);
      lineageData = lineageResponse.data;
    } catch (error) {
      console.warn('Failed to fetch lineage data for recommendations', error);
    }
    
    // Get file history
    let fileHistory = [];
    try {
      const historyResponse = await axios.get(`/api/files/${fileId}/history`);
      fileHistory = historyResponse.data;
    } catch (error) {
      console.warn('Failed to fetch file history for recommendations', error);
    }
    
    // Generate recommendations using the utility
    const recommendations = generateRecommendations(fileData, lineageData, fileHistory);
    
    // Check if a server-side API is available for enhanced recommendations
    try {
      const enhancedResponse = await axios.get(`/api/recommendations/file/${fileId}`);
      // Combine local and server recommendations, removing duplicates
      const enhancedRecommendations = enhancedResponse.data;
      const combinedRecommendations = [
        ...recommendations,
        ...enhancedRecommendations.filter(er => 
          !recommendations.some(r => r.id === er.id)
        )
      ];
      
      return combinedRecommendations;
    } catch (error) {
      // If server API fails, just return the local recommendations
      console.warn('Using local recommendations engine only', error);
      return recommendations;
    }
  } catch (error) {
    console.error('Error generating file recommendations:', error);
    throw error;
  }
};

/**
 * Get system-wide recommendations
 * @returns {Promise<Array>} Array of system-wide recommendation objects
 */
export const getSystemRecommendations = async () => {
  try {
    // Get all files
    const filesResponse = await axios.get('/api/files');
    const files = filesResponse.data;
    
    // Get all lineage data
    let lineageData = [];
    try {
      const lineageResponse = await axios.get('/api/lineage');
      lineageData = lineageResponse.data;
    } catch (error) {
      console.warn('Failed to fetch lineage data for system recommendations', error);
    }
    
    // Generate system-wide recommendations
    const recommendations = generateSystemRecommendations(files, lineageData);
    
    // Check if a server-side API is available for enhanced recommendations
    try {
      const enhancedResponse = await axios.get('/api/recommendations/system');
      // Combine local and server recommendations, removing duplicates
      const enhancedRecommendations = enhancedResponse.data;
      const combinedRecommendations = [
        ...recommendations,
        ...enhancedRecommendations.filter(er => 
          !recommendations.some(r => r.id === er.id)
        )
      ];
      
      return combinedRecommendations;
    } catch (error) {
      // If server API fails, just return the local recommendations
      console.warn('Using local system recommendations engine only', error);
      return recommendations;
    }
  } catch (error) {
    console.error('Error generating system recommendations:', error);
    throw error;
  }
};

/**
 * Get recommended actions for a file
 * @param {string} fileId - The file ID to get actions for
 * @returns {Promise<Array>} Array of recommended action objects
 */
export const getRecommendedFileActions = async (fileId) => {
  try {
    const fileResponse = await axios.get(`/api/files/${fileId}`);
    const fileData = fileResponse.data;
    
    return getRecommendedActions(fileData);
  } catch (error) {
    console.error('Error getting recommended actions:', error);
    throw error;
  }
};

/**
 * Dismiss a recommendation (mark as read/handled)
 * @param {string} recommendationId - The ID of the recommendation to dismiss
 * @returns {Promise<Object>} Success response
 */
export const dismissRecommendation = async (recommendationId) => {
  try {
    // Try to call server API if available
    try {
      const response = await axios.post('/api/recommendations/dismiss', {
        recommendationId
      });
      return response.data;
    } catch (error) {
      // If server API fails, store in localStorage as fallback
      const dismissed = JSON.parse(localStorage.getItem('dfo-dismissed-recommendations') || '[]');
      dismissed.push({
        id: recommendationId,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('dfo-dismissed-recommendations', JSON.stringify(dismissed));
      
      return { success: true, message: 'Recommendation dismissed (stored locally)' };
    }
  } catch (error) {
    console.error('Error dismissing recommendation:', error);
    throw error;
  }
};

/**
 * Check if a recommendation has been dismissed
 * @param {string} recommendationId - The ID of the recommendation to check
 * @returns {Promise<boolean>} True if the recommendation has been dismissed
 */
export const isRecommendationDismissed = async (recommendationId) => {
  try {
    // Try to call server API if available
    try {
      const response = await axios.get(`/api/recommendations/status/${recommendationId}`);
      return response.data.dismissed;
    } catch (error) {
      // If server API fails, check localStorage
      const dismissed = JSON.parse(localStorage.getItem('dfo-dismissed-recommendations') || '[]');
      return dismissed.some(d => d.id === recommendationId);
    }
  } catch (error) {
    console.error('Error checking recommendation status:', error);
    return false;
  }
};