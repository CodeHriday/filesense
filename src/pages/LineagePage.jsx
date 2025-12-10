import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  getRectOfNodes,
  getTransformForBounds
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import './LineagePage.css';
import { 
  fetchLineageGraph, 
  fetchFilterOptions, 
  exportLineageGraph,
  fetchSavedLineageGraph,
  createSavedLineageGraph,
  updateSavedLineageGraph
} from '../services/lineageGraphService';
import { useToast } from '../context/ToastContext';
import NodeDetailDrawer from '../components/NodeDetailDrawer';
import { FaDownload, FaFilter, FaProjectDiagram, FaExclamationCircle, FaChevronDown, FaChevronUp, FaSave, FaArrowLeft } from 'react-icons/fa';
import { toPng, toSvg } from 'html-to-image';

// Custom node components
import VendorContractNode from '../components/lineageNodes/VendorContractNode';
import SourceFileNode from '../components/lineageNodes/SourceFileNode';
import TransformationNode from '../components/lineageNodes/TransformationNode';
import DerivedColumnNode from '../components/lineageNodes/DerivedColumnNode';
import TargetTableNode from '../components/lineageNodes/TargetTableNode';
import JobNode from '../components/lineageNodes/JobNode';
import GroupedNode from '../components/lineageNodes/GroupedNode';
import { FaUndo } from 'react-icons/fa';

const nodeTypes = {
  vendorContract: VendorContractNode,
  sourceFile: SourceFileNode,
  transformation: TransformationNode,
  derivedColumn: DerivedColumnNode,
  targetTable: TargetTableNode,
  job: JobNode,
  grouped: GroupedNode
};

