import React, { useState } from 'react';
import { FiPlay, FiPause, FiSquare, FiCheckCircle, FiAlertCircle, FiClock, FiDatabase } from 'react-icons/fi';
import './Transform.css';
import PropTypes from 'prop-types';


/**
 * Transform Executor component for running and monitoring transformations
 */
const TransformExecutor = ({ config, onExecute }) => {
  const [executionStatus, setExecutionStatus] = useState('ready'); // ready, running, completed, failed, paused
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [executionStats, setExecutionStats] = useState({
    rowsProcessed: 0,
    totalRows: 0,
    startTime: null,
    endTime: null,
    duration: 0,
    throughput: 0
  });

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const simulateExecution = async () => {
    setExecutionStatus('running');
    setProgress(0);
    setLogs([]);
    setExecutionStats(prev => ({
      ...prev,
      startTime: new Date(),
      totalRows: config.sourceFile?.row_count || 100,
      rowsProcessed: 0
    }));

    addLog('Starting transformation execution...', 'info');
    addLog(`Source: ${config.sourceFile?.filename} (${config.sourceFile?.row_count || 0} rows)`, 'info');
    addLog(`Target: ${config.targetConnection?.name} - ${config.transformName}`, 'info');
    addLog(`Column mappings: ${config.columnMappings?.length || 0} configured`, 'info');

    // Simulate different execution phases
    const phases = [
      { name: 'Validating connections', duration: 1000, progress: 10 },
      { name: 'Reading source data', duration: 2000, progress: 30 },
      { name: 'Applying transformations', duration: 3000, progress: 70 },
      { name: 'Writing to target', duration: 2000, progress: 90 },
      { name: 'Finalizing', duration: 500, progress: 100 }
    ];

    for (const phase of phases) {
      if (executionStatus !== 'running') break;
      
      addLog(`${phase.name}...`, 'info');
      
      // Simulate progress within the phase
      const steps = 10;
      const stepDuration = phase.duration / steps;
      const progressIncrement = (phase.progress - progress) / steps;
      
      for (let i = 0; i < steps; i++) {
        if (executionStatus !== 'running') break;
        
        await new Promise(resolve => setTimeout(resolve, stepDuration));
        setProgress(prev => Math.min(100, prev + progressIncrement));
        
        // Update rows processed
        const newRowsProcessed = Math.floor((phase.progress / 100) * (config.sourceFile?.row_count || 100));
        setExecutionStats(prev => ({
          ...prev,
          rowsProcessed: newRowsProcessed,
          throughput: newRowsProcessed / ((Date.now() - prev.startTime.getTime()) / 1000)
        }));
      }
      
      addLog(`${phase.name} completed`, 'success');
    }

    if (executionStatus === 'running') {
      setExecutionStatus('completed');
      setProgress(100);
      setExecutionStats(prev => ({
        ...prev,
        endTime: new Date(),
        duration: Date.now() - prev.startTime.getTime(),
        rowsProcessed: config.sourceFile?.row_count || 100
      }));
      addLog('Transformation completed successfully!', 'success');
      addLog(`Processed ${config.sourceFile?.row_count || 100} rows in ${((Date.now() - executionStats.startTime?.getTime() || 0) / 1000).toFixed(2)}s`, 'success');
    }
  };

  const handleStart = () => {
    simulateExecution();
    onExecute();
  };

  const handlePause = () => {
    setExecutionStatus('paused');
    addLog('Execution paused by user', 'warning');
  };

  const handleStop = () => {
    setExecutionStatus('ready');
    setProgress(0);
    addLog('Execution stopped by user', 'warning');
  };

  const handleResume = () => {
    setExecutionStatus('running');
    addLog('Execution resumed', 'info');
  };

  const getStatusIcon = () => {
    switch (executionStatus) {
      case 'running':
        return <FiClock className="status-icon running" />;
      case 'completed':
        return <FiCheckCircle className="status-icon completed" />;
      case 'failed':
        return <FiAlertCircle className="status-icon failed" />;
      case 'paused':
        return <FiPause className="status-icon paused" />;
      default:
        return <FiDatabase className="status-icon ready" />;
    }
  };

  const getStatusText = () => {
    switch (executionStatus) {
      case 'running':
        return 'Executing...';
      case 'completed':
        return 'Completed Successfully';
      case 'failed':
        return 'Execution Failed';
      case 'paused':
        return 'Paused';
      default:
        return 'Ready to Execute';
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="transform-executor">
      <div className="executor-header">
        <h2>Execute Mapping</h2>
        <p>Review your configuration and run the transformation.</p>
      </div>

      {/* Configuration Summary */}
      <div className="config-summary">
        <h3>Configuration Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <strong>Source:</strong> {config.sourceConnection?.name || 'Not selected'}
            {config.sourceFile && (
              <div className="sub-info">File: {config.sourceFile.filename} ({config.sourceFile.row_count} rows)</div>
            )}
          </div>
          <div className="summary-item">
            <strong>Target:</strong> {config.targetConnection?.name || 'Not selected'}
            <div className="sub-info">Table: {config.transformName}</div>
          </div>
          <div className="summary-item">
            <strong>Mappings:</strong> {config.columnMappings?.length || 0} column mappings
            <div className="sub-info">Target schema: {config.targetSchema?.length || 0} columns</div>
          </div>
        </div>
      </div>

      {/* Execution Controls */}
      <div className="execution-controls">
        <div className="status-display">
          {getStatusIcon()}
          <span className="status-text">{getStatusText()}</span>
        </div>
        
        <div className="control-buttons">
          {executionStatus === 'ready' && (
            <button className="btn btn-primary btn-lg" onClick={handleStart}>
              <FiPlay /> Execute Mapping
            </button>
          )}
          {executionStatus === 'running' && (
            <>
              <button className="btn btn-warning" onClick={handlePause}>
                <FiPause /> Pause
              </button>
              <button className="btn btn-danger" onClick={handleStop}>
                <FiSquare /> Stop
              </button>
            </>
          )}
          {executionStatus === 'paused' && (
            <>
              <button className="btn btn-primary" onClick={handleResume}>
                <FiPlay /> Resume
              </button>
              <button className="btn btn-danger" onClick={handleStop}>
                <FiSquare /> Stop
              </button>
            </>
          )}
          {(executionStatus === 'completed' || executionStatus === 'failed') && (
            <button className="btn btn-primary" onClick={handleStart}>
              <FiPlay /> Run Again
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(executionStatus === 'running' || executionStatus === 'paused' || progress > 0) && (
        <div className="progress-section">
          <div className="progress-header">
            <span>Progress: {Math.round(progress)}%</span>
            <span>Rows: {executionStats.rowsProcessed.toLocaleString()} / {executionStats.totalRows.toLocaleString()}</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          {executionStats.throughput > 0 && (
            <div className="throughput-info">
              Throughput: {Math.round(executionStats.throughput).toLocaleString()} rows/sec
            </div>
          )}
        </div>
      )}

      {/* Execution Stats */}
      {executionStats.startTime && (
        <div className="execution-stats">
          <h4>Execution Statistics</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Start Time:</div>
              <span>{executionStats.startTime.toLocaleTimeString()}</span>
            </div>
            {executionStats.endTime && (
              <div className="stat-item">
                <div className="stat-label">End Time:</div>
                <span>{executionStats.endTime.toLocaleTimeString()}</span>
              </div>
            )}
            <div className="stat-item">
              <div className="stat-label">Duration:</div>
              <span>{formatDuration(executionStats.duration)}</span>
            </div>
            <div className="stat-item">
              <div className="stat-label">Rows Processed:</div>
              <span>{executionStats.rowsProcessed.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Execution Logs */}
      {logs.length > 0 && (
        <div className="execution-logs">
          <h4>Execution Logs</h4>
          <div className="logs-container">
            {logs.map((log, index) => (
              <div key={index} className={`log-entry ${log.type}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
TransformExecutor.propTypes = {
  onExecute: PropTypes.func.isRequired,

  config: PropTypes.shape({
    transformName: PropTypes.string,

    sourceConnection: PropTypes.shape({
      name: PropTypes.string
    }),

    targetConnection: PropTypes.shape({
      name: PropTypes.string
    }),

    sourceFile: PropTypes.shape({
      filename: PropTypes.string,
      row_count: PropTypes.number
    }),

    columnMappings: PropTypes.array,
    targetSchema: PropTypes.array
  }).isRequired
};

export default TransformExecutor;