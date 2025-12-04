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


def is_data_pattern(value) -> bool:
    """
    Detect if a value looks like data (not a header).
    Common data patterns:
    - Dates (1/11/25, 2025-01-11, 12/10/79)
    - Single letters (M, F)
    - Code patterns (US-01, EU-09, ABC-123)
    - Pure numbers
    - Email addresses
    - Multi-word strings with spaces (John Doe, 123 Main St)
    - Contains @ or common data symbols
    """
    if not value or pd.isna(value):
        return False
    
    val_str = str(value).strip()
    
    # Single letter (often categorical data like M/F)
    if len(val_str) == 1 and val_str.isalpha():
        return True
    
    # Date patterns (slashes or dashes with numbers)
    if re.match(r'^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$', val_str):
        return True
    
    # Code patterns (letters-numbers, numbers-letters)
    if re.match(r'^[A-Z]{2,4}-\d{2,4}$', val_str, re.IGNORECASE):
        return True
    
    # Numeric data (including decimals and negative numbers)
    if val_str.replace('.', '', 1).replace('-', '', 1).isdigit():
        return True
    
    # Email addresses
    if '@' in val_str and '.' in val_str:
        return True
    
    # Multi-word strings (names, addresses, descriptions)
    # Headers are usually 1-2 words, data often has 2+ words with spaces
    words = val_str.split()
    if len(words) >= 2:
        # But avoid flagging things like "Customer ID" or "Full Name" as data
        # Check if it has numbers or special chars that suggest data
        if any(char.isdigit() for char in val_str) or any(c in val_str for c in ['@', '#', '&', '(', ')', '/']):
            return True
    
    # Contains digits mixed with letters (street addresses, product codes)
    has_digit = any(c.isdigit() for c in val_str)
    has_letter = any(c.isalpha() for c in val_str)
    if has_digit and has_letter and len(val_str) > 3:
        # But skip things that are clearly header-like patterns
        if not re.search(r'^(id|code|number|key|name|date|time)', val_str, re.IGNORECASE):
            return True
    
    return False


def is_header_like(row_data: pd.Series, actual_headers = None, threshold: float = 0.6) -> bool:
    """
    Determine if a row looks like a header row.
    
    Strategy:
    1. First check if values match data patterns - if most are clearly data, reject immediately
    2. Check similarity to actual headers if provided (primary method)
    3. Use conservative pattern matching only as a fallback
    
    NOTE: This function has been tightened to reduce false positives.
    Text-heavy data rows (names, cities, etc.) were incorrectly flagged as headers.
    Now we ONLY flag as header-like if there's strong evidence.
    
    Args:
        row_data: The row to check
        actual_headers: The actual column headers (to compare against)
        threshold: Similarity threshold for header detection
    
    Returns:
        True if row looks like headers, False otherwise
    """
    if len(row_data) == 0:
        return False
    
    # Step 1: Check if most values look like data (not headers)
    data_pattern_count = 0
    string_count = 0
    total_values = 0
    long_value_count = 0  # Values that are too long to be headers
    
    for val in row_data:
        if pd.isna(val):
            continue
        
        total_values += 1
        val_str = str(val).strip()
        
        if is_data_pattern(val):
            data_pattern_count += 1
        
        # Track if it's a string for broader heuristic
        if isinstance(val, str) or not isinstance(val, (int, float, bool)):
            string_count += 1
        
        # Headers are typically short (1-3 words, <30 chars)
        # Long values are almost certainly data, not headers
        if len(val_str) > 30 or len(val_str.split()) > 3:
            long_value_count += 1
    
    if total_values == 0:
        return False
    
    data_ratio = data_pattern_count / total_values
    long_value_ratio = long_value_count / total_values
    
    # If most values (>50%) look like data patterns, it's NOT a header
    if data_ratio > 0.5:
        return False
    
    # If many values (>30%) are too long to be headers, it's NOT a header
    if long_value_ratio > 0.3:
        return False
    
    # Step 2: If we have actual headers, check similarity (PRIMARY METHOD)
    # This is the most reliable way to detect duplicate headers
    if actual_headers is not None:
        similarity_count = 0
        total_compared = 0
        
        for i, (val, header) in enumerate(zip(row_data, actual_headers)):
            if pd.isna(val):
                continue
            
            total_compared += 1
            val_str = str(val).strip().lower()
            header_str = str(header).strip().lower()
            
            # Check if value matches header name (exact match only for reliability)
            if val_str == header_str:
                similarity_count += 1
            # Partial matches need to be very close (>80% overlap)
            elif len(val_str) > 2 and len(header_str) > 2:
                if val_str in header_str and len(val_str) / len(header_str) > 0.8:
                    similarity_count += 0.7
                elif header_str in val_str and len(header_str) / len(val_str) > 0.8:
                    similarity_count += 0.7
        
        if total_compared > 0:
            similarity_ratio = similarity_count / total_compared
            # Require high similarity (>60%) to flag as duplicate header
            if similarity_ratio >= threshold:
                return True
    
    # Step 3: REMOVED the overly broad "mostly strings" check
    # This was causing false positives for text-heavy data rows
    # (e.g., rows with names, cities, loyalty tiers, etc.)
    
    # Only use pattern matching as a last resort with VERY HIGH threshold
    # This catches cases where headers might be slightly different from column names
    pattern_matches = 0
    header_patterns = [
        # Only match very specific header-like patterns
        r'^(id|code|key|ref)$',  # Exact matches only
        r'^(id|code|key|ref)_',  # Prefix matches
        r'_(id|code|key|ref)$',  # Suffix matches
    ]
    
    for val in row_data:
        if pd.isna(val):
            continue
            
        val_str = str(val).strip().lower()
        
        # Skip if it looks like data
        if is_data_pattern(val):
            continue
        
        # Skip if value is too long to be a header
        if len(val_str) > 25:
            continue
        
        # Check for header-specific patterns
        for pattern in header_patterns:
            if re.search(pattern, val_str, re.IGNORECASE):
                pattern_matches += 1
                break
    
    # Require VERY HIGH pattern match ratio (>60%) to flag as header
    # This is much stricter than before to avoid false positives
    pattern_ratio = pattern_matches / total_values if total_values > 0 else 0
    if pattern_ratio > 0.6:
        return True
    
    return False


