import { useState, useEffect } from 'react';
import { getFileQuality } from '../api/fileService';

/**
 * Custom hook to fetch quality components for a file
 * @param {string} fileId - The ID of the file
 * @returns {Object} - Object with quality components and loading/error state
 */
export const useQualityComponents = (fileId) => {
  const [qualityData, setQualityData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchQualityData = async () => {
      if (!fileId) {
        setQualityData(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await getFileQuality(fileId);
        
        // Extract component scores from the checks
        const componentScores = {};
        
        if (data && data.checks && Array.isArray(data.checks)) {
          // Map check types to their scores
          data.checks.forEach(check => {
            if (check.type && check.score) {
              componentScores[check.type] = parseFloat(check.score);
            }
          });
        }

        setQualityData({
          score: data?.qualityScore,
          components: componentScores,
          raw: data
        });
        setError(null);
      } catch (err) {
        console.error('Error fetching quality components:', err);
        setError('Failed to load quality components');
        setQualityData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQualityData();
  }, [fileId]);

  return { qualityData, isLoading, error };
};
