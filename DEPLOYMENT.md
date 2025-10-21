# Data File Observatory - Deployment Guide

## Overview
This guide explains how to deploy the Data File Observatory React application on Replit.

## Architecture
- **Frontend**: React 18 + Vite (Single Page Application)
- **Backend**: Node.js/Express API server
- **Database**: PostgreSQL
- **Production Mode**: Unified server serving both React static files and API

## Build and Run Commands

### For Replit Deployment (Autoscale)

When publishing your app on Replit, use the following configuration:

**Build Command:**
```bash
npm run build
```

**Run Command:**
```bash
npm run start
```

### What These Commands Do

1. **Build Command** (`npm run build`):
   - Runs `vite build` to compile your React application
   - Creates optimized production files in the `dist/` folder
   - Minifies JavaScript and CSS
   - Generates static HTML, CSS, and JS files

2. **Run Command** (`npm run start`):
   - Runs `node server.js` with `NODE_ENV=production`
   - Server automatically detects production mode
   - Serves static React files from `dist/` folder on port 5000
   - Handles API routes at `/api/*`
   - Implements SPA routing (all non-API routes → index.html)

## Production Server Configuration

The server is configured to work differently in production vs development:

### Production Mode (NODE_ENV=production)
- Port: Respects `process.env.PORT` (Replit provides this), defaults to 5000
- Serves static files from `dist/` folder
- Handles React Router with catch-all route
- API routes remain at `/api/*`
- Single unified server for both frontend and backend

### Development Mode
- Frontend: Port **5000** (Vite dev server with HMR)
- Backend: Port **3000** (Express API server)
- Vite proxy forwards `/api/*` requests to backend

## Environment Variables Required

Before deployment, ensure the following environment variables are set in Replit Secrets:

### Required
```bash
# Database (auto-configured by Replit)
DATABASE_URL=postgresql://...
PGHOST=...
PGPORT=5432
PGUSER=...
PGPASSWORD=...
PGDATABASE=...

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

## Deployment Steps on Replit

1. **Prepare Secrets**
   - Go to Tools → Secrets in Replit
   - Add `JWT_SECRET` with a generated value
   - Database variables are auto-configured

2. **Configure Deployment**
   - Click "Deploy" button in Replit
   - Choose **Autoscale Deployment**
   - Set Build Command: `npm run build`
   - Set Run Command: `npm run start`

3. **Deploy**
   - Click "Deploy" to build and launch
   - Your app will be live at `https://your-repl.replit.app`

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
├── vite.config.js        # Vite configuration
└── package.json          # Build scripts
```

## Troubleshooting

### "Server cannot start without JWT_SECRET"
- Generate JWT secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Add to Replit Secrets as `JWT_SECRET`

### Static files not loading
- Ensure `npm run build` completed successfully
- Check that `dist/` folder exists and contains files
- Verify `NODE_ENV=production` is set

### API routes return 404
- Check that API routes are prefixed with `/api/`
- Verify server.js correctly handles catch-all routing

### React Router not working
- Ensure catch-all route is configured in server.js
- Check that non-API routes are redirected to index.html

## Development vs Production

### Development (Local Testing)
```bash
# Terminal 1: Start backend API server
npm run dev:backend

# Terminal 2: Start frontend dev server
npm run dev:frontend
```

### Production (Deployment)
```bash
# Build and start unified server
npm run build
npm run start
```

## Port Configuration

- **Development**: Frontend (5000) + Backend (3000)
- **Production**: Unified server (respects `process.env.PORT` from Replit, defaults to 5000)
- Replit automatically injects the correct PORT for deployments

## Notes

- The build process may show warnings about chunk sizes - this is normal
- Production build optimizes and minifies all assets
- HMR (Hot Module Replacement) is only available in development
- Database migrations run automatically on server startup
