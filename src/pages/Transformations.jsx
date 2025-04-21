import React, { useState, useCallback, useRef, useMemo } from 'react';
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
import 'reactflow/dist/style.css';
import '../styles/Transformations.css';
import { 
  FiDatabase, 
  FiFilter, 
  FiGrid, 
  FiLayers,
  FiShare2, 
  FiFileText, 
  FiPlus,
  FiSave,
  FiTrash2,
  FiSettings,
  FiX,
  FiSliders,
  FiBarChart2,
  FiEdit
} from 'react-icons/fi';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '../context/ToastContext';

// Custom Node Types
// Using React.memo for each custom node component to prevent unnecessary rerendering
const SourceNode = React.memo(({ data }) => {
  return (
    <div className="node-source draggable-node">
      <div className="node-header">
        <h4 className="node-title">
          <FiDatabase className="node-icon" />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div className="node-content">
        <div>{data.description || 'Source data'}</div>
        {data.metadata && (
          <div className="node-metadata">
            <small>{data.metadata}</small>
          </div>
        )}
      </div>
    </div>
  );
});

const TargetNode = React.memo(({ data }) => {
  return (
    <div className="node-target draggable-node">
      <div className="node-header">
        <h4 className="node-title">
          <FiFileText className="node-icon" />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div className="node-content">
        <div>{data.description || 'Target destination'}</div>
        {data.metadata && (
          <div className="node-metadata">
            <small>{data.metadata}</small>
          </div>
        )}
      </div>
    </div>
  );
});

const FilterNode = React.memo(({ data }) => {
  return (
    <div className="node-filter draggable-node">
      <div className="node-header">
        <h4 className="node-title">
          <FiFilter className="node-icon" />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div className="node-content">
        <div>{data.description || 'Filter data'}</div>
        {data.condition && (
          <div className="node-condition">
            <code>{data.condition}</code>
          </div>
        )}
      </div>
    </div>
  );
});

const JoinNode = React.memo(({ data }) => {
  return (
    <div className="node-join draggable-node">
      <div className="node-header">
        <h4 className="node-title">
          <FiShare2 className="node-icon" />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div className="node-content">
        <div>{data.description || 'Join data'}</div>
        {data.joinInfo && (
          <div className="node-join-info">
            <small>{data.joinInfo}</small>
          </div>
        )}
      </div>
    </div>
  );
});

const AggregateNode = React.memo(({ data }) => {
  return (
    <div className="node-aggregate draggable-node">
      <div className="node-header">
        <h4 className="node-title">
          <FiBarChart2 className="node-icon" />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div className="node-content">
        <div>{data.description || 'Aggregate data'}</div>
        {data.aggregateInfo && (
          <div className="node-aggregate-info">
            <small>{data.aggregateInfo}</small>
          </div>
        )}
      </div>
    </div>
  );
});

const TransformNode = React.memo(({ data }) => {
  return (
    <div className="node-transform draggable-node">
      <div className="node-header">
        <h4 className="node-title">
          <FiLayers className="node-icon" />
          <span>{data.label}</span>
        </h4>
        {data.actions && (
          <div className="node-actions">
            {data.actions}
          </div>
        )}
      </div>
      <div className="node-content">
        <div>{data.description || 'Transform data'}</div>
        {data.transformInfo && (
          <div className="node-transform-info">
            <small>{data.transformInfo}</small>
          </div>
        )}
      </div>
    </div>
  );
});

// Define nodeTypes outside the component
const nodeTypes = {
  source: SourceNode,
  target: TargetNode,
  filter: FilterNode,
  join: JoinNode,
  aggregate: AggregateNode,
  transform: TransformNode,
};

