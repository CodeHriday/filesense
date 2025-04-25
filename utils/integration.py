"""
Integration Module

This module provides compatibility interfaces between enhanced utilities
and the existing application code to allow for seamless integration
without breaking existing functionality.
"""

import asyncio
import pandas as pd
import os
import time
from functools import wraps

# Import original modules
import file_processing
import data_profiling

# Import enhanced utilities
from utils.async_file_processor import load_file_chunked, process_file_chunked, load_file_async
from utils.enhanced_profiling import profile_dataframe_with_logging, profile_dataframe_async
from utils.logger import file_logger, data_logger, log_execution_time


def async_to_sync(async_func):
    """
    Decorator to convert an async function to a sync function.
    
    Args:
        async_func: Async function to convert
    
    Returns:
        Synchronous wrapper function
    """
    @wraps(async_func)
    def sync_wrapper(*args, **kwargs):
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            # Create a new event loop if none exists
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        return loop.run_until_complete(async_func(*args, **kwargs))
    return sync_wrapper


def enhanced_load_file(file_path, file_extension, delimiter=","):
    """
    Enhanced version of file_processing.load_file that uses async processing
    for large files while maintaining the same interface.
    
    Args:
        file_path (str): Path to the file
        file_extension (str): File extension (csv, json, parquet)
        delimiter (str): Delimiter for CSV files (default: ",")
    
    Returns:
        tuple: (DataFrame, file_info)
    """
    file_logger.info(f"Loading file: {file_path} with type {file_extension}")
    
    # Check file size to determine processing method
    file_size = os.path.getsize(file_path)
    
    # For small files (< 100MB), use standard processing
    if file_size < 100 * 1024 * 1024:  # 100MB
        file_logger.info(f"Using standard processing for {file_path} (size: {file_size} bytes)")
        return file_processing.load_file(file_path, file_extension, delimiter)
    
    # For larger files, use chunked processing
    file_logger.info(f"Using chunked processing for large file {file_path} (size: {file_size} bytes)")
    start_time = time.time()
    
    try:
        df, file_info = load_file_chunked(file_path, file_extension, delimiter)
        
        elapsed = time.time() - start_time
        file_logger.info(f"Completed enhanced file loading in {elapsed:.2f} seconds", extra={
            "file_path": file_path,
            "elapsed_seconds": elapsed,
            "row_count": len(df) if df is not None else 0
        })
        
        return df, file_info
    except Exception as e:
        file_logger.error(f"Error in enhanced file loading: {str(e)}", extra={
            "file_path": file_path
        })
        # Fall back to original method if enhanced method fails
        file_logger.info(f"Falling back to original load_file method for {file_path}")
        return file_processing.load_file(file_path, file_extension, delimiter)


@async_to_sync
async def enhanced_load_file_async(file_path, file_extension, delimiter=","):
    """
    Asynchronous file loading function that returns both the task ID and DataFrame.
    
    Args:
        file_path (str): Path to the file
        file_extension (str): File extension (csv, json, parquet)
        delimiter (str): Delimiter for CSV files (default: ",")
    
    Returns:
        tuple: (DataFrame, file_info) with task_id in file_info
    """
    task_id, file_info = await load_file_async(file_path, file_extension, delimiter)
    
    # We still need to return the DataFrame for compatibility
    if file_extension == "csv":
        df = pd.read_csv(file_path, delimiter=delimiter)
    elif file_extension == "json":
        df = pd.read_json(file_path)
    elif file_extension == "parquet":
        df = pd.read_parquet(file_path)
    else:
        raise ValueError(f"Unsupported file extension: {file_extension}")
    
    # Add task_id to the file_info
    file_info["task_id"] = task_id
    
    return df, file_info


def enhanced_profile_dataframe(df):
    """
    Enhanced version of data_profiling.profile_dataframe that uses logging
    while maintaining the same interface.
    
    Args:
        df (pandas.DataFrame): The DataFrame to profile
    
    Returns:
        dict: Profiling results
    """
    data_logger.info(f"Profiling dataframe with {len(df)} rows and {len(df.columns)} columns")
    
    # For small dataframes, use the logged version of original function
    if len(df) < 10000:
        data_logger.info("Using standard profiling")
        return profile_dataframe_with_logging(df)
    
    # For larger dataframes, use async version
    data_logger.info("Using async profiling for large dataframe")
    return async_to_sync(profile_dataframe_async)(df)


# Monkey patch the original functions to use the enhanced versions
# This makes the enhanced versions available throughout the application without code changes
file_processing.load_file = enhanced_load_file
data_profiling.profile_dataframe = enhanced_profile_dataframe


# Export patched functions and additional utilities
__all__ = [
    'enhanced_load_file', 
    'enhanced_load_file_async', 
    'enhanced_profile_dataframe',
    'async_to_sync'
]