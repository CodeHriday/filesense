#!/usr/bin/env python3
"""
Vendor File Profiling API Service
Handles automated quality profiling for vendor-uploaded files
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import pandas as pd
import numpy as np
import logging
import sys
import boto3
from google.cloud import storage as gcs_storage
from azure.storage.blob import BlobServiceClient
import tempfile
import json
import psycopg2
import psycopg2.extras
from datetime import datetime
import tarfile
import pyzipper
import pyreadstat
import fastavro
import struct
import io
import re
from pathlib import Path

# Import existing profiling modules
import quality_checks
import data_profiling
from utils import header_validator

# Import ML anomaly detection
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from ml.anomaly_service import AnomalyService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)  # NOSONAR S5122 - API service with CORS protection, CSRF not applicable for stateless API endpoints

# Secure CORS configuration - match main server settings
# Use HTTPS for security, HTTP only allowed for local development via environment variable
allowed_origins = os.environ.get('ALLOWED_ORIGINS', 
    'https://localhost:5000,https://localhost:3000,https://*.replit.dev,https://*.replit.app').split(',')

CORS(app, 
    origins=allowed_origins,
    methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
    supports_credentials=True
)

# Helper function to convert numpy types to Python native types
def convert_numpy_types(obj):
    """
    Recursively convert numpy types to Python native types for JSON serialization
    """
    import numpy as np
    
    if isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj

def normalize_pandas_dtype(dtype_str):
    """
    Normalize pandas data types to user-friendly display types.
    Maps internal pandas types like 'object' to 'string', 'int64' to 'int', etc.
    
    Args:
        dtype_str: String representation of pandas dtype (e.g., 'object', 'int64', 'float64')
    
    Returns:
        User-friendly type name (e.g., 'string', 'int', 'float')
    """
    if not dtype_str:
        return 'string'
    
    dtype_lower = str(dtype_str).lower()
    
    # Type normalization mapping (aligned with Node.js normalizeDataType)
    type_mapping = {
        # Object/string types
        'object': 'string',
        'string': 'string',
        'str': 'string',
        'category': 'string',
        
        # Integer types
        'int8': 'int',
        'int16': 'int',
        'int32': 'int',
        'int64': 'int',
        'uint8': 'int',
        'uint16': 'int',
        'uint32': 'int',
        'uint64': 'int',
        'integer': 'int',
        'bigint': 'int',
        
        # Float types
        'float16': 'float',
        'float32': 'float',
        'float64': 'float',
        
        # Decimal types (preserve precision)
        'decimal': 'decimal',
        'numeric': 'decimal',
        
        # Boolean types
        'bool': 'boolean',
        'boolean': 'boolean',
        
        # Date/time types
        'datetime64[ns]': 'datetime',
        'datetime64': 'datetime',
        'datetime': 'datetime',
        'timestamp': 'datetime',
        'timedelta64[ns]': 'time',
        'timedelta64': 'time',
        'timedelta': 'time',
        'date': 'date',
        'time': 'time',
    }
    
    # Check exact match first
    if dtype_lower in type_mapping:
        return type_mapping[dtype_lower]
    
    # Check partial matches for complex types like 'datetime64[ns, UTC]'
    if 'datetime' in dtype_lower:
        return 'datetime'
    if 'timestamp' in dtype_lower:
        return 'datetime'
    if 'timedelta' in dtype_lower:
        return 'time'
    if 'int' in dtype_lower:
        return 'int'
    if 'float' in dtype_lower:
        return 'float'
    if 'decimal' in dtype_lower:
        return 'decimal'
    if 'numeric' in dtype_lower:
        return 'decimal'
    
    # Return the original if no mapping found
    return dtype_str

# Database connection
def get_db_connection():
    """Get PostgreSQL database connection"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        logger.warning("DATABASE_URL not set, anomaly detection disabled")
        return None
    try:
        conn = psycopg2.connect(database_url)
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        return None

def get_column_pii_metadata(conn, vendor_agreement_file_schema_id):
    """
    Fetch column-level PII metadata from vendor agreement file schema
    
    Args:
        conn: Database connection
        vendor_agreement_file_schema_id: File schema ID
        
    Returns:
        Dictionary mapping column names to PII metadata
    """
    if not conn or not vendor_agreement_file_schema_id:
        return {}
    
    try:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("""
            SELECT column_metadata 
            FROM vendor_agreement_file_schemas 
            WHERE id = %s
        """, (vendor_agreement_file_schema_id,))
        
        result = cursor.fetchone()
        cursor.close()
        
        if result and result['column_metadata']:
            return result['column_metadata']
        return {}
        
    except Exception as e:
        logger.error(f"Failed to fetch column PII metadata: {str(e)}")
        return {}

def store_profiling_metrics_and_detect_anomalies(
    conn,
    file_id,
    filename,
    profile_result,
    job_id=None,
    mapping_id=None
):
    """
    Store profiling metrics and run anomaly detection
    
    Args:
        conn: Database connection
        file_id: File identifier
        filename: File name
        profile_result: Profiling results dictionary
        job_id: Optional job ID
        mapping_id: Optional mapping ID
        
    Returns:
        Dictionary with anomaly information
    """
    if not conn:
        return {'anomalies_detected': 0, 'anomalies': []}
    
    try:
        cursor = conn.cursor()
        
        # Extract metrics from profile result
        quality_score = profile_result.get('quality_score', {})
        metadata = profile_result.get('metadata', {})
        
        # Store profiling metrics (UPSERT to handle re-profiling)
        cursor.execute("""
            INSERT INTO profiling_metrics (
                file_id,
                file_name,
                mapping_id,
                job_id,
                row_count,
                column_count,
                completeness_score,
                consistency_score,
                validity_score,
                overall_quality_score,
                profiled_at,
                file_role
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (file_id, file_role) 
            DO UPDATE SET
                file_name = EXCLUDED.file_name,
                mapping_id = EXCLUDED.mapping_id,
                job_id = EXCLUDED.job_id,
                row_count = EXCLUDED.row_count,
                column_count = EXCLUDED.column_count,
                completeness_score = EXCLUDED.completeness_score,
                consistency_score = EXCLUDED.consistency_score,
                validity_score = EXCLUDED.validity_score,
                overall_quality_score = EXCLUDED.overall_quality_score,
                profiled_at = EXCLUDED.profiled_at
        """, (
            file_id,
            filename,
            mapping_id,
            job_id,
            metadata.get('row_count'),
            metadata.get('column_count'),
            quality_score.get('components', {}).get('completeness'),
            quality_score.get('components', {}).get('consistency'),
            quality_score.get('components', {}).get('validity'),
            quality_score.get('overall_score'),
            datetime.now(),
            'adhoc'
        ))
        
        conn.commit()
        cursor.close()
        
        logger.info(f"Stored profiling metrics for file {file_id}")
        
        # Run anomaly detection
        anomaly_service = AnomalyService(conn)
        
        current_metrics = {
            'row_count': metadata.get('row_count'),
            'column_count': metadata.get('column_count'),
            'completeness_score': quality_score.get('components', {}).get('completeness'),
            'consistency_score': quality_score.get('components', {}).get('consistency'),
            'validity_score': quality_score.get('components', {}).get('validity'),
            'overall_quality_score': quality_score.get('overall_score')
        }
        
        anomaly_ids = anomaly_service.detect_and_store_anomalies(
            file_id=file_id,
            file_name=filename,
            current_metrics=current_metrics,
            job_id=job_id,
            mapping_id=mapping_id,
            sensitivity='medium'
        )
        
        # Get detailed anomaly information
        anomalies = anomaly_service.get_file_anomalies(file_id, status='open')
        
        logger.info(f"Detected {len(anomaly_ids)} anomalies for file {file_id}")
        
        return {
            'anomalies_detected': len(anomaly_ids),
            'anomaly_ids': anomaly_ids,
            'anomalies': anomalies
        }
        
    except Exception as e:
        logger.error(f"Error in anomaly detection: {str(e)}", exc_info=True)
        if conn:
            conn.rollback()
        return {'anomalies_detected': 0, 'anomalies': [], 'error': str(e)}

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


