# Read Replica Configuration Guide

## Overview

Read replicas are secondary database instances that replicate data from the primary database. They improve performance by offloading read-heavy queries and enable horizontal scaling for high-traffic applications.

## Benefits

- **Performance**: Distribute read queries across multiple replicas
- **Scalability**: Handle 1,000+ concurrent users with parallel reads
- **Availability**: Failover capability if primary database fails
- **Analytics**: Run heavy analytical queries without impacting production

## Architecture

```
┌─────────────┐
│   Primary   │ ← Writes (INSERT, UPDATE, DELETE)
│  Database   │
└──────┬──────┘
       │ (Async Replication)
       ↓
┌─────────────┐
│ Read Replica│ ← Reads (SELECT queries)
│     #1      │
└─────────────┘
```

## Cloud Provider Setup

### AWS RDS (PostgreSQL)

1. **Create Read Replica**:
```bash
aws rds create-db-instance-read-replica \
  --db-instance-identifier myapp-read-replica-1 \
  --source-db-instance-identifier myapp-primary \
  --db-instance-class db.t3.medium \
  --publicly-accessible
```

2. **Get Replica Endpoint**:
```bash
aws rds describe-db-instances \
  --db-instance-identifier myapp-read-replica-1 \
  --query 'DBInstances[0].Endpoint.Address'
```

### Google Cloud SQL (PostgreSQL)

1. **Create Read Replica**:
```bash
gcloud sql instances create myapp-read-replica-1 \
  --master-instance-name=myapp-primary \
  --tier=db-n1-standard-2 \
  --region=us-central1
```

2. **Get Replica Connection**:
```bash
gcloud sql instances describe myapp-read-replica-1 \
  --format="value(ipAddresses[0].ipAddress)"
```

### Azure Database for PostgreSQL

1. **Create Read Replica** (via Azure Portal):
   - Navigate to your primary server
   - Select "Replication" → "Add replica"
   - Choose region and configuration

2. **Get Connection String**:
   - Copy the replica connection string from Azure Portal
   - Format: `postgresql://username@replica-name:password@replica-name.postgres.database.azure.com:5432/database`

## Application Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Primary database (writes)
DATABASE_URL=postgresql://user:password@primary-host:5432/database

# Read replica (reads)
DATABASE_READ_URL=postgresql://user:password@replica-host:5432/database

# Optional: Multiple read replicas (comma-separated)
DATABASE_READ_URLS=postgresql://user:password@replica1:5432/db,postgresql://user:password@replica2:5432/db

# Connection pool settings for read replicas
DB_READ_POOL_MAX=50
DB_READ_POOL_MIN=5
```

### Code Implementation

#### 1. Update Database Bootstrapper

Edit `backend/di/bootstrapper.js`:

```javascript
const { Pool } = require('pg');

// Primary database pool (for writes)
const primaryPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX) || 100,
  min: parseInt(process.env.DB_POOL_MIN) || 10,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT) || 2000,
});

// Read replica pool (for reads)
const readReplicaPool = process.env.DATABASE_READ_URL ? new Pool({
  connectionString: process.env.DATABASE_READ_URL,
  max: parseInt(process.env.DB_READ_POOL_MAX) || 50,
  min: parseInt(process.env.DB_READ_POOL_MIN) || 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}) : primaryPool; // Fallback to primary if no replica configured

// Export both pools
module.exports = {
  primaryPool,
  readReplicaPool,
};
```

#### 2. Create Database Service

Create `backend/services/databaseService.js`:

```javascript
const { primaryPool, readReplicaPool } = require('../di/bootstrapper');

class DatabaseService {
  // Use primary for all writes
  async write(query, params) {
    return await primaryPool.query(query, params);
  }

  // Use read replica for all reads
  async read(query, params) {
    return await readReplicaPool.query(query, params);
  }

