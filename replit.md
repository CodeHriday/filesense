# Data File Observatory

## Overview

Data File Observatory is a comprehensive data quality monitoring and observability platform that combines Python-based analytics with a modern web interface. The system enables users to upload, analyze, and monitor data files with advanced quality checks, profiling capabilities, and visualization features.

## System Architecture

### Hybrid Architecture
The application employs a hybrid architecture combining:
- **Python/Streamlit Backend**: Core data processing, quality analysis, and file operations
- **Node.js/Express API Server**: REST API layer for web frontend communication
- **React Frontend**: Modern web interface built with Vite
- **PostgreSQL Database**: Persistent storage for metadata, user management, and business processes
- **File Storage**: Local file system with support for cloud storage (AWS S3, Google Cloud, Azure)

## Key Components

### Data Processing Layer
- **File Processing Module** (`file_processing.py`): Handles CSV, JSON, and Parquet file loading and schema extraction
- **Data Profiling Engine** (`data_profiling.py`): Generates comprehensive statistical profiles of datasets
- **Quality Assessment System** (`quality_checks.py`): Performs completeness, consistency, validity, and uniqueness checks
- **Asynchronous Processing** (`utils/async_file_processor.py`): Enhanced performance for large file processing

### Web Interface Layer
- **React Frontend**: TypeScript-based SPA with modern UI components
- **Vite Build System**: Fast development and production builds
- **Chart.js Integration**: Data visualization capabilities
- **Drag-and-Drop File Upload**: User-friendly file handling

### API Layer
- **Express.js Server**: RESTful API with JWT authentication
- **Multer File Upload**: Handles large file uploads (up to 1GB)
- **Rate Limiting**: Security middleware for API protection
- **CORS Configuration**: Cross-origin request handling

### Database Layer
- **PostgreSQL**: Primary database for structured data
- **User Management**: Authentication and authorization system
- **File Catalog**: Metadata storage for processed files
- **Business Process Management**: Organizational features (currently disabled)

### Logging and Monitoring
- **Structured Logging** (`utils/logger.py`): Comprehensive logging with file rotation
- **Performance Monitoring**: Execution time tracking and metrics
- **Error Handling**: Robust error management across all layers

## Data Flow

1. **File Upload**: Users upload files through React frontend or Streamlit interface
2. **Processing Pipeline**: Files are processed asynchronously with schema detection and profiling
3. **Quality Analysis**: Automated quality checks assess data completeness and consistency
4. **Metadata Storage**: File information and analysis results stored in PostgreSQL
5. **Visualization**: Results displayed through interactive charts and dashboards
6. **Monitoring**: Continuous monitoring of file quality metrics and system performance

## External Dependencies

### Core Technologies
- **Python 3.11+**: Primary runtime for data processing
- **Node.js 20**: JavaScript runtime for API server
- **PostgreSQL 16**: Database management system
- **React 18**: Frontend framework

### Key Libraries
- **Data Processing**: pandas, numpy, plotly
- **Web Framework**: Express.js, Streamlit
- **Database**: pg (PostgreSQL client)
- **Authentication**: bcrypt, jsonwebtoken
- **File Handling**: multer, AWS SDK
- **Development**: TypeScript, ESLint, Prettier

### Cloud Storage Support
- AWS S3 integration
- Google Cloud Storage
- Azure Blob Storage

## Deployment Strategy

### Development Environment
- **Replit Configuration**: Optimized for Replit development environment
- **Hot Reload**: Vite dev server with HMR for frontend development
- **Parallel Execution**: Simultaneous frontend and backend development servers

### Production Considerations
- **Autoscale Deployment**: Configured for automatic scaling
- **Environment Variables**: Comprehensive configuration management
- **Security Headers**: Helmet.js for security hardening
- **Rate Limiting**: API protection against abuse

### Database Migration
- **Schema Management**: Structured table creation scripts
- **Business Process Tables**: Prepared but currently disabled
- **Data Integrity**: Foreign key constraints and validation

## Changelog

```
Changelog:
- June 27, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```