const LineagePageContent = () => {
  const { graphId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const containerRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Saved graph state
  const [savedGraphId, setSavedGraphId] = useState(graphId || null);
  const [graphName, setGraphName] = useState('');
  const [graphDescription, setGraphDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  // Filters and controls
  const [rootType, setRootType] = useState('vendorAgreement');
  const [rootId, setRootId] = useState('');
  const [projectId, setProjectId] = useState(null);
  const [depth, setDepth] = useState(3);
  const [includeIncidents, setIncludeIncidents] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  
  // Filter options
  const [filterOptions, setFilterOptions] = useState({
    projects: [],
    vendors: [],
    agreements: [],
    files: []
  });
  
  // Node grouping state
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [originalGraphData, setOriginalGraphData] = useState({ nodes: [], edges: [] });
  
  // Load saved graph if graphId provided
  useEffect(() => {
    if (graphId && graphId !== 'new') {
      loadSavedGraph(graphId);
    }
  }, [graphId]);
  
  const loadSavedGraph = async (id) => {
    setLoading(true);
    try {
      const response = await fetchSavedLineageGraph(id);
      if (response.success && response.graph) {
        const graph = response.graph;
        setSavedGraphId(graph.id);
        setGraphName(graph.name);
        setGraphDescription(graph.description || '');
        setRootType(graph.root_type);
        setRootId(String(graph.root_id));
        setProjectId(graph.project_id);
        
        if (graph.graph_config) {
          setDepth(graph.graph_config.depth || 3);
          setIncludeIncidents(graph.graph_config.includeIncidents !== false);
        }
        
        if (graph.graph_data && graph.graph_data.nodes && graph.graph_data.nodes.length > 0) {
          setOriginalGraphData(graph.graph_data);
          setExpandedGroups(new Set());
        }
      } else {
        setError(response.error || 'Failed to load saved graph');
      }
    } catch (err) {
      console.error('Error loading saved graph:', err);
      setError('Failed to load saved graph');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveGraph = async () => {
    if (!graphName.trim()) {
      addToast('error', 'Name Required', 'Please enter a name for the graph');
      return;
    }
    
    if (!rootType || !rootId) {
      addToast('error', 'Configuration Required', 'Please configure and generate the graph first');
      return;
    }
    
    setSaving(true);
    try {
      const graphData = {
        nodes: originalGraphData.nodes,
        edges: originalGraphData.edges
      };
      
      const graphConfig = { depth, includeIncidents };
      
      if (savedGraphId) {
        const response = await updateSavedLineageGraph(savedGraphId, {
          name: graphName,
          description: graphDescription,
          graphConfig,
          graphData
        });
        
        if (response.success) {
          addToast('success', 'Graph Saved', 'Lineage graph has been updated');
          setShowSaveModal(false);
        } else {
          addToast('error', 'Save Failed', response.error || 'Failed to save graph');
        }
      } else {
        const response = await createSavedLineageGraph({
          name: graphName,
          description: graphDescription,
          rootType,
          rootId: parseInt(rootId),
          graphConfig,
          graphData,
          projectId: projectId ? parseInt(projectId) : null
        });
        
        if (response.success) {
          setSavedGraphId(response.graph.id);
          addToast('success', 'Graph Saved', 'Lineage graph has been created');
          setShowSaveModal(false);
          navigate(`/visual-lineage/${response.graph.id}`, { replace: true });
        } else {
          addToast('error', 'Save Failed', response.error || 'Failed to save graph');
        }
      }
    } catch (err) {
      console.error('Error saving graph:', err);
      addToast('error', 'Save Failed', err.message || 'Failed to save graph');
    } finally {
      setSaving(false);
    }
  };
  
  const handleBackToList = () => {
    navigate('/visual-lineage');
  };
  
  // Fetch filter options on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const response = await fetchFilterOptions();
        if (response.success) {
          setFilterOptions(response.filters);
        }
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    loadFilters();
  }, []);
  
  // Wait for canvas container to be measured before allowing layout
  useEffect(() => {
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    
    // Check if already measured
    if (el.clientWidth > 20 && el.clientHeight > 20) {
      setContainerReady(true);
      return;
    }
    
    // Set up ResizeObserver to wait for measurement
    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 20 && el.clientHeight > 20) {
        setContainerReady(true);
        resizeObserver.disconnect();
      }
    });
    
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);
  
  // Simple onInit handler without viewport manipulation
  const handleReactFlowInit = useCallback((instance) => {
    console.log('React Flow initialized');
    setReactFlowInstance(instance);
  }, []);
  
  // Group nodes by their level (determined by edges - nodes with same distance from root)
  const getNodeLevels = (nodes, edges) => {
    const levels = new Map();
    const visited = new Set();
    const inDegree = new Map();
    
    // Calculate in-degree for each node
    nodes.forEach(n => inDegree.set(n.id, 0));
    edges.forEach(e => {
      const currentDegree = inDegree.get(e.target) || 0;
      inDegree.set(e.target, currentDegree + 1);
    });
    
    // Find root nodes (in-degree = 0)
    let currentLevel = [];
    nodes.forEach(n => {
      if ((inDegree.get(n.id) || 0) === 0) {
        currentLevel.push(n.id);
        visited.add(n.id);
        levels.set(n.id, 0);
      }
    });
    
    // BFS to assign levels
    let level = 0;
    while (currentLevel.length > 0) {
      const nextLevel = [];
      for (const nodeId of currentLevel) {
        edges.filter(e => e.source === nodeId).forEach(e => {
          if (!visited.has(e.target)) {
            visited.add(e.target);
            levels.set(e.target, level + 1);
            nextLevel.push(e.target);
          }
        });
      }
      currentLevel = nextLevel;
      level++;
    }
    
    // Assign remaining unvisited nodes
    nodes.forEach(n => {
      if (!levels.has(n.id)) {
        levels.set(n.id, level);
      }
    });
    
    return levels;
  };
  
  // Apply node grouping - group nodes by type within each level
  const applyNodeGrouping = useCallback((nodes, edges, expanded) => {
    const levels = getNodeLevels(nodes, edges);
    
    // Group nodes by level and type
    const levelTypeGroups = new Map();
    nodes.forEach(node => {
      const level = levels.get(node.id) || 0;
      const groupKey = `${level}-${node.type}`;
      if (!levelTypeGroups.has(groupKey)) {
        levelTypeGroups.set(groupKey, []);
      }
      levelTypeGroups.get(groupKey).push(node);
    });
    
    // Build grouped nodes and update edges
    const groupedNodes = [];
    const nodeToGroup = new Map();
    
    levelTypeGroups.forEach((groupNodes, groupKey) => {
      if (groupNodes.length > 1 && !expanded.has(groupKey)) {
        // Create a grouped node
        const groupId = `group-${groupKey}`;
        const groupType = groupNodes[0].type;
        groupedNodes.push({
          id: groupId,
          type: 'grouped',
          data: {
            groupId: groupKey,
            groupType: groupType,
            count: groupNodes.length,
            nodeIds: groupNodes.map(n => n.id),
            onExpand: handleExpandGroup
          },
          position: { x: 0, y: 0 }
        });
        
        // Map original nodes to group
        groupNodes.forEach(n => nodeToGroup.set(n.id, groupId));
      } else {
        // Keep individual nodes
        groupNodes.forEach(n => {
          groupedNodes.push(n);
          nodeToGroup.set(n.id, n.id);
        });
      }
    });
    
    // Update edges to point to grouped nodes
    const edgeSet = new Set();
    const groupedEdges = [];
    edges.forEach(edge => {
      const newSource = nodeToGroup.get(edge.source) || edge.source;
      const newTarget = nodeToGroup.get(edge.target) || edge.target;
      const edgeKey = `${newSource}->${newTarget}`;
      
      if (!edgeSet.has(edgeKey) && newSource !== newTarget) {
        edgeSet.add(edgeKey);
        groupedEdges.push({
          ...edge,
          id: `${newSource}-to-${newTarget}`,
          source: newSource,
          target: newTarget
        });
      }
    });
    
    return { groupedNodes, groupedEdges };
  }, []);
  
  // Handle expanding a group
  const handleExpandGroup = useCallback((groupId, groupType) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
  }, []);
  
  // Effect to reapply grouping when expanded groups change
  useEffect(() => {
    if (originalGraphData.nodes.length > 0) {
      const { groupedNodes, groupedEdges } = applyNodeGrouping(
        originalGraphData.nodes,
        originalGraphData.edges,
        expandedGroups
      );
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        groupedNodes,
        groupedEdges,
        'LR'
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }
  }, [expandedGroups, originalGraphData, applyNodeGrouping]);
  
  // Reset all groups to collapsed state
  const handleResetGroups = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);
  
  // Load lineage graph
  const loadGraph = async () => {
    if (!rootId) {
      setError('Please select a root entity');
      return;
    }
    
    if (!containerReady) {
      setError('Canvas not ready. Please wait a moment and try again.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchLineageGraph({
        rootType,
        rootId,
        projectId,
        depth,
        includeIncidents
      });
      
      if (response.success) {
        // Transform backend nodes to React Flow format (without position initially)
        const flowNodes = response.nodes.map((node) => ({
          id: String(node.id), // Ensure string IDs
          type: node.type,
          data: { 
            ...node.metadata,
            label: node.label,
            type: node.type,
            incidents: node.incidents,
            hasIncidents: node.hasIncidents,
            derivedColumns: node.derivedColumns,
          },
          position: { x: 0, y: 0 }, // Will be set by dagre
        }));
        
        // Transform backend edges to React Flow format
        const flowEdges = response.edges.map(edge => ({
          id: edge.id,
          source: String(edge.source), // Ensure string IDs
          target: String(edge.target),
          label: edge.label,
          type: 'smoothstep',
          animated: edge.relationship === 'DERIVES',
          style: getEdgeStyle(edge.relationship),
          relationship: edge.relationship
        }));
        
        // Store original data for reset functionality
        setOriginalGraphData({ nodes: flowNodes, edges: flowEdges });
        setExpandedGroups(new Set());
        
        // Apply grouping and layout
        const { groupedNodes, groupedEdges } = applyNodeGrouping(flowNodes, flowEdges, new Set());
        
        // Apply dagre layout to position nodes based on their connections
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          groupedNodes,
          groupedEdges,
          'LR' // Left to Right layout
        );
        
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } else {
        setError(response.error || 'Failed to load lineage graph');
      }
    } catch (err) {
      setError(err.message || 'Failed to load lineage graph');
      console.error('Error loading graph:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Dagre-based hierarchical layout
  const getLayoutedElements = (nodes, edges, direction = 'LR') => {
    // Match actual CSS node dimensions (150-250px width, ~80px height)
    const nodeWidth = 220;
    const nodeHeight = 80;
    const isHorizontal = direction === 'LR';
    
    // Fallback to grid layout if no edges (disconnected nodes)
    if (!edges || edges.length === 0) {
      const cols = 4;
      const spacingX = 260;
      const spacingY = 120;
      const layoutedNodes = nodes.map((n, i) => {
        const x = (i % cols) * spacingX;
        const y = Math.floor(i / cols) * spacingY;
        return {
          ...n,
          position: { x, y },
          // Set explicit dimensions for consistent sizing
          style: {
            ...n.style,
            width: nodeWidth,
            height: nodeHeight,
          },
          // Pass handle positions to node data
          data: {
            ...n.data,
            targetPosition: 'left',
            sourcePosition: 'right',
          },
          targetPosition: 'left',
          sourcePosition: 'right'
        };
      });
      return { nodes: layoutedNodes, edges: [] };
    }
    
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    dagreGraph.setGraph({ 
      rankdir: direction,
      nodesep: 80,
      ranksep: 150,
      edgesep: 50
    });
    
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });
    
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });
    
    dagre.layout(dagreGraph);
    
    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const x = nodeWithPosition.x - nodeWidth / 2;
      const y = nodeWithPosition.y - nodeHeight / 2;
      
      return {
        ...node,
        position: { x, y },
        // Set explicit dimensions for consistent sizing
        style: {
          ...node.style,
          width: nodeWidth,
          height: nodeHeight,
        },
        // Pass handle positions to node data for components to use
        data: {
          ...node.data,
          targetPosition: isHorizontal ? 'left' : 'top',
          sourcePosition: isHorizontal ? 'right' : 'bottom',
        },
        targetPosition: isHorizontal ? 'left' : 'top',
        sourcePosition: isHorizontal ? 'right' : 'bottom',
      };
    });
    
    return { nodes: layoutedNodes, edges };
  };
  
  // Get edge styling based on relationship type
  const getEdgeStyle = (relationship) => {
    const styles = {
      SOURCE_OF: { stroke: '#3B82F6', strokeWidth: 2 },
      TRANSFORMED_BY: { stroke: '#F59E0B', strokeWidth: 2 },
      EXECUTED_BY: { stroke: '#10B981', strokeWidth: 2 },
      DERIVES: { stroke: '#8B5CF6', strokeWidth: 2, strokeDasharray: '5,5' },
      OUTPUT_TO: { stroke: '#025043', strokeWidth: 2 }
    };
    
    return styles[relationship] || { stroke: '#6B7280', strokeWidth: 1 };
  };
  
  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
    setDrawerOpen(true);
  }, []);
  
  // Export graph as PNG
  const exportAsPNG = useCallback(() => {
    const nodesBounds = getRectOfNodes(nodes);
    const transform = getTransformForBounds(
      nodesBounds,
      nodesBounds.width,
      nodesBounds.height,
      0.5,
      2
    );
    
    const viewport = document.querySelector('.react-flow__viewport');
    
    toPng(viewport, {
      backgroundColor: '#ffffff',
      width: nodesBounds.width,
      height: nodesBounds.height,
      style: {
        width: nodesBounds.width,
        height: nodesBounds.height,
        transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
      },
    }).then((dataUrl) => {
      const link = document.createElement('a');
      link.download = `lineage-graph-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }).catch((err) => {
      console.error('Error exporting PNG:', err);
    });
  }, [nodes]);
  
  // Export graph as SVG
  const exportAsSVG = useCallback(() => {
    const nodesBounds = getRectOfNodes(nodes);
    const transform = getTransformForBounds(
      nodesBounds,
      nodesBounds.width,
      nodesBounds.height,
      0.5,
      2
    );
    
    const viewport = document.querySelector('.react-flow__viewport');
    
    toSvg(viewport, {
      backgroundColor: '#ffffff',
      width: nodesBounds.width,
      height: nodesBounds.height,
      style: {
        width: nodesBounds.width,
        height: nodesBounds.height,
        transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
      },
    }).then((dataUrl) => {
      const link = document.createElement('a');
      link.download = `lineage-graph-${Date.now()}.svg`;
      link.href = dataUrl;
      link.click();
    }).catch((err) => {
      console.error('Error exporting SVG:', err);
    });
  }, [nodes]);
  
  // Export graph as JSON
  const exportAsJSON = () => {
    const graphData = {
      nodes,
      edges,
      metadata: {
        rootType,
        rootId,
        projectId,
        depth,
        exportedAt: new Date().toISOString()
      }
    };
    
    const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `lineage-graph-${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="lineage-page">
      {/* Top Controls Panel */}
      <div className="lineage-controls">
        <div className="lineage-controls-left">
          <button
            className="lineage-btn lineage-btn-secondary lineage-back-btn"
            onClick={handleBackToList}
            title="Back to list"
          >
            <FaArrowLeft /> Back
          </button>
          <h2><FaProjectDiagram /> {graphName || (graphId === 'new' ? 'New Lineage Graph' : 'Data Lineage')}</h2>
        </div>
        
        <div className="lineage-controls-right">
          <button
            className="lineage-btn lineage-btn-primary"
            onClick={() => setShowSaveModal(true)}
            disabled={originalGraphData.nodes.length === 0}
            title="Save graph"
          >
            <FaSave /> {savedGraphId ? 'Update' : 'Save'}
          </button>
          
          {expandedGroups.size > 0 && (
            <button
              className="lineage-btn lineage-btn-secondary"
              onClick={handleResetGroups}
              title="Collapse all expanded groups"
            >
              <FaUndo /> Reset View
            </button>
          )}
          
          <button
            className="lineage-btn lineage-btn-secondary"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FaFilter /> {showFilters ? 'Hide' : 'Show'} Filters
          </button>
          
          <div className="lineage-export-dropdown">
            <button className="lineage-btn lineage-btn-primary">
              <FaDownload /> Export
            </button>
            <div className="lineage-export-menu">
              <button onClick={exportAsPNG}>Export as PNG</button>
              <button onClick={exportAsSVG}>Export as SVG</button>
              <button onClick={exportAsJSON}>Export as JSON</button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Filters Panel */}
      {showFilters && (
        <div className="lineage-filters">
          <div className="lineage-filter-group">
            <label>Root Type</label>
            <select value={rootType} onChange={(e) => setRootType(e.target.value)}>
              <option value="vendorAgreement">Vendor Agreement</option>
              <option value="file">Source File</option>
            </select>
          </div>
          
          <div className="lineage-filter-group">
            <label>Root Entity</label>
            {rootType === 'vendorAgreement' && (
              <select value={rootId} onChange={(e) => setRootId(e.target.value)}>
                <option value="">Select Agreement</option>
                {filterOptions.agreements.map(ag => (
                  <option key={ag.id} value={ag.id}>
                    {ag.agreement_code} - {ag.vendor_name}
                  </option>
                ))}
              </select>
            )}
            {rootType === 'file' && (
              <select value={rootId} onChange={(e) => setRootId(e.target.value)}>
                <option value="">Select File</option>
                {filterOptions.files.map(file => (
                  <option key={file.id} value={file.id}>
                    {file.filename} ({file.file_type})
                  </option>
                ))}
              </select>
            )}
          </div>
          
          <div className="lineage-filter-group">
            <label>Depth</label>
            <select value={depth} onChange={(e) => setDepth(parseInt(e.target.value))}>
              <option value={1}>1 Level</option>
              <option value={2}>2 Levels</option>
              <option value={3}>3 Levels</option>
              <option value={4}>4 Levels</option>
              <option value={5}>5 Levels</option>
            </select>
          </div>
          
          <div className="lineage-filter-group lineage-filter-checkbox">
            <label>
              <input
                type="checkbox"
                checked={includeIncidents}
                onChange={(e) => setIncludeIncidents(e.target.checked)}
              />
              Show Quality Incidents
            </label>
          </div>
          
          <button
            className="lineage-btn lineage-btn-primary"
            onClick={loadGraph}
            disabled={loading || !rootId}
          >
            {loading ? 'Loading...' : 'Build Graph'}
          </button>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <div className="lineage-error">
          <FaExclamationCircle /> {error}
        </div>
      )}
      
      {/* React Flow Canvas */}
      <div className="lineage-canvas" ref={containerRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={handleReactFlowInit}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 100, y: 100, zoom: 0.5 }}
          minZoom={0.1}
          maxZoom={2}
          attributionPosition="bottom-left"
        >
          <Background color="#E5E7EB" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const colors = {
                vendorContract: '#6366F1',
                sourceFile: '#3B82F6',
                transformation: '#F59E0B',
                derivedColumn: '#8B5CF6',
                targetTable: '#025043',
                job: '#10B981'
              };
              return colors[node.type] || '#6B7280';
            }}
            maskColor="#f0f0f050"
          />
          
          {/* Legend Panel */}
          <Panel position="top-right" className={`lineage-legend ${legendCollapsed ? 'collapsed' : ''}`}>
            <div className="lineage-legend-header">
              <div className="lineage-legend-title">LEGEND</div>
              <button 
                className="lineage-legend-toggle" 
                onClick={() => setLegendCollapsed(!legendCollapsed)}
                aria-label={legendCollapsed ? 'Expand legend' : 'Collapse legend'}
              >
                {legendCollapsed ? <FaChevronDown /> : <FaChevronUp />}
              </button>
            </div>
            
            {!legendCollapsed && (
              <div className="lineage-legend-content">
                <div className="lineage-legend-section">NODE TYPES</div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-color" style={{ background: '#6366F1' }}></span>
                  Vendor Contract
                </div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-color" style={{ background: '#3B82F6' }}></span>
                  Source File
                </div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-color" style={{ background: '#F59E0B' }}></span>
                  Mapping Job
                </div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-color" style={{ background: '#025043' }}></span>
                  Target Table
                </div>
                
                <div className="lineage-legend-divider"></div>
                
                <div className="lineage-legend-section">DATA CLASSIFICATION</div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-badge lineage-legend-badge-phi">PHI</span>
                  Protected Health Info
                </div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-badge lineage-legend-badge-confidential">CONFIDENTIAL</span>
                  Confidential Data
                </div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-badge lineage-legend-badge-internal">INTERNAL</span>
                  Internal Use Only
                </div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-badge lineage-legend-badge-public">PUBLIC</span>
                  Public Data
                </div>
                
                <div className="lineage-legend-divider"></div>
                
                <div className="lineage-legend-section">PII INDICATORS</div>
                <div className="lineage-legend-item">
                  <span className="lineage-legend-badge lineage-legend-badge-pii">PII</span>
                  Contains PII
                </div>
              </div>
            )}
          </Panel>
        </ReactFlow>
      </div>
      
      {/* Node Detail Drawer */}
      <NodeDetailDrawer
        node={selectedNode}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      
      {/* Save Modal */}
      {showSaveModal && (
        <div className="lineage-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="lineage-modal" onClick={e => e.stopPropagation()}>
            <div className="lineage-modal-header">
              <h3>{savedGraphId ? 'Update Lineage Graph' : 'Save Lineage Graph'}</h3>
              <button 
                className="lineage-modal-close"
                onClick={() => setShowSaveModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="lineage-modal-body">
              <div className="lineage-modal-field">
                <label>Name *</label>
                <input
                  type="text"
                  value={graphName}
                  onChange={e => setGraphName(e.target.value)}
                  placeholder="Enter graph name"
                />
              </div>
              <div className="lineage-modal-field">
                <label>Description</label>
                <textarea
                  value={graphDescription}
                  onChange={e => setGraphDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div className="lineage-modal-info">
                <p><strong>Root Type:</strong> {rootType}</p>
                <p><strong>Root ID:</strong> {rootId}</p>
                <p><strong>Nodes:</strong> {originalGraphData.nodes.length}</p>
                <p><strong>Edges:</strong> {originalGraphData.edges.length}</p>
              </div>
            </div>
            <div className="lineage-modal-footer">
              <button
                className="lineage-btn lineage-btn-secondary"
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </button>
              <button
                className="lineage-btn lineage-btn-primary"
                onClick={handleSaveGraph}
                disabled={saving || !graphName.trim()}
              >
                {saving ? 'Saving...' : savedGraphId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Wrap with ReactFlowProvider
const LineagePage = () => {
  return (
    <ReactFlowProvider>
      <LineagePageContent />
    </ReactFlowProvider>
  );
};

export default LineagePage;
