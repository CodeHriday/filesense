"""
ML Module for Data File Observatory

This module provides machine learning capabilities for the platform,
currently focusing on anomaly detection for data quality monitoring.

Features:
- Statistical anomaly detection (Z-score, IQR methods)
- Time-series trend analysis
- Quality score degradation detection
- Schema drift detection

Usage:
    from ml.anomaly_service import AnomalyService
    
    # Initialize service with database connection
    service = AnomalyService(db_connection)
    
    # Detect and store anomalies
    anomaly_ids = service.detect_and_store_anomalies(
        file_id='file-123',
        file_name='data.csv',
        current_metrics={
            'row_count': 1000,
            'column_count': 10,
            'overall_quality_score': 75.5,
            'completeness_score': 80.0,
            'consistency_score': 70.0,
            'validity_score': 78.0
        },
        sensitivity='medium'
    )
"""

__version__ = '1.0.0'

from .anomaly_detector import AnomalyDetector, AnomalyAnalyzer
from .anomaly_service import AnomalyService

__all__ = ['AnomalyDetector', 'AnomalyAnalyzer', 'AnomalyService']
