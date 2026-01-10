# Testing Guide for Data File Observatory

This document describes the testing setup for achieving code coverage in SonarQube.

## Test Structure

```
├── backend/tests/          # Backend (Node.js/Express) tests
├── src/tests/              # Frontend (React/Vitest) tests  
├── tests/python/           # Python API tests
├── coverage/               # Coverage output directory
│   ├── backend/           # Jest coverage reports (lcov.info)
│   ├── frontend/          # Vitest coverage reports (lcov.info)
│   └── python/            # pytest coverage reports (coverage.xml)
```

## Running Tests

### All Tests
```bash
make test           # Run all tests (no coverage)
make coverage       # Run all tests with coverage reports
make test-ci        # Same as coverage (for CI pipelines)
```

### Backend Tests (Jest)
```bash
make test-backend            # Run tests
make test-backend-coverage   # Run with coverage
make test-backend-watch      # Watch mode

# Or with npm:
npx jest --config jest.config.js
npx jest --config jest.config.js --coverage
```

### Frontend Tests (Vitest)
```bash
make test-frontend           # Run tests
make test-frontend-coverage  # Run with coverage
make test-frontend-watch     # Watch mode

# Or with npm:
npx vitest run
npx vitest run --coverage
npx vitest  # Watch mode
```

### Python Tests (pytest)
```bash
make test-python             # Run tests
make test-python-coverage    # Run with coverage

# Or directly:
python -m pytest tests/python -v
python -m pytest tests/python -v --cov=. --cov-report=xml:coverage/python/coverage.xml
```

## SonarQube Integration

### Configuration Files
- `sonar-project.properties` - SonarQube project configuration
- `jest.config.js` - Backend test configuration
- `vitest.config.ts` - Frontend test configuration
- `pytest.ini` - Python test configuration
- `.coveragerc` - Python coverage configuration

### Coverage Report Paths
SonarQube expects coverage reports at these locations:
- **JavaScript/TypeScript**: `coverage/backend/lcov.info`, `coverage/frontend/lcov.info`
- **Python**: `coverage/python/coverage.xml`

### Running SonarQube Analysis
```bash
# Generate all coverage reports
make coverage

# Run SonarQube scanner (requires sonar-scanner CLI)
sonar-scanner
```

## Writing Tests

### Backend Tests (Jest)
```javascript
// backend/tests/myService.test.js
describe('MyService', () => {
  test('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

### Frontend Tests (Vitest)
```typescript
// src/tests/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';

describe('MyComponent', () => {
  test('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Python Tests (pytest)
```python
# tests/python/test_my_module.py
import pytest

class TestMyModule:
    def test_something(self):
        assert result == expected
    
    def test_with_fixture(self, temp_dir):
        # temp_dir is provided by conftest.py
        assert os.path.isdir(temp_dir)
```

## Coverage Thresholds

Current thresholds are set to 0% to allow initial setup. Increase as tests are added:

| Layer    | Target | Current |
|----------|--------|---------|
| Backend  | 50%+   | 0%      |
| Frontend | 50%+   | 0%      |
| Python   | 50%+   | 0%      |

## CI/CD Integration

Add to your CI pipeline:
```yaml
# Example GitHub Actions
- name: Run tests with coverage
  run: make coverage

- name: Upload to SonarQube
  run: sonar-scanner
```

## Test Fixtures

### Backend (setup.js)
- `global.testUtils.createTestUser()`
- `global.testUtils.createTestProject()`
- `global.testUtils.createTestFile()`

### Frontend (setup.ts)
- `testUtils.createMockUser()`
- `testUtils.createMockProject()`
- `testUtils.createMockFile()`
- `testUtils.mockApiResponse()`

### Python (conftest.py)
- `temp_dir` - Temporary directory
- `temp_csv_file` - Sample CSV file
- `temp_json_file` - Sample JSON file
- `sample_profile_data` - Mock profiling data
- `mock_db_connection` - Mock database
