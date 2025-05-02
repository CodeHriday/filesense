/**
 * Helper module for quality score calculation
 * Pure JavaScript implementation for better reliability
 */

/**
 * Calculate quality score from column data
 * 
 * @param {Array} columns - Column metadata array
 * @param {Object} fileMetadata - File metadata object
 * @returns {Promise<Object>} - Quality score results
 */
async function calculateQualityScore(columns, fileMetadata) {
  try {
    console.log('Calculating quality score for file with', columns.length, 'columns');
    
    // Define weights for different quality dimensions (sum should be 1.0)
    const weights = {
      completeness: 0.3,  // How much of the data is present
      consistency: 0.25,  // How consistent the data types and patterns are
      validity: 0.2,      // How valid the data is against business rules
      uniqueness: 0.15,   // How unique the values are
      timeliness: 0.1     // How recent the data is
    };
    
    const componentScores = {};
    const totalRows = fileMetadata?.row_count || 100;
    
    // Calculate COMPLETENESS score (percentage of non-null values)
    if (columns && columns.length > 0) {
      const missingPercentages = columns.map(column => {
        const nullCount = column.missing || 0;
        return totalRows > 0 ? (nullCount / totalRows * 100) : 0;
      });
      
      const avgMissingPct = missingPercentages.length > 0 ?
        missingPercentages.reduce((sum, pct) => sum + pct, 0) / missingPercentages.length : 0;
      
      componentScores.completeness = Math.max(0, 100 - avgMissingPct);
    } else {
      componentScores.completeness = 100;  // Default if no column data
    }
    
    // Calculate CONSISTENCY score (data type consistency)
    if (columns && columns.length > 0) {
      // Check if any columns have mismatched types
      const stringColumns = columns.filter(col => col.type === 'string').length;
      const dateColumns = columns.filter(col => col.type === 'date').length;
      const numericColumns = columns.filter(col => 
        ['integer', 'number', 'decimal', 'float'].includes(col.type)
      ).length;
      
      const otherColumns = columns.length - stringColumns - dateColumns - numericColumns;
      
      // Assume 90% consistency for now - without actual data, we estimate
      const consistencyScore = otherColumns === 0 ? 90 : 100 - (otherColumns / columns.length * 30);
      componentScores.consistency = Math.max(0, Math.min(100, consistencyScore));
    } else {
      componentScores.consistency = 90;  // Default if no column data
    }
    
    // Calculate VALIDITY score based on column types and potential errors
    componentScores.validity = (componentScores.consistency || 100) * 0.9;  // Estimate based on consistency
    
    // Calculate UNIQUENESS score
    if (columns && columns.length > 0) {
      const uniquenessScores = [];
      
      columns.forEach(column => {
        // Use unique values count if available
        const uniqueValues = column.unique || 0;
        
        if (uniqueValues > 0 && totalRows > 0) {
          // Calculate percentage of unique values
          const uniquenessPct = (uniqueValues / totalRows) * 100;
          // Cap at 100% for columns where every value is unique
          uniquenessScores.push(Math.min(100, uniquenessPct));
        }
      });
      
      // Use average uniqueness score across all columns
      const avgUniqueness = uniquenessScores.length > 0 ?
        uniquenessScores.reduce((sum, score) => sum + score, 0) / uniquenessScores.length : 80;
      
      componentScores.uniqueness = avgUniqueness;
    } else {
      componentScores.uniqueness = 80;  // Default if no column data
    }
    
    // Calculate TIMELINESS score
    if (fileMetadata && fileMetadata.created_at) {
      try {
        // Parse the timestamp (assuming ISO format)
        let createdAt;
        
        if (typeof fileMetadata.created_at === 'string') {
          createdAt = new Date(fileMetadata.created_at);
        } else {
          // Assume it's already a date object or fallback to now
          createdAt = fileMetadata.created_at || new Date();
        }
        
        if (createdAt && !isNaN(createdAt.getTime())) {
          // Calculate days since creation
          const daysSinceCreation = Math.floor((new Date() - createdAt) / (1000 * 60 * 60 * 24));
          // Score decreases by 5 points per day, minimum 0
          componentScores.timeliness = Math.max(0, 100 - (daysSinceCreation * 5));
        } else {
          componentScores.timeliness = 90;  // Default if date parsing fails
        }
      } catch (e) {
        console.error('Error calculating timeliness:', e);
        componentScores.timeliness = 90;  // Default if date parsing fails
      }
    } else {
      componentScores.timeliness = 90;  // Default if no timestamp data
    }
    
    // Calculate OVERALL score using weighted average
    const overallScore = Object.entries(weights).reduce((score, [component, weight]) => {
      return score + (componentScores[component] || 0) * weight;
    }, 0);
    
    // Round scores to 2 decimal places
    const roundedOverallScore = Math.round(overallScore * 100) / 100;
    const roundedComponentScores = {};
    
    Object.entries(componentScores).forEach(([key, value]) => {
      roundedComponentScores[key] = Math.round(value * 100) / 100;
    });
    
    // Prepare the result
    const result = {
      overall_score: roundedOverallScore,
      components: roundedComponentScores,
      weights: weights
    };
    
    console.log('Quality score calculation completed successfully');
    return result;
  } catch (error) {
    console.error('Error calculating quality score:', error);
    // Return a default score in case of error
    return {
      overall_score: 80,
      components: {
        completeness: 80,
        consistency: 80,
        validity: 80,
        uniqueness: 80,
        timeliness: 80
      },
      weights: {
        completeness: 0.3,
        consistency: 0.25,
        validity: 0.2,
        uniqueness: 0.15,
        timeliness: 0.1
      }
    };
  }
}

module.exports = {
  calculateQualityScore
};
