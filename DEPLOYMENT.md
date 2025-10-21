# Data File Observatory - Deployment Guide

## Overview
This guide explains how to deploy the Data File Observatory React application on Replit with PostgreSQL database support.

## Quick Deployment Checklist

Before clicking "Deploy", ensure you've completed these steps:

- [ ] **Port Configuration**: Clean up `.replit` file - keep ONLY port 5000 → 80 (see Critical section below)
- [ ] **Database**: PostgreSQL database provisioned in Replit Tools
- [ ] **JWT Secret**: Generate and add `JWT_SECRET` to Replit Secrets
- [ ] **Build**: Run `npm run build` locally to verify it works
- [ ] **Deploy Config**: Build command = `npm run build`, Run command = `NODE_ENV=production npm run start`

## Architecture
- **Frontend**: React 18 + Vite (Single Page Application)
- **Backend**: Node.js/Express API server with connection retry logic
- **Database**: PostgreSQL with automatic connection pooling
- **Production Mode**: Unified server serving both React static files and API on port 5000

## Prerequisites

Before deploying, ensure you have:
1. A Replit account
2. PostgreSQL database provisioned in your Replit project

## ⚠️ CRITICAL: Port Configuration for Deployment

**Before deploying**, you MUST clean up the port configuration. Your `.replit` file currently has 9 port mappings, but Replit Autoscale deployments only support **ONE** external port.

### Required Action:

1. **Open Replit's Networking Tool**:
   - Click on the Tools menu in the left sidebar
   - Select "Networking" or "Ports"
   - You'll see a list of currently configured ports

2. **Remove All Ports Except Port 5000**:
   - Keep only: **Local Port 5000 → External Port 80**
   - Delete ALL other port configurations:
     - Port 3000 → 3000 (DELETE)
     - Port 3001 → 43147 (DELETE)
     - Port 3002 → 40547 (DELETE)
     - Port 3003 → 33595 (DELETE)
     - Port 4200 → 38399 (DELETE)
     - Port 5000 → 42003 (DELETE - duplicate)
     - Port 5173 → 43207 (DELETE)
     - Port 6000 → 36987 (DELETE)
     - Port 6800 → 46819 (DELETE)

3. **Alternative: Manually Edit `.replit` File**:
   - Open `.replit` in your editor
   - Find lines 57-96 (the `[[ports]]` sections)
   - Delete all `[[ports]]` blocks EXCEPT:
     ```toml
     [[ports]]
     localPort = 5000
     externalPort = 80
     ```

### Why This Matters:

- **Deployment will fail** if multiple ports are exposed
- The error you saw earlier ("Route / not found") was caused by port conflicts
- Replit's Autoscale deployment expects a single service on port 5000
- In production, both the React frontend AND API run from the same server

### Verification:

After cleaning up ports, your `.replit` file should have only ONE `[[ports]]` block:
```toml
[[ports]]
localPort = 5000
externalPort = 80
```

## Database Setup

### Step 1: Provision PostgreSQL Database

1. **In your Replit workspace**:
   - Click on "Tools" in the left sidebar
   - Select "PostgreSQL"
   - Click "Create Database"
   - Wait for database provisioning to complete

2. **Environment variables are auto-configured**:
   - `DATABASE_URL` - Full connection string
   - `PGHOST` - Database host
   - `PGUSER` - Database username
   - `PGPASSWORD` - Database password
   - `PGDATABASE` - Database name
   - `PGPORT` - Database port (usually 5432)

### Step 2: Verify Database Connection

In your Replit workspace, the database connection is automatically tested on server startup with:
- **5 retry attempts** with exponential backoff
- **30-second connection timeout** (production)
- **Automatic table initialization** after successful connection

You can verify the database health at any time by accessing:
```
GET /api/health/db
```

Response when healthy:
```json
{
  "status": "healthy",
  "database": {
    "healthy": true,
    "responseTime": 45,
    "poolSize": 2,
    "idleConnections": 2,
    "waitingClients": 0
  }
}
```

### Step 3: Seed Production Database

⚠️ **IMPORTANT**: After deploying for the first time, your production database will be empty. You need to seed it with essential data to be able to login.

#### Add npm Script (One-Time Setup)

