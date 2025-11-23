import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { fetchLineageGraph, fetchFilterOptions, exportLineageGraph } from '../services/lineageGraphService';
import NodeDetailDrawer from '../components/NodeDetailDrawer';
import { FaDownload, FaFilter, FaProjectDiagram, FaExclamationCircle } from 'react-icons/fa';
import { toPng, toSvg } from 'html-to-image';

// Custom node components
import VendorContractNode from '../components/lineageNodes/VendorContractNode';
import SourceFileNode from '../components/lineageNodes/SourceFileNode';
import TransformationNode from '../components/lineageNodes/TransformationNode';
import DerivedColumnNode from '../components/lineageNodes/DerivedColumnNode';
import TargetTableNode from '../components/lineageNodes/TargetTableNode';
import JobNode from '../components/lineageNodes/JobNode';

const nodeTypes = {
  vendorContract: VendorContractNode,
  sourceFile: SourceFileNode,
  transformation: TransformationNode,
  derivedColumn: DerivedColumnNode,
  targetTable: TargetTableNode,
  job: JobNode
};

const LineagePageContent = () => {
  const containerRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters and controls
  const [rootType, setRootType] = useState('vendorAgreement');
  const [rootId, setRootId] = useState('');
  const [projectId, setProjectId] = useState(null);
  const [depth, setDepth] = useState(3);
  const [includeIncidents, setIncludeIncidents] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  
  // Filter options
  const [filterOptions, setFilterOptions] = useState({
    projects: [],
    vendors: [],
    agreements: [],
    files: []
  });
  
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
            derivedColumns: node.derivedColumns
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
          style: getEdgeStyle(edge.relationship)
        }));
        
        // Apply dagre layout to position nodes based on their connections
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          flowNodes,
          flowEdges,
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
          // Force inline transform style
          style: {
            ...n.style,
            transform: `translate(${x}px, ${y}px)`,
            width: nodeWidth,
            height: nodeHeight,
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
        // Force inline transform style to bypass any CSS conflicts
        style: {
          ...node.style,
          transform: `translate(${x}px, ${y}px)`,
          width: nodeWidth,
          height: nodeHeight,
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
          <h2><FaProjectDiagram /> Data Lineage</h2>
        </div>
        
        <div className="lineage-controls-right">
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
          <Panel position="top-right" className="lineage-legend">
            <div className="lineage-legend-title">Legend</div>
            
            <div className="lineage-legend-section">Node Types</div>
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
            
            <div className="lineage-legend-section">Data Classification</div>
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
            
            <div className="lineage-legend-section">PII Indicators</div>
            <div className="lineage-legend-item">
              <span className="lineage-legend-badge lineage-legend-badge-pii">PII</span>
              Contains PII
            </div>
          </Panel>
        </ReactFlow>
      </div>
      
      {/* Node Detail Drawer */}
      <NodeDetailDrawer
        node={selectedNode}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
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