def detect_multiple_headers(df: pd.DataFrame, sample_size: int = 5) -> Dict[str, Any]:
    """
    Detect if there are multiple header rows in the data.
    Check first few rows to see if they match the actual column headers.
    """
    if len(df) < 2:
        return {"has_issue": False}
    
    duplicate_header_rows = []
    actual_headers = df.columns
    
    # Check first few rows (skip row 0 as it's already the header)
    for i in range(min(sample_size, len(df))):
        row = df.iloc[i]
        
        # Pass actual headers for comparison
        if is_header_like(row, actual_headers=actual_headers):
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


def detect_duplicate_column_names(df: pd.DataFrame, raw_headers = None) -> Dict[str, Any]:
    """
    Detect duplicate column names by comparing raw headers (before pandas rename)
    with pandas-renamed headers.
    
    Args:
        df: DataFrame after pandas has auto-renamed duplicates
        raw_headers: Optional list of original header names before pandas rename
    """
    # If raw headers not provided, detect duplicates from pandas-mangled columns
    if raw_headers is None:
        # For non-CSV files (Excel, Parquet, etc.), pandas also auto-renames duplicates
        # Detect pandas pattern: base + base.1 + base.2 (consecutive from .1)
        columns = df.columns.tolist()
        seen = {}
        duplicates_found = []
        
        for i, col in enumerate(columns):
            col_str = str(col).strip()
            
            # Check if this has pandas auto-rename suffix
            match = re.match(r'^(.+)\.(\d+)$', col_str)
            if match:
                base_name = match.group(1)
                suffix = int(match.group(2))
                base_lower = base_name.lower()
                
                if base_lower not in seen:
                    seen[base_lower] = {
                        "original_name": base_name,
                        "has_unsuffixed": False,
                        "suffixes": [],
                        "positions": [],
                        "names": []
                    }
                
                seen[base_lower]["suffixes"].append(suffix)
                seen[base_lower]["positions"].append(i)
                seen[base_lower]["names"].append(col_str)
            else:
                col_lower = col_str.lower()
                if col_lower not in seen:
                    seen[col_lower] = {
                        "original_name": col_str,
                        "has_unsuffixed": True,
                        "unsuffixed_position": i,
                        "suffixes": [],
                        "positions": [i],
                        "names": [col_str]
                    }
                else:
                    seen[col_lower]["has_unsuffixed"] = True
                    seen[col_lower]["unsuffixed_position"] = i
                    seen[col_lower]["positions"].append(i)
                    seen[col_lower]["names"].append(col_str)
        
        # Find duplicates in two ways:
        # 1. Pandas auto-rename pattern: base + base.1 + base.2
        # 2. Pure case-insensitive duplicates: Value vs value (pandas keeps as-is)
        
        for col_lower, info in seen.items():
            # Case 1: Pandas auto-renamed duplicates
            if info.get("has_unsuffixed") and len(info.get("suffixes", [])) > 0 and 1 in info.get("suffixes", []):
                # Pandas pattern confirmed - report as duplicate
                duplicates_found.append({
                    "column_name": info["original_name"],
                    "count": len(info["positions"]),
                    "positions": sorted(info["positions"]),
                    "renamed_as": [name for _, name in sorted(zip(info["positions"], info["names"]))]
                })
            # Case 2: Pure case-insensitive duplicates (pandas didn't rename)
            elif info.get("has_unsuffixed") and len(info["positions"]) > 1:
                # Check if the names are actually different (case-insensitive duplicates)
                # Not just pandas suffixes
                unique_names = set(name for name in info["names"])
                if len(unique_names) > 1:
                    # Different case variations of the same name
                    duplicates_found.append({
                        "column_name": info["original_name"],
                        "count": len(info["positions"]),
                        "positions": sorted(info["positions"]),
                        "renamed_as": [name for _, name in sorted(zip(info["positions"], info["names"]))]
                    })
    else:
        # Use raw headers to detect true duplicates
        seen = {}
        duplicates_found = []
        
        for i, col in enumerate(raw_headers):
            col_str = str(col).strip()
            col_lower = col_str.lower()
            
            if col_lower not in seen:
                seen[col_lower] = {
                    "original_name": col_str,
                    "positions": [i],
                    "pandas_names": [str(df.columns[i])]
                }
            else:
                seen[col_lower]["positions"].append(i)
                seen[col_lower]["pandas_names"].append(str(df.columns[i]))
        
        # Find actual duplicates
        for col_lower, info in seen.items():
            if len(info["positions"]) > 1:
                duplicates_found.append({
                    "column_name": info["original_name"],
                    "count": len(info["positions"]),
                    "positions": sorted(info["positions"]),
                    "renamed_as": info["pandas_names"]
                })
    
    if duplicates_found:
        # Sort by first position
        duplicates_found.sort(key=lambda x: x["positions"][0])
        
        total_duplicates = sum(d["count"] - 1 for d in duplicates_found)
        duplicate_names = [d["column_name"] for d in duplicates_found]
        
        return {
            "has_issue": True,
            "issue_type": "duplicate_column_names",
            "severity": "medium",
            "duplicates": duplicates_found,
            "count": len(duplicates_found),
            "total_duplicate_columns": total_duplicates,
            "message": f"{len(duplicates_found)} column name(s) appear multiple times: {', '.join(duplicate_names[:3])}{'...' if len(duplicate_names) > 3 else ''}",
            "recommendation": f"Rename duplicate columns to unique names. Pandas auto-renamed them, but this may cause confusion."
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
        raw_headers = None
        csv_delimiter = None
        if file_type == 'csv':
            # Read raw headers from CSV file using csv module for proper parsing
            import csv
            try:
                # Sniff delimiter to match pandas behavior
                with open(file_path, 'r', encoding='utf-8-sig', newline='') as f:
                    sample = f.read(8192)
                    f.seek(0)
                    sniffer = csv.Sniffer()
                    try:
                        dialect = sniffer.sniff(sample)
                        csv_delimiter = dialect.delimiter
                    except:
                        dialect = csv.excel  # Default to standard CSV
                        csv_delimiter = ','
                    
                    csv_reader = csv.reader(f, dialect=dialect)
                    raw_headers = next(csv_reader, None)
                    if raw_headers:
                        raw_headers = [col.strip() for col in raw_headers]
            except:
                pass  # If reading raw headers fails, use fallback detection
            
            # Pass delimiter to pandas to ensure alignment
            if csv_delimiter:
                df = pd.read_csv(file_path, nrows=sample_rows, delimiter=csv_delimiter)
            else:
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
        
        # 1. Check for duplicate column names
        duplicate_columns = detect_duplicate_column_names(df, raw_headers=raw_headers)
        if duplicate_columns["has_issue"]:
            issues.append(duplicate_columns)
        
        # 2. Check for multiple headers
        multiple_headers = detect_multiple_headers(df)
        if multiple_headers["has_issue"]:
            issues.append(multiple_headers)
        
        # 3. Check for no headers
        no_headers = detect_no_headers(df)
        if no_headers["has_issue"]:
            issues.append(no_headers)
        
        # 4. Check for orphan headers
        orphan_headers = detect_orphan_headers(df)
        if orphan_headers["has_issue"]:
            issues.append(orphan_headers)
        
        # 5. Check for missing headers
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
