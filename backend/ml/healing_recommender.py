"""
Auto-Healing Recommendation Engine for Data File Observatory
Generates actionable recommendations for fixing detected anomalies
"""

from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


class HealingRecommender:
    """
    Generates context-specific healing recommendations for detected anomalies
    """
    
    def __init__(self):
        """Initialize healing recommender"""
        logger.info("Healing recommender initialized")
    
    def generate_recommendations(
        self,
        anomaly: Dict[str, Any],
        file_context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate healing recommendations for an anomaly
        
        Args:
            anomaly: Anomaly dictionary with type, severity, details
            file_context: Optional file context for more specific recommendations
            
        Returns:
            List of recommendation dictionaries
        """
        anomaly_type = anomaly.get('anomaly_type')
        
        if not anomaly_type:
            return []
        
        # Route to appropriate recommendation generator
        generators = {
            'statistical_outlier': self._recommend_outlier_fixes,
            'range_violation': self._recommend_range_fixes,
            'trend_deviation': self._recommend_trend_fixes,
            'quality_degradation': self._recommend_quality_fixes,
            'schema_mismatch': self._recommend_schema_fixes
        }
        
        generator = generators.get(anomaly_type)
        if generator:
            return generator(anomaly, file_context)
        
        return self._recommend_generic_fixes(anomaly, file_context)
    
    def _recommend_outlier_fixes(
        self,
        anomaly: Dict[str, Any],
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Recommendations for statistical outliers"""
        recommendations = []
        
        details = anomaly.get('anomaly_details', {})
        metric_name = details.get('metric_name', 'unknown metric')
        z_score = details.get('z_score', 0)
        
        # Recommendation 1: Add validation rule
        recommendations.append({
            'id': 'add_validation_rule',
            'title': f'Add validation rule for {metric_name}',
            'description': f'Create a validation rule to flag or reject files where {metric_name} exceeds expected thresholds',
            'category': 'validation',
            'priority': 'high' if z_score > 4 else 'medium',
            'action_type': 'create_validation_rule',
            'action_params': {
                'metric': metric_name,
                'threshold_type': 'z_score',
                'threshold_value': z_score,
                'action': 'flag'
            },
            'effort': 'low',
            'impact': 'high'
        })
        
        # Recommendation 2: Update quality check thresholds
        recommendations.append({
            'id': 'adjust_quality_thresholds',
            'title': 'Adjust quality check thresholds',
            'description': f'Review and update acceptable ranges for {metric_name} based on recent data patterns',
            'category': 'configuration',
            'priority': 'medium',
            'action_type': 'update_thresholds',
            'action_params': {
                'metric': metric_name,
                'current_value': anomaly.get('actual_value'),
                'expected_value': anomaly.get('expected_value')
            },
            'effort': 'low',
            'impact': 'medium'
        })
        
        # Recommendation 3: Investigate data source
        recommendations.append({
            'id': 'investigate_source',
            'title': 'Investigate data source changes',
            'description': 'Check if there have been recent changes to the data source or upstream processes',
            'category': 'investigation',
            'priority': 'high' if z_score > 5 else 'medium',
            'action_type': 'manual_investigation',
            'action_params': {
                'focus_areas': ['source_system', 'extraction_process', 'data_pipeline']
            },
            'effort': 'medium',
            'impact': 'high'
        })
        
        return recommendations
    
    def _recommend_range_fixes(
        self,
        anomaly: Dict[str, Any],
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Recommendations for range violations"""
        recommendations = []
        
        details = anomaly.get('anomaly_details', {})
        metric_name = details.get('metric_name', 'unknown metric')
        lower_bound = details.get('lower_bound')
        upper_bound = details.get('upper_bound')
        
        # Recommendation 1: Create ETL transformation
        recommendations.append({
            'id': 'create_transformation',
            'title': f'Create ETL transformation to filter {metric_name}',
            'description': 'Add a transformation step to filter or cap values outside the acceptable range',
            'category': 'transformation',
            'priority': 'high',
            'action_type': 'create_etl_transformation',
            'action_params': {
                'transformation_type': 'filter',
                'field': metric_name,
                'min_value': lower_bound,
                'max_value': upper_bound,
                'on_violation': 'cap_value'
            },
            'effort': 'medium',
            'impact': 'high'
        })
        
        # Recommendation 2: Update range constraints
        recommendations.append({
            'id': 'update_range_constraints',
            'title': 'Update acceptable range constraints',
            'description': f'Adjust the acceptable range for {metric_name} if business requirements have changed',
            'category': 'configuration',
            'priority': 'medium',
            'action_type': 'update_constraints',
            'action_params': {
                'metric': metric_name,
                'current_range': f'{lower_bound} - {upper_bound}',
                'suggested_action': 'review_and_adjust'
            },
            'effort': 'low',
            'impact': 'medium'
        })
        
        # Recommendation 3: Add alert rule
        recommendations.append({
            'id': 'create_alert',
            'title': 'Create alert for future range violations',
            'description': f'Set up automated alerts when {metric_name} falls outside acceptable range',
            'category': 'monitoring',
            'priority': 'medium',
            'action_type': 'create_alert_rule',
            'action_params': {
                'metric': metric_name,
                'condition': 'outside_range',
                'min_value': lower_bound,
                'max_value': upper_bound,
                'notification_channels': ['email', 'dashboard']
            },
            'effort': 'low',
            'impact': 'medium'
        })
        
        return recommendations
    
    def _recommend_trend_fixes(
        self,
        anomaly: Dict[str, Any],
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Recommendations for trend deviations"""
        recommendations = []
        
        details = anomaly.get('anomaly_details', {})
        metric_name = details.get('metric_name', 'unknown metric')
        deviation_pct = details.get('deviation_pct', 0)
        
        # Recommendation 1: Create monitoring dashboard
        recommendations.append({
            'id': 'create_monitoring',
            'title': f'Create monitoring dashboard for {metric_name} trends',
            'description': 'Set up real-time monitoring to track trends and detect future deviations early',
            'category': 'monitoring',
            'priority': 'high' if deviation_pct > 100 else 'medium',
            'action_type': 'create_dashboard',
            'action_params': {
                'metric': metric_name,
                'chart_type': 'time_series',
                'include_moving_average': True,
                'include_thresholds': True
            },
            'effort': 'medium',
            'impact': 'high'
        })
        
        # Recommendation 2: Adjust sensitivity
        if deviation_pct < 50:
            recommendations.append({
                'id': 'adjust_sensitivity',
                'title': 'Adjust anomaly detection sensitivity',
                'description': 'Consider increasing sensitivity thresholds to reduce false positives for normal variations',
                'category': 'configuration',
                'priority': 'low',
                'action_type': 'update_sensitivity',
                'action_params': {
                    'current_sensitivity': 'medium',
                    'suggested_sensitivity': 'low',
                    'reason': 'small_deviation'
                },
                'effort': 'low',
                'impact': 'low'
            })
        
        # Recommendation 3: Review data collection process
        recommendations.append({
            'id': 'review_collection',
            'title': 'Review data collection process',
            'description': 'Investigate if there are changes in data collection timing or frequency',
            'category': 'investigation',
            'priority': 'medium',
            'action_type': 'manual_investigation',
            'action_params': {
                'focus_areas': ['collection_schedule', 'data_freshness', 'processing_delays']
            },
            'effort': 'medium',
            'impact': 'medium'
        })
        
        return recommendations
    
    def _recommend_quality_fixes(
        self,
        anomaly: Dict[str, Any],
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Recommendations for quality degradation"""
        recommendations = []
        
        details = anomaly.get('anomaly_details', {})
        score_type = details.get('score_type', 'overall_quality_score')
        degradation_pct = details.get('degradation_pct', 0)
        
        score_label = score_type.replace('_', ' ').title()
        
        # Recommendation 1: Run detailed quality profiling
        recommendations.append({
            'id': 'detailed_profiling',
            'title': 'Run detailed quality profiling',
            'description': f'Perform in-depth analysis to identify specific quality issues causing {score_label} degradation',
            'category': 'investigation',
            'priority': 'critical' if degradation_pct > 50 else 'high',
            'action_type': 'run_profiling',
            'action_params': {
                'profiling_type': 'detailed',
                'focus_areas': ['completeness', 'consistency', 'validity', 'accuracy']
            },
            'effort': 'low',
            'impact': 'high'
        })
        
        # Recommendation 2: Add data quality transformations
        recommendations.append({
            'id': 'quality_transformations',
            'title': 'Add data quality transformations',
            'description': 'Implement ETL transformations to clean and standardize data',
            'category': 'transformation',
            'priority': 'high',
            'action_type': 'create_etl_transformation',
            'action_params': {
                'transformation_type': 'quality_improvement',
                'suggested_steps': [
                    'Remove duplicates',
                    'Fill missing values',
                    'Standardize formats',
                    'Validate data types'
                ]
            },
            'effort': 'high',
            'impact': 'high'
        })
        
        # Recommendation 3: Contact data provider
        if file_context and file_context.get('is_vendor_file'):
            recommendations.append({
                'id': 'contact_vendor',
                'title': 'Contact data provider',
                'description': 'Reach out to the data provider to report quality issues and request improvements',
                'category': 'communication',
                'priority': 'high' if degradation_pct > 30 else 'medium',
                'action_type': 'manual_communication',
                'action_params': {
                    'vendor_id': file_context.get('vendor_id'),
                    'quality_issues': score_type,
                    'degradation': degradation_pct
                },
                'effort': 'low',
                'impact': 'high'
            })
        
        # Recommendation 4: Implement validation rules
        recommendations.append({
            'id': 'validation_rules',
            'title': 'Implement validation rules',
            'description': 'Add automated validation rules to reject or flag low-quality files',
            'category': 'validation',
            'priority': 'high',
            'action_type': 'create_validation_rule',
            'action_params': {
                'rule_type': 'quality_threshold',
                'score_type': score_type,
                'min_acceptable_score': float(anomaly.get('expected_value', 80)),
                'action': 'flag'
            },
            'effort': 'medium',
            'impact': 'high'
        })
        
        return recommendations
    
    def _recommend_schema_fixes(
        self,
        anomaly: Dict[str, Any],
        file_context: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Recommendations for schema mismatches"""
        recommendations = []
        
        details = anomaly.get('anomaly_details', {})
        mismatch_type = details.get('mismatch_type', 'unknown')
        
        if mismatch_type == 'column_count':
            # Column count mismatch recommendations
            recommendations.append({
                'id': 'update_schema',
                'title': 'Update expected schema',
                'description': 'Update the expected schema definition to match the new file structure',
                'category': 'configuration',
                'priority': 'high',
                'action_type': 'update_schema',
                'action_params': {
                    'expected_columns': anomaly.get('expected_value'),
                    'actual_columns': anomaly.get('actual_value'),
                    'action': 'review_and_update'
                },
                'effort': 'low',
                'impact': 'high'
            })
            
            recommendations.append({
                'id': 'create_mapping',
                'title': 'Create flexible column mapping',
                'description': 'Set up a transformation mapping that adapts to column variations',
                'category': 'transformation',
                'priority': 'medium',
                'action_type': 'create_etl_transformation',
                'action_params': {
                    'transformation_type': 'flexible_mapping',
                    'handle_extra_columns': 'ignore',
                    'handle_missing_columns': 'fill_default'
                },
                'effort': 'medium',
                'impact': 'high'
            })
        
        elif mismatch_type == 'data_types':
            # Data type mismatch recommendations
            mismatches = details.get('mismatches', [])
            
            recommendations.append({
                'id': 'add_type_conversion',
                'title': 'Add type conversion transformations',
                'description': 'Create transformations to convert data types to expected format',
                'category': 'transformation',
                'priority': 'high',
                'action_type': 'create_etl_transformation',
                'action_params': {
                    'transformation_type': 'type_conversion',
                    'conversions': mismatches
                },
                'effort': 'medium',
                'impact': 'high'
            })
            
            recommendations.append({
                'id': 'schema_validation',
                'title': 'Enable strict schema validation',
                'description': 'Add schema validation to reject files with type mismatches',
                'category': 'validation',
                'priority': 'medium',
                'action_type': 'create_validation_rule',
                'action_params': {
                    'rule_type': 'schema_validation',
                    'strict_types': True,
                    'action': 'reject'
                },
                'effort': 'low',
                'impact': 'medium'
            })
        
        # Generic schema recommendation
        recommendations.append({
            'id': 'document_schema',
            'title': 'Document expected schema',
            'description': 'Create or update schema documentation for this file type',
            'category': 'documentation',
            'priority': 'low',
            'action_type': 'manual_documentation',
            'action_params': {
                'file_type': file_context.get('file_type') if file_context else 'unknown',
                'include_examples': True
            },
            'effort': 'low',
            'impact': 'low'
        })
        
        return recommendations
    
    def _recommend_generic_fixes(
        self,
        anomaly: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generic recommendations for unknown anomaly types"""
        return [
            {
                'id': 'manual_review',
                'title': 'Manual review required',
                'description': 'This anomaly type requires manual investigation to determine appropriate fixes',
                'category': 'investigation',
                'priority': 'medium',
                'action_type': 'manual_investigation',
                'action_params': {
                    'anomaly_type': anomaly.get('anomaly_type'),
                    'anomaly_details': anomaly.get('anomaly_details', {})
                },
                'effort': 'medium',
                'impact': 'unknown'
            }
        ]
    
    def prioritize_recommendations(
        self,
        recommendations: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Sort recommendations by priority and impact
        
        Args:
            recommendations: List of recommendations
            
        Returns:
            Sorted list of recommendations
        """
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        impact_order = {'high': 0, 'medium': 1, 'low': 2, 'unknown': 3}
        
        return sorted(
            recommendations,
            key=lambda r: (
                priority_order.get(r.get('priority', 'low'), 3),
                impact_order.get(r.get('impact', 'unknown'), 3)
            )
        )
