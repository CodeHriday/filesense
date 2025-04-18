import axios from 'axios';

// Badge definitions with criteria
export const BADGE_DEFINITIONS = {
  'quality-bronze': {
    type: 'quality',
    level: 'bronze',
    label: 'Quality Assurer',
    description: 'Achieved a data quality score above 70%',
    threshold: 70,
    field: 'qualityScore'
  },
  'quality-silver': {
    type: 'quality',
    level: 'silver',
    label: 'Quality Guardian',
    description: 'Achieved a data quality score above 80%',
    threshold: 80,
    field: 'qualityScore'
  },
  'quality-gold': {
    type: 'quality',
    level: 'gold',
    label: 'Quality Champion',
    description: 'Achieved a data quality score above 90%',
    threshold: 90,
    field: 'qualityScore'
  },
  'quality-platinum': {
    type: 'quality',
    level: 'platinum',
    label: 'Quality Master',
    description: 'Achieved a data quality score above 95%',
    threshold: 95,
    field: 'qualityScore'
  },
  'completeness-bronze': {
    type: 'completeness',
    level: 'bronze',
    label: 'Completeness Observer',
    description: 'Achieved a data completeness score above 75%',
    threshold: 75,
    field: 'completenessScore'
  },
  'completeness-silver': {
    type: 'completeness',
    level: 'silver',
    label: 'Completeness Tracker',
    description: 'Achieved a data completeness score above 85%',
    threshold: 85,
    field: 'completenessScore'
  },
  'completeness-gold': {
    type: 'completeness',
    level: 'gold',
    label: 'Completeness Expert',
    description: 'Achieved a data completeness score above 95%',
    threshold: 95,
    field: 'completenessScore'
  },
  'consistency-bronze': {
    type: 'consistency',
    level: 'bronze',
    label: 'Consistency Keeper',
    description: 'Achieved a data consistency score above 70%',
    threshold: 70,
    field: 'consistencyScore'
  },
  'consistency-silver': {
    type: 'consistency',
    level: 'silver',
    label: 'Consistency Guardian',
    description: 'Achieved a data consistency score above 85%',
    threshold: 85,
    field: 'consistencyScore'
  },
  'consistency-gold': {
    type: 'consistency',
    level: 'gold',
    label: 'Consistency Master',
    description: 'Achieved a data consistency score above 95%',
    threshold: 95,
    field: 'consistencyScore'
  },
  'freshness-bronze': {
    type: 'freshness',
    level: 'bronze',
    label: 'Freshness Scout',
    description: 'Maintained data freshness with weekly updates',
    threshold: 7, // days
    field: 'daysSinceLastUpdate'
  },
  'freshness-silver': {
    type: 'freshness',
    level: 'silver',
    label: 'Freshness Tracker',
    description: 'Maintained data freshness with updates every 3 days',
    threshold: 3, // days
    field: 'daysSinceLastUpdate'
  },
  'freshness-gold': {
    type: 'freshness',
    level: 'gold',
    label: 'Freshness Steward',
    description: 'Maintained data freshness with daily updates',
    threshold: 1, // days
    field: 'daysSinceLastUpdate'
  },
  'improvement-bronze': {
    type: 'improvement',
    level: 'bronze',
    label: 'Data Improver',
    description: 'Improved data quality score by at least 5% over time',
    threshold: 5,
    field: 'improvementPercentage'
  },
  'improvement-silver': {
    type: 'improvement',
    level: 'silver',
    label: 'Data Enhancer',
    description: 'Improved data quality score by at least 10% over time',
    threshold: 10,
    field: 'improvementPercentage'
  },
  'improvement-gold': {
    type: 'improvement',
    level: 'gold',
    label: 'Data Transformer',
    description: 'Improved data quality score by at least 20% over time',
    threshold: 20,
    field: 'improvementPercentage'
  },
  'excellence-platinum': {
    type: 'excellence',
    level: 'platinum',
    label: 'Data Excellence Champion',
    description: 'Achieved excellence across all data quality dimensions',
    threshold: 95,
    field: 'overallScore'
  }
};

// Get all badge definitions
export const getBadgeDefinitions = () => {
  return Object.values(BADGE_DEFINITIONS);
};

// Get user badges from API
export const getUserBadges = async () => {
  try {
    const response = await axios.get('/api/badges');
    return response.data;
  } catch (error) {
    console.error('Error fetching user badges:', error);
    return [];
  }
};

// Check for new badges based on file quality
export const checkForBadges = async (fileData) => {
  try {
    const response = await axios.post('/api/badges/check', fileData);
    return response.data;
  } catch (error) {
    console.error('Error checking for badges:', error);
    return { newBadges: [], allBadges: [] };
  }
};

// Save earned badge to API
export const saveBadge = async (badgeData) => {
  try {
    const response = await axios.post('/api/badges', badgeData);
    return response.data;
  } catch (error) {
    console.error('Error saving badge:', error);
    return null;
  }
};

// Delete a badge from user profile
export const deleteBadge = async (badgeId) => {
  try {
    await axios.delete(`/api/badges/${badgeId}`);
    return true;
  } catch (error) {
    console.error('Error deleting badge:', error);
    return false;
  }
};