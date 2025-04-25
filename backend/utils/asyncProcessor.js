/**
 * Async Processor Utility
 * 
 * Provides facilities for running CPU-intensive operations in worker threads
 * to avoid blocking the main Node.js event loop.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { systemLogger } = require('./logger');

// Map of active tasks with their status information
const activeTasks = new Map();

// Path to worker script
const workerPath = path.join(__dirname, 'processorWorker.js');

/**
 * Process a file asynchronously in a worker thread
 * 
 * @param {Object} options - Processing options
 * @returns {Object} Task information
 */
function processFileAsync(options) {
  const taskId = uuidv4();
  const { filePath, fileName, fileType, fileId, traceId } = options;
  
  systemLogger.info('Starting async file processing', { 
    taskId, 
    fileName, 
    fileType,
    fileId,
    traceId
  });
  
  // Create task record
  const taskInfo = {
    taskId,
    type: 'file_processing',
    status: 'processing',
    progress: 0,
    startTime: Date.now(),
    options,
    worker: null
  };
  
  // Store in active tasks map
  activeTasks.set(taskId, taskInfo);
  
  // Create worker thread
  const worker = new Worker(workerPath, {
    workerData: {
      taskType: 'file_processing',
      taskId,
      options
    }
  });
  
  // Update task with worker reference
  taskInfo.worker = worker;
  
  // Set up message handling
  worker.on('message', (message) => {
    handleWorkerMessage(taskId, message);
  });
  
  // Handle worker errors
  worker.on('error', (error) => {
    systemLogger.error('File processing worker error', { 
      taskId, 
      error: error.message,
      stack: error.stack,
      traceId
    });
    
    // Update task status
    const task = activeTasks.get(taskId);
    if (task) {
      task.status = 'error';
      task.error = error.message;
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
    }
  });
  
  // Handle worker exit
  worker.on('exit', (code) => {
    const task = activeTasks.get(taskId);
    
    systemLogger.debug('File processing worker exited', { 
      taskId, 
      exitCode: code,
      duration: task ? Date.now() - task.startTime : null,
      traceId
    });
    
    // If task wasn't already marked as complete/error
    if (task && task.status === 'processing') {
      task.status = code === 0 ? 'completed' : 'error';
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
      task.exitCode = code;
    }
    
    // Keep completed tasks in memory for a while for status checks
    setTimeout(() => {
      activeTasks.delete(taskId);
    }, 3600000); // Clean up after 1 hour
  });
  
  return { taskId };
}

/**
 * Process a transformation asynchronously
 * 
 * @param {Object} options - Processing options
 * @returns {Object} Task information
 */
function processTransformationAsync(options) {
  const taskId = uuidv4();
  const { transformation, executionId, traceId, onComplete } = options;
  
  systemLogger.info('Starting async transformation', { 
    taskId, 
    transformationId: transformation.transformation_id,
    transformationType: transformation.type,
    executionId,
    traceId
  });
  
  // Create task record
  const taskInfo = {
    taskId,
    type: 'transformation',
    status: 'processing',
    progress: 0,
    startTime: Date.now(),
    options,
    worker: null,
    onComplete
  };
  
  // Store in active tasks map
  activeTasks.set(taskId, taskInfo);
  
  // Create worker thread
  const worker = new Worker(workerPath, {
    workerData: {
      taskType: 'transformation',
      taskId,
      options
    }
  });
  
  // Update task with worker reference
  taskInfo.worker = worker;
  
  // Set up message handling
  worker.on('message', (message) => {
    handleWorkerMessage(taskId, message);
  });
  
  // Handle worker errors
  worker.on('error', (error) => {
    systemLogger.error('Transformation worker error', { 
      taskId, 
      error: error.message,
      stack: error.stack,
      traceId
    });
    
    // Update task status
    const task = activeTasks.get(taskId);
    if (task) {
      task.status = 'error';
      task.error = error.message;
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
      
      // Call onComplete callback if provided
      if (task.onComplete && typeof task.onComplete === 'function') {
        try {
          task.onComplete({
            success: false,
            error: error.message,
            taskId,
            executionId
          });
        } catch (callbackError) {
          systemLogger.error('Error in transformation completion callback', {
            callbackError: callbackError.message,
            taskId,
            traceId
          });
        }
      }
    }
  });
  
  // Handle worker exit
  worker.on('exit', (code) => {
    const task = activeTasks.get(taskId);
    
    systemLogger.debug('Transformation worker exited', { 
      taskId, 
      exitCode: code,
      duration: task ? Date.now() - task.startTime : null,
      traceId
    });
    
    // Keep completed tasks in memory for a while for status checks
    setTimeout(() => {
      activeTasks.delete(taskId);
    }, 3600000); // Clean up after 1 hour
  });
  
  return { taskId };
}

