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

def calculate_quality_score(quality_results, file_metadata=None):
    """
    Calculate an overall quality score based on check results using multiple dimensions of data quality.
    
    Args:
        quality_results (dict): Quality check results
        file_metadata (dict, optional): Additional file metadata for timeliness calculation
    
    Returns:
        dict: Quality score details including overall score and component scores
    """
    if not quality_results or "error" in quality_results:
        return {"overall_score": 0.0, "components": {}}
    
    # Define weights for different quality dimensions (sum should be 1.0)
    weights = {
        "completeness": 0.3,  # How much of the data is present
        "consistency": 0.25,  # How consistent the data types and patterns are
        "validity": 0.2,     # How valid the data is against business rules
        "uniqueness": 0.15,  # How unique the values are
        "timeliness": 0.1    # How recent the data is
    }
    
    component_scores = {}
    
    # Calculate COMPLETENESS score (percentage of non-null values)
    completeness = quality_results.get("completeness", {})
    if completeness:
        # Calculate average completeness across all columns
        missing_percentages = [result.get("missing_pct", 0) for result in completeness.values()]
        avg_missing_pct = sum(missing_percentages) / len(missing_percentages) if missing_percentages else 0
        # Score is 100 minus the average missing percentage
        component_scores["completeness"] = max(0, 100 - avg_missing_pct)
    else:
        component_scores["completeness"] = 100  # Default if no completeness data
    
    # Calculate CONSISTENCY score (data type consistency)
    type_validation = quality_results.get("type_validation", {})
    if type_validation:
        # Count columns with valid data types
        valid_types_count = sum(1 for result in type_validation.values() if result.get("is_valid", True))
        total_columns = len(type_validation)
        # Score is percentage of columns with valid types
        component_scores["consistency"] = (valid_types_count / total_columns * 100) if total_columns > 0 else 100
    else:
        component_scores["consistency"] = 100  # Default if no type validation data
    
    # Calculate VALIDITY score (valid values against business rules)
    # Note: This is a placeholder. In production, you'd have specific business rules to validate against
    # For now, we'll use a combination of type validation and range checks as a proxy
    component_scores["validity"] = (component_scores.get("consistency", 100) * 0.7) + 30  # Rough estimate
    
    # Calculate UNIQUENESS score
    uniqueness = quality_results.get("uniqueness", {})
    if uniqueness:
        # For simplicity, we'll use the average uniqueness across all columns
        # In production, you'd likely weight this differently for key columns vs. non-key columns
        duplicate_percentages = [result.get("duplicate_pct", 0) for result in uniqueness.values()]
        avg_duplicate_pct = sum(duplicate_percentages) / len(duplicate_percentages) if duplicate_percentages else 0
        # Score is 100 minus the average duplicate percentage
        component_scores["uniqueness"] = max(0, 100 - avg_duplicate_pct)
    else:
        component_scores["uniqueness"] = 100  # Default if no uniqueness data
    
    # Calculate TIMELINESS score
    if file_metadata and "created_at" in file_metadata:
        try:
            from datetime import datetime
            # Parse the timestamp (assuming ISO format)
            if isinstance(file_metadata["created_at"], str):
                created_at = datetime.fromisoformat(file_metadata["created_at"].replace('Z', '+00:00'))
            else:
                created_at = file_metadata["created_at"]
                
            # Calculate days since creation
            days_since_creation = (datetime.now().astimezone() - created_at.astimezone()).days
            # Score decreases by 5 points per day, minimum 0
            component_scores["timeliness"] = max(0, 100 - (days_since_creation * 5))
        except (ValueError, TypeError):
            component_scores["timeliness"] = 50  # Default if date parsing fails
    else:
        component_scores["timeliness"] = 50  # Default if no timestamp data
    
    # Calculate OVERALL score using weighted average
    overall_score = sum(component_scores.get(component, 0) * weight 
                      for component, weight in weights.items())
    
    # Round to 2 decimal places
    overall_score = round(overall_score, 2)
    component_scores = {k: round(v, 2) for k, v in component_scores.items()}
    
    return {
        "overall_score": overall_score,
        "components": component_scores,
        "weights": weights
    }

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

