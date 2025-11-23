import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import './WorkflowBuilder.css';
import axios from 'axios';
import { FaSave, FaPlay, FaClock, FaPlus, FaTrash, FaSearch } from 'react-icons/fa';

// Custom node component for ETL mapping jobs
const JobNode = ({ data }) => {
  return (
    <div className="workflow-job-node">
      <div className="workflow-job-node-header">
        <span className="workflow-job-node-icon">📊</span>
        <span className="workflow-job-node-title">{data.label}</span>
      </div>
      {data.description && (
        <div className="workflow-job-node-description">{data.description}</div>
      )}
      <div className="workflow-job-node-footer">
        <span className="workflow-job-node-id">#{data.assetId}</span>
      </div>
    </div>
  );
};

const nodeTypes = {
  job: JobNode
};

const WorkflowBuilderContent = () => {
  const containerRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Workflow metadata
  const [workflowId, setWorkflowId] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [executionMode, setExecutionMode] = useState('sequential');
  
  // Available jobs for palette
  const [availableJobs, setAvailableJobs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Palette panel visibility
  const [showPalette, setShowPalette] = useState(true);
  const [showConfig, setShowConfig] = useState(true);
  
  // Wait for canvas container to be measured before allowing layout
  useEffect(() => {
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    
    if (el.clientWidth > 20 && el.clientHeight > 20) {
      setContainerReady(true);
      return;
    }
    
    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 20 && el.clientHeight > 20) {
        setContainerReady(true);
        resizeObserver.disconnect();
      }
    });
    
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);
  
  // Load available ETL mapping jobs
  useEffect(() => {
    loadAvailableJobs();
  }, []);
  
  const loadAvailableJobs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/transformations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data) {
        setAvailableJobs(response.data);
      }
    } catch (err) {
      console.error('Failed to load available jobs:', err);
      setError('Failed to load ETL mapping jobs');
    }
  };
  
  const handleReactFlowInit = useCallback((instance) => {
    console.log('React Flow initialized');
    setReactFlowInstance(instance);
  }, []);
  
  // Handle connecting nodes
  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds));
    },
    [setEdges]
  );
  
  // Drag job from palette to canvas
  const onDragStart = (event, job) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/reactflow', JSON.stringify(job));
  };
  
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      
      if (!containerReady || !reactFlowInstance) {
        return;
      }
      
      const jobData = JSON.parse(event.dataTransfer.getData('application/reactflow'));
      const position = reactFlowInstance.project({
        x: event.clientX - 250,
        y: event.clientY - 80
      });
      
      const newNode = {
        id: `job-${jobData.id}-${Date.now()}`,
        type: 'job',
        position,
        data: {
          label: jobData.name,
          description: jobData.description,
          assetId: jobData.id,
          assetType: 'transformation_mapping'
        }
      };
      
      setNodes((nds) => nds.concat(newNode));
    },
    [containerReady, reactFlowInstance, setNodes]
  );
  
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  // Save workflow
  const saveWorkflow = async () => {
    if (!workflowName.trim()) {
      setError('Please enter a workflow name');
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const token = localStorage.getItem('token');
      const graphData = {
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data
        })),
        edges: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type
        }))
      };
      
      const payload = {
        name: workflowName,
        description: workflowDescription,
        graph_data: graphData,
        execution_mode: executionMode
      };
      
      let response;
      if (workflowId) {
        response = await axios.put(`/api/visual-workflows/${workflowId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        response = await axios.post('/api/visual-workflows', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setWorkflowId(response.data.id);
      }
      
      setSuccess('Workflow saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save workflow:', err);
      setError(err.response?.data?.error || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };
  
  // Execute workflow
  const executeWorkflow = async () => {
    if (!workflowId) {
      setError('Please save the workflow first');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`/api/visual-workflows/${workflowId}/execute`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSuccess('Workflow execution started');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to execute workflow:', err);
      setError(err.response?.data?.error || 'Failed to execute workflow');
    }
  };
  
  // Delete selected nodes/edges
  const deleteSelected = () => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  };
  
  // Filter jobs by search query
  const filteredJobs = availableJobs.filter(job =>
    job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (job.description && job.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  return (
    <div className="workflow-builder">
      {/* Header */}
      <div className="workflow-builder-header">
        <div className="workflow-builder-header-left">
          <h1>Visual Workflow Builder</h1>
          <p>Drag ETL mapping jobs onto the canvas and connect them to create workflows</p>
        </div>
        <div className="workflow-builder-header-actions">
          <button 
            className="workflow-builder-btn workflow-builder-btn-secondary"
            onClick={deleteSelected}
            title="Delete selected items"
          >
            <FaTrash /> Delete Selected
          </button>
          <button 
            className="workflow-builder-btn workflow-builder-btn-secondary"
            onClick={saveWorkflow}
            disabled={saving}
          >
            <FaSave /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button 
            className="workflow-builder-btn workflow-builder-btn-primary"
            onClick={executeWorkflow}
            disabled={!workflowId}
          >
            <FaPlay /> Execute
          </button>
        </div>
      </div>
      
      {/* Alerts */}
      {error && (
        <div className="workflow-builder-alert workflow-builder-alert-error">
          {error}
        </div>
      )}
      {success && (
        <div className="workflow-builder-alert workflow-builder-alert-success">
          {success}
        </div>
      )}
      
      {/* Main content */}
      <div className="workflow-builder-content">
        {/* Job Palette */}
        {showPalette && (
          <div className="workflow-builder-palette">
            <div className="workflow-builder-palette-header">
              <h3>ETL Mapping Jobs</h3>
              <button 
                className="workflow-builder-close-btn"
                onClick={() => setShowPalette(false)}
              >
                ×
              </button>
            </div>
            
            <div className="workflow-builder-search">
              <FaSearch className="workflow-builder-search-icon" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="workflow-builder-search-input"
              />
            </div>
            
            <div className="workflow-builder-palette-jobs">
              {filteredJobs.length === 0 ? (
                <div className="workflow-builder-palette-empty">
                  {searchQuery ? 'No jobs match your search' : 'No ETL mapping jobs available'}
                </div>
              ) : (
                filteredJobs.map(job => (
                  <div
                    key={job.id}
                    className="workflow-builder-palette-job"
                    draggable
                    onDragStart={(e) => onDragStart(e, job)}
                  >
                    <div className="workflow-builder-palette-job-title">
                      📊 {job.name}
                    </div>
                    {job.description && (
                      <div className="workflow-builder-palette-job-desc">
                        {job.description}
                      </div>
                    )}
                    <div className="workflow-builder-palette-job-id">
                      ID: {job.id}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {/* Canvas */}
        <div className="workflow-builder-canvas-wrapper" ref={containerRef}>
          {!showPalette && (
            <button 
              className="workflow-builder-show-palette-btn"
              onClick={() => setShowPalette(true)}
            >
              <FaPlus /> Show Jobs
            </button>
          )}
          
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={handleReactFlowInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView={false}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background color="#e0e0e0" gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        
        {/* Configuration Panel */}
        {showConfig && (
          <div className="workflow-builder-config">
            <div className="workflow-builder-config-header">
              <h3>Workflow Settings</h3>
              <button 
                className="workflow-builder-close-btn"
                onClick={() => setShowConfig(false)}
              >
                ×
              </button>
            </div>
            
            <div className="workflow-builder-config-content">
              <div className="workflow-builder-form-group">
                <label>Workflow Name *</label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Enter workflow name"
                  className="workflow-builder-input"
                />
              </div>
              
              <div className="workflow-builder-form-group">
                <label>Description</label>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Enter workflow description"
                  className="workflow-builder-textarea"
                  rows={3}
                />
              </div>
              
              <div className="workflow-builder-form-group">
                <label>Execution Mode</label>
                <select
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value)}
                  className="workflow-builder-select"
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
                <div className="workflow-builder-help-text">
                  Sequential: Jobs run in dependency order. Parallel: Independent jobs run simultaneously.
                </div>
              </div>
              
              <div className="workflow-builder-stats">
                <div className="workflow-builder-stat">
                  <span className="workflow-builder-stat-label">Jobs</span>
                  <span className="workflow-builder-stat-value">{nodes.length}</span>
                </div>
                <div className="workflow-builder-stat">
                  <span className="workflow-builder-stat-label">Dependencies</span>
                  <span className="workflow-builder-stat-value">{edges.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {!showConfig && (
          <button 
            className="workflow-builder-show-config-btn"
            onClick={() => setShowConfig(true)}
          >
            ⚙️ Settings
          </button>
        )}
      </div>
    </div>
  );
};

const WorkflowBuilder = () => {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent />
    </ReactFlowProvider>
  );
};

export default WorkflowBuilder;
