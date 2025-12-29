#!/usr/bin/env python3
"""
Test script to verify virtual environment and dependencies
"""
import sys
import json

def test_imports():
    """Test importing required modules"""
    results = {
        "python_version": sys.version,
        "python_path": sys.executable,
        "imports": {}
    }
    
    # Test critical imports
    modules_to_test = [
        'numpy',
        'pandas', 
        'flask',
        'psycopg2',
        'boto3',
        'openpyxl',
        'pyarrow'
    ]
    
    for module in modules_to_test:
        try:
            __import__(module)
            results["imports"][module] = "SUCCESS"
        except ImportError as e:
            results["imports"][module] = f"FAILED: {str(e)}"
    
    return results

if __name__ == "__main__":
    try:
        results = test_imports()
        print(json.dumps(results, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2))