/**
 * Handle messages from worker threads
 * 
 * @param {string} taskId - Task ID
 * @param {Object} message - Message from worker
 */
function handleWorkerMessage(taskId, message) {
  const task = activeTasks.get(taskId);
  
  if (!task) {
    systemLogger.warn('Received message for unknown task', { taskId, message });
    return;
  }
  
  const { type, data } = message;
  
  switch (type) {
    case 'progress':
      task.progress = data.progress;
      task.stage = data.stage;
      systemLogger.debug('Task progress updated', { 
        taskId, 
        progress: data.progress,
        stage: data.stage
      });
      break;
      
    case 'complete':
      task.status = 'completed';
      task.result = data.result;
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
      
      systemLogger.info('Task completed', { 
        taskId, 
        duration: task.duration,
        traceId: task.options.traceId
      });
      
      // Call onComplete callback if provided
      if (task.onComplete && typeof task.onComplete === 'function') {
        try {
          task.onComplete({
            success: true,
            result: data.result,
            taskId,
            executionId: task.options.executionId
          });
        } catch (error) {
          systemLogger.error('Error in task completion callback', {
            error: error.message,
            taskId,
            traceId: task.options.traceId
          });
        }
      }
      break;
      
    case 'error':
      task.status = 'error';
      task.error = data.error;
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
      
      systemLogger.error('Task error', { 
        taskId, 
        error: data.error,
        duration: task.duration,
        traceId: task.options.traceId
      });
      
      // Call onComplete callback if provided
      if (task.onComplete && typeof task.onComplete === 'function') {
        try {
          task.onComplete({
            success: false,
            error: data.error,
            taskId,
            executionId: task.options.executionId
          });
        } catch (error) {
          systemLogger.error('Error in task error callback', {
            error: error.message,
            taskId,
            traceId: task.options.traceId
          });
        }
      }
      break;
      
    default:
      systemLogger.debug('Received message from worker', { 
        taskId, 
        messageType: type
      });
  }
}

/**
 * Get the status of a task
 * 
 * @param {string} taskId - Task ID
 * @returns {Object|null} Task status or null if not found
 */
function getTaskStatus(taskId) {
  const task = activeTasks.get(taskId);
  
  if (!task) {
    return null;
  }
  
  // Return a sanitized copy without worker reference
  return {
    taskId: task.taskId,
    type: task.type,
    status: task.status,
    progress: task.progress,
    stage: task.stage,
    startTime: task.startTime,
    endTime: task.endTime,
    duration: task.duration,
    error: task.error
  };
}

/**
 * Get all active tasks
 * 
 * @returns {Array<Object>} List of task status objects
 */
function getAllTasks() {
  const tasks = [];
  
  for (const [taskId, task] of activeTasks.entries()) {
    // Return sanitized copies without worker references
    tasks.push({
      taskId: task.taskId,
      type: task.type,
      status: task.status,
      progress: task.progress,
      stage: task.stage,
      startTime: task.startTime,
      endTime: task.endTime,
      duration: task.duration,
      error: task.error
    });
  }
  
  return tasks;
}

/**
 * Cancel a running task
 * 
 * @param {string} taskId - Task ID
 * @returns {boolean} Success status
 */
function cancelTask(taskId) {
  const task = activeTasks.get(taskId);
  
  if (!task || !task.worker) {
    return false;
  }
  
  try {
    // Terminate worker thread
    task.worker.terminate();
    
    // Update task status
    task.status = 'cancelled';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    
    systemLogger.info('Task cancelled', { 
      taskId, 
      type: task.type,
      duration: task.duration
    });
    
    return true;
  } catch (error) {
    systemLogger.error('Error cancelling task', { 
      taskId, 
      error: error.message
    });
    return false;
  }
}

module.exports = {
  processFileAsync,
  processTransformationAsync,
  getTaskStatus,
  getAllTasks,
  cancelTask
};