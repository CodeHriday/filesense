const { systemLogger } = require('../utils/logger');

class VisualMappingCompiler {
  
  /**
   * Compiles a visual mapping graph into an executable transformation mapping
   * @param {Object} visualMapping - The visual mapping definition with nodes and edges
   * @returns {Object} - Compiled transformation mapping configuration or validation errors
   */
  compile(visualMapping) {
    try {
      const { graph_data, name, description, project_id, sub_project_id } = visualMapping;
      
      if (!graph_data || !graph_data.nodes || !graph_data.edges) {
        return {
          success: false,
          errors: ['Invalid graph data: missing nodes or edges']
        };
      }
      
      const { nodes, edges } = graph_data;
      
      // Step 1: Validate graph structure
      const structureValidation = this.validateGraphStructure(nodes, edges);
      if (!structureValidation.valid) {
        return {
          success: false,
          errors: structureValidation.errors
        };
      }
      
      // Step 2: Build execution order (topological sort)
      const executionOrder = this.buildExecutionOrder(nodes, edges);
      if (!executionOrder.success) {
        return {
          success: false,
          errors: executionOrder.errors
        };
      }
      
      // Step 3: Propagate schemas through the graph
      const schemaPropagation = this.propagateSchemas(executionOrder.nodes, nodes, edges);
      if (!schemaPropagation.success) {
        return {
          success: false,
          errors: schemaPropagation.errors
        };
      }
      
      // Step 4: Compile each node into transformation steps
      const compiledSteps = this.compileNodes(executionOrder.nodes, nodes, edges, schemaPropagation.schemas);
      if (!compiledSteps.success) {
        return {
          success: false,
          errors: compiledSteps.errors
        };
      }
      
      // Step 4: Build final transformation mapping
      const transformationMapping = {
        name: name || 'Visual Mapping',
        description: description || '',
        project_id,
        sub_project_id,
        source_connection_id: compiledSteps.sourceConnectionId,
        source_file_path: compiledSteps.sourceFilePath,
        source_file_pattern: compiledSteps.sourceFilePattern,
        target_connection_id: compiledSteps.targetConnectionId,
        target_file_path: compiledSteps.targetFilePath,
        target_file_name: compiledSteps.targetFileName,
        target_file_format: compiledSteps.targetFileFormat || 'csv',
        field_mappings: compiledSteps.fieldMappings || [],
        variables: compiledSteps.variables || [],
        pii_columns: compiledSteps.piiColumns || [],
        rdm_dataset_config: compiledSteps.rdmDatasetConfig,
        rdm_crosswalk_config: compiledSteps.rdmCrosswalkConfig,
        schema_drift_handling: compiledSteps.schemaDriftHandling || 'none',
        violation_handling: compiledSteps.violationHandling || 'log_continue',
        quality_rule_ids: compiledSteps.qualityRuleIds || [],
        enable_anomaly_detection: compiledSteps.enableAnomalyDetection || false,
        node_execution_map: executionOrder.executionMap
      };
      
      systemLogger.info('Visual mapping compiled successfully', {
        mappingId: visualMapping.id,
        nodeCount: nodes.length,
        edgeCount: edges.length
      });
      
      return {
        success: true,
        transformationMapping,
        executionOrder: executionOrder.nodes
      };
      
    } catch (error) {
      systemLogger.error('Error compiling visual mapping', {
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        errors: [`Compilation error: ${error.message}`]
      };
    }
  }
  
  /**
   * Validates the graph structure
   */
  validateGraphStructure(nodes, edges) {
    const errors = [];
    
    // Must have at least one source node
    const sourceNodes = nodes.filter(n => n.type === 'sourceConfig');
    if (sourceNodes.length === 0) {
      errors.push('Graph must contain at least one Source Config node');
    }
    
    // Must have at least one target node
    const targetNodes = nodes.filter(n => n.type === 'targetRules');
    if (targetNodes.length === 0) {
      errors.push('Graph must contain at least one Target Rules node');
    }
    
    // Check for orphaned nodes (nodes not connected to anything)
    const connectedNodeIds = new Set();
    edges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    
    const orphanedNodes = nodes.filter(n => 
      !connectedNodeIds.has(n.id) && n.type !== 'sourceConfig'
    );
    
    if (orphanedNodes.length > 0) {
      errors.push(`Found ${orphanedNodes.length} unconnected node(s): ${orphanedNodes.map(n => n.data.label).join(', ')}`);
    }
    
    // Validate edge rules
    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);
    
    const incomingEdgeCount = {};
    edges.forEach(edge => {
      incomingEdgeCount[edge.target] = (incomingEdgeCount[edge.target] || 0) + 1;
    });
    
    nodes.forEach(node => {
      const incomingCount = incomingEdgeCount[node.id] || 0;
      
      // Expression, RDM Lookup, and Target nodes need exactly one upstream
      if (['expression', 'rdmLookup', 'rdmDataset', 'rdmCrosswalk', 'targetRules'].includes(node.type)) {
        if (incomingCount === 0) {
          errors.push(`${this.getNodeTypeLabel(node.type)} "${node.data.label}" has no upstream connection`);
        } else if (incomingCount > 1) {
          errors.push(`${this.getNodeTypeLabel(node.type)} "${node.data.label}" has multiple upstream connections (${incomingCount}). Only one input is allowed.`);
        }
      }
      
      // Join nodes need exactly two upstream connections
      if (node.type === 'join') {
        if (incomingCount === 0) {
          errors.push(`Join node "${node.data.label}" has no upstream connections`);
        } else if (incomingCount === 1) {
          errors.push(`Join node "${node.data.label}" needs two upstream connections for left and right inputs`);
        } else if (incomingCount > 2) {
          errors.push(`Join node "${node.data.label}" has too many upstream connections (${incomingCount}). Only two inputs are allowed.`);
        }
      }
      
      // Source nodes should have no incoming edges
      if (node.type === 'sourceConfig' && incomingCount > 0) {
        errors.push(`Source Config node "${node.data.label}" cannot have incoming connections`);
      }
    });
    
    // Validate each node has required configuration
    nodes.forEach(node => {
      const nodeErrors = this.validateNodeConfig(node);
      errors.push(...nodeErrors);
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Helper to get human-readable node type label
   */
  getNodeTypeLabel(type) {
    const labels = {
      'sourceConfig': 'Source Config',
      'expression': 'Expression',
      'join': 'Join',
      'rdmLookup': 'RDM Lookup',
      'rdmDataset': 'RDM Dataset',
      'rdmCrosswalk': 'RDM Crosswalk',
      'targetRules': 'Target Rules'
    };
    return labels[type] || type;
  }
  
  /**
   * Validates individual node configuration
   */
  validateNodeConfig(node) {
    const errors = [];
    const config = node.data?.config || {};
    
    switch (node.type) {
      case 'sourceConfig':
        if (!config.connectionId) {
          errors.push(`Source Config node "${node.data.label}" is missing connection`);
        }
        if (!config.filePath) {
          errors.push(`Source Config node "${node.data.label}" is missing file path`);
        }
        if (!config.filePattern) {
          errors.push(`Source Config node "${node.data.label}" is missing file pattern`);
        }
        break;
        
      case 'expression':
        // Expression nodes can have empty fieldMappings if just passing through
        break;
        
      case 'join':
        if (!config.joinType) {
          errors.push(`Join node "${node.data.label}" is missing join type`);
        }
        if (!config.joinKeys || config.joinKeys.length === 0) {
          errors.push(`Join node "${node.data.label}" is missing join keys`);
        }
        break;
        
      case 'rdmLookup':
        if (!config.lookupType) {
          errors.push(`RDM Lookup node "${node.data.label}" is missing lookup type`);
        }
        if (config.lookupType === 'dataset' && !config.datasetId) {
          errors.push(`RDM Lookup node "${node.data.label}" is missing dataset selection`);
        }
        if (config.lookupType === 'crosswalk' && !config.crosswalkId) {
          errors.push(`RDM Lookup node "${node.data.label}" is missing crosswalk selection`);
        }
        break;
        
      case 'rdmDataset':
        if (!config.rdmConfig || !config.rdmConfig.dataset_name) {
          errors.push(`RDM Dataset node "${node.data.label}" is missing dataset configuration`);
        }
        break;
        
      case 'rdmCrosswalk':
        if (!config.rdmConfig || !config.rdmConfig.crosswalk_name) {
          errors.push(`RDM Crosswalk node "${node.data.label}" is missing crosswalk configuration`);
        }
        break;
        
      case 'targetRules':
        if (!config.connectionId) {
          errors.push(`Target Rules node "${node.data.label}" is missing connection`);
        }
        if (!config.filePath) {
          errors.push(`Target Rules node "${node.data.label}" is missing file path`);
        }
        if (!config.fileName) {
          errors.push(`Target Rules node "${node.data.label}" is missing file name`);
        }
        break;
    }
    
    return errors;
  }
  
  /**
   * Propagates schemas through the graph in execution order
   */
  propagateSchemas(orderedNodeIds, nodes, edges) {
    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);
    
    const nodeSchemas = {}; // Maps node ID to its output schema
    const errors = [];
    
    try {
      orderedNodeIds.forEach(nodeId => {
        const node = nodeMap[nodeId];
        const config = node.data?.config || {};
        
        switch (node.type) {
          case 'sourceConfig':
            // Source nodes define the initial schema
            if (config.schema && Array.isArray(config.schema)) {
              nodeSchemas[nodeId] = config.schema.map(field => ({
                name: field.name,
                type: field.type || 'string',
                source: 'source'
              }));
            } else {
              nodeSchemas[nodeId] = [];
            }
            break;
            
          case 'expression':
            // Expression nodes transform the schema based on field mappings
            const upstreamSchema = this.getUpstreamSchema(nodeId, edges, nodeSchemas);
            const outputSchema = [];
            
            if (config.fieldMappings && Array.isArray(config.fieldMappings)) {
              config.fieldMappings.forEach(mapping => {
                if (mapping.targetField) {
                  outputSchema.push({
                    name: mapping.targetField,
                    type: mapping.targetType || 'string',
                    source: 'expression',
                    transformation: mapping.transformation
                  });
                }
              });
            }
            
            // Include pass-through fields not explicitly mapped
            upstreamSchema.forEach(field => {
              if (!outputSchema.find(f => f.name === field.name)) {
                outputSchema.push({ ...field });
              }
            });
            
            nodeSchemas[nodeId] = outputSchema;
            break;
            
          case 'rdmDataset':
            // RDM Dataset joins add new fields from the reference dataset
            const datasetUpstream = this.getUpstreamSchema(nodeId, edges, nodeSchemas);
            const datasetOutput = [...datasetUpstream];
            
            // Add fields from RDM dataset if specified
            if (config.rdmConfig && config.rdmConfig.join_fields) {
              config.rdmConfig.join_fields.forEach(field => {
                if (!datasetOutput.find(f => f.name === field)) {
                  datasetOutput.push({
                    name: field,
                    type: 'string',
                    source: 'rdm_dataset'
                  });
                }
              });
            }
            
            nodeSchemas[nodeId] = datasetOutput;
            break;
            
          case 'rdmCrosswalk':
            // RDM Crosswalk transforms values but doesn't change schema structure
            const crosswalkUpstream = this.getUpstreamSchema(nodeId, edges, nodeSchemas);
            nodeSchemas[nodeId] = crosswalkUpstream.map(field => ({ ...field }));
            break;
            
          case 'targetRules':
            // Target nodes receive the final schema
            const targetUpstream = this.getUpstreamSchema(nodeId, edges, nodeSchemas);
            nodeSchemas[nodeId] = targetUpstream;
            break;
            
          default:
            // For mapping config or unknown types, pass through
            const defaultUpstream = this.getUpstreamSchema(nodeId, edges, nodeSchemas);
            nodeSchemas[nodeId] = defaultUpstream;
        }
      });
      
      return {
        success: true,
        schemas: nodeSchemas
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [`Schema propagation error: ${error.message}`]
      };
    }
  }
  
  /**
   * Gets the combined schema from all upstream nodes
   */
  getUpstreamSchema(nodeId, edges, nodeSchemas) {
    const incomingEdges = edges.filter(e => e.target === nodeId);
    
    if (incomingEdges.length === 0) {
      return [];
    }
    
    // For single upstream (most common case)
    if (incomingEdges.length === 1) {
      const upstreamNodeId = incomingEdges[0].source;
      return nodeSchemas[upstreamNodeId] || [];
    }
    
    // For multiple upstreams (should be prevented by validation, but handle gracefully)
    const combinedSchema = [];
    const seenFields = new Set();
    
    incomingEdges.forEach(edge => {
      const upstreamSchema = nodeSchemas[edge.source] || [];
      upstreamSchema.forEach(field => {
        if (!seenFields.has(field.name)) {
          combinedSchema.push({ ...field });
          seenFields.add(field.name);
        }
      });
    });
    
    return combinedSchema;
  }
  
  /**
   * Builds execution order using topological sort
   */
  buildExecutionOrder(nodes, edges) {
    try {
      // Create adjacency list
      const adjList = {};
      const inDegree = {};
      
      nodes.forEach(node => {
        adjList[node.id] = [];
        inDegree[node.id] = 0;
      });
      
      edges.forEach(edge => {
        adjList[edge.source].push(edge.target);
        inDegree[edge.target]++;
      });
      
      // Find all nodes with no incoming edges
      const queue = [];
      Object.keys(inDegree).forEach(nodeId => {
        if (inDegree[nodeId] === 0) {
          queue.push(nodeId);
        }
      });
      
      const sorted = [];
      const executionMap = {};
      let step = 0;
      
      while (queue.length > 0) {
        const nodeId = queue.shift();
        sorted.push(nodeId);
        executionMap[nodeId] = step++;
        
        adjList[nodeId].forEach(neighborId => {
          inDegree[neighborId]--;
          if (inDegree[neighborId] === 0) {
            queue.push(neighborId);
          }
        });
      }
      
      // Check for cycles
      if (sorted.length !== nodes.length) {
        return {
          success: false,
          errors: ['Graph contains cycles - cannot determine execution order']
        };
      }
      
      return {
        success: true,
        nodes: sorted,
        executionMap
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [`Error building execution order: ${error.message}`]
      };
    }
  }
  
  /**
   * Compiles nodes into transformation configuration
   */
  compileNodes(orderedNodeIds, nodes, edges, nodeSchemas) {
    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);
    
    const result = {
      success: true,
      fieldMappings: [],
      variables: [],
      piiColumns: [],
      qualityRuleIds: [],
      enableAnomalyDetection: false
    };
    
    try {
      orderedNodeIds.forEach(nodeId => {
        const node = nodeMap[nodeId];
        const config = node.data?.config || {};
        
        switch (node.type) {
          case 'sourceConfig':
            result.sourceConnectionId = config.connectionId;
            result.sourceFilePath = config.filePath;
            result.sourceFilePattern = config.filePattern;
            result.schemaDriftHandling = config.schemaDriftHandling;
            break;
            
          case 'expression':
            if (config.fieldMappings) {
              result.fieldMappings.push(...config.fieldMappings);
            }
            if (config.variables) {
              result.variables.push(...config.variables);
            }
            if (config.piiColumns) {
              result.piiColumns.push(...config.piiColumns);
            }
            break;
            
          case 'rdmDataset':
            result.rdmDatasetConfig = config.rdmConfig;
            break;
            
          case 'rdmCrosswalk':
            result.rdmCrosswalkConfig = config.rdmConfig;
            break;
            
          case 'targetRules':
            result.targetConnectionId = config.connectionId;
            result.targetFilePath = config.filePath;
            result.targetFileName = config.fileName;
            result.targetFileFormat = config.fileFormat;
            result.violationHandling = config.violationHandling;
            result.qualityRuleIds = config.selectedQualityRules || [];
            result.enableAnomalyDetection = config.anomalyDetection || false;
            break;
        }
      });
      
      return result;
      
    } catch (error) {
      return {
        success: false,
        errors: [`Error compiling nodes: ${error.message}`]
      };
    }
  }
  
  /**
   * Extracts schema from upstream nodes for a given node
   */
  extractUpstreamSchema(nodeId, nodes, edges) {
    const schema = [];
    
    // Find all edges that target this node
    const incomingEdges = edges.filter(e => e.target === nodeId);
    
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (sourceNode && sourceNode.data?.config?.schema) {
        schema.push(...sourceNode.data.config.schema);
      }
      
      // For expression nodes, add their output fields
      if (sourceNode && sourceNode.type === 'expression') {
        const fieldMappings = sourceNode.data?.config?.fieldMappings || [];
        fieldMappings.forEach(mapping => {
          if (mapping.targetField) {
            schema.push({
              name: mapping.targetField,
              type: mapping.targetType || 'string'
            });
          }
        });
      }
    });
    
    return schema;
  }
}

module.exports = new VisualMappingCompiler();
