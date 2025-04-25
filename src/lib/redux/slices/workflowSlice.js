/**
 * Workflow Slice
 * 
 * Redux slice for managing workflow and process state, including:
 * - Current workflow status
 * - Workflow history
 * - Process templates
 * - Workflow components and connections
 */
import { createSlice } from '@reduxjs/toolkit';

// Initial state
const initialState = {
  workflows: {
    activeWorkflows: [],
    workflowById: {},
    loading: false,
    error: null,
  },
  canvas: {
    zoom: 1,
    position: { x: 0, y: 0 },
    selectedNodes: [],
    selectedEdges: [],
    activeContextMenu: null,
    isDragging: false,
  },
  processMap: {
    nodes: [],
    edges: [],
    selectedProcessId: null,
  },
};

// Create slice
const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    // Workflow management actions
    setActiveWorkflows: (state, action) => {
      state.workflows.activeWorkflows = action.payload;
    },
    setWorkflow: (state, action) => {
      const workflow = action.payload;
      state.workflows.workflowById[workflow.id] = workflow;
      
      // Add to active workflows if not already there
      if (!state.workflows.activeWorkflows.includes(workflow.id)) {
        state.workflows.activeWorkflows.push(workflow.id);
      }
    },
    updateWorkflow: (state, action) => {
      const { id, updates } = action.payload;
      const existingWorkflow = state.workflows.workflowById[id];
      
      if (existingWorkflow) {
        state.workflows.workflowById[id] = {
          ...existingWorkflow,
          ...updates,
        };
      }
    },
    removeWorkflow: (state, action) => {
      const id = action.payload;
      
      // Remove from active workflows
      state.workflows.activeWorkflows = state.workflows.activeWorkflows.filter(
        (workflowId) => workflowId !== id
      );
      
      // Remove from workflowById
      delete state.workflows.workflowById[id];
    },
    setWorkflowLoading: (state, action) => {
      state.workflows.loading = action.payload;
    },
    setWorkflowError: (state, action) => {
      state.workflows.error = action.payload;
    },
    
    // Canvas interaction actions
    setCanvasZoom: (state, action) => {
      state.canvas.zoom = action.payload;
    },
    setCanvasPosition: (state, action) => {
      state.canvas.position = action.payload;
    },
    selectNodes: (state, action) => {
      state.canvas.selectedNodes = action.payload;
    },
    selectEdges: (state, action) => {
      state.canvas.selectedEdges = action.payload;
    },
    setActiveContextMenu: (state, action) => {
      state.canvas.activeContextMenu = action.payload;
    },
    setIsDragging: (state, action) => {
      state.canvas.isDragging = action.payload;
    },
    resetCanvasView: (state) => {
      state.canvas.zoom = 1;
      state.canvas.position = { x: 0, y: 0 };
      state.canvas.selectedNodes = [];
      state.canvas.selectedEdges = [];
      state.canvas.activeContextMenu = null;
      state.canvas.isDragging = false;
    },
    
    // Process map actions
    setProcessMapNodes: (state, action) => {
      state.processMap.nodes = action.payload;
    },
    setProcessMapEdges: (state, action) => {
      state.processMap.edges = action.payload;
    },
    addNode: (state, action) => {
      state.processMap.nodes.push(action.payload);
    },
    updateNode: (state, action) => {
      const { id, updates } = action.payload;
      const nodeIndex = state.processMap.nodes.findIndex(node => node.id === id);
      
      if (nodeIndex !== -1) {
        state.processMap.nodes[nodeIndex] = {
          ...state.processMap.nodes[nodeIndex],
          ...updates,
        };
      }
    },
    removeNode: (state, action) => {
      const nodeId = action.payload;
      state.processMap.nodes = state.processMap.nodes.filter(node => node.id !== nodeId);
      
      // Also remove any edges connected to this node
      state.processMap.edges = state.processMap.edges.filter(
        edge => edge.source !== nodeId && edge.target !== nodeId
      );
    },
    addEdge: (state, action) => {
      state.processMap.edges.push(action.payload);
    },
    updateEdge: (state, action) => {
      const { id, updates } = action.payload;
      const edgeIndex = state.processMap.edges.findIndex(edge => edge.id === id);
      
      if (edgeIndex !== -1) {
        state.processMap.edges[edgeIndex] = {
          ...state.processMap.edges[edgeIndex],
          ...updates,
        };
      }
    },
    removeEdge: (state, action) => {
      const edgeId = action.payload;
      state.processMap.edges = state.processMap.edges.filter(edge => edge.id !== edgeId);
    },
    setSelectedProcess: (state, action) => {
      state.processMap.selectedProcessId = action.payload;
    },
    resetProcessMap: (state) => {
      state.processMap.nodes = [];
      state.processMap.edges = [];
      state.processMap.selectedProcessId = null;
    },
  },
});

// Export actions
export const {
  setActiveWorkflows,
  setWorkflow,
  updateWorkflow,
  removeWorkflow,
  setWorkflowLoading,
  setWorkflowError,
  setCanvasZoom,
  setCanvasPosition,
  selectNodes,
  selectEdges,
  setActiveContextMenu,
  setIsDragging,
  resetCanvasView,
  setProcessMapNodes,
  setProcessMapEdges,
  addNode,
  updateNode,
  removeNode,
  addEdge,
  updateEdge,
  removeEdge,
  setSelectedProcess,
  resetProcessMap,
} = workflowSlice.actions;

// Selectors
export const selectActiveWorkflows = (state) => state.workflow.workflows.activeWorkflows;
export const selectWorkflowById = (state, id) => state.workflow.workflows.workflowById[id];
export const selectWorkflowLoading = (state) => state.workflow.workflows.loading;
export const selectWorkflowError = (state) => state.workflow.workflows.error;
export const selectCanvasZoom = (state) => state.workflow.canvas.zoom;
export const selectCanvasPosition = (state) => state.workflow.canvas.position;
export const selectSelectedNodes = (state) => state.workflow.canvas.selectedNodes;
export const selectSelectedEdges = (state) => state.workflow.canvas.selectedEdges;
export const selectActiveContextMenu = (state) => state.workflow.canvas.activeContextMenu;
export const selectIsDragging = (state) => state.workflow.canvas.isDragging;
export const selectProcessMapNodes = (state) => state.workflow.processMap.nodes;
export const selectProcessMapEdges = (state) => state.workflow.processMap.edges;
export const selectSelectedProcess = (state) => state.workflow.processMap.selectedProcessId;

export default workflowSlice.reducer;