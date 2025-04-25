"""
Enhanced Data Profiling Module

This module extends data_profiling.py with asynchronous processing
capabilities and advanced logging for improved performance and monitoring.
"""

import pandas as pd
import numpy as np
import asyncio
import concurrent.futures
import time
import traceback
from datetime import datetime
from functools import partial

# Import original profiling module
import data_profiling

# Import logging utilities
from utils.logger import data_logger, log_execution_time, async_handler

# Thread pool for CPU-bound tasks
thread_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=4
)

@log_execution_time(data_logger)
def profile_dataframe_with_logging(df):
    """
    Profile a DataFrame with enhanced logging.
    
    Args:
        df (pandas.DataFrame): The DataFrame to profile
    
    Returns:
        dict: Profiling results
    """
    start_time = time.time()
    
    try:
        data_logger.info(f"Starting dataframe profiling for {len(df)} rows and {len(df.columns)} columns")
        
        # Call the original function
        result = data_profiling.profile_dataframe(df)
        
        # Log completion
        elapsed = time.time() - start_time
        data_logger.info(f"Completed dataframe profiling in {elapsed:.2f} seconds", extra={
            "row_count": len(df),
            "column_count": len(df.columns),
            "elapsed_seconds": elapsed
        })
        
        return result
    except Exception as e:
        data_logger.error(f"Error in dataframe profiling: {str(e)}", extra={
            "traceback": traceback.format_exc()
        })
        raise


async def _profile_column_async(df, column):
    """
    Profile a single column asynchronously.
    
    Args:
        df (pandas.DataFrame): The DataFrame
        column (str): Column name
    
    Returns:
        tuple: (column_name, column_stats)
    """
    try:
        col = df[column]
        
        # Basic stats
        col_stats = {
            "type": str(col.dtype),
            "unique_count": int(col.nunique()),
            "missing_count": int(col.isna().sum()),
            "missing_percentage": float(col.isna().sum() / len(df) * 100)
        }
        
        # Numeric column stats
        if np.issubdtype(col.dtype, np.number):
            numeric_stats = {
                "min": float(col.min()) if not col.empty and not pd.isna(col.min()) else None,
                "max": float(col.max()) if not col.empty and not pd.isna(col.max()) else None,
                "mean": float(col.mean()) if not col.empty and not pd.isna(col.mean()) else None,
                "median": float(col.median()) if not col.empty and not pd.isna(col.median()) else None,
                "std": float(col.std()) if not col.empty and not pd.isna(col.std()) else None
            }
            col_stats.update(numeric_stats)
            
            # Additional statistical analysis for numeric columns
            if len(col.dropna()) > 5:  # Only if we have enough data
                loop = asyncio.get_event_loop()
                # Calculate histogram data
                hist_data = await loop.run_in_executor(
                    thread_pool,
                    lambda: np.histogram(col.dropna(), bins=10)
                )
                col_stats["histogram"] = {
                    "bins": hist_data[1].tolist(),
                    "counts": hist_data[0].tolist()
                }
                
                # Detect potential outliers
                q1 = col.quantile(0.25)
                q3 = col.quantile(0.75)
                iqr = q3 - q1
                outlier_low = q1 - 1.5 * iqr
                outlier_high = q3 + 1.5 * iqr
                
                outliers = col[(col < outlier_low) | (col > outlier_high)]
                col_stats["outliers"] = {
                    "count": len(outliers),
                    "percentage": len(outliers) / len(col.dropna()) * 100 if len(col.dropna()) > 0 else 0,
                    "low_threshold": float(outlier_low),
                    "high_threshold": float(outlier_high)
                }
        
        # Categorical column stats
        else:
            # Value counts
            value_counts_func = lambda: col.value_counts(normalize=True).head(5).to_dict()
            loop = asyncio.get_event_loop()
            value_counts = await loop.run_in_executor(thread_pool, value_counts_func)
            
            col_stats.update({
                "top_values": {str(k): float(v) for k, v in value_counts.items()},
                "sample_values": col.dropna().sample(min(3, col.nunique())).tolist() if col.nunique() > 0 else []
            })
            
            # Length statistics for string columns
            if col.dtype == 'object':
                length_stats_func = lambda: col.dropna().str.len().agg(['min', 'max', 'mean']).to_dict()
                length_stats = await loop.run_in_executor(thread_pool, length_stats_func)
                
                col_stats["length_stats"] = {
                    "min": int(length_stats['min']) if 'min' in length_stats and not pd.isna(length_stats['min']) else None,
                    "max": int(length_stats['max']) if 'max' in length_stats and not pd.isna(length_stats['max']) else None,
                    "mean": float(length_stats['mean']) if 'mean' in length_stats and not pd.isna(length_stats['mean']) else None
                }
        
        return column, col_stats
    
    except Exception as e:
        data_logger.error(f"Error profiling column {column}: {str(e)}", extra={
            "traceback": traceback.format_exc()
        })
        return column, {"error": str(e)}


