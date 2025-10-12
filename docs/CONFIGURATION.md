# Data File Observatory - Configuration Guide

## Environment Variables

### Required Variables

#### Database Configuration
```bash
DATABASE_URL=postgresql://user:password@host:port/database
PGHOST=hostname              # PostgreSQL host
PGPORT=5432                  # PostgreSQL port
PGUSER=username              # PostgreSQL username
PGPASSWORD=password          # PostgreSQL password
PGDATABASE=dbname            # PostgreSQL database name
```

#### Authentication
```bash
JWT_SECRET=your-secret-key   # JWT signing secret (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```

### Optional Variables

#### Queue Configuration
```bash
# Queue type selection (default: memory)
QUEUE_TYPE=memory            # Options: memory | redis | sqs | gcp-tasks

# Redis Queue (when QUEUE_TYPE=redis)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=yourpassword  # Optional, if Redis requires auth

# AWS SQS Queue (when QUEUE_TYPE=sqs)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue

# GCP Tasks Queue (when QUEUE_TYPE=gcp-tasks)
GCP_PROJECT_ID=your-project
GCP_LOCATION=us-central1
GCP_QUEUE_NAME=file-processing
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

#### File Processing
```bash
# File cleanup after processing (default: true)
CLEANUP_FILES=true           # Set to 'false' to keep files for debugging
QUARANTINE_FAILED=false      # Set to 'true' to move failed files to quarantine/

# File upload limits
FILE_SIZE_LIMIT=1073741824   # 1GB in bytes (default)
```

#### Machine Learning
```bash
HUGGING_FACE_TOKEN=hf_...    # For Hugging Face model downloads
```

#### Storage Providers
```bash
# AWS S3
AWS_S3_BUCKET=your-bucket
AWS_S3_REGION=us-east-1

# Google Cloud Storage
GCS_BUCKET=your-bucket
GCS_PROJECT_ID=your-project

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT=account
AZURE_STORAGE_KEY=key
AZURE_CONTAINER=container
```

#### Application Settings
```bash
NODE_ENV=development         # development | production
PORT=3000                    # API server port
LOG_LEVEL=info              # error | warn | info | debug
```

## Queue Configuration

### Queue Type Selection

The application supports multiple queue backends through the `QUEUE_TYPE` environment variable:

#### 1. Memory Queue (Default)
**Best for**: Development, testing, single-server deployments

```bash
QUEUE_TYPE=memory
```

**Characteristics**:
- ✅ No external dependencies
- ✅ Fast, zero setup
- ✅ Built-in metrics and monitoring
- ❌ Jobs lost on restart
- ❌ Single process only
- ❌ Not suitable for multi-server deployments

**Metrics Available**: `/api/queue/metrics`
- Total jobs processed
- Success/failure counts
- Success rate percentage
- Average processing time
- Current queue state (waiting, active, completed, failed, delayed)
- Queue uptime

#### 2. Redis Queue (BullMQ)
**Best for**: Production, multi-server deployments, job persistence

```bash
QUEUE_TYPE=redis
REDIS_URL=redis://localhost:6379
```

**Characteristics**:
- ✅ Jobs persisted across restarts
- ✅ Multi-server support
- ✅ Advanced retry strategies
- ✅ Job scheduling and delayed jobs
- ✅ Built-in monitoring UI (Bull Board)
- ⚙️ Requires Redis server

**Setup**:
1. Install Redis locally or use cloud Redis (AWS ElastiCache, Redis Cloud, etc.)
2. Set `QUEUE_TYPE=redis` and `REDIS_URL`
3. Jobs automatically persist and survive restarts

#### 3. AWS SQS Queue
**Best for**: AWS deployments, serverless architectures

```bash
QUEUE_TYPE=sqs
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue
```

**Characteristics**:
- ✅ Fully managed, no server maintenance
- ✅ Automatic scaling
- ✅ Pay-per-use pricing
- ✅ Integrates with AWS ecosystem
- ⚙️ Requires AWS account and SQS queue setup

#### 4. Google Cloud Tasks
**Best for**: GCP deployments, serverless architectures

```bash
QUEUE_TYPE=gcp-tasks
GCP_PROJECT_ID=your-project
GCP_LOCATION=us-central1
GCP_QUEUE_NAME=file-processing
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Characteristics**:
- ✅ Fully managed by Google Cloud
- ✅ Automatic scaling and load balancing
- ✅ HTTP target tasks
- ✅ Integrates with GCP ecosystem
- ⚙️ Requires GCP project and queue setup

### Queue Switching

**Zero code changes required!** Switch between queue backends by changing environment variables only:

