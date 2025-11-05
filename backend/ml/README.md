# ML Module - Anomaly Detection

## Overview

This module provides machine learning-based anomaly detection capabilities for the Data File Observatory platform. It analyzes file profiling metrics to automatically detect data quality issues, schema drift, and other anomalies.

## Features

### Statistical Anomaly Detection

1. **Z-Score Method**
   - Detects values that deviate significantly from historical mean
   - Configurable sensitivity thresholds
   - Best for normally distributed metrics

2. **Interquartile Range (IQR) Method**
   - Robust to outliers
   - Detects values outside expected range
   - Works well for skewed distributions

3. **Moving Average Trend Analysis**
   - Detects sudden changes in time-series data
   - Identifies trend deviations
   - Configurable window size

4. **Quality Score Degradation**
   - Monitors completeness, consistency, and validity scores
   - Compares current scores against historical baselines
   - Multi-dimensional quality tracking

5. **Schema Anomaly Detection**
   - Column count mismatches
   - Data type changes
   - Schema drift detection

## Architecture

### Components

1. **AnomalyDetector**
   - Core detection algorithms
   - Statistical methods implementation
   - Severity calculation

2. **AnomalyAnalyzer**
   - High-level orchestration
   - Historical data retrieval
   - Multi-method anomaly detection

3. **AnomalyService**
   - Database integration
   - Anomaly storage and retrieval
   - Resolution tracking

## Usage

### Basic Usage

```python
from ml.anomaly_service import AnomalyService
import psycopg2

# Create database connection
conn = psycopg2.connect(database_url)

# Initialize service
service = AnomalyService(conn)

# Detect and store anomalies
anomaly_ids = service.detect_and_store_anomalies(
    file_id='abc-123',
    file_name='sales_data.csv',
    current_metrics={
        'row_count': 1500,
        'column_count': 12,
        'overall_quality_score': 82.5,
        'completeness_score': 85.0,
        'consistency_score': 80.0,
        'validity_score': 82.5
    },
    job_id='job-456',
    sensitivity='medium'
)

print(f"Detected {len(anomaly_ids)} anomalies")
```

### Sensitivity Levels

- **low**: Less sensitive, fewer false positives (Z-score: 3.5, IQR: 3.0x)
- **medium**: Balanced detection (Z-score: 3.0, IQR: 2.5x) - **default**
- **high**: More sensitive, catches subtle issues (Z-score: 2.5, IQR: 1.5x)

### Retrieving Anomalies

```python
# Get anomalies for a specific file
anomalies = service.get_file_anomalies(
    file_id='abc-123',
    status='open'
)

# Get recent anomalies across all files
recent = service.get_recent_anomalies(
    limit=50,
    severity='high',
    status='open'
)

# Get statistics
stats = service.get_anomaly_statistics()
print(f"Open anomalies: {stats['total_open']}")
print(f"Resolved: {stats['total_resolved']}")
```

### Resolving Anomalies

```python
success = service.resolve_anomaly(
    anomaly_id='anomaly-789',
    resolved_by='user-123',
    resolution_notes='False positive - expected seasonal variation'
)
```

## Anomaly Types

| Type | Description | Detection Method |
|------|-------------|------------------|
| `statistical_outlier` | Values far from mean | Z-score |
| `range_violation` | Values outside expected range | IQR |
| `trend_deviation` | Sudden trend changes | Moving average |
| `quality_degradation` | Quality score decline | Historical comparison |
| `schema_mismatch` | Schema structure changes | Schema validation |

## Severity Levels

- **critical**: Severe deviation requiring immediate attention
- **high**: Significant deviation, should be reviewed soon
- **medium**: Moderate deviation, monitor closely
- **low**: Minor deviation, informational

## Integration

### Profiling Pipeline Integration

The ML module integrates with the profiling pipeline to automatically detect anomalies when files are profiled:

```python
# In profile_vendor_file function
from ml.anomaly_service import AnomalyService

# After profiling
profile_result = profile_vendor_file(file_path, filename)

# Store metrics in profiling_metrics table
# ... (existing code)

# Run anomaly detection
anomaly_service = AnomalyService(db_connection)
anomaly_ids = anomaly_service.detect_and_store_anomalies(
    file_id=file_id,
    file_name=filename,
    current_metrics={
        'row_count': profile_result['metadata']['row_count'],
        'column_count': profile_result['metadata']['column_count'],
        'overall_quality_score': profile_result['quality_score']['overall_score'],
        'completeness_score': profile_result['quality_score']['components'].get('completeness'),
        'consistency_score': profile_result['quality_score']['components'].get('consistency'),
        'validity_score': profile_result['quality_score']['components'].get('validity')
    },
    sensitivity='medium'
)

# Add anomaly info to response
profile_result['anomalies'] = {
    'count': len(anomaly_ids),
    'ids': anomaly_ids
}
```

## Database Schema

The module uses the existing `anomalies` and `profiling_metrics` tables:

### anomalies
- Primary storage for detected anomalies
- Tracks status, resolution, and metadata
- JSONB field for detailed anomaly information

### profiling_metrics
- Source of historical data for baseline calculation
- Quality scores and file statistics
- Time-series data for trend analysis

## Requirements

- Python 3.11+
- numpy
- pandas
- psycopg2

## Future Enhancements

1. **Advanced ML Models**
   - Isolation Forest for multivariate anomalies
   - LSTM for time-series prediction
   - Clustering for pattern detection

2. **Auto-Healing**
   - Recommendation engine for fixing anomalies
   - Automated remediation actions
   - ETL transformation suggestions

3. **Alerting Integration**
   - Real-time anomaly notifications
   - Configurable alert rules
   - Integration with alert_rules table
