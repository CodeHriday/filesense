/**
 * Smart Recommendation Engine for Data File Observatory
 * 
 * This engine analyzes data file metadata, quality metrics, and usage patterns
 * to generate actionable recommendations for improving data quality and insights.
 */

/**
 * Analyzes file quality metrics and generates recommendations based on detected issues
 * @param {Object} fileData - File metadata and quality metrics
 * @returns {Array} Array of recommendation objects
 */
export const generateQualityRecommendations = (fileData) => {
  const recommendations = [];
  
  if (!fileData) return recommendations;
  
  const { quality_score, quality_checks = {} } = fileData;
  
  // Low overall quality score recommendation
  if (quality_score < 70) {
    recommendations.push({
      id: 'low-quality-score',
      type: 'warning',
      title: 'Improve Overall Data Quality',
      description: `Your file has a quality score of ${quality_score}%. Consider addressing the specific issues below to improve data reliability.`,
      priority: 'high',
      actions: [
        {
          label: 'View Quality Report',
          path: `/quality/${encodeURIComponent(fileData.file_id)}`
        }
      ]
    });
  }
  
  // Missing values recommendations
  if (quality_checks.missing_values) {
    const missingColumns = Object.entries(quality_checks.missing_values)
      .filter(([_, percentage]) => percentage > 5)
      .sort((a, b) => b[1] - a[1]);
    
    if (missingColumns.length > 0) {
      const columnNames = missingColumns.slice(0, 3).map(([col, _]) => col).join(', ');
      const otherCount = missingColumns.length > 3 ? ` and ${missingColumns.length - 3} others` : '';
      
      recommendations.push({
        id: 'missing-values',
        type: 'warning',
        title: 'Address Missing Values',
        description: `Columns with significant missing values: ${columnNames}${otherCount}. Consider imputing these values or reviewing data collection methods.`,
        priority: missingColumns[0][1] > 20 ? 'high' : 'medium',
        actions: [
          {
            label: 'View Profile',
            path: `/profile/${encodeURIComponent(fileData.file_id)}`
          }
        ]
      });
    }
  }
  
  // Data type consistency recommendations
  if (quality_checks.data_type_consistency) {
    const inconsistentColumns = Object.entries(quality_checks.data_type_consistency)
      .filter(([_, consistency]) => consistency < 95)
      .sort((a, b) => a[1] - b[1]);
    
    if (inconsistentColumns.length > 0) {
      recommendations.push({
        id: 'type-consistency',
        type: 'error',
        title: 'Fix Data Type Inconsistencies',
        description: `${inconsistentColumns.length} columns have inconsistent data types. This can cause calculation errors and analysis problems.`,
        priority: 'high',
        actions: [
          {
            label: 'View Details',
            path: `/profile/${encodeURIComponent(fileData.file_id)}`
          }
        ]
      });
    }
  }
  
  // Duplicates recommendation
  if (quality_checks.duplicates && quality_checks.duplicates.percentage > 1) {
    recommendations.push({
      id: 'duplicates',
      type: 'info',
      title: 'Review Duplicate Records',
      description: `${quality_checks.duplicates.percentage.toFixed(2)}% of records appear to be duplicates (${quality_checks.duplicates.count} rows). Consider deduplicating your data.`,
      priority: quality_checks.duplicates.percentage > 5 ? 'medium' : 'low',
      actions: [
        {
          label: 'View Duplicates',
          path: `/quality/${encodeURIComponent(fileData.file_id)}?tab=duplicates`
        }
      ]
    });
  }
  
  // Outlier recommendations
  if (quality_checks.outliers) {
    const outlierColumns = Object.entries(quality_checks.outliers)
      .filter(([_, outliers]) => outliers.count > 0)
      .sort((a, b) => b[1].count - a[1].count);
    
    if (outlierColumns.length > 0) {
      const topOutlier = outlierColumns[0];
      
      recommendations.push({
        id: 'outliers',
        type: 'info',
        title: 'Review Statistical Outliers',
        description: `Found ${topOutlier[1].count} outliers in "${topOutlier[0]}" and ${outlierColumns.length - 1} other columns. These may represent errors or important edge cases.`,
        priority: 'medium',
        actions: [
          {
            label: 'View Outliers',
            path: `/profile/${encodeURIComponent(fileData.file_id)}?tab=distributions`
          }
        ]
      });
    }
  }
  
  // Date range recommendation
  if (quality_checks.date_ranges) {
    const suspiciousDateColumns = Object.entries(quality_checks.date_ranges)
      .filter(([_, range]) => (
        range.min && (new Date(range.min).getFullYear() < 1900 || new Date(range.min).getFullYear() > 2100) ||
        range.max && (new Date(range.max).getFullYear() < 1900 || new Date(range.max).getFullYear() > 2100)
      ));
    
    if (suspiciousDateColumns.length > 0) {
      recommendations.push({
        id: 'suspicious-dates',
        type: 'warning',
        title: 'Review Suspicious Date Values',
        description: `Found date values outside expected ranges in ${suspiciousDateColumns.length} columns. Check for formatting issues or data entry errors.`,
        priority: 'medium',
        actions: [
          {
            label: 'View Date Columns',
            path: `/profile/${encodeURIComponent(fileData.file_id)}`
          }
        ]
      });
    }
  }
  
  return recommendations;
};