```bash
# Development with in-memory queue
QUEUE_TYPE=memory

# Production with Redis
QUEUE_TYPE=redis
REDIS_URL=redis://production-redis:6379

# AWS deployment
QUEUE_TYPE=sqs
AWS_REGION=us-east-1
# ... AWS credentials
```

### Queue Metrics Endpoint

Monitor queue health and performance:

```bash
# Get all metrics
GET /api/queue/metrics

# Get specific queue metrics
GET /api/queue/metrics?queueName=file-processing
```

**Response Example**:
```json
{
  "timestamp": "2025-10-12T05:30:11.870Z",
  "queueType": "memory",
  "metrics": {
    "totalProcessed": 150,
    "totalSucceeded": 148,
    "totalFailed": 2,
    "totalRetries": 3,
    "successRate": "98.67%",
    "averageProcessingTimeMs": 2453,
    "uptimeMs": 3600000,
    "uptimeHuman": "1h 0m",
    "queues": {
      "file-processing": {
        "waiting": 5,
        "active": 2,
        "completed": 140,
        "failed": 2,
        "delayed": 1,
        "total": 150
      }
    }
  }
}
```

## File Processing Configuration

### File Cleanup

Control what happens to uploaded files after processing:

```bash
# Delete files after successful processing (default)
CLEANUP_FILES=true

# Keep files for debugging
CLEANUP_FILES=false

# Move failed files to quarantine folder
QUARANTINE_FAILED=true
```

**Behavior**:
- `CLEANUP_FILES=true` (default): Files deleted after successful processing
- `CLEANUP_FILES=false`: Files kept in `uploads/` folder
- `QUARANTINE_FAILED=true`: Failed files moved to `quarantine/` folder instead of deletion

### Upload Limits

```bash
# Maximum file size (1GB default)
FILE_SIZE_LIMIT=1073741824

# Supported formats: CSV, JSON, Parquet
```

## Deployment Configurations

### Replit Development
```bash
NODE_ENV=development
QUEUE_TYPE=memory
CLEANUP_FILES=false
LOG_LEVEL=debug
```

### Production (Single Server)
```bash
NODE_ENV=production
QUEUE_TYPE=redis
REDIS_URL=redis://production-redis:6379
CLEANUP_FILES=true
QUARANTINE_FAILED=true
LOG_LEVEL=info
FILE_SIZE_LIMIT=1073741824
```

### Production (AWS Multi-Server)
```bash
NODE_ENV=production
QUEUE_TYPE=sqs
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/...
CLEANUP_FILES=true
QUARANTINE_FAILED=true
LOG_LEVEL=warn
FILE_SIZE_LIMIT=10737418240  # 10GB
```

### Production (GCP Multi-Server)
```bash
NODE_ENV=production
QUEUE_TYPE=gcp-tasks
GCP_PROJECT_ID=my-project
GCP_LOCATION=us-central1
GCP_QUEUE_NAME=file-processing
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-key.json
CLEANUP_FILES=true
LOG_LEVEL=warn
```

## Migration Guide

### From In-Memory to Redis

1. **Install Redis**:
   ```bash
   # Docker
   docker run -d -p 6379:6379 redis:alpine
   
   # Or use cloud Redis (recommended for production)
   ```

2. **Update environment**:
   ```bash
   QUEUE_TYPE=redis
   REDIS_URL=redis://localhost:6379
   ```

3. **Restart application** - no code changes needed!

### From Redis to AWS SQS

1. **Create SQS queue in AWS Console**

2. **Update environment**:
   ```bash
   QUEUE_TYPE=sqs
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456/my-queue
   ```

3. **Restart application** - no code changes needed!

## Monitoring

### Health Check
```bash
GET /api/health
```

### Queue Metrics
```bash
GET /api/queue/metrics
```

### Log Files
- Application logs: Winston logger with file rotation
- Location: `logs/` directory
- Levels: error, warn, info, debug

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use strong JWT secrets** (64+ random bytes)
3. **Enable HTTPS** in production
4. **Set appropriate CORS** origins
5. **Use environment-specific** `.env` files:
   - `.env.development`
   - `.env.production`
   - `.env.test`

## Troubleshooting

### Queue not processing jobs
1. Check worker is started: Look for "🚀 File processing worker started" in logs
2. Verify queue type: Check `QUEUE_TYPE` environment variable
3. For Redis: Ensure Redis is running and accessible

### Files not being cleaned up
1. Check `CLEANUP_FILES` environment variable
2. Look for "Uploaded file cleaned up" in logs
3. Check file permissions on uploads directory

### High memory usage
1. Files use streaming processors (constant <1GB memory)
2. Check circuit breaker logs for memory warnings
3. Reduce `FILE_SIZE_LIMIT` if needed

### Metrics showing 0
- Completed jobs auto-remove after 5 seconds
- Check metrics immediately after upload
- Historical metrics persist in `totalProcessed` count
