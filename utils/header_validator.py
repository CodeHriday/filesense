#!/usr/bin/env python3
"""
Header Validation Utility

Detects common header issues in data files:
- Multiple header rows (headers repeated in data)
- No headers (file starts with data)
- Orphan headers (column headers with no data)
- Missing headers (data columns without header names)

Usage:
    from header_validator import validate_headers
    issues = validate_headers(file_path, file_type)
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any
import re
import json


def is_header_like(row_data: pd.Series, threshold: float = 0.7) -> bool:
    """
    Determine if a row looks like a header row.
    Headers typically contain:
    - Mostly strings
    - Short values (column names are usually concise)
    - No purely numeric values
    - Common header patterns (ID, Name, Date, etc.)
    """
    if len(row_data) == 0:
        return False
    
    string_count = 0
    pattern_matches = 0
    
    # Common header patterns
    header_patterns = [
        r'^(id|name|date|time|created|updated|user|email|phone|address|city|state|country|zip|postal)',
        r'_(id|name|date|at|by)$',
        r'^(column|field|attr|property)[\d_]',
    ]
    
    for val in row_data:
        if pd.isna(val):
            continue
            
        val_str = str(val).strip().lower()
        
        # Check if string
        if isinstance(val, str) or (not isinstance(val, (int, float, bool))):
            string_count += 1
            
        # Check length (headers are usually short)
        if len(val_str) < 50:
            string_count += 0.5
            
        # Check for header patterns
        for pattern in header_patterns:
            if re.search(pattern, val_str, re.IGNORECASE):
                pattern_matches += 1
                break
    
    # Calculate ratio
    total_values = len(row_data.dropna())
    if total_values == 0:
        return False
    
    string_ratio = string_count / total_values
    pattern_ratio = pattern_matches / total_values
    
    # Header-like if mostly strings or has header patterns
    return string_ratio >= threshold or pattern_ratio >= 0.3


def detect_multiple_headers(df: pd.DataFrame, sample_size: int = 5) -> Dict[str, Any]:
    """
    Detect if there are multiple header rows in the data.
    Check first few rows to see if they look like headers.
    """
    if len(df) < 2:
        return {"has_issue": False}
    
    duplicate_header_rows = []
    
    # Check first few rows (skip row 0 as it's already the header)
    for i in range(min(sample_size, len(df))):
        row = df.iloc[i]
        
        # Check if this row looks like a header
        if is_header_like(row):
            duplicate_header_rows.append(i + 1)  # +1 because row 0 is header
    
    if duplicate_header_rows:
        return {
            "has_issue": True,
            "issue_type": "multiple_headers",
            "severity": "high",
            "duplicate_rows": duplicate_header_rows,
            "message": f"Header-like rows detected at positions: {duplicate_header_rows}",
            "recommendation": f"Consider skipping rows {duplicate_header_rows} during import"
        }
    
    return {"has_issue": False}


def detect_no_headers(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Detect if the file has no headers (starts directly with data).
    Check if column names look auto-generated or if first row looks like data.
    """
    col_names = df.columns.tolist()
    
    # Check for auto-generated column names
    auto_generated_patterns = [
        r'^Unnamed: \d+$',
        r'^Column\d+$',
        r'^Field\d+$',
        r'^\d+$',  # Just numbers
    ]
    
    auto_generated_count = 0
    for col in col_names:
        col_str = str(col)
        for pattern in auto_generated_patterns:
            if re.match(pattern, col_str):
                auto_generated_count += 1
                break
    
    # If most columns are auto-generated, likely no headers
    if auto_generated_count / len(col_names) >= 0.5:
        return {
            "has_issue": True,
            "issue_type": "no_headers",
            "severity": "high",
            "auto_generated_columns": auto_generated_count,
            "total_columns": len(col_names),
            "message": f"{auto_generated_count} of {len(col_names)} columns have auto-generated names",
            "recommendation": "File appears to have no headers. Consider using first row as headers or auto-generating column names."
        }
    
    return {"has_issue": False}


def detect_orphan_headers(df: pd.DataFrame, null_threshold: float = 0.95) -> Dict[str, Any]:
    """
    Detect columns that have headers but are completely (or mostly) empty.
    """
    orphan_columns = []
    
    for col in df.columns:
        null_ratio = df[col].isna().sum() / len(df)
        
        if null_ratio >= null_threshold:
            orphan_columns.append({
                "column": str(col),
                "null_percentage": round(null_ratio * 100, 2)
            })
    
    if orphan_columns:
        return {
            "has_issue": True,
            "issue_type": "orphan_headers",
            "severity": "medium",
            "orphan_columns": orphan_columns,
            "count": len(orphan_columns),
            "message": f"{len(orphan_columns)} columns have headers but are {null_threshold*100}%+ empty",
            "recommendation": f"Consider removing empty columns: {', '.join([c['column'] for c in orphan_columns[:5]])}"
        }
    
    return {"has_issue": False}


