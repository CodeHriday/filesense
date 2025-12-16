import React, { useCallback, useEffect, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';
import PropTypes from 'prop-types';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FiDatabase, FiFile, FiFileText, FiBox, FiZoomIn, FiZoomOut, FiMaximize, FiGitMerge } from 'react-icons/fi';
import { getLineages } from '../api/lineageService';
import TransformationDetailsPanel from './TransformationDetailsPanel';

// Custom Node Types
const FileNode = ({ data }) => {
  const getFileIcon = () => {
    switch (data.fileType) {
      case 'csv':
        return <FiFileText size={24} />;
      case 'json':
        return <FiFile size={24} />;
      case 'parquet':
        return <FiDatabase size={24} />;
      default:
        return <FiBox size={24} />;
    }
  };

  return (
    <div className="lineage-node" data-file-id={data.id}>
      <div className={`node-header file-type-${data.fileType}`}>
        {getFileIcon()}
        <span className="node-type">{data.fileType}</span>
      </div>
      <div className="node-content">
        <div className="node-title">{data.label}</div>
        {data.size && <div className="node-size">{data.size}</div>}
      </div>
    </div>
  );
};

// Transformation Node
const TransformationNode = ({ data }) => {
  return (
    <div className="lineage-node transformation-node" onClick={data.onClick}>
      <div className="node-header transformation-header">
        <FiGitMerge size={20} />
        <span className="node-type">Transform</span>
      </div>
      <div className="node-content">
        <div className="node-title">{data.label}</div>
        {data.description && <div className="node-description">{data.description}</div>}
        {data.fieldCount > 0 && (
          <div className="transformation-stats">
            <span className="stat-badge">{data.fieldCount} fields</span>
            {data.variableCount > 0 && (
              <span className="stat-badge">{data.variableCount} variables</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Node types configuration
const nodeTypes = {
  file: FileNode,
  transformation: TransformationNode,
};

function LineageGraph({ onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTransformation, setSelectedTransformation] = useState(null);

  // Layout configuration
  const [layoutConfig, setLayoutConfig] = useState({
    rankdir: 'LR',
    nodesep: 200,
    ranksep: 150,
  });

  // Format bytes to human-readable size
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Fetch lineage data and create graph
  useEffect(() => {
    const fetchLineageData = async () => {
      try {
        setLoading(true);
        const lineageData = await getLineages();
        
        // Process lineage data to create nodes and edges
        const nodeMap = new Map();
        const lineageEdges = [];
        
        // Process manual lineage (simple file-to-file)
        if (lineageData.manual_lineage) {
          lineageData.manual_lineage.forEach(lineage => {
            // Add source file node if not already added
            if (!nodeMap.has(lineage.source_file_id)) {
              nodeMap.set(lineage.source_file_id, {
                id: lineage.source_file_id,
                type: 'file',
                position: { x: 0, y: 0 },
                data: {
                  id: lineage.source_file_id,
                  label: lineage.source_filename,
                  fileType: lineage.source_file_type,
                  size: lineage.source_file_size ? formatBytes(lineage.source_file_size) : null,
                },
              });
            }
            
            // Add target file node if not already added
            if (!nodeMap.has(lineage.target_file_id)) {
              nodeMap.set(lineage.target_file_id, {
                id: lineage.target_file_id,
                type: 'file',
                position: { x: 250, y: 0 },
                data: {
                  id: lineage.target_file_id,
                  label: lineage.target_filename,
                  fileType: lineage.target_file_type,
                  size: lineage.target_file_size ? formatBytes(lineage.target_file_size) : null,
                },
              });
            }
            
            // Create edge between source and target
            lineageEdges.push({
              id: `manual-${lineage.id}`,
              source: lineage.source_file_id,
              target: lineage.target_file_id,
              label: lineage.relationship_type,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#3182ce', strokeWidth: 2 },
              labelStyle: { fill: '#333', fontSize: 12 },
              labelBgStyle: { fill: '#f5f5f5', fillOpacity: 0.7 },
            });
          });
        }
        
        // Process transformation lineage (source → transformation → target)
        if (lineageData.transformation_lineage) {
          lineageData.transformation_lineage.forEach(transformLineage => {
            const transformId = `transform-${transformLineage.transformation_id}`;
            
            // Add source file node
            if (transformLineage.input_file_id && !nodeMap.has(transformLineage.input_file_id)) {
              nodeMap.set(transformLineage.input_file_id, {
                id: transformLineage.input_file_id,
                type: 'file',
                position: { x: 0, y: 0 },
                data: {
                  id: transformLineage.input_file_id,
                  label: transformLineage.source_filename,
                  fileType: transformLineage.source_file_type,
                  size: transformLineage.source_file_size ? formatBytes(transformLineage.source_file_size) : null,
                },
              });
            }
            
            // Add transformation node
            const fieldMappings = transformLineage.field_mappings || [];
            const variables = transformLineage.variables || [];
            const parsedMappings = typeof fieldMappings === 'string' ? JSON.parse(fieldMappings) : fieldMappings;
            const parsedVariables = typeof variables === 'string' ? JSON.parse(variables) : variables;
            
            if (!nodeMap.has(transformId)) {
              nodeMap.set(transformId, {
                id: transformId,
                type: 'transformation',
                position: { x: 200, y: 0 },
                data: {
                  id: transformId,
                  label: transformLineage.mapping_name || 'Transformation',
                  description: transformLineage.description,
                  fieldCount: parsedMappings.length,
                  variableCount: parsedVariables.length,
                  onClick: () => setSelectedTransformation(transformLineage),
                  transformationData: transformLineage,
                },
              });
            }
            
            // Add target file node
            if (transformLineage.output_file_id && !nodeMap.has(transformLineage.output_file_id)) {
              nodeMap.set(transformLineage.output_file_id, {
                id: transformLineage.output_file_id,
                type: 'file',
                position: { x: 400, y: 0 },
                data: {
                  id: transformLineage.output_file_id,
                  label: transformLineage.target_filename,
                  fileType: transformLineage.target_file_type,
                  size: transformLineage.target_file_size ? formatBytes(transformLineage.target_file_size) : null,
                },
              });
            }
            
            // Create edges: source → transformation → target
            if (transformLineage.input_file_id) {
              lineageEdges.push({
                id: `edge-in-${transformLineage.id}`,
                source: transformLineage.input_file_id,
                target: transformId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#805ad5', strokeWidth: 2 },
              });
            }
            
            if (transformLineage.output_file_id) {
              lineageEdges.push({
                id: `edge-out-${transformLineage.id}`,
                source: transformId,
                target: transformLineage.output_file_id,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#805ad5', strokeWidth: 2 },
              });
            }
          });
        }
        
        // Convert node map to array
        const nodeArray = Array.from(nodeMap.values());
        
        // Apply visual positions using dagre layout
        const processedNodes = applyAutoLayout(nodeArray, lineageEdges, layoutConfig);
        
        setNodes(processedNodes);
        setEdges(lineageEdges);
        setError(null);
      } catch (err) {
        console.error('Error loading lineage graph:', err);
        setError('Failed to load lineage graph data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchLineageData();
  }, [layoutConfig]);

  // Helper function to simulate automatic layout
  // In a real implementation, you'd use a library like dagre
  const applyAutoLayout = (nodes, edges, config) => {
    // This is a simplified layout algorithm
    // In production, use dagre or another graph layout library
    
    // Group nodes by levels based on lineage connections
    const nodeLevels = {};
    const processed = new Set();
    
    // Find root nodes (no incoming edges)
    const roots = nodes.filter(node => {
      return !edges.some(edge => edge.target === node.id);
    }).map(node => node.id);
    
    // Assign levels starting from root nodes
    let currentLevel = roots;
    let level = 0;
    
    while (currentLevel.length > 0) {
      nodeLevels[level] = currentLevel;
      currentLevel.forEach(nodeId => processed.add(nodeId));
      
      // Find next level nodes
      const nextLevel = [];
      edges.forEach(edge => {
        if (currentLevel.includes(edge.source) && !processed.has(edge.target)) {
          nextLevel.push(edge.target);
        }
      });
      
      // Remove duplicates
      currentLevel = [...new Set(nextLevel)];
      level++;
    }
    
    // Check for any unprocessed nodes (disconnected)
    nodes.forEach(node => {
      if (!processed.has(node.id)) {
        if (!nodeLevels[level]) {
          nodeLevels[level] = [];
        }
        nodeLevels[level].push(node.id);
      }
    });
    
    // Position nodes based on levels
    return nodes.map(node => {
      const foundLevel = Object.entries(nodeLevels).find(([_, nodeIds]) => 
        nodeIds.includes(node.id)
      );
      
      if (foundLevel) {
        const [levelNum, nodesInLevel] = foundLevel;
        const levelIndex = nodesInLevel.indexOf(node.id);
        
        return {
          ...node,
          position: {
            x: parseInt(levelNum) * (config.ranksep || 200),
            y: levelIndex * (config.nodesep || 150) + 50,
          },
        };
      }
      
      return node;
    });
  };

  // Handle node click
  const onNodeClickHandler = useCallback((_, node) => {
    // Don't navigate for transformation nodes or transformation output files
    // Transformation output files have IDs like "transformed_JOB-xxx" which don't exist in files table
    if (node.type === 'transformation') {
      // Transformation nodes have their own onClick handler
      return;
    }
    
    // Only allow navigation for actual source files (not transformation outputs)
    const fileId = node.data.id;
    if (fileId && !fileId.startsWith('transformed_') && onNodeClick) {
      onNodeClick(fileId);
    }
  }, [onNodeClick]);

  // Fit view to show all nodes and edges
  const fitViewHandler = useCallback((reactFlowInstance) => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 });
    }
  }, []);

  // Handle layout direction change
  const changeLayoutDirection = (direction) => {
    setLayoutConfig({
      ...layoutConfig,
      rankdir: direction,
    });
  };

  if (loading) {
    return <LoadingSpinner size="medium" />;
  }

  if (error) {
    return (
      <div className="lineage-graph-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="lineage-graph-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClickHandler}
          fitView
          onInit={fitViewHandler}
          attributionPosition="bottom-right"
          maxZoom={2}
          minZoom={0.1}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <MiniMap 
            nodeStrokeColor={(n) => {
              if (n.type === 'file') {
                return '#3182ce';
              }
              if (n.type === 'transformation') {
                return '#805ad5';
              }
              return '#555';
            }}
            nodeColor={(n) => {
              if (n.type === 'file') {
                return '#e6f2ff';
              }
              if (n.type === 'transformation') {
                return '#f5e6ff';
              }
              return '#fff';
            }}
          />
          <Background 
            color="#f8f8f8"
            variant="dots"
            gap={12}
            size={1}
          />
          
          <Panel position="top-right" className="layout-controls">
            <div className="control-buttons">
              <button 
                className="control-btn" 
                onClick={() => changeLayoutDirection('LR')}
                title="Horizontal Layout"
              >
                <span className="direction-icon horizontal"></span>
              </button>
              <button 
                className="control-btn" 
                onClick={() => changeLayoutDirection('TB')}
                title="Vertical Layout"
              >
                <span className="direction-icon vertical"></span>
              </button>
              <button 
                className="control-btn" 
                onClick={() => fitViewHandler()}
                title="Fit View"
              >
                <FiMaximize />
              </button>
            </div>
          </Panel>
        </ReactFlow>
      </div>
      
      {selectedTransformation && (
        <TransformationDetailsPanel
          transformationData={selectedTransformation}
          onClose={() => setSelectedTransformation(null)}
        />
      )}
    </>
  );
}
LineageGraph.propTypes = {
  onNodeClick: PropTypes.func
};
FileNode.propTypes = {
  data: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    fileType: PropTypes.string.isRequired,
    size: PropTypes.string
  }).isRequired
};

TransformationNode.propTypes = {
  data: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    fieldCount: PropTypes.number,
    variableCount: PropTypes.number,
    onClick: PropTypes.func
  }).isRequired
};

export default LineageGraph;