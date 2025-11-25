import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

export const useVisualMappingExecution = () => {
  const [socket, setSocket] = useState(null);
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [edgeRowCounts, setEdgeRowCounts] = useState({});
  const [executionProgress, setExecutionProgress] = useState(null);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState(null);
  const socketRef = useRef(null);

  // Initialize socket connection on mount
  useEffect(() => {
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketInstance.on('connect', () => {
      console.log('Connected to visual mapping WebSocket');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from visual mapping WebSocket');
      setIsConnected(false);
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
      // Use edgeId as primary key, with node-based fallback
      const edgeKey = data.edgeId || `${data.sourceNodeId}-${data.targetNodeId}`;
      setEdgeRowCounts(prev => ({
        ...prev,
        [edgeKey]: data.rowCount,
        // Also store by node pair for backward compatibility
        [`${data.sourceNodeId}-${data.targetNodeId}`]: data.rowCount
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

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  // Subscribe to a specific execution - returns a promise that resolves when subscribed
  const subscribeToExecution = useCallback((executionId) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      
      if (!socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      // If already connected, subscribe immediately
      if (socket.connected) {
        console.log('Already connected, subscribing to execution:', executionId);
        socket.emit('subscribe_execution', executionId);
        setCurrentExecutionId(executionId);
        resolve(executionId);
        return;
      }

      // Wait for connection then subscribe
      const onConnect = () => {
        console.log('Connected, subscribing to execution:', executionId);
        socket.emit('subscribe_execution', executionId);
        setCurrentExecutionId(executionId);
        socket.off('connect', onConnect);
        resolve(executionId);
      };

      socket.on('connect', onConnect);

      // Timeout after 5 seconds
      setTimeout(() => {
        socket.off('connect', onConnect);
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  }, []);

  // Unsubscribe from current execution
  const unsubscribeFromExecution = useCallback(() => {
    const socket = socketRef.current;
    if (socket && currentExecutionId) {
      socket.emit('unsubscribe_execution', currentExecutionId);
      setCurrentExecutionId(null);
    }
  }, [currentExecutionId]);

  const resetExecution = useCallback(() => {
    setNodeStatuses({});
    setEdgeRowCounts({});
    setExecutionProgress(null);
    setExecutionComplete(false);
    setExecutionError(null);
    unsubscribeFromExecution();
  }, [unsubscribeFromExecution]);

  // Generate a UUID for execution ID
  const generateExecutionId = useCallback(() => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }, []);

  return {
    nodeStatuses,
    edgeRowCounts,
    executionProgress,
    executionComplete,
    executionError,
    resetExecution,
    isConnected,
    subscribeToExecution,
    unsubscribeFromExecution,
    generateExecutionId,
    currentExecutionId
  };
};
