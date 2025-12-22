const { systemLogger } = require('../utils/logger');

class VisualMappingWebSocketService {
  constructor() {
    this.io = null;
  }

  initialize(io) {
    this.io = io;
    
    this.io.on('connection', (socket) => {
      systemLogger.info('Client connected to visual mapping WebSocket', {
        socketId: socket.id
      });

      socket.on('subscribe_execution', (executionId) => {
        socket.join(`execution:${executionId}`);
        systemLogger.info('Client subscribed to execution updates', {
          socketId: socket.id,
          executionId
        });
      });

      socket.on('unsubscribe_execution', (executionId) => {
        socket.leave(`execution:${executionId}`);
        systemLogger.info('Client unsubscribed from execution updates', {
          socketId: socket.id,
          executionId
        });
      });

      socket.on('disconnect', () => {
        systemLogger.info('Client disconnected from visual mapping WebSocket', {
          socketId: socket.id
        });
      });
    });
  }

  emitNodeStatus(executionId, nodeId, status, metadata = {}) {
    if (!this.io) return;
    
    this.io.to(`execution:${executionId}`).emit('node_status', {
      executionId,
      nodeId,
      status,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    
    systemLogger.info('Emitted node status', {
      executionId,
      nodeId,
      status,
      metadata
    });
  }

  emitEdgeRowCount(executionId, edgeId, sourceNodeId, targetNodeId, rowCount) {
    if (!this.io) return;
    
    this.io.to(`execution:${executionId}`).emit('edge_row_count', {
      executionId,
      edgeId,
      sourceNodeId,
      targetNodeId,
      rowCount,
      timestamp: new Date().toISOString()
    });
    
    systemLogger.info('Emitted edge row count', {
      executionId,
      edgeId,
      rowCount
    });
  }

  emitExecutionProgress(executionId, progress) {
    if (!this.io) return;
    
    this.io.to(`execution:${executionId}`).emit('execution_progress', {
      executionId,
      progress,
      timestamp: new Date().toISOString()
    });
    
    systemLogger.info('Emitted execution progress', {
      executionId,
      progress
    });
  }

  emitExecutionComplete(executionId, result) {
    if (!this.io) return;
    
    this.io.to(`execution:${executionId}`).emit('execution_complete', {
      executionId,
      result,
      timestamp: new Date().toISOString()
    });
    
    systemLogger.info('Emitted execution complete', {
      executionId,
      result
    });
  }

  emitExecutionError(executionId, error) {
    if (!this.io) return;
    
    this.io.to(`execution:${executionId}`).emit('execution_error', {
      executionId,
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    });
    
    systemLogger.error('Emitted execution error', {
      executionId,
      error: error.message
    });
  }

  emitExecutionLog(executionId, level, message, metadata = {}) {
    if (!this.io) return;
    
    const logEntry = {
      executionId,
      level: level.toUpperCase(),
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    
    this.io.to(`execution:${executionId}`).emit('execution_log', logEntry);
  }

  /**
   * Emit execution start event to reset all edge counts and node statuses on the frontend
   * @param {string} executionId - Unique execution identifier
   * @param {Array} edges - Array of edge objects with source and target
   */
  emitExecutionStart(executionId, edges = []) {
    if (!this.io) return;
    
    this.io.to(`execution:${executionId}`).emit('execution_start', {
      executionId,
      timestamp: new Date().toISOString(),
      resetEdges: true
    });
    
    // Also emit zero counts for all edges to ensure they're reset
    for (const edge of edges) {
      if (edge.id && edge.source && edge.target) {
        this.io.to(`execution:${executionId}`).emit('edge_row_count', {
          executionId,
          edgeId: edge.id,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          rowCount: 0,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    systemLogger.info('Emitted execution start with edge reset', {
      executionId,
      edgeCount: edges.length
    });
  }
}

module.exports = new VisualMappingWebSocketService();
