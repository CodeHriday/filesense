# Streamlit Frontend Archive

**Archived Date**: October 31, 2025

## What Was Archived

This directory contains the original Streamlit-based frontend for the Data File Observatory platform, which has been replaced by the React frontend.

### Archived Files

**Main Application**:
- `app.py` - Main Streamlit application with Dashboard, File Upload, Vendor Upload, Data Profile, Quality Checks, Alerts Configuration, and File Catalog pages

**Support Modules**:
- `file_processing.py` - File loading and metadata extraction utilities
- `db_operations.py` - Local JSON-based file catalog storage (replaced by PostgreSQL in React version)
- `visualization.py` - Plotly chart generators for Streamlit UI
- `utils.py` - Helper functions (format_size, timestamp formatting, etc.)

**Enhanced Utilities** (in `utils/` subdirectory):
- `async_file_processor.py` - Chunked file processing for large files
- `enhanced_profiling.py` - Profiling with logging capabilities
- `integration.py` - Async/sync wrapper for enhanced utilities
- `logger.py` - Custom logging configuration

**Configuration**:
- `.streamlit/config.toml` - Streamlit server configuration

### What Was NOT Archived (Still Active)

The following Python modules remain active because they are used by `profile_api.py`, which provides vendor file profiling services to the React backend:

- `profile_api.py` - Flask API service (port 8000) for vendor file quality profiling
- `quality_checks.py` - Quality check engine used by profile_api.py
- `data_profiling.py` - Data profiling utilities used by profile_api.py
- `utils/header_validator.py` - Header validation used by profile_api.py

**Integration Point**: The React backend (server.js) calls `profile_api.py` at line 1954 for automated vendor file profiling during upload.

## Why The Archive

The application now uses a modern React frontend with TypeScript, providing:
- Better performance and user experience
- Full integration with PostgreSQL database
- Enterprise features (RBAC, audit logging, vendor management)
- Modern UI components and real-time updates

The Streamlit version served its purpose during early development but has been superseded by the production React application.

## How to Restore (If Needed)

If you need to run the Streamlit version for any reason:

1. **Move files back to root**:
   ```bash
   cp -r archived_streamlit/* .
   ```

2. **Reinstall Streamlit dependencies**:
   Add to `pyproject.toml` dependencies:
   ```toml
   "streamlit>=1.44.1",
   "tornado>=6.5.2",
   ```
   
   Then run:
   ```bash
   uv pip install streamlit tornado
   ```

3. **Configure workflow**:
   ```bash
   # Add workflow to run Streamlit
   streamlit run app.py --server.port 5000
   ```

4. **Note**: The Streamlit version uses local JSON files for storage in the `data/` directory, not the PostgreSQL database used by the React version.

## Dependencies Removed

The following Python packages were removed from `pyproject.toml` as they were Streamlit-specific:
- `streamlit>=1.44.1`
- `tornado>=6.5.2`

All other dependencies remain as they're used by `profile_api.py` or other backend services.

## Migration Notes

- The React version stores all data in PostgreSQL instead of local JSON files
- All Streamlit pages have equivalent React components
- The vendor profiling API (`profile_api.py`) continues to work seamlessly with both versions

---

**For Questions**: Refer to the main application documentation or contact the development team.
