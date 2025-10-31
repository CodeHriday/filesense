"""
Asynchronous File Processor

This module extends the existing file processing capabilities with asynchronous 
processing for improved performance with large files.
"""

import os
import asyncio
import concurrent.futures
import pandas as pd
import json
from datetime import datetime
import time
import uuid
from functools import partial
import traceback

# Import the original file processing module
import file_processing

# Import dtype converter
try:
    from dtype_converter import get_user_friendly_type
except ImportError:
    from utils.dtype_converter import get_user_friendly_type

# Import the logger
from utils.logger import file_logger, log_execution_time, async_handler

# Import streaming processors for memory-efficient file handling
from utils.streaming_processors import (
    StreamingFileReader, 
    stream_json_file, 
    stream_parquet_file, 
    stream_csv_file,
    auto_detect_and_stream
)

# Import memory monitoring for circuit breaker protection
from utils.memory_monitor import (
    check_before_processing,
    MemoryGuard,
    log_memory_status,
    reduce_chunk_size,
    get_memory_usage
)

# Thread pool for CPU-bound tasks
thread_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=min(32, (os.cpu_count() or 4) + 4)
)

# Process pool for CPU-bound pandas operations
process_pool = concurrent.futures.ProcessPoolExecutor(
    max_workers=max(1, (os.cpu_count() or 4) - 1)
)

# In-memory cache for tracking running tasks
_tasks = {}


def get_task_status(task_id):
    """
    Get the status of a running task.
    
    Args:
        task_id (str): Task ID
    
    Returns:
        dict: Task status information
    """
    if task_id not in _tasks:
        return {"status": "not_found", "task_id": task_id}
    
    task_info = _tasks[task_id]
    
    if task_info["future"].done():
        if task_info["future"].exception():
            return {
                "status": "failed",
                "task_id": task_id,
                "error": str(task_info["future"].exception()),
                "start_time": task_info["start_time"],
                "end_time": datetime.now().isoformat(),
                "elapsed_seconds": (datetime.now() - datetime.fromisoformat(task_info["start_time"])).total_seconds()
            }
        else:
            return {
                "status": "completed",
                "task_id": task_id,
                "result": task_info["future"].result(),
                "start_time": task_info["start_time"],
                "end_time": datetime.now().isoformat(),
                "elapsed_seconds": (datetime.now() - datetime.fromisoformat(task_info["start_time"])).total_seconds()
            }
    else:
        return {
            "status": "running",
            "task_id": task_id,
            "start_time": task_info["start_time"],
            "elapsed_seconds": (datetime.now() - datetime.fromisoformat(task_info["start_time"])).total_seconds()
        }


def _process_dataframe_chunk(chunk, file_extension):
    """
    Process a single dataframe chunk.
    
    Args:
        chunk (pandas.DataFrame): DataFrame chunk
        file_extension (str): File extension
    
    Returns:
        dict: Chunk analysis results
    """
    chunk_info = {
        "row_count": len(chunk),
        "column_count": len(chunk.columns),
        "column_stats": {}
    }
    
    for col in chunk.columns:
        chunk_info["column_stats"][col] = {
            "type": get_user_friendly_type(chunk[col].dtype),
            "null_count": chunk[col].isna().sum(),
            "unique_count": chunk[col].nunique(),
            "min": chunk[col].min() if pd.api.types.is_numeric_dtype(chunk[col]) else None,
            "max": chunk[col].max() if pd.api.types.is_numeric_dtype(chunk[col]) else None,
            "mean": chunk[col].mean() if pd.api.types.is_numeric_dtype(chunk[col]) else None,
            "sample_values": chunk[col].dropna().head(3).tolist() if not chunk[col].empty else []
        }
    
    return chunk_info


