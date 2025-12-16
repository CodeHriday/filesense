import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
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
import './WorkflowBuilder.css';
import axios from 'axios';
import { FaSave, FaPlay, FaClock, FaPlus, FaTrash, FaSearch, FaTimes, FaTerminal, FaChevronUp, FaChevronDown } from 'react-icons/fa';

// Start node - decorative circle with output only
const StartNode = ({ data }) => {
  return (
    <div className="workflow-start-node">
      <span className="workflow-start-node-label">Start</span>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="workflow-start-node-handle"
      />
    </div>
  );
};

StartNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string,
    assetType: PropTypes.string,
    assetId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired
};

// Stop node - decorative circle with input only
const StopNode = ({ data }) => {
  return (
    <div className="workflow-stop-node">
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="workflow-stop-node-handle"
      />
      <span className="workflow-stop-node-label">Stop</span>
    </div>
  );
};

StopNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string,
    assetType: PropTypes.string,
    assetId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired
};

// Custom node component for ETL mapping jobs
const JobNode = ({ data }) => {
  // Determine node class based on execution status
  let nodeClassName = "workflow-job-node";
  if (data.executionStatus === 'completed') {
    nodeClassName += " workflow-job-node-success";
  } else if (data.executionStatus === 'failed') {
    nodeClassName += " workflow-job-node-error";
  }
  
  return (
    <div className={nodeClassName}>
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="workflow-job-node-handle"
      />
      <div className="workflow-job-node-header">
        <span className="workflow-job-node-title">{data.label}</span>
        {data.executionStatus === 'completed' && (
          <span className="workflow-job-node-status-badge workflow-job-node-status-success">✓</span>
        )}
        {data.executionStatus === 'failed' && (
          <span className="workflow-job-node-status-badge workflow-job-node-status-error" title={data.executionError}>✗</span>
        )}
      </div>
      {data.description && (
        <div className="workflow-job-node-description">{data.description}</div>
      )}
      {data.executionError && (
        <div className="workflow-job-node-error-message" title={data.executionError}>
          Error: {data.executionError.substring(0, 50)}{data.executionError.length > 50 ? '...' : ''}
        </div>
      )}
      <div className="workflow-job-node-footer">
        <span className="workflow-job-node-id">#{data.assetId}</span>
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="workflow-job-node-handle"
      />
    </div>
  );
};

JobNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    assetId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    assetType: PropTypes.string,
    description: PropTypes.string,
    executionStatus: PropTypes.oneOf(['completed', 'failed', 'skipped', 'running']),
    executionError: PropTypes.string
  }).isRequired
};

const nodeTypes = {
  job: JobNode,
  start: StartNode,
  stop: StopNode
};