First, add the seeding script to your `package.json`:

1. Open `package.json`
2. Find the `"scripts"` section
3. Add this line:
   ```json
   "seed:production": "node backend/scripts/seedProduction.js"
   ```

Your scripts section should look like:
```json
"scripts": {
  "test": "echo \"Error: no test specified\" && exit 1",
  "build": "vite build",
  "start": "node server.js",
  "dev:frontend": "vite",
  "dev:backend": "node server.js",
  "seed:production": "node backend/scripts/seedProduction.js"
},
```

#### Run the Seeding Script

After your app is deployed and running:

1. **Open the Replit Shell**
2. **Run the seeding command**:
   ```bash
   npm run seed:production
   ```

3. **What it creates**:
   - **Roles**: Admin, User, Viewer
   - **Permissions**: All necessary permissions for file management, transformations, dashboards, etc.
   - **Default Admin Account**:
     - Username: `admin`
     - Password: `Admin123!`
     - Email: `admin@dataobservatory.local`

4. **Security Best Practices**:
   - ✅ **Immediately login** and change the admin password
   - ✅ Create additional admin users if needed
   - ✅ Consider deleting the default admin after creating your own account

#### Seeding Script Features

- **Idempotent**: Safe to run multiple times (checks for existing data before inserting)
- **Transaction-safe**: All operations wrapped in database transactions
- **Production-ready**: Uses environment variables for database connection
- **Clear output**: Shows exactly what was created or skipped

#### Example Output

```
🌱 Starting production database seeding...

✅ Database connection established

📝 Seeding roles...
  ✅ Created role: Admin
  ✅ Created role: User
  ✅ Created role: Viewer

📝 Seeding permissions...
  ✅ Created permission: user:create
  ✅ Created permission: user:read
  ...

🔗 Linking roles to permissions...
  ✅ Linked all permissions to role: Admin
  ✅ Linked 10 permissions to role: User
  ✅ Linked 4 permissions to role: Viewer

👤 Seeding admin user...
  ✅ Created admin user: admin
  📧 Email: admin@dataobservatory.local
  🔑 Password: Admin123!
  ⚠️  IMPORTANT: Change the admin password immediately after first login!

================================================================================
📊 SEEDING SUMMARY
================================================================================
Roles created:       3
Roles skipped:       0
Permissions created: 20
Permissions skipped: 0
Users created:       1
Users skipped:       0
================================================================================

🔐 DEFAULT ADMIN CREDENTIALS:
   Username: admin
   Password: Admin123!

⚠️  SECURITY NOTICE:
   1. Login immediately and change the admin password
   2. Create additional admin users if needed
   3. Consider deleting the default admin after creating your own
================================================================================

✅ Seeding completed successfully!
```

#### Re-running the Seeding Script

If you run the script again after data already exists:

```bash
npm run seed:production
```

You'll see output like:
```
📝 Seeding roles...
  ⏭️  Role "Admin" already exists, skipping
  ⏭️  Role "User" already exists, skipping
  ⏭️  Role "Viewer" already exists, skipping

...

👤 Seeding admin user...
  ⏭️  Admin user "admin" already exists, skipping
```

The script is **safe to run multiple times** - it won't create duplicates.

## Build and Run Commands

### For Replit Deployment (Autoscale)

When publishing your app on Replit, use the following configuration:

**Build Command:**
```bash
npm run build
```

**Run Command:**
```bash
NODE_ENV=production npm run start
```

### What These Commands Do

1. **Build Command** (`npm run build`):
   - Runs `vite build` to compile your React application
   - Creates optimized production files in the `dist/` folder
   - Minifies JavaScript and CSS
   - Generates static HTML, CSS, and JS files

2. **Run Command** (`NODE_ENV=production npm run start`):
   - Sets `NODE_ENV=production` for production optimizations
   - Runs `node server.js` with production database pooling
   - Tests database connection with automatic retries
   - Initializes database tables
   - Serves static React files from `dist/` folder on port 5000
   - Handles API routes at `/api/*`
   - Implements SPA routing (all non-API routes → index.html)

## Production Server Configuration

The server is configured to work differently in production vs development:

### Production Mode (NODE_ENV=production)
- **Port**: Respects `process.env.PORT` (Replit provides this), defaults to 5000
- **Database**: 
  - Connection pool: 10 max connections, 2 min idle
  - 30-second connection timeout
  - 60-second idle timeout
  - SSL enabled with self-signed cert support
  - Automatic retry on connection failure (5 attempts with exponential backoff)
- **Static Files**: Served from `dist/` folder
- **Routing**: React Router with catch-all route
- **API Routes**: Remain at `/api/*`
- **Single Server**: Unified server for both frontend and backend

### Development Mode
- **Frontend**: Port **5000** (Vite dev server with HMR)
- **Backend**: Port **3000** (Express API server)
- **Database**: 
  - Connection pool: 20 max connections
  - 10-second connection timeout
  - 30-second idle timeout
- **Proxy**: Vite forwards `/api/*` requests to backend

## Environment Variables

### Auto-Configured by Replit
```bash
# Database connection (set automatically when you create a PostgreSQL database)
DATABASE_URL=postgresql://user:password@host:port/database
PGHOST=your-db-host
PGPORT=5432
PGUSER=your-db-user
PGPASSWORD=your-db-password
PGDATABASE=your-db-name

# Server port (set automatically by Replit deployment)
PORT=5000
```

### Required Manual Configuration

Add these to your Replit Secrets:

```bash
# Security (CRITICAL - generate your own!)
JWT_SECRET=<64-character-hex-string>
JWT_EXPIRATION=24h

# Environment
NODE_ENV=production
```

### Generating JWT Secret
Run this command to generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and add it to your Replit Secrets as `JWT_SECRET`.

### Optional Configuration
```bash
# Database pool settings (defaults are production-optimized)
# Note: Pool settings are automatically optimized based on NODE_ENV
# Production: 10 max connections, 2 min idle, 30s connect timeout, 60s idle timeout
# Development: 20 max connections, 0 min idle, 10s connect timeout, 30s idle timeout
```

## Deployment Steps on Replit

### 1. Prepare Database
   - Go to Tools → PostgreSQL in Replit
   - Create a database if not already created
   - Database environment variables are set automatically

### 2. Configure Secrets
   - Go to Tools → Secrets in Replit
   - Add `JWT_SECRET` with a generated value (see above)
   - Add `NODE_ENV=production`
   - Database variables are auto-configured, no manual entry needed

### 3. Test Connection
   - Run the server in development mode first:
     ```bash
     npm run dev:backend
     ```
   - Check logs for "Database connection established successfully"
   - Visit `/api/health/db` to verify database health

### 4. Build Application
   - Run build command:
     ```bash
     npm run build
     ```
   - Verify `dist/` folder is created with files

### 5. Deploy
   - Click "Deploy" button in Replit
   - Choose **Autoscale Deployment**
   - Set Build Command: `npm run build`
   - Set Run Command: `NODE_ENV=production npm run start`
   - Click "Deploy" to build and launch
   - Your app will be live at `https://your-repl.replit.app`

### 6. Monitor Deployment
   - Check deployment logs for:
     - "Database connection established successfully"
     - "Server running on port XXX"
   - Visit your deployed URL
   - Check `/api/health/db` endpoint for database status

## Project Structure

```
/
├── dist/                  # Production build output (created by vite build)
│   ├── index.html        # Entry HTML file
│   ├── assets/           # Compiled JS and CSS
│   └── images/           # Static images
├── src/                  # React source code
├── server.js             # Express server (serves API + static files in prod)
├── backend/              # Backend services and API routes
│   ├── config/
│   │   └── database.js   # Database configuration with retry logic
│   ├── di/
│   │   └── bootstrapper.js # Dependency injection container
│   └── routes/           # API route handlers
├── vite.config.js        # Vite configuration
└── package.json          # Build scripts
```

## Troubleshooting

### "Server cannot start without JWT_SECRET"
- Generate JWT secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Add to Replit Secrets as `JWT_SECRET`

### "Failed to connect to database after 5 attempts"

**Cause**: Database is not provisioned or connection details are incorrect

**Solution**:
1. Check that PostgreSQL database is created in Replit (Tools → PostgreSQL)
2. Verify `DATABASE_URL` environment variable is set
3. Check deployment logs for specific connection error
4. Try visiting `/api/health/db` to see detailed error message

