#!/bin/bash

# Universal Python runner that works in Replit, EC2, and other environments
# Automatically detects the best Python execution method and ensures dependencies

# Function to test if Python command works with required dependencies
test_python_dependencies() {
    local python_cmd="$1"
    $python_cmd -c "
import sys
try:
    # Test dependencies from requirements.txt
    import flask
    import flask_cors
    import pandas
    import numpy
    import boto3
    import psycopg2
    import pyzipper
    import pyreadstat
    import fastavro
    sys.exit(0)
except ImportError as e:
    sys.exit(1)
" 2>/dev/null
}

# Function to install dependencies from requirements.txt
install_dependencies() {
    local python_cmd="$1"
    if [ -f "requirements.txt" ]; then
        echo "Installing Python dependencies from requirements.txt..."
        $python_cmd -m pip install --quiet --user -r requirements.txt 2>/dev/null || true
    else
        echo "Installing core Python dependencies..."
        $python_cmd -m pip install --quiet --user \
            Flask flask-cors pandas numpy boto3 \
            google-cloud-storage azure-storage-blob \
            psycopg2-binary pyzipper pyreadstat fastavro \
            openpyxl pyarrow defusedxml pillow 2>/dev/null || true
    fi
}

# Try different Python execution strategies in order of preference
run_python() {
    # Strategy 1: If we have a virtual environment, use it
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
        if test_python_dependencies "python"; then
            python "$@"
            return $?
        fi
    fi
    
    # Strategy 2: Try python3 directly (works in Replit)
    if test_python_dependencies "python3"; then
        python3 "$@"
        return $?
    fi
    
    # Strategy 3: Try python directly
    if test_python_dependencies "python"; then
        python "$@"
        return $?
    fi
    
    # Strategy 4: Try to install dependencies and retry
    install_dependencies "python3"
    if test_python_dependencies "python3"; then
        python3 "$@"
        return $?
    fi
    
    # Strategy 5: Try with python after installing dependencies
    install_dependencies "python"
    if test_python_dependencies "python"; then
        python "$@"
        return $?
    fi
    
    # Strategy 6: Try with uv if available (modern Python package manager)
    if command -v uv >/dev/null 2>&1; then
        uv run python "$@" 2>/dev/null && return $?
    fi
    
    # Fallback: try anyway and let the error show
    echo "Warning: Some Python dependencies may be missing" >&2
    python3 "$@"
}

# Execute with error handling
run_python "$@"
