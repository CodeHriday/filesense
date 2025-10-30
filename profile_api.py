#!/usr/bin/env python3
"""
Vendor File Profiling API Service
Handles automated quality profiling for vendor-uploaded files
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import pandas as pd
import logging
import sys
import boto3
from google.cloud import storage as gcs_storage
from azure.storage.blob import BlobServiceClient
import tempfile
import json

# Import existing profiling modules
import quality_checks
import data_profiling
from utils import header_validator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

def download_file_from_storage(storage_location, provider, storage_key, credentials=None):
    """
    Download file from cloud storage to temporary location
    
    Args:
        storage_location: Full storage location URL
        provider: Storage provider (aws, gcp, azure)
        storage_key: File key/path in storage
        credentials: Optional credentials dict from connection config
    
    Returns:
        Path to downloaded temporary file
    """
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(storage_key)[1])
    temp_path = temp_file.name
    temp_file.close()
    
    credentials = credentials or {}
    
    try:
        if provider == 'aws':
            # Extract credentials and bucket from connection config
            bucket_name = credentials.get('bucket_name', '')
            region = credentials.get('region', 'us-east-1')
            access_key = credentials.get('access_key', '')
            secret_key = credentials.get('secret_key', '')
            
            # Parse storage key if needed
            key = storage_key.lstrip('/')
            
            # Create S3 client with credentials
            s3_client = boto3.client(
                's3',
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key
            )
            s3_client.download_file(bucket_name, key, temp_path)
            logger.info(f"Downloaded file from S3: {bucket_name}/{key}")
            
        elif provider == 'gcp':
            # Parse GCS location
            # Format: gs://bucket-name/key
            bucket_name = storage_location.replace('gs://', '').split('/')[0]
            key = storage_key
            
            storage_client = gcs_storage.Client()
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(key)
            blob.download_to_filename(temp_path)
            logger.info(f"Downloaded file from GCS: {bucket_name}/{key}")
            
        elif provider == 'azure':
            # Parse Azure Blob location
            # Format: https://accountname.blob.core.windows.net/container/key
            parts = storage_location.replace('https://', '').split('/')
            account_name = parts[0].split('.')[0]
            container_name = parts[1] if len(parts) > 1 else 'default'
            key = storage_key
            
            # Note: Azure credentials should be in environment or use managed identity
            blob_service_client = BlobServiceClient(account_url=f"https://{account_name}.blob.core.windows.net")
            blob_client = blob_service_client.get_blob_client(container=container_name, blob=key)
            
            with open(temp_path, "wb") as download_file:
                download_file.write(blob_client.download_blob().readall())
            logger.info(f"Downloaded file from Azure: {container_name}/{key}")
            
        else:
            raise ValueError(f"Unsupported provider: {provider}")
            
        return temp_path
        
    except Exception as e:
        # Clean up temp file on error
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise Exception(f"Failed to download file from {provider}: {str(e)}")


def profile_vendor_file(file_path, filename):
    """
    Run comprehensive quality profiling on a vendor file
    
    Args:
        file_path: Path to the file
        filename: Original filename
    
    Returns:
        Dictionary with profiling results
    """
    file_ext = os.path.splitext(filename)[1].lower()
    
    # Read file based on type
    df = None
    if file_ext == '.csv':
        df = pd.read_csv(file_path, low_memory=False)
        raw_headers = list(pd.read_csv(file_path, nrows=0).columns)
    elif file_ext in ['.xlsx', '.xls']:
        df = pd.read_excel(file_path)
        raw_headers = list(pd.read_excel(file_path, nrows=0).columns)
    elif file_ext == '.json':
        df = pd.read_json(file_path)
        raw_headers = list(df.columns)
    elif file_ext == '.parquet':
        df = pd.read_parquet(file_path)
        raw_headers = list(df.columns)
    else:
        raise ValueError(f"Unsupported file type: {file_ext}")
    
    if df is None or df.empty:
        return {
            'quality_score': {'overall_score': 0, 'components': {}},
            'issues': [{'type': 'error', 'message': 'File is empty or could not be read'}],
            'header_issues': {},
            'null_value_summary': {},
            'date_format_issues': {},
            'duplicate_data': {},
            'metadata': {'row_count': 0, 'column_count': 0}
        }
    
    logger.info(f"Profiling file: {filename}, shape: {df.shape}")
    
    # Run quality checks
    quality_results = quality_checks.run_basic_checks(df)
    
    # Calculate quality score
    file_metadata = {'created_at': pd.Timestamp.now().isoformat()}
    quality_score = quality_checks.calculate_quality_score(quality_results, file_metadata)
    
    # Run header validation
    header_issues_list = header_validator.validate_headers_df(df, raw_headers=raw_headers)
    
    # Collect all issues
    issues = []
    header_issues = {}
    
    # Process header issues
    if header_issues_list:
        for issue in header_issues_list:
            issues.append({
                'type': 'header',
                'severity': issue.get('severity', 'medium'),
                'issue_type': issue.get('issue_type', 'unknown'),
                'message': issue.get('message', ''),
                'recommendation': issue.get('recommendation', '')
            })
            
            # Store detailed header issues
            issue_type = issue.get('issue_type', 'unknown')
            header_issues[issue_type] = issue
    
    # Collect NULL value summary
    null_value_summary = {}
    if 'completeness' in quality_results:
        for col, data in quality_results['completeness'].items():
            if data['missing_count'] > 0:
                null_value_summary[col] = {
                    'missing_count': data['missing_count'],
                    'missing_pct': data['missing_pct'],
                    'total_count': data['total_count']
                }
                
                # Add to issues if significant
                if data['missing_pct'] > 10:
                    issues.append({
                        'type': 'completeness',
                        'severity': 'high' if data['missing_pct'] > 50 else 'medium',
                        'column': col,
                        'message': f"Column '{col}' has {data['missing_pct']:.1f}% NULL values",
                        'details': data
                    })
    
    # Detect date format inconsistencies
    date_format_issues = {}
    for col in df.columns:
        # Check if column might be a date
        if df[col].dtype == 'object':
            sample = df[col].dropna().head(100)
            if len(sample) > 0:
                # Simple heuristic: check for common date patterns
                date_like = sample.astype(str).str.contains(r'\d{1,4}[-/]\d{1,2}[-/]\d{1,4}', regex=True)
                if date_like.sum() > len(sample) * 0.5:
                    # Detect unique date patterns
                    patterns = set()
                    for val in sample:
                        val_str = str(val)
                        if '/' in val_str:
                            patterns.add('slash-separated')
                        elif '-' in val_str:
                            patterns.add('dash-separated')
                    
                    if len(patterns) > 1:
                        date_format_issues[col] = {
                            'patterns_found': list(patterns),
                            'sample_values': sample.head(5).tolist()
                        }
                        issues.append({
                            'type': 'date_format',
                            'severity': 'medium',
                            'column': col,
                            'message': f"Column '{col}' has inconsistent date formats",
                            'patterns': list(patterns)
                        })
    
    # Check for duplicate data
    duplicate_data = {}
    duplicate_rows = df.duplicated()
    dup_count = duplicate_rows.sum()
    if dup_count > 0:
        dup_pct = (dup_count / len(df)) * 100
        duplicate_data['total_duplicates'] = int(dup_count)
        duplicate_data['duplicate_percentage'] = float(dup_pct)
        duplicate_data['sample_indices'] = df[duplicate_rows].head(10).index.tolist()
        
        issues.append({
            'type': 'duplicates',
            'severity': 'high' if dup_pct > 5 else 'medium',
            'message': f"Found {dup_count} duplicate rows ({dup_pct:.1f}%)",
            'details': duplicate_data
        })
    
    # Build profiling result
    result = {
        'quality_score': quality_score,
        'issues': issues,
        'header_issues': header_issues,
        'null_value_summary': null_value_summary,
        'date_format_issues': date_format_issues,
        'duplicate_data': duplicate_data,
        'metadata': {
            'row_count': len(df),
            'column_count': len(df.columns),
            'file_size_mb': os.path.getsize(file_path) / (1024 * 1024),
            'columns': list(df.columns)
        }
    }
    
    return result


@app.route('/api/vendor-profile', methods=['POST'])
def vendor_profile():
    """
    Endpoint to profile a vendor-uploaded file
    
    Expects JSON body:
    {
        "file_id": "uuid",
        "storage_location": "s3://bucket/key or gs://bucket/key",
        "provider": "aws" | "gcp" | "azure",
        "storage_key": "path/to/file.csv",
        "credentials": {...connection credentials...}
    }
    """
    try:
        data = request.get_json()
        
        file_id = data.get('file_id')
        storage_location = data.get('storage_location')
        provider = data.get('provider')
        storage_key = data.get('storage_key')
        credentials = data.get('credentials', {})
        
        if not all([file_id, storage_location, provider, storage_key]):
            return jsonify({
                'error': 'Missing required parameters',
                'required': ['file_id', 'storage_location', 'provider', 'storage_key']
            }), 400
        
        logger.info(f"Profiling vendor file: {file_id}, provider: {provider}")
        
        # Download file from storage with credentials
        temp_path = download_file_from_storage(storage_location, provider, storage_key, credentials)
        
        try:
            # Profile the file
            filename = os.path.basename(storage_key)
            profile_result = profile_vendor_file(temp_path, filename)
            
            logger.info(f"Profiling completed for file: {file_id}, issues: {len(profile_result['issues'])}")
            
            return jsonify(profile_result), 200
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    except Exception as e:
        logger.error(f"Vendor profiling error: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Profiling failed',
            'details': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PROFILE_API_PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
