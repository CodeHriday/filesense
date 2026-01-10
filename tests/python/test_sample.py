"""
Sample Python Tests

This test verifies the pytest configuration is working correctly.
Replace with actual tests for your Python modules.
"""

import pytest
import os
import json


class TestSampleAssertions:
    """Basic assertion tests to verify pytest is working."""
    
    def test_simple_assertion(self):
        """Test basic numeric assertion."""
        assert 1 + 1 == 2
    
    def test_string_operations(self):
        """Test string operations."""
        text = "hello world"
        assert "world" in text
        assert text.startswith("hello")
        assert len(text) == 11
    
    def test_list_operations(self):
        """Test list operations."""
        items = [1, 2, 3, 4, 5]
        assert len(items) == 5
        assert 3 in items
        assert items[0] == 1
    
    def test_dict_operations(self):
        """Test dictionary operations."""
        data = {"name": "test", "value": 123}
        assert "name" in data
        assert data["name"] == "test"
        assert data.get("missing") is None


class TestFixtures:
    """Tests demonstrating fixture usage."""
    
    def test_temp_dir_fixture(self, temp_dir):
        """Test the temp_dir fixture."""
        assert os.path.isdir(temp_dir)
        
        # Create a file in temp dir
        test_file = os.path.join(temp_dir, "test.txt")
        with open(test_file, 'w') as f:
            f.write("test content")
        
        assert os.path.exists(test_file)
    
    def test_sample_csv_content(self, sample_csv_content):
        """Test the sample CSV content fixture."""
        assert "id,name,email,age,city" in sample_csv_content
        assert "John Doe" in sample_csv_content
    
    def test_sample_json_content(self, sample_json_content):
        """Test the sample JSON content fixture."""
        data = json.loads(sample_json_content)
        assert isinstance(data, list)
        assert len(data) == 3
        assert data[0]["name"] == "John Doe"
    
    def test_temp_csv_file(self, temp_csv_file):
        """Test the temp CSV file fixture."""
        assert os.path.exists(temp_csv_file)
        assert temp_csv_file.endswith('.csv')
        
        with open(temp_csv_file, 'r') as f:
            content = f.read()
        
        assert "id,name,email,age,city" in content
    
    def test_sample_profile_data(self, sample_profile_data):
        """Test the sample profile data fixture."""
        assert sample_profile_data["file_id"] == "test-file-123"
        assert sample_profile_data["row_count"] == 100
        assert len(sample_profile_data["columns"]) == 2


class TestAsyncOperations:
    """Tests for async operations."""
    
    @pytest.mark.asyncio
    async def test_async_function(self):
        """Test async function."""
        import asyncio
        
        async def async_add(a, b):
            await asyncio.sleep(0.01)
            return a + b
        
        result = await async_add(2, 3)
        assert result == 5


class TestExceptions:
    """Tests for exception handling."""
    
    def test_raises_value_error(self):
        """Test that ValueError is raised."""
        def raise_error():
            raise ValueError("test error")
        
        with pytest.raises(ValueError) as exc_info:
            raise_error()
        
        assert "test error" in str(exc_info.value)
    
    def test_raises_key_error(self):
        """Test that KeyError is raised for missing key."""
        data = {"a": 1}
        
        with pytest.raises(KeyError):
            _ = data["missing_key"]


class TestParametrized:
    """Tests demonstrating parametrized testing."""
    
    @pytest.mark.parametrize("input,expected", [
        (1, 1),
        (2, 4),
        (3, 9),
        (4, 16),
        (5, 25),
    ])
    def test_square(self, input, expected):
        """Test square calculation with multiple inputs."""
        assert input ** 2 == expected
    
    @pytest.mark.parametrize("text,expected_length", [
        ("hello", 5),
        ("world", 5),
        ("test", 4),
        ("", 0),
    ])
    def test_string_length(self, text, expected_length):
        """Test string length with multiple inputs."""
        assert len(text) == expected_length


@pytest.mark.unit
class TestMarkers:
    """Tests demonstrating custom markers."""
    
    def test_unit_marker(self):
        """Test with unit marker."""
        assert True


@pytest.mark.slow
class TestSlowTests:
    """Slow tests that can be skipped."""
    
    def test_slow_operation(self):
        """This test is marked as slow."""
        import time
        time.sleep(0.1)
        assert True
