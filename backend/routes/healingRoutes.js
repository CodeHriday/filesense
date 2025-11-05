const express = require('express');
const router = express.Router();
const axios = require('axios');

module.exports = (dbPool, logger) => {
  /**
   * GET /api/ml/recommendations/:anomaly_id
   * Get healing recommendations for an anomaly
   */
  router.get('/recommendations/:anomaly_id', async (req, res) => {
    try {
      const { anomaly_id } = req.params;
      
      // Get anomaly details
      const anomalyQuery = `
        SELECT 
          id,
          anomaly_id,
          file_id,
          file_name,
          mapping_id,
          job_id,
          anomaly_type,
          severity,
          title,
          description,
          anomaly_details,
          expected_value,
          actual_value,
          deviation_percentage,
          status,
          detected_at
        FROM anomalies
        WHERE anomaly_id = $1
      `;
      
      const anomalyResult = await dbPool.query(anomalyQuery, [anomaly_id]);
      
      if (anomalyResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Anomaly not found'
        });
      }
      
      const anomaly = anomalyResult.rows[0];
      
      // Generate recommendations based on anomaly type
      const recommendations = generateRecommendations(anomaly);
      
      res.json({
        success: true,
        anomaly_id,
        recommendations
      });
      
    } catch (err) {
      logger.error('Error generating recommendations:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to generate recommendations',
        details: err.message
      });
    }
  });

  return router;
};

/**
 * Generate healing recommendations for an anomaly
 */
