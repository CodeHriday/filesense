#!/usr/bin/env python3
"""
Column Profiling Script

Called by Node.js worker to generate detailed column statistics.
Returns min/max values, frequency information, and patterns for each column.

Usage:
    python3 profile_columns.py <file_path> <file_type>
"""

import sys
import json
import pandas as pd
from data_profiling import detect_column_patterns

def profile_columns(file_path, file_type):
    """Generate detailed column statistics"""
    
    try:
        # Load the file based on type with memory-efficient sampling
        if file_type == 'csv':
            df = pd.read_csv(file_path, nrows=10000)  # Sample for performance
        elif file_type == 'json':
            # Try newline-delimited JSON first, fall back to standard JSON
            try:
                df = pd.read_json(file_path, lines=True)
            except ValueError:
                # Standard JSON array/object format
                df = pd.read_json(file_path)
            
            # Sample if needed
            if len(df) > 10000:
                df = df.head(10000)
        elif file_type == 'parquet':
            # Use pyarrow for memory-efficient sampling
            import pyarrow.parquet as pq
            parquet_file = pq.ParquetFile(file_path)
            # Read all columns from the file (parquet includes schema)
            # Read only first row group OR enough rows to get 10000, whichever comes first
            # But make sure we read ALL columns from schema
            df = parquet_file.read(columns=None, use_pandas_metadata=True).to_pandas()
            if len(df) > 10000:
                df = df.head(10000)
        else:
            return {"error": f"Unsupported file type: {file_type}"}
        
        # Generate statistics for each column
        column_stats = []
        
        for col in df.columns:
            stats = {
                "name": str(col),
                "type": str(df[col].dtype)
            }
            
            # Check if numeric
            if df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
                # Numeric stats
                stats["min_value"] = float(df[col].min()) if not pd.isna(df[col].min()) else None
                stats["max_value"] = float(df[col].max()) if not pd.isna(df[col].max()) else None
                
                # Check if min/max values are frequent (appear more than once)
                min_val = df[col].min()
                max_val = df[col].max()
                if not pd.isna(min_val):
                    min_count = int((df[col] == min_val).sum())
                    stats["min_is_frequent"] = min_count > 1
                    stats["min_frequency"] = min_count
                
                if not pd.isna(max_val):
                    max_count = int((df[col] == max_val).sum())
                    stats["max_is_frequent"] = max_count > 1
                    stats["max_frequency"] = max_count
            else:
                # Categorical stats - get most and least frequent values
                value_counts = df[col].value_counts()
                
                if len(value_counts) > 0:
                    # Most frequent
                    stats["most_frequent_value"] = str(value_counts.index[0])
                    stats["most_frequent_count"] = int(value_counts.iloc[0])
                    
                    # Least frequent (last item in the sorted series)
                    stats["least_frequent_value"] = str(value_counts.index[-1])
                    stats["least_frequent_count"] = int(value_counts.iloc[-1])
            
            # Detect patterns for this column
            patterns = detect_column_patterns(df[col])
            if patterns:
                stats["patterns"] = patterns
            
            column_stats.append(stats)
        
        return {"columns": column_stats}
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: profile_columns.py <file_path> <file_type>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    file_type = sys.argv[2]
    
    result = profile_columns(file_path, file_type)
    print(json.dumps(result))
