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

function WorkflowCanvas() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const nodesRef = useRef([]);
  
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

    try {
      const response = await fetch(`${API_BASE_URL}/api/visual-workflows/${selectedWorkflow.id}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        const result = await response.json();
        setExecutionResult(result);
        alert(`Workflow executed successfully!\n${result.summary.successCount}/${result.summary.totalNodes} nodes completed`);
      } else {
        const error = await response.json();
        alert(`Execution failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      alert('Failed to execute workflow');
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