**Common errors**:
- `ECONNREFUSED`: Database not running or wrong host/port
- `Connection timeout`: Network issue or firewall blocking connection
- `Authentication failed`: Wrong username/password

### Static files not loading

**Cause**: Build not completed or NODE_ENV not set to production

**Solution**:
1. Ensure `npm run build` completed successfully
2. Check that `dist/` folder exists and contains files
3. Verify `NODE_ENV=production` is set in deployment
4. Check deployment logs for "Serving static files from dist/" message

### API routes return 404

**Cause**: Routes not registered or catch-all route interfering

**Solution**:
1. Check that API routes are prefixed with `/api/`
2. Verify server.js correctly skips API routes in catch-all handler
3. Check deployment logs for route registration messages

### React Router not working

**Cause**: Catch-all route not configured properly

**Solution**:
1. Ensure catch-all route is configured in server.js
2. Check that non-API routes are redirected to index.html
3. Verify `NODE_ENV=production` is set (static serving only works in production)

### Database connection slow on first request

**Cause**: Cold start - connections are created on demand

**Solution**:
- This is normal for first request after deployment
- Subsequent requests will use pooled connections
- Connection pool maintains minimum 2 idle connections in production

## Development vs Production

### Development (Local Testing)
```bash
# Terminal 1: Start backend API server
npm run dev:backend

# Terminal 2: Start frontend dev server
npm run dev:frontend
```

Access:
- Frontend: http://localhost:5000
- Backend API: http://localhost:3000
- Database health: http://localhost:3000/api/health/db

### Production (Deployment)
```bash
# Build and start unified server
npm run build
NODE_ENV=production npm run start
```

Access:
- Application: https://your-repl.replit.app
- Database health: https://your-repl.replit.app/api/health/db

## Port Configuration

- **Development**: Frontend (5000) + Backend (3000)
- **Production**: Unified server (respects `process.env.PORT` from Replit, defaults to 5000)
- Replit automatically injects the correct PORT for deployments

## Database Connection Details

### Connection Retry Logic

The application implements robust connection retry logic:
- **5 retry attempts** with exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Detailed logging** of each connection attempt
- **Graceful failure** with helpful error messages
- **Health check endpoint** for monitoring

### Connection Pool Settings

| Setting | Development | Production |
|---------|-------------|------------|
| Max Connections | 20 | 10 |
| Min Idle | 0 | 2 |
| Connection Timeout | 10s | 30s |
| Idle Timeout | 30s | 60s |
| SSL | Disabled | Enabled (self-signed OK) |

### Health Check

Monitor database health in real-time:

**Endpoint**: `GET /api/health/db`

**Healthy Response** (200):
```json
{
  "status": "healthy",
  "database": {
    "healthy": true,
    "responseTime": 45,
    "poolSize": 2,
    "idleConnections": 2,
    "waitingClients": 0
  }
}
```

**Unhealthy Response** (503):
```json
{
  "status": "unhealthy",
  "database": {
    "healthy": false,
    "error": "Connection timeout",
    "code": "ETIMEDOUT"
  }
}
```

## Performance Optimization

### Production Optimizations
1. **Connection Pooling**: Reuses database connections instead of creating new ones
2. **SSL Support**: Secure connections to Replit's PostgreSQL
3. **Statement Timeout**: Prevents runaway queries (60s max)
4. **Keep-Alive**: Detects and removes dead connections
5. **Retry Logic**: Automatically handles temporary network issues
6. **Graceful Shutdown**: Properly closes all connections on shutdown

### Monitoring
- Check `/api/health/db` regularly for pool statistics
- Monitor `poolSize`, `idleConnections`, and `waitingClients`
- If `waitingClients > 0`, consider increasing `DB_POOL_MAX`
- If `responseTime > 1000ms`, investigate slow queries

## Notes

- The build process may show warnings about chunk sizes - this is normal
- Production build optimizes and minifies all assets
- HMR (Hot Module Replacement) is only available in development
- Database migrations run automatically on server startup
- First connection after deployment may take 10-30 seconds (cold start)
- Database environment variables are automatically managed by Replit
