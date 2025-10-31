import os
import pandas as pd
import json
from datetime import datetime

def load_file(file_path, file_extension, delimiter=","):
    """
    Load a file into a pandas DataFrame and extract file information.
    
    Args:
        file_path (str): Path to the file
        file_extension (str): File extension (csv, json, parquet)
        delimiter (str): Delimiter for CSV files (default: ",")
    
    Returns:
        tuple: (DataFrame, file_info)
    """
    file_info = {
        "file_path": file_path,
        "extension": file_extension,
        "last_modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
        "size_bytes": os.path.getsize(file_path)
    }
    
    df = None
    
    try:
        if file_extension == "csv":
            df = pd.read_csv(file_path, delimiter=delimiter)
        elif file_extension == "json":
            df = pd.read_json(file_path)
        elif file_extension == "parquet":
            df = pd.read_parquet(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {file_extension}")
        
        # Extract schema information
        schema = []
        for col in df.columns:
            col_info = {
                "name": col,
                "type": str(df[col].dtype),
                "nullable": df[col].isna().any(),
                "unique_count": df[col].nunique(),
                "sample_values": df[col].dropna().head(3).tolist()
            }
            schema.append(col_info)
        
        file_info["schema"] = schema
        file_info["row_count"] = len(df)
        file_info["column_count"] = len(df.columns)
        
    except Exception as e:
        raise Exception(f"Error loading file: {str(e)}")
    
    return df, file_info

def get_file_metadata(file_path):
    """
    Get metadata about a file.
    
    Args:
        file_path (str): Path to the file
    
    Returns:
        dict: File metadata
    """
    metadata = {
        "file_path": file_path,
        "file_name": os.path.basename(file_path),
        "extension": os.path.splitext(file_path)[1].lower()[1:],
        "size_bytes": os.path.getsize(file_path),
        "last_modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
        "created": datetime.fromtimestamp(os.path.getctime(file_path)).isoformat()
    }
    
    return metadata

def get_file_history(file_id, history_data=None):
    """
    Get history data for a file.
    
    Args:
        file_id (str): File ID
        history_data (dict, optional): Existing history data
    
    Returns:
        dict: History data for the file
    """
    if history_data is None:
        # In a real application, this would load from a database
        history_file = os.path.join("data", "history.json")
        
        if os.path.exists(history_file):
            with open(history_file, "r") as f:
                history_data = json.load(f)
        else:
            history_data = {}
    
    return history_data.get(file_id, {})

def update_file_history(file_id, metadata, history_data=None):
    """
    Update history data for a file.
    
    Args:
        file_id (str): File ID
        metadata (dict): File metadata
        history_data (dict, optional): Existing history data
    
    Returns:
        dict: Updated history data
    """
    if history_data is None:
        # In a real application, this would load from a database
        history_file = os.path.join("data", "history.json")
        
        if os.path.exists(history_file):
            with open(history_file, "r") as f:
                history_data = json.load(f)
        else:
            history_data = {}
    
    if file_id not in history_data:
        history_data[file_id] = []
    
    # Add current metadata to history
    metadata["timestamp"] = datetime.now().isoformat()
    history_data[file_id].append(metadata)
    
    # Save history data
    history_file = os.path.join("data", "history.json")
    with open(history_file, "w") as f:
        json.dump(history_data, f, indent=2)
    
    return history_data
