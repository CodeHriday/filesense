import os
import time
import json
from datetime import datetime

def format_size(size_bytes):
    """
    Format a file size in bytes to a human-readable string.
    
    Args:
        size_bytes (int): Size in bytes
    
    Returns:
        str: Formatted size string
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"

def get_file_extension(filename):
    """
    Get the extension of a file.
    
    Args:
        filename (str): File name
    
    Returns:
        str: File extension (lowercase)
    """
    return os.path.splitext(filename)[1].lower()[1:]

def timestamp_to_readable(timestamp):
    """
    Convert a timestamp to a human-readable string.
    
    Args:
        timestamp (str): ISO format timestamp
    
    Returns:
        str: Human-readable time string
    """
    try:
        dt = datetime.fromisoformat(timestamp)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return "Unknown"

def elapsed_time_readable(timestamp):
    """
    Calculate elapsed time from a timestamp and return a human-readable string.
    
    Args:
        timestamp (str): ISO format timestamp
    
    Returns:
        str: Human-readable elapsed time string
    """
    try:
        dt = datetime.fromisoformat(timestamp)
        now = datetime.now()
        
        diff = now - dt
        seconds = diff.total_seconds()
        
        if seconds < 60:
            return f"{int(seconds)} seconds ago"
        elif seconds < 3600:
            return f"{int(seconds / 60)} minutes ago"
        elif seconds < 86400:
            return f"{int(seconds / 3600)} hours ago"
        elif seconds < 2592000:  # 30 days
            return f"{int(seconds / 86400)} days ago"
        elif seconds < 31536000:  # 365 days
            return f"{int(seconds / 2592000)} months ago"
        else:
            return f"{int(seconds / 31536000)} years ago"
    except (ValueError, TypeError):
        return "Unknown"

def generate_schema_diff(old_schema, new_schema):
    """
    Generate a human-readable description of schema changes.
    
    Args:
        old_schema (list): Old schema (list of column dictionaries)
        new_schema (list): New schema (list of column dictionaries)
    
    Returns:
        list: List of change descriptions
    """
    if not old_schema or not new_schema:
        return ["Schema information is incomplete"]
    
    old_cols = {col["name"]: col for col in old_schema}
    new_cols = {col["name"]: col for col in new_schema}
    
    changes = []
    
    # Added columns
    added = [col for col in new_cols if col not in old_cols]
    if added:
        changes.append(f"Added {len(added)} columns: {', '.join(added)}")
    
    # Removed columns
    removed = [col for col in old_cols if col not in new_cols]
    if removed:
        changes.append(f"Removed {len(removed)} columns: {', '.join(removed)}")
    
    # Modified columns
    modified = []
    for col_name in set(old_cols.keys()) & set(new_cols.keys()):
        old_col = old_cols[col_name]
        new_col = new_cols[col_name]
        
        if old_col["type"] != new_col["type"]:
            modified.append(f"{col_name} (type changed from {old_col['type']} to {new_col['type']})")
    
    if modified:
        changes.append(f"Modified {len(modified)} columns: {', '.join(modified)}")
    
    if not changes:
        changes.append("No schema changes detected")
    
    return changes

def generate_file_checksum(file_path):
    """
    Generate a checksum for a file.
    
    Args:
        file_path (str): Path to the file
    
    Returns:
        str: Checksum string
    """
    import hashlib
    
    if not os.path.exists(file_path):
        return None
    
    # Generate MD5 hash
    hash_md5 = hashlib.md5()
    
    with open(file_path, "rb") as f:
        # Read in chunks to handle large files
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    
    return hash_md5.hexdigest()

def validate_file_format(filename, allowed_formats):
    """
    Validate if a file has an allowed format.
    
    Args:
        filename (str): File name
        allowed_formats (list): List of allowed file extensions
    
    Returns:
        bool: True if format is allowed, False otherwise
    """
    extension = get_file_extension(filename)
    return extension in allowed_formats
