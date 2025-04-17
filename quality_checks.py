import pandas as pd
import numpy as np
import re
from datetime import datetime

def run_basic_checks(df):
    """
    Run basic quality checks on a DataFrame.
    
    Args:
        df (pandas.DataFrame): DataFrame to check
    
    Returns:
        dict: Check results
    """
    if df is None or df.empty:
        return {
            "error": "DataFrame is empty or None"
        }
    
    results = {
        "completeness": {},
        "type_validation": {},
        "uniqueness": {},
        "basic_stats": {}
    }
    
    # Completeness check (null values)
    for col in df.columns:
        missing_count = df[col].isna().sum()
        total_count = len(df)
        missing_pct = (missing_count / total_count) * 100
        
        results["completeness"][col] = {
            "missing_count": int(missing_count),
            "total_count": int(total_count),
            "missing_pct": float(missing_pct),
            "is_complete": missing_count == 0
        }
    
    # Type validation check
    for col in df.columns:
        detected_type = str(df[col].dtype)
        
        # For numeric columns, check if they contain only numbers
        if np.issubdtype(df[col].dtype, np.number):
            expected_type = "numeric"
            # Check if numeric values are valid (not inf or nan)
            is_valid = not df[col].replace([np.inf, -np.inf], np.nan).isna().any()
        
        # For datetime columns
        elif np.issubdtype(df[col].dtype, np.datetime64):
            expected_type = "datetime"
            is_valid = True
        
        # For string columns, try to infer a more specific type
        else:
            # Check if it looks like a date
            non_null_values = df[col].dropna()
            sample_values = non_null_values.head(10).tolist() if not non_null_values.empty else []
            
            if all(isinstance(val, str) for val in sample_values):
                expected_type = "string"
                is_valid = True
            else:
                expected_type = "mixed"
                is_valid = False
        
        results["type_validation"][col] = {
            "expected_type": expected_type,
            "detected_type": detected_type,
            "is_valid": is_valid,
            "sample_values": df[col].dropna().head(3).tolist() if df[col].nunique() > 0 else []
        }
    
    # Uniqueness check
    for col in df.columns:
        duplicate_mask = df[col].duplicated()
        duplicate_count = duplicate_mask.sum()
        duplicate_pct = (duplicate_count / len(df)) * 100
        
        results["uniqueness"][col] = {
            "duplicate_count": int(duplicate_count),
            "duplicate_pct": float(duplicate_pct),
            "is_unique": duplicate_count == 0
        }
    
    # Basic statistics
    for col in df.columns:
        if np.issubdtype(df[col].dtype, np.number):
            results["basic_stats"][col] = {
                "min": float(df[col].min()) if not df[col].empty and not pd.isna(df[col].min()) else None,
                "max": float(df[col].max()) if not df[col].empty and not pd.isna(df[col].max()) else None,
                "mean": float(df[col].mean()) if not df[col].empty and not pd.isna(df[col].mean()) else None,
                "median": float(df[col].median()) if not df[col].empty and not pd.isna(df[col].median()) else None,
                "std": float(df[col].std()) if not df[col].empty and not pd.isna(df[col].std()) else None
            }
    
    return results

def calculate_quality_score(quality_results):
    """
    Calculate an overall quality score based on check results.
    
    Args:
        quality_results (dict): Quality check results
    
    Returns:
        float: Quality score (0-100)
    """
    if not quality_results or "error" in quality_results:
        return 0.0
    
    score = 100.0  # Start with perfect score
    deductions = []
    
    # Deduct for completeness issues
    completeness = quality_results.get("completeness", {})
    for col, result in completeness.items():
        missing_pct = result.get("missing_pct", 0)
        if missing_pct > 0:
            # Deduct based on missing percentage (higher % = higher deduction)
            deduction = min(20.0, missing_pct / 5)  # Cap at 20 points
            deductions.append(("completeness", col, deduction))
    
    # Deduct for type validation issues
    type_validation = quality_results.get("type_validation", {})
    for col, result in type_validation.items():
        if not result.get("is_valid", True):
            deductions.append(("type_validation", col, 10.0))
    
    # Deduct for uniqueness issues (only if high duplication)
    uniqueness = quality_results.get("uniqueness", {})
    for col, result in uniqueness.items():
        dup_pct = result.get("duplicate_pct", 0)
        if dup_pct > 50:  # Only deduct if more than 50% duplicates
            deduction = min(10.0, dup_pct / 10)
            deductions.append(("uniqueness", col, deduction))
    
    # Apply deductions
    total_deduction = sum(d[2] for d in deductions)
    score = max(0, score - total_deduction)
    
    return score

def check_value_range(df, column, min_val, max_val):
    """
    Check if values in a column are within a specified range.
    
    Args:
        df (pandas.DataFrame): DataFrame to check
        column (str): Column name
        min_val (float): Minimum allowed value
        max_val (float): Maximum allowed value
    
    Returns:
        dict: Check results
    """
    if column not in df.columns:
        return {"error": f"Column '{column}' not found in DataFrame"}
    
    # Get non-null values
    values = df[column].dropna()
    
    # Count values outside the range
    out_of_range = values[(values < min_val) | (values > max_val)]
    out_of_range_count = len(out_of_range)
    out_of_range_pct = (out_of_range_count / len(values)) * 100 if not values.empty else 0
    
    return {
        "column": column,
        "min_val": min_val,
        "max_val": max_val,
        "out_of_range_count": out_of_range_count,
        "out_of_range_pct": float(out_of_range_pct),
        "is_valid": out_of_range_count == 0
    }

