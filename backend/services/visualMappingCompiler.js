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
      // Check if any RDM lookups are configured
      const hasRDMLookups = (compiledSteps.rdmDatasetConfigs && compiledSteps.rdmDatasetConfigs.length > 0) ||
                            (compiledSteps.rdmCrosswalkConfigs && compiledSteps.rdmCrosswalkConfigs.length > 0) ||
                            compiledSteps.rdmDatasetConfig || compiledSteps.rdmCrosswalkConfig;
      
      // Check if this is a multi-source mapping with joins
      const hasMultipleSources = compiledSteps.sourceCatalog && compiledSteps.sourceCatalog.length > 1;
      const hasJoins = compiledSteps.joinSpecs && compiledSteps.joinSpecs.length > 0;
      
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
        rdm_lookup_enabled: hasRDMLookups,
        rdm_dataset_config: compiledSteps.rdmDatasetConfig,
        rdm_crosswalk_config: compiledSteps.rdmCrosswalkConfig,
        rdm_dataset_configs: compiledSteps.rdmDatasetConfigs || [],
        rdm_crosswalk_configs: compiledSteps.rdmCrosswalkConfigs || [],
        schema_drift_handling: compiledSteps.schemaDriftHandling || 'none',
        violation_handling: compiledSteps.violationHandling || 'log_continue',
        quality_rule_ids: compiledSteps.qualityRuleIds || [],
        quality_rule_actions: compiledSteps.qualityRuleActions || {},
        enable_anomaly_detection: compiledSteps.enableAnomalyDetection || false,
        node_execution_map: executionOrder.executionMap,
        vendor_agreement_id: compiledSteps.vendorAgreementId || null,
        vendor_agreement_name: compiledSteps.vendorAgreementName || null,
        agreement_file_id: compiledSteps.agreementFileId || null,
        // Multi-source join support
        source_catalog: compiledSteps.sourceCatalog || [],
        join_specs: compiledSteps.joinSpecs || [],
        primary_source_node_id: compiledSteps.primarySourceNodeId || null,
        has_multi_source_join: hasMultipleSources && hasJoins
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
            // IMPORTANT: Only explicitly mapped fields with include=true should pass through
            const outputSchema = [];
            
            if (config.fieldMappings && Array.isArray(config.fieldMappings)) {
              config.fieldMappings.forEach(mapping => {
                // Only include fields that have include !== false (default is true for backwards compatibility)
                if ((mapping.target_field || mapping.targetField) && mapping.include !== false) {
                  outputSchema.push({
                    name: mapping.target_field || mapping.targetField,
                    type: mapping.data_type || mapping.targetType || 'string',
                    source: 'expression',
                    transformation: mapping.transformation || mapping.expression,
                    include: mapping.include !== false
                  });
                }
              });
            }
            
            // NO pass-through: Only explicitly included fields appear in output
            // This ensures Expression nodes act as a strict column boundary
            
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
            
          case 'rdmLookup': {
            // RDM Lookup (crosswalk) adds the crosswalk output columns to the
            // schema so downstream expression and target nodes can see them.
            // Without this, 'rdmLookup' fell through to 'default' which only
            // passed the upstream schema, hiding crosswalk output fields.
            const rdmLookupUpstream = this.getUpstreamSchema(nodeId, edges, nodeSchemas);
            const rdmLookupOutput = [...rdmLookupUpstream];

            const rdmColumnMappings = config.columnMappings || [];
            rdmColumnMappings.forEach(m => {
              const colName = m.targetColumn || m.target;
              if (colName && !rdmLookupOutput.find(f => f.name === colName)) {
                rdmLookupOutput.push({
                  name: colName,
                  type: 'string',
                  source: 'rdm_crosswalk'
                });
              }
            });

            nodeSchemas[nodeId] = rdmLookupOutput;
            break;
          }

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
   * Enhanced to support multi-source joins with proper source cataloging
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
      // Maps ruleId -> errorAction for per-rule On Failure behaviour.
      // Populated from expression node dqRuleAssignments and targetRules selectedQualityRules.
      qualityRuleActions: {},
      enableAnomalyDetection: false,
      // Multi-source support: collect all source configurations
      sourceCatalog: [],
      // Join specifications for multi-source execution
      joinSpecs: []
    };
    
    try {
      // First pass: Collect all sources and joins
      orderedNodeIds.forEach(nodeId => {
        const node = nodeMap[nodeId];
        const config = node.data?.config || {};
        
        switch (node.type) {
          case 'sourceConfig':
            // Collect each source into the catalog instead of overwriting
            result.sourceCatalog.push({
              nodeId: nodeId,
              nodeName: node.data?.label || config.name || 'Source',
              connectionId: config.connectionId,
              connectionName: config.connectionName || '',
              filePath: config.filePath,
              filePattern: config.filePattern,
              vendorAgreementId: config.vendorAgreementId || null,
              vendorAgreementName: config.vendorAgreementName || null,
              agreementFileId: config.agreementFileId || null,
              schemaDriftHandling: config.schemaDriftHandling || 'none',
              schema: config.schema || []
            });
            
            // For backward compatibility, keep the FIRST source as the primary
            // (This will be the main/driving source for JOIN processing)
            if (!result.sourceConnectionId) {
              result.sourceConnectionId = config.connectionId;
              result.sourceFilePath = config.filePath;
              result.sourceFilePattern = config.filePattern;
              result.schemaDriftHandling = config.schemaDriftHandling;
              result.vendorAgreementId = config.vendorAgreementId || null;
              result.vendorAgreementName = config.vendorAgreementName || null;
              result.agreementFileId = config.agreementFileId || null;
              result.primarySourceNodeId = nodeId;
            }
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
            // Collect DQ rule IDs from dqRuleAssignments so they are inserted into
            // transformation_quality_rules and enforced during execution.
            if (config.dqRuleAssignments && typeof config.dqRuleAssignments === 'object') {
              for (const assignments of Object.values(config.dqRuleAssignments)) {
                if (Array.isArray(assignments)) {
                  for (const a of assignments) {
                    if (a.ruleId && !result.qualityRuleIds.includes(a.ruleId)) {
                      result.qualityRuleIds.push(a.ruleId);
                    }
                  }
                }
              }
            }
            break;
            
          case 'rdmLookup':
            // Handle unified rdmLookup node type
            if (config.lookupType === 'dataset') {
              // Extract join keys from joinKeys array (visual mapping format) or direct fields
              let sourceColumn = config.sourceColumn;
              let datasetColumn = config.datasetColumn;
              
              // Visual mapping stores join keys in joinKeys array
              if (config.joinKeys && config.joinKeys.length > 0) {
                sourceColumn = config.joinKeys[0].source_column || sourceColumn;
                datasetColumn = config.joinKeys[0].dataset_column || datasetColumn;
              }
              
              // Build rdmDatasetConfig from node config
              // Initialize array if not exists (supports multiple dataset joins)
              if (!result.rdmDatasetConfigs) {
                result.rdmDatasetConfigs = [];
              }
              
              result.rdmDatasetConfigs.push({
                dataset_id: config.datasetId,
                dataset_name: config.datasetName,
                source_column: sourceColumn,
                dataset_column: datasetColumn,
                join_type: config.joinType || 'left',
                column_mappings: config.columnMappings || []
              });
              
              // For backward compatibility, also set rdmDatasetConfig to first one
              if (!result.rdmDatasetConfig) {
                result.rdmDatasetConfig = result.rdmDatasetConfigs[0];
              }
            } else if (config.lookupType === 'crosswalk') {
              // Extract source/target columns from visual mapping format
              let sourceColumn = config.sourceColumn;
              let targetColumn = config.targetColumn || config.outputColumn;
              const columnMappings = config.columnMappings || [];

              // The modal saves column_mappings but not a top-level targetColumn.
              // Fall back to the first column mapping so target_column is never
              // undefined in the processor (undefined keys coerce to the string
              // "undefined", creating a spurious column in the output).
              if (!targetColumn && columnMappings.length > 0) {
                const first = columnMappings[0];
                targetColumn = first.targetColumn || first.target || first.name;
              }

              // Build rdmCrosswalkConfig from node config
              // Initialize array if not exists (supports multiple crosswalk lookups)
              if (!result.rdmCrosswalkConfigs) {
                result.rdmCrosswalkConfigs = [];
              }

              result.rdmCrosswalkConfigs.push({
                crosswalk_id: config.crosswalkId,
                crosswalk_name: config.crosswalkName,
                source_column: sourceColumn,
                target_column: targetColumn,
                no_match_behavior: config.noMatchBehavior || 'keep_source',
                default_value: config.defaultValue || null,
                // Pass column_mappings through so the processor can use field-level
                // mappings for value extraction instead of hardcoded field name heuristics.
                column_mappings: columnMappings
              });

              // For backward compatibility, also set rdmCrosswalkConfig to first one
              if (!result.rdmCrosswalkConfig) {
                result.rdmCrosswalkConfig = result.rdmCrosswalkConfigs[0];
              }
            }
            break;
            
          case 'rdmDataset':
            result.rdmDatasetConfig = config.rdmConfig;
            break;
            
          case 'rdmCrosswalk':
            result.rdmCrosswalkConfig = config.rdmConfig;
            break;
            
          case 'join':
            // Extract join specification with left/right source references
            // Find the edges connecting to this join node
            const leftEdge = edges.find(e => e.target === nodeId && e.targetHandle === 'leftInput');
            const rightEdge = edges.find(e => e.target === nodeId && e.targetHandle === 'rightInput');
            
            // Trace back to find the source nodes for each side
            const traceToSource = (startNodeId) => {
              const visited = new Set();
              let currentNodeId = startNodeId;
              while (currentNodeId && !visited.has(currentNodeId)) {
                visited.add(currentNodeId);
                const currentNode = nodeMap[currentNodeId];
                if (!currentNode) break;
                if (currentNode.type === 'sourceConfig') {
                  return currentNodeId;
                }
                // Follow the incoming edge
                const incomingEdge = edges.find(e => e.target === currentNodeId);
                currentNodeId = incomingEdge?.source;
              }
              return null;
            };
            
            const leftSourceNodeId = leftEdge ? traceToSource(leftEdge.source) : null;
            const rightSourceNodeId = rightEdge ? traceToSource(rightEdge.source) : null;
            
            result.joinSpecs.push({
              nodeId: nodeId,
              nodeName: node.data?.label || config.name || 'Join',
              joinType: config.joinType || 'INNER',
              joinKeys: config.joinKeys || [],
              columnMappings: config.columnMappings || [],
              leftInputNodeId: leftEdge?.source || null,
              rightInputNodeId: rightEdge?.source || null,
              leftSourceNodeId: leftSourceNodeId,
              rightSourceNodeId: rightSourceNodeId,
              outputSchema: config.outputSchema || []
            });
            
            // For LEFT JOINs, the left source should be the primary/driving source
            if ((config.joinType === 'LEFT' || config.joinType === 'LEFT OUTER') && leftSourceNodeId) {
              const leftSource = result.sourceCatalog.find(s => s.nodeId === leftSourceNodeId);
              if (leftSource && result.primarySourceNodeId !== leftSourceNodeId) {
                // Update primary source to be the LEFT side of a LEFT JOIN
                result.sourceConnectionId = leftSource.connectionId;
                result.sourceFilePath = leftSource.filePath;
                result.sourceFilePattern = leftSource.filePattern;
                result.schemaDriftHandling = leftSource.schemaDriftHandling;
                result.vendorAgreementId = leftSource.vendorAgreementId;
                result.vendorAgreementName = leftSource.vendorAgreementName;
                result.agreementFileId = leftSource.agreementFileId;
                result.primarySourceNodeId = leftSourceNodeId;
                
                systemLogger.info('Updated primary source for LEFT JOIN', {
                  primarySourceNodeId: leftSourceNodeId,
                  filePattern: leftSource.filePattern
                });
              }
            }
            break;
            
          case 'targetRules':
            result.targetConnectionId = config.connectionId;
            result.targetFilePath = config.filePath;
            result.targetFileName = config.fileName;
            result.targetFileFormat = config.fileFormat;
            result.violationHandling = config.violationHandling;
            // Merge selectedQualityRules with any IDs already collected from
            // expression-node dqRuleAssignments (avoid overwriting them).
            for (const ruleId of (config.selectedQualityRules || [])) {
              if (!result.qualityRuleIds.includes(ruleId)) {
                result.qualityRuleIds.push(ruleId);
              }
            }
            result.enableAnomalyDetection = config.anomalyDetection || false;
            // Capture orderedColumns for filtering/reordering fieldMappings
            result.orderedColumns = config.orderedColumns || [];
            break;
        }
      });
      
      // Filter and reorder fieldMappings based on Target's orderedColumns
      // Also create passthrough mappings for columns without explicit mappings
      if (result.orderedColumns && result.orderedColumns.length > 0) {
        // Normalize orderedColumns to handle both string arrays and object arrays (backward compatibility)
        const orderedNames = result.orderedColumns.map(col => 
          typeof col === 'string' ? col : (col && col.name ? col.name : null)
        ).filter(Boolean);
        
        if (orderedNames.length > 0) {
          // Create a map of target_field to mapping for quick lookup
          const mappingsByTargetField = new Map();
          if (Array.isArray(result.fieldMappings)) {
            result.fieldMappings.forEach(mapping => {
              const targetField = mapping.target_field || mapping.targetField;
              if (targetField) {
                mappingsByTargetField.set(targetField, mapping);
              }
            });
          }
          
          // Build new fieldMappings in the order specified by orderedColumns
          // For columns without explicit mappings, create passthrough mappings
          const orderedFieldMappings = [];
          let passthroughCount = 0;
          
          orderedNames.forEach(columnName => {
            const existingMapping = mappingsByTargetField.get(columnName);
            if (existingMapping) {
              orderedFieldMappings.push(existingMapping);
            } else {
              // Create a passthrough mapping for columns without explicit mappings
              // These are join output columns or source columns that pass through unchanged
              orderedFieldMappings.push({
                targetField: columnName,
                target_field: columnName,
                sourceFields: [columnName],
                source_fields: [columnName],
                transformations: [],
                data_type: 'string',
                isPassthrough: true
              });
              passthroughCount++;
            }
          });
          
          result.fieldMappings = orderedFieldMappings;
          
          systemLogger.info('Applied Target orderedColumns filter and reorder', {
            explicitMappings: orderedFieldMappings.length - passthroughCount,
            passthroughMappings: passthroughCount,
            totalMappings: orderedFieldMappings.length,
            orderedColumns: orderedNames.length
          });
        }
      }
      
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
   * Expression nodes act as strict column boundaries - only their explicit mappings pass through
   */
  extractUpstreamSchema(nodeId, nodes, edges) {
    const schema = [];
    
    // Find all edges that target this node
    const incomingEdges = edges.filter(e => e.target === nodeId);
    
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      
      // For expression nodes, ONLY use their explicitly mapped output fields (strict boundary)
      if (sourceNode && sourceNode.type === 'expression') {
        const fieldMappings = sourceNode.data?.config?.fieldMappings || [];
        fieldMappings.forEach(mapping => {
          const targetField = mapping.target_field || mapping.targetField;
          if (targetField) {
            schema.push({
              name: targetField,
              type: mapping.data_type || mapping.targetType || 'string'
            });
          }
        });
      } else if (sourceNode && sourceNode.data?.config?.schema) {
        // For source nodes, use their defined schema
        schema.push(...sourceNode.data.config.schema);
      }
    });
    
    return schema;
  }
}

module.exports = new VisualMappingCompiler();
