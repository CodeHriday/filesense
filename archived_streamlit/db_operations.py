import os
import json
from datetime import datetime

# File paths
DATA_DIR = "data"
CATALOG_FILE = os.path.join(DATA_DIR, "file_catalog.json")
ALERTS_FILE = os.path.join(DATA_DIR, "alert_rules.json")
HISTORY_FILE = os.path.join(DATA_DIR, "file_history.json")

# Ensure data directory exists
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

def get_file_catalog():
    """
    Get the file catalog from the catalog file.
    
    Returns:
        list: List of file metadata dictionaries
    """
    if not os.path.exists(CATALOG_FILE):
        return []
    
    try:
        with open(CATALOG_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def add_file_to_catalog(file_data):
    """
    Add a file to the catalog.
    
    Args:
        file_data (dict): File metadata
    
    Returns:
        bool: True if successful, False otherwise
    """
    catalog = get_file_catalog()
    
    # Check if file already exists
    for i, file in enumerate(catalog):
        if file["file_id"] == file_data["file_id"]:
            # Update existing file
            catalog[i] = file_data
            break
    else:
        # Add new file
        catalog.append(file_data)
    
    try:
        with open(CATALOG_FILE, "w") as f:
            json.dump(catalog, f, indent=2)
        
        # Add to history
        add_file_to_history(file_data)
        
        return True
    except IOError:
        return False

def update_file_in_catalog(file_data):
    """
    Update a file in the catalog.
    
    Args:
        file_data (dict): File metadata
    
    Returns:
        bool: True if successful, False otherwise
    """
    catalog = get_file_catalog()
    file_id = file_data["file_id"]
    
    # Find the file in the catalog
    for i, file in enumerate(catalog):
        if file["file_id"] == file_id:
            # Update file
            catalog[i] = file_data
            
            try:
                with open(CATALOG_FILE, "w") as f:
                    json.dump(catalog, f, indent=2)
                
                # Add to history
                add_file_to_history(file_data)
                
                return True
            except IOError:
                return False
    
    return False

def delete_file_from_catalog(file_id):
    """
    Delete a file from the catalog.
    
    Args:
        file_id (str): File ID
    
    Returns:
        bool: True if successful, False otherwise
    """
    catalog = get_file_catalog()
    
    # Find the file in the catalog
    for i, file in enumerate(catalog):
        if file["file_id"] == file_id:
            # Remove file
            catalog.pop(i)
            
            try:
                with open(CATALOG_FILE, "w") as f:
                    json.dump(catalog, f, indent=2)
                return True
            except IOError:
                return False
    
    return False

def get_alert_rules():
    """
    Get alert rules from the alerts file.
    
    Returns:
        list: List of alert rule dictionaries
    """
    if not os.path.exists(ALERTS_FILE):
        return []
    
    try:
        with open(ALERTS_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_alert_rules(rules):
    """
    Save alert rules to the alerts file.
    
    Args:
        rules (list): List of alert rule dictionaries
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        with open(ALERTS_FILE, "w") as f:
            json.dump(rules, f, indent=2)
        return True
    except IOError:
        return False

def get_file_history(file_id=None):
    """
    Get file history data.
    
    Args:
        file_id (str, optional): File ID to get history for
    
    Returns:
        dict: History data (if file_id is None, returns all history)
    """
    if not os.path.exists(HISTORY_FILE):
        return {} if file_id is None else []
    
    try:
        with open(HISTORY_FILE, "r") as f:
            history = json.load(f)
            
            if file_id is not None:
                return history.get(file_id, [])
            
            return history
    except (json.JSONDecodeError, IOError):
        return {} if file_id is None else []

def add_file_to_history(file_data):
    """
    Add a file snapshot to the history.
    
    Args:
        file_data (dict): File metadata
    
    Returns:
        bool: True if successful, False otherwise
    """
    history = get_file_history()
    file_id = file_data["file_id"]
    
    # Create entry snapshot with timestamp
    snapshot = file_data.copy()
    snapshot["snapshot_time"] = datetime.now().isoformat()
    
    # Initialize history for this file if it doesn't exist
    if file_id not in history:
        history[file_id] = []
    
    # Add snapshot
    history[file_id].append(snapshot)
    
    # Keep only the last 10 snapshots
    if len(history[file_id]) > 10:
        history[file_id] = history[file_id][-10:]
    
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
        return True
    except IOError:
        return False
