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
- **Streaming Processors** (`utils/streaming_processors.py`): True streaming for 10 GB+ files with constant memory usage (<1 GB)
- **Data Profiling Engine** (`data_profiling.py`): Generates comprehensive statistical profiles of datasets
- **Quality Assessment System** (`quality_checks.py`): Performs completeness, consistency, validity, and uniqueness checks
- **Asynchronous Processing** (`utils/async_file_processor.py`): Enhanced performance for large file processing with memory safeguards
- **Memory Monitoring** (`utils/memory_monitor.py`, `backend/utils/memoryMonitor.js`): Circuit breaker protection against memory exhaustion

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

## Scalability Enhancements

### Phase 1: Streaming Engine & Memory Management (Completed)
**Status**: ✅ Production-ready (October 2025)

**Achievements**:
- **10 GB File Support**: True streaming for JSON, Parquet, and CSV files
- **Constant Memory Usage**: <1 GB memory regardless of file size (vs. 20-30 GB before)
- **Circuit Breaker Protection**: Automatic rejection of requests at 85% memory to prevent crashes
- **Memory Guard**: Context manager for safe file processing operations
- **Cloud-Ready**: All code portable to AWS/GCP with zero changes

**Implementation**:
- JSON streaming with ijson library (constant ~100-500 MB memory)
- Parquet streaming with PyArrow batch iteration (constant ~200-800 MB memory)
- Enhanced CSV streaming with compression and encoding detection
- Python & Node.js memory monitoring systems
- Integrated circuit breaker pattern throughout processing pipeline

**Dependencies Added**:
- `ijson` (JSON streaming)
- `pyarrow>=19.0.1` (Parquet streaming)
- `psutil` (memory monitoring)

### Phase 2: Async Job Queue System (Completed)
**Status**: ✅ Production-ready (October 2025)

**Achievements**:
- **Non-Blocking Uploads**: File uploads return immediately with job ID
- **Background Processing**: Worker processes files asynchronously with retry logic (3 attempts with exponential backoff)
- **Job Status Tracking**: Real-time job progress monitoring via status endpoint
- **Cloud-Agnostic Queue**: Abstract queue interface supporting in-memory (Replit), BullMQ/Redis, AWS SQS, and GCP Tasks
- **Auto-Retry on Failure**: Failed jobs automatically retry with configurable delays (5s, 10s, 20s)

**Implementation**:
- Queue factory pattern with pluggable backends (`backend/queue/queueFactory.js`)
- File processing worker with Python integration (`backend/workers/fileProcessingWorker.js`)
- Job status API endpoint (`GET /api/files/:fileId/job-status`)
- Async upload endpoint (`POST /api/files/upload`)
- PYTHONPATH configuration for seamless Python module imports

**Dependencies Added**:
- `bullmq` (Redis-backed job queue - optional)
- Queue abstraction layer (in-memory fallback for Replit)

### Phase 2.1: Production Enhancements (Completed)
**Status**: ✅ Production-ready (October 2025)

**Achievements**:
- **Automatic File Cleanup**: Uploaded files automatically deleted after processing to prevent storage bloat
- **Queue Metrics Endpoint**: Real-time monitoring of queue performance and health (`GET /api/queue/metrics`)
- **Comprehensive Configuration**: Documented environment variables and deployment configurations

**Implementation**:
- File cleanup with quarantine option for failed uploads (`backend/workers/fileProcessingWorker.js`)
- Metrics tracking in queue: success rate, processing time, retry counts (`backend/queue/MemoryQueue.js`)
- Configuration documentation covering all queue backends and deployment scenarios (`docs/CONFIGURATION.md`)

**Features**:
- **Metrics Available**:
  - Total jobs processed (success/failure counts)
  - Success rate percentage
  - Average processing time in milliseconds
  - Queue state breakdown (waiting, active, completed, failed, delayed)
  - Queue uptime (human-readable format)
- **Configurable Cleanup**:
  - `CLEANUP_FILES=true` (default): Delete files after processing
  - `CLEANUP_FILES=false`: Keep files for debugging
  - `QUARANTINE_FAILED=true`: Move failed files to quarantine folder

### Phase 3: Database Optimization (In Progress)
**Status**: 🔄 In Progress (October 2025)

**Completed**:
- **Connection Pool Scaling**: Increased from 10 to 100 connections with production-optimized settings
- **Performance Indexes**: Created 19 indexes for optimized query performance

**Implementation**:
- Database pool configuration in DI container (`backend/di/bootstrapper.js`)
- Configurable via environment variables: DB_POOL_MAX, DB_POOL_MIN, DB_IDLE_TIMEOUT, DB_CONNECT_TIMEOUT
- Added pool metrics logging on startup
- Automated index migration (`backend/migrations/addPerformanceIndexes.js`)
  - 9 foreign key indexes (JOIN optimization)
  - 5 filter indexes (WHERE clause optimization)
  - 5 sort indexes (ORDER BY optimization)

**In Progress**:
- Read replica configuration documentation

### Future Phases (Planned)
- **Phase 4**: Multi-layer caching (Redis + in-memory)
- **Phase 5**: Cloud deployment configs (Docker, AWS/GCP documentation)

## Changelog

```
Changelog:
- October 12, 2025. Phase 2.1: Production enhancements - file cleanup, queue metrics, configuration docs
- October 12, 2025. Phase 2: Async job queue system complete - non-blocking uploads with background processing
- October 12, 2025. Phase 1: Streaming engine & memory management complete - 10 GB file support
- June 27, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```