async def profile_dataframe_async(df):
    """
    Asynchronously profile a DataFrame with parallel processing for columns.
    
    Args:
        df (pandas.DataFrame): The DataFrame to profile
    
    Returns:
        dict: Profiling results
    """
    start_time = time.time()
    
    if df is None or df.empty:
        return {
            "numeric_summary": None,
            "categorical_summary": None,
            "missing_values": None,
            "column_stats": {}
        }
    
    try:
        data_logger.info(f"Starting async dataframe profiling for {len(df)} rows and {len(df.columns)} columns")
        
        # Process each column concurrently
        column_tasks = [_profile_column_async(df, column) for column in df.columns]
        column_results = await asyncio.gather(*column_tasks)
        
        # Build column stats dictionary
        column_stats = {column: stats for column, stats in column_results}
        
        # Calculate missing values
        missing_values = {}
        for col in df.columns:
            missing_count = df[col].isna().sum()
            missing_values[col] = {
                "count": int(missing_count),
                "percentage": float(missing_count / len(df) * 100)
            }
        
        # Generate numeric summary (can be done asynchronously)
        numeric_df = df.select_dtypes(include=['number'])
        numeric_summary = None
        
        if not numeric_df.empty:
            loop = asyncio.get_event_loop()
            numeric_summary_func = lambda: numeric_df.describe().transpose()
            numeric_summary = await loop.run_in_executor(thread_pool, numeric_summary_func)
            
            # Add missing and unique counts
            numeric_summary["missing"] = numeric_df.isna().sum()
            numeric_summary["missing_pct"] = (numeric_df.isna().sum() / len(df) * 100)
            numeric_summary["unique"] = numeric_df.nunique()
        
        # Generate categorical summary (can be done asynchronously)
        categorical_df = df.select_dtypes(exclude=['number'])
        categorical_summary = None
        
        if not categorical_df.empty:
            def get_categorical_summary():
                return pd.DataFrame({
                    "type": categorical_df.dtypes,
                    "unique": categorical_df.nunique(),
                    "missing": categorical_df.isna().sum(),
                    "missing_pct": (categorical_df.isna().sum() / len(df) * 100),
                    "sample_values": [
                        df[col].dropna().sample(min(3, df[col].nunique())).tolist() 
                        if df[col].nunique() > 0 else [] 
                        for col in categorical_df.columns
                    ]
                })
            
            loop = asyncio.get_event_loop()
            categorical_summary = await loop.run_in_executor(thread_pool, get_categorical_summary)
        
        # Calculate elapsed time
        elapsed = time.time() - start_time
        data_logger.info(f"Completed async dataframe profiling in {elapsed:.2f} seconds", extra={
            "row_count": len(df),
            "column_count": len(df.columns),
            "elapsed_seconds": elapsed
        })
        
        return {
            "numeric_summary": numeric_summary,
            "categorical_summary": categorical_summary,
            "missing_values": missing_values,
            "column_stats": column_stats
        }
        
    except Exception as e:
        data_logger.error(f"Error in async dataframe profiling: {str(e)}", extra={
            "traceback": traceback.format_exc()
        })
        raise


@log_execution_time(data_logger)
def analyze_distribution_with_logging(df, column):
    """
    Analyze column distribution with enhanced logging.
    
    Args:
        df (pandas.DataFrame): DataFrame containing the column
        column (str): Column name
    
    Returns:
        dict: Distribution analysis results
    """
    start_time = time.time()
    
    try:
        data_logger.info(f"Starting distribution analysis for column: {column}")
        
        # Call the original function
        result = data_profiling.analyze_distribution(df, column)
        
        # Log completion
        elapsed = time.time() - start_time
        data_logger.info(f"Completed distribution analysis for column {column} in {elapsed:.2f} seconds", extra={
            "column": column,
            "elapsed_seconds": elapsed
        })
        
        return result
    except Exception as e:
        data_logger.error(f"Error in distribution analysis for column {column}: {str(e)}", extra={
            "column": column,
            "traceback": traceback.format_exc()
        })
        raise