def check_pattern_match(df, column, pattern):
    """
    Check if values in a column match a specified regex pattern.
    
    Args:
        df (pandas.DataFrame): DataFrame to check
        column (str): Column name
        pattern (str): Regex pattern
    
    Returns:
        dict: Check results
    """
    if column not in df.columns:
        return {"error": f"Column '{column}' not found in DataFrame"}
    
    # Get non-null values
    values = df[column].dropna()
    
    # Check pattern match
    try:
        regex = re.compile(pattern)
        mismatched = [val for val in values if not regex.match(str(val))]
        mismatch_count = len(mismatched)
        mismatch_pct = (mismatch_count / len(values)) * 100 if not values.empty else 0
        
        return {
            "column": column,
            "pattern": pattern,
            "mismatch_count": mismatch_count,
            "mismatch_pct": float(mismatch_pct),
            "is_valid": mismatch_count == 0,
            "mismatched_examples": mismatched[:10]  # Show first 10 examples
        }
    except re.error:
        return {"error": f"Invalid regex pattern: {pattern}"}

def check_cross_column(df, col1, col2, validation_type):
    """
    Check relationships between two columns.
    
    Args:
        df (pandas.DataFrame): DataFrame to check
        col1 (str): First column name
        col2 (str): Second column name
        validation_type (str): Type of validation (Equal, First greater than second, First less than second)
    
    Returns:
        dict: Check results
    """
    if col1 not in df.columns or col2 not in df.columns:
        return {"error": f"Column not found in DataFrame"}
    
    # Get rows where both columns have values
    valid_rows = df.dropna(subset=[col1, col2])
    
    # Perform validation based on type
    if validation_type == "Equal":
        failures = valid_rows[valid_rows[col1] != valid_rows[col2]]
    elif validation_type == "First greater than second":
        failures = valid_rows[valid_rows[col1] <= valid_rows[col2]]
    elif validation_type == "First less than second":
        failures = valid_rows[valid_rows[col1] >= valid_rows[col2]]
    else:
        return {"error": f"Invalid validation type: {validation_type}"}
    
    failure_count = len(failures)
    failure_pct = (failure_count / len(valid_rows)) * 100 if not valid_rows.empty else 0
    
    return {
        "col1": col1,
        "col2": col2,
        "validation_type": validation_type,
        "failure_count": failure_count,
        "failure_pct": float(failure_pct),
        "is_valid": failure_count == 0,
        "failure_examples": failures.head(10)
    }

def check_alert(file_data, rule):
    """
    Check if a file triggers a specific alert rule.
    
    Args:
        file_data (dict): File data
        rule (dict): Alert rule
    
    Returns:
        dict or None: Alert information if triggered, None otherwise
    """
    rule_type = rule.get("type")
    condition = rule.get("condition")
    threshold = rule.get("threshold")
    
    if rule_type == "File Freshness":
        # Check file freshness
        if "upload_time" in file_data:
            upload_time = datetime.fromisoformat(file_data["upload_time"])
            days_since_upload = (datetime.now() - upload_time).days
            
            if condition == "older_than" and days_since_upload > threshold:
                return {
                    "type": "warning",
                    "timestamp": datetime.now().isoformat(),
                    "message": f"Alert: '{rule['name']}' - File '{file_data['filename']}' is {days_since_upload} days old (threshold: {threshold} days)",
                    "rule": rule["name"],
                    "file_id": file_data["file_id"]
                }
    
    elif rule_type == "Row Count Change":
        # This would require historical data to compare against
        # For demonstration, we'll simulate a change
        row_count = file_data.get("row_count", 0)
        
        # Simulate a previous row count (in a real app, this would come from historical data)
        prev_row_count = getattr(file_data, "prev_row_count", row_count * 1.5)
        
        if condition == "decrease_by":
            pct_change = (prev_row_count - row_count) / prev_row_count * 100
            if pct_change > threshold:
                return {
                    "type": "error",
                    "timestamp": datetime.now().isoformat(),
                    "message": f"Alert: '{rule['name']}' - File '{file_data['filename']}' row count decreased by {pct_change:.1f}% (threshold: {threshold}%)",
                    "rule": rule["name"],
                    "file_id": file_data["file_id"]
                }
        
        elif condition == "increase_by":
            pct_change = (row_count - prev_row_count) / prev_row_count * 100
            if pct_change > threshold:
                return {
                    "type": "warning",
                    "timestamp": datetime.now().isoformat(),
                    "message": f"Alert: '{rule['name']}' - File '{file_data['filename']}' row count increased by {pct_change:.1f}% (threshold: {threshold}%)",
                    "rule": rule["name"],
                    "file_id": file_data["file_id"]
                }
    
    elif rule_type == "Schema Change":
        # This would require historical schema data to compare against
        # For demonstration, we'll just report the current schema
        schema = file_data.get("schema", [])
        
        if condition == "any_change" and schema:
            return {
                "type": "info",
                "timestamp": datetime.now().isoformat(),
                "message": f"Alert: '{rule['name']}' - File '{file_data['filename']}' has {len(schema)} columns that may have changed",
                "rule": rule["name"],
                "file_id": file_data["file_id"]
            }
    
    elif rule_type == "Quality Score":
        # Check quality score
        quality_score = file_data.get("quality_score", 100)
        
        if condition == "below" and quality_score < threshold:
            return {
                "type": "error",
                "timestamp": datetime.now().isoformat(),
                "message": f"Alert: '{rule['name']}' - File '{file_data['filename']}' has quality score {quality_score:.1f} (below threshold: {threshold})",
                "rule": rule["name"],
                "file_id": file_data["file_id"]
            }
    
    return None
