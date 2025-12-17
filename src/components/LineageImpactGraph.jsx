import React, { useCallback, useEffect, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';
import PropTypes from 'prop-types';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FiDatabase, FiFile, FiFileText, FiBox, FiZoomIn, FiZoomOut, FiMaximize, FiMap } from 'react-icons/fi';
import './LineageGraph.css';

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
    <div className={`lineage-node ${data.isRoot ? 'root-node' : ''}`} data-file-id={data.id}>
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
FileNode.propTypes = {
  data: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    fileType: PropTypes.string,
    size: PropTypes.string,
    isRoot: PropTypes.bool,
  }).isRequired,
};

// Node types configuration
const nodeTypes = {
  file: FileNode,
};

function LineageImpactGraph({ impactData, direction, onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Format bytes to human-readable size
  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Convert impact data to ReactFlow nodes and edges
  useEffect(() => {
    const processImpactData = () => {
      if (!impactData || !impactData.impactGraph) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const graph = impactData.impactGraph;
        const impactNodes = graph.nodes || [];
        const impactEdges = graph.edges || [];

        // Group nodes by level for better layout
        const nodesByLevel = impactNodes.reduce((acc, node) => {
          const level = node.level || 0;
          if (!acc[level]) acc[level] = [];
          acc[node.level].push(node);
          return acc;
        }, {});

        // Prepare nodes with positions
        const processedNodes = [];
        const levelGap = 250; // Horizontal gap between levels
        const nodeGap = 150;  // Vertical gap between nodes in same level

        // Process levels based on direction
        const levels = Object.keys(nodesByLevel).sort((a, b) => {
          // For upstream direction, reverse the order to keep root node on the left
          return direction === 'upstream' 
            ? parseInt(b) - parseInt(a) 
            : parseInt(a) - parseInt(b);
        });

        levels.forEach((level, levelIndex) => {
          const levelNodes = nodesByLevel[level];
          const levelX = levelIndex * levelGap;
          
          levelNodes.forEach((node, nodeIndex) => {
            // Calculate Y position
            const levelHeight = levelNodes.length * nodeGap;
            const startY = -levelHeight / 2 + nodeGap / 2;
            const nodeY = startY + nodeIndex * nodeGap;
            
            processedNodes.push({
              id: node.id,
              type: 'file',
              position: { x: levelX, y: nodeY },
              data: {
                id: node.id,
                label: node.label,
                fileType: node.type,
                size: node.size ? formatBytes(node.size) : null,
                isRoot: node.isRoot || false
              },
              // Make the root node visually distinct
              style: node.isRoot ? { border: '2px solid #4dabf7', boxShadow: '0 0 10px rgba(77, 171, 247, 0.3)' } : {}
            });
          });
        });

        // Prepare edges with animated styles for better visibility
        const processedEdges = impactEdges.map(edge => ({
          id: `e-${edge.id || `${edge.source}-${edge.target}`}`,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#3182ce', strokeWidth: 2 },
          labelStyle: { fill: '#333', fontSize: 12 },
          labelBgStyle: { fill: '#f5f5f5', fillOpacity: 0.7 },
        }));

        setNodes(processedNodes);
        setEdges(processedEdges);
        setError(null);
      } catch (err) {
        console.error('Error processing impact data:', err);
        setError('Failed to process impact analysis data');
      } finally {
        setLoading(false);
      }
    };

    processImpactData();
  }, [impactData, direction]);

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

  if (loading) {
    return <LoadingSpinner fullPage={true} />;
  }

  if (error) {
    return (
      <div className="lineage-graph-error">
        <p>{error}</p>
      </div>
    );
  }

  // Check if there are any nodes to display
  if (nodes.length === 0) {
    return (
      <div className="empty-graph">
        <FiMap className="empty-icon" />
        <p>No {direction === 'downstream' ? 'downstream impact' : 'upstream dependencies'} found.</p>
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
              return n.data.isRoot ? '#4dabf7' : '#555';
            }
            return '#555';
          }}
          nodeColor={(n) => {
            if (n.type === 'file') {
              return n.data.isRoot ? '#e3faff' : '#f8f9fa';
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
      </ReactFlow>
    </div>
  );
}
LineageImpactGraph.propTypes = {
  impactData: PropTypes.shape({
    impactGraph: PropTypes.shape({
      nodes: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.string.isRequired,
          label: PropTypes.string.isRequired,
          type: PropTypes.string,
          size: PropTypes.number,
          level: PropTypes.number,
          isRoot: PropTypes.bool,
        })
      ),
      edges: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.string,
          source: PropTypes.string.isRequired,
          target: PropTypes.string.isRequired,
          label: PropTypes.string,
        })
      ),
    }),
  }),
  direction: PropTypes.oneOf(['upstream', 'downstream']).isRequired,
  onNodeClick: PropTypes.func,
};
export default LineageImpactGraph;