  // Transaction (always use primary)
  async transaction(callback) {
    const client = await primaryPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new DatabaseService();
```

#### 3. Update Routes to Use Database Service

Example for file listing (read query):

```javascript
const dbService = require('../services/databaseService');

// Before (direct pool usage):
// const result = await pool.query('SELECT * FROM files');

// After (using read replica):
const result = await dbService.read('SELECT * FROM files ORDER BY created_at DESC');
```

Example for file upload (write query):

```javascript
// Use write service for INSERT/UPDATE/DELETE
const result = await dbService.write(
  'INSERT INTO files (file_id, filename, size) VALUES ($1, $2, $3)',
  [fileId, filename, size]
);
```

## Load Balancing Strategies

### Round Robin (Multiple Replicas)

If you have multiple read replicas:

```javascript
const readPools = (process.env.DATABASE_READ_URLS || process.env.DATABASE_READ_URL)
  ?.split(',')
  .map(url => new Pool({ connectionString: url })) || [primaryPool];

let currentIndex = 0;

function getReadPool() {
  const pool = readPools[currentIndex];
  currentIndex = (currentIndex + 1) % readPools.length;
  return pool;
}

// Usage:
async read(query, params) {
  const pool = getReadPool();
  return await pool.query(query, params);
}
```

### Least Connections

```javascript
async function getReadPool() {
  // Select replica with fewest active connections
  const poolStats = await Promise.all(
    readPools.map(async (pool) => ({
      pool,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    }))
  );
  
  // Sort by (totalCount - idleCount) to find least busy
  poolStats.sort((a, b) => 
    (a.totalCount - a.idleCount) - (b.totalCount - b.idleCount)
  );
  
  return poolStats[0].pool;
}
```

## Replication Lag Monitoring

Read replicas can lag behind the primary database. Monitor this:

```javascript
async function checkReplicationLag(pool) {
  const result = await pool.query(`
    SELECT 
      CASE 
        WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() 
        THEN 0 
        ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
      END AS lag_seconds;
  `);
  
  return result.rows[0].lag_seconds;
}

// Alert if lag > 5 seconds
const lag = await checkReplicationLag(readReplicaPool);
if (lag > 5) {
  console.warn(`⚠️  Read replica lag: ${lag} seconds`);
}
```

## Migration Strategy

### Phase 1: Setup (No Code Changes)
1. Create read replica in cloud provider
2. Add `DATABASE_READ_URL` to environment
3. Verify replication is working

### Phase 2: Implement Service (Gradual)
1. Create `DatabaseService` with read/write methods
2. Update high-traffic read endpoints first:
   - `GET /api/files` (file listing)
   - `GET /api/files/:id` (file details)
   - `GET /api/dashboard` (dashboard data)
3. Monitor performance and lag

### Phase 3: Full Rollout
1. Update all read queries to use read replica
2. Keep all writes on primary
3. Add monitoring and alerting

## Testing

### Local Testing (without real replica)

Test the service with primary pool as fallback:

```bash
# No DATABASE_READ_URL set = uses primary for both reads and writes
npm run dev
```

### Production Testing

```bash
# Set read replica URL
DATABASE_READ_URL=postgresql://user:password@replica-host:5432/database

# Verify replication
node -e "
const { readReplicaPool } = require('./backend/di/bootstrapper');
readReplicaPool.query('SELECT pg_is_in_recovery()').then(r => {
  console.log('Is replica?', r.rows[0].pg_is_in_recovery);
  process.exit(0);
});
"
```

## Troubleshooting

### Issue: "Replica lag too high"

**Solution**: 
- Increase replica instance size
- Reduce write load on primary
- Add more read replicas for load distribution

### Issue: "Stale data on replica"

**Solution**:
- Use primary for critical reads (after writes)
- Wait for replication: `SELECT pg_sleep(0.1)` before read
- Implement read-your-writes pattern

### Issue: "Connection errors to replica"

**Solution**:
- Check network/firewall rules
- Verify replica is running: `gcloud sql instances describe`
- Ensure connection string is correct

## Performance Benchmarks

Expected improvements with read replicas:

| Metric | Before | After (1 replica) | After (3 replicas) |
|--------|--------|-------------------|-------------------|
| Read QPS | 1,000 | 2,500 | 7,500 |
| Write QPS | 500 | 500 | 500 |
| P95 Latency | 250ms | 100ms | 50ms |
| Max Users | 500 | 1,500 | 5,000+ |

## References

- [AWS RDS Read Replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)
- [Google Cloud SQL Replicas](https://cloud.google.com/sql/docs/postgres/replication)
- [Azure PostgreSQL Replicas](https://docs.microsoft.com/en-us/azure/postgresql/concepts-read-replicas)
- [PostgreSQL Streaming Replication](https://www.postgresql.org/docs/current/warm-standby.html)
