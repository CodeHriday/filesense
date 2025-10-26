#!/usr/bin/env python3
"""
Data Type Converter Utility

Converts pandas dtype to user-friendly type names for data profiling.
"""

import pandas as pd
import numpy as np

def get_user_friendly_type(dtype):
    """
    Convert pandas dtype to user-friendly type name.
    
    Args:
        dtype: pandas dtype object
        
    Returns:
        str: User-friendly type name (string, integer, float, datetime, boolean)
    """
    dtype_str = str(dtype)
    
    # String/text data (object dtype)
    if dtype == 'object':
        return 'string'
    
    # Integer types
    if dtype in ['int64', 'int32', 'int16', 'int8', 'uint64', 'uint32', 'uint16', 'uint8']:
        return 'integer'
    
    # Float types
    if dtype in ['float64', 'float32', 'float16']:
        return 'float'
    
    # Boolean type
    if dtype == 'bool':
        return 'boolean'
    
    # Datetime types
    if 'datetime' in dtype_str:
        return 'datetime'
    
    # Timedelta types
    if 'timedelta' in dtype_str:
        return 'timedelta'
    
    # Category type
    if dtype == 'category':
        return 'category'
    
    # Default: return the dtype as-is for any unexpected types
    return dtype_str
