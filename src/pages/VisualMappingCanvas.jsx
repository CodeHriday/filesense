import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import './VisualMappingCanvas.css';
import axios from 'axios';
import { 
  FaSave, 
  FaPlay, 
  FaClock, 
  FaPlus, 
  FaTrash, 
  FaSearch,
  FaCog,
  FaDatabase,
  FaCode,
  FaExchangeAlt,
  FaRandom,
  FaCheckCircle,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
import SourceConfigModal from '../components/VisualMappingModals/SourceConfigModal';
import ExpressionModal from '../components/VisualMappingModals/ExpressionModal';
import RdmLookupModal from '../components/VisualMappingModals/RdmLookupModal';
import TargetRulesModal from '../components/VisualMappingModals/TargetRulesModal';
import JoinModal from '../components/VisualMappingModals/JoinModal';
import { useVisualMappingExecution } from '../hooks/useVisualMappingExecution';
import { getNodeStatusClass, getNodeStatusBadge, formatRowCount } from '../components/VisualMappingNodes/nodeUtils';

// Custom node components for different mapping node types
const SourceConfigNode = ({ data }) => {
  const statusBadge = data.statusBadge;
  
  return (
    <div className="visual-mapping-node visual-mapping-node-source">
      {statusBadge && (
        <div className={`visual-mapping-node-status-badge status-${statusBadge.text.toLowerCase()}`}>
          <span>{statusBadge.icon}</span>
        </div>
      )}
      <div className="visual-mapping-node-header">
        <FaDatabase className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.connectionName && (
        <div className="visual-mapping-node-detail">
          <strong>Connection:</strong> {data.config.connectionName}
        </div>
      )}
      {data.config?.filePattern && (
        <div className="visual-mapping-node-detail">
          <strong>Pattern:</strong> {data.config.filePattern}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.nodeId)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const ExpressionNode = ({ data }) => {
  const statusBadge = data.statusBadge;
  
  return (
    <div className="visual-mapping-node visual-mapping-node-expression">
      {statusBadge && (
        <div className={`visual-mapping-node-status-badge status-${statusBadge.text.toLowerCase()}`}>
          <span>{statusBadge.icon}</span>
        </div>
      )}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaCode className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.mappingCount && (
        <div className="visual-mapping-node-detail">
          <strong>Fields:</strong> {data.config.mappingCount}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.nodeId)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const RdmLookupNode = ({ data }) => {
  const statusBadge = data.statusBadge;
  const lookupType = data.config?.lookupType;
  const resourceName = lookupType === 'dataset' ? data.config?.datasetName : data.config?.crosswalkName;
  const lookupTypeLabel = lookupType === 'dataset' ? 'Dataset Join' : 'Crosswalk';
  
  return (
    <div className="visual-mapping-node visual-mapping-node-rdm-lookup">
      {statusBadge && (
        <div className={`visual-mapping-node-status-badge status-${statusBadge.text.toLowerCase()}`}>
          <span>{statusBadge.icon}</span>
        </div>
      )}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaExchangeAlt className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {lookupType && (
        <div className="visual-mapping-node-detail">
          <strong>Type:</strong> {lookupTypeLabel}
        </div>
      )}
      {resourceName && (
        <div className="visual-mapping-node-detail">
          <strong>Resource:</strong> {resourceName}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.nodeId)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const TargetRulesNode = ({ data }) => {
  const statusBadge = data.statusBadge;
  
  return (
    <div className="visual-mapping-node visual-mapping-node-target">
      {statusBadge && (
        <div className={`visual-mapping-node-status-badge status-${statusBadge.text.toLowerCase()}`}>
          <span>{statusBadge.icon}</span>
        </div>
      )}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaCheckCircle className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.connectionName && (
        <div className="visual-mapping-node-detail">
          <strong>Target:</strong> {data.config.connectionName}
        </div>
      )}
      {data.config?.fileName && (
        <div className="visual-mapping-node-detail">
          <strong>File:</strong> {data.config.fileName}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.nodeId)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
    </div>
  );
};

const JoinNode = ({ data }) => {
  const statusBadge = data.statusBadge;
  
  return (
    <div className="visual-mapping-node visual-mapping-node-join">
      {statusBadge && (
        <div className={`visual-mapping-node-status-badge status-${statusBadge.text.toLowerCase()}`}>
          <span>{statusBadge.icon}</span>
        </div>
      )}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="leftInput"
        style={{ top: '30%' }}
        className="visual-mapping-node-handle"
      />
      <Handle 
        type="target" 
        position={Position.Left} 
        id="rightInput"
        style={{ top: '70%' }}
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaRandom className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.joinType && (
        <div className="visual-mapping-node-detail">
          <strong>Type:</strong> {data.config.joinType}
        </div>
      )}
      {data.config?.joinKeys && (
        <div className="visual-mapping-node-detail">
          <strong>Keys:</strong> {data.config.joinKeys.length}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.nodeId)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const nodeTypes = {
  sourceConfig: SourceConfigNode,
  expression: ExpressionNode,
  rdmLookup: RdmLookupNode,
  targetRules: TargetRulesNode,
  join: JoinNode
};

const VisualMappingCanvasContent = () => {
  const navigate = useNavigate();
  const { mappingId } = useParams();
  const isEditMode = !!mappingId;
  const containerRef = useRef(null);
  
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Mapping metadata
  const [mappingName, setMappingName] = useState('');
  const [mappingDescription, setMappingDescription] = useState('');
  
  // Project context
  const [projectId, setProjectId] = useState(null);
  const [subProjectId, setSubProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  
  // Palette panel visibility
  const [showPalette, setShowPalette] = useState(true);
  const [showConfig, setShowConfig] = useState(true);
  const [showMappingDetails, setShowMappingDetails] = useState(true);
  const [showComponents, setShowComponents] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  
  // Execution tracking
  const [currentExecutionId, setCurrentExecutionId] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // WebSocket hook for real-time execution updates
  const {
    nodeStatuses,
    edgeRowCounts,
    executionProgress,
    executionComplete,
    executionError,
    resetExecution,
    isConnected
  } = useVisualMappingExecution(currentExecutionId);
  
  // Configuration modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configNodeId, setConfigNodeId] = useState(null);
  const [configNodeType, setConfigNodeType] = useState(null);
  
  // Use ref to avoid stale closure in node event handlers
  const nodesRef = useRef(nodes);
  
  // Update nodes ref whenever nodes change
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  
  // Configure button handler (must be defined before mapping load useEffect)
  const handleNodeConfigure = useCallback((nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      setConfigNodeId(nodeId);
      setConfigNodeType(node.type);
      setConfigModalOpen(true);
    }
  }, []);
  
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);
  
  // Wait for canvas container to be ready
  useEffect(() => {
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    if (el.clientWidth > 20 && el.clientHeight > 20) {
      setContainerReady(true);
      return;
    }
    
    const timeout = setTimeout(() => {
      if (el.clientWidth > 20 && el.clientHeight > 20) {
        setContainerReady(true);
      }
    }, 100);
    
    return () => clearTimeout(timeout);
  }, []);
  
  // Load projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get('/api/projects');
        setProjects(response.data);
      } catch (error) {
        console.error('Error fetching projects:', error);
      }
    };
    fetchProjects();
  }, []);
  
  // Load subprojects when project changes
  useEffect(() => {
    const fetchSubProjects = async () => {
      if (!projectId) {
        setSubProjects([]);
        return;
      }
      try {
        const response = await axios.get(`/api/projects/${projectId}/sub-projects`);
        console.log('Fetched subprojects for project', projectId, ':', response.data);
        setSubProjects(response.data.subProjects || []);
      } catch (error) {
        console.error('Error fetching subprojects:', error);
        setSubProjects([]);
      }
    };
    fetchSubProjects();
  }, [projectId]);
  
  // Load existing mapping if in edit mode
  useEffect(() => {
    const fetchMapping = async () => {
      if (!isEditMode) return;
      
      setLoading(true);
      try {
        const response = await axios.get(`/api/visual-mappings/${mappingId}`);
        const mapping = response.data;
        
        setMappingName(mapping.name);
        setMappingDescription(mapping.description || '');
        setProjectId(mapping.project_id);
        setSubProjectId(mapping.sub_project_id);
        
        if (mapping.graph_data && mapping.graph_data.nodes) {
          const loadedNodes = mapping.graph_data.nodes.map(node => ({
            ...node,
            data: {
              ...node.data,
              nodeId: node.id,
              onConfigure: handleNodeConfigure
            }
          }));
          setNodes(loadedNodes);
          setEdges(mapping.graph_data.edges || []);
        }
        
        if (mapping.canvas_state && reactFlowInstance) {
          reactFlowInstance.setViewport({
            x: mapping.canvas_state.position?.[0] || 0,
            y: mapping.canvas_state.position?.[1] || 0,
            zoom: mapping.canvas_state.zoom || 1
          });
        }
      } catch (error) {
        console.error('Error loading visual mapping:', error);
        setError('Failed to load visual mapping');
      } finally {
        setLoading(false);
      }
    };
    
    fetchMapping();
  }, [mappingId, isEditMode, reactFlowInstance]);
  
  const handleSaveNodeConfig = useCallback((config) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === configNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config,
              label: config.name || config.connectionName || node.data.label
            }
          };
        }
        return node;
      })
    );
    setConfigModalOpen(false);
    setConfigNodeId(null);
    setConfigNodeType(null);
  }, [configNodeId, setNodes]);
  
  const getCurrentNodeConfig = useCallback(() => {
    const node = nodes.find(n => n.id === configNodeId);
    return node?.data?.config || {};
  }, [nodes, configNodeId]);
  
  const getCumulativeSchema = useCallback(() => {
    // Recursively extract schema from upstream nodes based on node type
    if (!configNodeId) {
      console.log('getCumulativeSchema: No configNodeId');
      return [];
    }
    
    const visited = new Set();
    
    const getNodeOutputSchema = (nodeId) => {
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);
      
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return [];
      
      const config = node.data?.config || {};
      
      // Source Config: has explicit schema
      if (node.type === 'sourceConfig' && config.schema) {
        const transformedSchema = config.schema.map(col => ({
          name: col.column_name || col.name,
          type: col.data_type || col.type,
          description: col.description,
          contains_pii: col.contains_pii || col.pii || false
        }));
        console.log(`getCumulativeSchema: Source Config node ${nodeId} output schema:`, transformedSchema.length, 'columns');
        return transformedSchema;
      }
      
      // Expression: output schema comes from fieldMappings
      if (node.type === 'expression' && config.fieldMappings) {
        // Get upstream schema first
        const upstreamEdges = edges.filter(e => e.target === nodeId);
        let upstreamSchema = [];
        upstreamEdges.forEach(edge => {
          upstreamSchema = [...upstreamSchema, ...getNodeOutputSchema(edge.source)];
        });
        
        // Map to output columns based on field mappings
        const outputSchema = config.fieldMappings.map(mapping => {
          const sourceCol = upstreamSchema.find(col => col.name === mapping.source_field);
          // Check if this target field is marked as PII in config.piiColumns
          const isPiiFromConfig = config.piiColumns && config.piiColumns.includes(mapping.target_field);
          
          return {
            name: mapping.target_field,
            type: sourceCol?.type || 'unknown',
            description: sourceCol?.description || '',
            contains_pii: isPiiFromConfig || sourceCol?.contains_pii || false
          };
        });
        console.log(`getCumulativeSchema: Expression node ${nodeId} output schema:`, outputSchema.length, 'columns');
        return outputSchema;
      }
      
      // RDM Lookup: handles both dataset joins and crosswalk lookups
      if (node.type === 'rdmLookup') {
        const upstreamEdges = edges.filter(e => e.target === nodeId);
        let schema = [];
        upstreamEdges.forEach(edge => {
          schema = [...schema, ...getNodeOutputSchema(edge.source)];
        });
        
        // If it's a dataset join with column mappings, add the mapped columns
        if (config.lookupType === 'dataset' && config.columnMappings) {
          const datasetCols = config.columnMappings.map(mapping => ({
            name: mapping.target || mapping.source,
            type: mapping.type || 'unknown',
            description: mapping.description || '',
            contains_pii: mapping.contains_pii || false
          }));
          schema = [...schema, ...datasetCols];
        }
        
        console.log(`getCumulativeSchema: RDM Lookup (${config.lookupType}) node ${nodeId} output schema:`, schema.length, 'columns');
        return schema;
      }
      
      // Join: output schema comes from outputSchema config
      if (node.type === 'join' && config.outputSchema) {
        console.log(`getCumulativeSchema: Join node ${nodeId} output schema:`, config.outputSchema.length, 'columns');
        return config.outputSchema;
      }
      
      return [];
    };
    
    // Get schema from immediate upstream nodes
    const upstreamEdges = edges.filter(e => e.target === configNodeId);
    const sourceNodeIds = upstreamEdges.map(e => e.source);
    
    console.log('getCumulativeSchema: Found upstream nodes:', sourceNodeIds);
    
    let schema = [];
    upstreamEdges.forEach(edge => {
      schema = [...schema, ...getNodeOutputSchema(edge.source)];
    });
    
    console.log('getCumulativeSchema: Final schema:', schema);
    return schema;
  }, [nodes, edges, configNodeId]);
  
  const addNode = (type, label) => {
    const nodeId = `${type}-${Date.now()}`;
    const newNode = {
      id: nodeId,
      type,
      position: { 
        x: Math.random() * 300 + 100, 
        y: Math.random() * 300 + 100 
      },
      data: { 
        label,
        config: {},
        nodeId: nodeId,
        onConfigure: handleNodeConfigure
      }
    };
    setNodes((nds) => [...nds, newNode]);
  };
  
  const validateMapping = () => {
    const errors = [];
    
    // Check mapping name
    if (!mappingName.trim()) {
      errors.push('Mapping name is required');
    }
    
    // Check project
    if (!projectId) {
      errors.push('Project must be selected');
    }
    
    // Check for at least one source node
    const sourceNodes = nodes.filter(n => n.type === 'sourceConfig');
    if (sourceNodes.length === 0) {
      errors.push('At least one Source Configuration node is required');
    }
    
    // Check for at least one target node
    const targetNodes = nodes.filter(n => n.type === 'targetRules');
    if (targetNodes.length === 0) {
      errors.push('At least one Target Rules node is required');
    }
    
    // Check each source node is configured
    sourceNodes.forEach(node => {
      if (!node.data.config || !node.data.config.connectionId) {
        errors.push(`Source node "${node.data.label}" is not configured - missing connection`);
      }
      if (!node.data.config || !node.data.config.filePattern) {
        errors.push(`Source node "${node.data.label}" is not configured - missing file pattern`);
      }
      if (!node.data.config || !node.data.config.schema || node.data.config.schema.length === 0) {
        errors.push(`Source node "${node.data.label}" is not configured - missing schema`);
      }
    });
    
    // Check each target node is configured
    targetNodes.forEach(node => {
      if (!node.data.config || !node.data.config.connectionId) {
        errors.push(`Target node "${node.data.label}" is not configured - missing connection`);
      }
      if (!node.data.config || !node.data.config.filePath) {
        errors.push(`Target node "${node.data.label}" is not configured - missing file path`);
      }
      if (!node.data.config || !node.data.config.fileName) {
        errors.push(`Target node "${node.data.label}" is not configured - missing file name`);
      }
      
      // Check if target node has upstream connections
      const hasUpstream = edges.some(e => e.target === node.id);
      if (!hasUpstream) {
        errors.push(`Target node "${node.data.label}" has no upstream connections`);
      }
    });
    
    // Check expression nodes
    const expressionNodes = nodes.filter(n => n.type === 'expressions');
    expressionNodes.forEach(node => {
      if (!node.data.config || !node.data.config.fieldMappings || node.data.config.fieldMappings.length === 0) {
        errors.push(`Expression node "${node.data.label}" has no field mappings configured`);
      }
      
      // Check if expression node has upstream connections
      const hasUpstream = edges.some(e => e.target === node.id);
      if (!hasUpstream) {
        errors.push(`Expression node "${node.data.label}" has no upstream connections`);
      }
    });
    
    // Check RDM nodes
    const rdmDatasetNodes = nodes.filter(n => n.type === 'rdmDataset');
    rdmDatasetNodes.forEach(node => {
      if (!node.data.config || !node.data.config.datasetId) {
        errors.push(`RDM Dataset node "${node.data.label}" is not configured - missing dataset selection`);
      }
      
      const hasUpstream = edges.some(e => e.target === node.id);
      if (!hasUpstream) {
        errors.push(`RDM Dataset node "${node.data.label}" has no upstream connections`);
      }
    });
    
    const rdmCrosswalkNodes = nodes.filter(n => n.type === 'rdmCrosswalk');
    rdmCrosswalkNodes.forEach(node => {
      if (!node.data.config || !node.data.config.crosswalkId) {
        errors.push(`RDM Crosswalk node "${node.data.label}" is not configured - missing crosswalk selection`);
      }
      
      const hasUpstream = edges.some(e => e.target === node.id);
      if (!hasUpstream) {
        errors.push(`RDM Crosswalk node "${node.data.label}" has no upstream connections`);
      }
    });
    
    // Check for disconnected nodes (except source nodes which can be entry points)
    const nonSourceNodes = nodes.filter(n => n.type !== 'sourceConfig');
    nonSourceNodes.forEach(node => {
      const hasIncoming = edges.some(e => e.target === node.id);
      if (!hasIncoming && node.type !== 'targetRules') {
        errors.push(`Node "${node.data.label}" is disconnected - no incoming connections`);
      }
    });
    
    setValidationErrors(errors);
    
    if (errors.length > 0) {
      setShowValidationErrors(true);
      setError(`Validation failed: ${errors.length} issue(s) found`);
      return false;
    } else {
      setShowValidationErrors(false);
      setSuccess('Validation passed - no issues found');
      return true;
    }
  };
  
  const saveMapping = async () => {
    if (!mappingName.trim()) {
      setError('Please enter a mapping name');
      return;
    }
    
    if (!projectId) {
      setError('Please select a project');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const canvasState = reactFlowInstance ? {
        zoom: reactFlowInstance.getZoom(),
        position: [reactFlowInstance.getViewport().x, reactFlowInstance.getViewport().y]
      } : { zoom: 1, position: [0, 0] };
      
      const payload = {
        name: mappingName,
        description: mappingDescription,
        project_id: projectId,
        sub_project_id: subProjectId,
        graph_data: {
          nodes: nodes.map(n => ({
            ...n,
            data: {
              ...n.data,
              onConfigure: undefined  // Remove function before saving
            }
          })),
          edges
        },
        canvas_state: canvasState
      };
      
      if (isEditMode) {
        await axios.put(`/api/visual-mappings/${mappingId}`, payload);
        setSuccess('Visual mapping updated successfully');
      } else {
        const response = await axios.post('/api/visual-mappings', payload);
        setSuccess('Visual mapping created successfully');
        navigate(`/visual-mappings/${response.data.id}`);
      }
    } catch (error) {
      console.error('Error saving visual mapping:', error);
      setError(error.response?.data?.error || 'Failed to save visual mapping');
    } finally {
      setSaving(false);
    }
  };
  
  const executeMapping = async () => {
    if (!isEditMode) {
      setError('Please save the mapping before executing');
      return;
    }
    
    try {
      resetExecution(); // Clear previous execution state
      setIsExecuting(true);
      setError(null);
      
      const response = await axios.post(`/api/visual-mappings/${mappingId}/execute`);
      setCurrentExecutionId(response.data.execution_id); // Enable WebSocket tracking
      setSuccess(`Execution started - monitoring real-time progress`);
    } catch (error) {
      console.error('Error executing mapping:', error);
      setError(error.response?.data?.error || 'Failed to execute mapping');
      setIsExecuting(false);
    }
  };
  
  // Handle execution completion or error
  useEffect(() => {
    if (executionComplete) {
      setIsExecuting(false);
      setSuccess('Execution completed successfully!');
      setTimeout(() => setCurrentExecutionId(null), 5000); // Clear execution ID after 5 seconds
    }
  }, [executionComplete]);
  
  useEffect(() => {
    if (executionError) {
      setIsExecuting(false);
      setError(`Execution failed: ${executionError.message}`);
      setTimeout(() => setCurrentExecutionId(null), 5000);
    }
  }, [executionError]);
  
  // Auto-dismiss success message after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);
  
  // Auto-dismiss error message after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  // Update node classes with execution status
  useEffect(() => {
    if (!isExecuting) return;
    
    setNodes((nds) => 
      nds.map((node) => {
        const status = nodeStatuses[node.id];
        const statusClass = status ? getNodeStatusClass(status.status) : '';
        
        return {
          ...node,
          className: `${node.className || ''} ${statusClass}`.trim(),
          data: {
            ...node.data,
            executionStatus: status,
            statusBadge: status ? getNodeStatusBadge(status.status) : null
          }
        };
      })
    );
  }, [nodeStatuses, isExecuting]);
  
  // Update edges with row counts
  useEffect(() => {
    if (!isExecuting) return;
    
    setEdges((eds) => 
      eds.map((edge) => {
        const edgeKey = `${edge.source}-${edge.target}`;
        const rowCount = edgeRowCounts[edgeKey];
        
        if (rowCount !== undefined) {
          return {
            ...edge,
            label: formatRowCount(rowCount),
            labelStyle: { fill: 'white', fontWeight: 600 },
            labelBgStyle: { fill: '#025043' }
          };
        }
        return edge;
      })
    );
  }, [edgeRowCounts, isExecuting]);
  
  const deleteSelected = () => {
    setNodes((nds) => nds.filter(node => !node.selected));
    setEdges((eds) => eds.filter(edge => !edge.selected));
  };
  
  return (
    <div className="visual-mapping-canvas-container">
      {/* Top Toolbar */}
      <div className="visual-mapping-toolbar">
        <div className="visual-mapping-toolbar-left">
          <h2 className="visual-mapping-title">
            {isEditMode ? 'Edit Visual Mapping' : 'New Visual Mapping'}
          </h2>
          {mappingName && <span className="visual-mapping-name-display">: {mappingName}</span>}
        </div>
        <div className="visual-mapping-toolbar-right">
          <button onClick={() => navigate('/visual-mappings/manage')} className="visual-mapping-toolbar-btn">
            Back to List
          </button>
          <button onClick={deleteSelected} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-danger">
            <FaTrash /> Delete Selected
          </button>
          <button onClick={saveMapping} disabled={saving} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-primary">
            <FaSave /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={validateMapping} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-info">
            <FaCheckCircle /> Validate
          </button>
          <button onClick={executeMapping} disabled={!isEditMode} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-success">
            <FaPlay /> Run
          </button>
        </div>
      </div>
      
      {error && <div className="visual-mapping-error">{error}</div>}
      {success && <div className="visual-mapping-success">{success}</div>}
      
      {/* Validation Errors Panel */}
      {showValidationErrors && validationErrors.length > 0 && (
        <div className="visual-mapping-validation-panel">
          <div className="visual-mapping-validation-header" onClick={() => setShowValidationErrors(!showValidationErrors)}>
            <h3>Validation Issues ({validationErrors.length})</h3>
            <button className="visual-mapping-validation-close" onClick={(e) => {
              e.stopPropagation();
              setShowValidationErrors(false);
              setValidationErrors([]);
            }}>×</button>
          </div>
          <div className="visual-mapping-validation-errors">
            <ul>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      <div className="visual-mapping-content">
        {/* Left Palette Panel */}
        {showPalette && (
          <div className={`visual-mapping-palette ${sidebarCollapsed ? 'collapsed' : ''}`}>
            {/* Sidebar Toggle Button */}
            <button 
              className="visual-mapping-sidebar-toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {sidebarCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
            </button>
            
            {!sidebarCollapsed && (
              <>
            {/* Mapping Details Section */}
            <div className="visual-mapping-sidebar-section">
              <div 
                className="visual-mapping-sidebar-header" 
                onClick={() => setShowMappingDetails(!showMappingDetails)}
              >
                <h3>Mapping Details</h3>
                {showMappingDetails ? <FaChevronUp /> : <FaChevronDown />}
              </div>
              {showMappingDetails && (
                <div className="visual-mapping-sidebar-content">
                  <div className="visual-mapping-form-group">
                    <label>Mapping Name</label>
                    <input 
                      type="text"
                      value={mappingName}
                      onChange={(e) => setMappingName(e.target.value)}
                      placeholder="Enter mapping name"
                      className="visual-mapping-input"
                    />
                  </div>
                  <div className="visual-mapping-form-group">
                    <label>Description</label>
                    <textarea 
                      value={mappingDescription}
                      onChange={(e) => setMappingDescription(e.target.value)}
                      placeholder="Enter description"
                      className="visual-mapping-textarea"
                      rows="2"
                    />
                  </div>
                  <div className="visual-mapping-form-group">
                    <label>Project</label>
                    <select
                      value={projectId || ''}
                      onChange={(e) => setProjectId(parseInt(e.target.value) || null)}
                      className="visual-mapping-select"
                    >
                      <option value="">Select Project</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {projectId && (
                    <div className="visual-mapping-form-group">
                      <label>Sub-Project (Optional)</label>
                      <select
                        value={subProjectId || ''}
                        onChange={(e) => setSubProjectId(parseInt(e.target.value) || null)}
                        className="visual-mapping-select"
                      >
                        <option value="">None</option>
                        {Array.isArray(subProjects) && subProjects.map(sp => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mapping Components Section */}
            <div className="visual-mapping-sidebar-section">
              <div 
                className="visual-mapping-sidebar-header" 
                onClick={() => setShowComponents(!showComponents)}
              >
                <h3>Mapping Components</h3>
                {showComponents ? <FaChevronUp /> : <FaChevronDown />}
              </div>
              {showComponents && (
                <div className="visual-mapping-sidebar-content">
                  <div className="visual-mapping-palette-section">
                    <h4>Data Sources</h4>
                    <button 
                      onClick={() => addNode('sourceConfig', 'Source Config')}
                      className="visual-mapping-palette-item"
                    >
                      <FaDatabase /> Source Config
                    </button>
                  </div>
                  
                  <div className="visual-mapping-palette-section">
                    <h4>Transformations</h4>
                    <button 
                      onClick={() => addNode('expression', 'Expressions')}
                      className="visual-mapping-palette-item"
                    >
                      <FaCode /> Expressions
                    </button>
                    <button 
                      onClick={() => addNode('join', 'Join')}
                      className="visual-mapping-palette-item"
                    >
                      <FaRandom /> Join
                    </button>
                  </div>
                  
                  <div className="visual-mapping-palette-section">
                    <h4>RDM Lookups</h4>
                    <button 
                      onClick={() => addNode('rdmLookup', 'RDM Lookup')}
                      className="visual-mapping-palette-item"
                    >
                      <FaExchangeAlt /> RDM Lookup
                    </button>
                  </div>
                  
                  <div className="visual-mapping-palette-section">
                    <h4>Output</h4>
                    <button 
                      onClick={() => addNode('targetRules', 'Target Rules')}
                      className="visual-mapping-palette-item"
                    >
                      <FaCheckCircle /> Target Rules
                    </button>
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        )}
        
        {/* Canvas */}
        <div className="visual-mapping-canvas-wrapper" ref={containerRef}>
          {containerReady && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
            >
              <MiniMap />
              <Controls />
              <Background />
            </ReactFlow>
          )}
        </div>
      </div>
      
      {/* Execution Progress Bar */}
      {isExecuting && executionProgress !== null && (
        <div className="visual-mapping-execution-progress">
          <div 
            className="visual-mapping-execution-progress-bar"
            style={{ width: `${executionProgress}%` }}
          />
        </div>
      )}
      
      {/* WebSocket Connection Status */}
      {isExecuting && (
        <div className={`visual-mapping-connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          <div className="visual-mapping-connection-status-dot" />
          <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
        </div>
      )}
      
      {/* Configuration Modals */}
      {configNodeType === 'sourceConfig' && (
        <SourceConfigModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
        />
      )}
      
      {configNodeType === 'expression' && (
        <ExpressionModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          schema={getCumulativeSchema()}
        />
      )}
      
      {configNodeType === 'rdmLookup' && (
        <RdmLookupModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          cumulativeSchema={getCumulativeSchema()}
        />
      )}
      
      {configNodeType === 'targetRules' && (
        <TargetRulesModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          projectId={projectId}
          outputSchema={getCumulativeSchema()}
        />
      )}
      
      {configNodeType === 'join' && (
        <JoinModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          leftSchema={(() => {
            const leftEdges = edges.filter(e => e.target === configNodeId && e.targetHandle === 'leftInput');
            if (leftEdges.length === 0) return [];
            const leftNode = nodes.find(n => n.id === leftEdges[0].source);
            if (!leftNode) return [];
            const visited = new Set();
            const getNodeOutputSchema = (nodeId) => {
              if (visited.has(nodeId)) return [];
              visited.add(nodeId);
              const node = nodes.find(n => n.id === nodeId);
              if (!node) return [];
              const config = node.data?.config || {};
              if (node.type === 'sourceConfig' && config.schema) {
                return config.schema.map(col => ({ name: col.name || col, type: col.type || 'STRING' }));
              }
              if (node.type === 'expression' && config.fieldMappings) {
                return config.fieldMappings.map(m => ({ name: m.targetField, type: 'STRING' }));
              }
              if (node.type === 'join' && config.outputSchema) {
                return config.outputSchema;
              }
              const upstreamEdges = edges.filter(e => e.target === nodeId);
              let schema = [];
              upstreamEdges.forEach(edge => {
                schema = [...schema, ...getNodeOutputSchema(edge.source)];
              });
              return schema;
            };
            return getNodeOutputSchema(leftEdges[0].source);
          })()}
          rightSchema={(() => {
            const rightEdges = edges.filter(e => e.target === configNodeId && e.targetHandle === 'rightInput');
            if (rightEdges.length === 0) return [];
            const rightNode = nodes.find(n => n.id === rightEdges[0].source);
            if (!rightNode) return [];
            const visited = new Set();
            const getNodeOutputSchema = (nodeId) => {
              if (visited.has(nodeId)) return [];
              visited.add(nodeId);
              const node = nodes.find(n => n.id === nodeId);
              if (!node) return [];
              const config = node.data?.config || {};
              if (node.type === 'sourceConfig' && config.schema) {
                return config.schema.map(col => ({ name: col.name || col, type: col.type || 'STRING' }));
              }
              if (node.type === 'expression' && config.fieldMappings) {
                return config.fieldMappings.map(m => ({ name: m.targetField, type: 'STRING' }));
              }
              if (node.type === 'join' && config.outputSchema) {
                return config.outputSchema;
              }
              const upstreamEdges = edges.filter(e => e.target === nodeId);
              let schema = [];
              upstreamEdges.forEach(edge => {
                schema = [...schema, ...getNodeOutputSchema(edge.source)];
              });
              return schema;
            };
            return getNodeOutputSchema(rightEdges[0].source);
          })()}
        />
      )}
    </div>
  );
};

const VisualMappingCanvas = () => {
  return (
    <ReactFlowProvider>
      <VisualMappingCanvasContent />
    </ReactFlowProvider>
  );
};

export default VisualMappingCanvas;