# ============================================================================
# Security: ClamAV Virus Scanning
# ============================================================================

def scan_file_with_clamav(file_path):
    """
    Scan a file for viruses using ClamAV before processing
    Returns tuple: (is_clean, scan_result_message)
    """
    try:
        import subprocess
        
        # Check if ClamAV is disabled via env variable
        if os.environ.get('DISABLE_VIRUS_SCAN') == 'true':
            logger.warning('Virus scanning is disabled (DISABLE_VIRUS_SCAN=true)')
            return True, 'Scan disabled'
        
        # Try to find clamscan binary
        try:
            clamscan_path = subprocess.check_output(['which', 'clamscan'], text=True).strip()
        except subprocess.CalledProcessError:
            logger.error('ClamAV (clamscan) not found in PATH')
            raise FileNotFoundError('ClamAV is not installed or not in PATH')
        
        # Run ClamAV scan
        logger.info(f'Running ClamAV scan on {file_path}')
        result = subprocess.run(
            [clamscan_path, '--no-summary', file_path],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout for large files
        )
        
        # ClamAV exit codes:
        # 0 = No virus found
        # 1 = Virus found
        # 2+ = Error
        
        if result.returncode == 0:
            logger.info(f'ClamAV scan passed: {file_path}')
            return True, 'Clean'
        elif result.returncode == 1:
            virus_info = result.stdout.strip()
            logger.error(f'Virus detected by ClamAV: {virus_info}')
            return False, f'Virus detected: {virus_info}'
        else:
            logger.error(f'ClamAV scan error (exit code {result.returncode}): {result.stderr}')
            raise Exception(f'ClamAV scan failed: {result.stderr}')
            
    except FileNotFoundError as e:
        logger.error(f'ClamAV not available: {str(e)}')
        raise Exception('Virus scanning failed: ClamAV not available')
    except subprocess.TimeoutExpired:
        logger.error(f'ClamAV scan timeout for {file_path}')
        raise Exception('Virus scanning failed: Scan timeout')
    except Exception as e:
        logger.error(f'ClamAV scan error: {str(e)}')
        raise Exception(f'Virus scanning failed: {str(e)}')

# ============================================================================
# Format-Specific File Loaders
# ============================================================================

def load_csv(file_path, delimiter=None, header_config=None):
    """
    Load CSV file into DataFrame
    
    Args:
        file_path: Path to CSV file
        delimiter: Optional delimiter (supports multi-character delimiters like '~^')
                   If None, pandas will auto-detect using sep=None
        header_config: Optional dict with hasHeader (bool) and columnNames (list)
    """
    # DEBUG: Log received header_config
    logger.info(f"load_csv called with header_config: {header_config}")
    
    # Determine pandas header parameter
    header_param = 0  # Default: first row is header
    column_names = None
    
    if header_config and not header_config.get('hasHeader', True):
        # File has no headers - use provided column names
        header_param = None
        column_names = header_config.get('columnNames', [])
        logger.info(f"File has no headers, using provided column names: {column_names}")
    
    if delimiter:
        # Use specified delimiter (supports multi-character delimiters)
        # Escape delimiter for regex since pandas python engine treats sep as regex
        escaped_delimiter = re.escape(delimiter)
        logger.info(f"Using specified delimiter: {repr(delimiter)} (escaped: {repr(escaped_delimiter)})")
        if header_param is None and column_names:
            df = pd.read_csv(file_path, sep=escaped_delimiter, engine='python', header=None, names=column_names)
            raw_headers = column_names
        else:
            df = pd.read_csv(file_path, sep=escaped_delimiter, engine='python')
            raw_headers = list(df.columns)
    else:
        # Auto-detect delimiter
        if header_param is None and column_names:
            df = pd.read_csv(file_path, low_memory=False, header=None, names=column_names)
            raw_headers = column_names
        else:
            df = pd.read_csv(file_path, low_memory=False)
            raw_headers = list(df.columns)
    
    return df, raw_headers, {}

def load_excel(file_path):
    """Load Excel file into DataFrame"""
    df = pd.read_excel(file_path)
    raw_headers = list(pd.read_excel(file_path, nrows=0).columns)
    return df, raw_headers, {}

def load_json(file_path):
    """Load JSON file into DataFrame"""
    df = pd.read_json(file_path)
    raw_headers = list(df.columns)
    return df, raw_headers, {}

def load_parquet(file_path):
    """Load Parquet file into DataFrame"""
    df = pd.read_parquet(file_path)
    raw_headers = list(df.columns)
    return df, raw_headers, {}

def load_sas(file_path, file_ext):
    """
    Load SAS dataset (.sas7bdat or .xpt) into DataFrame
    Preserves labels and formats as metadata
    """
    try:
        if file_ext == '.sas7bdat':
            df, meta = pyreadstat.read_sas7bdat(file_path)
        elif file_ext == '.xpt':
            df, meta = pyreadstat.read_xport(file_path)
        else:
            raise ValueError(f"Unsupported SAS format: {file_ext}")
        
        # Extract SAS metadata
        sas_metadata = {
            'sas_format': file_ext.lstrip('.'),
            'column_labels': meta.column_labels if hasattr(meta, 'column_labels') else {},
            'variable_value_labels': meta.variable_value_labels if hasattr(meta, 'variable_value_labels') else {},
            'column_formats': {col: meta.original_variable_types.get(col, '') for col in df.columns} if hasattr(meta, 'original_variable_types') else {}
        }
        
        raw_headers = list(df.columns)
        return df, raw_headers, sas_metadata
        
    except Exception as e:
        raise Exception(f"Failed to load SAS file: {str(e)}")

def load_avro(file_path):
    """
    Load Avro file into DataFrame
    Extracts schema as metadata
    """
    try:
        records = []
        avro_schema = None
        
        with open(file_path, 'rb') as f:
            reader = fastavro.reader(f)
            avro_schema = reader.writer_schema
            
            # Read records into list
            for record in reader:
                records.append(record)
        
        if not records:
            raise ValueError("Avro file contains no records")
        
        df = pd.DataFrame(records)
        raw_headers = list(df.columns)
        
        # Store Avro schema metadata
        avro_metadata = {
            'avro_schema': avro_schema,
            'schema_name': avro_schema.get('name', 'unknown') if isinstance(avro_schema, dict) else 'unknown'
        }
        
        return df, raw_headers, avro_metadata
        
    except Exception as e:
        raise Exception(f"Failed to load Avro file: {str(e)}")


