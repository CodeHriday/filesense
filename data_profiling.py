import pandas as pd
import numpy as np

def profile_dataframe(df):
    """
    Generate a profile of a pandas DataFrame.
    
    Args:
        df (pandas.DataFrame): The DataFrame to profile
    
    Returns:
        dict: Profiling results
    """
    if df is None or df.empty:
        return {
            "numeric_summary": None,
            "categorical_summary": None,
            "missing_values": None,
            "column_stats": {}
        }
    
    # Calculate basic statistics
    profile = {
        "row_count": len(df),
        "column_count": len(df.columns),
        "column_stats": {},
        "missing_values": {},
    }
    
    # Generate numeric summary
    numeric_summary = None
    numeric_df = df.select_dtypes(include=['number'])
    if not numeric_df.empty:
        numeric_summary = numeric_df.describe().transpose()
        numeric_summary["missing"] = numeric_df.isna().sum()
        numeric_summary["missing_pct"] = (numeric_df.isna().sum() / len(df) * 100)
        numeric_summary["unique"] = numeric_df.nunique()
    
    # Generate categorical summary
    categorical_summary = None
    categorical_df = df.select_dtypes(exclude=['number'])
    if not categorical_df.empty:
        categorical_summary = pd.DataFrame({
            "type": categorical_df.dtypes,
            "unique": categorical_df.nunique(),
            "missing": categorical_df.isna().sum(),
            "missing_pct": (categorical_df.isna().sum() / len(df) * 100),
            "sample_values": [df[col].dropna().sample(min(3, df[col].nunique())).tolist() 
                             if df[col].nunique() > 0 else [] 
                             for col in categorical_df.columns]
        })
    
    # Calculate missing values
    for col in df.columns:
        missing_count = df[col].isna().sum()
        profile["missing_values"][col] = {
            "count": int(missing_count),
            "percentage": float(missing_count / len(df) * 100)
        }
    
    # Generate column-level statistics
    for col in df.columns:
        col_stats = {
            "type": str(df[col].dtype),
            "unique_count": int(df[col].nunique()),
            "missing_count": int(df[col].isna().sum()),
            "missing_percentage": float(df[col].isna().sum() / len(df) * 100)
        }
        
        # Add numeric-specific stats
        if np.issubdtype(df[col].dtype, np.number):
            col_stats.update({
                "min": float(df[col].min()) if not df[col].empty and not pd.isna(df[col].min()) else None,
                "max": float(df[col].max()) if not df[col].empty and not pd.isna(df[col].max()) else None,
                "mean": float(df[col].mean()) if not df[col].empty and not pd.isna(df[col].mean()) else None,
                "median": float(df[col].median()) if not df[col].empty and not pd.isna(df[col].median()) else None,
                "std": float(df[col].std()) if not df[col].empty and not pd.isna(df[col].std()) else None
            })
        
        # Add categorical-specific stats
        else:
            value_counts = df[col].value_counts(normalize=True).head(5).to_dict()
            col_stats.update({
                "top_values": {str(k): float(v) for k, v in value_counts.items()},
                "sample_values": df[col].dropna().sample(min(3, df[col].nunique())).tolist() if df[col].nunique() > 0 else []
            })
        
        profile["column_stats"][col] = col_stats
    
    return {
        "numeric_summary": numeric_summary,
        "categorical_summary": categorical_summary,
        "missing_values": profile["missing_values"],
        "column_stats": profile["column_stats"]
    }

def calculate_freshness(file_metadata):
    """
    Calculate file freshness metrics.
    
    Args:
        file_metadata (dict): File metadata
    
    Returns:
        dict: Freshness metrics
    """
    last_modified = datetime.fromisoformat(file_metadata["last_modified"])
    now = datetime.now()
    
    seconds_since_modified = (now - last_modified).total_seconds()
    minutes_since_modified = seconds_since_modified / 60
    hours_since_modified = minutes_since_modified / 60
    days_since_modified = hours_since_modified / 24
    
    return {
        "seconds": seconds_since_modified,
        "minutes": minutes_since_modified,
        "hours": hours_since_modified,
        "days": days_since_modified,
        "last_modified": last_modified.isoformat()
    }

def compare_schemas(old_schema, new_schema):
    """
    Compare two schemas and identify changes.
    
    Args:
        old_schema (list): Old schema (list of column dictionaries)
        new_schema (list): New schema (list of column dictionaries)
    
    Returns:
        dict: Schema comparison results
    """
    if not old_schema or not new_schema:
        return {"error": "Missing schema information"}
    
    old_cols = {col["name"]: col for col in old_schema}
    new_cols = {col["name"]: col for col in new_schema}
    
    # Find added, removed, and modified columns
    added_columns = [col for col in new_cols if col not in old_cols]
    removed_columns = [col for col in old_cols if col not in new_cols]
    
    modified_columns = []
    for col_name in set(old_cols.keys()) & set(new_cols.keys()):
        old_col = old_cols[col_name]
        new_col = new_cols[col_name]
        
        if old_col["type"] != new_col["type"]:
            modified_columns.append({
                "name": col_name,
                "change": "type_change",
                "old_type": old_col["type"],
                "new_type": new_col["type"]
            })
    
    return {
        "added_columns": added_columns,
        "removed_columns": removed_columns,
        "modified_columns": modified_columns,
        "has_changes": bool(added_columns or removed_columns or modified_columns)
    }

def analyze_distribution(df, column):
    """
    Analyze the distribution of values in a column.
    
    Args:
        df (pandas.DataFrame): DataFrame containing the column
        column (str): Column name
    
    Returns:
        dict: Distribution analysis results
    """
    if column not in df.columns:
        return {"error": f"Column '{column}' not found in DataFrame"}
    
    series = df[column]
    
    # Basic statistics
    stats = {
        "count": len(series),
        "missing_count": series.isna().sum(),
        "missing_pct": float(series.isna().sum() / len(series) * 100),
        "unique_count": series.nunique()
    }
    
    # Type-specific statistics
    if np.issubdtype(series.dtype, np.number):
        stats.update({
            "min": float(series.min()) if not series.empty and not pd.isna(series.min()) else None,
            "max": float(series.max()) if not series.empty and not pd.isna(series.max()) else None,
            "mean": float(series.mean()) if not series.empty and not pd.isna(series.mean()) else None,
            "median": float(series.median()) if not series.empty and not pd.isna(series.median()) else None,
            "std": float(series.std()) if not series.empty and not pd.isna(series.std()) else None,
            "quartiles": [
                float(series.quantile(0.25)) if not series.empty and not pd.isna(series.quantile(0.25)) else None,
                float(series.quantile(0.50)) if not series.empty and not pd.isna(series.quantile(0.50)) else None,
                float(series.quantile(0.75)) if not series.empty and not pd.isna(series.quantile(0.75)) else None
            ]
        })
        
        # Calculate histogram data for numeric columns
        hist_data = np.histogram(series.dropna(), bins=10)
        stats["histogram"] = {
            "bins": hist_data[1].tolist(),
            "counts": hist_data[0].tolist()
        }
    else:
        # For categorical columns, get value counts
        value_counts = series.value_counts(normalize=True).head(10).to_dict()
        stats["value_distribution"] = {str(k): float(v) for k, v in value_counts.items()}
    
    return stats
