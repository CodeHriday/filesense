"""
Pytest Configuration and Fixtures for Python Tests

This file contains shared fixtures and configuration for all Python tests.
"""

import pytest
import os
import sys
import tempfile
import json
from unittest.mock import MagicMock, patch

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def sample_csv_content():
    """Sample CSV content for testing."""
    return """id,name,email,age,city
1,John Doe,john@example.com,30,New York
2,Jane Smith,jane@example.com,25,Los Angeles
3,Bob Johnson,bob@example.com,35,Chicago
4,Alice Brown,alice@example.com,28,Houston
5,Charlie Wilson,charlie@example.com,42,Phoenix
"""


@pytest.fixture
def sample_json_content():
    """Sample JSON content for testing."""
    return json.dumps([
        {"id": 1, "name": "John Doe", "email": "john@example.com", "age": 30},
        {"id": 2, "name": "Jane Smith", "email": "jane@example.com", "age": 25},
        {"id": 3, "name": "Bob Johnson", "email": "bob@example.com", "age": 35},
    ])


@pytest.fixture
def temp_csv_file(temp_dir, sample_csv_content):
    """Create a temporary CSV file for testing."""
    filepath = os.path.join(temp_dir, "test_data.csv")
    with open(filepath, 'w') as f:
        f.write(sample_csv_content)
    return filepath


@pytest.fixture
def temp_json_file(temp_dir, sample_json_content):
    """Create a temporary JSON file for testing."""
    filepath = os.path.join(temp_dir, "test_data.json")
    with open(filepath, 'w') as f:
        f.write(sample_json_content)
    return filepath


@pytest.fixture
def mock_db_connection():
    """Mock database connection for testing."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = None
    return mock_conn


@pytest.fixture
def mock_flask_client():
    """Create a mock Flask test client."""
    try:
        from profile_api import app
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client
    except ImportError:
        pytest.skip("profile_api module not available")


@pytest.fixture
def sample_profile_data():
    """Sample profiling data for testing."""
    return {
        "file_id": "test-file-123",
        "filename": "test.csv",
        "row_count": 100,
        "column_count": 5,
        "columns": [
            {
                "name": "id",
                "data_type": "integer",
                "null_count": 0,
                "unique_count": 100,
                "min_value": 1,
                "max_value": 100
            },
            {
                "name": "name",
                "data_type": "string",
                "null_count": 2,
                "unique_count": 98,
                "min_length": 5,
                "max_length": 50
            }
        ],
        "quality_score": 95.5
    }


@pytest.fixture
def mock_environment_variables():
    """Set up mock environment variables for testing."""
    original_env = os.environ.copy()
    
    test_env = {
        'DATABASE_URL': 'postgresql://test:test@localhost:5432/test_db',
        'NODE_ENV': 'test',
        'FLASK_ENV': 'testing',
        'DISABLE_VIRUS_SCAN': 'true',
    }
    
    os.environ.update(test_env)
    
    yield test_env
    
    # Restore original environment
    os.environ.clear()
    os.environ.update(original_env)


# Test markers
def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "slow: Slow running tests")
    config.addinivalue_line("markers", "api: API endpoint tests")


# Skip slow tests by default unless --run-slow is passed
def pytest_collection_modifyitems(config, items):
    """Modify test collection based on markers."""
    if not config.getoption("--run-slow", default=False):
        skip_slow = pytest.mark.skip(reason="need --run-slow option to run")
        for item in items:
            if "slow" in item.keywords:
                item.add_marker(skip_slow)


def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--run-slow",
        action="store_true",
        default=False,
        help="run slow tests"
    )
