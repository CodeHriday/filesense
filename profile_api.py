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

app = Flask(__name__)
CORS(app)

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
        logger.info(f"Using specified delimiter: {repr(delimiter)}")
        if header_param is None and column_names:
            df = pd.read_csv(file_path, sep=delimiter, engine='python', header=None, names=column_names)
            raw_headers = column_names
        else:
            df = pd.read_csv(file_path, sep=delimiter, engine='python')
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
                try:
                    # Build column specifications for pandas read_fwf
                    colspecs = []
                    names = []
                    start_pos = 0
                    
                    for col in columns_spec:
                        width = col.get('width', 0)
                        name = col.get('name', f'col_{len(names)}')
                        names.append(name)
                        colspecs.append((start_pos, start_pos + width))
                        start_pos += width
                    
                    # Load with user-defined schema
                    df = pd.read_fwf(file_path, colspecs=colspecs, names=names, header=None)
                    
                    if len(df.columns) > 0 and len(df) > 0:
                        logger.info(f"Successfully loaded DAT file using user-provided schema ({len(names)} columns)")
                        return df, names, {'dat_load_method': 'user_schema', 'schema_columns': len(names)}
                except Exception as schema_error:
                    logger.warning(f"User-provided schema failed: {str(schema_error)}")
        
        # Strategy 0.5: User-provided delimiter (second priority after schema)
        if delimiter:
            try:
                logger.info(f"Trying user-provided delimiter for DAT file: {repr(delimiter)}")
                
                # Check if header configuration is provided
                if header_config and not header_config.get('hasHeader', True):
                    # File has no headers - use provided column names
                    column_names = header_config.get('columnNames', [])
                    logger.info(f"DAT file has no headers, using provided column names: {column_names}")
                    df = pd.read_csv(file_path, sep=delimiter, engine='python', header=None, names=column_names)
                    raw_headers = column_names
                else:
                    # File has headers or no config provided
                    df = pd.read_csv(file_path, sep=delimiter, engine='python')
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
                # Use tarfile for tar archives
                try:
                    mode = 'r:gz' if file_ext in ['.tar.gz', '.tgz'] else 'r:bz2' if file_ext == '.tar.bz2' else 'r'
                    with tarfile.open(file_path, mode) as archive:
                        for member in archive.getmembers():
                            if member.isfile():
                                # Prevent path traversal
                                member_name = os.path.basename(member.name)
                                if not member_name:
                                    continue
                                
                                # Extract to temp directory
                                safe_path = os.path.join(temp_dir, member_name)
                                source_file = archive.extractfile(member)
                                if source_file is None:
                                    continue
                                with source_file as source:
                                    with open(safe_path, 'wb') as target:
                                        target.write(source.read())
                                
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


def profile_vendor_file(file_path, filename, password=None, fixed_width_schema=None, delimiter=None, header_config=None):
    """
    Run comprehensive quality profiling on a vendor file
    Supports: CSV, JSON, XLSX, Parquet, XML, SAS (.sas7bdat, .xpt), Avro, DAT, Archives (.zip, .tar, .tar.gz, .tar.bz2)
    
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
    file_ext = os.path.splitext(filename)[1].lower()
    
    # Dispatch to format-specific loader
    df = None
    raw_headers = []
    format_metadata = {}
    
    try:
        if file_ext == '.csv':
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
        logger.error(f"Failed to load file {filename}: {str(load_error)}")
        return {
            'quality_score': {'overall_score': 0, 'components': {}},
            'issues': [{'type': 'error', 'message': f'Failed to load file: {str(load_error)}'}],
            'header_issues': {},
            'null_value_summary': {},
            'date_format_issues': {},
            'duplicate_data': {},
            'metadata': {'row_count': 0, 'column_count': 0, 'load_error': str(load_error)}
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
    
    # Generate preview data (first 100 rows)
    preview_data = []
    preview_limit = min(100, len(df))
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
                row_dict[col] = str(value)
        preview_data.append(row_dict)
    
    # Helper function to detect data patterns
    def detect_patterns(col_data):
        """Detect common data patterns in a column"""
        patterns = {}
        non_null = col_data.dropna()
        if len(non_null) == 0:
            return []
        
        # Sample up to 1000 values for pattern detection
        sample = non_null.head(1000).astype(str)
        total_sample = len(sample)
        
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
            'type': str(col_data.dtype),
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
                profile['top_values'].append({
                    'value': str(val),
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