def calculate_quality_from_columns(columns, file_metadata=None):
    """
    Calculate quality score directly from column metadata (when no DataFrame is available).
    This is useful for API endpoints that need to compute quality without loading the file.
    
    Args:
        columns (list): List of column metadata dictionaries
        file_metadata (dict, optional): File metadata for timeliness scoring
        
    Returns:
        dict: Quality score details including overall score and component scores
    """
    if not columns or not isinstance(columns, list):
        return {"overall_score": 0.0, "components": {}}
        
    # Define weights for different quality dimensions (sum should be 1.0)
    weights = {
        "completeness": 0.3,  # How much of the data is present
        "consistency": 0.25,  # How consistent the data types and patterns are
        "validity": 0.2,     # How valid the data is against business rules
        "uniqueness": 0.15,  # How unique the values are
        "timeliness": 0.1    # How recent the data is
    }
    
    component_scores = {}
    total_rows = file_metadata.get("row_count", 100) if file_metadata else 100
    
    # Calculate COMPLETENESS score (percentage of non-null values)
    if columns:
        missing_percentages = []
        for column in columns:
            null_count = column.get("null_count", 0) or column.get("missing", 0) or 0
            missing_pct = (null_count / total_rows * 100) if total_rows > 0 else 0
            missing_percentages.append(missing_pct)
            
        avg_missing_pct = sum(missing_percentages) / len(missing_percentages) if missing_percentages else 0
        component_scores["completeness"] = max(0, 100 - avg_missing_pct)
    else:
        component_scores["completeness"] = 100  # Default if no column data
    
    # Calculate CONSISTENCY score (data type consistency)
    if columns:
        # Check if any columns have mismatched types
        string_columns = sum(1 for col in columns if col.get("type") == "string")
        date_columns = sum(1 for col in columns if col.get("type") == "date")
        numeric_columns = sum(1 for col in columns if col.get("type") in ("integer", "number", "decimal", "float"))
        other_columns = len(columns) - string_columns - date_columns - numeric_columns
        
        # Assume 90% consistency for now - if we had access to actual data, we could check values vs types
        consistency_score = 90 if other_columns == 0 else 100 - (other_columns / len(columns) * 30)
        component_scores["consistency"] = max(0, min(100, consistency_score))
    else:
        component_scores["consistency"] = 90  # Default if no column data
    
    # Calculate VALIDITY score based on column types and potential errors
    component_scores["validity"] = component_scores.get("consistency", 100) * 0.9  # Estimate based on consistency
    
    # Calculate UNIQUENESS score
    if columns:
        uniqueness_scores = []
        for column in columns:
            # Use unique values count if available
            unique_values = column.get("unique", 0) or 0
            if unique_values > 0 and total_rows > 0:
                # Calculate percentage of unique values
                uniqueness_pct = (unique_values / total_rows) * 100
                # Cap at 100% for columns where every value is unique
                uniqueness_pct = min(100, uniqueness_pct)
                uniqueness_scores.append(uniqueness_pct)
        
        # Use average uniqueness score across all columns
        avg_uniqueness = sum(uniqueness_scores) / len(uniqueness_scores) if uniqueness_scores else 80
        component_scores["uniqueness"] = avg_uniqueness
    else:
        component_scores["uniqueness"] = 80  # Default if no column data
    
    # Calculate TIMELINESS score
    if file_metadata and "created_at" in file_metadata:
        try:
            from datetime import datetime
            # Parse the timestamp (assuming ISO format)
            if isinstance(file_metadata["created_at"], str):
                created_at = datetime.fromisoformat(file_metadata["created_at"].replace('Z', '+00:00'))
            else:
                created_at = file_metadata["created_at"]
                
            # Calculate days since creation
            days_since_creation = (datetime.now().astimezone() - created_at.astimezone()).days
            # Score decreases by 5 points per day, minimum 0
            component_scores["timeliness"] = max(0, 100 - (days_since_creation * 5))
        except (ValueError, TypeError):
            component_scores["timeliness"] = 90  # Default if date parsing fails
    else:
        component_scores["timeliness"] = 90  # Default if no timestamp data
    
    # Calculate OVERALL score using weighted average
    overall_score = sum(component_scores.get(component, 0) * weight 
                      for component, weight in weights.items())
    
    # Round to 2 decimal places
    overall_score = round(overall_score, 2)
    component_scores = {k: round(v, 2) for k, v in component_scores.items()}
    
    return {
        "overall_score": overall_score,
        "components": component_scores,
        "weights": weights
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
