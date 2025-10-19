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

// CSS override to ensure nodes are visible and draggable
const customStyles = `
  .react-flow__node {
    cursor: grab !important;
    pointer-events: all !important;
    user-select: none !important;
    position: absolute !important;
    transform-origin: 0 0 !important;
  }
  .react-flow__node:active {
    cursor: grabbing !important;
  }
  .react-flow__node-default {
    background: white !important;
    border: 2px solid #555 !important;
    border-radius: 5px !important;
    padding: 10px !important;
    font-size: 12px !important;
    text-align: center !important;
  }
  .react-flow__handle {
    width: 8px !important;
    height: 8px !important;
    background: #555 !important;
    border: 2px solid #fff !important;
  }
`;

const initialNodes = [
  { 
    id: '1', 
    position: { x: 250, y: 100 }, 
    data: { label: 'Test Node 1' },
    type: 'default'
  },
  { 
    id: '2', 
    position: { x: 250, y: 250 }, 
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

      // Add some offset to prevent exact stacking
      const currentNodes = reactFlowInstance.getNodes();
      let finalPosition = { ...position };
      
      // Check if position conflicts with existing nodes
      currentNodes.forEach(node => {
        if (Math.abs(node.position.x - finalPosition.x) < 50 && 
            Math.abs(node.position.y - finalPosition.y) < 50) {
          // Offset the new node slightly
          finalPosition.x += 30;
          finalPosition.y += 30;
        }
      });

      const newNode = {
        id: `${Date.now()}`,
        type: 'default',
        position: finalPosition,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <>
      <style>{customStyles}</style>
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
          nodesDraggable={true}
          nodesConnectable={true}
          nodesFocusable={true}
          elementsSelectable={true}
          fitView
        >
          <Controls />
          <MiniMap />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
    </>
  );
}

export default function WorkflowCanvasFixedWrapper() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasFixed />
    </ReactFlowProvider>
  );
}