const WorkflowBuilderContent = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Workflow metadata
  const [workflowId, setWorkflowId] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  
  // Available assets for palette
  const [availableJobs, setAvailableJobs] = useState([]);
  const [availableJobGroups, setAvailableJobGroups] = useState([]);
  const [availableWorkflows, setAvailableWorkflows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [executionStatus, setExecutionStatus] = useState(null); // Stores node execution statuses
  const [showExecutionResults, setShowExecutionResults] = useState(false);
  
  // Palette section collapse states
  const [showJobs, setShowJobs] = useState(true);
  const [showJobGroups, setShowJobGroups] = useState(true);
  const [showWorkflows, setShowWorkflows] = useState(true);
  
  // Palette panel visibility
  const [showPalette, setShowPalette] = useState(true);
  const [showConfig, setShowConfig] = useState(true);
  
  // Project context
  const [projectId, setProjectId] = useState(null);
  const [subProjectId, setSubProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  
  // Schedule modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const modalRef = useRef(null);
  
  // Execution console - stores up to 10 runs with newest on top
  const [showConsole, setShowConsole] = useState(false);
  const [executionRuns, setExecutionRuns] = useState([]); // Array of run objects
  const [currentRunId, setCurrentRunId] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(250);
  const consoleRef = useRef(null);
  const isResizingConsole = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  
  // Helper to start a new execution run
  const startNewRun = (runName, backendRunId = null) => {
    const runId = backendRunId || `run-${Date.now()}`;
    const newRun = {
      id: runId,
      name: runName,
      startedAt: new Date().toLocaleString(),
      logs: [],
      status: 'running'
    };
    setCurrentRunId(runId);
    setExecutionRuns(prev => {
      const updated = [newRun, ...prev];
      return updated.slice(0, 10); // Keep only last 10 runs
    });
    return runId;
  };
  
  // Helper to add log entry to current run (find by running status, fallback to newest)
  const addConsoleLog = (message, level = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setExecutionRuns(prev => {
      if (prev.length === 0) return prev;
      const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
        ? prev.findIndex(r => r.status === 'running') 
        : 0; // Fallback to newest run for late-arriving logs
      const updated = [...prev];
      updated[runIndex] = {
        ...updated[runIndex],
        logs: [...updated[runIndex].logs, { timestamp, message, level }]
      };
      return updated;
    });
  };
  
  // Helper to update run status (find by running status, fallback to newest)
  const updateRunStatus = (status) => {
    setExecutionRuns(prev => {
      if (prev.length === 0) return prev;
      const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
        ? prev.findIndex(r => r.status === 'running') 
        : 0; // Fallback to newest run
      const updated = [...prev];
      updated[runIndex] = { ...updated[runIndex], status };
      return updated;
    });
  };
  
  // Load execution runs from backend
  const loadRunsFromBackend = async (wfId) => {
    if (!wfId) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/visual-workflows/${wfId}/execution-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.runs && response.data.runs.length > 0) {
        setExecutionRuns(response.data.runs);
        setShowConsole(true);
      }
    } catch (err) {
      console.log('No previous execution runs found:', err.message);
    }
  };
  
  // Persist completed run to backend
  const persistCompletedRun = async (wfId, finalStatus) => {
    if (!wfId) return;
    
    setExecutionRuns(prev => {
      if (prev.length === 0) return prev;
      
      let currentRun = prev.find(r => r.status === 'running');
      if (!currentRun) currentRun = prev[0];
      if (!currentRun) return prev;
      
      const runToSave = { ...currentRun, status: finalStatus };
      
      const token = localStorage.getItem('token');
      axios.post(`/api/visual-workflows/${wfId}/execution-logs`, {
        runId: runToSave.id,
        runName: runToSave.name,
        startedAt: runToSave.startedAt,
        status: runToSave.status,
        logs: runToSave.logs
      }, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }).then(() => {
        console.log('Workflow execution run persisted to backend:', runToSave.id);
      }).catch(err => {
        console.error('Failed to persist workflow execution run:', err.message);
      });
      
      return prev;
    });
  };
  
  // Auto-scroll console to top when new run starts or logs are added
  useEffect(() => {
    if (consoleRef.current && executionRuns.length > 0) {
      consoleRef.current.scrollTop = 0;
    }
  }, [executionRuns]);
  
  // Console resize handlers
  const handleConsoleResizeStart = (e) => {
    e.preventDefault();
    isResizingConsole.current = true;
    startY.current = e.clientY;
    startHeight.current = consoleHeight;
    document.addEventListener('mousemove', handleConsoleResizeMove);
    document.addEventListener('mouseup', handleConsoleResizeEnd);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };
  
  const handleConsoleResizeMove = (e) => {
    if (!isResizingConsole.current) return;
    const delta = startY.current - e.clientY;
    const newHeight = Math.max(100, Math.min(600, startHeight.current + delta));
    setConsoleHeight(newHeight);
  };
  
  const handleConsoleResizeEnd = () => {
    isResizingConsole.current = false;
    document.removeEventListener('mousemove', handleConsoleResizeMove);
    document.removeEventListener('mouseup', handleConsoleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  
  // Wait for canvas container to be measured before allowing layout
  useEffect(() => {
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    
    if (el.clientWidth > 20 && el.clientHeight > 20) {
      setContainerReady(true);
      return;
    }
    
    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 20 && el.clientHeight > 20) {
        setContainerReady(true);
        resizeObserver.disconnect();
      }
    });
    
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);
  
  // Load workflow if ID is in URL, or add default nodes for new workflows
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      setWorkflowId(parseInt(id));
      loadWorkflow(parseInt(id));
    } else {
      // New workflow - add default Start and Stop nodes
      const defaultNodes = [
        {
          id: `start-${Date.now()}`,
          type: 'start',
          position: { x: 100, y: 200 },
          data: { 
            label: 'Start',
            assetType: 'start',
            assetId: null
          }
        },
        {
          id: `stop-${Date.now() + 1}`,
          type: 'stop',
          position: { x: 600, y: 200 },
          data: { 
            label: 'Stop',
            assetType: 'stop',
            assetId: null
          }
        }
      ];
      setNodes(defaultNodes);
    }
  }, []);
  
  // Load all available assets
  useEffect(() => {
    loadAvailableAssets();
    loadProjects();
  }, []);
  
  const loadAvailableAssets = async () => {
    const token = localStorage.getItem('token');
    try {
      // Load visual mappings, job groups, and workflows in parallel
      const [visualMappingsRes, groupsRes, workflowsRes] = await Promise.all([
        axios.get('/api/visual-mappings', {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() }
        }),
        axios.get('/api/mapping-groups', {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() }
        }),
        axios.get('/api/visual-workflows', {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() }
        })
      ]);
      
      // Visual mappings API returns array directly with id and name fields
      setAvailableJobs(Array.isArray(visualMappingsRes.data) ? visualMappingsRes.data : []);
      setAvailableJobGroups(groupsRes.data?.groups && Array.isArray(groupsRes.data.groups) ? groupsRes.data.groups : []);
      setAvailableWorkflows(Array.isArray(workflowsRes.data) ? workflowsRes.data : []);
    } catch (err) {
      console.error('Failed to load available assets:', err);
      setError('Failed to load workflow assets');
    }
  };
  
  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };
  
  // Load subprojects when project changes
  useEffect(() => {
    if (projectId) {
      loadSubProjects(projectId);
    } else {
      setSubProjects([]);
      setSubProjectId(null);
    }
  }, [projectId]);
  
  const loadSubProjects = async (pid) => {
    try {
      console.log('Loading subprojects for project:', pid);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/projects/${pid}/sub-projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const subProjectsData = response.data.subProjects || [];
      console.log('Loaded subprojects:', subProjectsData);
      setSubProjects(subProjectsData);
    } catch (err) {
      console.error('Failed to load subprojects:', err);
      setSubProjects([]);
    }
  };
  
  const loadWorkflow = async (id) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/visual-workflows/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const workflow = response.data;
      setWorkflowName(workflow.name || '');
      setWorkflowDescription(workflow.description || '');
      
      // Set project first
      const workflowProjectId = workflow.project_id || null;
      setProjectId(workflowProjectId);
      
      // If there's a project, load its subprojects and then set the subproject
      if (workflowProjectId) {
        try {
          const subProjectsResponse = await axios.get(`/api/projects/${workflowProjectId}/sub-projects`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSubProjects(subProjectsResponse.data.subProjects || []);
        } catch (err) {
          console.error('Failed to load subprojects for workflow:', err);
          setSubProjects([]);
        }
      }
      
      // Now set the subproject after subprojects are loaded
      setSubProjectId(workflow.sub_project_id || null);
      
      // Load graph data (nodes and edges)
      if (workflow.graph_data) {
        const graphData = typeof workflow.graph_data === 'string' 
          ? JSON.parse(workflow.graph_data) 
          : workflow.graph_data;
          
        if (graphData.nodes && Array.isArray(graphData.nodes)) {
          setNodes(graphData.nodes);
        }
        if (graphData.edges && Array.isArray(graphData.edges)) {
          setEdges(graphData.edges);
        }
      }
      
      // Load previous execution runs from backend
      await loadRunsFromBackend(id);
      
      // Check if there's a running execution to resume monitoring
      await checkRunningExecution(id);
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to load workflow:', err);
      setError('Failed to load workflow');
      setLoading(false);
    }
  };
  
  const handleReactFlowInit = useCallback((instance) => {
    console.log('React Flow initialized');
    setReactFlowInstance(instance);
  }, []);
  
  // Handle connecting nodes
  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds));
    },
    [setEdges]
  );
  
  // Drag asset from palette to canvas (supports jobs, job groups, workflows)
  const onDragStart = (event, asset) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/reactflow', JSON.stringify(asset));
  };
  
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      
      if (!containerReady || !reactFlowInstance) {
        return;
      }
      
      const assetData = JSON.parse(event.dataTransfer.getData('application/reactflow'));
      const position = reactFlowInstance.project({
        x: event.clientX - 250,
        y: event.clientY - 80
      });
      
      // Determine node properties based on asset type
      let nodeId, nodeLabel, assetId, assetType, nodeType;
      
      if (assetData.assetType === 'mapping_job' || assetData.assetType === 'visual_mapping') {
        // Support both 'mapping_job' (legacy) and 'visual_mapping' (current sidebar) asset types
        nodeId = `job-${assetData.mapping_id || assetData.id}-${Date.now()}`;
        nodeLabel = assetData.mapping_name || assetData.name;
        assetId = assetData.mapping_id || assetData.id;
        assetType = 'job'; // Use 'job' for backend executor compatibility
        nodeType = 'job';
      } else if (assetData.assetType === 'job_group') {
        nodeId = `group-${assetData.id}-${Date.now()}`;
        nodeLabel = assetData.name;
        assetId = assetData.id;
        assetType = 'mapping_group'; // Use 'mapping_group' for backend executor compatibility
        nodeType = 'job';
      } else if (assetData.assetType === 'workflow') {
        nodeId = `workflow-${assetData.id}-${Date.now()}`;
        nodeLabel = assetData.name;
        assetId = assetData.id;
        assetType = 'workflow';
        nodeType = 'job';
      } else if (assetData.assetType === 'start') {
        // Decorative start node - no execution logic
        nodeId = `start-${Date.now()}`;
        nodeLabel = 'Start';
        assetId = null;
        assetType = 'start';
        nodeType = 'start';
      } else if (assetData.assetType === 'stop') {
        // Decorative stop node - no execution logic
        nodeId = `stop-${Date.now()}`;
        nodeLabel = 'Stop';
        assetId = null;
        assetType = 'stop';
        nodeType = 'stop';
      } else {
        return; // Unknown asset type
      }
      
      const newNode = {
        id: nodeId,
        type: nodeType,
        position,
        data: {
          label: nodeLabel,
          assetId: assetId,
          assetType: assetType
        }
      };
      
      setNodes((nds) => nds.concat(newNode));
    },
    [containerReady, reactFlowInstance, setNodes]
  );
  
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  // Save workflow - returns true on success, false on failure
  const saveWorkflow = async (skipScheduleModal = false) => {
    if (!workflowName.trim()) {
      setError('Please enter a workflow name');
      return false;
    }
    
    if (!projectId) {
      setError('Please select a project');
      return false;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const token = localStorage.getItem('token');
      const graphData = {
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type
        }))
      };
      
      const payload = {
        name: workflowName,
        description: workflowDescription,
        graph_data: graphData,
        project_id: projectId,
        sub_project_id: subProjectId
      };
      
      let response;
      if (workflowId) {
        response = await axios.put(`/api/visual-workflows/${workflowId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        response = await axios.post('/api/visual-workflows', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setWorkflowId(response.data.id);
      }
      
      setSuccess('Workflow saved successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      // Show schedule modal after successful save (unless skipped for close action)
      if (!skipScheduleModal) {
        setShowScheduleModal(true);
      }
      return true;
    } catch (err) {
      console.error('Failed to save workflow:', err);
      setError(err.response?.data?.error || 'Failed to save workflow');
      return false;
    } finally {
      setSaving(false);
    }
  };
  
  // Current execution tracking
  const [currentExecutionId, setCurrentExecutionId] = useState(null);
  const pollingIntervalRef = useRef(null);
  
  // Check for running execution when workflow loads
  const checkRunningExecution = async (wfId) => {
    if (!wfId) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/visual-workflows/${wfId}/running-execution`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.hasRunningExecution) {
        setIsExecuting(true);
        setShowConsole(true);
        setCurrentExecutionId(response.data.executionId);
        
        // Load existing logs
        if (response.data.logs && response.data.logs.length > 0) {
          const existingRun = {
            id: response.data.runId,
            name: response.data.runName,
            startedAt: new Date(response.data.startedAt).toLocaleString(),
            logs: response.data.logs.map(log => ({
              timestamp: new Date(log.timestamp).toLocaleTimeString(),
              message: log.message,
              level: log.level?.toLowerCase() || 'info'
            })),
            status: 'running'
          };
          setExecutionRuns(prev => {
            const filtered = prev.filter(r => r.id !== existingRun.id);
            return [existingRun, ...filtered].slice(0, 10);
          });
        }
        
        // Start polling for updates
        startPollingExecution(wfId, response.data.executionId);
      }
    } catch (err) {
      console.log('No running execution found:', err.message);
    }
  };
  
  // Poll for execution status updates
  const startPollingExecution = (wfId, execId) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`/api/visual-workflows/${wfId}/execution-status/${execId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const { status, logs, isComplete } = response.data;
        
        // Update logs in current run
        if (logs && logs.length > 0) {
          setExecutionRuns(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[0] = {
              ...updated[0],
              logs: logs.map(log => ({
                timestamp: new Date(log.timestamp).toLocaleTimeString(),
                message: log.message,
                level: log.level?.toLowerCase() || 'info'
              })),
              status: status
            };
            return updated;
          });
        }
        
        if (isComplete) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          setIsExecuting(false);
          setCurrentExecutionId(null);
          
          if (status === 'success') {
            setSuccess('Workflow execution completed successfully');
            setTimeout(() => setSuccess(null), 5000);
          } else if (status === 'failed') {
            setError('Workflow execution failed');
          }
          
          // Reload runs from backend to get final state
          await loadRunsFromBackend(wfId);
        }
      } catch (err) {
        console.error('Failed to poll execution status:', err);
      }
    }, 2000); // Poll every 2 seconds
  };
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);
  
  // Focus management for modal
  useEffect(() => {
    if (showScheduleModal && modalRef.current) {
      modalRef.current.focus();
    }
  }, [showScheduleModal]);
  
  // Execute workflow
  const executeWorkflow = async () => {
    if (!workflowId) {
      setError('Please save the workflow first');
      return;
    }
    
    try {
      setError(null);
      setIsExecuting(true);
      setShowConsole(true);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/visual-workflows/${workflowId}/execute`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const result = response.data;
      
      // Start a new execution run using the backend-provided run_id for deduplication
      const backendRunId = result.runId;
      startNewRun(workflowName, backendRunId);
      
      addConsoleLog(`Starting workflow execution: ${workflowName}`, 'info');
      addConsoleLog(`Workflow ID: ${workflowId}`, 'info');
      addConsoleLog(`Total nodes: ${nodes.length}`, 'info');
      addConsoleLog('-------------------------------------------', 'info');
      
      // Handle async execution - execution started in background
      if (result.async && result.executionId) {
        setCurrentExecutionId(result.executionId);
        addConsoleLog(`Execution started in background (ID: ${result.executionId})`, 'info');
        addConsoleLog('Execution will continue even if you close this page...', 'info');
        
        // Start polling for updates
        startPollingExecution(workflowId, result.executionId);
        return; // Exit early, polling will handle the rest
      }
      
      // Legacy sync response handling (fallback)
      if (result.summary?.nodeStatuses) {
        Object.entries(result.summary.nodeStatuses).forEach(([nodeId, status]) => {
          const node = nodes.find(n => n.id === nodeId);
          const nodeName = node?.data?.label || nodeId;
          if (status.skipped) {
            addConsoleLog(`[SKIP] ${nodeName}: ${status.reason || 'Decorative node'}`, 'info');
          } else if (status.success) {
            addConsoleLog(`[SUCCESS] ${nodeName}: Execution completed`, 'success');
          } else {
            addConsoleLog(`[FAILED] ${nodeName}: ${status.error || 'Unknown error'}`, 'error');
          }
        });
      }
      
      addConsoleLog('-------------------------------------------', 'info');
      
      // Store execution status for visual feedback
      setExecutionStatus(result.summary?.nodeStatuses || {});
      setShowExecutionResults(true);
      
      // Update nodes with execution status styling
      if (result.summary?.nodeStatuses) {
        setNodes((nds) =>
          nds.map((node) => {
            const nodeStatus = result.summary.nodeStatuses[node.id];
            if (nodeStatus) {
              return {
                ...node,
                data: {
                  ...node.data,
                  executionStatus: nodeStatus.skipped ? 'skipped' : nodeStatus.status,
                  executionError: nodeStatus.error
                }
              };
            }
            return node;
          })
        );
      }
      
      if (result.success) {
        const msg = `Workflow executed successfully! ${result.summary.successCount}/${result.summary.totalNodes} nodes completed.`;
        setSuccess(msg);
        addConsoleLog(msg, 'success');
        updateRunStatus('success');
      } else {
        const msg = `Workflow execution completed with errors: ${result.summary.failedCount}/${result.summary.totalNodes} nodes failed.`;
        setError(msg);
        addConsoleLog(msg, 'error');
        updateRunStatus('failed');
      }
      
      addConsoleLog(`Execution ID: ${result.executionId}`, 'info');
      addConsoleLog('Execution complete.', 'info');
      
      setTimeout(() => setSuccess(null), 5000);
      setIsExecuting(false);
    } catch (err) {
      console.error('Failed to execute workflow:', err);
      
      // Handle 409 conflict - workflow already executing
      if (err.response?.status === 409) {
        const { executionId } = err.response.data;
        setCurrentExecutionId(executionId);
        addConsoleLog('Workflow is already executing, resuming monitoring...', 'info');
        startPollingExecution(workflowId, executionId);
        return;
      }
      
      const errorMsg = err.response?.data?.error || 'Failed to execute workflow';
      setError(errorMsg);
      addConsoleLog(`[ERROR] ${errorMsg}`, 'error');
      updateRunStatus('failed');
      setIsExecuting(false);
    }
  };
  
  // Delete selected nodes/edges
  const deleteSelected = () => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  };
  
  // Filter assets by search query
  const filteredJobs = (Array.isArray(availableJobs) ? availableJobs : []).filter(job =>
    job.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredJobGroups = (Array.isArray(availableJobGroups) ? availableJobGroups : []).filter(group =>
    group.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredWorkflows = (Array.isArray(availableWorkflows) ? availableWorkflows : []).filter(workflow =>
    workflow.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <div className="workflow-builder">
      {/* Header */}
      <div className="workflow-builder-header">
        <div className="workflow-builder-header-left">
          <h1>Visual Workflow Builder{workflowId && workflowName ? ` - Editing: ${workflowName}` : ''}</h1>
          <p>Drag ETL mapping jobs onto the canvas and connect them to create workflows</p>
        </div>
        <div className="workflow-builder-header-actions">
          <button 
            className="workflow-builder-btn workflow-builder-btn-secondary"
            onClick={deleteSelected}
            title="Delete selected items"
          >
            <FaTrash /> Delete Selected
          </button>
          <button 
            className="workflow-builder-btn workflow-builder-btn-secondary"
            onClick={saveWorkflow}
            disabled={saving}
          >
            <FaSave /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button 
            className="workflow-builder-btn workflow-builder-btn-primary"
            onClick={executeWorkflow}
            disabled={!workflowId || isExecuting}
          >
            <FaPlay /> {isExecuting ? 'Running...' : 'Execute'}
          </button>
          <button 
            className={`workflow-builder-btn workflow-builder-btn-console ${showConsole ? 'active' : ''}`}
            onClick={() => setShowConsole(!showConsole)}
            title={showConsole ? 'Hide console' : 'Show console'}
          >
            <FaTerminal /> Console {executionRuns.length > 0 && <span className="workflow-builder-console-badge">{executionRuns.length}</span>}
          </button>
          <button 
            className="workflow-builder-btn workflow-builder-btn-close"
            onClick={async () => {
              const saved = await saveWorkflow(true);
              if (saved) {
                navigate('/workflow-manager');
              }
            }}
            disabled={saving}
            title="Save and close"
          >
            <FaTimes /> Close
          </button>
        </div>
      </div>
      
      {/* Alerts */}
      {error && (
        <div className="workflow-builder-alert workflow-builder-alert-error">
          {error}
        </div>
      )}
      {success && (
        <div className="workflow-builder-alert workflow-builder-alert-success">
          {success}
        </div>
      )}
      
      {/* Main content */}
      <div className="workflow-builder-content">
        {/* Asset Palette - 3 Sections */}
        {showPalette && (
          <div className="workflow-builder-palette">
            <div className="workflow-builder-palette-header">
              <h3>Assets</h3>
              <button 
                className="workflow-builder-close-btn"
                onClick={() => setShowPalette(false)}
                aria-label="Close asset palette"
              >
                ×
              </button>
            </div>
            
            <div className="workflow-builder-search">
              <FaSearch className="workflow-builder-search-icon" />
              <label 
                htmlFor="asset-search-input" 
                style={{ 
                  position: 'absolute', 
                  width: '1px', 
                  height: '1px', 
                  padding: '0', 
                  margin: '-1px', 
                  overflow: 'hidden', 
                  clip: 'rect(0, 0, 0, 0)', 
                  whiteSpace: 'nowrap', 
                  border: '0' 
                }}
              >
                Search assets
              </label>
              <input
                id="asset-search-input"
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="workflow-builder-search-input"
              />
            </div>
            
            <div className="workflow-builder-palette-content">
              {/* Section 1: Visual Mappings */}
              <div className="workflow-builder-palette-section">
                <div 
                  className="workflow-builder-palette-section-header"
                  role="button"
                  tabIndex="0"
                  aria-expanded={showJobs}
                  aria-label={`${showJobs ? 'Collapse' : 'Expand'} Visual Mappings section`}
                  onClick={() => setShowJobs(!showJobs)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowJobs(!showJobs);
                    }
                  }}
                >
                  <span className="workflow-builder-palette-section-toggle">
                    {showJobs ? '▼' : '▶'}
                  </span>
                  <span className="workflow-builder-palette-section-title">
                    Visual Mappings ({filteredJobs.length})
                  </span>
                </div>
                {showJobs && (
                  <div className="workflow-builder-palette-section-items">
                    {filteredJobs.length === 0 ? (
                      <div className="workflow-builder-palette-empty">
                        {searchQuery ? 'No matches' : 'No visual mappings'}
                      </div>
                    ) : (
                      filteredJobs.map(job => (
                        <div
                          key={job.id}
                          className="workflow-builder-palette-item"
                          draggable
                          role="button"
                          tabIndex="0"
                          aria-label={`Drag ${job.name} to canvas`}
                          onDragStart={(e) => onDragStart(e, { ...job, assetType: 'visual_mapping' })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              // For keyboard users, we could implement a different interaction
                              // For now, just prevent default to satisfy accessibility
                            }
                          }}
                        >
                          {job.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Section 2: Workflows */}
              <div className="workflow-builder-palette-section">
                <div 
                  className="workflow-builder-palette-section-header"
                  role="button"
                  tabIndex="0"
                  aria-expanded={showWorkflows}
                  aria-label={`${showWorkflows ? 'Collapse' : 'Expand'} Workflows section`}
                  onClick={() => setShowWorkflows(!showWorkflows)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowWorkflows(!showWorkflows);
                    }
                  }}
                >
                  <span className="workflow-builder-palette-section-toggle">
                    {showWorkflows ? '▼' : '▶'}
                  </span>
                  <span className="workflow-builder-palette-section-title">
                    Workflows ({filteredWorkflows.length})
                  </span>
                </div>
                {showWorkflows && (
                  <div className="workflow-builder-palette-section-items">
                    {filteredWorkflows.length === 0 ? (
                      <div className="workflow-builder-palette-empty">
                        {searchQuery ? 'No matches' : 'No workflows'}
                      </div>
                    ) : (
                      filteredWorkflows.map(workflow => (
                        <div
                          key={workflow.id}
                          className="workflow-builder-palette-item"
                          draggable
                          role="button"
                          tabIndex="0"
                          aria-label={`Drag ${workflow.name} to canvas`}
                          onDragStart={(e) => onDragStart(e, { ...workflow, assetType: 'workflow' })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              // For keyboard users, we could implement a different interaction
                              // For now, just prevent default to satisfy accessibility
                            }
                          }}
                        >
                          {workflow.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Section 4: Control Nodes */}
              <div className="workflow-builder-palette-section">
                <div className="workflow-builder-palette-section-header">
                  <span className="workflow-builder-palette-section-toggle">▼</span>
                  <span className="workflow-builder-palette-section-title">
                    Control Nodes
                  </span>
                </div>
                <div className="workflow-builder-palette-section-items">
                  <div
                    className="workflow-builder-palette-item workflow-builder-palette-control-start"
                    draggable
                    role="button"
                    tabIndex="0"
                    aria-label="Drag Start Node to canvas"
                    onDragStart={(e) => onDragStart(e, { assetType: 'start' })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // For keyboard users, we could implement a different interaction
                        // For now, just prevent default to satisfy accessibility
                      }
                    }}
                  >
                    <span className="workflow-builder-palette-control-icon workflow-builder-palette-start-icon">●</span>
                    {' '}
                    Start Node
                  </div>
                  <div
                    className="workflow-builder-palette-item workflow-builder-palette-control-stop"
                    draggable
                    role="button"
                    tabIndex="0"
                    aria-label="Drag Stop Node to canvas"
                    onDragStart={(e) => onDragStart(e, { assetType: 'stop' })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // For keyboard users, we could implement a different interaction
                        // For now, just prevent default to satisfy accessibility
                      }
                    }}
                  >
                    <span className="workflow-builder-palette-control-icon workflow-builder-palette-stop-icon">●</span>
                    {' '}
                    Stop Node
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Canvas */}
        <div className="workflow-builder-canvas-wrapper" ref={containerRef}>
          {!showPalette && (
            <button 
              className="workflow-builder-show-palette-btn"
              onClick={() => setShowPalette(true)}
            >
              <FaPlus /> Show Jobs
            </button>
          )}
          
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={handleReactFlowInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView={false}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background color="#e0e0e0" gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        
        {/* Configuration Panel */}
        {showConfig && (
          <div className="workflow-builder-config">
            <div className="workflow-builder-config-header">
              <h3>Workflow Settings</h3>
              <button 
                className="workflow-builder-close-btn"
                onClick={() => setShowConfig(false)}
                aria-label="Close configuration panel"
              >
                ×
              </button>
            </div>
            
            <div className="workflow-builder-config-content">
              <div className="workflow-builder-form-group">
                <label htmlFor="workflow-project-select">Project *</label>
                <select
                  id="workflow-project-select"
                  value={projectId || ''}
                  onChange={(e) => setProjectId(e.target.value ? parseInt(e.target.value) : null)}
                  className="workflow-builder-input"
                >
                  <option value="">Select a project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="workflow-builder-form-group">
                <label htmlFor="workflow-subproject-select">Subproject</label>
                <select
                  id="workflow-subproject-select"
                  value={subProjectId || ''}
                  onChange={(e) => setSubProjectId(e.target.value ? parseInt(e.target.value) : null)}
                  className="workflow-builder-input"
                  disabled={!projectId || subProjects.length === 0}
                >
                  <option value="">None (use main project)</option>
                  {subProjects.map(subProject => (
                    <option key={subProject.id} value={subProject.id}>
                      {subProject.name}
                    </option>
                  ))}
                </select>
                {projectId && subProjects.length === 0 && (
                  <small style={{ color: '#666', fontSize: '10px', marginTop: '4px', display: 'block' }}>
                    No subprojects available for this project
                  </small>
                )}
              </div>
              
              <div className="workflow-builder-form-group">
                <label htmlFor="workflow-name-input">Workflow Name *</label>
                <input
                  id="workflow-name-input"
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Enter workflow name"
                  className="workflow-builder-input"
                />
              </div>
              
              <div className="workflow-builder-form-group">
                <label htmlFor="workflow-description-textarea">Description</label>
                <textarea
                  id="workflow-description-textarea"
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Enter workflow description"
                  className="workflow-builder-textarea"
                  rows={3}
                />
              </div>
              
              <div className="workflow-builder-info-box">
                <div className="workflow-builder-info-icon">ℹ️</div>
                <div>
                  <strong>Smart Execution</strong>
                  <p>Jobs are executed based on their dependencies. Independent jobs run in parallel, while dependent jobs run sequentially in the correct order.</p>
                </div>
              </div>
              
              <div className="workflow-builder-stats">
                <div className="workflow-builder-stat">
                  <span className="workflow-builder-stat-label">Jobs</span>
                  <span className="workflow-builder-stat-value">{nodes.length}</span>
                </div>
                <div className="workflow-builder-stat">
                  <span className="workflow-builder-stat-label">Dependencies</span>
                  <span className="workflow-builder-stat-value">{edges.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {!showConfig && (
          <button 
            className="workflow-builder-show-config-btn"
            onClick={() => setShowConfig(true)}
          >
            ⚙️ Settings
          </button>
        )}
      </div>
      
      {/* Execution Console Panel */}
      <div 
        className={`workflow-builder-console ${showConsole ? 'workflow-builder-console-open' : ''}`}
        style={showConsole ? { height: `${consoleHeight}px` } : undefined}
      >
        {showConsole && (
          <div 
            className="workflow-builder-console-resize-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize console panel"
            tabIndex="0"
            onMouseDown={handleConsoleResizeStart}
            title="Drag to resize"
          />
        )}
        <div 
          className="workflow-builder-console-header"
          role="button"
          tabIndex="0"
          aria-expanded={showConsole}
          aria-label={`${showConsole ? 'Collapse' : 'Expand'} execution console`}
          onClick={() => setShowConsole(!showConsole)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowConsole(!showConsole);
            }
          }}
        >
          <div className="workflow-builder-console-title">
            <FaTerminal />
            <span>Execution Console</span>
            {isExecuting && <span className="workflow-builder-console-executing">Running...</span>}
          </div>
          <div className="workflow-builder-console-actions">
            <button 
              className="workflow-builder-console-clear-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExecutionRuns([]);
              }}
              aria-label="Clear console logs"
              title="Clear console"
            >
              Clear
            </button>
            {showConsole ? <FaChevronDown /> : <FaChevronUp />}
          </div>
        </div>
        {showConsole && (
          <div 
            className="workflow-builder-console-content" 
            ref={consoleRef}
            style={{ height: `${consoleHeight - 48}px` }}
          >
            {executionRuns.length === 0 ? (
              <div className="workflow-builder-console-empty">
                No execution logs. Click Execute to run the workflow.
              </div>
            ) : (
              executionRuns.map((run, runIndex) => (
                <div key={run.id} className="workflow-builder-console-run">
                  <div className={`workflow-builder-console-run-header workflow-builder-console-run-${run.status}`}>
                    <span className="workflow-builder-console-run-indicator">
                      {run.status === 'running' ? '⏳' : run.status === 'success' ? '✓' : '✗'}
                    </span>
                    <span className="workflow-builder-console-run-name">{run.name}</span>
                    <span className="workflow-builder-console-run-time">{run.startedAt}</span>
                  </div>
                  <div className="workflow-builder-console-run-logs">
                    {run.logs.map((log, logIndex) => (
                      <div 
                        key={logIndex} 
                        className={`workflow-builder-console-line workflow-builder-console-${log.level}`}
                      >
                        <span className="workflow-builder-console-timestamp">[{log.timestamp}]</span>
                        <span className={`workflow-builder-console-level workflow-builder-console-level-${log.level.toLowerCase()}`}>
                          [{log.level.toUpperCase()}]
                        </span>
                        <span className="workflow-builder-console-message">{log.message}</span>
                      </div>
                    ))}
                  </div>
                  {runIndex < executionRuns.length - 1 && (
                    <div className="workflow-builder-console-run-separator" />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
        
      {/* Schedule Modal */}
      {showScheduleModal && (
          <div 
            className="workflow-builder-modal-overlay" 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowScheduleModal(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowScheduleModal(false);
              }
            }}
          >
            <div 
              className="workflow-builder-modal" 
              ref={modalRef}
              tabIndex="-1"
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-modal-title"
            >
              <div className="workflow-builder-modal-header">
                <h3 id="schedule-modal-title">Schedule Workflow</h3>
                <button 
                  className="workflow-builder-modal-close"
                  onClick={() => setShowScheduleModal(false)}
                  aria-label="Close modal"
                >
                  ×
                </button>
              </div>
              
              <div className="workflow-builder-modal-content">
                <p className="workflow-builder-modal-message">
                  Workflow "<strong>{workflowName}</strong>" has been saved successfully.
                </p>
                <p className="workflow-builder-modal-subtitle">
                  Would you like to schedule this workflow to run automatically?
                </p>
                
                <div className="workflow-builder-modal-actions">
                  <button 
                    className="workflow-builder-btn workflow-builder-btn-secondary"
                    onClick={() => setShowScheduleModal(false)}
                  >
                    Skip for now
                  </button>
                  <button 
                    className="workflow-builder-btn workflow-builder-btn-primary"
                    onClick={() => {
                      setShowScheduleModal(false);
                      navigate('/etl-scheduler/create', {
                        state: {
                          entityType: 'workflow',
                          entityId: workflowId,
                          entityName: workflowName,
                          projectId: projectId,
                          subProjectId: subProjectId
                        }
                      });
                    }}
                  >
                    <FaClock style={{ marginRight: '6px' }} />
                    Set up schedule
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

const WorkflowBuilder = () => {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent />
    </ReactFlowProvider>
  );
};

// WorkflowBuilderContent doesn't receive props, it manages all state internally
WorkflowBuilderContent.propTypes = {};

// WorkflowBuilder doesn't receive props
WorkflowBuilder.propTypes = {};

export default WorkflowBuilder;
