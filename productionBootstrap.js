/**
 * Production bootstrap proxy.
 *
 * Replit probes the public port as soon as the process starts. The main API
 * has a large synchronous startup phase, so this small process owns the
 * public port and keeps the probe healthy while the API initializes on an
 * internal port. Once the API's readiness endpoint succeeds, HTTP and
 * WebSocket traffic are proxied to it normally.
 */
const http = require('http');
const { spawn } = require('child_process');
const httpProxy = require('http-proxy');

const publicPort = Number(process.env.PORT || 5000);
const apiPort = Number(process.env.INTERNAL_API_PORT || publicPort + 1);
const profileApiPort = Number(process.env.PROFILE_API_PORT || 8000);
const apiTarget = `http://127.0.0.1:${apiPort}`;
const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });

let apiReady = false;
let profileApiStarted = false;
let shuttingDown = false;
let apiProcess = null;
let profileApiProcess = null;

function startProfileApi() {
  if (profileApiStarted) return;
  profileApiStarted = true;

  profileApiProcess = spawn('python', ['profile_api.py'], {
    env: {
      ...process.env,
      PROFILE_API_PORT: String(profileApiPort),
      BACKEND_API_URL: `http://127.0.0.1:${publicPort}`,
      DISABLE_VIRUS_SCAN: process.env.DISABLE_VIRUS_SCAN || 'true'
    },
    stdio: 'inherit'
  });

  profileApiProcess.on('exit', (code, signal) => {
    console.error(`Profile API exited (${signal || code || 'unknown'}).`);
  });
}

function startApi() {
  apiProcess = spawn('node', ['--max-old-space-size=512', '--expose-gc', 'server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(apiPort),
      PROFILE_API_PORT: String(profileApiPort)
    },
    stdio: 'inherit'
  });

  apiProcess.on('exit', (code, signal) => {
    console.error(`API process exited (${signal || code || 'unknown'}).`);
    if (!shuttingDown) process.exit(code || 1);
  });

  return apiProcess;
}

async function checkApiReadiness() {
  return new Promise((resolve) => {
    const request = http.get(`${apiTarget}/api/health/ready`, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

const server = http.createServer((req, res) => {
  if (!apiReady) {
    if (req.url === '/' || req.url === '/api/health/live') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Application is starting');
      return;
    }

    res.writeHead(503, {
      'Content-Type': 'application/json',
      'Retry-After': '5'
    });
    res.end(JSON.stringify({ error: 'Application is starting. Please retry shortly.' }));
    return;
  }

  proxy.web(req, res, { target: apiTarget });
});

proxy.on('error', (error, _req, res) => {
  console.error(`Internal API proxy error: ${error.message}`);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Application is temporarily unavailable.' }));
  }
});

server.on('upgrade', (req, socket, head) => {
  if (!apiReady) {
    socket.destroy();
    return;
  }
  proxy.ws(req, socket, head, { target: apiTarget });
});

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`Production bootstrap listening on port ${publicPort}`);
  startApi();
});

const readinessTimer = setInterval(async () => {
  if (apiReady || !(await checkApiReadiness())) return;

  apiReady = true;
  startProfileApi();
  console.log(`Internal API ready on port ${apiPort}; production traffic is now proxied.`);
  clearInterval(readinessTimer);
}, 500);

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down production bootstrap.`);
  clearInterval(readinessTimer);
  apiProcess?.kill('SIGTERM');
  profileApiProcess?.kill('SIGTERM');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));