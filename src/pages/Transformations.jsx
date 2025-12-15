import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Panel,
  MarkerType,
  MiniMap,
  ConnectionLineType,
} from 'reactflow';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import 'reactflow/dist/style.css';
import '../styles/Transformations.css';
import LoadingSpinner from '../components/LoadingSpinner';
import { 
  FiDatabase, 
  FiFilter, 
  FiGrid, 
  FiLayers,
  FiPlay,
  FiShare2, 
  FiFileText, 
  FiPlus,
  FiSave,
  FiTrash2,
  FiSettings,
  FiX,
  FiSliders,
  FiBarChart2,
  FiEdit,
  FiArrowLeft,
  FiCheck
} from 'react-icons/fi';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '../context/ToastContext';

// Import required handles from ReactFlow
import { Handle, Position } from 'reactflow';

// Custom Node Types
// Using React.memo for each custom node component to prevent unnecessary rerendering
const SourceNode = React.memo(({ data }) => {
  return (
    <div 
      className="node-source draggable-node"
      style={{
        backgroundColor: '#e6f7ff',
        borderColor: '#1890ff',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '5px',
        padding: '10px',
        zIndex: 1, // Add zIndex for consistent stacking
        width: '180px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <div 
        className="node-header" 
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: '5px',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <h4 
          className="node-title"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <FiDatabase 
            className="node-icon" 
            style={{ marginRight: '5px' }}
          />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div 
        className="node-content"
        style={{
          fontSize: '11px',
          color: '#666',
          padding: '5px 0'
        }}
      >
        <div>{data.description || 'Source data'}</div>
        {data.metadata && (
          <div className="node-metadata">
            <small>{data.metadata}</small>
          </div>
        )}
      </div>
      {/* Using ReactFlow's Handle component for proper dragging */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ background: '#4CAF50', width: '12px', height: '12px' }}
      />
    </div>
  );
});

SourceNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    metadata: PropTypes.string,
    actions: PropTypes.node,
    config: PropTypes.object,
    onConfigure: PropTypes.func,
    isSource: PropTypes.bool,
    nodeType: PropTypes.string
  }).isRequired
};

SourceNode.displayName = 'SourceNode';

const TargetNode = React.memo(({ data }) => {
  return (
    <div 
      className="node-target draggable-node"
      style={{
        backgroundColor: '#f6ffed',
        borderColor: '#52c41a',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '5px',
        padding: '10px',
        width: '180px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
        zIndex: 1 // Add zIndex for consistent stacking
      }}
    >
      <div 
        className="node-header"
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: '5px',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <h4 
          className="node-title"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <FiFileText 
            className="node-icon" 
            style={{ marginRight: '5px' }}
          />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div 
        className="node-content"
        style={{
          fontSize: '11px',
          color: '#666',
          padding: '5px 0'
        }}
      >
        <div>{data.description || 'Target destination'}</div>
        {data.metadata && (
          <div className="node-metadata">
            <small>{data.metadata}</small>
          </div>
        )}
      </div>
      {/* Using ReactFlow's Handle component for proper dragging */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ background: '#2196F3', width: '12px', height: '12px' }}
      />
    </div>
  );
});

TargetNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    metadata: PropTypes.string,
    actions: PropTypes.node,
    config: PropTypes.object,
    onConfigure: PropTypes.func,
    isTarget: PropTypes.bool,
    nodeType: PropTypes.string
  }).isRequired
};

TargetNode.displayName = 'TargetNode';

