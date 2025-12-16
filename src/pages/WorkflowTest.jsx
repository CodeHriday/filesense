import React, { useState, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Controls,
  Background,
  MiniMap,
  Panel,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

function WorkflowTest() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const nodeTypes = useMemo(() => ({
    custom: ({ data }) => (
      <div style={{
        background: 'white',
        border: '2px solid #4CAF50',
        borderRadius: '8px',
        padding: '10px',
        minWidth: '150px',
      }}>
        <div style={{ fontWeight: 'bold' }}>{data.label}</div>
        {data.description && <div style={{ fontSize: '12px', marginTop: '5px' }}>{data.description}</div>}
      </div>
    ),
  }), []);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge(params, eds));
  }, []);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Simple node creation - always stack vertically
      const newNode = {
        id: `node-${Date.now()}`,
        type: 'custom',
        position,
        data: { 
          label: `Test Node ${nodes.length + 1}`,
          description: `Dropped at ${Math.round(position.x)}, ${Math.round(position.y)}`
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodes.length]
  );

  const createTestNode = useCallback(() => {
    const position = {
      x: 100 + nodes.length * 30,
      y: 100 + nodes.length * 30,
    };

    const newNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      position,
      data: { 
        label: `Test Node ${nodes.length + 1}`,
        description: `Created at ${position.x}, ${position.y}`
      },
    };

    setNodes((nds) => nds.concat(newNode));
  }, [nodes.length]);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999,
      background: '#f5f5f5'
    }}>
      <div style={{
        padding: '10px',
        background: 'white',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <h2 style={{ margin: 0 }}>ReactFlow Test Page (Isolated from Global Styles)</h2>
        <button onClick={createTestNode} style={{
          padding: '8px 16px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Add Test Node
        </button>
        <div style={{
          padding: '8px',
          background: '#e3f2fd',
          borderRadius: '4px',
          marginLeft: 'auto'
        }}>
          Nodes: {nodes.length} | Try dragging this box onto the canvas →
        </div>
        <div
          draggable
          role="button"
          tabIndex="0"
          aria-label="Draggable test element - drag to canvas to create a node"
          onDragStart={(e) => e.dataTransfer.effectAllowed = 'move'}
          style={{
            padding: '10px',
            background: '#2196F3',
            color: 'white',
            borderRadius: '4px',
            cursor: 'move',
          }}
        >
          Drag me!
        </div>
      </div>
      
      <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
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
        >
          <Controls />
          <MiniMap />
          <Background variant="dots" gap={12} size={1} />
          <Panel position="top-right">
            <div style={{ background: 'white', padding: '10px', borderRadius: '8px' }}>
              <strong>Debug Info</strong>
              <div>Nodes rendered: {nodes.length}</div>
              {nodes.map(node => (
                <div key={node.id} style={{ fontSize: '12px', marginTop: '5px' }}>
                  {node.id}: ({Math.round(node.position.x)}, {Math.round(node.position.y)})
                </div>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export default function WorkflowTestWrapper() {
  return (
    <ReactFlowProvider>
      <WorkflowTest />
    </ReactFlowProvider>
  );
}