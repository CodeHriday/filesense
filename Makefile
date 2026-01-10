# Makefile for Test Commands
# Use these commands to run tests and generate coverage reports for SonarQube

.PHONY: test test-backend test-frontend test-python test-all coverage clean

# Run all tests
test: test-backend test-frontend test-python

# Backend tests (Jest)
test-backend:
	npx jest --config jest.config.js

test-backend-watch:
	npx jest --config jest.config.js --watch

test-backend-coverage:
	npx jest --config jest.config.js --coverage

# Frontend tests (Vitest)
test-frontend:
	npx vitest run

test-frontend-watch:
	npx vitest

test-frontend-coverage:
	npx vitest run --coverage

# Python tests (pytest)
test-python:
	python -m pytest tests/python -v

test-python-coverage:
	python -m pytest tests/python -v --cov=. --cov-report=xml:coverage/python/coverage.xml --cov-report=html:coverage/python/htmlcov

# Run all tests with coverage (for SonarQube)
coverage: test-backend-coverage test-frontend-coverage test-python-coverage
	@echo "Coverage reports generated:"
	@echo "  - Backend:  coverage/backend/lcov.info"
	@echo "  - Frontend: coverage/frontend/lcov.info"
	@echo "  - Python:   coverage/python/coverage.xml"
	@echo ""
	@echo "Run 'sonar-scanner' to upload to SonarQube"

# CI pipeline command
test-ci: coverage

# Clean coverage directories
clean:
	rm -rf coverage/backend coverage/frontend coverage/python
	rm -rf .pytest_cache __pycache__

# Help
help:
	@echo "Available commands:"
	@echo "  make test                 - Run all tests"
	@echo "  make test-backend         - Run backend tests"
	@echo "  make test-frontend        - Run frontend tests"
	@echo "  make test-python          - Run Python tests"
	@echo "  make coverage             - Run all tests with coverage"
	@echo "  make test-ci              - Run tests for CI pipeline"
	@echo "  make clean                - Clean coverage directories"
