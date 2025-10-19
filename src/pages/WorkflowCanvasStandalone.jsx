import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './WorkflowCanvasStandalone.css';

const initialNodes = [
  {
    id: '1',
    type: 'default',
    position: { x: 250, y: 100 },
    data: { label: 'Node 1' },
  },
  {
    id: '2',
    type: 'default',  
    position: { x: 250, y: 200 },
    data: { label: 'Node 2' },
  },
  {
    id: '3',
    type: 'default',
    position: { x: 500, y: 150 },
    data: { label: 'Node 3' },
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
];

function WorkflowCanvasStandalone() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowWrapper = useRef(null);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `node-${Date.now()}`,
        type: 'default',
        position,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <div className="workflow-canvas-standalone">
      {/* Header with controls */}
      <div className="workflow-header-bar">
        <h2>Visual Workflow Designer</h2>
        <div className="workflow-actions">
          <button className="btn btn-primary">Save Workflow</button>
        </div>
      </div>

      <div className="workflow-main-area">
        {/* Left Panel - Asset Palette */}
        <div className="workflow-sidebar">
          <h3>Drag Components</h3>
          <div className="workflow-components">
            <div
              className="workflow-component"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'input');
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="component-icon">📥</div>
              <span>Input Node</span>
            </div>
            <div
              className="workflow-component"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'process');
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="component-icon">⚙️</div>
              <span>Process Node</span>
            </div>
            <div
              className="workflow-component"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'output');
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="component-icon">📤</div>
              <span>Output Node</span>
            </div>
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="workflow-canvas-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background variant="dots" gap={12} size={1} />
            <Panel position="top-left">
              <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px' }}>
                Nodes: {nodes.length} | Edges: {edges.length}
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowCanvasStandaloneWrapper() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasStandalone />
    </ReactFlowProvider>
  );
}