def parse_binary_fixed_width(file_path, schema, encoding='ascii'):
    """
    Parse a binary fixed-width file using struct module.
    
    Supports typed columns where integer types are stored as binary bytes
    and string types are null-padded text.
    
    Args:
        file_path: Path to the binary file
        schema: Dict with 'columns' array of {'name': str, 'width': int, 'type': str}
                Supported types:
                - 'uint8', 'uint16', 'uint32', 'uint64': Unsigned integers (1, 2, 4, 8 bytes)
                - 'int8', 'int16', 'int32', 'int64': Signed integers (1, 2, 4, 8 bytes)
                - 'float32', 'float64': Floating point (4, 8 bytes)
                - 'string': Null-padded ASCII/UTF-8 string (uses 'width' bytes)
        encoding: String encoding for text fields ('ascii', 'utf-8', 'latin-1')
    
    Returns:
        DataFrame, column_names, metadata
    """
    columns_spec = schema.get('columns', [])
    file_encoding = schema.get('encoding', encoding)
    
    if not columns_spec:
        raise ValueError("Schema must contain 'columns' array")
    
    # Build struct format string and calculate record size
    # Type mapping to struct format characters
    type_to_struct = {
        'uint8': ('B', 1),      # Unsigned char (1 byte)
        'uint16': ('H', 2),     # Unsigned short (2 bytes)
        'uint32': ('I', 4),     # Unsigned int (4 bytes)
        'uint64': ('Q', 8),     # Unsigned long long (8 bytes)
        'int8': ('b', 1),       # Signed char (1 byte)
        'int16': ('h', 2),      # Signed short (2 bytes)
        'int32': ('i', 4),      # Signed int (4 bytes)
        'int64': ('q', 8),      # Signed long long (8 bytes)
        'float32': ('f', 4),    # Float (4 bytes)
        'float64': ('d', 8),    # Double (8 bytes)
    }
    
    # Build format string and collect metadata
    format_parts = []
    column_names = []
    column_types = []
    record_size = 0
    
    for col in columns_spec:
        name = col.get('name', f'col_{len(column_names)}')
        col_type = col.get('type', 'string').lower()
        width = col.get('width', 0)
        
        column_names.append(name)
        column_types.append(col_type)
        
        if col_type in type_to_struct:
            # Numeric type - use struct format
            fmt_char, type_size = type_to_struct[col_type]
            # For numeric types, width should match type size (but we use type size)
            format_parts.append(fmt_char)
            record_size += type_size
        elif col_type == 'string':
            # String type - use width as byte count
            if width <= 0:
                raise ValueError(f"String column '{name}' must have width > 0")
            format_parts.append(f'{width}s')
            record_size += width
        else:
            # Unknown type - treat as string with given width
            if width <= 0:
                raise ValueError(f"Column '{name}' with unknown type '{col_type}' must have width > 0")
            format_parts.append(f'{width}s')
            record_size += width
            logger.warning(f"Unknown type '{col_type}' for column '{name}', treating as string")
    
    # Use little-endian format (most common for binary files)
    # Can be configured via schema.get('byte_order', '<')
    byte_order = schema.get('byte_order', '<')  # < = little-endian, > = big-endian
    format_string = byte_order + ''.join(format_parts)
    
    logger.info(f"Binary parsing: format='{format_string}', record_size={record_size} bytes")
    
    # Read the binary file
    with open(file_path, 'rb') as f:
        data = f.read()
    
    file_size = len(data)
    
    # Detect newline characters between records
    # Check if file has \r\n (Windows), \n (Unix), or no newlines
    stride = record_size  # Distance between record starts (includes newline if present)
    newline_size = 0
    
    # Try to detect newline by checking bytes at expected record boundaries
    # Verify at multiple boundaries to avoid false positives from CR/LF inside record data
    def detect_newline_at_position(pos):
        """Detect newline type at a given position (returns 0, 1, or 2)"""
        if pos + 2 <= file_size:
            bytes_at_pos = data[pos:pos + 2]
            if bytes_at_pos == b'\r\n':
                return 2
            elif bytes_at_pos[:1] == b'\n':
                return 1
            elif bytes_at_pos[:1] == b'\r':
                return 1
        elif pos + 1 <= file_size:
            byte_at_pos = data[pos:pos + 1]
            if byte_at_pos == b'\n' or byte_at_pos == b'\r':
                return 1
        return 0
    
    if file_size > record_size:
        # Try each candidate newline size: 0 (none), 1 (LF or CR), 2 (CRLF)
        # Pick the one that is most consistent across multiple boundaries
        best_newline_size = 0
        best_consistency_count = 0
        
        for candidate_nl in [0, 1, 2]:
            candidate_stride = record_size + candidate_nl
            if file_size < candidate_stride:
                continue
            
            # Count how many boundaries match this newline pattern
            consistency_count = 0
            max_checks = min(5, max(1, file_size // candidate_stride))
            
            for check_idx in range(max_checks):
                # Record N ends at check_idx * candidate_stride + record_size
                boundary_pos = check_idx * candidate_stride + record_size
                
                if boundary_pos >= file_size:
                    break  # Beyond file
                
                detected_nl = detect_newline_at_position(boundary_pos)
                
                if detected_nl == candidate_nl:
                    consistency_count += 1
                elif candidate_nl == 0 and detected_nl == 0:
                    # No newline expected and none found
                    consistency_count += 1
                # Else: mismatch, don't count
            
            if consistency_count > best_consistency_count:
                best_consistency_count = consistency_count
                best_newline_size = candidate_nl
        
        newline_size = best_newline_size
        stride = record_size + newline_size
        
        if best_consistency_count >= 2:
            if newline_size == 2:
                logger.info(f"Detected Windows-style newlines (\\r\\n) between records, verified at {best_consistency_count} boundaries, stride={stride}")
            elif newline_size == 1:
                logger.info(f"Detected Unix-style newlines (\\n/\\r) between records, verified at {best_consistency_count} boundaries, stride={stride}")
            else:
                logger.info(f"No newlines detected between records, verified at {best_consistency_count} boundaries, stride={stride}")
        else:
            # Low confidence - default to no newlines for safety
            # This prevents misalignment when a single CR/LF is embedded in data
            newline_size = 0
            stride = record_size
            logger.info(f"Low confidence ({best_consistency_count} match), defaulting to stride={record_size} (no newlines)")
    
    # Calculate number of records based on stride
    # For files with newlines, the last record may or may not have a trailing newline
    if newline_size > 0:
        # Account for potential trailing newline on last record
        effective_size = file_size
        if data.endswith(b'\n') or data.endswith(b'\r'):
            # Has trailing newline, all records have newlines
            num_records = file_size // stride
        else:
            # No trailing newline on last record
            num_records = (file_size + newline_size) // stride
    else:
        num_records = file_size // record_size
    
    if newline_size == 0 and file_size % record_size != 0:
        logger.warning(f"File size ({file_size}) is not evenly divisible by record size ({record_size}). "
                      f"Partial record of {file_size % record_size} bytes will be ignored.")
    
    logger.info(f"Binary file: {file_size} bytes, {num_records} records of {record_size} bytes each (stride={stride})")
    
    # Parse records
    records = []
    for i in range(num_records):
        start = i * stride  # Use stride instead of record_size
        chunk = data[start:start + record_size]  # Still only read record_size bytes (excluding newline)
        
        try:
            # Unpack the record
            values = struct.unpack_from(format_string, chunk, 0)
            
            # Process values - convert bytes to strings, clean up null padding
            row = {}
            for idx, (name, col_type, value) in enumerate(zip(column_names, column_types, values)):
                if isinstance(value, bytes):
                    # String field - remove null padding and decode
                    value = value.split(b'\x00', 1)[0].decode(file_encoding, errors='replace')
                    # Also sanitize any remaining control characters
                    value = ''.join(char if (char.isprintable() or char in '\n\t') else '' for char in value)
                row[name] = value
            
            records.append(row)
            
        except struct.error as e:
            logger.warning(f"Failed to parse record {i}: {str(e)}")
            continue
    
    if not records:
        raise ValueError("No valid records could be parsed from binary file")
    
    df = pd.DataFrame(records)
    
    metadata = {
        'dat_load_method': 'binary_struct',
        'record_size': record_size,
        'num_records': num_records,
        'format_string': format_string,
        'encoding': file_encoding
    }
    
    return df, column_names, metadata


def load_dat(file_path, fixed_width_schema=None, delimiter=None, header_config=None):
    """
    Load .dat file with heuristic detection or user-provided schema
    Tries: user delimiter → user schema → delimiter detection → fixed-width → binary (requires schema)
    
    header_config: Optional dict with hasHeader (bool) and columnNames (list)
    
    Args:
        file_path: Path to the .dat file
        fixed_width_schema: Optional dict with 'columns' array of {'name': str, 'width': int, 'type': str}
        delimiter: Optional delimiter for delimited .dat files (supports multi-character delimiters like '~^')
    """
    try:
        # Strategy 0: User-provided fixed-width schema (highest priority)
        if fixed_width_schema and isinstance(fixed_width_schema, dict):
            columns_spec = fixed_width_schema.get('columns', [])
            if columns_spec:
                # Check if schema has type information (binary format)
                has_type_info = any(col.get('type') for col in columns_spec)
                
                if has_type_info:
                    # Use binary struct-based parsing for typed schemas
                    try:
                        logger.info("Schema contains type information, using binary struct parser")
                        df, names, metadata = parse_binary_fixed_width(file_path, fixed_width_schema)
                        logger.info(f"Successfully loaded binary DAT file ({len(names)} columns, {len(df)} rows)")
                        return df, names, metadata
                    except Exception as binary_error:
                        logger.warning(f"Binary struct parsing failed: {str(binary_error)}")
                        # Fall through to try text-based parsing
                
                try:
                    # Build column specifications for pandas read_fwf (text-based)
                    colspecs = []
                    names = []
                    start_pos = 0
                    
                    for col in columns_spec:
                        width = col.get('width', 0)
                        name = col.get('name', f'col_{len(names)}')
                        names.append(name)
                        colspecs.append((start_pos, start_pos + width))
                        start_pos += width
                    
                    # Load with user-defined schema (text-based)
                    df = pd.read_fwf(file_path, colspecs=colspecs, names=names, header=None)
                    
                    if len(df.columns) > 0 and len(df) > 0:
                        logger.info(f"Successfully loaded DAT file using user-provided schema ({len(names)} columns)")
                        return df, names, {'dat_load_method': 'user_schema', 'schema_columns': len(names)}
                except Exception as schema_error:
                    logger.warning(f"User-provided schema failed: {str(schema_error)}")
        
        # Strategy 0.5: User-provided delimiter (second priority after schema)
        if delimiter:
            try:
                # Escape delimiter for regex since pandas python engine treats sep as regex
                escaped_delimiter = re.escape(delimiter)
                logger.info(f"Trying user-provided delimiter for DAT file: {repr(delimiter)} (escaped: {repr(escaped_delimiter)})")
                
                # Check if header configuration is provided
                if header_config and not header_config.get('hasHeader', True):
                    # File has no headers - use provided column names
                    column_names = header_config.get('columnNames', [])
                    logger.info(f"DAT file has no headers, using provided column names: {column_names}")
                    df = pd.read_csv(file_path, sep=escaped_delimiter, engine='python', header=None, names=column_names)
                    raw_headers = column_names
                else:
                    # File has headers or no config provided
                    df = pd.read_csv(file_path, sep=escaped_delimiter, engine='python')
                    raw_headers = list(df.columns)
                
                if len(df.columns) > 1 and len(df) > 0:
                    logger.info(f"Successfully loaded DAT file using user-provided delimiter ({len(df.columns)} columns)")
                    return df, raw_headers, {'dat_load_method': 'user_delimiter', 'delimiter': delimiter}
            except Exception as user_delim_error:
                logger.warning(f"User-provided delimiter failed: {str(user_delim_error)}")
        
        # Strategy 1: Try automatic delimiter detection with pandas
        try:
            # Check if header configuration is provided
            if header_config and not header_config.get('hasHeader', True):
                # File has no headers - use provided column names
                column_names = header_config.get('columnNames', [])
                logger.info(f"DAT file (auto-detect) has no headers, using provided column names: {column_names}")
                df = pd.read_csv(file_path, sep=None, engine='python', header=None, names=column_names)
                raw_headers = column_names
            else:
                # File has headers or no config provided
                df = pd.read_csv(file_path, sep=None, engine='python')
                raw_headers = list(df.columns)
            
            if len(df.columns) > 1 and len(df) > 0:
                logger.info(f"Successfully loaded DAT file using automatic delimiter detection")
                return df, raw_headers, {'dat_load_method': 'delimiter_detection'}
        except Exception as delim_error:
            logger.debug(f"Automatic delimiter detection failed: {str(delim_error)}")
        
        # Strategy 2: Try fixed-width format (use pandas default widths)
        try:
            df = pd.read_fwf(file_path)
            if len(df.columns) > 0 and len(df) > 0:
                logger.info(f"Successfully loaded DAT file using fixed-width format")
                raw_headers = list(df.columns)
                return df, raw_headers, {'dat_load_method': 'fixed_width'}
        except Exception as fwf_error:
            logger.debug(f"Fixed-width detection failed: {str(fwf_error)}")
        
        # Strategy 3: Binary format requires schema - return structured error
        raise ValueError(
            "DAT file could not be parsed using delimiter or fixed-width detection. "
            "Binary DAT files require a schema definition. Please provide column specifications."
        )
        
    except Exception as e:
        raise Exception(f"Failed to load DAT file: {str(e)}")

def load_archive(file_path, file_ext, password=None):
    """
    Extract and profile archive contents (.zip, .tar, .tar.gz, .tar.bz2)
    Returns DataFrame from first viable tabular file + metadata about all members
    
    SECURITY: Scans archive with ClamAV before extraction
    """
    try:
        # CRITICAL: Scan archive with ClamAV BEFORE extraction
        is_clean, scan_message = scan_file_with_clamav(file_path)
        if not is_clean:
            raise ValueError(f'Archive failed virus scan: {scan_message}')
        
        logger.info(f'Archive passed virus scan: {file_path}')
        
        extracted_members = []
        profiled_df = None
        profiled_headers = None
        profiled_member = None
        
        # Create secure temp directory for extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            # Extract based on archive type
            if file_ext == '.zip':
                # Use pyzipper for password-protected ZIPs
                try:
                    with pyzipper.AESZipFile(file_path, 'r') as archive:
                        # Check if password protected
                        is_encrypted = any(info.flag_bits & 0x1 for info in archive.infolist())
                        
                        if is_encrypted and not password:
                            raise ValueError("Archive is password-protected but no password provided")
                        
                        # Extract all members
                        for member_info in archive.infolist():
                            # Prevent path traversal attacks
                            member_name = os.path.basename(member_info.filename)
                            if not member_name or member_info.is_dir():
                                continue
                            
                            # Extract to temp directory
                            safe_path = os.path.join(temp_dir, member_name)
                            with archive.open(member_info, pwd=password.encode() if password else None) as source:
                                with open(safe_path, 'wb') as target:
                                    target.write(source.read())
                            
                            extracted_members.append({
                                'name': member_name,
                                'size': member_info.file_size,
                                'path': safe_path
                            })
                except Exception as zip_error:
                    raise Exception(f"ZIP extraction failed: {str(zip_error)}")
            
            elif file_ext in ['.tar', '.tar.gz', '.tar.bz2', '.tgz']:
                # Use tarfile for tar archives with security validation
                try:
                    mode = 'r:gz' if file_ext in ['.tar.gz', '.tgz'] else 'r:bz2' if file_ext == '.tar.bz2' else 'r'
                    with tarfile.open(file_path, mode) as archive:  # NOSONAR - Archive expansion is secured with path validation, size limits, and symlink checks
                        for member in archive.getmembers():
                            # Security validation: only process regular files
                            if not member.isfile():
                                continue
                            
                            # Security validation: prevent path traversal attacks
                            if os.path.isabs(member.name) or '..' in member.name:
                                logger.warning(f"Skipping potentially unsafe tar member: {member.name}")
                                continue
                            
                            # Security validation: prevent symlink attacks
                            if member.issym() or member.islnk():
                                logger.warning(f"Skipping symlink in tar archive: {member.name}")
                                continue
                            
                            # Security validation: reasonable file size limit (2GB)
                            if member.size > 2 * 1024 * 1024 * 1024:
                                logger.warning(f"Skipping oversized file in tar archive: {member.name} ({member.size} bytes)")
                                continue
                            
                            # Use only the filename, not the full path
                            member_name = os.path.basename(member.name)
                            if not member_name or member_name.startswith('.'):
                                continue
                            
                            # Extract to temp directory safely
                            safe_path = os.path.join(temp_dir, member_name)
                            
                            # Ensure the safe_path is within temp_dir (additional safety check)
                            if not os.path.commonpath([temp_dir, safe_path]) == temp_dir:
                                logger.warning(f"Skipping file that would extract outside temp directory: {member.name}")
                                continue
                            
                            source_file = archive.extractfile(member)
                            if source_file is None:
                                continue
                            
                            with source_file as source:
                                with open(safe_path, 'wb') as target:
                                    # Read in chunks to prevent memory exhaustion
                                    while True:
                                        chunk = source.read(8192)
                                        if not chunk:
                                            break
                                        target.write(chunk)
                            
                            extracted_members.append({
                                'name': member_name,
                                'size': member.size,
                                'path': safe_path
                            })
                except Exception as tar_error:
                    raise Exception(f"TAR extraction failed: {str(tar_error)}")
            
            # Try to profile first supported tabular file
            for member in extracted_members:
                member_ext = os.path.splitext(member['name'])[1].lower()
                
                try:
                    # Try to load based on member extension
                    if member_ext == '.csv':
                        profiled_df, profiled_headers, _ = load_csv(member['path'])
                    elif member_ext in ['.xlsx', '.xls']:
                        profiled_df, profiled_headers, _ = load_excel(member['path'])
                    elif member_ext == '.json':
                        profiled_df, profiled_headers, _ = load_json(member['path'])
                    elif member_ext == '.parquet':
                        profiled_df, profiled_headers, _ = load_parquet(member['path'])
                    elif member_ext in ['.sas7bdat', '.xpt']:
                        profiled_df, profiled_headers, _ = load_sas(member['path'], member_ext)
                    elif member_ext == '.avro':
                        profiled_df, profiled_headers, _ = load_avro(member['path'])
                    elif member_ext == '.dat':
                        profiled_df, profiled_headers, _ = load_dat(member['path'])
                    else:
                        member['status'] = 'unsupported'
                        continue
                    
                    # Successfully loaded first tabular file
                    member['status'] = 'profiled'
                    profiled_member = member['name']
                    break
                    
                except Exception as member_error:
                    member['status'] = 'failed'
                    member['error'] = str(member_error)
                    logger.warning(f"Failed to load archive member {member['name']}: {str(member_error)}")
            
            # Archive metadata
            archive_metadata = {
                'archive_format': file_ext.lstrip('.'),
                'total_members': len(extracted_members),
                'profiled_member': profiled_member,
                'member_manifest': extracted_members
            }
            
            if profiled_df is None:
                raise ValueError(f"No supported tabular files found in archive (extracted {len(extracted_members)} members)")
            
            return profiled_df, profiled_headers, archive_metadata
            
    except Exception as e:
        raise Exception(f"Failed to process archive: {str(e)}")


def get_file_extension(filename):
    """
    Get file extension, handling compound extensions like .tar.gz, .tar.bz2
    """
    filename_lower = filename.lower()
    compound_extensions = ['.tar.gz', '.tar.bz2', '.tgz', '.tbz2']
    for ext in compound_extensions:
        if filename_lower.endswith(ext):
            return ext
    return os.path.splitext(filename)[1].lower()


def profile_vendor_file(file_path, filename, password=None, fixed_width_schema=None, delimiter=None, header_config=None):
    """
    Run comprehensive quality profiling on a vendor file
    Supports: CSV, TXT (with custom delimiter), JSON, XLSX, Parquet, XML, SAS (.sas7bdat, .xpt), Avro, DAT, Archives (.zip, .tar, .tar.gz, .tar.bz2)
    
    header_config: Optional dict with keys:
        - hasHeader (bool): Whether file has a header row
        - columnNames (list): Column names to use when hasHeader=False
    
    Args:
        file_path: Path to the file
        filename: Original filename
        password: Optional password for encrypted archives
        fixed_width_schema: Optional schema for fixed-width .dat files
        delimiter: Optional delimiter for CSV/delimited files (supports multi-character delimiters)
    
    Returns:
        Dictionary with profiling results
    """
    file_ext = get_file_extension(filename)
    
    # Dispatch to format-specific loader
    df = None
    raw_headers = []
    format_metadata = {}
    
    try:
        if file_ext in ['.csv', '.txt']:
            df, raw_headers, format_metadata = load_csv(file_path, delimiter=delimiter, header_config=header_config)
        elif file_ext in ['.xlsx', '.xls']:
            df, raw_headers, format_metadata = load_excel(file_path)
        elif file_ext == '.json':
            df, raw_headers, format_metadata = load_json(file_path)
        elif file_ext == '.parquet':
            df, raw_headers, format_metadata = load_parquet(file_path)
        elif file_ext in ['.sas7bdat', '.xpt']:
            df, raw_headers, format_metadata = load_sas(file_path, file_ext)
        elif file_ext == '.avro':
            df, raw_headers, format_metadata = load_avro(file_path)
        elif file_ext == '.dat':
            df, raw_headers, format_metadata = load_dat(file_path, fixed_width_schema, delimiter, header_config)
        elif file_ext in ['.zip', '.tar', '.tar.gz', '.tar.bz2', '.tgz']:
            df, raw_headers, format_metadata = load_archive(file_path, file_ext, password)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
    except Exception as load_error:
        error_message = str(load_error)
        logger.error(f"Failed to load file {filename}: {error_message}")
        
        # Check if this is a binary file requiring schema
        is_binary_schema_error = 'schema definition' in error_message.lower() or 'binary' in error_message.lower()
        user_friendly_error = error_message
        
        if is_binary_schema_error:
            user_friendly_error = (
                "This file appears to be in a binary or fixed-width format that cannot be automatically parsed. "
                "Please re-upload with a column schema definition (specifying column names and widths) to enable profiling."
            )
        
        return {
            'quality_score': {'overall_score': 0, 'components': {}},
            'issues': [{'type': 'error', 'message': f'Failed to load file: {error_message}'}],
            'header_issues': {},
            'null_value_summary': {},
            'date_format_issues': {},
            'duplicate_data': {},
            'processing_error': user_friendly_error,
            'metadata': {'row_count': 0, 'column_count': 0, 'load_error': error_message}
        }
    
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
    header_validation_result = header_validator.validate_headers(file_path, file_ext.lstrip('.'))
    
    # Collect all issues
    issues = []
    header_issues = {}
    
    # Process header issues
    if header_validation_result.get('success') and header_validation_result.get('issues'):
        for issue in header_validation_result['issues']:
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
    if 'completeness' in quality_results and isinstance(quality_results.get('completeness'), dict):
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
    
    # Generate preview data (up to 10,000 rows for quality validation)
    preview_data = []
    preview_limit = min(10000, len(df))
    for idx in range(preview_limit):
        row_dict = {}
        for col in df.columns:
            value = df.iloc[idx][col]
            # Convert to JSON-serializable format
            if pd.isna(value):
                row_dict[col] = None
            elif isinstance(value, (np.integer, np.floating)):
                row_dict[col] = float(value)
            else:
                # Sanitize string values to remove control characters and invalid Unicode
                # that could break JSON serialization
                str_value = str(value)
                # Remove control characters (except newline, tab)
                str_value = ''.join(char if (char.isprintable() or char in '\n\t') else '?' for char in str_value)
                # Truncate very long values
                if len(str_value) > 1000:
                    str_value = str_value[:1000] + '...[truncated]'
                row_dict[col] = str_value
        preview_data.append(row_dict)
    
    # Helper function to detect data patterns
    def detect_patterns(col_data):
        """Detect common data patterns in a column"""
        patterns = {}
        non_null = col_data.dropna()
        if len(non_null) == 0:
            return []
        
        total_sample = min(1000, len(non_null))
        
        # Check if this is a numeric column
        if pd.api.types.is_numeric_dtype(col_data):
            numeric_sample = non_null.head(1000)
            
            # Check for integer vs decimal pattern
            is_integer = numeric_sample.apply(lambda x: float(x) == int(x) if pd.notna(x) else True)
            integer_count = is_integer.sum()
            
            if integer_count == total_sample:
                # Check for specific integer patterns
                min_val = numeric_sample.min()
                max_val = numeric_sample.max()
                
                if min_val >= 0 and max_val <= 100:
                    patterns['Percentage (0-100)'] = {'count': total_sample, 'percentage': 100.0}
                elif min_val >= 0:
                    patterns['Positive Integer'] = {'count': total_sample, 'percentage': 100.0}
                elif max_val <= 0:
                    patterns['Negative Integer'] = {'count': total_sample, 'percentage': 100.0}
                else:
                    patterns['Integer'] = {'count': total_sample, 'percentage': 100.0}
            else:
                decimal_count = total_sample - integer_count
                
                # Check decimal places
                decimal_places = numeric_sample.apply(lambda x: len(str(x).split('.')[-1]) if '.' in str(x) else 0)
                avg_decimals = decimal_places.mean()
                
                if avg_decimals <= 2:
                    patterns['Decimal (2 places)'] = {'count': decimal_count, 'percentage': round((decimal_count / total_sample) * 100, 1)}
                else:
                    patterns['Decimal'] = {'count': decimal_count, 'percentage': round((decimal_count / total_sample) * 100, 1)}
            
            # Convert to array format for numeric columns
            pattern_array = []
            for pattern_name, stats in patterns.items():
                pattern_array.append({
                    'pattern': pattern_name,
                    'count': stats['count'],
                    'percentage': stats['percentage']
                })
            return pattern_array
        
        # Sample up to 1000 values for string pattern detection
        sample = non_null.head(1000).astype(str)
        
        # Email pattern
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        email_matches = sample.str.match(email_pattern).sum()
        if email_matches > total_sample * 0.7:
            patterns['Email'] = {'count': email_matches, 'percentage': round((email_matches / total_sample) * 100, 1)}
        
        # Phone patterns (US)
        phone_patterns = [
            (r'^\d{3}-\d{3}-\d{4}$', 'Phone (xxx-xxx-xxxx)'),
            (r'^\(\d{3}\)\s?\d{3}-\d{4}$', 'Phone ((xxx) xxx-xxxx)'),
            (r'^\d{10}$', 'Phone (10 digits)'),
            (r'^\+1\d{10}$', 'Phone (+1xxxxxxxxxx)')
        ]
        for pattern, name in phone_patterns:
            matches = sample.str.match(pattern).sum()
            if matches > total_sample * 0.7:
                patterns[name] = {'count': matches, 'percentage': round((matches / total_sample) * 100, 1)}
        
        # Date patterns
        date_patterns = [
            (r'^\d{4}-\d{2}-\d{2}$', 'Date (YYYY-MM-DD)'),
            (r'^\d{2}/\d{2}/\d{4}$', 'Date (MM/DD/YYYY)'),
            (r'^\d{2}-\d{2}-\d{4}$', 'Date (MM-DD-YYYY)'),
            (r'^\d{4}/\d{2}/\d{2}$', 'Date (YYYY/MM/DD)')
        ]
        for pattern, name in date_patterns:
            matches = sample.str.match(pattern).sum()
            if matches > total_sample * 0.7:
                patterns[name] = {'count': matches, 'percentage': round((matches / total_sample) * 100, 1)}
        
        # SSN pattern
        ssn_pattern = r'^\d{3}-\d{2}-\d{4}$'
        ssn_matches = sample.str.match(ssn_pattern).sum()
        if ssn_matches > total_sample * 0.7:
            patterns['SSN (xxx-xx-xxxx)'] = {'count': ssn_matches, 'percentage': round((ssn_matches / total_sample) * 100, 1)}
        
        # ZIP code patterns
        zip_patterns = [
            (r'^\d{5}$', 'ZIP (5 digits)'),
            (r'^\d{5}-\d{4}$', 'ZIP+4 (xxxxx-xxxx)')
        ]
        for pattern, name in zip_patterns:
            matches = sample.str.match(pattern).sum()
            if matches > total_sample * 0.7:
                patterns[name] = {'count': matches, 'percentage': round((matches / total_sample) * 100, 1)}
        
        # Credit card pattern (basic)
        cc_pattern = r'^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$'
        cc_matches = sample.str.match(cc_pattern).sum()
        if cc_matches > total_sample * 0.7:
            patterns['Credit Card'] = {'count': cc_matches, 'percentage': round((cc_matches / total_sample) * 100, 1)}
        
        # Convert to array format expected by UI
        pattern_array = []
        for pattern_name, stats in patterns.items():
            pattern_array.append({
                'pattern': pattern_name,
                'count': stats['count'],
                'percentage': stats['percentage']
            })
        
        return pattern_array
    
    # Generate detailed column profiling (unique values, frequencies, min/max)
    column_profiles = []
    for col in df.columns:
        col_data = df[col]
        
        # Basic stats
        profile = {
            'name': col,
            'type': normalize_pandas_dtype(col_data.dtype),
            'nullable': bool(col_data.isna().any()),
            'null_count': int(col_data.isna().sum()),
            'null_percentage': float((col_data.isna().sum() / len(df)) * 100) if len(df) > 0 else 0.0,
            'unique_count': int(col_data.nunique()),
            'unique_percentage': float((col_data.nunique() / len(df)) * 100) if len(df) > 0 else 0.0
        }
        
        # Get top frequent values (limit to 10)
        try:
            value_counts = col_data.value_counts().head(10)
            profile['top_values'] = []
            for val, count in value_counts.items():
                try:
                    if pd.isna(val):
                        continue
                except (TypeError, ValueError):
                    pass
                # Sanitize string values to remove control characters
                str_val = str(val)
                str_val = ''.join(char if (char.isprintable() or char in '\n\t') else '?' for char in str_val)
                if len(str_val) > 200:
                    str_val = str_val[:200] + '...'
                profile['top_values'].append({
                    'value': str_val,
                    'count': int(count),
                    'percentage': float((count / len(df)) * 100)
                })
        except Exception:
            profile['top_values'] = []
        
        # Extract most/least frequent values from top_values
        if profile['top_values'] and len(profile['top_values']) > 0:
            # Most frequent is the first item
            most_freq = profile['top_values'][0]
            profile['most_frequent_value'] = most_freq['value']
            profile['most_frequent_count'] = most_freq['count']
            
            # Least frequent is the last item in top_values
            least_freq = profile['top_values'][-1]
            profile['least_frequent_value'] = least_freq['value']
            profile['least_frequent_count'] = least_freq['count']
        
        # Get min/max for numeric or date-like columns
        try:
            non_null = col_data.dropna()
            if len(non_null) > 0:
                # Try numeric
                if pd.api.types.is_numeric_dtype(col_data):
                    profile['min'] = float(non_null.min())
                    profile['max'] = float(non_null.max())
                    profile['mean'] = float(non_null.mean())
                else:
                    # For strings, get min/max length
                    str_lengths = non_null.astype(str).str.len()
                    profile['min_length'] = int(str_lengths.min())
                    profile['max_length'] = int(str_lengths.max())
                    profile['avg_length'] = float(str_lengths.mean())
        except Exception:
            pass
        
        # Detect data patterns
        try:
            profile['patterns'] = detect_patterns(col_data)
        except Exception:
            profile['patterns'] = []
        
        column_profiles.append(profile)
    
    # Build profiling result
    result = {
        'quality_score': quality_score,
        'issues': issues,
        'header_issues': header_issues,
        'null_value_summary': null_value_summary,
        'date_format_issues': date_format_issues,
        'duplicate_data': duplicate_data,
        'preview_data': preview_data,
        'column_profiles': column_profiles,
        'metadata': {
            'row_count': len(df),
            'column_count': len(df.columns),
            'file_size_mb': os.path.getsize(file_path) / (1024 * 1024),
            'columns': list(df.columns),
            'format_specific': format_metadata  # SAS labels, Avro schema, archive manifest, etc.
        }
    }
    
    return result


@app.route('/api/vendor-profile', methods=['POST'])
def vendor_profile():
    """
    Endpoint to profile a vendor-uploaded file
    
    Expects JSON body (local file):
    {
        "file_id": "uuid",
        "local_file_path": "/path/to/file.csv",
        "filename": "file.csv"
    }
    
    OR (cloud storage file):
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
        local_file_path = data.get('local_file_path')
        filename = data.get('filename')
        password = data.get('password')  # For password-protected archives
        delimiter = data.get('delimiter')  # For delimited files (supports multi-character delimiters)
        header_config = data.get('header_config')  # For files without headers (hasHeader, columnNames)
        fixed_width_schema = data.get('fixed_width_schema')  # For .dat files without delimiters (columns with name and width)
        
        # DEBUG: Log received configuration
        logger.info(f"/api/vendor-profile received header_config: {header_config}, fixed_width_schema: {fixed_width_schema}")
        
        # Check if using local file path (preferred)
        if local_file_path:
            if not os.path.exists(local_file_path):
                return jsonify({
                    'error': 'Local file not found',
                    'path': local_file_path
                }), 404
            
            logger.info(f"Profiling local vendor file: {file_id}, path: {local_file_path}")
            
            # Use the filename provided or extract from path
            if not filename:
                filename = os.path.basename(local_file_path)
            
            # Fetch fixed-width schema from database if not provided and this is a .dat file
            if not fixed_width_schema and filename.lower().endswith('.dat'):
                conn = get_db_connection()
                if conn:
                    try:
                        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                        cursor.execute(
                            "SELECT schema_definition FROM fixed_width_schemas WHERE file_id = %s",
                            (file_id,)
                        )
                        result = cursor.fetchone()
                        cursor.close()
                        
                        if result and result['schema_definition']:
                            fixed_width_schema = result['schema_definition']
                            logger.info(f"Found fixed-width schema for file {file_id}: {len(fixed_width_schema.get('columns', []))} columns")
                        
                        conn.close()
                    except Exception as schema_error:
                        logger.warning(f"Failed to fetch fixed-width schema: {str(schema_error)}")
                        if conn:
                            conn.close()
            
            # Profile the local file directly
            profile_result = profile_vendor_file(local_file_path, filename, fixed_width_schema=fixed_width_schema, password=password, delimiter=delimiter, header_config=header_config)
            
            logger.info(f"Profiling completed for file: {file_id}, issues: {len(profile_result['issues'])}")
            
            # Run anomaly detection and fetch PII metadata if database is available
            conn = get_db_connection()
            if conn:
                try:
                    anomaly_info = store_profiling_metrics_and_detect_anomalies(
                        conn,
                        file_id,
                        filename,
                        profile_result,
                        job_id=data.get('job_id'),
                        mapping_id=data.get('mapping_id')
                    )
                    profile_result['anomaly_detection'] = anomaly_info
                    
                    # Fetch and include column-level PII metadata from vendor agreement
                    vendor_agreement_file_schema_id = data.get('vendor_agreement_file_schema_id')
                    if vendor_agreement_file_schema_id:
                        column_pii_metadata = get_column_pii_metadata(conn, vendor_agreement_file_schema_id)
                        
                        # Enhance metadata with PII information for each column
                        if column_pii_metadata and 'metadata' in profile_result:
                            profile_result['metadata']['column_pii_info'] = {}
                            for column in profile_result['metadata'].get('columns', []):
                                if column in column_pii_metadata:
                                    profile_result['metadata']['column_pii_info'][column] = {
                                        'contains_pii': column_pii_metadata[column].get('contains_pii', False),
                                        'pii_type': column_pii_metadata[column].get('pii_type'),
                                        'data_type': column_pii_metadata[column].get('data_type'),
                                        'description': column_pii_metadata[column].get('description')
                                    }
                            
                            # Add PII summary
                            pii_columns = [col for col, info in profile_result['metadata']['column_pii_info'].items() 
                                          if info.get('contains_pii', False)]
                            profile_result['metadata']['pii_summary'] = {
                                'total_pii_columns': len(pii_columns),
                                'pii_column_names': pii_columns,
                                'contains_pii': len(pii_columns) > 0
                            }
                            
                            logger.info(f"Included PII metadata for {len(pii_columns)} columns from vendor agreement schema")
                    
                finally:
                    conn.close()
            else:
                profile_result['anomaly_detection'] = {
                    'anomalies_detected': 0,
                    'message': 'Anomaly detection unavailable (no database connection)'
                }
            
            # Convert numpy types to Python native types for JSON serialization
            profile_result = convert_numpy_types(profile_result)
            
            return jsonify(profile_result), 200
        
        # Fallback to cloud storage download (legacy)
        else:
            storage_location = data.get('storage_location')
            provider = data.get('provider')
            storage_key = data.get('storage_key')
            credentials = data.get('credentials', {})
            
            if not all([file_id, storage_location, provider, storage_key]):
                return jsonify({
                    'error': 'Missing required parameters',
                    'required': ['file_id and (local_file_path OR storage_location, provider, storage_key)']
                }), 400
            
            logger.info(f"Profiling vendor file from cloud: {file_id}, provider: {provider}")
            
            # Download file from storage with credentials
            temp_path = download_file_from_storage(storage_location, provider, storage_key, credentials)
            
            try:
                # Profile the file
                filename = os.path.basename(storage_key)
                profile_result = profile_vendor_file(temp_path, filename, password=password, delimiter=delimiter, header_config=header_config)
                
                logger.info(f"Profiling completed for file: {file_id}, issues: {len(profile_result['issues'])}")
                
                # Run anomaly detection if database is available
                conn = get_db_connection()
                if conn:
                    try:
                        anomaly_info = store_profiling_metrics_and_detect_anomalies(
                            conn,
                            file_id,
                            filename,
                            profile_result,
                            job_id=data.get('job_id'),
                            mapping_id=data.get('mapping_id')
                        )
                        profile_result['anomaly_detection'] = anomaly_info
                    finally:
                        conn.close()
                else:
                    profile_result['anomaly_detection'] = {
                        'anomalies_detected': 0,
                        'message': 'Anomaly detection unavailable (no database connection)'
                    }
                
                # Convert numpy types to Python native types for JSON serialization
                profile_result = convert_numpy_types(profile_result)
                
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


@app.route('/parquet-schema', methods=['POST'])
def extract_parquet_schema():
    """
    Extract column names from a Parquet file stored in S3.
    Used by Schema Validation to validate Parquet files against expected schema.
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        bucket = data.get('bucket')
        key = data.get('key')
        
        if not bucket or not key:
            return jsonify({'error': 'bucket and key are required'}), 400
        
        logger.info(f"Extracting Parquet schema from s3://{bucket}/{key}")
        
        # Get AWS credentials from environment or use default
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=os.environ.get('AWS_REGION', 'us-east-1')
        )
        
        # Download the Parquet file to a temp location
        with tempfile.NamedTemporaryFile(suffix='.parquet', delete=False) as tmp:
            temp_path = tmp.name
            s3_client.download_file(bucket, key, temp_path)
        
        try:
            import pyarrow.parquet as pq
            
            # Read just the schema (metadata) without loading data
            parquet_file = pq.ParquetFile(temp_path)
            schema = parquet_file.schema_arrow
            
            # Extract column names
            columns = [field.name for field in schema]
            
            logger.info(f"Extracted {len(columns)} columns from Parquet file")
            
            return jsonify({
                'success': True,
                'columns': columns,
                'column_count': len(columns)
            }), 200
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        logger.error(f"Parquet schema extraction error: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Parquet schema extraction failed',
            'details': str(e)
        }), 500


