/**
 * Health Check Routes
 * 
 * Provides endpoints to verify system health and dependencies
 */

const express = require('express');
const { spawn } = require('child_process');
const { getUploadQueue } = require('../queues/uploadQueue');

const router = express.Router();

async function checkQueueHealth() {
  try {
    const queue = getUploadQueue();
    await queue.getJobCounts();
    return true;
  } catch (error) {
    console.error('Queue health check failed', {
      error: error.message,
      stack: error.stack
    });

    return false;
  }
}

/**
 * Check overall system health including upload queue
 */
router.get('/', async (_req, res) => {
  const queueHealthy = await checkQueueHealth();
  
  const health = {
    status: queueHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      api: 'healthy',
      uploadQueue: queueHealthy ? 'healthy' : 'degraded'
    },
    degradedMode: !queueHealthy
  };

  if (!queueHealthy) {
    health.message = 'Upload queue unavailable - uploads processing synchronously without retry/durability';
    health.recommendation = 'Start Redis server to restore queue-based processing';
  }

  res.status(200).json(health);
});

/**
 * Check Python environment and required packages
 */
router.get('/python', async (_req, res) => {
  try {
    const pythonCheck = await checkPythonEnvironment();
    
    if (pythonCheck.allInstalled) {
      res.status(200).json({
        status: 'healthy',
        python: pythonCheck
      });
    } else {
      res.status(503).json({
        status: 'degraded',
        python: pythonCheck,
        message: 'Some Python packages are missing'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * Check if Python is installed and can run scripts
 */
function checkPythonEnvironment() {
  return new Promise((resolve) => {
    // NOSONAR S4036 - PATH is controlled in deployment environment for security, hardcoded command with no user input
    const python = spawn('python3', ['-c', `
import sys
import json

def check_package(package_name):
    try:
        __import__(package_name)
        if package_name == 'openpyxl':
            import openpyxl
            return {'installed': True, 'version': openpyxl.__version__}
        elif package_name == 'pandas':
            import pandas
            return {'installed': True, 'version': pandas.__version__}
        elif package_name == 'pyarrow':
            import pyarrow
            return {'installed': True, 'version': pyarrow.__version__}
        elif package_name == 'ijson':
            import ijson
            return {'installed': True, 'version': 'installed'}
        elif package_name == 'defusedxml':
            import defusedxml
            return {'installed': True, 'version': 'installed'}
        else:
            return {'installed': True, 'version': 'unknown'}
    except ImportError:
        return {'installed': False, 'version': None}

packages = {
    'openpyxl': check_package('openpyxl'),
    'pandas': check_package('pandas'),
    'pyarrow': check_package('pyarrow'),
    'ijson': check_package('ijson'),
    'defusedxml': check_package('defusedxml')
}

result = {
    'python_version': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    'packages': packages,
    'allInstalled': all(pkg['installed'] for pkg in packages.values())
}

print(json.dumps(result))
`]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        resolve({
          error: `Python check failed with code ${code}`,
          stderr,
          allInstalled: false
        });
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          resolve({
            error: 'Failed to parse Python health check output',
            stdout,
            allInstalled: false
          });
        }
      }
    });

    python.on('error', (error) => {
      resolve({
        error: `Failed to spawn Python: ${error.message}`,
        allInstalled: false
      });
    });
  });
}

module.exports = router;
