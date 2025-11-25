import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export const useVisualMappingExecution = (executionId) => {
  const [socket, setSocket] = useState(null);
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [edgeRowCounts, setEdgeRowCounts] = useState({});
  const [executionProgress, setExecutionProgress] = useState(null);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [executionError, setExecutionError] = useState(null);

  useEffect(() => {
    if (!executionId) return;

    // Initialize Socket.IO connection - use current origin so it goes through Vite proxy
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketInstance.on('connect', () => {
      console.log('Connected to visual mapping WebSocket');
      socketInstance.emit('subscribe_execution', executionId);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from visual mapping WebSocket');
    });

    socketInstance.on('node_status', (data) => {
      console.log('Node status update:', data);
      setNodeStatuses(prev => ({
        ...prev,
        [data.nodeId]: {
          status: data.status,
          timestamp: data.timestamp,
          ...data.metadata
        }
      }));
    });

    socketInstance.on('edge_row_count', (data) => {
      console.log('Edge row count update:', data);
      const edgeKey = `${data.sourceNodeId}-${data.targetNodeId}`;
      setEdgeRowCounts(prev => ({
        ...prev,
        [edgeKey]: data.rowCount
      }));
    });

    socketInstance.on('execution_progress', (data) => {
      console.log('Execution progress:', data);
      setExecutionProgress(data.progress);
    });

    socketInstance.on('execution_complete', (data) => {
      console.log('Execution complete:', data);
      setExecutionComplete(true);
      setExecutionProgress(100);
    });

    socketInstance.on('execution_error', (data) => {
      console.error('Execution error:', data);
      setExecutionError(data.error);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.emit('unsubscribe_execution', executionId);
        socketInstance.disconnect();
      }
    };
  }, [executionId]);

  const resetExecution = useCallback(() => {
    setNodeStatuses({});
    setEdgeRowCounts({});
    setExecutionProgress(null);
    setExecutionComplete(false);
    setExecutionError(null);
  }, []);

  return {
    nodeStatuses,
    edgeRowCounts,
    executionProgress,
    executionComplete,
    executionError,
    resetExecution,
    isConnected: socket?.connected || false
  };
};