const FilterNode = React.memo(({ data }) => {
  return (
    <div 
      className="node-filter draggable-node"
      style={{
        backgroundColor: '#fff2f0',
        borderColor: '#ff7875',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '5px',
        padding: '10px',
        width: '180px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <div 
        className="node-header"
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: '5px',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <h4 
          className="node-title"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <FiFilter 
            className="node-icon" 
            style={{ marginRight: '5px' }}
          />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div 
        className="node-content"
        style={{
          fontSize: '11px',
          color: '#666',
          padding: '5px 0'
        }}
      >
        <div>{data.description || 'Filter data'}</div>
        {data.condition && (
          <div 
            className="node-condition"
            style={{
              background: 'rgba(0, 0, 0, 0.05)',
              padding: '3px 5px',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            <code>{data.condition}</code>
          </div>
        )}
      </div>
      {/* Input and output handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ background: '#2196F3', width: '12px', height: '12px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ background: '#4CAF50', width: '12px', height: '12px' }}
      />
    </div>
  );
});

FilterNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    condition: PropTypes.string,
    actions: PropTypes.node,
    config: PropTypes.object,
    onConfigure: PropTypes.func,
    nodeType: PropTypes.string
  }).isRequired
};

FilterNode.displayName = 'FilterNode';

const JoinNode = React.memo(({ data }) => {
  return (
    <div 
      className="node-join draggable-node"
      style={{
        backgroundColor: '#f0f5ff',
        borderColor: '#85a5ff',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '5px',
        padding: '10px',
        width: '180px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <div 
        className="node-header"
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: '5px',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <h4 
          className="node-title"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <FiShare2 
            className="node-icon" 
            style={{ marginRight: '5px' }}
          />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div 
        className="node-content"
        style={{
          fontSize: '11px',
          color: '#666',
          padding: '5px 0'
        }}
      >
        <div>{data.description || 'Join data'}</div>
        {data.joinInfo && (
          <div 
            className="node-join-info"
            style={{
              fontSize: '10px',
              fontStyle: 'italic',
              color: '#888',
              marginTop: '3px'
            }}
          >
            <small>{data.joinInfo}</small>
          </div>
        )}
      </div>
      {/* Input and output handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ background: '#2196F3', width: '12px', height: '12px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ background: '#4CAF50', width: '12px', height: '12px' }}
      />
      {/* Additional input handle at top-left for second data source */}
      <Handle
        type="target"
        position={Position.Top}
        id="target2"
        style={{ background: '#FFC107', width: '12px', height: '12px' }}
      />
    </div>
  );
});

JoinNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    joinInfo: PropTypes.string,
    actions: PropTypes.node,
    config: PropTypes.object,
    onConfigure: PropTypes.func,
    nodeType: PropTypes.string
  }).isRequired
};

JoinNode.displayName = 'JoinNode';

const AggregateNode = React.memo(({ data }) => {
  return (
    <div 
      className="node-aggregate draggable-node"
      style={{
        backgroundColor: '#fcffe6',
        borderColor: '#d3f261',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '5px',
        padding: '10px',
        width: '180px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <div 
        className="node-header"
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: '5px',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <h4 
          className="node-title"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <FiBarChart2 
            className="node-icon" 
            style={{ marginRight: '5px' }}
          />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div 
        className="node-content"
        style={{
          fontSize: '11px',
          color: '#666',
          padding: '5px 0'
        }}
      >
        <div>{data.description || 'Aggregate data'}</div>
        {data.aggregateInfo && (
          <div 
            className="node-aggregate-info"
            style={{
              fontSize: '10px',
              fontStyle: 'italic',
              color: '#888',
              marginTop: '3px'
            }}
          >
            <small>{data.aggregateInfo}</small>
          </div>
        )}
      </div>
      {/* Input and output handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ background: '#2196F3', width: '12px', height: '12px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ background: '#4CAF50', width: '12px', height: '12px' }}
      />
    </div>
  );
});

AggregateNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    aggregateInfo: PropTypes.string,
    actions: PropTypes.node,
    config: PropTypes.object,
    onConfigure: PropTypes.func,
    nodeType: PropTypes.string
  }).isRequired
};

AggregateNode.displayName = 'AggregateNode';

const TransformNode = React.memo(({ data }) => {
  return (
    <div 
      className="node-transform draggable-node"
      style={{
        backgroundColor: '#fce4ec',
        borderColor: '#f06292',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '5px',
        padding: '10px',
        width: '180px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <div 
        className="node-header"
        style={{
          fontWeight: 'bold',
          borderBottom: '1px solid #eee',
          paddingBottom: '5px',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <h4 
          className="node-title"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <FiLayers 
            className="node-icon" 
            style={{ marginRight: '5px' }}
          />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div 
        className="node-content"
        style={{
          fontSize: '11px',
          color: '#666',
          padding: '5px 0'
        }}
      >
        <div>{data.description || 'Transform data'}</div>
        {data.transformInfo && (
          <div 
            className="node-transform-info"
            style={{
              fontSize: '10px',
              fontStyle: 'italic',
              color: '#888',
              marginTop: '3px'
            }}
          >
            <small>{data.transformInfo}</small>
          </div>
        )}
      </div>
      {/* Input and output handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ background: '#2196F3', width: '12px', height: '12px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ background: '#4CAF50', width: '12px', height: '12px' }}
      />
    </div>
  );
});

TransformNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    transformInfo: PropTypes.string,
    actions: PropTypes.node,
    config: PropTypes.object,
    onConfigure: PropTypes.func,
    nodeType: PropTypes.string
  }).isRequired
};

TransformNode.displayName = 'TransformNode';

// Define nodeTypes outside the component to prevent recreation on each render
const NODE_TYPES = {
  source: SourceNode,
  target: TargetNode,
  filter: FilterNode,
  join: JoinNode,
  aggregate: AggregateNode,
  transform: TransformNode,
};

function Transformations() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeConfig, setNodeConfig] = useState({});
  const [showConfig, setShowConfig] = useState(false);
  const [transformationName, setTransformationName] = useState('New Transformation');
  
  // Track if dragging is happening
  const [isDragging, setIsDragging] = useState(false);
  // Store the base distance between nodes for spacing
  const nodeBaseDistance = { x: 250, y: 120 };
  
  // State for loading and transformation details
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transformationId, setTransformationId] = useState(null);
  const [transformationData, setTransformationData] = useState(null);
  
  // Use the URL query params to determine if we're editing or viewing a transformation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const isEditing = params.get('edit') === 'true';
    const isNew = params.get('new') === 'true';
    
    if (id) {
      setTransformationId(id);
      setEditing(isEditing);
      fetchTransformation(id);
    } else if (isNew) {
      // Create a new transformation
      setTransformationName('New Transformation');
      setEditing(true);
    }
  }, [location.search]);
  
  // Fetch transformation details
  const fetchTransformation = async (id) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/transformations/${id}`);
      setTransformationData(response.data);
      setTransformationName(response.data.name);
      
      if (response.data.flow_data) {
        // Load the nodes and edges from the saved transformation
        const flowData = JSON.parse(response.data.flow_data);
        if (flowData.nodes) setNodes(flowData.nodes);
        if (flowData.edges) setEdges(flowData.edges);
      }
    } catch (error) {
      console.error('Error fetching transformation:', error);
      showToast('error', 'Failed to load transformation. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handler to save the transformation
  const saveTransformation = async () => {
    if (!transformationName.trim()) {
      showToast('error', 'Please provide a name for the transformation.');
      return;
    }
    
    try {
      setLoading(true);
      const flowData = JSON.stringify({
        nodes,
        edges
      });
      
      const transformationPayload = {
        name: transformationName,
        flow_data: flowData,
        status: 'draft',
        sourceCount: nodes.filter(node => node.type === 'source').length,
        targetCount: nodes.filter(node => node.type === 'target').length,
        transformationCount: nodes.filter(node => !['source', 'target'].includes(node.type)).length
      };
      
      let response;
      if (transformationId) {
        // Update existing transformation
        response = await axios.put(
          `${API_BASE_URL}/api/transformations/${transformationId}`,
          transformationPayload
        );
        showToast('success', 'Transformation updated successfully!');
      } else {
        // Create new transformation
        response = await axios.post(
          `${API_BASE_URL}/api/transformations`,
          transformationPayload
        );
        setTransformationId(response.data.id);
        showToast('success', 'Transformation created successfully!');
      }
      
      setTransformationData(response.data);
      setEditing(false);
    } catch (error) {
      console.error('Error saving transformation:', error);
      showToast('error', 'Failed to save transformation. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handler to return to mappings page
  const handleBackToMappings = () => {
    navigate('/mappings');
  };

  // Reference to available files (simulated data for now)
  const [files, setFiles] = useState([
    { file_id: 'file_1', filename: 'sales_data.csv', columns: ['id', 'date', 'product', 'amount', 'customer'] },
    { file_id: 'file_2', filename: 'customer_data.csv', columns: ['customer_id', 'customer_name', 'email', 'region'] },
    { file_id: 'file_3', filename: 'product_data.csv', columns: ['product_id', 'product_name', 'category', 'price'] },
  ]);

  // Function to add a new component to the canvas
  const onDragStart = (event, nodeType, nodeData = {}) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/nodedata', JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');
      let nodeData = {};
      
      try {
        const dataStr = event.dataTransfer.getData('application/nodedata');
        if (dataStr) {
          nodeData = JSON.parse(dataStr);
        }
      } catch (e) {
        console.error('Error parsing node data:', e);
      }

      // Default labels and colors by type
      let label = type.charAt(0).toUpperCase() + type.slice(1);
      if (nodeData.label) {
        label = nodeData.label;
      }

      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      // Use non-overlapping position logic with current nodes
      const finalPosition = findNonOverlappingPosition(position, nodes);

      // Create id first to avoid self-reference issues
      const newId = `${type}-${uuidv4()}`;
      const newNode = {
        id: newId,
        type,
        position: finalPosition,
        data: { 
          label,
          ...nodeData,
          onConfigure: () => openNodeConfig(newId)
        },
      };

      // Add proper source and target handles based on node type
      if (type === 'source') {
        newNode.sourcePosition = 'right';
      } else if (type === 'target') {
        newNode.targetPosition = 'left';
      } else {
        newNode.sourcePosition = 'right';
        newNode.targetPosition = 'left';
      }

      setNodes((nds) => {
        const updatedNodes = nds.concat(newNode);
        return updatedNodes;
      });
    },
    [setNodes, nodes]
  );

  // Function to find a position where the node won't overlap with existing nodes
  const findNonOverlappingPosition = (initialPosition, existingNodes) => {
    const nodeWidth = 180;
    const nodeHeight = 100;
    const padding = 10;
    
    // Grid snapping
    const snapToGrid = (pos) => {
      const gridSize = 20;
      return {
        x: Math.round(pos.x / gridSize) * gridSize,
        y: Math.round(pos.y / gridSize) * gridSize
      };
    };
    
    let position = snapToGrid(initialPosition);
    
    // Check if there's an overlap with any existing node
    const hasOverlap = (pos) => {
      return existingNodes.some(node => {
        return (
          pos.x < node.position.x + nodeWidth + padding &&
          pos.x + nodeWidth + padding > node.position.x &&
          pos.y < node.position.y + nodeHeight + padding &&
          pos.y + nodeHeight + padding > node.position.y
        );
      });
    };
    
    // If there's no overlap, use the initial position
    if (!hasOverlap(position)) {
      return position;
    }
    
    // Otherwise, find a non-overlapping position using a spiral pattern
    const spiral = [
      {x: 0, y: -1}, // up
      {x: 1, y: 0},  // right
      {x: 0, y: 1},  // down
      {x: -1, y: 0}  // left
    ];
    
    let spiralIndex = 0;
    let steps = 1;
    let stepCount = 0;
    let x = position.x;
    let y = position.y;
    
    // Try positions in a spiral pattern until one works
    for (let i = 0; i < 100; i++) { // Limit iterations to prevent infinite loops
      const direction = spiral[spiralIndex];
      x += direction.x * 40; // Step size
      y += direction.y * 40;
      
      const newPos = snapToGrid({x, y});
      
      if (!hasOverlap(newPos)) {
        return newPos;
      }
      
      stepCount++;
      if (stepCount === steps) {
        stepCount = 0;
        spiralIndex = (spiralIndex + 1) % 4;
        if (spiralIndex === 0 || spiralIndex === 2) {
          steps++; // Increase steps after completing a full horizontal or vertical line
        }
      }
    }
    
    // Fallback in case we couldn't find a non-overlapping position
    return position;
  };

  // Handle connecting nodes
  const onConnect = useCallback(
    (params) => {
      // Create a connection with animated path and arrow marker
      const newEdge = {
        ...params,
        id: `e-${uuidv4()}`,
        type: 'smoothstep',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
      };
      
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  // Node selection handler for configuration
  const onNodeClick = (event, node) => {
    setSelectedNode(node);
    openNodeConfig(node.id);
  };

  // Open node configuration panel
  const openNodeConfig = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    setSelectedNode(node);
    setNodeConfig(node.data.config || {});
    setShowConfig(true);
  };

  // Close configuration panel
  const closeNodeConfig = () => {
    setShowConfig(false);
    setSelectedNode(null);
    setNodeConfig({});
  };

  // Save node configuration
  const saveNodeConfig = () => {
    if (!selectedNode) return;
    
    // Update node data with new configuration
    const updatedNodes = nodes.map(node => {
      if (node.id === selectedNode.id) {
        // Handle specific node types differently
        let updatedData = { ...node.data, config: nodeConfig };
        
        switch (node.type) {
          case 'filter':
            if (nodeConfig.column && nodeConfig.operator) {
              updatedData.condition = `${nodeConfig.column} ${nodeConfig.operator} ${nodeConfig.value || ''}`;
              updatedData.description = `Filter: ${updatedData.condition}`;
            }
            break;
          case 'join':
            if (nodeConfig.joinType && nodeConfig.rightTable && nodeConfig.leftColumn && nodeConfig.rightColumn) {
              updatedData.joinInfo = `${nodeConfig.joinType} JOIN ${nodeConfig.rightTable} ON ${nodeConfig.leftColumn} = ${nodeConfig.rightColumn}`;
              updatedData.description = `Join: ${updatedData.joinInfo}`;
            }
            break;
          case 'aggregate':
            if (nodeConfig.function && nodeConfig.column) {
              updatedData.aggregateInfo = `${nodeConfig.function}(${nodeConfig.column})`;
              if (nodeConfig.groupBy) {
                updatedData.aggregateInfo += ` GROUP BY ${nodeConfig.groupBy}`;
              }
              updatedData.description = `Aggregate: ${updatedData.aggregateInfo}`;
            }
            break;
          case 'transform':
            if (nodeConfig.operation && nodeConfig.column) {
              updatedData.transformInfo = `${nodeConfig.operation}(${nodeConfig.column})`;
              updatedData.description = `Transform: ${updatedData.transformInfo}`;
            }
            break;
          default:
            break;
        }
        
        return { ...node, data: updatedData };
      }
      return node;
    });
    
    setNodes(updatedNodes);
    setShowConfig(false);
  };

  // Function to find optimal positions for nodes to avoid overlaps (memoized to prevent recreation)
  // Enhanced optimal position finder with improved overlap detection and resolution
  // Memoized with an empty dependency array to avoid recreation on every render
  const findOptimalPositions = useCallback((currentNodes) => {
    if (!currentNodes || currentNodes.length <= 1) return null;
    
    // Define node dimensions and padding 
    const nodeWidth = 180;
    const nodeHeight = 100;
    const padding = 30; // Increased padding for better spacing between nodes
    
    // Track which nodes need adjustment
    let needsAdjustment = false;
    
    // Create a deep copy of the nodes array to work with
    const newNodes = JSON.parse(JSON.stringify(currentNodes));
    
    // Sort nodes by ID for consistent processing (prevents oscillation)
    newNodes.sort((a, b) => a.id.localeCompare(b.id));
    
    // Track nodes that have already been processed
    const processedNodes = new Set();
    
    // Process node positioning with multiple passes for better convergence
    for (let pass = 0; pass < 3; pass++) {
      // Reset adjustment flag for this pass
      let passAdjustment = false;
      
      // Check for overlaps and adjust positions
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = 0; j < newNodes.length; j++) {
          if (i === j) continue; // Skip self
          
          const node1 = newNodes[i];
          const node2 = newNodes[j];
          
          // Calculate boundaries with a safety margin
          const n1Left = node1.position.x;
          const n1Right = node1.position.x + nodeWidth;
          const n1Top = node1.position.y;
          const n1Bottom = node1.position.y + nodeHeight;
          
          const n2Left = node2.position.x;
          const n2Right = node2.position.x + nodeWidth;
          const n2Top = node2.position.y;
          const n2Bottom = node2.position.y + nodeHeight;
          
          // Check for overlap with improved padding
          if (
            n1Left < n2Right + padding &&
            n1Right + padding > n2Left &&
            n1Top < n2Bottom + padding &&
            n1Bottom + padding > n2Top
          ) {
            passAdjustment = true;
            needsAdjustment = true;
            
            // Calculate overlap amounts in each direction
            const overlapLeft = n2Right + padding - n1Left;
            const overlapRight = n1Right + padding - n2Left;
            const overlapTop = n2Bottom + padding - n1Top;
            const overlapBottom = n1Bottom + padding - n2Top;
            
            // Find the smallest overlap direction
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
            
            // Determine which node to move based on fixed types and priority
            // Source nodes should stay left, target nodes should stay right
            let moveNode2 = true;
            
            if (node1.type === 'source' && node2.type !== 'source') {
              moveNode2 = true; // Always move non-source nodes
            } else if (node1.type !== 'target' && node2.type === 'target') {
              moveNode2 = true; // Always move target nodes to the right
            } else if (node1.type === 'target' && node2.type !== 'target') {
              moveNode2 = false; // Don't move target nodes left
            } else if (processedNodes.has(node1.id) && !processedNodes.has(node2.id)) {
              moveNode2 = true; // Prefer moving unprocessed nodes
            } else if (!processedNodes.has(node1.id) && processedNodes.has(node2.id)) {
              moveNode2 = false; // Prefer moving unprocessed nodes
            }
            
            // Apply the movement with a slight additional offset to prevent exact boundary cases
            const offset = 5;
            const targetNodeIndex = moveNode2 ? j : i;
            const targetNode = newNodes[targetNodeIndex];
            const originalPosition = { ...targetNode.position };
            
            if (minOverlap === overlapLeft) {
              newNodes[targetNodeIndex].position.x = moveNode2 
                ? targetNode.position.x + overlapLeft + offset 
                : targetNode.position.x - overlapLeft - offset;
            } else if (minOverlap === overlapRight) {
              newNodes[targetNodeIndex].position.x = moveNode2 
                ? targetNode.position.x - overlapRight - offset 
                : targetNode.position.x + overlapRight + offset;
            } else if (minOverlap === overlapTop) {
              newNodes[targetNodeIndex].position.y = moveNode2 
                ? targetNode.position.y + overlapTop + offset 
                : targetNode.position.y - overlapTop - offset;
            } else {
              newNodes[targetNodeIndex].position.y = moveNode2 
                ? targetNode.position.y - overlapBottom - offset 
                : targetNode.position.y + overlapBottom + offset;
            }
            
            // Mark this node as processed
            processedNodes.add(newNodes[targetNodeIndex].id);
          }
        }
      }
      
      // If no adjustments were made in this pass, we're done
      if (!passAdjustment) break;
    }
    
    // Apply grid snapping to all adjusted nodes
    if (needsAdjustment) {
      for (let i = 0; i < newNodes.length; i++) {
        const node = newNodes[i];
        const gridSize = 20;
        newNodes[i] = {
          ...node,
          position: {
            x: Math.round(node.position.x / gridSize) * gridSize,
            y: Math.round(node.position.y / gridSize) * gridSize
          }
        };
      }
      return newNodes;
    }
    
    return null; // No adjustments needed
  }, []);

  // Auto-arrange nodes in a logical layout using topological sort
  // Create a simple sample ETL flow with enhanced styling and zIndex values
  const createSampleETLFlow = () => {
    // Track if we're already creating a flow to prevent duplicates
    if (nodeChangeRef.current.isCreatingFlow) return;
    nodeChangeRef.current.isCreatingFlow = true;
    
    // We'll use regular node positions and then auto-arrange them for better visualization
    // First clear any existing nodes
    setNodes([]);
    setEdges([]);
    
    // Give it a brief moment to clear before adding new nodes
    setTimeout(() => {
      // Create nodes with evenly distributed positions and proper zIndex values
      // zIndex values follow our standardized scale (1-9 for base elements)
      const sourceNode = {
        id: `source-${uuidv4()}`,
        type: 'source',
        position: { x: 100, y: 250 },
        zIndex: 2, // Base zIndex for nodes 
        style: { zIndex: 2 }, // Also set in style for React Flow
        data: { 
          label: 'Sales Data Source',
          description: 'CSV input data source',
          config: { sourceFile: 'sales_data.csv' },
          onConfigure: () => {},
          // Add metadata for layout algorithm optimization
          isSource: true,
          nodeType: 'source'
        }
      };
      
      const filterNode = {
        id: `filter-${uuidv4()}`,
        type: 'filter',
        position: { x: 350, y: 150 },
        zIndex: 2,
        style: { zIndex: 2 },
        data: { 
          label: 'Filter Transactions',
          description: 'Filter: amount > 1000',
          condition: 'amount > 1000',
          config: { column: 'amount', operator: '>', value: '1000' },
          onConfigure: () => {},
          nodeType: 'filter'
        }
      };
      
      const joinNode = {
        id: `join-${uuidv4()}`,
        type: 'join',
        position: { x: 350, y: 350 },
        zIndex: 2,
        style: { zIndex: 2 },
        data: { 
          label: 'Join Customer Data',
          description: 'Join: INNER JOIN customer_data.csv ON customer = customer_id',
          joinInfo: 'INNER JOIN customer_data.csv ON customer = customer_id',
          config: { 
            joinType: 'INNER JOIN', 
            rightTable: 'customer_data.csv',
            leftColumn: 'customer',
            rightColumn: 'customer_id'
          },
          onConfigure: () => {},
          nodeType: 'join'
        }
      };
      
      const transformNode = {
        id: `transform-${uuidv4()}`,
        type: 'transform',
        position: { x: 600, y: 250 },
        zIndex: 2,
        style: { zIndex: 2 },
        data: { 
          label: 'Calculate Total',
          description: 'Transform: SUM(amount)',
          transformInfo: 'SUM(amount) AS total_amount',
          config: { 
            operation: 'SUM',
            column: 'amount',
            alias: 'total_amount'
          },
          onConfigure: () => {},
          nodeType: 'transform'
        }
      };
      
      const targetNode = {
        id: `target-${uuidv4()}`,
        type: 'target',
        position: { x: 850, y: 250 },
        zIndex: 2,
        style: { zIndex: 2 },
        data: { 
          label: 'Sales Summary Output',
          description: 'Output data warehouse',
          config: { targetFile: 'sales_summary.csv' },
          onConfigure: () => {},
          isTarget: true,
          nodeType: 'target'
        }
      };
      
      // Add all nodes at once
      const initialNodes = [sourceNode, filterNode, joinNode, transformNode, targetNode];
      setNodes(initialNodes);
      
      // Create edges after a brief delay to ensure nodes are properly rendered
      setTimeout(() => {
        // Create connections between nodes with improved styling
        const newEdges = [
          { 
            id: `e-${uuidv4()}`, 
            source: sourceNode.id, 
            target: filterNode.id, 
            type: 'smoothstep', 
            animated: true,
            style: { strokeWidth: 2, stroke: '#4CAF50' },
            markerEnd: { 
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: '#4CAF50'
            }
          },
          { 
            id: `e-${uuidv4()}`, 
            source: sourceNode.id, 
            target: joinNode.id, 
            type: 'smoothstep', 
            animated: true,
            style: { strokeWidth: 2, stroke: '#2196F3' },
            markerEnd: { 
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: '#2196F3'
            }
          },
          { 
            id: `e-${uuidv4()}`, 
            source: filterNode.id, 
            target: transformNode.id, 
            type: 'smoothstep', 
            animated: true,
            style: { strokeWidth: 2, stroke: '#FF9800' },
            markerEnd: { 
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: '#FF9800'
            }
          },
          { 
            id: `e-${uuidv4()}`, 
            source: joinNode.id, 
            target: transformNode.id, 
            type: 'smoothstep', 
            animated: true,
            style: { strokeWidth: 2, stroke: '#9C27B0' },
            markerEnd: { 
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: '#9C27B0'
            }
          },
          { 
            id: `e-${uuidv4()}`, 
            source: transformNode.id, 
            target: targetNode.id, 
            type: 'smoothstep', 
            animated: true,
            style: { strokeWidth: 2, stroke: '#F44336' },
            markerEnd: { 
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: '#F44336'
            }
          }
        ];
        
        setEdges(newEdges);
        
        // After a brief delay, auto-arrange the layout for optimal visualization
        setTimeout(() => {
          autoArrangeNodes();
          // Reset the creating flow flag
          nodeChangeRef.current.isCreatingFlow = false;
        }, 200);
      }, 200);
    }, 100);
  };

  // Function to get and log the canvas size
  const logCanvasSize = () => {
    if (reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      console.log('Current canvas dimensions:', {
        width: bounds.width,
        height: bounds.height
      });
      return { width: bounds.width, height: bounds.height };
    }
    return { width: 0, height: 0 };
  };

  // Add effect to log canvas size when component mounts
  useEffect(() => {
    logCanvasSize();
    // Set up a resize observer to track canvas size changes
    const resizeObserver = new ResizeObserver(() => {
      logCanvasSize();
    });
    
    if (reactFlowWrapper.current) {
      resizeObserver.observe(reactFlowWrapper.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  
  // Track node count and structure for smart position optimization
  const prevNodeCountRef = useRef(0);
  const nodeChangeRef = useRef({ 
    lastUpdate: 0, 
    lastNodeIds: [],
    isCreatingFlow: false 
  });
  
  // Enhanced effect to optimize node positions only when actually needed
  useEffect(() => {
    // Skip empty states
    if (nodes.length === 0) {
      prevNodeCountRef.current = 0;
      nodeChangeRef.current.lastNodeIds = [];
      return;
    }
    
    // Check if nodes were actually added (not just moved or updated)
    const currentNodeIds = nodes.map(node => node.id).sort();
    const prevNodeIds = nodeChangeRef.current.lastNodeIds;
    
    // Detect if new nodes were added by comparing arrays
    const nodesAdded = 
      nodes.length > prevNodeCountRef.current || 
      (nodes.length > 0 && !arraysEqual(currentNodeIds, prevNodeIds));
      
    // Only run position optimization when nodes are added, not on every position change
    if (nodes.length > 1 && nodesAdded) {
      console.log('Nodes added/changed, optimizing positions');
      const adjusted = findOptimalPositions(nodes);
      if (adjusted) {
        // Apply the changes with a minimal delay to help React batch updates
        setTimeout(() => {
          setNodes(adjusted);
        }, 10);
      }
    }
    
    // Update the tracking references, preserve other properties like isCreatingFlow
    prevNodeCountRef.current = nodes.length;
    nodeChangeRef.current = {
      ...nodeChangeRef.current,
      lastUpdate: Date.now(),
      lastNodeIds: currentNodeIds
    };
  }, [nodes, findOptimalPositions, setNodes]);
  
  // Helper function to compare arrays for node tracking
  const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  const autoArrangeNodes = () => {
    if (nodes.length === 0) return;
    
    // Get the canvas dimensions from the wrapper element and log them
    const { width: canvasWidth, height: canvasHeight } = logCanvasSize();
    
    // Use fallback values if dimensions are zero
    const effectiveWidth = canvasWidth || 1600; 
    const effectiveHeight = canvasHeight || 900;
    
    // Define spacing constants with improved dynamic sizing
    const nodeWidth = 200;
    const nodeHeight = 100;
    
    // Calculate spacings based on canvas size and node count for better utilization
    const horizontalSpacing = Math.min(
      Math.max(300, effectiveWidth / 4), // Don't make spacing too small
      Math.max(500, effectiveWidth / (nodes.length > 5 ? 5 : nodes.length)) // Scale with node count
    );
    
    const verticalSpacing = Math.min(
      Math.max(150, effectiveHeight / 4), // Don't make spacing too small
      Math.max(250, effectiveHeight / (nodes.length > 3 ? 3 : nodes.length)) // Scale with node count
    );
    
    // Build a dependency graph of nodes with enhanced metadata
    const nodeMap = new Map();
    nodes.forEach((node) => {
      nodeMap.set(node.id, { 
        ...node, 
        inEdges: [], 
        outEdges: [],
        weight: 0, // For balancing node positioning
        // Store node type for better arrangement
        nodeType: node.type
      });
    });
    
    // Build graph relationships based on edges
    edges.forEach(({ source, target }) => {
      const sourceNode = nodeMap.get(source);
      const targetNode = nodeMap.get(target);
      
      if (sourceNode && targetNode) {
        sourceNode.outEdges.push(target);
        targetNode.inEdges.push(source);
        
        // Increase weight based on connections
        sourceNode.weight += 1;
        targetNode.weight += 1;
      }
    });
    
    // Calculate levels (depth) for each node using enhanced topological sort
    const levels = new Map(); // nodeId -> level
    const visited = new Set();
    const visiting = new Set(); // For cycle detection
    
    // Enhanced DFS with cycle detection and best-path finding
    function dfs(nodeId, depth = 0, path = []) {
      // Skip if already fully processed
      if (visited.has(nodeId)) {
        // If revisiting a node, consider updating its level to maximize distance from source
        if (depth > (levels.get(nodeId) || 0)) {
          levels.set(nodeId, depth);
        }
        return true;
      }
      
      // Detect cycles - skip and don't fail
      if (visiting.has(nodeId)) {
        return true; // Continue with other paths
      }
      
      // Mark as being visited (for cycle detection)
      visiting.add(nodeId);
      path.push(nodeId);
      
      // Set this node's level to the maximum of current and calculated depth
      levels.set(nodeId, Math.max(levels.get(nodeId) || 0, depth));
      
      // Traverse outgoing edges in a consistent order
      const outEdges = [...nodeMap.get(nodeId).outEdges];
      
      // Sort outgoing edges by target node type for better flow
      // Sources → transforms/filters/joins → targets
      outEdges.sort((a, b) => {
        const nodeA = nodeMap.get(a);
        const nodeB = nodeMap.get(b);
        
        if (!nodeA || !nodeB) return 0;
        
        if (nodeA.type === 'target' && nodeB.type !== 'target') return 1;
        if (nodeA.type !== 'target' && nodeB.type === 'target') return -1;
        
        return nodeA.weight - nodeB.weight; // Process higher weight nodes first
      });
      
      // Process all outgoing edges
      let allSuccessful = true;
      for (const targetId of outEdges) {
        if (!dfs(targetId, depth + 1, [...path])) {
          allSuccessful = false;
        }
      }
      
      // Mark as fully visited
      visited.add(nodeId);
      visiting.delete(nodeId); // Remove from visiting set
      
      return allSuccessful;
    }
    
    // Find start nodes: prioritize source nodes, then nodes with no incoming edges
    const startNodes = nodes
      .filter(node => node.type === 'source' || nodeMap.get(node.id).inEdges.length === 0)
      .map(node => node.id);
    
    // If no clear start nodes, use any node as a starting point
    if (startNodes.length === 0 && nodes.length > 0) {
      startNodes.push(nodes[0].id);
    }
    
    // Run DFS from each start node
    startNodes.forEach(nodeId => {
      dfs(nodeId);
    });
    
    // Handle isolated nodes and special node types not covered by DFS
    nodes.forEach(node => {
      if (!levels.has(node.id)) {
        // Apply special positioning logic based on node type
        if (node.type === 'source') {
          levels.set(node.id, 0); // Sources always at level 0
        } else if (node.type === 'target') {
          // Find max level and place target nodes one level further
          const levelValues = Array.from(levels.values());
          const maxLevel = levelValues.length > 0 ? Math.max(...levelValues) + 1 : 1;
          levels.set(node.id, maxLevel);
        } else if (node.type === 'join' || node.type === 'aggregate') {
          // Joins and aggregates tend to be in the middle of the flow
          levels.set(node.id, 1); 
        } else {
          // Default: place at level 1
          levels.set(node.id, 1);
        }
      }
    });
    
    // Group nodes by level for vertical arrangement
    const levelGroups = new Map(); // level -> array of node IDs
    
    // Group nodes by level
    for (const [nodeId, level] of levels.entries()) {
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level).push(nodeId);
    }
    
    // Calculate positions based on levels and vertical index
    const newPositions = {};
    
    // Find the maximum level for scaling
    const levelValues = Array.from(levels.values());
    const maxLevel = levelValues.length > 0 ? Math.max(...levelValues) : 0;
    
    // Scale horizontally to fit all levels
    const horizScale = maxLevel > 0 ? 
      Math.min(horizontalSpacing, (effectiveWidth - 300) / (maxLevel + 1)) : 
      horizontalSpacing;
    
    // Process each level - improved sorting and positioning
    for (const [level, nodeIds] of levelGroups.entries()) {
      // Enhanced sort within level:
      // 1. First by node type (source first, transforms in middle, target last)
      // 2. Then by connection weight (more connected nodes centered)
      // 3. Consider input/output connection patterns
      nodeIds.sort((a, b) => {
        const nodeA = nodeMap.get(a);
        const nodeB = nodeMap.get(b);
        
        if (!nodeA || !nodeB) return 0;
        
        // First priority: node type
        if (nodeA.type === 'source' && nodeB.type !== 'source') return -1;
        if (nodeA.type !== 'source' && nodeB.type === 'source') return 1;
        if (nodeA.type === 'target' && nodeB.type !== 'target') return 1;
        if (nodeA.type !== 'target' && nodeB.type === 'target') return -1;
        
        // Second priority: examine connection patterns
        // Nodes with many connections should be more centered
        return nodeB.weight - nodeA.weight;
      });
      
      // Apply vertical distribution - use multiple columns if many nodes at one level
      const levelNodeCount = nodeIds.length;
      
      // If many nodes at one level, create a balanced grid
      const maxNodesInColumn = Math.ceil(Math.sqrt(levelNodeCount));
      const columns = Math.ceil(levelNodeCount / maxNodesInColumn);
      
      // Position each node within its level
      nodeIds.forEach((nodeId, index) => {
        // Determine column and position within column
        const column = Math.floor(index / maxNodesInColumn);
        const posInColumn = index % maxNodesInColumn;
        
        // Total nodes in this column
        const nodesInThisColumn = Math.min(
          maxNodesInColumn,
          levelNodeCount - column * maxNodesInColumn
        );
        
        // Calculate the x position with level and column offset
        const xPos = 150 + (level * horizScale) + (column * 220);
        
        // Calculate vertical distribution to center nodes in their column
        const columnHeight = (nodesInThisColumn - 1) * verticalSpacing;
        const startY = Math.max(50, (effectiveHeight - columnHeight) / 2);
        const yPos = startY + (posInColumn * verticalSpacing);
        
        // Store the new position
        newPositions[nodeId] = { x: xPos, y: yPos };
        console.log(`Node ${nodeId} position:`, { x: xPos, y: yPos }, 
                    `Canvas size: ${effectiveWidth}x${effectiveHeight}`);
      });
    }
    
    // Apply new positions to nodes with a smooth transition
    const updatedNodes = nodes.map(node => ({
      ...node,
      // Apply new position if available, otherwise keep current position
      position: newPositions[node.id] || node.position
    }));
    
    // Update nodes with the new positions
    setNodes(updatedNodes);
    
    // Apply findOptimalPositions as a final pass to clean up any remaining overlaps
    setTimeout(() => {
      const adjusted = findOptimalPositions(updatedNodes);
      if (adjusted) {
        setNodes(adjusted);
      }
    }, 50);
  };

  // Render configuration form based on node type
  const renderConfigForm = () => {
    if (!selectedNode) return null;
    
    switch (selectedNode.type) {
      case 'source':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label htmlFor="source-file" className="config-label">Source File</label>
              <select
                id="source-file"
                className="config-select"
                value={nodeConfig.sourceFile || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, sourceFile: e.target.value})}
              >
                <option value="">Select a file</option>
                {files.map(file => (
                  <option key={file.file_id} value={file.filename}>{file.filename}</option>
                ))}
              </select>
            </div>
            {nodeConfig.sourceFile && (
              <div className="config-form-row">
                <div className="source-file-info">
                  <h4>Columns:</h4>
                  <ul>
                    {files.find(f => f.filename === nodeConfig.sourceFile)?.columns.map(col => (
                      <li key={col}>{col}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
        
      case 'target':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label htmlFor="target-name" className="config-label">Target Name</label>
              <input
                id="target-name"
                type="text"
                className="config-input"
                value={nodeConfig.targetName || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, targetName: e.target.value})}
                placeholder="Enter target name"
              />
            </div>
            <div className="config-form-row">
              <label htmlFor="output-type" className="config-label">Output Type</label>
              <select
                id="output-type"
                className="config-select"
                value={nodeConfig.outputType || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, outputType: e.target.value})}
              >
                <option value="">Select output type</option>
                <option value="file">File</option>
                <option value="database">Database Table</option>
                <option value="api">API Endpoint</option>
              </select>
            </div>
            {nodeConfig.outputType === 'file' && (
              <div className="config-form-row">
                <label htmlFor="file-format" className="config-label">File Format</label>
                <select
                  id="file-format"
                  className="config-select"
                  value={nodeConfig.fileFormat || ''}
                  onChange={(e) => setNodeConfig({...nodeConfig, fileFormat: e.target.value})}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="parquet">Parquet</option>
                  <option value="excel">Excel</option>
                </select>
              </div>
            )}
          </div>
        );
        
      case 'filter':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label htmlFor="filter-column" className="config-label">Column</label>
              <select
                id="filter-column"
                className="config-select"
                value={nodeConfig.column || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, column: e.target.value})}
              >
                <option value="">Select column</option>
                {files.flatMap(file => file.columns).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="filter-operator" className="config-label">Operator</label>
              <select
                id="filter-operator"
                className="config-select"
                value={nodeConfig.operator || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, operator: e.target.value})}
              >
                <option value="">Select operator</option>
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value=">">{">"}</option>
                <option value="<">{"<"}</option>
                <option value=">=">{"≥"}</option>
                <option value="<=">{"≤"}</option>
                <option value="LIKE">LIKE</option>
                <option value="IN">IN</option>
                <option value="NOT IN">NOT IN</option>
                <option value="IS NULL">IS NULL</option>
                <option value="IS NOT NULL">IS NOT NULL</option>
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="filter-value" className="config-label">Value</label>
              <input
                id="filter-value"
                type="text"
                className="config-input"
                value={nodeConfig.value || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, value: e.target.value})}
                placeholder="Enter value"
              />
            </div>
            {nodeConfig.column && nodeConfig.operator && (
              <div className="condition-preview">
                {`${nodeConfig.column} ${nodeConfig.operator} ${nodeConfig.value || ''}`}
              </div>
            )}
          </div>
        );
        
      case 'join':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label htmlFor="join-type" className="config-label">Join Type</label>
              <select
                id="join-type"
                className="config-select"
                value={nodeConfig.joinType || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, joinType: e.target.value})}
              >
                <option value="">Select join type</option>
                <option value="INNER">INNER</option>
                <option value="LEFT">LEFT</option>
                <option value="RIGHT">RIGHT</option>
                <option value="FULL">FULL</option>
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="right-table" className="config-label">Right Table</label>
              <select
                id="right-table"
                className="config-select"
                value={nodeConfig.rightTable || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, rightTable: e.target.value})}
              >
                <option value="">Select table</option>
                {files.map(file => (
                  <option key={file.file_id} value={file.filename}>{file.filename}</option>
                ))}
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="left-column" className="config-label">Left Column</label>
              <select
                id="left-column"
                className="config-select"
                value={nodeConfig.leftColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, leftColumn: e.target.value})}
              >
                <option value="">Select column</option>
                {files.flatMap(file => file.columns).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="right-column" className="config-label">Right Column</label>
              <select
                id="right-column"
                className="config-select"
                value={nodeConfig.rightColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, rightColumn: e.target.value})}
              >
                <option value="">Select column</option>
                {nodeConfig.rightTable && 
                  files.find(f => f.filename === nodeConfig.rightTable)?.columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
              </select>
            </div>
            {nodeConfig.joinType && nodeConfig.rightTable && nodeConfig.leftColumn && nodeConfig.rightColumn && (
              <div className="condition-preview">
                {`${nodeConfig.joinType} JOIN ${nodeConfig.rightTable} ON ${nodeConfig.leftColumn} = ${nodeConfig.rightColumn}`}
              </div>
            )}
          </div>
        );
        
      case 'aggregate':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label htmlFor="agg-function" className="config-label">Aggregation Function</label>
              <select
                id="agg-function"
                className="config-select"
                value={nodeConfig.function || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, function: e.target.value})}
              >
                <option value="">Select function</option>
                <option value="SUM">SUM</option>
                <option value="AVG">AVG</option>
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
                <option value="COUNT">COUNT</option>
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="agg-column" className="config-label">Column</label>
              <select
                id="agg-column"
                className="config-select"
                value={nodeConfig.column || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, column: e.target.value})}
              >
                <option value="">Select column</option>
                {files.flatMap(file => file.columns).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="group-by" className="config-label">Group By</label>
              <select
                id="group-by"
                className="config-select"
                value={nodeConfig.groupBy || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, groupBy: e.target.value})}
              >
                <option value="">None</option>
                {files.flatMap(file => file.columns).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            {nodeConfig.function && nodeConfig.column && (
              <div className="condition-preview">
                {`${nodeConfig.function}(${nodeConfig.column})${nodeConfig.groupBy ? ` GROUP BY ${nodeConfig.groupBy}` : ''}`}
              </div>
            )}
          </div>
        );
        
      case 'transform':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label htmlFor="transform-operation" className="config-label">Operation</label>
              <select
                id="transform-operation"
                className="config-select"
                value={nodeConfig.operation || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, operation: e.target.value})}
              >
                <option value="">Select operation</option>
                <option value="UPPER">UPPER</option>
                <option value="LOWER">LOWER</option>
                <option value="TRIM">TRIM</option>
                <option value="SUBSTRING">SUBSTRING</option>
                <option value="CONCAT">CONCAT</option>
                <option value="REPLACE">REPLACE</option>
                <option value="FORMAT_DATE">FORMAT DATE</option>
                <option value="EXTRACT_YEAR">EXTRACT YEAR</option>
                <option value="EXTRACT_MONTH">EXTRACT MONTH</option>
                <option value="EXTRACT_DAY">EXTRACT DAY</option>
              </select>
            </div>
            <div className="config-form-row">
              <label htmlFor="transform-column" className="config-label">Column</label>
              <select
                id="transform-column"
                className="config-select"
                value={nodeConfig.column || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, column: e.target.value})}
              >
                <option value="">Select column</option>
                {files.flatMap(file => file.columns).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            {nodeConfig.operation === 'CONCAT' && (
              <div className="config-form-row">
                <label htmlFor="concat-with" className="config-label">Concat With</label>
                <select
                  id="concat-with"
                  className="config-select"
                  value={nodeConfig.concatWith || ''}
                  onChange={(e) => setNodeConfig({...nodeConfig, concatWith: e.target.value})}
                >
                  <option value="">Select column</option>
                  {files.flatMap(file => file.columns).map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )}
            {nodeConfig.operation === 'REPLACE' && (
              <>
                <div className="config-form-row">
                  <label htmlFor="search-text" className="config-label">Search</label>
                  <input
                    id="search-text"
                    type="text"
                    className="config-input"
                    value={nodeConfig.search || ''}
                    onChange={(e) => setNodeConfig({...nodeConfig, search: e.target.value})}
                    placeholder="Search text"
                  />
                </div>
                <div className="config-form-row">
                  <label htmlFor="replace-text" className="config-label">Replace With</label>
                  <input
                    id="replace-text"
                    type="text"
                    className="config-input"
                    value={nodeConfig.replace || ''}
                    onChange={(e) => setNodeConfig({...nodeConfig, replace: e.target.value})}
                    placeholder="Replace text"
                  />
                </div>
              </>
            )}
            {nodeConfig.operation && nodeConfig.column && (
              <div className="condition-preview">
                {nodeConfig.operation === 'CONCAT' && nodeConfig.concatWith
                  ? `${nodeConfig.column} || ${nodeConfig.concatWith}`
                  : nodeConfig.operation === 'REPLACE' && nodeConfig.search
                    ? `REPLACE(${nodeConfig.column}, '${nodeConfig.search}', '${nodeConfig.replace || ''}')`
                    : `${nodeConfig.operation}(${nodeConfig.column})`
                }
              </div>
            )}
          </div>
        );
        
      default:
        return null;
    }
  };

  // This is now handled by the saveTransformation function defined earlier

  return (
    <div className="transformations-page">
      <div className="transformations-header">
        <div className="transformations-header-left">
          <button 
            className="btn btn-text" 
            onClick={handleBackToMappings}
            title="Back to Mappings"
          >
            <FiArrowLeft className="icon-left" /> Back
          </button>
          <h1 className="transformations-title">
            {editing ? (
              <>
                <label htmlFor="transformation-name" style={{ display: 'none' }}>Transformation Name</label>
                <input
                  id="transformation-name"
                  type="text"
                  value={transformationName}
                  onChange={(e) => setTransformationName(e.target.value)}
                  className="inline-edit-title"
                  style={{
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    color: 'inherit',
                    border: 'none',
                    background: 'transparent',
                    width: '400px',
                    padding: '5px',
                    borderBottom: '1px dashed #ccc'
                  }}
                />
              </>
            ) : (
              <span>{transformationName}</span>
            )}
          </h1>
        </div>
        <div className="transformations-actions">
          {loading ? (
            <LoadingSpinner size="small" />
          ) : editing ? (
            <button className="btn btn-primary" onClick={saveTransformation}>
              <FiSave className="icon-left" /> Save Transformation
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <FiEdit className="icon-left" /> Edit Transformation
            </button>
          )}
        </div>
      </div>
      
      <div className="transformations-container">
        <div className="transformations-main">
          <div className="transformation-sidebar">
            <div className="palette-header">Component Palette</div>
            
            <div className="component-group">
              <div className="component-group-title">Data Sources</div>
              <div className="component-list">
                <div 
                  className="component-item" 
                  draggable 
                  onDragStart={(e) => onDragStart(e, 'source', { label: 'Source' })}
                >
                  <FiDatabase className="component-icon" />
                  <div className="component-name">Source</div>
                </div>
              </div>
            </div>
            
            <div className="component-group">
              <div className="component-group-title">Transformations</div>
              <div className="component-list">
                <div 
                  className="component-item" 
                  draggable 
                  onDragStart={(e) => onDragStart(e, 'filter', { label: 'Filter' })}
                >
                  <FiFilter className="component-icon" />
                  <div className="component-name">Filter</div>
                </div>
                <div 
                  className="component-item" 
                  draggable 
                  onDragStart={(e) => onDragStart(e, 'join', { label: 'Join' })}
                >
                  <FiShare2 className="component-icon" />
                  <div className="component-name">Join</div>
                </div>
                <div 
                  className="component-item" 
                  draggable 
                  onDragStart={(e) => onDragStart(e, 'aggregate', { label: 'Aggregate' })}
                >
                  <FiBarChart2 className="component-icon" />
                  <div className="component-name">Aggregate</div>
                </div>
                <div 
                  className="component-item" 
                  draggable 
                  onDragStart={(e) => onDragStart(e, 'transform', { label: 'Transform' })}
                >
                  <FiLayers className="component-icon" />
                  <div className="component-name">Transform</div>
                </div>
              </div>
            </div>
            
            <div className="component-group">
              <div className="component-group-title">Targets</div>
              <div className="component-list">
                <div 
                  className="component-item" 
                  draggable 
                  onDragStart={(e) => onDragStart(e, 'target', { label: 'Target' })}
                >
                  <FiFileText className="component-icon" />
                  <div className="component-name">Output</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="canvas-container" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              nodeTypes={NODE_TYPES}
              nodesDraggable={true}
              draggable={true}
              snapToGrid={true}
              snapGrid={[20, 20]}
              selectNodesOnDrag={false}
              elementsSelectable={true}
              nodesConnectable={true}
              nodesFocusable={true}
              fitView
              connectionLineType={ConnectionLineType.SmoothStep}
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: true,
                markerEnd: {
                  type: MarkerType.ArrowClosed
                }
              }}
              panOnScroll
              panOnDrag={true}
              minZoom={0.5}
              maxZoom={2}
              onNodeDragStart={(event, node) => {
                console.log('Node drag start:', node.id);
                setIsDragging(true);
                document.body.classList.add('node-dragging');
              }}
              onNodeDrag={(event, node) => {
                console.log(`Node ${node.id} position:`, node.position);
              }}
              onNodeDragStop={(event, node) => {
                console.log('Node drag stop:', node.id);
                setIsDragging(false);
                document.body.classList.remove('node-dragging');
                
                const adjustedNodes = findOptimalPositions(nodes);
                if (adjustedNodes) {
                  setNodes(adjustedNodes);
                }
              }}
            >
              <Controls />
              <Background color="#aaa" gap={16} />
              <MiniMap
                nodeStrokeColor={(n) => {
                  if (n.type === 'source') return '#0041d0';
                  if (n.type === 'target') return '#10761E';
                  return '#555';
                }}
                nodeColor={(n) => {
                  if (n.type === 'source') return '#e3f2fd';
                  if (n.type === 'target') return '#e8f5e9'; 
                  if (n.type === 'filter') return '#fff3e0';
                  if (n.type === 'join') return '#e0f7fa';
                  if (n.type === 'aggregate') return '#f3e5f5';
                  if (n.type === 'transform') return '#fce4ec';
                  return '#fff';
                }}
              />
              
              <Panel position="top-left" className="canvas-size-indicator">
                <div style={{ 
                  background: 'rgba(255,255,255,0.8)', 
                  padding: '5px 8px', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  border: '1px solid #ddd',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}>
                  Canvas: {logCanvasSize().width.toFixed(0)} × {logCanvasSize().height.toFixed(0)}
                </div>
              </Panel>
              
              <Panel position="top-right">
                <div className="flow-buttons">
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={autoArrangeNodes}
                    style={{ marginRight: '10px' }}
                  >
                    <FiGrid className="icon-left" /> Auto-Arrange
                  </button>
                  <button 
                    className="btn btn-sm btn-success" 
                    onClick={createSampleETLFlow}
                  >
                    <FiPlay className="icon-left" /> Create Sample ETL
                  </button>
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </div>
        
        <div className="transformation-info-panel">
          <h4>About Transformations:</h4>
          <p>
            Use this visual ETL designer to create data transformation workflows. 
            Drag components from the palette to the canvas, connect them, and configure each step.
          </p>
          <p>
            <strong>Tip:</strong> Click the Auto-Arrange button to automatically organize your workflow in a logical left-to-right flow.
          </p>
        </div>
      </div>
      
      {/* Node Configuration Modal */}
      {showConfig && selectedNode && (
        <div className="node-config-modal">
          <div className="node-config-overlay" onClick={closeNodeConfig}></div>
          <div className="node-config-content">
            <div className="node-config-header">
              <h3>Configure {selectedNode.type.charAt(0).toUpperCase() + selectedNode.type.slice(1)}</h3>
              <button className="node-config-close" onClick={closeNodeConfig}>
                <FiX />
              </button>
            </div>
            <div className="node-config-body">
              {renderConfigForm()}
            </div>
            <div className="node-config-footer">
              <button className="btn btn-secondary" onClick={closeNodeConfig}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveNodeConfig}>
                <FiSave /> Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transformations;