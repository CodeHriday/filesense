/**
 * Asynchronous Processing Utility for ETL Operations
 * 
 * This module provides utilities for handling heavy ETL operations asynchronously
 * using worker threads, allowing the main application thread to remain responsive.
 */

const path = require('path');
const { Worker } = require('worker_threads');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

// In-memory storage for task tracking
const activeTasks = new Map();

/**
 * Create and manage an asynchronous task
 */
class AsyncTask extends EventEmitter {
  constructor(task) {
    super();
    this.id = task.id || uuidv4();
    this.task = task;
    this.status = 'pending';
    this.startTime = Date.now();
    this.progress = 0;
    this.result = null;
    this.error = null;
  }

  /**
   * Run the task using worker threads
   */
  async run() {
    try {
      this.status = 'running';
      
      // Create a worker thread for the task
      const worker = new Worker(path.join(__dirname, 'processorWorker.js'), {
        workerData: {
          taskId: this.id,
          taskType: this.task.type,
          taskParams: this.task.params
        }
      });

      // Handle worker thread messages
      worker.on('message', (message) => {
        switch (message.type) {
          case 'progress':
            this.progress = message.data;
            this.emit('progress', this.progress);
            break;
          case 'result':
            this.result = message.data;
            this.status = 'completed';
            this.endTime = Date.now();
            this.emit('completed', this.result);
            break;
          case 'log':
            this.emit('log', message.data);
            break;
        }
      });

      // Handle worker thread errors
      worker.on('error', (err) => {
        this.error = err.message;
        this.status = 'failed';
        this.endTime = Date.now();
        this.emit('error', err);
      });

      // Handle worker thread exit
      worker.on('exit', (code) => {
        if (code !== 0 && this.status !== 'completed' && this.status !== 'failed') {
          this.error = `Worker stopped with exit code ${code}`;
          this.status = 'failed';
          this.endTime = Date.now();
          this.emit('error', new Error(this.error));
        }
      });

      return this;
    } catch (err) {
      this.error = err.message;
      this.status = 'failed';
      this.endTime = Date.now();
      throw err;
    }
  }

  /**
   * Get the current task status
   */
  getStatus() {
    return {
      id: this.id,
      status: this.status,
      progress: this.progress,
      startTime: this.startTime,
      endTime: this.endTime,
      error: this.error,
      elapsedTime: Date.now() - this.startTime
    };
  }
}

/**
 * Execute a transformation operation asynchronously
 * 
 * @param {Object} transformConfig - The transformation configuration
 * @returns {Promise<AsyncTask>} - The task object
 */
async function executeTransformation(transformConfig) {
  const task = new AsyncTask({
    id: uuidv4(),
    type: 'transformation',
    params: transformConfig
  });
  
  activeTasks.set(task.id, task);
  return task.run();
}

/**
 * Execute a file processing operation asynchronously
 * 
 * @param {Object} fileConfig - The file processing configuration
 * @returns {Promise<AsyncTask>} - The task object
 */
async function processFileAsync(fileConfig) {
  const task = new AsyncTask({
    id: uuidv4(),
    type: 'file_processing',
    params: fileConfig
  });
  
  activeTasks.set(task.id, task);
  return task.run();
}

/**
 * Execute a data validation operation asynchronously
 * 
 * @param {Object} validationConfig - The validation configuration
 * @returns {Promise<AsyncTask>} - The task object
 */
async function validateDataAsync(validationConfig) {
  const task = new AsyncTask({
    id: uuidv4(),
    type: 'data_validation',
    params: validationConfig
  });
  
  activeTasks.set(task.id, task);
  return task.run();
}

/**
 * Get the status of a task by ID
 * 
 * @param {string} taskId - The task ID
 * @returns {Object|null} - The task status or null if not found
 */
function getTaskStatus(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) return null;
  
  return task.getStatus();
}

/**
 * Get the list of all active tasks
 * 
 * @returns {Array} - Array of task statuses
 */
function listActiveTasks() {
  return Array.from(activeTasks.values()).map(task => task.getStatus());
}

/**
 * Clean up completed tasks older than a specified age
 * 
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
function cleanupTasks(maxAgeMs = 3600000) {
  const now = Date.now();
  
  for (const [id, task] of activeTasks.entries()) {
    if ((task.status === 'completed' || task.status === 'failed') && 
        now - task.endTime > maxAgeMs) {
      activeTasks.delete(id);
    }
  }
}

// Auto-cleanup every hour
setInterval(cleanupTasks, 3600000);

module.exports = {
  executeTransformation,
  processFileAsync,
  validateDataAsync,
  getTaskStatus,
  listActiveTasks,
  cleanupTasks
};