def detect_missing_headers(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Detect data columns that have missing or generic header names.
    """
    missing_header_columns = []
    
    # Patterns for missing/generic headers
    generic_patterns = [
        r'^Unnamed: \d+$',
        r'^Column\d+$',
        r'^Field\d+$',
        r'^\d+$',
        r'^$',  # Empty string
    ]
    
    for i, col in enumerate(df.columns):
        col_str = str(col).strip()
        
        # Check if column is empty or matches generic pattern
        is_generic = False
        for pattern in generic_patterns:
            if re.match(pattern, col_str):
                is_generic = True
                break
        
        # If column has data but generic name, it's missing a proper header
        if is_generic and df[col].notna().sum() > 0:
            missing_header_columns.append({
                "column_index": i,
                "current_name": col_str,
                "non_null_count": int(df[col].notna().sum())
            })
    
    if missing_header_columns:
        return {
            "has_issue": True,
            "issue_type": "missing_headers",
            "severity": "medium",
            "missing_columns": missing_header_columns,
            "count": len(missing_header_columns),
            "message": f"{len(missing_header_columns)} columns have data but no proper header names",
            "recommendation": "Consider assigning meaningful names to unnamed columns with data"
        }
    
    return {"has_issue": False}


def validate_headers(file_path: str, file_type: str, sample_rows: int = 10000) -> Dict[str, Any]:
    """
    Main validation function that checks for all header issues.
    
    Args:
        file_path: Path to the data file
        file_type: Type of file (csv, json, parquet, excel, xml)
        sample_rows: Number of rows to sample for analysis
    
    Returns:
        Dictionary containing all detected issues
    """
    try:
        # Normalize file type
        file_type = file_type.lower()
        if file_type in ['xlsx', 'xls']:
            file_type = 'excel'
        
        # Load the file based on type
        if file_type == 'csv':
            df = pd.read_csv(file_path, nrows=sample_rows)
        elif file_type == 'json':
            try:
                df = pd.read_json(file_path, lines=True)
            except ValueError:
                df = pd.read_json(file_path)
            if len(df) > sample_rows:
                df = df.head(sample_rows)
        elif file_type == 'parquet':
            import pyarrow.parquet as pq
            parquet_file = pq.ParquetFile(file_path)
            df = parquet_file.read(columns=None, use_pandas_metadata=True).to_pandas()
            if len(df) > sample_rows:
                df = df.head(sample_rows)
        elif file_type == 'excel':
            df = pd.read_excel(file_path, nrows=sample_rows)
        elif file_type == 'xml':
            df = pd.read_xml(file_path)
            if len(df) > sample_rows:
                df = df.head(sample_rows)
        else:
            return {
                "success": False,
                "error": f"Unsupported file type: {file_type}"
            }
        
        # Run all validation checks
        issues = []
        
        # 1. Check for multiple headers
        multiple_headers = detect_multiple_headers(df)
        if multiple_headers["has_issue"]:
            issues.append(multiple_headers)
        
        # 2. Check for no headers
        no_headers = detect_no_headers(df)
        if no_headers["has_issue"]:
            issues.append(no_headers)
        
        # 3. Check for orphan headers
        orphan_headers = detect_orphan_headers(df)
        if orphan_headers["has_issue"]:
            issues.append(orphan_headers)
        
        # 4. Check for missing headers
        missing_headers = detect_missing_headers(df)
        if missing_headers["has_issue"]:
            issues.append(missing_headers)
        
        # Calculate overall health score
        total_columns = len(df.columns)
        issues_count = len(issues)
        
        # Determine overall status
        if issues_count == 0:
            status = "healthy"
            health_score = 100
        elif any(issue.get("severity") == "high" for issue in issues):
            status = "critical"
            health_score = max(0, 100 - (issues_count * 25))
        else:
            status = "warning"
            health_score = max(0, 100 - (issues_count * 15))
        
        return {
            "success": True,
            "status": status,
            "health_score": health_score,
            "total_columns": total_columns,
            "total_rows_sampled": len(df),
            "issues_found": issues_count,
            "issues": issues
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python header_validator.py <file_path> <file_type>"
        }))
        sys.exit(1)
    
    file_path = sys.argv[1]
    file_type = sys.argv[2]
    
    result = validate_headers(file_path, file_type)
    
    import json
    print(json.dumps(result, indent=2))