def _merge_chunk_results(chunk_results):
    """
    Merge chunk processing results.
    
    Args:
        chunk_results (list): List of chunk results
    
    Returns:
        dict: Merged results
    """
    if not chunk_results:
        return {}
    
    merged = {
        "row_count": sum(chunk["row_count"] for chunk in chunk_results),
        "column_count": chunk_results[0]["column_count"],
        "column_stats": {}
    }
    
    # Initialize with the first chunk's columns
    for col, stats in chunk_results[0]["column_stats"].items():
        # Initialize with safe values if None
        min_val = stats["min"] if stats["min"] is not None else 0
        max_val = stats["max"] if stats["max"] is not None else 0
        mean_val = stats["mean"] if stats["mean"] is not None else 0
        null_count = stats["null_count"] if stats["null_count"] is not None else 0
        
        merged["column_stats"][col] = {
            "type": stats["type"],
            "null_count": null_count,
            "unique_values": set(stats["sample_values"]),
            "min": stats["min"],
            "max": stats["max"],
            "sum": mean_val * null_count if stats["mean"] is not None else None,
            "count": null_count
        }
    
    # Merge in other chunks
    for chunk in chunk_results[1:]:
        for col, stats in chunk["column_stats"].items():
            if col in merged["column_stats"]:
                # Handle null_count safely
                null_count = stats["null_count"] if stats["null_count"] is not None else 0
                merged["column_stats"][col]["null_count"] += null_count
                merged["column_stats"][col]["unique_values"].update(stats["sample_values"])
                
                if stats["min"] is not None:
                    if merged["column_stats"][col]["min"] is None:
                        merged["column_stats"][col]["min"] = stats["min"]
                    else:
                        merged["column_stats"][col]["min"] = min(merged["column_stats"][col]["min"], stats["min"])
                
                if stats["max"] is not None:
                    if merged["column_stats"][col]["max"] is None:
                        merged["column_stats"][col]["max"] = stats["max"]
                    else:
                        merged["column_stats"][col]["max"] = max(merged["column_stats"][col]["max"], stats["max"])
                
                # Handle mean calculation safely
                if stats["mean"] is not None:
                    mean_val = stats["mean"]
                    if merged["column_stats"][col]["sum"] is None:
                        merged["column_stats"][col]["sum"] = mean_val * null_count
                    else:
                        if merged["column_stats"][col]["sum"] is not None:
                            merged["column_stats"][col]["sum"] += mean_val * null_count
                    
                    merged["column_stats"][col]["count"] += null_count
    
    # Calculate final statistics
    for col, stats in merged["column_stats"].items():
        stats["unique_count"] = len(stats["unique_values"])
        stats["sample_values"] = list(stats["unique_values"])[:5]
        del stats["unique_values"]
        
        if stats["sum"] is not None and stats["count"] > 0:
            stats["mean"] = stats["sum"] / stats["count"]
        else:
            stats["mean"] = None
        
        del stats["sum"]
        del stats["count"]
    
    return merged