function Transformations() {
  // Memoize the nodeTypes to prevent recreation on each render
  const NODE_TYPES = useMemo(() => nodeTypes, []);
  const { showToast } = useToast();
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

      // Use non-overlapping position logic
      const finalPosition = findNonOverlappingPosition(position);

      const newNode = {
        id: `${type}-${uuidv4()}`,
        type,
        position: finalPosition,
        data: { 
          label,
          ...nodeData,
          onConfigure: () => openNodeConfig(newNode.id)
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

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  // Function to find a position where the node won't overlap with existing nodes
  const findNonOverlappingPosition = (initialPosition) => {
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
      return nodes.some(node => {
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

  // Function to find optimal positions for nodes to avoid overlaps
  const findOptimalPositions = (currentNodes) => {
    if (!currentNodes || currentNodes.length <= 1) return null;
    
    // Define node dimensions and padding 
    const nodeWidth = 180;
    const nodeHeight = 100;
    const padding = 20; // Increased padding for more space between nodes
    
    // Track which nodes need adjustment
    let needsAdjustment = false;
    
    // Create a copy of the nodes array to work with
    const newNodes = [...currentNodes];
    
    // Check for overlaps and adjust positions
    // We'll use a simple greedy approach for now - check each node against all others
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        const node1 = newNodes[i];
        const node2 = newNodes[j];
        
        // Calculate boundaries
        const n1Left = node1.position.x;
        const n1Right = node1.position.x + nodeWidth;
        const n1Top = node1.position.y;
        const n1Bottom = node1.position.y + nodeHeight;
        
        const n2Left = node2.position.x;
        const n2Right = node2.position.x + nodeWidth;
        const n2Top = node2.position.y;
        const n2Bottom = node2.position.y + nodeHeight;
        
        // Check for overlap
        if (
          n1Left < n2Right + padding &&
          n1Right + padding > n2Left &&
          n1Top < n2Bottom + padding &&
          n1Bottom + padding > n2Top
        ) {
          needsAdjustment = true;
          
          // Calculate overlap amount in each direction
          const overlapLeft = n2Right + padding - n1Left;
          const overlapRight = n1Right + padding - n2Left;
          const overlapTop = n2Bottom + padding - n1Top;
          const overlapBottom = n1Bottom + padding - n2Top;
          
          // Find the smallest overlap direction
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          
          // Move the second node in the direction of least overlap
          // We're moving the second node because it's likely the one that was most recently added
          if (minOverlap === overlapLeft) {
            newNodes[j] = {
              ...node2,
              position: {
                ...node2.position,
                x: node2.position.x + overlapLeft
              }
            };
          } else if (minOverlap === overlapRight) {
            newNodes[j] = {
              ...node2,
              position: {
                ...node2.position,
                x: node2.position.x - overlapRight
              }
            };
          } else if (minOverlap === overlapTop) {
            newNodes[j] = {
              ...node2,
              position: {
                ...node2.position,
                y: node2.position.y + overlapTop
              }
            };
          } else {
            newNodes[j] = {
              ...node2,
              position: {
                ...node2.position,
                y: node2.position.y - overlapBottom
              }
            };
          }
        }
      }
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
  };

  // Auto-arrange nodes in a logical layout using topological sort
  const autoArrangeNodes = () => {
    if (nodes.length === 0) return;
    
    // Define spacing constants
    const nodeWidth = 180;
    const nodeHeight = 100;
    const horizontalSpacing = 250;
    const verticalSpacing = 120;
    
    // Build a dependency graph of nodes
    const nodeMap = new Map();
    nodes.forEach((node) => {
      nodeMap.set(node.id, { 
        ...node, 
        inEdges: [], 
        outEdges: [],
        // Store node type for better arrangement
        nodeType: node.type
      });
    });
    
    // Build graph relationships based on edges
    edges.forEach(({ source, target }) => {
      nodeMap.get(source).outEdges.push(target);
      nodeMap.get(target).inEdges.push(source);
    });
    
    // Calculate levels (depth) for each node using DFS
    const levels = new Map(); // nodeId -> level
    const visited = new Set();
    
    function dfs(nodeId, depth = 0) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // Set this node's level to the maximum of current and calculated depth
      levels.set(nodeId, Math.max(levels.get(nodeId) || 0, depth));
      
      // Traverse outgoing edges
      for (const targetId of nodeMap.get(nodeId).outEdges) {
        dfs(targetId, depth + 1);
      }
    }
    
    // Start DFS from source nodes (nodes with no incoming edges or source type)
    // This ensures proper left-to-right flow
    nodes.forEach((node) => {
      const nodeData = nodeMap.get(node.id);
      if (nodeData.inEdges.length === 0 || node.type === 'source') {
        // If it's a source node or has no incoming edges, start DFS from here
        dfs(node.id);
      }
    });
    
    // If there are nodes not visited (isolated), default to level 0
    nodes.forEach(node => {
      if (!levels.has(node.id)) {
        // Favor specific node types for positioning:
        // - Source nodes: far left (level 0)
        // - Target nodes: far right (max level + 1)
        // - Other nodes: intermediate (level 1)
        if (node.type === 'source') {
          levels.set(node.id, 0);
        } else if (node.type === 'target') {
          // Find max level and place target nodes one level further
          const maxLevel = Math.max(...Array.from(levels.values(), 0)) + 1;
          levels.set(node.id, maxLevel);
        } else {
          levels.set(node.id, 1); // Default intermediate level
        }
      }
    });
    
    // Calculate vertical positions within each level
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
    
    // Process each level
    for (const [level, nodeIds] of levelGroups.entries()) {
      // Sort nodes within level by type (source first, target last)
      nodeIds.sort((a, b) => {
        const nodeA = nodeMap.get(a);
        const nodeB = nodeMap.get(b);
        
        // Source nodes should be first
        if (nodeA.nodeType === 'source') return -1;
        if (nodeB.nodeType === 'source') return 1;
        
        // Target nodes should be last
        if (nodeA.nodeType === 'target') return 1;
        if (nodeB.nodeType === 'target') return -1;
        
        return 0;
      });
      
      // Calculate vertical positions for nodes at this level
      const levelNodeCount = nodeIds.length;
      const totalHeight = (levelNodeCount - 1) * verticalSpacing;
      const startY = Math.max(30, (800 - totalHeight) / 2); // Center vertically in canvas
      
      // Position each node within its level
      nodeIds.forEach((nodeId, index) => {
        const xPos = 50 + (level * horizontalSpacing);
        const yPos = startY + (index * verticalSpacing);
        
        newPositions[nodeId] = { x: xPos, y: yPos };
      });
    }
    
    // Apply new positions to nodes
    const updatedNodes = nodes.map(node => ({
      ...node,
      position: newPositions[node.id] || node.position
    }));
    
    setNodes(updatedNodes);
  };

  // Render configuration form based on node type
  const renderConfigForm = () => {
    if (!selectedNode) return null;
    
    switch (selectedNode.type) {
      case 'source':
        return (
          <div className="config-form">
            <div className="config-form-row">
              <label className="config-label">Source File</label>
              <select
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
              <label className="config-label">Target Name</label>
              <input
                type="text"
                className="config-input"
                value={nodeConfig.targetName || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, targetName: e.target.value})}
                placeholder="Enter target name"
              />
            </div>
            <div className="config-form-row">
              <label className="config-label">Output Type</label>
              <select
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
                <label className="config-label">File Format</label>
                <select
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
              <label className="config-label">Column</label>
              <select
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
              <label className="config-label">Operator</label>
              <select
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
              <label className="config-label">Value</label>
              <input
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
              <label className="config-label">Join Type</label>
              <select
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
              <label className="config-label">Right Table</label>
              <select
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
              <label className="config-label">Left Column</label>
              <select
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
              <label className="config-label">Right Column</label>
              <select
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
              <label className="config-label">Aggregation Function</label>
              <select
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
              <label className="config-label">Column</label>
              <select
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
              <label className="config-label">Group By</label>
              <select
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
              <label className="config-label">Operation</label>
              <select
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
              <label className="config-label">Column</label>
              <select
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
                <label className="config-label">Concat With</label>
                <select
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
                  <label className="config-label">Search</label>
                  <input
                    type="text"
                    className="config-input"
                    value={nodeConfig.search || ''}
                    onChange={(e) => setNodeConfig({...nodeConfig, search: e.target.value})}
                    placeholder="Search text"
                  />
                </div>
                <div className="config-form-row">
                  <label className="config-label">Replace With</label>
                  <input
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

  // Save the transformation
  const saveTransformation = () => {
    if (nodes.length === 0) {
      showToast('warning', 'Cannot save an empty transformation. Add at least one node.');
      return;
    }
    
    // In a real implementation, this would save to the backend
    showToast('success', `Transformation "${transformationName}" saved successfully!`);
  };

  return (
    <div className="transformations-page">
      <div className="transformations-header">
        <h1 className="transformations-title">
          <input
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
        </h1>
        <div className="transformations-actions">
          <button className="btn btn-primary" onClick={saveTransformation}>
            <FiSave className="icon-left" /> Save Transformation
          </button>
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
                  type: MarkerType.ArrowClosed,
                }
              }}
              panOnScroll
              panOnDrag={true}
              minZoom={0.5}
              maxZoom={2}
              onNodeDragStart={(event, node) => {
                console.log('Node drag start:', node.id);
                setIsDragging(true);
                // Add a CSS class to the document body to disable text selection during drag
                document.body.classList.add('node-dragging');
              }}
              onNodeDrag={(event, node) => {
                // Log position for debugging
                console.log(`Node ${node.id} position:`, node.position);
              }}
              onNodeDragStop={(event, node) => {
                console.log('Node drag stop:', node.id);
                setIsDragging(false);
                document.body.classList.remove('node-dragging');
                
                // After dragging stops, ensure nodes don't overlap
                // by adjusting positions if needed
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
              <Panel position="top-right">
                <div className="flow-buttons">
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={autoArrangeNodes}
                  >
                    <FiGrid className="icon-left" /> Auto-Arrange
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