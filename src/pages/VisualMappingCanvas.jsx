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
  FaTrash, 
  FaDatabase,
  FaCode,
  FaExchangeAlt,
  FaRandom,
  FaCheckCircle,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight,
  FaRedo,
  FaTerminal,
  FaExclamationTriangle
} from 'react-icons/fa';
import { FiPlay } from 'react-icons/fi';
import PropTypes from 'prop-types';
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
    <div className="visual-mapping-node visual-mapping-node-source" title={data.config?.description || ''}>
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
  console.log('ExpressionNode rendering with data:', data?.label);
  
  return (
    <div className="visual-mapping-node visual-mapping-node-expression" title={data.config?.description || ''}>
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
  console.log('RdmLookupNode rendering with data:', data?.label);
  const lookupType = data.config?.lookupType;
  const resourceName = lookupType === 'dataset' ? data.config?.datasetName : data.config?.crosswalkName;
  const lookupTypeLabel = lookupType === 'dataset' ? 'Dataset Join' : 'Crosswalk';
  
  return (
    <div className="visual-mapping-node visual-mapping-node-rdm-lookup" title={data.config?.description || ''}>
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
  console.log('TargetRulesNode rendering with data:', data?.label);
  
  return (
    <div className="visual-mapping-node visual-mapping-node-target" title={data.config?.description || ''}>
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
    <div className="visual-mapping-node visual-mapping-node-join" title={data.config?.description || ''}>
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

// Prop validation for custom node components used by React Flow
SourceConfigNode.propTypes = {
  data: PropTypes.shape({
    statusBadge: PropTypes.shape({ text: PropTypes.string, icon: PropTypes.node }),
    config: PropTypes.object,
    label: PropTypes.string,
    onConfigure: PropTypes.func,
    nodeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired,
};

ExpressionNode.propTypes = {
  data: PropTypes.shape({
    statusBadge: PropTypes.shape({ text: PropTypes.string, icon: PropTypes.node }),
    config: PropTypes.object,
    label: PropTypes.string,
    onConfigure: PropTypes.func,
    nodeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired,
};

RdmLookupNode.propTypes = {
  data: PropTypes.shape({
    statusBadge: PropTypes.shape({ text: PropTypes.string, icon: PropTypes.node }),
    config: PropTypes.object,
    label: PropTypes.string,
    onConfigure: PropTypes.func,
    nodeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired,
};

TargetRulesNode.propTypes = {
  data: PropTypes.shape({
    statusBadge: PropTypes.shape({ text: PropTypes.string, icon: PropTypes.node }),
    config: PropTypes.object,
    label: PropTypes.string,
    onConfigure: PropTypes.func,
    nodeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired,
};

JoinNode.propTypes = {
  data: PropTypes.shape({
    statusBadge: PropTypes.shape({ text: PropTypes.string, icon: PropTypes.node }),
    config: PropTypes.object,
    label: PropTypes.string,
    onConfigure: PropTypes.func,
    nodeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired,
};

const formatRunDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    // Use ISO format for consistency with log timestamps
    return date.toISOString();
  } catch {
    return dateStr;
  }
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
  
  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: false,
    emailConnectionId: null,
    recipients: '',
    notifyOnSuccess: true,
    notifyOnFailure: true
  });
  const [emailConnections, setEmailConnections] = useState([]);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  
  // Palette panel visibility
  const [showPalette, setShowPalette] = useState(true);
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
  
  // Console panel state
  const [showConsole, setShowConsole] = useState(false);
  const [consolePanelHeight, setConsolePanelHeight] = useState(200);
  const [isResizingConsole, setIsResizingConsole] = useState(false);
  const consoleRef = useRef(null);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  
  // WebSocket hook for real-time execution updates
  const {
    nodeStatuses,
    edgeRowCounts,
    executionProgress,
    executionComplete,
    executionError,
    executionRuns,
    startNewRun,
    updateRunStatus,
    resetExecution,
    clearLogs,
    isConnected,
    subscribeToExecution,
    generateExecutionId,
    loadRunsFromBackend,
    persistCompletedRun,
    checkRunningExecution,
    pollExecutionStatus
  } = useVisualMappingExecution();
  
  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    
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
  
  // Connection validation: enforce single in/out link per node
  // Source nodes: 1 output only, no inputs
  // Target nodes: 1 input only, no outputs
  // Expression/RDM/Join nodes: 1 input and 1 output only
  const isValidConnection = useCallback((connection, currentEdges) => {
    const { source, target } = connection;
    
    // Find node types
    const sourceNode = nodes.find(n => n.id === source);
    const targetNode = nodes.find(n => n.id === target);
    
    if (!sourceNode || !targetNode) {
      return { valid: false, reason: 'Invalid nodes' };
    }
    
    const sourceType = sourceNode.type;
    const targetType = targetNode.type;
    
    // Count existing connections for source node (outgoing)
    const sourceOutgoingCount = currentEdges.filter(e => e.source === source).length;
    
    // Count existing connections for target node (incoming)
    const targetIncomingCount = currentEdges.filter(e => e.target === target).length;
    
    // Validate source node output limit
    // All nodes can only have 1 outgoing connection
    if (sourceOutgoingCount >= 1) {
      return { 
        valid: false, 
        reason: `${sourceType === 'sourceConfig' ? 'Source' : sourceType === 'expression' ? 'Expression' : sourceType === 'rdmLookup' ? 'RDM Lookup' : sourceType === 'join' ? 'Join' : 'This'} node already has an outgoing connection` 
      };
    }
    
    // Validate target node input limit
    // All nodes can only have 1 incoming connection (except source nodes which have 0, and join nodes which have 2)
    if (targetType === 'sourceConfig') {
      return { valid: false, reason: 'Source nodes cannot have incoming connections' };
    }
    
    // Special handling for Join nodes - they accept exactly 2 inputs (leftInput and rightInput handles)
    if (targetType === 'join') {
      const targetHandle = connection.targetHandle;
      
      // Check if this specific handle already has a connection
      const handleAlreadyConnected = currentEdges.some(
        e => e.target === target && e.targetHandle === targetHandle
      );
      
      if (handleAlreadyConnected) {
        const handleLabel = targetHandle === 'leftInput' ? 'Left input' : 'Right input';
        return { 
          valid: false, 
          reason: `${handleLabel} of Join node already has a connection` 
        };
      }
      
      // Join node can have at most 2 incoming connections total
      if (targetIncomingCount >= 2) {
        return { 
          valid: false, 
          reason: 'Join node already has both inputs connected' 
        };
      }
    } else if (targetIncomingCount >= 1) {
      return { 
        valid: false, 
        reason: `${targetType === 'targetRules' ? 'Target' : targetType === 'expression' ? 'Expression' : targetType === 'rdmLookup' ? 'RDM Lookup' : 'This'} node already has an incoming connection` 
      };
    }
    
    // Prevent self-connections
    if (source === target) {
      return { valid: false, reason: 'Cannot connect a node to itself' };
    }
    
    // Prevent duplicate connections
    const duplicateExists = currentEdges.some(e => e.source === source && e.target === target);
    if (duplicateExists) {
      return { valid: false, reason: 'Connection already exists' };
    }
    
    return { valid: true };
  }, [nodes]);
  
  // Connection rejection message state
  const [connectionError, setConnectionError] = useState(null);
  
  // Clear connection error after 3 seconds
  useEffect(() => {
    if (connectionError) {
      const timer = setTimeout(() => setConnectionError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [connectionError]);
  
  const onConnect = useCallback((params) => {
    setEdges((eds) => {
      const validation = isValidConnection(params, eds);
      if (!validation.valid) {
        setConnectionError(validation.reason);
        return eds; // Don't add the edge
      }
      return addEdge(params, eds);
    });
  }, [setEdges, isValidConnection]);
  
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
  
  // Load email connections for notifications
  useEffect(() => {
    const fetchEmailConnections = async () => {
      try {
        const response = await axios.get('/api/email-connections');
        setEmailConnections(response.data.connections || response.data || []);
      } catch (error) {
        console.error('Error fetching email connections:', error);
      }
    };
    fetchEmailConnections();
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
  
  // Track if mapping has been loaded and its ID to prevent re-fetches
  const mappingLoadedRef = useRef({ loaded: false, mappingId: null });
  // Store canvas state to restore viewport later
  const pendingCanvasStateRef = useRef(null);
  
  // Load existing mapping if in edit mode - only depends on mappingId and isEditMode
  useEffect(() => {
    const fetchMapping = async () => {
      if (!isEditMode) return;
      
      // Prevent duplicate fetches - only load once per mappingId
      if (mappingLoadedRef.current.loaded && mappingLoadedRef.current.mappingId === mappingId) {
        return;
      }
      
      // Mark as loading immediately to prevent race conditions
      mappingLoadedRef.current = { loaded: true, mappingId };
      
      setLoading(true);
      try {
        const response = await axios.get(`/api/visual-mappings/${mappingId}`);
        const mapping = response.data;
        
        setMappingName(mapping.name);
        setMappingDescription(mapping.description || '');
        setProjectId(mapping.project_id);
        setSubProjectId(mapping.sub_project_id);
        
        // Restore notification settings if present
        if (mapping.notification_settings) {
          setNotificationSettings(mapping.notification_settings);
        }
        
        if (mapping.graph_data && mapping.graph_data.nodes) {
          const loadedNodes = mapping.graph_data.nodes.map(node => {
            // Strip transient ReactFlow UI flags that shouldn't persist
            const { hidden, selected, dragging, resizing, ...cleanNode } = node;
            return {
              ...cleanNode,
              // Ensure hidden is explicitly false to prevent rendering issues
              hidden: false,
              data: {
                ...cleanNode.data,
                nodeId: cleanNode.id,
                onConfigure: handleNodeConfigure
              }
            };
          });
          console.log('Loaded nodes from database:', loadedNodes.map(n => ({ id: n.id, type: n.type, hidden: n.hidden })));
          setNodes(loadedNodes);
          setEdges(mapping.graph_data.edges || []);
        }
        
        // Store canvas state for viewport restoration once reactFlowInstance is ready
        if (mapping.canvas_state) {
          pendingCanvasStateRef.current = mapping.canvas_state;
        }
        
        // Load execution runs from backend (last 10 runs)
        try {
          await loadRunsFromBackend(mappingId);
          setShowConsole(true);
          
          // Check if there's a running execution to resume monitoring
          const runningExec = await checkRunningExecution(mappingId);
          if (runningExec && runningExec.hasRunningExecution) {
            setIsExecuting(true);
            setCurrentExecutionId(runningExec.executionId);
            
            // Start polling for updates if WebSocket is not connected
            const pollInterval = setInterval(async () => {
              const status = await pollExecutionStatus(mappingId, runningExec.executionId);
              if (status && status.isComplete) {
                clearInterval(pollInterval);
                setIsExecuting(false);
                if (status.status === 'success' || status.status === 'completed') {
                  setSuccess('Execution completed successfully');
                } else if (status.status === 'failed') {
                  setError('Execution failed');
                }
                await loadRunsFromBackend(mappingId);
              }
            }, 2000);
            
            // Store interval for cleanup
            return () => clearInterval(pollInterval);
          }
        } catch (logsError) {
          console.log('No previous execution runs found', logsError);
        }
        
        // Mark as clean state after initial load
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Error loading visual mapping:', error);
        setError('Failed to load visual mapping');
        // Reset loaded flag on error so user can retry
        mappingLoadedRef.current = { loaded: false, mappingId: null };
      } finally {
        setLoading(false);
      }
    };
    
    fetchMapping();
  }, [mappingId, isEditMode, loadRunsFromBackend, checkRunningExecution, pollExecutionStatus]);
  
  // Restore viewport when reactFlowInstance becomes available
  useEffect(() => {
    if (reactFlowInstance && pendingCanvasStateRef.current) {
      const canvasState = pendingCanvasStateRef.current;
      reactFlowInstance.setViewport({
        x: canvasState.position?.[0] || 0,
        y: canvasState.position?.[1] || 0,
        zoom: canvasState.zoom || 1
      });
      pendingCanvasStateRef.current = null;
    }
  }, [reactFlowInstance]);
  
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
    setHasUnsavedChanges(true);
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
        // Get upstream schema first and deduplicate
        const upstreamEdges = edges.filter(e => e.target === nodeId);
        let upstreamSchemaRaw = [];
        upstreamEdges.forEach(edge => {
          upstreamSchemaRaw = [...upstreamSchemaRaw, ...getNodeOutputSchema(edge.source)];
        });
        // Deduplicate by column name
        const upstreamSchemaMap = new Map();
        upstreamSchemaRaw.forEach(col => {
          if (!upstreamSchemaMap.has(col.name)) {
            upstreamSchemaMap.set(col.name, col);
          }
        });
        const upstreamSchema = Array.from(upstreamSchemaMap.values());
        
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
        let inputSchemaRaw = [];
        upstreamEdges.forEach(edge => {
          inputSchemaRaw = [...inputSchemaRaw, ...getNodeOutputSchema(edge.source)];
        });
        // Deduplicate input schema by column name
        const inputSchemaMap = new Map();
        inputSchemaRaw.forEach(col => {
          if (!inputSchemaMap.has(col.name)) {
            inputSchemaMap.set(col.name, col);
          }
        });
        const inputSchema = Array.from(inputSchemaMap.values());
        
        // For dataset join: combine input schema with dataset columns from outputSchema
        if (config.lookupType === 'dataset' && config.outputSchema) {
          // outputSchema contains the dataset columns
          const datasetCols = config.outputSchema.map(col => ({
            name: col.name,
            type: col.type || col.dataType || 'unknown',
            description: col.description || '',
            contains_pii: col.contains_pii || col.isPii || false
          }));
          // Combine and deduplicate (input columns take precedence)
          const combinedMap = new Map();
          inputSchema.forEach(col => combinedMap.set(col.name, col));
          datasetCols.forEach(col => {
            if (!combinedMap.has(col.name)) {
              combinedMap.set(col.name, col);
            }
          });
          const combinedSchema = Array.from(combinedMap.values());
          console.log(`getCumulativeSchema: RDM Lookup (dataset) node ${nodeId} output schema:`, combinedSchema.length, 'unique columns (', inputSchema.length, 'input +', datasetCols.length, 'dataset)');
          return combinedSchema;
        }
        
        // For crosswalk: combine input schema with crosswalk target columns from outputSchema
        if (config.lookupType === 'crosswalk') {
          if (config.outputSchema && config.outputSchema.length > 0) {
            // outputSchema contains the crosswalk target columns
            const crosswalkCols = config.outputSchema.map(col => ({
              name: col.name,
              type: col.type || col.dataType || 'unknown',
              description: col.description || '',
              contains_pii: col.contains_pii || col.isPii || false
            }));
            // Combine and deduplicate (input columns take precedence)
            const combinedMap = new Map();
            inputSchema.forEach(col => combinedMap.set(col.name, col));
            crosswalkCols.forEach(col => {
              if (!combinedMap.has(col.name)) {
                combinedMap.set(col.name, col);
              }
            });
            const combinedSchema = Array.from(combinedMap.values());
            console.log(`getCumulativeSchema: RDM Lookup (crosswalk) node ${nodeId} output schema:`, combinedSchema.length, 'unique columns (', inputSchema.length, 'input +', crosswalkCols.length, 'crosswalk)');
            return combinedSchema;
          } else {
            // No crosswalk columns mapped, pass through input schema
            console.log(`getCumulativeSchema: RDM Lookup (crosswalk) node ${nodeId} output schema:`, inputSchema.length, 'columns (pass-through)');
            return inputSchema;
          }
        }
        
        // If not configured yet, return input schema
        console.log(`getCumulativeSchema: RDM Lookup (not configured) node ${nodeId} output schema:`, inputSchema.length, 'columns');
        return inputSchema;
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
    
    // Deduplicate schema by column name, preserving first occurrence
    const uniqueSchemaMap = new Map();
    schema.forEach(col => {
      if (!uniqueSchemaMap.has(col.name)) {
        uniqueSchemaMap.set(col.name, col);
      }
    });
    const uniqueSchema = Array.from(uniqueSchemaMap.values());
    
    console.log('getCumulativeSchema: Final schema (deduplicated):', uniqueSchema.length, 'columns from', schema.length, 'total');
    return uniqueSchema;
  }, [nodes, edges, configNodeId]);
  
  const addNode = (type, label) => {
    const nodeId = `${type}-${Date.now()}`;
    const newNode = {
      id: nodeId,
      type,
      position: { 
        x: (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 300 + 100, 
        y: (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 300 + 100 
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
      errors.push('At least one Target Config node is required');
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
    const expressionNodes = nodes.filter(n => n.type === 'expression');
    expressionNodes.forEach(node => {
      // Check if expression node has upstream connections
      const hasUpstream = edges.some(e => e.target === node.id);
      if (!hasUpstream) {
        errors.push(`Expression node "${node.data.label}" has no upstream connections`);
      }
    });
    
    // Check join nodes
    const joinNodes = nodes.filter(n => n.type === 'join');
    joinNodes.forEach(node => {
      if (!node.data.config || !node.data.config.joinType) {
        errors.push(`Join node "${node.data.label}" is not configured - missing join type`);
      }
      if (!node.data.config || !node.data.config.joinKeys || node.data.config.joinKeys.length === 0) {
        errors.push(`Join node "${node.data.label}" is not configured - missing join keys`);
      }
      
      // Join nodes need exactly two upstream connections
      const upstreamEdges = edges.filter(e => e.target === node.id);
      if (upstreamEdges.length === 0) {
        errors.push(`Join node "${node.data.label}" has no upstream connections`);
      } else if (upstreamEdges.length === 1) {
        errors.push(`Join node "${node.data.label}" needs two upstream connections for left and right inputs`);
      } else if (upstreamEdges.length > 2) {
        errors.push(`Join node "${node.data.label}" has too many upstream connections (only two allowed)`);
      }
    });
    
    // Check RDM Lookup nodes (unified type)
    const rdmLookupNodes = nodes.filter(n => n.type === 'rdmLookup');
    rdmLookupNodes.forEach(node => {
      if (!node.data.config || !node.data.config.lookupType) {
        errors.push(`RDM Lookup node "${node.data.label}" is not configured - missing lookup type`);
      } else {
        const lookupType = node.data.config.lookupType;
        if (lookupType === 'dataset' && !node.data.config.datasetId) {
          errors.push(`RDM Lookup node "${node.data.label}" is not configured - missing dataset selection`);
        }
        if (lookupType === 'crosswalk' && !node.data.config.crosswalkId) {
          errors.push(`RDM Lookup node "${node.data.label}" is not configured - missing crosswalk selection`);
        }
      }
      
      const hasUpstream = edges.some(e => e.target === node.id);
      if (!hasUpstream) {
        errors.push(`RDM Lookup node "${node.data.label}" has no upstream connections`);
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
        canvas_state: canvasState,
        notification_settings: notificationSettings.enabled ? notificationSettings : null
      };
      
      if (isEditMode) {
        await axios.put(`/api/visual-mappings/${mappingId}`, payload);
        setSuccess('Visual mapping updated successfully');
        setHasUnsavedChanges(false);
      } else {
        const response = await axios.post('/api/visual-mappings', payload);
        setSuccess('Visual mapping created successfully');
        setHasUnsavedChanges(false);
        navigate(`/visual-mappings/${response.data.id}`);
      }
      return true;
    } catch (error) {
      console.error('Error saving visual mapping:', error);
      setError(error.response?.data?.error || 'Failed to save visual mapping');
      return false;
    } finally {
      setSaving(false);
    }
  };
  
  const executeMapping = async () => {
    // Always save the mapping before execution to ensure latest state is persisted
    setSuccess('Saving mapping before execution...');
    const saveResult = await saveMapping();
    if (!saveResult) {
      return; // Save failed, error already set
    }
    
    try {
      resetExecution(); // Clear previous execution state
      setIsExecuting(true);
      setError(null);
      setSuccess(null); // Clear previous success message
      
      // Generate execution ID and subscribe to WebSocket BEFORE starting execution
      const executionId = generateExecutionId();
      console.log('Generated execution ID:', executionId);
      
      // Subscribe to WebSocket updates first
      await subscribeToExecution(executionId);
      console.log('Subscribed to execution updates');
      setCurrentExecutionId(executionId);
      
      // Now start the execution with the pre-generated execution ID
      const response = await axios.post(`/api/visual-mappings/${mappingId}/execute`, {
        execution_id: executionId
      });
      
      // Start a new execution run using the backend-provided run_id for deduplication
      const backendRunId = response.data?.run_id;
      startNewRun(mappingName || 'Unnamed Mapping', backendRunId);
      
      setSuccess(`Execution started - monitoring real-time progress`);
    } catch (error) {
      console.error('Error executing mapping:', error);
      setSuccess(null); // Clear any success message from WebSocket events
      setError(error.response?.data?.error || 'Failed to execute visual mapping');
      setIsExecuting(false);
    }
  };
  
  // Handle execution completion (only show success if no error)
  useEffect(() => {
    if (executionComplete && !executionError && currentExecutionId) {
      setIsExecuting(false);
      setSuccess('Execution completed successfully!');
      updateRunStatus('success');
      
      // Save execution run to database using persistCompletedRun (uses ref, avoids stale closure)
      if (mappingId) {
        persistCompletedRun(mappingId, 'success');
      }
      
      setTimeout(() => setCurrentExecutionId(null), 5000); // Clear execution ID after 5 seconds
    }
  }, [executionComplete, executionError, currentExecutionId, mappingId, updateRunStatus, persistCompletedRun]);
  
  // Save logs on execution error as well
  useEffect(() => {
    if (executionError && currentExecutionId && mappingId) {
      // Save execution run to database using persistCompletedRun (uses ref, avoids stale closure)
      persistCompletedRun(mappingId, 'failed');
    }
  }, [executionError, currentExecutionId, mappingId, persistCompletedRun]);
  
  useEffect(() => {
    if (executionError) {
      setIsExecuting(false);
      updateRunStatus('failed');
      // Handle both string and object error formats
      const errorMessage = typeof executionError === 'string' 
        ? executionError 
        : executionError.message || 'Unknown error';
      setError(`Execution failed: ${errorMessage}`);
      setTimeout(() => setCurrentExecutionId(null), 5000);
    }
  }, [executionError, updateRunStatus]);
  
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
    // Apply node statuses whenever they change (including when execution fails)
    if (Object.keys(nodeStatuses).length === 0) return;
    
    setNodes((nds) => 
      nds.map((node) => {
        const status = nodeStatuses[node.id];
        // Remove any existing status class before adding new one
        // Use safer regex to prevent ReDoS - limit quantifier
        const baseClassName = (node.className || '').replace(/\s*status-\w{1,50}/g, '').trim(); // NOSONAR S5852 - CSS class names are bounded and validated, no ReDoS risk
        const statusClass = status ? getNodeStatusClass(status.status) : '';
        
        return {
          ...node,
          className: `${baseClassName} ${statusClass}`.trim(),
          data: {
            ...node.data,
            executionStatus: status,
            statusBadge: status ? getNodeStatusBadge(status.status) : null
          }
        };
      })
    );
  }, [nodeStatuses]);
  
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
  
  // Reset execution status from nodes and edges
  const handleResetExecution = useCallback(() => {
    // Clear WebSocket state
    resetExecution();
    clearLogs();
    setIsExecuting(false);
    
    // Remove status classes and badges from nodes
    setNodes((nds) => 
      nds.map((node) => ({
        ...node,
        // Use safer regex to prevent ReDoS - limit quantifier
        className: (node.className || '').replace(/\s*status-\w{1,50}/g, '').trim(), // NOSONAR S5852 - CSS class names are bounded and validated, no ReDoS risk
        data: {
          ...node.data,
          executionStatus: null,
          statusBadge: null
        }
      }))
    );
    
    // Remove row count labels from edges
    setEdges((eds) => 
      eds.map((edge) => ({
        ...edge,
        label: undefined,
        labelStyle: undefined,
        labelBgStyle: undefined
      }))
    );
    
    setSuccess('Execution status cleared');
    setTimeout(() => setSuccess(null), 2000);
  }, [resetExecution, clearLogs, setNodes, setEdges]);
  
  // Auto-scroll console to top when new run starts or logs are added
  useEffect(() => {
    if (consoleRef.current && showConsole && executionRuns.length > 0) {
      requestAnimationFrame(() => {
        if (consoleRef.current) {
          consoleRef.current.scrollTop = 0;
        }
      });
    }
  }, [executionRuns, showConsole]);
  
  // Console panel resize handlers
  const handleConsoleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizingConsole(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = consolePanelHeight;
  }, [consolePanelHeight]);
  
  const handleConsoleResizeMove = useCallback((e) => {
    if (!isResizingConsole) return;
    const delta = resizeStartY.current - e.clientY;
    const newHeight = Math.min(Math.max(resizeStartHeight.current + delta, 100), 600);
    setConsolePanelHeight(newHeight);
  }, [isResizingConsole]);
  
  const handleConsoleResizeEnd = useCallback(() => {
    setIsResizingConsole(false);
  }, []);
  
  useEffect(() => {
    if (isResizingConsole) {
      window.addEventListener('mousemove', handleConsoleResizeMove);
      window.addEventListener('mouseup', handleConsoleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleConsoleResizeMove);
        window.removeEventListener('mouseup', handleConsoleResizeEnd);
      };
    }
  }, [isResizingConsole, handleConsoleResizeMove, handleConsoleResizeEnd]);
  
  // Open console when execution starts
  useEffect(() => {
    if (isExecuting) {
      setShowConsole(true);
    }
  }, [isExecuting]);
  
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
          <button onClick={() => {
            if (hasUnsavedChanges) {
              setShowCloseConfirm(true);
            } else {
              navigate('/visual-mappings/manage');
            }
          }} className="visual-mapping-toolbar-btn">
            Close Mapping
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
          <button 
            onClick={handleResetExecution} 
            className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-secondary"
            title="Reset execution status and clear row counts"
          >
            <FaRedo /> Reset
          </button>
          <button 
            onClick={() => setShowConsole(!showConsole)} 
            className={`visual-mapping-toolbar-btn ${showConsole ? 'visual-mapping-toolbar-btn-active' : ''}`}
            title="Toggle console panel"
          >
            <FaTerminal /> Console
          </button>
          <button onClick={executeMapping} disabled={!isEditMode || isExecuting} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-success">
            <FiPlay /> {isExecuting ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>
      
      {error && <div className="visual-mapping-error">{error}</div>}
      {success && <div className="visual-mapping-success">{success}</div>}
      
      {/* Connection validation error toast */}
      {connectionError && (
        <div className="visual-mapping-connection-error">
          <FaExclamationTriangle style={{ marginRight: '8px' }} />
          {connectionError}
        </div>
      )}
      
      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className="vm-modal-overlay">
          <div className="vm-modal" style={{ maxWidth: '450px' }}>
            <div className="vm-modal-header">
              <h2>Unsaved Changes</h2>
              <button className="vm-modal-close" onClick={() => setShowCloseConfirm(false)} aria-label="Close confirmation dialog">×</button>
            </div>
            <div className="vm-modal-body">
              <p style={{ fontFamily: 'Inter', fontSize: '12px', margin: 0 }}>You have unsaved changes. Do you want to save before closing?</p>
            </div>
            <div className="vm-modal-footer">
              <button 
                className="vm-btn vm-btn-secondary"
                onClick={() => {
                  setShowCloseConfirm(false);
                  navigate('/visual-mappings/manage');
                }}
              >
                Discard Changes
              </button>
              <button 
                className="vm-btn vm-btn-primary"
                onClick={async () => {
                  const saveResult = await saveMapping();
                  if (saveResult) {
                    setShowCloseConfirm(false);
                    navigate('/visual-mappings/manage');
                  }
                }}
              >
                Save and Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Validation Errors Panel */}
      {showValidationErrors && validationErrors.length > 0 && (
        <div className="visual-mapping-validation-panel">
          <div className="visual-mapping-validation-header" onClick={() => setShowValidationErrors(!showValidationErrors)}>
            <h3>Validation Issues ({validationErrors.length})</h3>
            <button className="visual-mapping-validation-close" onClick={(e) => {
              e.stopPropagation();
              setShowValidationErrors(false);
              setValidationErrors([]);
            }} aria-label="Close validation errors panel">×</button>
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
                role="button"
                tabIndex="0"
                aria-expanded={showMappingDetails}
                aria-label={`${showMappingDetails ? 'Collapse' : 'Expand'} mapping details section`}
                onClick={() => setShowMappingDetails(!showMappingDetails)}
              >
                <h3>Mapping Details</h3>
                {showMappingDetails ? <FaChevronUp /> : <FaChevronDown />}
              </div>
              {showMappingDetails && (
                <div className="visual-mapping-sidebar-content">
                  <div className="visual-mapping-form-group">
                    <label htmlFor="mapping-name-input">Mapping Name</label>
                    <input 
                      id="mapping-name-input"
                      type="text"
                      value={mappingName}
                      onChange={(e) => { setMappingName(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder="Enter mapping name"
                      className="visual-mapping-input"
                    />
                  </div>
                  <div className="visual-mapping-form-group">
                    <label htmlFor="mapping-description">Description</label>
                    <textarea 
                      id="mapping-description"
                      value={mappingDescription}
                      onChange={(e) => { setMappingDescription(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder="Enter description"
                      className="visual-mapping-textarea"
                      rows="2"
                    />
                  </div>
                  <div className="visual-mapping-form-group">
                    <label htmlFor="project-select">Project</label>
                    <select
                      id="project-select"
                      value={projectId || ''}
                      onChange={(e) => { setProjectId(parseInt(e.target.value) || null); setHasUnsavedChanges(true); }}
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
                      <label htmlFor="subproject-select">Sub-Project (Optional)</label>
                      <select
                        id="subproject-select"
                        value={subProjectId || ''}
                        onChange={(e) => { setSubProjectId(parseInt(e.target.value) || null); setHasUnsavedChanges(true); }}
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

            {/* Notification Settings Section */}
            <div className="visual-mapping-sidebar-section">
              <div 
                className="visual-mapping-sidebar-header" 
                role="button"
                tabIndex="0"
                aria-expanded={showNotificationSettings}
                aria-label={`${showNotificationSettings ? 'Collapse' : 'Expand'} notification settings section`}
                onClick={() => setShowNotificationSettings(!showNotificationSettings)}
              >
                <h3>Notification Settings</h3>
                {showNotificationSettings ? <FaChevronUp /> : <FaChevronDown />}
              </div>
              {showNotificationSettings && (
                <div className="visual-mapping-sidebar-content">
                      <div className="visual-mapping-form-group">
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox"
                            checked={notificationSettings.enabled}
                            onChange={(e) => setNotificationSettings({
                              ...notificationSettings,
                              enabled: e.target.checked
                            })}
                            style={{ width: 'auto' }}
                          />
                          Enable Email Notifications
                        </label>
                      </div>
                  
                  {notificationSettings.enabled && (
                    <>
                      <div className="visual-mapping-form-group">
                        <label htmlFor="email-provider-select">Email Provider</label>
                        <select
                          id="email-provider-select"
                          value={notificationSettings.emailConnectionId || ''}
                          onChange={(e) => setNotificationSettings({
                            ...notificationSettings,
                            emailConnectionId: e.target.value || null
                          })}
                          className="visual-mapping-select"
                        >
                          <option value="">Select Provider</option>
                          {emailConnections.map(conn => (
                            <option key={conn.connection_id} value={conn.connection_id}>
                              {conn.name}
                            </option>
                          ))}
                        </select>
                        {emailConnections.length === 0 && (
                          <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                            No email providers configured. Add one in Admin &gt; Email Providers.
                          </span>
                        )}
                      </div>
                      
                      <div className="visual-mapping-form-group">
                        <label htmlFor="recipients-input">Recipients</label>
                        <input 
                          id="recipients-input"
                          type="text"
                          value={notificationSettings.recipients}
                          onChange={(e) => setNotificationSettings({
                            ...notificationSettings,
                            recipients: e.target.value
                          })}
                          placeholder="email1@example.com, email2@example.com"
                          className="visual-mapping-input"
                        />
                        <span style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                          Comma-separated email addresses
                        </span>
                      </div>
                      
                      <div className="visual-mapping-form-group">
                        <div className="group-label" style={{ marginBottom: '8px', display: 'block' }}>Notify When</div>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <input 
                            type="checkbox"
                            checked={notificationSettings.notifyOnSuccess}
                            onChange={(e) => setNotificationSettings({
                              ...notificationSettings,
                              notifyOnSuccess: e.target.checked
                            })}
                            style={{ width: 'auto' }}
                          />
                          Job Completes Successfully
                        </label>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox"
                            checked={notificationSettings.notifyOnFailure}
                            onChange={(e) => setNotificationSettings({
                              ...notificationSettings,
                              notifyOnFailure: e.target.checked
                            })}
                            style={{ width: 'auto' }}
                          />
                          Job Fails
                        </label>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Mapping Components Section */}
            <div className="visual-mapping-sidebar-section">
              <div 
                className="visual-mapping-sidebar-header" 
                role="button"
                tabIndex="0"
                aria-expanded={showComponents}
                aria-label={`${showComponents ? 'Collapse' : 'Expand'} mapping components section`}
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
                      onClick={() => addNode('targetRules', 'Target Config')}
                      className="visual-mapping-palette-item"
                    >
                      <FaCheckCircle /> Target Config
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
              onNodesChange={(changes) => {
                onNodesChange(changes);
                // Track unsaved changes for node modifications (not just selection)
                const hasModifications = changes.some(c => c.type !== 'select' && c.type !== 'dimensions');
                if (hasModifications) setHasUnsavedChanges(true);
              }}
              onEdgesChange={(changes) => {
                onEdgesChange(changes);
                // Track unsaved changes for edge modifications (not just selection)
                const hasModifications = changes.some(c => c.type !== 'select');
                if (hasModifications) setHasUnsavedChanges(true);
              }}
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
          leftNodeName={(() => {
            const leftEdges = edges.filter(e => e.target === configNodeId && e.targetHandle === 'leftInput');
            if (leftEdges.length === 0) return '';
            const leftNode = nodes.find(n => n.id === leftEdges[0].source);
            return leftNode?.data?.config?.name || leftNode?.data?.label || '';
          })()}
          rightNodeName={(() => {
            const rightEdges = edges.filter(e => e.target === configNodeId && e.targetHandle === 'rightInput');
            if (rightEdges.length === 0) return '';
            const rightNode = nodes.find(n => n.id === rightEdges[0].source);
            return rightNode?.data?.config?.name || rightNode?.data?.label || '';
          })()}
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
                return config.schema.map(col => {
                  const colName = typeof col === 'string' ? col : (col.name || col.column_name || '');
                  const colType = (typeof col === 'object' && col !== null) ? (col.type || col.data_type || 'STRING') : 'STRING';
                  return { name: colName, type: colType };
                });
              }
              if (node.type === 'expression' && config.fieldMappings) {
                return config.fieldMappings.map(m => ({ name: m.target_field, type: 'STRING' }));
              }
              if (node.type === 'join' && config.outputSchema) {
                return config.outputSchema;
              }
              if (node.type === 'rdmLookup') {
                if (config.outputSchema && config.outputSchema.length > 0) {
                  const outputCols = config.outputSchema.map(col => ({ 
                    name: col.name || col.columnName || col.field_name || col.fieldName || col.targetColumn || col.sourceColumn || col.displayName || col.systemName || col.label || col.field_label || '', 
                    type: col.type || col.dataType || 'STRING' 
                  }));
                  return outputCols;
                }
                const upstreamEdges = edges.filter(e => e.target === nodeId);
                let inputSchema = [];
                upstreamEdges.forEach(edge => {
                  inputSchema = [...inputSchema, ...getNodeOutputSchema(edge.source)];
                });
                return inputSchema;
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
                return config.schema.map(col => {
                  const colName = typeof col === 'string' ? col : (col.name || col.column_name || '');
                  const colType = (typeof col === 'object' && col !== null) ? (col.type || col.data_type || 'STRING') : 'STRING';
                  return { name: colName, type: colType };
                });
              }
              if (node.type === 'expression' && config.fieldMappings) {
                return config.fieldMappings.map(m => ({ name: m.target_field, type: 'STRING' }));
              }
              if (node.type === 'join' && config.outputSchema) {
                return config.outputSchema;
              }
              if (node.type === 'rdmLookup') {
                if (config.outputSchema && config.outputSchema.length > 0) {
                  const outputCols = config.outputSchema.map(col => ({ 
                    name: col.name || col.columnName || col.field_name || col.fieldName || col.targetColumn || col.sourceColumn || col.displayName || col.systemName || col.label || col.field_label || '', 
                    type: col.type || col.dataType || 'STRING' 
                  }));
                  return outputCols;
                }
                const upstreamEdges = edges.filter(e => e.target === nodeId);
                let inputSchema = [];
                upstreamEdges.forEach(edge => {
                  inputSchema = [...inputSchema, ...getNodeOutputSchema(edge.source)];
                });
                return inputSchema;
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
      
      {/* Console Panel */}
      {showConsole && (
        <div 
          className={`visual-mapping-console-panel ${isResizingConsole ? 'resizing' : ''}`}
          style={{ height: consolePanelHeight }}
        >
          <div 
            className="visual-mapping-console-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize console panel"
            tabIndex="0"
            onMouseDown={handleConsoleResizeStart}
            title="Drag to resize"
          />
          <div className="visual-mapping-console-header">
            <div className="visual-mapping-console-title">
              <FaTerminal className="visual-mapping-console-icon" />
              <span>Execution Logs</span>
              {executionRuns.length > 0 && (
                <span className="visual-mapping-console-count">({executionRuns.length} runs)</span>
              )}
            </div>
            <div className="visual-mapping-console-actions">
              <button 
                className="visual-mapping-console-btn"
                onClick={clearLogs}
                aria-label="Clear execution logs"
                title="Clear logs"
              >
                Clear
              </button>
              <button 
                className="visual-mapping-console-btn visual-mapping-console-close"
                onClick={() => setShowConsole(false)}
                aria-label="Close console panel"
                title="Close console"
              >
                ×
              </button>
            </div>
          </div>
          <div className="visual-mapping-console-body" ref={consoleRef}>
            {executionRuns.length === 0 ? (
              <div className="visual-mapping-console-empty">
                No execution logs yet. Run the mapping to see logs here.
              </div>
            ) : (
              executionRuns.map((run, runIndex) => (
                <div key={run.id} className="visual-mapping-console-run">
                  <div className={`visual-mapping-console-run-header visual-mapping-console-run-${run.status}`}>
                    <span className="visual-mapping-console-run-indicator">
                      {run.status === 'running' ? '⏳' : (run.status === 'success' || run.status === 'completed') ? '✓' : '✗'}
                    </span>
                    <span className="visual-mapping-console-run-name">{run.name}</span>
                    <span className="visual-mapping-console-run-time">{formatRunDate(run.startedAt)}</span>
                  </div>
                  <div className="visual-mapping-console-run-logs">
                    {run.logs.map((log, logIndex) => {
                      // Use ISO timestamp format for consistency with workflow console
                      const timestamp = log.timestamp;
                      return (
                        <div key={logIndex} className={`visual-mapping-console-log log-${log.level.toLowerCase()}`}>
                          <span className="visual-mapping-console-timestamp">[{timestamp}]</span>
                          <span className={`visual-mapping-console-level level-${log.level.toLowerCase()}`}>
                            [{log.level}]
                          </span>
                          <span className="visual-mapping-console-message">{log.message}</span>
                        </div>
                      );
                    })}
                  </div>
                  {runIndex < executionRuns.length - 1 && (
                    <div className="visual-mapping-console-run-separator" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
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
