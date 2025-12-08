# Rust Log Service

High-performance log ingestion, compression, indexing, and retrieval service for the Data File Observatory.

## Features

- **Columnar Storage**: Uses Apache Parquet for efficient columnar storage with Zstd compression
- **Full-Text Search**: Tantivy-based indexing for fast log search
- **Bloom Filters**: Quick existence checks for job/workflow IDs
- **Tiered Storage**: Automatic lifecycle management (hot → warm → cold → archive)
- **Compression**: 5-10x compression ratio with Zstd + dictionary training
- **Fast Queries**: Millisecond-range queries with segment pruning
- **REST API**: HTTP endpoints for ingestion and querying

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Node.js App   │────▶│  Log Service API │────▶│  Storage Buffer │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌─────────────────────────────────┴─────────┐
                        ▼                                           ▼
               ┌────────────────┐                        ┌──────────────────┐
               │ Parquet Writer │                        │ Tantivy Indexer  │
               │   (Zstd + Dict)│                        │ (Full-text + ID) │
               └───────┬────────┘                        └────────┬─────────┘
                       │                                          │
           ┌───────────┴───────────┐                              │
           ▼           ▼           ▼                              ▼
    ┌───────────┐ ┌───────────┐ ┌───────────┐            ┌────────────────┐
    │  Hot Tier │ │ Warm Tier │ │ Cold Tier │            │  Search Index  │
    │  (7 days) │ │ (30 days) │ │(365 days) │            │                │
    └───────────┘ └───────────┘ └───────────┘            └────────────────┘
```

## API Endpoints

### Ingestion

```bash
# Single log
POST /api/logs
Content-Type: application/json
{
  "level": "info",
  "source": "job_execution",
  "message": "Processing started",
  "job_id": 123,
  "execution_id": "exec-456"
}

# Batch logs
POST /api/logs/batch
Content-Type: application/json
{
  "logs": [
    { "level": "info", "source": "job_execution", "message": "..." },
    { "level": "debug", "source": "transformation", "message": "..." }
  ]
}
```

### Querying

```bash
# Query by filters
POST /api/logs/query
Content-Type: application/json
{
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-02T00:00:00Z",
  "job_id": 123,
  "levels": ["info", "warn", "error"],
  "limit": 100
}

# Full-text search
POST /api/logs/search
Content-Type: application/json
{
  "search_text": "error processing file",
  "limit": 100
}
```

### Management

```bash
# Health check
GET /health

# Service statistics
GET /api/stats

# List segments
GET /api/segments

# Get specific segment
GET /api/segments/:id
```

## Building

```bash
cd rust-log-service
cargo build --release
```

## Running

```bash
# With default config
./target/release/log-service

# With environment variables
LOG_SERVICE_PORT=9000 LOG_SERVICE_DATA_DIR=./data ./target/release/log-service
```

## Integration with Node.js

```javascript
const { getLogClient } = require('./backend/services/logClient');

// Initialize client
const logClient = getLogClient({
  baseUrl: 'http://localhost:9000',
  batchSize: 100,
  flushInterval: 5000
});

// Log job execution
logClient.jobStart(jobId, 'customer_transform');
logClient.jobProgress(jobId, 'reading_source', 1000);
logClient.jobComplete(jobId, 5000, 1234);

// Log workflow execution
logClient.workflowStart(workflowId, 'daily_etl', executionId);
logClient.workflowStepComplete(workflowId, executionId, 'step1', 500);
logClient.workflowComplete(workflowId, executionId, 2000);

// Query logs
const logs = await logClient.getJobLogs(jobId);
const searchResults = await logClient.search('error processing');
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Ingestion Rate | 100,000+ logs/sec |
| Query Latency (by ID) | < 10ms |
| Query Latency (time range) | < 100ms |
| Full-text Search | < 50ms |
| Compression Ratio | 5-10x |
| Storage Efficiency | 90%+ reduction |

## Configuration

See `log-service-config.toml` for all configuration options.

Key settings:
- `segment_size_mb`: Size of each segment before rotation (default: 256MB)
- `compression_level`: Zstd compression level 1-22 (default: 6)
- `hot_retention_days`: Days to keep in hot tier (default: 7)
- `max_buffer_size`: Max logs in memory before flush (default: 100,000)
