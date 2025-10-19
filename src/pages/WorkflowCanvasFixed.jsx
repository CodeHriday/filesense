import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
} from 'reactflow';
// Import ReactFlow styles - CRITICAL!
import 'reactflow/dist/style.css';

const initialNodes = [
  { 
    id: '1', 
    position: { x: 100, y: 100 }, 
    data: { label: 'Test Node 1' },
    type: 'default'
  },
  { 
    id: '2', 
    position: { x: 100, y: 200 }, 
    data: { label: 'Test Node 2' },
    type: 'default'
  }
];

function WorkflowCanvasFixed() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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
      
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `${Date.now()}`,
        type: 'default',
        position,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      {/* Simple Asset Palette */}
      <div style={{ 
        width: '200px', 
        padding: '20px', 
        background: '#f0f0f0',
        borderRight: '1px solid #ddd' 
      }}>
        <h3>Drag to Canvas</h3>
        <div
          onDragStart={(event) => {
            event.dataTransfer.setData('application/reactflow', 'mapping');
            event.dataTransfer.effectAllowed = 'move';
          }}
          draggable
          style={{
            padding: '10px',
            margin: '10px 0',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'move'
          }}
        >
          Mapping Node
        </div>
        <div
          onDragStart={(event) => {
            event.dataTransfer.setData('application/reactflow', 'workflow');
            event.dataTransfer.effectAllowed = 'move';
          }}
          draggable
          style={{
            padding: '10px',
            margin: '10px 0',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'move'
          }}
        >
          Workflow Node
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div 
        ref={reactFlowWrapper}
        style={{ 
          flex: 1,
          height: '100%',
          background: 'white'
        }}
      >
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
        </ReactFlow>
      </div>
    </div>
  );
}

export default function WorkflowCanvasFixedWrapper() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasFixed />
    </ReactFlowProvider>
  );
}