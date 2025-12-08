import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Panel,
  applyNodeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './WorkflowCanvas.css';
import AssetPalette from '../components/AssetPalette';
import MappingNode from '../components/workflow-nodes/MappingNode';
import MappingGroupNode from '../components/workflow-nodes/MappingGroupNode';
import WorkflowNode from '../components/workflow-nodes/WorkflowNode';
import WorkflowConfigModal from '../components/WorkflowConfigModal';
import { API_BASE_URL } from '../config';
import { useVisualWorkflowExecution } from '../hooks/useVisualWorkflowExecution';
import { FaTerminal, FaTimes, FaTrash } from 'react-icons/fa';

function WorkflowCanvas() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(250);
  const [isResizingConsole, setIsResizingConsole] = useState(false);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const nodesRef = useRef([]);
  const consoleRef = useRef(null);
  
  const {
    executionRuns,
    startNewRun,
    updateRunStatus,
    addLogEntry,
    resetExecution,
    clearLogs,
    loadRunsFromBackend,
    persistCompletedRun
  } = useVisualWorkflowExecution();
  
  // Memoize nodeTypes to prevent ReactFlow from losing rendering state
  const nodeTypes = useMemo(() => ({
    mapping: MappingNode,
    mapping_group: MappingGroupNode,
    workflow: WorkflowNode,
  }), []);
  
  // Keep ref in sync with state
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  
  // Custom onNodesChange handler for React 18 compatibility
  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds);
      return updatedNodes;
    });
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/visual-workflows`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };

  const loadWorkflow = async (workflowId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/visual-workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const workflow = await response.json();
        setSelectedWorkflow(workflow);
        setNodes(workflow.graph_data.nodes || []);
        setEdges(workflow.graph_data.edges || []);
        loadRunsFromBackend(workflowId);
      }
    } catch (error) {
      console.error('Failed to load workflow:', error);
    }
  };

  const onConnect = useCallback(
    (params) => {
      if (params.source === params.target) {
        alert('Cannot connect a node to itself');
        return;
      }

      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const findAvailablePosition = useCallback((initialPosition, existingNodes) => {
    const NODE_HEIGHT = 160;
    const VERTICAL_SPACING = 30;
    
    if (existingNodes.length === 0) {
      console.log('First node, using initial position:', initialPosition);
      return initialPosition;
    }

    const lowestNode = existingNodes.reduce((lowest, node) => {
      return node.position.y > lowest.position.y ? node : lowest;
    }, existingNodes[0]);

    const newPosition = {
      x: lowestNode.position.x,
      y: lowestNode.position.y + NODE_HEIGHT + VERTICAL_SPACING,
    };

    console.log('Placing node below lowest node at:', newPosition);
    return newPosition;
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const assetData = JSON.parse(event.dataTransfer.getData('application/reactflow'));

      if (typeof assetData === 'undefined' || !assetData) {
        return;
      }

      // Use nodesRef.current instead of nodes state to avoid stale closure
      const existingAsset = nodesRef.current.find(
        (n) => n.type === assetData.type && n.data.assetId === assetData.assetId
      );

      if (existingAsset) {
        alert(`This ${assetData.type} is already in the workflow. Duplicate assets are not allowed.`);
        return;
      }

      const initialPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const position = findAvailablePosition(initialPosition, nodesRef.current);

      const newNode = {
        id: `${assetData.type}-${assetData.assetId}-${Date.now()}`,
        type: assetData.type,
        position,
        draggable: true,
        selectable: true,
        data: {
          assetId: assetData.assetId,
          assetName: assetData.assetName,
          ...assetData,
        },
      };

      setNodes((nds) => {
        const updated = nds.concat(newNode);
        nodesRef.current = updated;
        return updated;
      });
    },
    [reactFlowInstance, findAvailablePosition, setNodes]
  );

  const validateGraph = () => {
    const assetMap = new Map();
    const duplicates = [];

    for (const node of nodes) {
      const assetKey = `${node.type}-${node.data.assetId}`;
      if (assetMap.has(assetKey)) {
        duplicates.push(assetKey);
      } else {
        assetMap.set(assetKey, true);
      }
    }

    if (duplicates.length > 0) {
      return { valid: false, error: `Duplicate assets: ${duplicates.join(', ')}` };
    }

    return { valid: true };
  };

  const handleSave = async () => {
    const validation = validateGraph();
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    setShowConfigModal(true);
  };

  const saveWorkflow = async (config) => {
    const workflowData = {
      name: config.name,
      description: config.description,
      execution_mode: config.execution_mode,
      graph_data: {
        nodes,
        edges,
      },
    };

    try {
      const url = selectedWorkflow
        ? `${API_BASE_URL}/api/visual-workflows/${selectedWorkflow.id}`
        : `${API_BASE_URL}/api/visual-workflows`;

      const method = selectedWorkflow ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workflowData),
      });

      if (response.ok) {
        const saved = await response.json();
        setSelectedWorkflow(saved);
        setShowConfigModal(false);
        loadWorkflows();
        alert(`Workflow ${selectedWorkflow ? 'updated' : 'created'} successfully!`);
      } else {
        const error = await response.json();
        alert(`Failed to save workflow: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      alert('Failed to save workflow');
    }
  };

  const handleExecute = async () => {
    if (!selectedWorkflow) {
      alert('Please save the workflow before executing');
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);
    setShowConsole(true);
    
    resetExecution();
    startNewRun(selectedWorkflow.name);
    addLogEntry('INFO', `Starting workflow execution: ${selectedWorkflow.name}`);
    addLogEntry('INFO', `Workflow contains ${nodes.length} nodes and ${edges.length} edges`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/visual-workflows/${selectedWorkflow.id}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        const result = await response.json();
        setExecutionResult(result);
        
        addLogEntry('INFO', `Execution completed: ${result.summary.successCount}/${result.summary.totalNodes} nodes successful`);
        
        if (result.summary.failedCount > 0) {
          addLogEntry('WARN', `${result.summary.failedCount} node(s) failed`);
          if (result.summary.nodeStatuses) {
            Object.entries(result.summary.nodeStatuses).forEach(([nodeId, status]) => {
              if (status.status === 'failed') {
                addLogEntry('ERROR', `Node ${nodeId}: ${status.error || 'Unknown error'}`);
              }
            });
          }
        }
        
        const finalStatus = result.summary.failedCount > 0 ? 'failed' : 'success';
        updateRunStatus(finalStatus);
        await persistCompletedRun(selectedWorkflow.id, finalStatus);
      } else {
        const error = await response.json();
        addLogEntry('ERROR', `Execution failed: ${error.error}`);
        updateRunStatus('failed');
        await persistCompletedRun(selectedWorkflow.id, 'failed');
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      addLogEntry('ERROR', `Network error: ${error.message}`);
      updateRunStatus('failed');
      await persistCompletedRun(selectedWorkflow.id, 'failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNew = () => {
    if (nodes.length > 0 || edges.length > 0) {
      if (!confirm('Clear current workflow and create a new one?')) {
        return;
      }
    }
    setNodes([]);
    setEdges([]);
    setSelectedWorkflow(null);
    setExecutionResult(null);
  };

  const handleDelete = async () => {
    if (!selectedWorkflow) {
      alert('No workflow selected');
      return;
    }

    if (!confirm(`Delete workflow "${selectedWorkflow.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/visual-workflows/${selectedWorkflow.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        setNodes([]);
        setEdges([]);
        setSelectedWorkflow(null);
        loadWorkflows();
        alert('Workflow deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      alert('Failed to delete workflow');
    }
  };

  const handleConsoleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizingConsole(true);
    const startY = e.clientY;
    const startHeight = consoleHeight;
    
    const handleMouseMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeight + deltaY));
      setConsoleHeight(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsResizingConsole(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [consoleHeight]);

  const formatRunDate = (startedAt) => {
    if (!startedAt) return '';
    try {
      const date = new Date(startedAt);
      return date.toLocaleString();
    } catch (e) {
      return startedAt;
    }
  };

  useEffect(() => {
    if (consoleRef.current && showConsole && executionRuns.length > 0) {
      requestAnimationFrame(() => {
        if (consoleRef.current) {
          consoleRef.current.scrollTop = 0;
        }
      });
    }
  }, [executionRuns, showConsole]);

  return (
    <div className="workflow-canvas-container">
      <div className="workflow-canvas-header">
        <h1>Visual Workflow Designer</h1>
        <div className="workflow-controls">
          <select
            value={selectedWorkflow?.id || ''}
            onChange={(e) => e.target.value && loadWorkflow(e.target.value)}
            className="workflow-select"
          >
            <option value="">-- Load Workflow --</option>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name}
              </option>
            ))}
          </select>
          <button onClick={handleNew} className="btn-secondary">
            New
          </button>
          <button onClick={handleSave} className="btn-primary" disabled={nodes.length === 0}>
            Save
          </button>
          <button
            onClick={handleExecute}
            className="btn-success"
            disabled={!selectedWorkflow || isExecuting}
          >
            {isExecuting ? 'Executing...' : 'Execute'}
          </button>
          <button
            onClick={handleDelete}
            className="btn-danger"
            disabled={!selectedWorkflow}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="workflow-canvas-body">
        <AssetPalette />

        <div className="reactflow-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.1}
            maxZoom={4}
          >
            <Controls />
            <MiniMap />
            <Background variant="dots" gap={12} size={1} />
            <Panel position="top-right">
              {selectedWorkflow && (
                <div className="workflow-info">
                  <strong>{selectedWorkflow.name}</strong>
                  <div className="workflow-stats">
                    Nodes: {nodes.length} | Edges: {edges.length}
                  </div>
                </div>
              )}
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {executionResult && (
        <div className="execution-result">
          <h3>Execution Result</h3>
          <div>Total Nodes: {executionResult.summary.totalNodes}</div>
          <div>Success: {executionResult.summary.successCount}</div>
          <div>Failed: {executionResult.summary.failedCount}</div>
          <div>Success Rate: {executionResult.summary.successRate}%</div>
        </div>
      )}

      {showConfigModal && (
        <WorkflowConfigModal
          workflow={selectedWorkflow}
          onSave={saveWorkflow}
          onClose={() => setShowConfigModal(false)}
        />
      )}

      {showConsole && (
        <div 
          className={`workflow-console-panel ${isResizingConsole ? 'resizing' : ''}`}
          style={{ height: `${consoleHeight}px` }}
        >
          <div 
            className="workflow-console-resize-handle"
            onMouseDown={handleConsoleResizeStart}
          />
          <div className="workflow-console-header">
            <div className="workflow-console-title">
              <FaTerminal className="workflow-console-icon" />
              <span>Execution Logs</span>
              {executionRuns.length > 0 && (
                <span className="workflow-console-count">({executionRuns.length} runs)</span>
              )}
            </div>
            <div className="workflow-console-actions">
              <button 
                className="workflow-console-btn"
                onClick={clearLogs}
                title="Clear all logs"
              >
                <FaTrash />
              </button>
              <button 
                className="workflow-console-btn workflow-console-close"
                onClick={() => setShowConsole(false)}
                title="Close console"
              >
                <FaTimes />
              </button>
            </div>
          </div>
          <div className="workflow-console-body" ref={consoleRef}>
            {executionRuns.length === 0 ? (
              <div className="workflow-console-empty">
                No execution logs yet. Run the workflow to see logs here.
              </div>
            ) : (
              executionRuns.map((run, runIndex) => (
                <div key={run.id} className="workflow-console-run">
                  <div className={`workflow-console-run-header workflow-console-run-${run.status}`}>
                    <span className="workflow-console-run-indicator">
                      {run.status === 'running' ? '\u23f3' : run.status === 'success' ? '\u2713' : '\u2717'}
                    </span>
                    <span className="workflow-console-run-name">{run.name}</span>
                    <span className="workflow-console-run-time">{formatRunDate(run.startedAt)}</span>
                  </div>
                  <div className="workflow-console-run-logs">
                    {run.logs.map((log, logIndex) => {
                      const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
                      return (
                        <div key={logIndex} className={`workflow-console-log log-${log.level.toLowerCase()}`}>
                          <span className="workflow-console-timestamp">[{timestamp}]</span>
                          <span className={`workflow-console-level level-${log.level.toLowerCase()}`}>
                            [{log.level}]
                          </span>
                          <span className="workflow-console-message">{log.message}</span>
                        </div>
                      );
                    })}
                  </div>
                  {runIndex < executionRuns.length - 1 && (
                    <div className="workflow-console-run-separator" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowCanvasWrapper() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
