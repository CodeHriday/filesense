const axios = require('axios');
const { systemLogger } = require('../utils/logger');
const NodeCache = require('node-cache');
const { getAllSecretData } = require('../config/config-secrets');


const rdmCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class RDMService {
  constructor() {
    this.baseURL = process.env.RDM_BASE_URL;
    this.apiKey = process.env.RDM_API_KEY;
    this.isConfigured = !!(this.baseURL && this.apiKey);

    this.initialize();
  }

  async initialize() {
    try {
      const secrets = await getAllSecretData();

      this.baseURL =
        secrets.RDM_BASE_URL || process.env.RDM_BASE_URL;

      this.apiKey =
        secrets.RDM_API_KEY || process.env.RDM_API_KEY;

      this.isConfigured = !!(this.baseURL && this.apiKey);

      if (!this.isConfigured) {
        systemLogger.warn(
          'RDM credentials not configured. RDM integration will not be available.'
        );
      }

      this.initialized = true;

      systemLogger.info('RDM service initialized successfully');
    } catch (error) {
      systemLogger.error('Failed to initialize RDM service', error);

      this.baseURL = process.env.RDM_BASE_URL;
      this.apiKey = process.env.RDM_API_KEY;

      this.isConfigured = !!(this.baseURL && this.apiKey);
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.isConfigured) {
      throw new Error('RDM service is not configured. Please set RDM_API_KEY and RDM_BASE_URL environment variables.');
    }

    const cacheKey = `${method}:${endpoint}:${JSON.stringify(data)}`;
    
    if (method === 'GET') {
      const cached = rdmCache.get(cacheKey);
      if (cached) {
        systemLogger.info('RDM cache hit', { endpoint });
        return cached;
      }
    }

    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      systemLogger.info('Making RDM API request', { 
        endpoint, 
        method,
        baseURL: this.baseURL 
      });

      const response = await axios(config);

      // Guard against non-JSON responses (e.g. HTML from a misconfigured RDM_BASE_URL).
      // Axios parses JSON automatically; a non-object body means the API returned something
      // unexpected — fail loudly instead of silently treating it as empty data.
      const contentType = response.headers?.['content-type'] || '';
      if (typeof response.data !== 'object' || response.data === null) {
        throw new Error(
          `RDM API returned a non-JSON response (content-type: ${contentType}) — ` +
          `check RDM_BASE_URL configuration. Endpoint: ${endpoint}`
        );
      }

      if (method === 'GET') {
        rdmCache.set(cacheKey, response.data);
      }

      return response.data;
    } catch (error) {
      const errorDetails = {
        endpoint,
        method,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      };
      
      systemLogger.error('RDM API request failed', errorDetails);
      
      const enrichedError = new Error(`RDM API request failed: ${error.response?.data?.message || error.message}`);
      enrichedError.status = error.response?.status;
      enrichedError.statusText = error.response?.statusText;
      enrichedError.responseData = error.response?.data;
      enrichedError.endpoint = endpoint;
      enrichedError.isRDMError = true;
      
      throw enrichedError;
    }
  }

  async getDatasets() {
    try {
      const response = await this.makeRequest('/api/external/datasets');
      return response.data || [];
    } catch (error) {
      systemLogger.error('Failed to fetch RDM datasets', { error: error.message });
      throw error;
    }
  }

  async getDataset(datasetId) {
    try {
      const response = await this.makeRequest(`/api/external/datasets/${datasetId}`);
      return response.data || null;
    } catch (error) {
      systemLogger.error('Failed to fetch RDM dataset', { datasetId, error: error.message });
      throw error;
    }
  }

  async getDatasetData(datasetId, options = {}) {
    // The external RDM API does not expose a row-data endpoint for datasets
    // (only /api/external/datasets and /api/external/datasets/:id/schema exist).
    // Dataset joins therefore cannot be fulfilled by this API implementation.
    // Use a crosswalk lookup instead — crosswalk data IS available via the list endpoint.
    const msg =
      `The RDM API does not provide a row-data endpoint for dataset ${datasetId}. ` +
      `Use a Crosswalk Lookup node instead of a Dataset Join to translate values with this RDM system.`;
    systemLogger.warn('RDM dataset row data unavailable', { datasetId, reason: msg });
    throw new Error(msg);
  }

  async getDatasetSchema(datasetId) {
    try {
      const response = await this.makeRequest(`/api/external/datasets/${datasetId}/schema`);
      return response.data || [];
    } catch (error) {
      systemLogger.error('Failed to fetch RDM dataset schema', { datasetId, error: error.message });
      throw error;
    }
  }

  async getCrosswalks() {
    try {
      const response = await this.makeRequest('/api/external/crosswalks');
      return response.data || [];
    } catch (error) {
      systemLogger.error('Failed to fetch RDM crosswalks', { error: error.message });
      throw error;
    }
  }

  async getCrosswalk(crosswalkId) {
    try {
      const response = await this.makeRequest(`/api/external/crosswalks/${crosswalkId}`);
      return response.data || null;
    } catch (error) {
      systemLogger.error('Failed to fetch RDM crosswalk', { crosswalkId, error: error.message });
      throw error;
    }
  }

  async getCrosswalkData(crosswalkId, options = {}) {
    try {
      // The external RDM API does not have a per-crosswalk /data endpoint.
      // All crosswalk mapping rows are embedded in the list response under
      // crosswalk.mappingData.mappings[].{sourceValue, targetValue}.
      // We fetch the full list (cached for 300 s) and extract by ID.
      const response = await this.makeRequest('/api/external/crosswalks');
      const crosswalks = response.data || [];
      const crosswalk = crosswalks.find(c => String(c.id) === String(crosswalkId));

      if (!crosswalk) {
        systemLogger.warn('RDM crosswalk not found in list', { crosswalkId });
        return [];
      }

      const mappings = crosswalk.mappingData?.mappings || [];

      // Normalize API field names (sourceValue/targetValue) to the names expected by
      // rdmContextLoader (source_code/target_code) and rdmLookupProcessor
      // (target_code || target_value || to).  Keep raw names alongside for compatibility.
      return mappings.map(m => ({
        source_code:  m.sourceValue,
        target_code:  m.targetValue,
        sourceValue:  m.sourceValue,
        targetValue:  m.targetValue,
        status:       m.status
      }));
    } catch (error) {
      systemLogger.error('Failed to fetch RDM crosswalk data', { crosswalkId, error: error.message });
      throw error;
    }
  }

  async getCrosswalkSchema(crosswalkId) {
    try {
      const response = await this.makeRequest(`/api/external/crosswalks/${crosswalkId}/schema`);
      return response.data || [];
    } catch (error) {
      systemLogger.error('Failed to fetch RDM crosswalk schema', { crosswalkId, error: error.message });
      throw error;
    }
  }

  async getRelationships() {
    try {
      const response = await this.makeRequest('/api/external/relationships');
      return response.data || [];
    } catch (error) {
      systemLogger.error('Failed to fetch RDM relationships', { error: error.message });
      throw error;
    }
  }

  async lookupCrosswalk(crosswalkId, sourceValue, sourceField = 'source_code') {
    try {
      const crosswalkData = await this.getCrosswalkData(crosswalkId);
      
      const match = crosswalkData.find(row => 
        String(row[sourceField]).toLowerCase() === String(sourceValue).toLowerCase()
      );
      
      return match || null;
    } catch (error) {
      systemLogger.error('Failed to lookup crosswalk value', { 
        crosswalkId, 
        sourceValue, 
        sourceField,
        error: error.message 
      });
      return null;
    }
  }

  async joinDataset(sourceData, datasetId, joinConfig) {
    try {
      const { sourceField, datasetField, selectFields } = joinConfig;
      
      const datasetData = await this.getDatasetData(datasetId);
      
      const datasetMap = new Map();
      datasetData.forEach(row => {
        const key = String(row[datasetField]).toLowerCase();
        datasetMap.set(key, row);
      });
      
      const enrichedData = sourceData.map(sourceRow => {
        const joinKey = String(sourceRow[sourceField]).toLowerCase();
        const datasetRow = datasetMap.get(joinKey);
        
        if (datasetRow) {
          const enrichedRow = { ...sourceRow };
          
          if (selectFields && selectFields.length > 0) {
            selectFields.forEach(field => {
              enrichedRow[`rdm_${field}`] = datasetRow[field];
            });
          } else {
            Object.keys(datasetRow).forEach(key => {
              if (key !== datasetField) {
                enrichedRow[`rdm_${key}`] = datasetRow[key];
              }
            });
          }
          
          return enrichedRow;
        }
        
        return sourceRow;
      });
      
      return enrichedData;
    } catch (error) {
      systemLogger.error('Failed to join dataset', { 
        datasetId, 
        joinConfig,
        error: error.message 
      });
      throw error;
    }
  }

  clearCache() {
    rdmCache.flushAll();
    systemLogger.info('RDM cache cleared');
  }

  isAvailable() {
    return this.isConfigured;
  }
}

module.exports = new RDMService();
