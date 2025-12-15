const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../src/middleware/authenticate');
const rdmService = require('../services/rdmService');
const { systemLogger } = require('../utils/logger');

router.get('/health', authenticateToken, async (req, res) => {
  try {
    const isAvailable = rdmService.isAvailable();
    res.json({ 
      available: isAvailable,
      message: isAvailable 
        ? 'RDM service is configured and available' 
        : 'RDM service is not configured. Please set RDM_API_KEY and RDM_BASE_URL.' 
    });
  } catch (error) {
    systemLogger.error('RDM health check failed:', error);
    res.status(500).json({ error: 'Health check failed', available: false });
  }
});

router.get('/datasets', authenticateToken, async (req, res) => {
  try {
    const datasets = await rdmService.getDatasets();
    res.json({ success: true, data: datasets });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM datasets:', error);
    
    const statusCode = error.status || 500;
    const errorResponse = {
      success: false,
      error: error.message || 'Failed to fetch datasets from RDM',
      details: error.isRDMError ? {
        status: error.status,
        statusText: error.statusText,
        endpoint: error.endpoint,
        responseBody: error.responseData,
        timestamp: new Date().toISOString()
      } : undefined
    };
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/datasets/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const dataset = await rdmService.getDataset(id);
    res.json({ success: true, data: dataset });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM dataset:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch dataset from RDM' 
    });
  }
});

router.get('/datasets/:id/schema', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const schema = await rdmService.getDatasetSchema(id);
    res.json({ success: true, data: schema });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM dataset schema:', error);
    
    const statusCode = error.status || 500;
    const errorResponse = {
      success: false,
      error: error.message || 'Failed to fetch dataset schema from RDM',
      details: error.isRDMError ? {
        status: error.status,
        statusText: error.statusText,
        endpoint: error.endpoint,
        responseBody: error.responseData,
        timestamp: new Date().toISOString()
      } : undefined
    };
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/datasets/:id/data', authenticateToken, async (req, res) => {
  try {
  const { id } = req.params;
  const { limit, offset, filters } = req.query;

  const options = {};
  if (limit) options.limit = parseInt(limit, 10);
  if (offset) options.offset = parseInt(offset, 10);

  if (filters) {
    try {
      options.filters = JSON.parse(filters);
    } catch (e) {
      systemLogger.warn('Invalid filters query parameter', {
        error: e.message,
        filters
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid filters format'
      });
    }
  }

  const data = await rdmService.getDatasetData(id, options);
  return res.json({ success: true, data });

  } catch (error) {
  systemLogger.error('Failed to fetch RDM dataset data', {
    error: error.message,
    stack: error.stack
  });

  return res.status(500).json({
    success: false,
    error: error.message || 'Failed to fetch dataset data from RDM'
  });
}
});

router.get('/crosswalks', authenticateToken, async (req, res) => {
  try {
    const crosswalks = await rdmService.getCrosswalks();
    res.json({ success: true, data: crosswalks });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM crosswalks:', error);
    
    const statusCode = error.status || 500;
    const errorResponse = {
      success: false,
      error: error.message || 'Failed to fetch crosswalks from RDM',
      details: error.isRDMError ? {
        status: error.status,
        statusText: error.statusText,
        endpoint: error.endpoint,
        responseBody: error.responseData,
        timestamp: new Date().toISOString()
      } : undefined
    };
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/crosswalks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const crosswalk = await rdmService.getCrosswalk(id);
    res.json({ success: true, data: crosswalk });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM crosswalk:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch crosswalk from RDM' 
    });
  }
});

router.get('/crosswalks/:id/schema', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const schema = await rdmService.getCrosswalkSchema(id);
    res.json({ success: true, data: schema });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM crosswalk schema:', error);
    
    const statusCode = error.status || 500;
    const errorResponse = {
      success: false,
      error: error.message || 'Failed to fetch crosswalk schema from RDM',
      details: error.isRDMError ? {
        status: error.status,
        statusText: error.statusText,
        endpoint: error.endpoint,
        responseBody: error.responseData,
        timestamp: new Date().toISOString()
      } : undefined
    };
    
    res.status(statusCode).json(errorResponse);
  }
});

router.get('/crosswalks/:id/data', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;
    
    const options = {};
    if (limit) options.limit = parseInt(limit);
    if (offset) options.offset = parseInt(offset);
    
    const data = await rdmService.getCrosswalkData(id, options);
    res.json({ success: true, data });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM crosswalk data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch crosswalk data from RDM' 
    });
  }
});

router.post('/crosswalks/:id/lookup', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { sourceValue, sourceField } = req.body;
    
    if (!sourceValue) {
      return res.status(400).json({ 
        success: false, 
        error: 'sourceValue is required' 
      });
    }
    
    const result = await rdmService.lookupCrosswalk(
      id, 
      sourceValue, 
      sourceField || 'source_code'
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    systemLogger.error('Failed to lookup crosswalk:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to lookup crosswalk value' 
    });
  }
});

router.get('/relationships', authenticateToken, async (req, res) => {
  try {
    const relationships = await rdmService.getRelationships();
    res.json({ success: true, data: relationships });
  } catch (error) {
    systemLogger.error('Failed to fetch RDM relationships:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch relationships from RDM' 
    });
  }
});

router.post('/cache/clear', authenticateToken, async (req, res) => {
  try {
    rdmService.clearCache();
    res.json({ success: true, message: 'RDM cache cleared successfully' });
  } catch (error) {
    systemLogger.error('Failed to clear RDM cache:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear cache' 
    });
  }
});

module.exports = router;
