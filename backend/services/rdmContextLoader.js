const rdmService = require('./rdmService');
const { systemLogger } = require('../utils/logger');

/**
 * Load RDM context for a transformation job
 * Analyzes field mappings, variables, and dedicated RDM configs to determine which RDM resources are needed,
 * then pre-fetches and prepares them for use during transformation
 */
async function loadRDMContext(fieldMappings = [], variables = [], rdmDatasetConfig = null, rdmCrosswalkConfig = null) {
  const context = {
    rdm: {
      crosswalks: {},
      datasets: {}
    }
  };
  
  if (!rdmService.isAvailable()) {
    systemLogger.info('RDM service not available, skipping RDM context loading');
    return context;
  }
  
  try {
    const rdmRequirements = analyzeRDMRequirements(fieldMappings, variables, rdmDatasetConfig, rdmCrosswalkConfig);
    
    if (rdmRequirements.crosswalkIds.length === 0 && rdmRequirements.datasetIds.length === 0) {
      return context; // No RDM resources needed
    }
    
    systemLogger.info('Loading RDM context', {
      crosswalkIds: rdmRequirements.crosswalkIds,
      datasetIds: rdmRequirements.datasetIds
    });
    
    // Load crosswalks
    for (const crosswalkId of rdmRequirements.crosswalkIds) {
      try {
        const crosswalkData = await rdmService.getCrosswalkData(crosswalkId);
        
        // Build lookup map for efficient crosswalk lookups
        const map = new Map();
        crosswalkData.forEach(row => {
          // Index by lowercase source value for case-insensitive lookups
          const sourceValue = row.source_code || row.source_value || row.from || '';
          const key = String(sourceValue).toLowerCase();
          map.set(key, row);
        });
        
        context.rdm.crosswalks[crosswalkId] = {
          data: crosswalkData,
          map
        };
        
        systemLogger.info(`Loaded RDM crosswalk ${crosswalkId}`, {
          rows: crosswalkData.length
        });
      } catch (error) {
        systemLogger.error(`Failed to load RDM crosswalk ${crosswalkId}`, {
          error: error.message
        });
        throw new Error(`Failed to load required RDM crosswalk ${crosswalkId}: ${error.message}`);
      }
    }
    
    // Load datasets
    for (const datasetId of rdmRequirements.datasetIds) {
      try {
        const datasetData = await rdmService.getDatasetData(datasetId);
        
        // Build lookup map for efficient dataset joins
        // We'll index by the join field (specified in transformation params)
        // For now, just store the data - mapping will be done based on join config
        const map = new Map();
        
        // Try to find a common key field (id, code, etc.)
        const possibleKeyFields = ['id', 'code', 'key', 'name'];
        let keyField = null;
        
        if (datasetData.length > 0) {
          const firstRow = datasetData[0];
          keyField = possibleKeyFields.find(field => field in firstRow);
          
          if (keyField) {
            datasetData.forEach(row => {
              const key = String(row[keyField]).toLowerCase();
              map.set(key, row);
            });
          }
        }
        
        context.rdm.datasets[datasetId] = {
          data: datasetData,
          map,
          keyField
        };
        
        systemLogger.info(`Loaded RDM dataset ${datasetId}`, {
          rows: datasetData.length,
          keyField
        });
      } catch (error) {
        systemLogger.error(`Failed to load RDM dataset ${datasetId}`, {
          error: error.message
        });
        throw new Error(`Failed to load required RDM dataset ${datasetId}: ${error.message}`);
      }
    }
    
    return context;
  } catch (error) {
    systemLogger.error('Error loading RDM context', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Analyze field mappings, variables, and dedicated RDM configs to determine which RDM resources are needed
 */
function analyzeRDMRequirements(fieldMappings = [], variables = [], rdmDatasetConfig = null, rdmCrosswalkConfig = null) {
  const crosswalkIds = new Set();
  const datasetIds = new Set();
  
  // Helper to extract RDM IDs from legacy transformations (backward compatibility)
  const extractRDMIds = (transformations = []) => {
    transformations.forEach(transform => {
      if (transform.type === 'rdm_crosswalk_lookup' && transform.params?.rdmCrosswalkId) {
        crosswalkIds.add(transform.params.rdmCrosswalkId);
      }
      if (transform.type === 'rdm_dataset_join' && transform.params?.rdmDatasetId) {
        datasetIds.add(transform.params.rdmDatasetId);
      }
    });
  };
  
  // Check field mappings (legacy rdm_ transformations)
  fieldMappings.forEach(mapping => {
    if (mapping.transformations) {
      extractRDMIds(mapping.transformations);
    }
  });
  
  // Check variables (legacy rdm_ transformations)
  variables.forEach(variable => {
    if (variable.transformations) {
      extractRDMIds(variable.transformations);
    }
  });
  
  // Check dedicated RDM dataset config (new dedicated step)
  if (rdmDatasetConfig && rdmDatasetConfig.dataset_id) {
    datasetIds.add(rdmDatasetConfig.dataset_id);
  }
  
  // Check dedicated RDM crosswalk config (new dedicated step)
  if (rdmCrosswalkConfig && rdmCrosswalkConfig.crosswalk_id) {
    crosswalkIds.add(rdmCrosswalkConfig.crosswalk_id);
  }
  
  return {
    crosswalkIds: Array.from(crosswalkIds),
    datasetIds: Array.from(datasetIds)
  };
}

/**
 * Extended version of analyzeRDMRequirements that handles array-based configs
 * Used by visual mappings which may have multiple RDM lookups
 */
function analyzeRDMRequirementsExtended(fieldMappings = [], variables = [], rdmDatasetConfigs = [], rdmCrosswalkConfigs = []) {
  const crosswalkIds = new Set();
  const datasetIds = new Set();
  
  // Helper to extract RDM IDs from legacy transformations (backward compatibility)
  const extractRDMIds = (transformations = []) => {
    transformations.forEach(transform => {
      if (transform.type === 'rdm_crosswalk_lookup' && transform.params?.rdmCrosswalkId) {
        crosswalkIds.add(transform.params.rdmCrosswalkId);
      }
      if (transform.type === 'rdm_dataset_join' && transform.params?.rdmDatasetId) {
        datasetIds.add(transform.params.rdmDatasetId);
      }
    });
  };
  
  // Check field mappings (legacy rdm_ transformations)
  fieldMappings.forEach(mapping => {
    if (mapping.transformations) {
      extractRDMIds(mapping.transformations);
    }
  });
  
  // Check variables (legacy rdm_ transformations)
  variables.forEach(variable => {
    if (variable.transformations) {
      extractRDMIds(variable.transformations);
    }
  });
  
  // Check array of RDM dataset configs (visual mapping format)
  if (Array.isArray(rdmDatasetConfigs)) {
    rdmDatasetConfigs.forEach(config => {
      if (config && config.dataset_id) {
        datasetIds.add(config.dataset_id);
      }
    });
  }
  
  // Check array of RDM crosswalk configs (visual mapping format)
  if (Array.isArray(rdmCrosswalkConfigs)) {
    rdmCrosswalkConfigs.forEach(config => {
      if (config && config.crosswalk_id) {
        crosswalkIds.add(config.crosswalk_id);
      }
    });
  }
  
  return {
    crosswalkIds: Array.from(crosswalkIds),
    datasetIds: Array.from(datasetIds)
  };
}

/**
 * Rebuild dataset map with specific join field
 * Called when we know the actual join field from transformation params
 */
function rebuildDatasetMap(datasetContext, joinField) {
  if (!datasetContext || !datasetContext.data) {
    return;
  }
  
  const map = new Map();
  datasetContext.data.forEach(row => {
    if (row[joinField] !== undefined) {
      const key = String(row[joinField]).toLowerCase();
      map.set(key, row);
    }
  });
  
  datasetContext.map = map;
  datasetContext.keyField = joinField;
}

module.exports = {
  loadRDMContext,
  analyzeRDMRequirements,
  analyzeRDMRequirementsExtended,
  rebuildDatasetMap
};