/**
 * Analyzes lineage patterns and generates recommendations for better data traceability
 * @param {Object} fileData - File metadata
 * @param {Array} lineageData - File lineage relationships
 * @returns {Array} Array of recommendation objects
 */
export const generateLineageRecommendations = (fileData, lineageData) => {
  const recommendations = [];
  
  if (!fileData || !lineageData) return recommendations;
  
  // Missing upstream sources
  if (lineageData.filter(l => l.target_file_id === fileData.file_id).length === 0) {
    recommendations.push({
      id: 'missing-upstream',
      type: 'info',
      title: 'Document Data Sources',
      description: 'This file has no documented upstream sources. Add lineage connections to track where this data comes from.',
      priority: 'medium',
      actions: [
        {
          label: 'Add Lineage',
          path: `/lineage`
        }
      ]
    });
  }
  
  // Critical downstream dependencies
  const downstreamDependencies = lineageData.filter(l => l.source_file_id === fileData.file_id);
  if (downstreamDependencies.length > 3) {
    recommendations.push({
      id: 'critical-downstream',
      type: 'info',
      title: 'Critical Data Asset',
      description: `This file is used by ${downstreamDependencies.length} downstream processes. Consider adding additional quality checks to this critical data asset.`,
      priority: 'medium',
      actions: [
        {
          label: 'View Impact Analysis',
          path: `/lineage/impact/${fileData.file_id}`
        }
      ]
    });
  }
  
  return recommendations;
};

/**
 * Analyzes file access patterns and history to generate recommendations
 * @param {Object} fileData - File metadata
 * @param {Array} fileHistory - File version history
 * @returns {Array} Array of recommendation objects
 */
export const generateUsageRecommendations = (fileData, fileHistory) => {
  const recommendations = [];
  
  if (!fileData) return recommendations;
  
  // File freshness recommendation
  const lastUpdated = new Date(fileData.updated_at);
  const now = new Date();
  const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
  
  if (daysSinceUpdate > 90) {
    recommendations.push({
      id: 'stale-data',
      type: 'warning',
      title: 'Data May Be Stale',
      description: `This file hasn't been updated in ${daysSinceUpdate} days. Consider checking if a newer version is available.`,
      priority: 'medium',
      actions: [
        {
          label: 'Upload New Version',
          path: `/upload`
        }
      ]
    });
  }
  
  // Version history recommendation
  if (fileHistory && fileHistory.length > 5) {
    recommendations.push({
      id: 'frequent-changes',
      type: 'info',
      title: 'Frequently Changed File',
      description: `This file has been updated ${fileHistory.length} times. Consider setting up automated quality alerts to monitor changes.`,
      priority: 'low',
      actions: [
        {
          label: 'Setup Alerts',
          path: `/alerts`
        }
      ]
    });
  }
  
  return recommendations;
};

/**
 * Main recommendation engine function that combines all recommendation types
 * @param {Object} fileData - File metadata
 * @param {Array} lineageData - File lineage relationships
 * @param {Array} fileHistory - File version history
 * @returns {Array} Array of all recommendation objects, sorted by priority
 */
