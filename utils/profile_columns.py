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
from dtype_converter import get_user_friendly_type

def profile_columns(file_path, file_type, delimiter=None):
    """Generate detailed column statistics
    
    Args:
        file_path: Path to the file
        file_type: Type of file (csv, txt, json, parquet, excel, xml)
        delimiter: Optional custom delimiter for CSV/TXT files (supports multi-character like '~^')
    """
    
    try:
        # Normalize file type (defensive lowercase + xlsx -> excel, etc.)
        file_type = file_type.lower()
        if file_type == 'xlsx' or file_type == 'xls':
            file_type = 'excel'
        
        # Load the file based on type with memory-efficient sampling
        if file_type in ['csv', 'txt']:
            if delimiter:
                df = pd.read_csv(file_path, nrows=10000, sep=delimiter, engine='python')
            else:
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
        elif file_type == 'excel':
            # Read Excel file (first sheet only)
            df = pd.read_excel(file_path, nrows=10000)
        elif file_type == 'xml':
            # Read XML file
            try:
                df = pd.read_xml(file_path)
                if len(df) > 10000:
                    df = df.head(10000)
            except Exception:
                # Fallback to ElementTree parsing
                import defusedxml.ElementTree as ET
                tree = ET.parse(file_path)
                root = tree.getroot()
                records = []
                for elem in root[:10000]:  # Limit to 10000 records
                    record = {}
                    for child in elem:
                        record[child.tag] = child.text
                    records.append(record)
                df = pd.DataFrame(records)
        else:
            return {"error": f"Unsupported file type: {file_type}"}
        
        # Generate statistics for each column
        column_stats = []
        
        for col in df.columns:
            stats = {
                "name": str(col),
                "type": get_user_friendly_type(df[col].dtype),
                "null_count": int(df[col].isna().sum()),
                "unique_count": int(df[col].nunique())
            }
            
            # Check if numeric (including datetime)
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
            elif 'datetime' in str(df[col].dtype):
                # Datetime stats - convert to ISO string
                min_val = df[col].min()
                max_val = df[col].max()
                if not pd.isna(min_val):
                    stats["min_value"] = min_val.isoformat() if hasattr(min_val, 'isoformat') else str(min_val)
                    min_count = int((df[col] == min_val).sum())
                    stats["min_frequency"] = min_count
                    stats["min_is_frequent"] = min_count > 1
                
                if not pd.isna(max_val):
                    stats["max_value"] = max_val.isoformat() if hasattr(max_val, 'isoformat') else str(max_val)
                    max_count = int((df[col] == max_val).sum())
                    stats["max_frequency"] = max_count
                    stats["max_is_frequent"] = max_count > 1
            else:
                # Categorical/String stats - get most and least frequent values
                value_counts = df[col].value_counts()
                total_non_null = len(df[col].dropna())
                
                if len(value_counts) > 0:
                    # Only show most/least frequent if there are repeated values
                    # If all values are unique (unique_count == total_non_null), don't show
                    if stats["unique_count"] < total_non_null:
                        # Most frequent
                        stats["most_frequent_value"] = str(value_counts.index[0])
                        stats["most_frequent_count"] = int(value_counts.iloc[0])
                        
                        # Least frequent (last item in the sorted series)
                        stats["least_frequent_value"] = str(value_counts.index[-1])
                        stats["least_frequent_count"] = int(value_counts.iloc[-1])
                    
                    # Calculate top values with actual percentages (top 10)
                    top_values = []
                    for idx, (value, count) in enumerate(value_counts.head(10).items()):
                        percentage = round((count / total_non_null) * 100, 2)
                        top_values.append({
                            "value": str(value),
                            "count": int(count),
                            "percentage": percentage
                        })
                    stats["top_values"] = top_values
                
                # String length statistics
                # Drop nulls for string length analysis
                non_null_vals = df[col].dropna().astype(str)
                if len(non_null_vals) > 0:
                    # Find shortest and longest strings by length
                    str_lengths = non_null_vals.str.len()
                    min_len_idx = str_lengths.idxmin()
                    max_len_idx = str_lengths.idxmax()
                    
                    stats["min_value"] = str(non_null_vals.loc[min_len_idx])  # Shortest string
                    stats["max_value"] = str(non_null_vals.loc[max_len_idx])  # Longest string
            
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
        print(json.dumps({"error": "Usage: profile_columns.py <file_path> <file_type> [delimiter]"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    file_type = sys.argv[2]
    delimiter = sys.argv[3] if len(sys.argv) > 3 else None
    
    result = profile_columns(file_path, file_type, delimiter)
    print(json.dumps(result))
