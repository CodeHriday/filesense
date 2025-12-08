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
  const [executionRuns, setExecutionRuns] = useState([]); // Array of run objects: {id, name, startedAt, logs[], status}
  const [currentRunId, setCurrentRunId] = useState(null);
  const socketRef = useRef(null);
  const runsRef = useRef([]);

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
      
      // If a node failed, add to execution logs and set error state
      // Note: Do NOT set executionComplete here - let execution_complete event handle that
      if (data.status === 'failed') {
        const errorMessage = data.error || data.metadata?.error || `Node ${data.nodeId} failed`;
        const logEntry = {
          timestamp: data.timestamp || new Date().toISOString(),
          level: 'ERROR',
          message: errorMessage,
          nodeId: data.nodeId
        };
        // Add log to current run (find by currentRunId, fallback to newest)
        setExecutionRuns(prev => {
          if (prev.length === 0) return prev;
          // Find the run that's still active (running or just completed)
          const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
            ? prev.findIndex(r => r.status === 'running') 
            : 0; // Fallback to newest run for late-arriving logs
          const updated = [...prev];
          updated[runIndex] = {
            ...updated[runIndex],
            logs: [...updated[runIndex].logs, logEntry]
          };
          runsRef.current = updated;
          return updated;
        });
        setExecutionError(errorMessage);
      }
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

    // Listen for execution logs
    socketInstance.on('execution_log', (data) => {
      console.log('Execution log:', data);
      const logEntry = {
        timestamp: data.timestamp || new Date().toISOString(),
        level: data.level || 'INFO',
        message: data.message,
        details: data.details
      };
      // Add log to current run (find by running status, fallback to newest)
      setExecutionRuns(prev => {
        if (prev.length === 0) return prev;
        const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
          ? prev.findIndex(r => r.status === 'running') 
          : 0; // Fallback to newest run for late-arriving logs
        const updated = [...prev];
        updated[runIndex] = {
          ...updated[runIndex],
          logs: [...updated[runIndex].logs, logEntry]
        };
        runsRef.current = updated;
        return updated;
      });
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
    // Don't clear runs, just reset the current execution state
    unsubscribeFromExecution();
  }, [unsubscribeFromExecution]);

  // Clear all runs
  const clearLogs = useCallback(() => {
    setExecutionRuns([]);
    runsRef.current = [];
  }, []);

  // Start a new execution run (keeps last 10 runs)
  const startNewRun = useCallback((runName) => {
    const runId = `run-${Date.now()}`;
    const newRun = {
      id: runId,
      name: runName || 'Unnamed Mapping',
      startedAt: new Date().toLocaleString(),
      logs: [],
      status: 'running'
    };
    setCurrentRunId(runId);
    setExecutionRuns(prev => {
      const updated = [newRun, ...prev];
      const trimmed = updated.slice(0, 10); // Keep only last 10 runs
      runsRef.current = trimmed;
      return trimmed;
    });
    return runId;
  }, []);

  // Update current run status (find by running status, fallback to newest)
  const updateRunStatus = useCallback((status) => {
    setExecutionRuns(prev => {
      if (prev.length === 0) return prev;
      const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
        ? prev.findIndex(r => r.status === 'running') 
        : 0; // Fallback to newest run
      const updated = [...prev];
      updated[runIndex] = { ...updated[runIndex], status };
      runsRef.current = updated;
      return updated;
    });
  }, []);

  // Load logs from previous executions (for loading persisted runs)
  // Adds loaded run to history without reordering, enforces 10-run cap
  const loadLogs = useCallback((logs) => {
    if (Array.isArray(logs) && logs.length > 0) {
      // If loading flat logs, wrap them in a run for compatibility
      const run = {
        id: `loaded-${Date.now()}`,
        name: 'Loaded Run',
        startedAt: new Date().toLocaleString(),
        logs: logs,
        status: 'completed'
      };
      setExecutionRuns(prev => {
        // Add loaded run to history, maintain chronological order (newest first)
        const updated = [run, ...prev];
        const trimmed = updated.slice(0, 10); // Enforce 10-run cap
        runsRef.current = trimmed;
        return trimmed;
      });
    }
  }, []);

  // Get current logs from ref (for use when saving to database)
  // Finds the most recently completed run's logs, or the running run's logs
  const getCurrentLogs = useCallback(() => {
    if (runsRef.current.length === 0) return [];
    // First try to find a running run
    const runningRun = runsRef.current.find(r => r.status === 'running');
    if (runningRun) return runningRun.logs;
    // Otherwise return the first run's logs (most recent completed)
    return runsRef.current[0].logs;
  }, []);

  // Generate a UUID for execution ID
  const generateExecutionId = useCallback(() => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }, []);

  // Save a run to backend (call after execution completes)
  const saveRunToBackend = useCallback(async (mappingId, run) => {
    if (!mappingId || !run) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/mappings/${mappingId}/execution-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          runId: run.id,
          runName: run.name,
          startedAt: run.startedAt,
          status: run.status,
          logs: run.logs
        })
      });
      
      if (!response.ok) {
        console.error('Failed to save execution log:', await response.text());
      }
    } catch (err) {
      console.error('Error saving execution log:', err);
    }
  }, []);

  // Load runs from backend (call on component mount)
  const loadRunsFromBackend = useCallback(async (mappingId) => {
    if (!mappingId) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/mappings/${mappingId}/execution-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.runs && data.runs.length > 0) {
          setExecutionRuns(data.runs);
          runsRef.current = data.runs;
        }
      }
    } catch (err) {
      console.error('Error loading execution logs:', err);
    }
  }, []);

  // Persist completed run to backend using runsRef (avoids stale closure issues)
  // Call this after updateRunStatus to save the run with final status
  const persistCompletedRun = useCallback(async (mappingId, finalStatus) => {
    if (!mappingId) {
      console.warn('persistCompletedRun: No mappingId provided');
      return;
    }
    
    const runs = runsRef.current;
    if (!runs || runs.length === 0) {
      console.warn('persistCompletedRun: No runs to persist');
      return;
    }
    
    // Find the run to persist - look for running status first, then fallback to first run
    let currentRun = runs.find(r => r.status === 'running');
    if (!currentRun) {
      // If no running run, use the most recent (first in array)
      currentRun = runs[0];
    }
    
    if (!currentRun) {
      console.warn('persistCompletedRun: Could not find run to persist');
      return;
    }
    
    // Create run with final status
    const runToSave = { ...currentRun, status: finalStatus };
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/mappings/${mappingId}/execution-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          runId: runToSave.id,
          runName: runToSave.name,
          startedAt: runToSave.startedAt,
          status: runToSave.status,
          logs: runToSave.logs
        })
      });
      
      if (response.ok) {
        console.log('Execution run persisted to backend:', runToSave.id, 'status:', finalStatus);
      } else {
        console.error('Failed to persist execution run:', await response.text());
      }
    } catch (err) {
      console.error('Error persisting execution run:', err);
    }
  }, []);

  return {
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
    loadLogs,
    getCurrentLogs,
    isConnected,
    subscribeToExecution,
    unsubscribeFromExecution,
    generateExecutionId,
    currentExecutionId,
    saveRunToBackend,
    loadRunsFromBackend,
    persistCompletedRun
  };
};
