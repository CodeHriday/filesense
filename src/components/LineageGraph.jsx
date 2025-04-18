import React, { useCallback, useEffect, useState } from 'react';
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
import { FiDatabase, FiFile, FiFileText, FiBox, FiZoomIn, FiZoomOut, FiMaximize } from 'react-icons/fi';
import { getLineages } from '../api/lineageService';

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

// Node types configuration
const nodeTypes = {
  file: FileNode,
};

function LineageGraph({ onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        
        // First, collect all unique files as nodes
        lineageData.forEach(lineage => {
          // Add source file node if not already added
          if (!nodeMap.has(lineage.source_file_id)) {
            nodeMap.set(lineage.source_file_id, {
              id: lineage.source_file_id,
              type: 'file',
              position: { x: 0, y: 0 }, // Initial position, will be laid out automatically
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
              position: { x: 250, y: 0 }, // Initial position, will be laid out automatically
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
            id: `e-${lineage.id}`,
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
    if (onNodeClick) {
      onNodeClick(node.data.id);
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
    return (
      <div className="lineage-graph-loading">
        <div className="spinner"></div>
        <p>Loading lineage graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lineage-graph-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
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
            return '#555';
          }}
          nodeColor={(n) => {
            if (n.type === 'file') {
              return '#e6f2ff';
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
  );
}

export default LineageGraph;