async def load_file_async(file_path, file_extension, delimiter=",", chunk_size=10000):
    """
    Asynchronously load a file into a pandas DataFrame and extract file information.
    
    Args:
        file_path (str): Path to the file
        file_extension (str): File extension (csv, json, parquet)
        delimiter (str): Delimiter for CSV files (default: ",")
        chunk_size (int): Number of rows per chunk for large files
    
    Returns:
        tuple: (task_id, initial_file_info)
    """
    task_id = str(uuid.uuid4())
    
    # Get basic file info synchronously
    file_info = {
        "file_path": file_path,
        "extension": file_extension,
        "last_modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
        "size_bytes": os.path.getsize(file_path),
        "task_id": task_id
    }
    
    # Log start of processing
    file_logger.info(f"Starting async file processing: {file_path}", extra={
        "task_id": task_id,
        "file_size": file_info["size_bytes"],
        "extension": file_extension
    })
    
    # Define the task to run in the background
    async def process_file_task():
        start_time = time.time()
        chunk_results = []
        
        try:
            # Check memory before starting - circuit breaker protection
            file_size_mb = file_info["size_bytes"] / (1024 * 1024)
            can_process, reason = check_before_processing(file_size_mb)
            
            if not can_process:
                error_msg = f"Cannot process file due to memory constraints: {reason}"
                file_logger.error(error_msg, extra={
                    "task_id": task_id,
                    "file_size_mb": file_size_mb,
                    "reason": reason
                })
                raise MemoryError(error_msg)
            
            # Log memory status at start
            start_memory = get_memory_usage()
            file_logger.info(f"Starting file processing with {start_memory['usage_percent']}% memory usage", extra={
                "task_id": task_id,
                "file_size_mb": file_size_mb,
                "memory_usage": start_memory
            })
            
            # Use streaming processors for memory-efficient file handling
            # This works for CSV, JSON, and Parquet with constant memory usage
            streaming_reader = StreamingFileReader(file_path, chunk_size)
            
            # Get streaming reader based on file type - all use true streaming now
            if file_extension == "csv":
                reader = stream_csv_file(file_path, chunk_size, delimiter)
            elif file_extension == "json":
                # TRUE STREAMING: No longer loads entire file into memory
                reader = stream_json_file(file_path, chunk_size)
            elif file_extension == "parquet":
                # TRUE STREAMING: Uses PyArrow batch iteration
                reader = stream_parquet_file(file_path, chunk_size)
            else:
                raise ValueError(f"Unsupported file extension: {file_extension}")
            
            # Process each chunk concurrently with memory monitoring
            loop = asyncio.get_event_loop()
            chunk_futures = []
            
            # Submit chunk processing to thread pool
            for i, chunk in enumerate(reader):
                # Check memory every 10 chunks and adjust if needed
                if i > 0 and i % 10 == 0:
                    current_memory = get_memory_usage()
                    
                    # Log progress with memory status
                    file_logger.info(f"Processing chunk {i} of file {file_path}", extra={
                        "task_id": task_id,
                        "chunk": i,
                        "memory_percent": current_memory['usage_percent']
                    })
                    
                    # Check if circuit breaker opened during processing
                    can_continue, reason = check_before_processing(0)
                    if not can_continue:
                        file_logger.warning(f"Stopping processing due to memory: {reason}", extra={
                            "task_id": task_id,
                            "chunks_processed": i
                        })
                        break
                
                chunk_future = loop.run_in_executor(
                    thread_pool,
                    partial(_process_dataframe_chunk, chunk, file_extension)
                )
                chunk_futures.append(chunk_future)
            
            # Wait for all chunk processing to complete
            for future in asyncio.as_completed(chunk_futures):
                chunk_result = await future
                chunk_results.append(chunk_result)
            
            # Merge chunk results
            merged_results = await asyncio.to_thread(_merge_chunk_results, chunk_results)
            
            # Compile final file info
            full_file_info = {
                **file_info,
                "row_count": merged_results.get("row_count", 0),
                "column_count": merged_results.get("column_count", 0),
                "schema": [
                    {
                        "name": col,
                        "type": stats["type"],
                        "nullable": stats["null_count"] > 0,
                        "unique_count": stats["unique_count"],
                        "sample_values": stats["sample_values"]
                    }
                    for col, stats in merged_results.get("column_stats", {}).items()
                ],
                "processing_time_seconds": time.time() - start_time
            }
            
            # Log completion
            file_logger.info(f"Completed processing file: {file_path}", extra={
                "task_id": task_id,
                "processing_time": full_file_info["processing_time_seconds"],
                "row_count": full_file_info["row_count"]
            })
            
            return full_file_info
            
        except Exception as e:
            error_msg = f"Error processing file {file_path}: {str(e)}"
            file_logger.error(error_msg, extra={
                "task_id": task_id,
                "traceback": traceback.format_exc()
            })
            raise
    
    # Create task and store in memory
    loop = asyncio.get_event_loop()
    future = asyncio.ensure_future(process_file_task())
    
    _tasks[task_id] = {
        "future": future,
        "start_time": datetime.now().isoformat(),
        "file_path": file_path
    }
    
    return task_id, file_info


