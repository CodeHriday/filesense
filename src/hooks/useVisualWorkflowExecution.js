import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

export const useVisualWorkflowExecution = () => {
  const [socket, setSocket] = useState(null);
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [executionProgress, setExecutionProgress] = useState(null);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState(null);
  const [executionRuns, setExecutionRuns] = useState([]);
  const [currentRunId, setCurrentRunId] = useState(null);
  const socketRef = useRef(null);
  const runsRef = useRef([]);

  useEffect(() => {
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketInstance.on('connect', () => {
      console.log('Connected to visual workflow WebSocket');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from visual workflow WebSocket');
      setIsConnected(false);
    });

    socketInstance.on('workflow_node_status', (data) => {
      console.log('Workflow node status update:', data);
      setNodeStatuses(prev => ({
        ...prev,
        [data.nodeId]: {
          status: data.status,
          timestamp: data.timestamp,
          ...data.metadata
        }
      }));
      
      if (data.status === 'failed') {
        const errorMessage = data.error || data.metadata?.error || `Node ${data.nodeId} failed`;
        const logEntry = {
          timestamp: data.timestamp || new Date().toISOString(),
          level: 'ERROR',
          message: errorMessage,
          nodeId: data.nodeId
        };
        setExecutionRuns(prev => {
          if (prev.length === 0) return prev;
          const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
            ? prev.findIndex(r => r.status === 'running') 
            : 0;
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

    socketInstance.on('workflow_execution_progress', (data) => {
      console.log('Workflow execution progress:', data);
      setExecutionProgress(data.progress);
    });

    socketInstance.on('workflow_execution_complete', (data) => {
      console.log('Workflow execution complete:', data);
      setExecutionComplete(true);
      setExecutionProgress(100);
    });

    socketInstance.on('workflow_execution_error', (data) => {
      console.error('Workflow execution error:', data);
      setExecutionError(data.error);
    });

    socketInstance.on('workflow_execution_log', (data) => {
      console.log('Workflow execution log:', data);
      const logEntry = {
        timestamp: data.timestamp || new Date().toISOString(),
        level: data.level || 'INFO',
        message: data.message,
        details: data.details
      };
      setExecutionRuns(prev => {
        if (prev.length === 0) return prev;
        const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
          ? prev.findIndex(r => r.status === 'running') 
          : 0;
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

  const subscribeToExecution = useCallback((executionId) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      
      if (!socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      if (socket.connected) {
        console.log('Already connected, subscribing to workflow execution:', executionId);
        socket.emit('subscribe_workflow_execution', executionId);
        setCurrentExecutionId(executionId);
        resolve(executionId);
        return;
      }

      const onConnect = () => {
        console.log('Connected, subscribing to workflow execution:', executionId);
        socket.emit('subscribe_workflow_execution', executionId);
        setCurrentExecutionId(executionId);
        socket.off('connect', onConnect);
        resolve(executionId);
      };

      socket.on('connect', onConnect);

      setTimeout(() => {
        socket.off('connect', onConnect);
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  }, []);

  const unsubscribeFromExecution = useCallback(() => {
    const socket = socketRef.current;
    if (socket && currentExecutionId) {
      socket.emit('unsubscribe_workflow_execution', currentExecutionId);
      setCurrentExecutionId(null);
    }
  }, [currentExecutionId]);

  const resetExecution = useCallback(() => {
    setNodeStatuses({});
    setExecutionProgress(null);
    setExecutionComplete(false);
    setExecutionError(null);
    unsubscribeFromExecution();
  }, [unsubscribeFromExecution]);

  const clearLogs = useCallback(() => {
    setExecutionRuns([]);
    runsRef.current = [];
  }, []);

  // Start a new execution run (keeps last 10 runs)
  // If backendRunId is provided, use it instead of generating a new one (for deduplication with backend logs)
  const startNewRun = useCallback((runName, backendRunId = null) => {
    const runId = backendRunId || `wfrun-${Date.now()}`;
    const newRun = {
      id: runId,
      name: runName || 'Unnamed Workflow',
      startedAt: new Date().toISOString(),
      logs: [],
      status: 'running'
    };
    setCurrentRunId(runId);
    setExecutionRuns(prev => {
      // If a run with this ID already exists, update it instead of adding a duplicate
      const existingIndex = prev.findIndex(r => r.id === runId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], status: 'running' };
        runsRef.current = updated;
        return updated;
      }
      const updated = [newRun, ...prev];
      const trimmed = updated.slice(0, 10);
      runsRef.current = trimmed;
      return trimmed;
    });
    return runId;
  }, []);

  const updateRunStatus = useCallback((status) => {
    setExecutionRuns(prev => {
      if (prev.length === 0) return prev;
      const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
        ? prev.findIndex(r => r.status === 'running') 
        : 0;
      const updated = [...prev];
      updated[runIndex] = { ...updated[runIndex], status };
      runsRef.current = updated;
      return updated;
    });
  }, []);

  const addLogEntry = useCallback((level, message, details = null) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      details: details
    };
    setExecutionRuns(prev => {
      if (prev.length === 0) return prev;
      const runIndex = prev.findIndex(r => r.status === 'running') !== -1 
        ? prev.findIndex(r => r.status === 'running') 
        : 0;
      const updated = [...prev];
      updated[runIndex] = {
        ...updated[runIndex],
        logs: [...updated[runIndex].logs, logEntry]
      };
      runsRef.current = updated;
      return updated;
    });
  }, []);

  const loadLogs = useCallback((logs) => {
    if (Array.isArray(logs) && logs.length > 0) {
      const run = {
        id: `loaded-${Date.now()}`,
        name: 'Loaded Run',
        startedAt: new Date().toLocaleString(),
        logs: logs,
        status: 'completed'
      };
      setExecutionRuns(prev => {
        const updated = [run, ...prev];
        const trimmed = updated.slice(0, 10);
        runsRef.current = trimmed;
        return trimmed;
      });
    }
  }, []);

  const getCurrentLogs = useCallback(() => {
    if (runsRef.current.length === 0) return [];
    const runningRun = runsRef.current.find(r => r.status === 'running');
    if (runningRun) return runningRun.logs;
    return runsRef.current[0].logs;
  }, []);

  const generateExecutionId = useCallback(() => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }, []);

  const saveRunToBackend = useCallback(async (workflowId, run) => {
    if (!workflowId || !run) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/visual-workflows/${workflowId}/execution-logs`, {
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
        console.error('Failed to save workflow execution log:', await response.text());
      }
    } catch (err) {
      console.error('Error saving workflow execution log:', err);
    }
  }, []);

  // Load runs from backend (call on component mount)
  // Merges with existing in-memory runs by run_id to avoid duplicates
  const loadRunsFromBackend = useCallback(async (workflowId) => {
    if (!workflowId) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/visual-workflows/${workflowId}/execution-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.runs && data.runs.length > 0) {
          setExecutionRuns(prev => {
            // Create a map of existing runs by ID for quick lookup
            const existingRunsMap = new Map(prev.map(r => [r.id, r]));
            
            // Merge backend runs with existing runs, preferring in-memory status for running executions
            const mergedRuns = data.runs.map(backendRun => {
              const existingRun = existingRunsMap.get(backendRun.id);
              if (existingRun) {
                // Keep in-memory run if it's still running (more recent status)
                if (existingRun.status === 'running') {
                  return existingRun;
                }
                // Otherwise use backend data but keep any additional logs from memory
                return {
                  ...backendRun,
                  logs: backendRun.logs.length >= existingRun.logs.length ? backendRun.logs : existingRun.logs
                };
              }
              return backendRun;
            });
            
            // Add any in-memory runs that aren't in the backend yet
            prev.forEach(memRun => {
              if (!data.runs.find(r => r.id === memRun.id)) {
                mergedRuns.unshift(memRun);
              }
            });
            
            // Keep only the last 10 runs
            const trimmed = mergedRuns.slice(0, 10);
            runsRef.current = trimmed;
            return trimmed;
          });
        }
      }
    } catch (err) {
      console.error('Error loading workflow execution logs:', err);
    }
  }, []);

  const persistCompletedRun = useCallback(async (workflowId, finalStatus) => {
    if (!workflowId) {
      console.warn('persistCompletedRun: No workflowId provided');
      return;
    }
    
    const runs = runsRef.current;
    if (!runs || runs.length === 0) {
      console.warn('persistCompletedRun: No runs to persist');
      return;
    }
    
    let currentRun = runs.find(r => r.status === 'running');
    if (!currentRun) {
      currentRun = runs[0];
    }
    
    if (!currentRun) {
      console.warn('persistCompletedRun: Could not find run to persist');
      return;
    }
    
    const runToSave = { ...currentRun, status: finalStatus };
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/visual-workflows/${workflowId}/execution-logs`, {
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
        console.log('Workflow execution run persisted to backend:', runToSave.id, 'status:', finalStatus);
      } else {
        console.error('Failed to persist workflow execution run:', await response.text());
      }
    } catch (err) {
      console.error('Error persisting workflow execution run:', err);
    }
  }, []);

  return {
    nodeStatuses,
    executionProgress,
    executionComplete,
    executionError,
    executionRuns,
    startNewRun,
    updateRunStatus,
    addLogEntry,
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
