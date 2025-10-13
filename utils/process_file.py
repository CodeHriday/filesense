#!/usr/bin/env python3
"""
File Processor Script

Called by Node.js worker to process uploaded files using streaming.
Returns JSON with file metadata.

Usage:
    python3 process_file.py <file_path> <file_type>
"""

import sys
import os
import json

# Handle imports from different paths
try:
    from streaming_processors import StreamingFileReader, detect_encoding, detect_delimiter
    from memory_monitor import MemoryGuard, check_before_processing
except ImportError:
    from utils.streaming_processors import StreamingFileReader, detect_encoding, detect_delimiter
    from utils.memory_monitor import MemoryGuard, check_before_processing

def process_file(file_path, file_type):
    """Process file and return metadata"""
    
    # Check memory before processing
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    can_process, reason = check_before_processing(file_size_mb)
    
    if not can_process:
        return {
            "error": f"Cannot process file: {reason}",
            "row_count": 0,
            "column_count": 0,
            "schema": [],
            "encoding": None,
            "delimiter": None
        }
    
    # Detect encoding and delimiter
    encoding = None
    delimiter = None
    
    try:
        # Detect encoding for all text-based files
        if file_type in ['csv', 'json', 'txt']:
            encoding = detect_encoding(file_path)
        
        # Detect delimiter for CSV files
        if file_type == 'csv':
            delimiter = detect_delimiter(file_path)
    except Exception as e:
        # Continue processing even if detection fails
        pass
    
    try:
        # Use streaming reader with memory guard
        with MemoryGuard(file_size_mb=file_size_mb):
            reader = StreamingFileReader(file_path, chunk_size=10000)
            
            # Process first chunk to get schema
            first_chunk = None
            total_rows = 0
            
            for i, chunk in enumerate(reader.stream_chunks()):
                if i == 0:
                    first_chunk = chunk
                total_rows += len(chunk)
            
            # Extract schema from first chunk
            schema = []
            if first_chunk is not None and len(first_chunk) > 0:
                for col in first_chunk.columns:
                    schema.append({
                        "name": str(col),
                        "type": str(first_chunk[col].dtype),
                        "nullable": bool(first_chunk[col].isna().any()),
                        "unique_count": int(first_chunk[col].nunique()),
                        "null_count": int(first_chunk[col].isna().sum())
                    })
            
            return {
                "row_count": total_rows,
                "column_count": len(schema),
                "schema": schema,
                "processing_time_seconds": 0,
                "size_bytes": os.path.getsize(file_path),
                "encoding": encoding,
                "delimiter": delimiter
            }
            
    except Exception as e:
        return {
            "error": str(e),
            "row_count": 0,
            "column_count": 0,
            "schema": [],
            "encoding": encoding,
            "delimiter": delimiter
        }

if __name__ == "__main__":
    import os
    
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: process_file.py <file_path> <file_type>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    file_type = sys.argv[2]
    
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)
    
    result = process_file(file_path, file_type)
    print(json.dumps(result))