function generateRecommendations(anomaly) {
  const recommendations = [];
  const anomalyType = anomaly.anomaly_type;
  const details = anomaly.anomaly_details || {};
  
  switch (anomalyType) {
    case 'statistical_outlier':
      recommendations.push(
        {
          id: 'add_validation_rule',
          title: `Add validation rule for ${details.metric_name || 'metric'}`,
          description: `Create a validation rule to flag or reject files where ${details.metric_name || 'this metric'} exceeds expected thresholds`,
          category: 'validation',
          priority: details.z_score > 4 ? 'high' : 'medium',
          action_type: 'create_validation_rule',
          action_params: {
            metric: details.metric_name,
            threshold_type: 'z_score',
            threshold_value: details.z_score,
            action: 'flag'
          },
          effort: 'low',
          impact: 'high'
        },
        {
          id: 'adjust_quality_thresholds',
          title: 'Adjust quality check thresholds',
          description: `Review and update acceptable ranges for ${details.metric_name || 'this metric'} based on recent data patterns`,
          category: 'configuration',
          priority: 'medium',
          action_type: 'update_thresholds',
          action_params: {
            metric: details.metric_name,
            current_value: anomaly.actual_value,
            expected_value: anomaly.expected_value
          },
          effort: 'low',
          impact: 'medium'
        },
        {
          id: 'investigate_source',
          title: 'Investigate data source changes',
          description: 'Check if there have been recent changes to the data source or upstream processes',
          category: 'investigation',
          priority: details.z_score > 5 ? 'high' : 'medium',
          action_type: 'manual_investigation',
          action_params: {
            focus_areas: ['source_system', 'extraction_process', 'data_pipeline']
          },
          effort: 'medium',
          impact: 'high'
        }
      );
      break;
      
    case 'range_violation':
      recommendations.push(
        {
          id: 'create_transformation',
          title: `Create ETL transformation to filter ${details.metric_name || 'metric'}`,
          description: 'Add a transformation step to filter or cap values outside the acceptable range',
          category: 'transformation',
          priority: 'high',
          action_type: 'create_etl_transformation',
          action_params: {
            transformation_type: 'filter',
            field: details.metric_name,
            min_value: details.lower_bound,
            max_value: details.upper_bound,
            on_violation: 'cap_value'
          },
          effort: 'medium',
          impact: 'high'
        },
        {
          id: 'update_range_constraints',
          title: 'Update acceptable range constraints',
          description: `Adjust the acceptable range for ${details.metric_name || 'this metric'} if business requirements have changed`,
          category: 'configuration',
          priority: 'medium',
          action_type: 'update_constraints',
          action_params: {
            metric: details.metric_name,
            current_range: `${details.lower_bound} - ${details.upper_bound}`,
            suggested_action: 'review_and_adjust'
          },
          effort: 'low',
          impact: 'medium'
        },
        {
          id: 'create_alert',
          title: 'Create alert for future range violations',
          description: `Set up automated alerts when ${details.metric_name || 'this metric'} falls outside acceptable range`,
          category: 'monitoring',
          priority: 'medium',
          action_type: 'create_alert_rule',
          action_params: {
            metric: details.metric_name,
            condition: 'outside_range',
            min_value: details.lower_bound,
            max_value: details.upper_bound,
            notification_channels: ['email', 'dashboard']
          },
          effort: 'low',
          impact: 'medium'
        }
      );
      break;
      
    case 'trend_deviation':
      recommendations.push(
        {
          id: 'create_monitoring',
          title: `Create monitoring dashboard for ${details.metric_name || 'metric'} trends`,
          description: 'Set up real-time monitoring to track trends and detect future deviations early',
          category: 'monitoring',
          priority: details.deviation_pct > 100 ? 'high' : 'medium',
          action_type: 'create_dashboard',
          action_params: {
            metric: details.metric_name,
            chart_type: 'time_series',
            include_moving_average: true,
            include_thresholds: true
          },
          effort: 'medium',
          impact: 'high'
        },
        {
          id: 'review_collection',
          title: 'Review data collection process',
          description: 'Investigate if there are changes in data collection timing or frequency',
          category: 'investigation',
          priority: 'medium',
          action_type: 'manual_investigation',
          action_params: {
            focus_areas: ['collection_schedule', 'data_freshness', 'processing_delays']
          },
          effort: 'medium',
          impact: 'medium'
        }
      );
      break;
      
    case 'quality_degradation':
      recommendations.push(
        {
          id: 'detailed_profiling',
          title: 'Run detailed quality profiling',
          description: 'Perform in-depth analysis to identify specific quality issues',
          category: 'investigation',
          priority: details.degradation_pct > 50 ? 'critical' : 'high',
          action_type: 'run_profiling',
          action_params: {
            profiling_type: 'detailed',
            focus_areas: ['completeness', 'consistency', 'validity', 'accuracy']
          },
          effort: 'low',
          impact: 'high'
        },
        {
          id: 'quality_transformations',
          title: 'Add data quality transformations',
          description: 'Implement ETL transformations to clean and standardize data',
          category: 'transformation',
          priority: 'high',
          action_type: 'create_etl_transformation',
          action_params: {
            transformation_type: 'quality_improvement',
            suggested_steps: [
              'Remove duplicates',
              'Fill missing values',
              'Standardize formats',
              'Validate data types'
            ]
          },
          effort: 'high',
          impact: 'high'
        },
        {
          id: 'validation_rules',
          title: 'Implement validation rules',
          description: 'Add automated validation rules to reject or flag low-quality files',
          category: 'validation',
          priority: 'high',
          action_type: 'create_validation_rule',
          action_params: {
            rule_type: 'quality_threshold',
            score_type: details.score_type,
            min_acceptable_score: parseFloat(anomaly.expected_value || 80),
            action: 'flag'
          },
          effort: 'medium',
          impact: 'high'
        }
      );
      break;
      
    case 'schema_mismatch':
      if (details.mismatch_type === 'column_count') {
        recommendations.push(
          {
            id: 'update_schema',
            title: 'Update expected schema',
            description: 'Update the expected schema definition to match the new file structure',
            category: 'configuration',
            priority: 'high',
            action_type: 'update_schema',
            action_params: {
              expected_columns: anomaly.expected_value,
              actual_columns: anomaly.actual_value,
              action: 'review_and_update'
            },
            effort: 'low',
            impact: 'high'
          }
        );
      } else if (details.mismatch_type === 'data_types') {
        recommendations.push(
          {
            id: 'add_type_conversion',
            title: 'Add type conversion transformations',
            description: 'Create transformations to convert data types to expected format',
            category: 'transformation',
            priority: 'high',
            action_type: 'create_etl_transformation',
            action_params: {
              transformation_type: 'type_conversion',
              conversions: details.mismatches || []
            },
            effort: 'medium',
            impact: 'high'
          },
          {
            id: 'schema_validation',
            title: 'Enable strict schema validation',
            description: 'Add schema validation to reject files with type mismatches',
            category: 'validation',
            priority: 'medium',
            action_type: 'create_validation_rule',
            action_params: {
              rule_type: 'schema_validation',
              strict_types: true,
              action: 'reject'
            },
            effort: 'low',
            impact: 'medium'
          }
        );
      }
      recommendations.push(
        {
          id: 'create_mapping',
          title: 'Create flexible column mapping',
          description: 'Set up a transformation mapping that adapts to column variations',
          category: 'transformation',
          priority: 'medium',
          action_type: 'create_etl_transformation',
          action_params: {
            transformation_type: 'flexible_mapping',
            handle_extra_columns: 'ignore',
            handle_missing_columns: 'fill_default'
          },
          effort: 'medium',
          impact: 'high'
        },
        {
          id: 'document_schema',
          title: 'Document expected schema',
          description: 'Create or update schema documentation for this file type',
          category: 'documentation',
          priority: 'low',
          action_type: 'manual_documentation',
          action_params: {
            file_type: anomaly.file_name ? anomaly.file_name.split('.').pop() : 'unknown',
            include_examples: true
          },
          effort: 'low',
          impact: 'low'
        }
      );
      break;
      
    default:
      recommendations.push({
        id: 'manual_review',
        title: 'Manual review required',
        description: 'This anomaly type requires manual investigation to determine appropriate fixes',
        category: 'investigation',
        priority: 'medium',
        action_type: 'manual_investigation',
        action_params: {
          anomaly_type: anomalyType || 'unknown',
          anomaly_details: details
        },
        effort: 'medium',
        impact: 'unknown'
      });
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return recommendations.sort((a, b) => 
    priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}
