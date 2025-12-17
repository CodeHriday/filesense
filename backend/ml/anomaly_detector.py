"""
ML-based Anomaly Detection Module for Data File Observatory
Implements statistical anomaly detection for file profiling metrics
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class AnomalyDetector:
    """
    Statistical anomaly detection engine for file profiling metrics
    
    Implements multiple detection methods:
    - Z-score based outlier detection
    - Interquartile Range (IQR) method
    - Moving average deviation
    - Time-series trend analysis
    """
    
    def __init__(self, sensitivity: str = 'medium'):
        """
        Initialize anomaly detector
        
        Args:
            sensitivity: Detection sensitivity ('low', 'medium', 'high')
        """
        self.sensitivity = sensitivity
        
        # Configure thresholds based on sensitivity
        self.thresholds = {
            'low': {'z_score': 3.5, 'iqr_multiplier': 3.0, 'deviation_pct': 50},
            'medium': {'z_score': 3.0, 'iqr_multiplier': 2.5, 'deviation_pct': 30},
            'high': {'z_score': 2.5, 'iqr_multiplier': 1.5, 'deviation_pct': 20}
        }[sensitivity]
        
        logger.info(f"Anomaly detector initialized with {sensitivity} sensitivity")
    
    def detect_zscore_anomalies(
        self, 
        values: List[float], 
        current_value: float,
        metric_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Detect anomalies using Z-score method
        
        Args:
            values: Historical values for the metric
            current_value: Current value to check
            metric_name: Name of the metric being checked
            
        Returns:
            Anomaly dict if detected, None otherwise
        """
        if len(values) < 3:
            return None
        
        values_array = np.array(values)
        mean = np.mean(values_array)
        std = np.std(values_array)
        
        if std == 0:
            return None
        
        z_score = abs((current_value - mean) / std)
        
        if z_score > self.thresholds['z_score']:
            deviation_pct = ((current_value - mean) / mean * 100) if mean != 0 else 0
            
            return {
                'anomaly_type': 'statistical_outlier',
                'severity': self._calculate_severity(z_score, self.thresholds['z_score']),
                'title': f'{metric_name} anomaly detected',
                'description': f'{metric_name} deviates significantly from historical baseline',
                'anomaly_details': {
                    'method': 'z_score',
                    'z_score': round(z_score, 2),
                    'threshold': self.thresholds['z_score'],
                    'metric_name': metric_name
                },
                'expected_value': str(round(mean, 2)),
                'actual_value': str(current_value),
                'deviation_percentage': round(deviation_pct, 2)
            }
        
        return None
    
    def detect_iqr_anomalies(
        self,
        values: List[float],
        current_value: float,
        metric_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Detect anomalies using Interquartile Range (IQR) method
        
        Args:
            values: Historical values for the metric
            current_value: Current value to check
            metric_name: Name of the metric being checked
            
        Returns:
            Anomaly dict if detected, None otherwise
        """
        if len(values) < 5:
            return None
        
        values_array = np.array(values)
        q1 = np.percentile(values_array, 25)
        q3 = np.percentile(values_array, 75)
        iqr = q3 - q1
        
        if iqr == 0:
            return None
        
        lower_bound = q1 - (self.thresholds['iqr_multiplier'] * iqr)
        upper_bound = q3 + (self.thresholds['iqr_multiplier'] * iqr)
        
        if current_value < lower_bound or current_value > upper_bound:
            median = np.median(values_array)
            deviation_pct = ((current_value - median) / median * 100) if median != 0 else 0
            
            return {
                'anomaly_type': 'range_violation',
                'severity': self._calculate_iqr_severity(current_value, lower_bound, upper_bound, iqr),
                'title': f'{metric_name} outside expected range',
                'description': f'{metric_name} falls outside the interquartile range',
                'anomaly_details': {
                    'method': 'iqr',
                    'lower_bound': round(lower_bound, 2),
                    'upper_bound': round(upper_bound, 2),
                    'iqr': round(iqr, 2),
                    'metric_name': metric_name
                },
                'expected_value': f'{round(q1, 2)}-{round(q3, 2)}',
                'actual_value': str(current_value),
                'deviation_percentage': round(deviation_pct, 2)
            }
        
        return None
    
    def detect_trend_anomalies(
        self,
        time_series: pd.DataFrame,
        metric_name: str,
        window_size: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Detect anomalies in time-series trends
        
        Args:
            time_series: DataFrame with 'timestamp' and metric columns
            metric_name: Name of the metric column to analyze
            window_size: Size of moving average window
            
        Returns:
            List of detected anomalies
        """
        anomalies = []
        
        if len(time_series) < window_size + 2:
            return anomalies
        
        # Calculate moving average
        time_series = time_series.sort_values('timestamp')
        time_series['ma'] = time_series[metric_name].rolling(window=window_size).mean()
        time_series['deviation'] = abs(time_series[metric_name] - time_series['ma'])
        time_series['deviation_pct'] = (time_series['deviation'] / time_series['ma'] * 100).replace([np.inf, -np.inf], 0)
        
        # Detect sudden changes
        for idx, row in time_series.iterrows():
            if pd.notna(row['ma']) and row['deviation_pct'] > self.thresholds['deviation_pct']:
                anomalies.append({
                    'anomaly_type': 'trend_deviation',
                    'severity': self._calculate_trend_severity(row['deviation_pct']),
                    'title': f'{metric_name} trend anomaly',
                    'description': f'{metric_name} deviates from moving average trend',
                    'anomaly_details': {
                        'method': 'moving_average',
                        'window_size': window_size,
                        'deviation_pct': round(row['deviation_pct'], 2),
                        'metric_name': metric_name,
                        'timestamp': row['timestamp'].isoformat() if hasattr(row['timestamp'], 'isoformat') else str(row['timestamp'])
                    },
                    'expected_value': str(round(row['ma'], 2)),
                    'actual_value': str(row[metric_name]),
                    'deviation_percentage': round(row['deviation_pct'], 2)
                })
        
        return anomalies
    
    def detect_quality_score_degradation(
        self,
        historical_scores: List[Dict[str, Any]],
        current_scores: Dict[str, float]
    ) -> List[Dict[str, Any]]:
        """
        Detect quality score degradation across multiple dimensions
        
        Args:
            historical_scores: List of historical score dictionaries
            current_scores: Current quality scores
            
        Returns:
            List of detected anomalies
        """
        anomalies = []
        
        if len(historical_scores) < 3:
            return anomalies
        
        # Analyze each quality dimension
        for score_type in ['overall_quality_score', 'completeness_score', 'consistency_score', 'validity_score']:
            if score_type not in current_scores or current_scores[score_type] is None:
                continue
            
            historical_values = [
                s[score_type] for s in historical_scores 
                if s.get(score_type) is not None
            ]
            
            if len(historical_values) < 3:
                continue
            
            current_value = current_scores[score_type]
            
            # Check for significant degradation
            avg_historical = np.mean(historical_values)
            degradation = avg_historical - current_value
            degradation_pct = (degradation / avg_historical * 100) if avg_historical > 0 else 0
            
            if degradation > 10 and degradation_pct > 15:
                anomalies.append({
                    'anomaly_type': 'quality_degradation',
                    'severity': self._calculate_degradation_severity(degradation_pct),
                    'title': f'{score_type.replace("_", " ").title()} degradation',
                    'description': 'Quality score has degraded compared to historical average',
                    'anomaly_details': {
                        'method': 'quality_comparison',
                        'score_type': score_type,
                        'degradation': round(degradation, 2),
                        'degradation_pct': round(degradation_pct, 2)
                    },
                    'expected_value': str(round(avg_historical, 2)),
                    'actual_value': str(round(current_value, 2)),
                    'deviation_percentage': round(degradation_pct, 2)
                })
        
        return anomalies
    
    def detect_schema_anomalies(
        self,
        expected_columns: int,
        actual_columns: int,
        expected_types: Dict[str, str],
        actual_types: Dict[str, str]
    ) -> List[Dict[str, Any]]:
        """
        Detect schema-related anomalies
        
        Args:
            expected_columns: Expected number of columns
            actual_columns: Actual number of columns
            expected_types: Expected data types by column
            actual_types: Actual data types by column
            
        Returns:
            List of detected anomalies
        """
        anomalies = []
        
        # Column count mismatch
        if expected_columns != actual_columns:
            anomalies.append({
                'anomaly_type': 'schema_mismatch',
                'severity': 'high',
                'title': 'Column count mismatch',
                'description': f'File has {actual_columns} columns, expected {expected_columns}',
                'anomaly_details': {
                    'method': 'schema_validation',
                    'mismatch_type': 'column_count'
                },
                'expected_value': str(expected_columns),
                'actual_value': str(actual_columns),
                'deviation_percentage': round(abs(actual_columns - expected_columns) / expected_columns * 100, 2)
            })
        
        # Data type mismatches
        type_mismatches = []
        for col, expected_type in expected_types.items():
            actual_type = actual_types.get(col)
            if actual_type and actual_type != expected_type:
                type_mismatches.append({
                    'column': col,
                    'expected': expected_type,
                    'actual': actual_type
                })
        
        if type_mismatches:
            anomalies.append({
                'anomaly_type': 'schema_mismatch',
                'severity': 'medium',
                'title': f'Data type mismatches in {len(type_mismatches)} columns',
                'description': 'Column data types differ from expected schema',
                'anomaly_details': {
                    'method': 'schema_validation',
                    'mismatch_type': 'data_types',
                    'mismatches': type_mismatches
                },
                'expected_value': str(len(expected_types)),
                'actual_value': str(len(type_mismatches)),
                'deviation_percentage': None
            })
        
        return anomalies
    
    def _calculate_severity(self, z_score: float, threshold: float) -> str:
        """Calculate severity based on z-score"""
        ratio = z_score / threshold
        if ratio > 1.5:
            return 'critical'
        elif ratio > 1.2:
            return 'high'
        elif ratio > 1.0:
            return 'medium'
        return 'low'
    
    def _calculate_iqr_severity(
        self, 
        value: float, 
        lower: float, 
        upper: float, 
        iqr: float
    ) -> str:
        """Calculate severity based on IQR deviation"""
        if value < lower:
            deviation = (lower - value) / iqr
        else:
            deviation = (value - upper) / iqr
        
        if deviation > 3:
            return 'critical'
        elif deviation > 2:
            return 'high'
        elif deviation > 1:
            return 'medium'
        return 'low'
    
    def _calculate_trend_severity(self, deviation_pct: float) -> str:
        """Calculate severity based on trend deviation percentage"""
        if deviation_pct > 100:
            return 'critical'
        elif deviation_pct > 50:
            return 'high'
        elif deviation_pct > 30:
            return 'medium'
        return 'low'
    
    def _calculate_degradation_severity(self, degradation_pct: float) -> str:
        """Calculate severity based on quality degradation percentage"""
        if degradation_pct > 50:
            return 'critical'
        elif degradation_pct > 30:
            return 'high'
        elif degradation_pct > 15:
            return 'medium'
        return 'low'


class AnomalyAnalyzer:
    """
    High-level analyzer that orchestrates anomaly detection across file profiling data
    """
    
    def __init__(self, db_connection, sensitivity: str = 'medium'):
        """
        Initialize anomaly analyzer
        
        Args:
            db_connection: Database connection for querying historical data
            sensitivity: Detection sensitivity level
        """
        self.db = db_connection
        self.detector = AnomalyDetector(sensitivity)
        logger.info("Anomaly analyzer initialized")
    
    def analyze_file_profile(
        self,
        file_id: str,
        current_metrics: Dict[str, Any],
        lookback_days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Analyze a file profile for anomalies
        
        Args:
            file_id: File identifier
            current_metrics: Current profiling metrics
            lookback_days: Number of days to look back for historical data
            
        Returns:
            List of detected anomalies
        """
        anomalies = []
        
        try:
            # Get historical metrics for this file or similar files
            historical_metrics = self._get_historical_metrics(file_id, lookback_days)
            
            if not historical_metrics:
                logger.info(f"No historical data for file {file_id}, skipping anomaly detection")
                return anomalies
            
            # Detect row count anomalies
            if 'row_count' in current_metrics and current_metrics['row_count']:
                row_counts = [m['row_count'] for m in historical_metrics if m.get('row_count')]
                if row_counts:
                    anomaly = self.detector.detect_zscore_anomalies(
                        row_counts,
                        current_metrics['row_count'],
                        'row_count'
                    )
                    if anomaly:
                        anomaly['file_id'] = file_id
                        anomalies.append(anomaly)
            
            # Detect column count anomalies
            if 'column_count' in current_metrics and current_metrics['column_count']:
                col_counts = [m['column_count'] for m in historical_metrics if m.get('column_count')]
                if col_counts:
                    anomaly = self.detector.detect_iqr_anomalies(
                        col_counts,
                        current_metrics['column_count'],
                        'column_count'
                    )
                    if anomaly:
                        anomaly['file_id'] = file_id
                        anomalies.append(anomaly)
            
            # Detect quality score degradation
            quality_scores = [
                {
                    'overall_quality_score': m.get('overall_quality_score'),
                    'completeness_score': m.get('completeness_score'),
                    'consistency_score': m.get('consistency_score'),
                    'validity_score': m.get('validity_score')
                }
                for m in historical_metrics
            ]
            
            current_scores = {
                'overall_quality_score': current_metrics.get('overall_quality_score'),
                'completeness_score': current_metrics.get('completeness_score'),
                'consistency_score': current_metrics.get('consistency_score'),
                'validity_score': current_metrics.get('validity_score')
            }
            
            quality_anomalies = self.detector.detect_quality_score_degradation(
                quality_scores,
                current_scores
            )
            
            for anomaly in quality_anomalies:
                anomaly['file_id'] = file_id
                anomalies.append(anomaly)
            
            logger.info(f"Detected {len(anomalies)} anomalies for file {file_id}")
            
        except Exception as e:
            logger.error(f"Error analyzing file profile: {str(e)}", exc_info=True)
        
        return anomalies
    
    def _get_historical_metrics(
        self,
        file_id: str,
        lookback_days: int
    ) -> List[Dict[str, Any]]:
        """
        Retrieve historical profiling metrics
        
        Args:
            file_id: File identifier
            lookback_days: Number of days to look back
            
        Returns:
            List of historical metrics
        """
        try:
            cutoff_date = datetime.now() - timedelta(days=lookback_days)
            
            query = """
                SELECT 
                    row_count,
                    column_count,
                    completeness_score,
                    consistency_score,
                    validity_score,
                    overall_quality_score,
                    profiled_at
                FROM profiling_metrics
                WHERE file_id = %s
                    AND profiled_at >= %s
                ORDER BY profiled_at DESC
                LIMIT 100
            """
            
            cursor = self.db.cursor()
            cursor.execute(query, (file_id, cutoff_date))
            
            columns = [desc[0] for desc in cursor.description]
            results = []
            
            for row in cursor.fetchall():
                results.append(dict(zip(columns, row)))
            
            cursor.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error fetching historical metrics: {str(e)}", exc_info=True)
            return []