@app.route('/api/dq-suggestions', methods=['POST'])
def generate_dq_suggestions():
    """
    Generate AI-powered data quality rule suggestions based on file profile data.
    Uses configurable AI providers (OpenAI, AWS Bedrock, Azure OpenAI, Google Gemini, or rule-based).
    Provider selection is controlled by AI_PROVIDER env var or database setting.
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        columns = data.get('columns', [])
        filename = data.get('filename', 'unknown')
        file_id = data.get('fileId', '')
        requested_provider = data.get('provider')
        
        if not columns:
            return jsonify({'error': 'No column data provided'}), 400
        
        conn = get_db_connection()
        ai_enabled = True
        configured_provider = None
        
        if conn:
            try:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cursor.execute("""
                    SELECT setting_key, setting_value FROM app_settings 
                    WHERE setting_key IN ('ai_dq_suggestions_enabled', 'ai_provider')
                """)
                settings = {row['setting_key']: row['setting_value'] for row in cursor.fetchall()}
                cursor.close()
                
                ai_enabled = settings.get('ai_dq_suggestions_enabled', 'true').lower() == 'true'
                configured_provider = settings.get('ai_provider', 'auto')
                
                if not ai_enabled:
                    return jsonify({
                        'enabled': False,
                        'suggestions': [],
                        'message': 'AI DQ Suggestions feature is disabled. Enable it in admin settings.'
                    }), 200
            finally:
                conn.close()
        
        from backend.ai_providers import AIProviderFactory
        
        provider_name = requested_provider or configured_provider or os.environ.get('AI_PROVIDER', 'auto')
        provider = AIProviderFactory.get_provider(provider_name)
        provider_info = provider.get_provider_info()
        
        logger.info(f"Using AI provider: {provider_info.get('display_name', provider_info['name'])} for file: {filename}")
        
        suggestions = provider.generate_dq_suggestions(columns, filename, file_id)
        
        logger.info(f"Generated {len(suggestions)} DQ suggestions for file: {filename}")
        
        return jsonify({
            'enabled': True,
            'suggestions': suggestions,
            'filename': filename,
            'fileId': file_id,
            'generatedAt': datetime.now().isoformat(),
            'provider': provider_info
        }), 200
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {str(e)}")
        return jsonify({
            'error': 'Failed to parse AI response',
            'suggestions': []
        }), 500
    except Exception as e:
        logger.error(f"DQ suggestions error: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Failed to generate suggestions',
            'details': str(e),
            'suggestions': []
        }), 500


@app.route('/api/ai-providers', methods=['GET'])
def list_ai_providers():
    """
    List all available AI providers and their configuration status.
    Returns provider name, availability, and privacy level.
    """
    try:
        from backend.ai_providers import AIProviderFactory
        
        providers = AIProviderFactory.list_providers()
        
        conn = get_db_connection()
        current_provider = os.environ.get('AI_PROVIDER', 'auto')
        ai_enabled = True
        
        if conn:
            try:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                cursor.execute("""
                    SELECT setting_key, setting_value FROM app_settings 
                    WHERE setting_key IN ('ai_dq_suggestions_enabled', 'ai_provider')
                """)
                settings = {row['setting_key']: row['setting_value'] for row in cursor.fetchall()}
                cursor.close()
                
                ai_enabled = settings.get('ai_dq_suggestions_enabled', 'true').lower() == 'true'
                current_provider = settings.get('ai_provider', current_provider)
            finally:
                conn.close()
        
        return jsonify({
            'providers': providers,
            'current_provider': current_provider,
            'ai_enabled': ai_enabled
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing AI providers: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/ai-providers/current', methods=['PUT'])
def set_ai_provider():
    """
    Set the current AI provider.
    Stores the selection in app_settings table.
    """
    try:
        data = request.json
        if not data or 'provider' not in data:
            return jsonify({'error': 'No provider specified'}), 400
        
        provider_name = data['provider']
        
        from backend.ai_providers import AIProviderFactory
        
        if provider_name != 'auto' and provider_name not in AIProviderFactory.PROVIDERS:
            return jsonify({'error': f'Unknown provider: {provider_name}'}), 400
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute("""
                INSERT INTO app_settings (setting_key, setting_value, description, updated_at)
                VALUES ('ai_provider', %s, 'AI provider for DQ suggestions (openai, bedrock, azure, gemini, rule-based, auto)', NOW())
                ON CONFLICT (setting_key) 
                DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
                RETURNING setting_key, setting_value
            """, (provider_name,))
            result = cursor.fetchone()
            conn.commit()
            cursor.close()
            
            logger.info(f"AI provider updated to: {provider_name}")
            
            provider = AIProviderFactory.get_provider(provider_name)
            provider_info = provider.get_provider_info()
            
            return jsonify({
                'success': True,
                'provider': provider_name,
                'provider_info': provider_info
            }), 200
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"Error setting AI provider: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings/<setting_key>', methods=['GET'])
def get_setting(setting_key):
    """Get a specific app setting"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute("""
                SELECT setting_key, setting_value, description 
                FROM app_settings WHERE setting_key = %s
            """, (setting_key,))
            result = cursor.fetchone()
            cursor.close()
            
            if not result:
                return jsonify({'error': 'Setting not found'}), 404
            
            return jsonify({
                'key': result['setting_key'],
                'value': result['setting_value'],
                'description': result['description']
            }), 200
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"Error fetching setting: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings/<setting_key>', methods=['PUT'])
def update_setting(setting_key):
    """Update a specific app setting"""
    try:
        data = request.json
        if not data or 'value' not in data:
            return jsonify({'error': 'No value provided'}), 400
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute("""
                UPDATE app_settings 
                SET setting_value = %s, updated_at = NOW()
                WHERE setting_key = %s
                RETURNING setting_key, setting_value, description
            """, (str(data['value']), setting_key))
            
            result = cursor.fetchone()
            conn.commit()
            cursor.close()
            
            if not result:
                return jsonify({'error': 'Setting not found'}), 404
            
            logger.info(f"Setting updated: {setting_key} = {data['value']}")
            
            return jsonify({
                'key': result['setting_key'],
                'value': result['setting_value'],
                'description': result['description']
            }), 200
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"Error updating setting: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PROFILE_API_PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
