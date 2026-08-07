const { systemLogger } = require('../utils/logger');

/**
 * Apply RDM dataset join to transformed rows
 * Enriches records by joining with reference dataset
 * 
 * @param {Array} transformedRows - Array of already-transformed records
 * @param {Object} datasetConfig - Dataset join configuration from mapping
 * @param {Object} rdmContext - Preloaded RDM context with datasets
 * @returns {Array} - Enriched records with dataset fields
 */
function applyRDMDatasetJoin(transformedRows, datasetConfig, rdmContext) {
  if (!datasetConfig || !datasetConfig.dataset_id) {
    return transformedRows; // No dataset join configured
  }

  const { dataset_id, source_column, dataset_column, join_type = 'left' } = datasetConfig;

  // Get preloaded dataset from RDM context
  const datasetData = rdmContext.rdm?.datasets?.[dataset_id];

  if (!datasetData) {
    systemLogger.warn(`RDM dataset ${dataset_id} not found in context, skipping dataset join`);
    return transformedRows;
  }

  // If the dataset was explicitly marked unavailable (e.g. the RDM API has no row-data
  // endpoint for this dataset), throw so the job engine logs a durable, user-visible error
  // rather than silently dropping rows or producing un-enriched output.
  if (datasetData.available === false) {
    throw new Error(
      `RDM dataset join for dataset ${dataset_id} cannot proceed: ${datasetData.error || 'dataset row data is unavailable'}. ` +
      `Use a Crosswalk Lookup node instead of a Dataset Join to translate values with this RDM system.`
    );
  }

  if (!datasetData.map) {
    systemLogger.warn(`RDM dataset ${dataset_id} has no lookup map, skipping dataset join`);
    return transformedRows;
  }

  systemLogger.info('Applying RDM dataset join', {
    datasetId: dataset_id,
    sourceColumn: source_column,
    datasetColumn: dataset_column,
    joinType: join_type,
    rowCount: transformedRows.length
  });

  const enrichedRows = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  // Track matched dataset keys for right/full outer joins (only successful matches)
  const matchedKeys = new Set();

  for (const row of transformedRows) {
    const sourceValue = row[source_column];
    
    if (sourceValue === null || sourceValue === undefined) {
      // Handle null source values based on join type
      if (join_type === 'inner') {
        unmatchedCount++;
        continue; // Skip row for inner join
      } else {
        enrichedRows.push({ ...row }); // Keep row with no enrichment
        unmatchedCount++;
        continue;
      }
    }

    // Look up dataset record using Map.get()
    const joinKey = String(sourceValue).toLowerCase();
    const datasetRecord = datasetData.map.get(joinKey);

    if (datasetRecord) {
      // Match found - merge dataset fields into row
      enrichedRows.push({
        ...row,
        ...datasetRecord
      });
      matchedCount++;
      
      // Track this key as matched for right/full outer joins
      matchedKeys.add(joinKey);
    } else {
      // No match found
      if (join_type === 'inner') {
        unmatchedCount++;
        continue; // Skip row for inner join
      } else if (join_type === 'left') {
        enrichedRows.push({ ...row }); // Keep original row
        unmatchedCount++;
      } else if (join_type === 'right' || join_type === 'full') {
        // For right/full joins, keep the row but it won't have dataset enrichment
        enrichedRows.push({ ...row });
        unmatchedCount++;
      }
    }
  }

  // For right/full outer joins, add unmatched dataset records
  if (join_type === 'right' || join_type === 'full') {
    // Add unmatched dataset records using Map.entries()
    for (const [key, datasetRecord] of datasetData.map.entries()) {
      if (!matchedKeys.has(key)) {
        enrichedRows.push({ ...datasetRecord });
      }
    }
  }

  systemLogger.info('RDM dataset join completed', {
    datasetId: dataset_id,
    inputRows: transformedRows.length,
    outputRows: enrichedRows.length,
    matchedRows: matchedCount,
    unmatchedRows: unmatchedCount
  });

  return enrichedRows;
}

/**
 * Apply RDM crosswalk lookup to transformed rows
 * Maps source values to target values using crosswalk table
 * 
 * @param {Array} transformedRows - Array of records (possibly enriched by dataset join)
 * @param {Object} crosswalkConfig - Crosswalk configuration from mapping
 * @param {Object} rdmContext - Preloaded RDM context with crosswalks
 * @returns {Array} - Records with crosswalk-mapped values
 */
