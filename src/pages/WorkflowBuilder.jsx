import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  Panel,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import './WorkflowBuilder.css';
import axios from 'axios';
import { FaSave, FaPlay, FaClock, FaPlus, FaTrash, FaSearch } from 'react-icons/fa';

// Custom node component for ETL mapping jobs
const JobNode = ({ data }) => {
  return (
    <div className="workflow-job-node">
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="workflow-job-node-handle"
      />
      <div className="workflow-job-node-header">
        <span className="workflow-job-node-title">{data.label}</span>
      </div>
      {data.description && (
        <div className="workflow-job-node-description">{data.description}</div>
      )}
      <div className="workflow-job-node-footer">
        <span className="workflow-job-node-id">#{data.assetId}</span>
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="workflow-job-node-handle"
      />
    </div>
  );
};

const nodeTypes = {
  job: JobNode
};

const WorkflowBuilderContent = () => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Workflow metadata
  const [workflowId, setWorkflowId] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  
  // Available assets for palette
  const [availableJobs, setAvailableJobs] = useState([]);
  const [availableJobGroups, setAvailableJobGroups] = useState([]);
  const [availableWorkflows, setAvailableWorkflows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Palette section collapse states
  const [showJobs, setShowJobs] = useState(true);
  const [showJobGroups, setShowJobGroups] = useState(true);
  const [showWorkflows, setShowWorkflows] = useState(true);
  
  // Palette panel visibility
  const [showPalette, setShowPalette] = useState(true);
  const [showConfig, setShowConfig] = useState(true);
  
  // Project context
  const [projectId, setProjectId] = useState(null);
  const [subProjectId, setSubProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  
  // Schedule modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  
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
  
  // Load workflow if ID is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      setWorkflowId(parseInt(id));
      loadWorkflow(parseInt(id));
    }
  }, []);
  
  // Load all available assets
  useEffect(() => {
    loadAvailableAssets();
    loadProjects();
  }, []);
  
  const loadAvailableAssets = async () => {
    const token = localStorage.getItem('token');
    try {
      // Load mapping jobs, job groups, and workflows in parallel
      const [jobsRes, groupsRes, workflowsRes] = await Promise.all([
        axios.get('/api/transformations', {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() }
        }),
        axios.get('/api/mapping-groups', {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() }
        }),
        axios.get('/api/visual-workflows', {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
          params: { _t: Date.now() }
        })
      ]);
      
      setAvailableJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
      setAvailableJobGroups(groupsRes.data?.groups && Array.isArray(groupsRes.data.groups) ? groupsRes.data.groups : []);
      setAvailableWorkflows(Array.isArray(workflowsRes.data) ? workflowsRes.data : []);
    } catch (err) {
      console.error('Failed to load available assets:', err);
      setError('Failed to load workflow assets');
    }
  };
  
  const loadProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };
  
  // Load subprojects when project changes
  useEffect(() => {
    if (projectId) {
      loadSubProjects(projectId);
    } else {
      setSubProjects([]);
      setSubProjectId(null);
    }
  }, [projectId]);
  
  const loadSubProjects = async (pid) => {
    try {
      console.log('Loading subprojects for project:', pid);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/projects/${pid}/sub-projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const subProjectsData = Array.isArray(response.data) ? response.data : [];
      console.log('Loaded subprojects:', subProjectsData);
      setSubProjects(subProjectsData);
    } catch (err) {
      console.error('Failed to load subprojects:', err);
      setSubProjects([]);
    }
  };
  
  const loadWorkflow = async (id) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/visual-workflows/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const workflow = response.data;
      setWorkflowName(workflow.name || '');
      setWorkflowDescription(workflow.description || '');
      
      // Set project first
      const workflowProjectId = workflow.project_id || null;
      setProjectId(workflowProjectId);
      
      // If there's a project, load its subprojects and then set the subproject
      if (workflowProjectId) {
        try {
          const subProjectsResponse = await axios.get(`/api/projects/${workflowProjectId}/sub-projects`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSubProjects(Array.isArray(subProjectsResponse.data) ? subProjectsResponse.data : []);
        } catch (err) {
          console.error('Failed to load subprojects for workflow:', err);
          setSubProjects([]);
        }
      }
      
      // Now set the subproject after subprojects are loaded
      setSubProjectId(workflow.sub_project_id || null);
      
      // Load graph data (nodes and edges)
      if (workflow.graph_data) {
        const graphData = typeof workflow.graph_data === 'string' 
          ? JSON.parse(workflow.graph_data) 
          : workflow.graph_data;
          
        if (graphData.nodes && Array.isArray(graphData.nodes)) {
          setNodes(graphData.nodes);
        }
        if (graphData.edges && Array.isArray(graphData.edges)) {
          setEdges(graphData.edges);
        }
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to load workflow:', err);
      setError('Failed to load workflow');
      setLoading(false);
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
  
  // Drag asset from palette to canvas (supports jobs, job groups, workflows)
  const onDragStart = (event, asset) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/reactflow', JSON.stringify(asset));
  };
  
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      
      if (!containerReady || !reactFlowInstance) {
        return;
      }
      
      const assetData = JSON.parse(event.dataTransfer.getData('application/reactflow'));
      const position = reactFlowInstance.project({
        x: event.clientX - 250,
        y: event.clientY - 80
      });
      
      // Determine node properties based on asset type
      let nodeId, nodeLabel, assetId, assetType;
      
      if (assetData.assetType === 'mapping_job') {
        nodeId = `job-${assetData.mapping_id}-${Date.now()}`;
        nodeLabel = assetData.mapping_name;
        assetId = assetData.mapping_id;
        assetType = 'job'; // Use 'job' for backend executor compatibility
      } else if (assetData.assetType === 'job_group') {
        nodeId = `group-${assetData.id}-${Date.now()}`;
        nodeLabel = assetData.name;
        assetId = assetData.id;
        assetType = 'mapping_group'; // Use 'mapping_group' for backend executor compatibility
      } else if (assetData.assetType === 'workflow') {
        nodeId = `workflow-${assetData.id}-${Date.now()}`;
        nodeLabel = assetData.name;
        assetId = assetData.id;
        assetType = 'workflow';
      } else {
        return; // Unknown asset type
      }
      
      const newNode = {
        id: nodeId,
        type: 'job',
        position,
        data: {
          label: nodeLabel,
          assetId: assetId,
          assetType: assetType
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
    
    if (!projectId) {
      setError('Please select a project');
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
        project_id: projectId,
        sub_project_id: subProjectId
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
      
      // Show schedule modal after successful save
      setShowScheduleModal(true);
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
  
  // Filter assets by search query
  const filteredJobs = (Array.isArray(availableJobs) ? availableJobs : []).filter(job =>
    job.mapping_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredJobGroups = (Array.isArray(availableJobGroups) ? availableJobGroups : []).filter(group =>
    group.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredWorkflows = (Array.isArray(availableWorkflows) ? availableWorkflows : []).filter(workflow =>
    workflow.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <div className="workflow-builder">
      {/* Header */}
      <div className="workflow-builder-header">
        <div className="workflow-builder-header-left">
          <h1>Visual Workflow Builder{workflowId && workflowName ? ` - Editing: ${workflowName}` : ''}</h1>
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
        {/* Asset Palette - 3 Sections */}
        {showPalette && (
          <div className="workflow-builder-palette">
            <div className="workflow-builder-palette-header">
              <h3>Assets</h3>
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
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="workflow-builder-search-input"
              />
            </div>
            
            <div className="workflow-builder-palette-content">
              {/* Section 1: Mapping Jobs */}
              <div className="workflow-builder-palette-section">
                <div 
                  className="workflow-builder-palette-section-header"
                  onClick={() => setShowJobs(!showJobs)}
                >
                  <span className="workflow-builder-palette-section-toggle">
                    {showJobs ? '▼' : '▶'}
                  </span>
                  <span className="workflow-builder-palette-section-title">
                    MAPPING JOBS ({filteredJobs.length})
                  </span>
                </div>
                {showJobs && (
                  <div className="workflow-builder-palette-section-items">
                    {filteredJobs.length === 0 ? (
                      <div className="workflow-builder-palette-empty">
                        {searchQuery ? 'No matches' : 'No mapping jobs'}
                      </div>
                    ) : (
                      filteredJobs.map(job => (
                        <div
                          key={job.mapping_id}
                          className="workflow-builder-palette-item"
                          draggable
                          onDragStart={(e) => onDragStart(e, { ...job, assetType: 'mapping_job' })}
                        >
                          {job.mapping_name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Section 2: Job Groups */}
              <div className="workflow-builder-palette-section">
                <div 
                  className="workflow-builder-palette-section-header"
                  onClick={() => setShowJobGroups(!showJobGroups)}
                >
                  <span className="workflow-builder-palette-section-toggle">
                    {showJobGroups ? '▼' : '▶'}
                  </span>
                  <span className="workflow-builder-palette-section-title">
                    JOB GROUPS ({filteredJobGroups.length})
                  </span>
                </div>
                {showJobGroups && (
                  <div className="workflow-builder-palette-section-items">
                    {filteredJobGroups.length === 0 ? (
                      <div className="workflow-builder-palette-empty">
                        {searchQuery ? 'No matches' : 'No job groups'}
                      </div>
                    ) : (
                      filteredJobGroups.map(group => (
                        <div
                          key={group.id}
                          className="workflow-builder-palette-item"
                          draggable
                          onDragStart={(e) => onDragStart(e, { ...group, assetType: 'job_group' })}
                        >
                          {group.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {/* Section 3: Workflows */}
              <div className="workflow-builder-palette-section">
                <div 
                  className="workflow-builder-palette-section-header"
                  onClick={() => setShowWorkflows(!showWorkflows)}
                >
                  <span className="workflow-builder-palette-section-toggle">
                    {showWorkflows ? '▼' : '▶'}
                  </span>
                  <span className="workflow-builder-palette-section-title">
                    WORKFLOWS ({filteredWorkflows.length})
                  </span>
                </div>
                {showWorkflows && (
                  <div className="workflow-builder-palette-section-items">
                    {filteredWorkflows.length === 0 ? (
                      <div className="workflow-builder-palette-empty">
                        {searchQuery ? 'No matches' : 'No workflows'}
                      </div>
                    ) : (
                      filteredWorkflows.map(workflow => (
                        <div
                          key={workflow.id}
                          className="workflow-builder-palette-item"
                          draggable
                          onDragStart={(e) => onDragStart(e, { ...workflow, assetType: 'workflow' })}
                        >
                          {workflow.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
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
                <label>Project *</label>
                <select
                  value={projectId || ''}
                  onChange={(e) => setProjectId(e.target.value ? parseInt(e.target.value) : null)}
                  className="workflow-builder-input"
                >
                  <option value="">Select a project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="workflow-builder-form-group">
                <label>Subproject</label>
                <select
                  value={subProjectId || ''}
                  onChange={(e) => setSubProjectId(e.target.value ? parseInt(e.target.value) : null)}
                  className="workflow-builder-input"
                  disabled={!projectId || subProjects.length === 0}
                >
                  <option value="">None (use main project)</option>
                  {subProjects.map(subProject => (
                    <option key={subProject.id} value={subProject.id}>
                      {subProject.name}
                    </option>
                  ))}
                </select>
                {projectId && subProjects.length === 0 && (
                  <small style={{ color: '#666', fontSize: '10px', marginTop: '4px', display: 'block' }}>
                    No subprojects available for this project
                  </small>
                )}
              </div>
              
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
              
              <div className="workflow-builder-info-box">
                <div className="workflow-builder-info-icon">ℹ️</div>
                <div>
                  <strong>Smart Execution</strong>
                  <p>Jobs are executed based on their dependencies. Independent jobs run in parallel, while dependent jobs run sequentially in the correct order.</p>
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
        
        {/* Schedule Modal */}
        {showScheduleModal && (
          <div className="workflow-builder-modal-overlay" onClick={() => setShowScheduleModal(false)}>
            <div className="workflow-builder-modal" onClick={(e) => e.stopPropagation()}>
              <div className="workflow-builder-modal-header">
                <h3>Schedule Workflow</h3>
                <button 
                  className="workflow-builder-modal-close"
                  onClick={() => setShowScheduleModal(false)}
                >
                  ×
                </button>
              </div>
              
              <div className="workflow-builder-modal-content">
                <p className="workflow-builder-modal-message">
                  Workflow "<strong>{workflowName}</strong>" has been saved successfully.
                </p>
                <p className="workflow-builder-modal-subtitle">
                  Would you like to schedule this workflow to run automatically?
                </p>
                
                <div className="workflow-builder-modal-actions">
                  <button 
                    className="workflow-builder-btn workflow-builder-btn-secondary"
                    onClick={() => setShowScheduleModal(false)}
                  >
                    Skip for now
                  </button>
                  <button 
                    className="workflow-builder-btn workflow-builder-btn-primary"
                    onClick={() => {
                      setShowScheduleModal(false);
                      navigate('/etl-scheduler/create', {
                        state: {
                          entityType: 'workflow',
                          entityId: workflowId,
                          entityName: workflowName,
                          projectId: projectId,
                          subProjectId: subProjectId
                        }
                      });
                    }}
                  >
                    <FaClock style={{ marginRight: '6px' }} />
                    Set up schedule
                  </button>
                </div>
              </div>
            </div>
          </div>
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