async def analyze_distribution_async(df, column):
    """
    Asynchronously analyze the distribution of values in a column.
    
    Args:
        df (pandas.DataFrame): DataFrame containing the column
        column (str): Column name
    
    Returns:
        dict: Distribution analysis results
    """
    if column not in df.columns:
        return {"error": f"Column '{column}' not found in DataFrame"}
    
    try:
        series = df[column]
        loop = asyncio.get_event_loop()
        
        # Basic statistics (calculated concurrently)
        unique_count_task = loop.run_in_executor(thread_pool, lambda: series.nunique())
        missing_count_task = loop.run_in_executor(thread_pool, lambda: series.isna().sum())
        
        unique_count = await unique_count_task
        missing_count = await missing_count_task
        
        stats = {
            "count": len(series),
            "missing_count": int(missing_count),
            "missing_pct": float(missing_count / len(series) * 100),
            "unique_count": int(unique_count)
        }
        
        # Type-specific statistics
        if np.issubdtype(series.dtype, np.number):
            # Calculate numeric stats concurrently
            min_task = loop.run_in_executor(thread_pool, lambda: series.min() if not series.empty else None)
            max_task = loop.run_in_executor(thread_pool, lambda: series.max() if not series.empty else None)
            mean_task = loop.run_in_executor(thread_pool, lambda: series.mean() if not series.empty else None)
            median_task = loop.run_in_executor(thread_pool, lambda: series.median() if not series.empty else None)
            std_task = loop.run_in_executor(thread_pool, lambda: series.std() if not series.empty else None)
            q1_task = loop.run_in_executor(thread_pool, lambda: series.quantile(0.25) if not series.empty else None)
            q3_task = loop.run_in_executor(thread_pool, lambda: series.quantile(0.75) if not series.empty else None)
            
            # Await all tasks
            min_val, max_val = await min_task, await max_task
            mean_val, median_val = await mean_task, await median_task
            std_val = await std_task
            q1, q3 = await q1_task, await q3_task
            
            stats.update({
                "min": float(min_val) if min_val is not None and not pd.isna(min_val) else None,
                "max": float(max_val) if max_val is not None and not pd.isna(max_val) else None,
                "mean": float(mean_val) if mean_val is not None and not pd.isna(mean_val) else None,
                "median": float(median_val) if median_val is not None and not pd.isna(median_val) else None,
                "std": float(std_val) if std_val is not None and not pd.isna(std_val) else None,
                "quartiles": [
                    float(q1) if q1 is not None and not pd.isna(q1) else None,
                    float(median_val) if median_val is not None and not pd.isna(median_val) else None,
                    float(q3) if q3 is not None and not pd.isna(q3) else None
                ]
            })
            
            # Calculate histogram asynchronously
            hist_data_func = lambda: np.histogram(series.dropna(), bins=10)
            hist_data = await loop.run_in_executor(thread_pool, hist_data_func)
            
            stats["histogram"] = {
                "bins": hist_data[1].tolist(),
                "counts": hist_data[0].tolist()
            }
            
            # Calculate outlier statistics
            iqr = q3 - q1
            outlier_low = q1 - 1.5 * iqr
            outlier_high = q3 + 1.5 * iqr
            
            # Count outliers asynchronously
            outlier_count_func = lambda: len(series[(series < outlier_low) | (series > outlier_high)])
            outlier_count = await loop.run_in_executor(thread_pool, outlier_count_func)
            
            stats["outliers"] = {
                "count": int(outlier_count),
                "percentage": float(outlier_count / len(series.dropna()) * 100) if len(series.dropna()) > 0 else 0,
                "low_threshold": float(outlier_low) if not pd.isna(outlier_low) else None,
                "high_threshold": float(outlier_high) if not pd.isna(outlier_high) else None
            }
        else:
            # Calculate value counts asynchronously
            value_counts_func = lambda: series.value_counts(normalize=True).head(10).to_dict()
            value_counts = await loop.run_in_executor(thread_pool, value_counts_func)
            
            stats["value_distribution"] = {str(k): float(v) for k, v in value_counts.items()}
            
            # Calculate string length statistics for string columns
            if series.dtype == 'object':
                def calc_string_stats():
                    length_series = series.dropna().astype(str).str.len()
                    if len(length_series) > 0:
                        return {
                            "min": int(length_series.min()),
                            "max": int(length_series.max()),
                            "mean": float(length_series.mean())
                        }
                    return {"min": None, "max": None, "mean": None}
                
                string_stats = await loop.run_in_executor(thread_pool, calc_string_stats)
                stats["string_length"] = string_stats
        
        return stats
        
    except Exception as e:
        data_logger.error(f"Error in async distribution analysis for column {column}: {str(e)}", extra={
            "column": column,
            "traceback": traceback.format_exc()
        })
        raise Exception(f"Error analyzing column {column}: {str(e)}")


@log_execution_time(data_logger)
def compare_schemas_with_logging(old_schema, new_schema):
    """
    Compare schemas with enhanced logging.
    
    Args:
        old_schema (list): Old schema
        new_schema (list): New schema
    
    Returns:
        dict: Schema comparison results
    """
    try:
        data_logger.info("Starting schema comparison")
        
        # Call the original function
        result = data_profiling.compare_schemas(old_schema, new_schema)
        
        # Log results
        if result.get("has_changes", False):
            data_logger.info("Schema changes detected", extra={
                "added_columns": len(result.get("added_columns", [])),
                "removed_columns": len(result.get("removed_columns", [])),
                "modified_columns": len(result.get("modified_columns", []))
            })
        else:
            data_logger.info("No schema changes detected")
        
        return result
    except Exception as e:
        data_logger.error(f"Error in schema comparison: {str(e)}", extra={
            "traceback": traceback.format_exc()
        })
        raise