function applyRDMCrosswalkLookup(transformedRows, crosswalkConfig, rdmContext) {
  if (!crosswalkConfig || !crosswalkConfig.crosswalk_id) {
    return transformedRows; // No crosswalk configured
  }

  const { 
    crosswalk_id, 
    source_column, 
    target_column, 
    no_match_behavior = 'keep_source',
    default_value = null
  } = crosswalkConfig;

  // Get preloaded crosswalk from RDM context
  const crosswalkData = rdmContext.rdm?.crosswalks?.[crosswalk_id];

  if (!crosswalkData || !crosswalkData.map) {
    systemLogger.warn(`RDM crosswalk ${crosswalk_id} not found in context, skipping crosswalk lookup`);
    return transformedRows;
  }

  systemLogger.info('Applying RDM crosswalk lookup', {
    crosswalkId: crosswalk_id,
    sourceColumn: source_column,
    targetColumn: target_column,
    noMatchBehavior: no_match_behavior,
    rowCount: transformedRows.length
  });

  const mappedRows = [];
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const row of transformedRows) {
    const sourceValue = row[source_column];
    const mappedRow = { ...row };

    if (sourceValue === null || sourceValue === undefined) {
      // Handle null source values
      if (no_match_behavior === 'set_null') {
        mappedRow[target_column] = null;
      } else if (no_match_behavior === 'set_default') {
        mappedRow[target_column] = default_value;
      } else {
        mappedRow[target_column] = sourceValue; // keep_source
      }
      unmappedCount++;
      mappedRows.push(mappedRow);
      continue;
    }

    // Look up crosswalk mapping using Map.get()
    const lookupKey = String(sourceValue).toLowerCase();
    const crosswalkEntry = crosswalkData.map.get(lookupKey);

    if (crosswalkEntry !== undefined) {
      // Mapping found - extract target value from crosswalk entry
      const targetValue = crosswalkEntry.target_code || crosswalkEntry.target_value || crosswalkEntry.to || null;
      mappedRow[target_column] = targetValue;
      mappedCount++;
    } else {
      // No mapping found - apply no_match_behavior
      if (no_match_behavior === 'set_null') {
        mappedRow[target_column] = null;
      } else if (no_match_behavior === 'set_default') {
        mappedRow[target_column] = default_value;
      } else {
        mappedRow[target_column] = sourceValue; // keep_source (default)
      }
      unmappedCount++;
    }

    mappedRows.push(mappedRow);
  }

  systemLogger.info('RDM crosswalk lookup completed', {
    crosswalkId: crosswalk_id,
    inputRows: transformedRows.length,
    mappedRows: mappedCount,
    unmappedRows: unmappedCount
  });

  return mappedRows;
}

/**
 * Rebuild dataset map with specific join field
 * Ensures the map is keyed by the correct column for the join operation
 */
function rebuildDatasetMapForJoin(datasetContext, joinField) {
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
  
  systemLogger.info('Rebuilt dataset map for join field', {
    joinField,
    mapSize: map.size
  });
}

/**
 * Apply all RDM lookups in sequence: dataset joins first, then crosswalk lookups
 * This is the main entry point for RDM enrichment
 * 
 * @param {Array} transformedRows - Array of records after field transformations
 * @param {Object} mapping - Full mapping configuration including RDM configs
 * @param {Object} rdmContext - Preloaded RDM context
 * @returns {Array} - Fully enriched records
 */
function applyRDMLookups(transformedRows, mapping, rdmContext) {
  if (!mapping.rdm_lookup_enabled) {
    return transformedRows; // RDM lookups not enabled
  }

  // Check for array-based configs (visual mapping format) or single configs (legacy format)
  // Handle case where singular columns may contain arrays (visual mapping format stores arrays in singular columns)
  let datasetConfigs = mapping.rdm_dataset_configs || [];
  if (mapping.rdm_dataset_config) {
    if (Array.isArray(mapping.rdm_dataset_config)) {
      datasetConfigs = [...datasetConfigs, ...mapping.rdm_dataset_config];
    } else {
      datasetConfigs = [...datasetConfigs, mapping.rdm_dataset_config];
    }
  }
  
  let crosswalkConfigs = mapping.rdm_crosswalk_configs || [];
  if (mapping.rdm_crosswalk_config) {
    if (Array.isArray(mapping.rdm_crosswalk_config)) {
      crosswalkConfigs = [...crosswalkConfigs, ...mapping.rdm_crosswalk_config];
    } else {
      crosswalkConfigs = [...crosswalkConfigs, mapping.rdm_crosswalk_config];
    }
  }

  systemLogger.info('Starting RDM enrichment phase', {
    inputRows: transformedRows.length,
    datasetJoinCount: datasetConfigs.length,
    crosswalkLookupCount: crosswalkConfigs.length,
    hasDatasetJoin: datasetConfigs.length > 0,
    hasCrosswalkLookup: crosswalkConfigs.length > 0
  });

  let enrichedRows = transformedRows;

  // Step 1: Apply all dataset joins in sequence
  for (const datasetConfig of datasetConfigs) {
    if (datasetConfig && datasetConfig.dataset_id) {
      // Rebuild the dataset map with the correct join field before joining
      const datasetContext = rdmContext.rdm?.datasets?.[datasetConfig.dataset_id];
      if (datasetContext && datasetConfig.dataset_column) {
        rebuildDatasetMapForJoin(datasetContext, datasetConfig.dataset_column);
      }
      
      enrichedRows = applyRDMDatasetJoin(enrichedRows, datasetConfig, rdmContext);
    }
  }

  // Step 2: Apply all crosswalk lookups in sequence
  for (const crosswalkConfig of crosswalkConfigs) {
    if (crosswalkConfig && crosswalkConfig.crosswalk_id) {
      enrichedRows = applyRDMCrosswalkLookup(enrichedRows, crosswalkConfig, rdmContext);
    }
  }

  systemLogger.info('RDM enrichment phase completed', {
    inputRows: transformedRows.length,
    outputRows: enrichedRows.length
  });

  return enrichedRows;
}

module.exports = {
  applyRDMDatasetJoin,
  applyRDMCrosswalkLookup,
  applyRDMLookups
};