export const generateRecommendations = (fileData, lineageData = [], fileHistory = []) => {
  // Combine all recommendation types
  const allRecommendations = [
    ...generateQualityRecommendations(fileData),
    ...generateLineageRecommendations(fileData, lineageData),
    ...generateUsageRecommendations(fileData, fileHistory)
  ];
  
  // Sort recommendations by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return allRecommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
};

/**
 * Generate system-wide recommendations based on all files
 * @param {Array} files - All file metadata
 * @param {Array} lineageData - All lineage relationships
 * @returns {Array} Array of system-wide recommendation objects
 */
export const generateSystemRecommendations = (files, lineageData = []) => {
  const recommendations = [];
  
  if (!files || files.length === 0) return recommendations;
  
  // Low quality files recommendation
  const lowQualityFiles = files.filter(file => file.quality_score < 60);
  if (lowQualityFiles.length > 0) {
    const percentage = Math.round((lowQualityFiles.length / files.length) * 100);
    
    if (percentage > 20) {
      recommendations.push({
        id: 'system-quality-issues',
        type: 'warning',
        title: 'System-wide Quality Issues',
        description: `${percentage}% of your files have quality scores below 60%. Consider implementing a data quality program to address systematic issues.`,
        priority: 'high',
        actions: [
          {
            label: 'View Problem Files',
            path: `/monitor`
          }
        ]
      });
    }
  }
  
  // Missing lineage recommendation
  const filesWithoutLineage = files.filter(file => 
    !lineageData.some(l => l.source_file_id === file.file_id || l.target_file_id === file.file_id)
  );
  
  if (filesWithoutLineage.length > 0) {
    const percentage = Math.round((filesWithoutLineage.length / files.length) * 100);
    
    if (percentage > 50) {
      recommendations.push({
        id: 'missing-lineage',
        type: 'info',
        title: 'Document Data Lineage',
        description: `${percentage}% of your files have no lineage information. Improve traceability by documenting data relationships.`,
        priority: 'medium',
        actions: [
          {
            label: 'Setup Lineage',
            path: `/lineage`
          }
        ]
      });
    }
  }
  
  // File format standardization
  const fileTypes = files.reduce((acc, file) => {
    acc[file.file_type] = (acc[file.file_type] || 0) + 1;
    return acc;
  }, {});
  
  const fileTypeEntries = Object.entries(fileTypes);
  if (fileTypeEntries.length > 3) {
    recommendations.push({
      id: 'standardize-formats',
      type: 'info',
      title: 'Standardize File Formats',
      description: `You're using ${fileTypeEntries.length} different file formats. Consider standardizing on fewer formats for better consistency.`,
      priority: 'low',
      actions: []
    });
  }
  
  return recommendations;
};

/**
 * Generate file-specific actions based on file characteristics
 * @param {Object} fileData - File metadata
 * @returns {Array} Array of recommended action objects
 */
export const getRecommendedActions = (fileData) => {
  if (!fileData) return [];
  
  const actions = [];
  
  // Profiling action
  if (!fileData.processed_at) {
    actions.push({
      id: 'profile-file',
      label: 'Profile File',
      description: 'Generate statistical profile for this file',
      path: `/profile/${encodeURIComponent(fileData.file_id)}`,
      primary: true
    });
  }
  
  // Quality check action
  const qualityScore = parseFloat(fileData.quality_score);
  if (isNaN(qualityScore) || qualityScore === 0) {
    actions.push({
      id: 'check-quality',
      label: 'Check Quality',
      description: 'Run quality checks on this file',
      path: `/quality/${encodeURIComponent(fileData.file_id)}`,
      primary: true
    });
  } else if (qualityScore < 70) {
    actions.push({
      id: 'improve-quality',
      label: 'Improve Quality',
      description: 'Address quality issues in this file',
      path: `/quality/${encodeURIComponent(fileData.file_id)}`,
      primary: false
    });
  }
  
  // Set up alerts action
  actions.push({
    id: 'setup-alerts',
    label: 'Set Up Alerts',
    description: 'Configure quality alerts for this file',
    path: `/alerts`,
    primary: false
  });
  
  // Map/transform action
  actions.push({
    id: 'create-mapping',
    label: 'Create Mapping',
    description: 'Map this file to a new format',
    path: `/mappings`,
    primary: false
  });
  
  return actions;
};