@log_execution_time(file_logger)
def process_file_chunked(file_path, file_extension, delimiter=",", chunk_size=10000):
    """
    Process a file in chunks for better memory efficiency.
    This is a synchronous version that can be called from existing code.
    
    Args:
        file_path (str): Path to the file
        file_extension (str): File extension
        delimiter (str): Delimiter for CSV files
        chunk_size (int): Size of chunks to process
    
    Returns:
        dict: File information
    """
    # Get basic file info
    file_info = {
        "file_path": file_path,
        "extension": file_extension,
        "last_modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
        "size_bytes": os.path.getsize(file_path)
    }
    
    try:
        # Use streaming processors for all file types - constant memory usage
        if file_extension == "csv":
            reader = stream_csv_file(file_path, chunk_size, delimiter)
        elif file_extension == "json":
            # TRUE STREAMING: No longer loads entire file into memory
            reader = stream_json_file(file_path, chunk_size)
        elif file_extension == "parquet":
            # TRUE STREAMING: Uses PyArrow batch iteration  
            reader = stream_parquet_file(file_path, chunk_size)
        else:
            raise ValueError(f"Unsupported file extension: {file_extension}")
        
        # Process chunks in parallel using process pool
        chunk_results = []
        for i, chunk in enumerate(reader):
            # Log progress
            if i % 10 == 0:
                file_logger.info(f"Processing chunk {i} of file {file_path}")
            
            # Process the chunk
            chunk_result = _process_dataframe_chunk(chunk, file_extension)
            chunk_results.append(chunk_result)
        
        # Merge chunk results
        merged_results = _merge_chunk_results(chunk_results)
        
        # Compile final file info
        full_file_info = {
            **file_info,
            "row_count": merged_results.get("row_count", 0),
            "column_count": merged_results.get("column_count", 0),
            "schema": [
                {
                    "name": col,
                    "type": stats["type"],
                    "nullable": stats["null_count"] > 0,
                    "unique_count": stats["unique_count"],
                    "sample_values": stats["sample_values"]
                }
                for col, stats in merged_results.get("column_stats", {}).items()
            ]
        }
        
        return full_file_info
        
    except Exception as e:
        error_msg = f"Error processing file {file_path}: {str(e)}"
        file_logger.error(error_msg, extra={
            "traceback": traceback.format_exc()
        })
        raise


def load_file_chunked(file_path, file_extension, delimiter=","):
    """
    Enhanced replacement for file_processing.load_file that uses chunking for large files.
    
    Args:
        file_path (str): Path to the file
        file_extension (str): File extension (csv, json, parquet)
        delimiter (str): Delimiter for CSV files (default: ",")
    
    Returns:
        tuple: (DataFrame, file_info)
    """
    # Log file loading
    file_logger.info(f"Loading file: {file_path}", extra={"file_size": os.path.getsize(file_path)})
    
    # For files smaller than 100MB, just use the original function
    if os.path.getsize(file_path) < 100 * 1024 * 1024:  # 100MB
        return file_processing.load_file(file_path, file_extension, delimiter)
    
    # For larger files, use chunked processing
    file_info = process_file_chunked(file_path, file_extension, delimiter)
    
    # We still need to load the DataFrame for compatibility
    try:
        if file_extension == "csv":
            df = pd.read_csv(file_path, delimiter=delimiter)
        elif file_extension == "json":
            df = pd.read_json(file_path)
        elif file_extension == "parquet":
            df = pd.read_parquet(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {file_extension}")
    except Exception as e:
        error_msg = f"Error loading DataFrame for {file_path}: {str(e)}"
        file_logger.error(error_msg, extra={
            "traceback": traceback.format_exc()
        })
        raise
    
    return df, file_info