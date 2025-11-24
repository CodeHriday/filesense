import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import './VisualMappingCanvas.css';
import axios from 'axios';
import { 
  FaSave, 
  FaPlay, 
  FaClock, 
  FaPlus, 
  FaTrash, 
  FaSearch,
  FaCog,
  FaDatabase,
  FaCode,
  FaExchangeAlt,
  FaRandom,
  FaCheckCircle
} from 'react-icons/fa';
import MappingConfigModal from '../components/VisualMappingModals/MappingConfigModal';
import SourceConfigModal from '../components/VisualMappingModals/SourceConfigModal';
import ExpressionModal from '../components/VisualMappingModals/ExpressionModal';
import RdmDatasetModal from '../components/VisualMappingModals/RdmDatasetModal';
import RdmCrosswalkModal from '../components/VisualMappingModals/RdmCrosswalkModal';
import TargetRulesModal from '../components/VisualMappingModals/TargetRulesModal';

// Custom node components for different mapping node types
const MappingConfigNode = ({ data }) => {
  return (
    <div className="visual-mapping-node visual-mapping-node-config">
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="output"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaCog className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.description && (
        <div className="visual-mapping-node-description">{data.description}</div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.id)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
    </div>
  );
};

const SourceConfigNode = ({ data }) => {
  return (
    <div className="visual-mapping-node visual-mapping-node-source">
      <Handle 
        type="target" 
        position={Position.Top} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaDatabase className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.connectionName && (
        <div className="visual-mapping-node-detail">
          <strong>Connection:</strong> {data.config.connectionName}
        </div>
      )}
      {data.config?.filePattern && (
        <div className="visual-mapping-node-detail">
          <strong>Pattern:</strong> {data.config.filePattern}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.id)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const ExpressionNode = ({ data }) => {
  return (
    <div className="visual-mapping-node visual-mapping-node-expression">
      <Handle 
        type="target" 
        position={Position.Top} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaCode className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.mappingCount && (
        <div className="visual-mapping-node-detail">
          <strong>Fields:</strong> {data.config.mappingCount}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.id)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const RdmDatasetNode = ({ data }) => {
  return (
    <div className="visual-mapping-node visual-mapping-node-rdm-dataset">
      <Handle 
        type="target" 
        position={Position.Top} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaExchangeAlt className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.datasetName && (
        <div className="visual-mapping-node-detail">
          <strong>Dataset:</strong> {data.config.datasetName}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.id)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const RdmCrosswalkNode = ({ data }) => {
  return (
    <div className="visual-mapping-node visual-mapping-node-rdm-crosswalk">
      <Handle 
        type="target" 
        position={Position.Top} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaRandom className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.crosswalkName && (
        <div className="visual-mapping-node-detail">
          <strong>Crosswalk:</strong> {data.config.crosswalkName}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.id)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="output"
        className="visual-mapping-node-handle"
      />
    </div>
  );
};

const TargetRulesNode = ({ data }) => {
  return (
    <div className="visual-mapping-node visual-mapping-node-target">
      <Handle 
        type="target" 
        position={Position.Top} 
        id="input"
        className="visual-mapping-node-handle"
      />
      <div className="visual-mapping-node-header">
        <FaCheckCircle className="visual-mapping-node-icon" />
        <span className="visual-mapping-node-title">{data.label}</span>
      </div>
      {data.config?.connectionName && (
        <div className="visual-mapping-node-detail">
          <strong>Target:</strong> {data.config.connectionName}
        </div>
      )}
      {data.config?.fileName && (
        <div className="visual-mapping-node-detail">
          <strong>File:</strong> {data.config.fileName}
        </div>
      )}
      <button 
        onClick={() => data.onConfigure && data.onConfigure(data.id)}
        className="visual-mapping-node-button"
      >
        Configure
      </button>
    </div>
  );
};

const nodeTypes = {
  mappingConfig: MappingConfigNode,
  sourceConfig: SourceConfigNode,
  expression: ExpressionNode,
  rdmDataset: RdmDatasetNode,
  rdmCrosswalk: RdmCrosswalkNode,
  targetRules: TargetRulesNode
};

const VisualMappingCanvasContent = () => {
  const navigate = useNavigate();
  const { mappingId } = useParams();
  const isEditMode = !!mappingId;
  const containerRef = useRef(null);
  
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Mapping metadata
  const [mappingName, setMappingName] = useState('');
  const [mappingDescription, setMappingDescription] = useState('');
  
  // Project context
  const [projectId, setProjectId] = useState(null);
  const [subProjectId, setSubProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  
  // Palette panel visibility
  const [showPalette, setShowPalette] = useState(true);
  const [showConfig, setShowConfig] = useState(true);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Configuration modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configNodeId, setConfigNodeId] = useState(null);
  const [configNodeType, setConfigNodeType] = useState(null);
  
  // Wait for canvas container to be ready
  useEffect(() => {
    if (!containerRef.current) return;
    
    const el = containerRef.current;
    if (el.clientWidth > 20 && el.clientHeight > 20) {
      setContainerReady(true);
      return;
    }
    
    const timeout = setTimeout(() => {
      if (el.clientWidth > 20 && el.clientHeight > 20) {
        setContainerReady(true);
      }
    }, 100);
    
    return () => clearTimeout(timeout);
  }, []);
  
  // Load projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get('/api/projects');
        setProjects(response.data);
      } catch (error) {
        console.error('Error fetching projects:', error);
      }
    };
    fetchProjects();
  }, []);
  
  // Load subprojects when project changes
  useEffect(() => {
    const fetchSubProjects = async () => {
      if (!projectId) {
        setSubProjects([]);
        return;
      }
      try {
        const response = await axios.get(`/api/projects/${projectId}/sub-projects`);
        setSubProjects(response.data);
      } catch (error) {
        console.error('Error fetching subprojects:', error);
        setSubProjects([]);
      }
    };
    fetchSubProjects();
  }, [projectId]);
  
  // Load existing mapping if in edit mode
  useEffect(() => {
    const fetchMapping = async () => {
      if (!isEditMode) return;
      
      setLoading(true);
      try {
        const response = await axios.get(`/api/visual-mappings/${mappingId}`);
        const mapping = response.data;
        
        setMappingName(mapping.name);
        setMappingDescription(mapping.description || '');
        setProjectId(mapping.project_id);
        setSubProjectId(mapping.sub_project_id);
        
        if (mapping.graph_data && mapping.graph_data.nodes) {
          const loadedNodes = mapping.graph_data.nodes.map(node => ({
            ...node,
            data: {
              ...node.data,
              onConfigure: handleNodeConfigure
            }
          }));
          setNodes(loadedNodes);
          setEdges(mapping.graph_data.edges || []);
        }
        
        if (mapping.canvas_state && reactFlowInstance) {
          reactFlowInstance.setViewport({
            x: mapping.canvas_state.position?.[0] || 0,
            y: mapping.canvas_state.position?.[1] || 0,
            zoom: mapping.canvas_state.zoom || 1
          });
        }
      } catch (error) {
        console.error('Error loading visual mapping:', error);
        setError('Failed to load visual mapping');
      } finally {
        setLoading(false);
      }
    };
    
    fetchMapping();
  }, [mappingId, isEditMode, reactFlowInstance]);
  
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);
  
  const handleNodeConfigure = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setConfigNodeId(nodeId);
      setConfigNodeType(node.type);
      setConfigModalOpen(true);
    }
  }, [nodes]);
  
  const handleSaveNodeConfig = useCallback((config) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === configNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config,
              label: config.name || config.connectionName || node.data.label
            }
          };
        }
        return node;
      })
    );
    setConfigModalOpen(false);
    setConfigNodeId(null);
    setConfigNodeType(null);
  }, [configNodeId, setNodes]);
  
  const getCurrentNodeConfig = useCallback(() => {
    const node = nodes.find(n => n.id === configNodeId);
    return node?.data?.config || {};
  }, [nodes, configNodeId]);
  
  const getCumulativeSchema = useCallback(() => {
    // For RDM nodes, calculate cumulative schema from upstream nodes
    if (!configNodeId) return [];
    
    const node = nodes.find(n => n.id === configNodeId);
    if (!node) return [];
    
    // Find all upstream nodes (this is a simplified version - full implementation would traverse the graph)
    const upstreamEdges = edges.filter(e => e.target === configNodeId);
    const sourceNodeIds = upstreamEdges.map(e => e.source);
    
    // Collect schemas from source nodes
    let schema = [];
    sourceNodeIds.forEach(sourceId => {
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (sourceNode?.data?.config?.schema) {
        schema = [...schema, ...sourceNode.data.config.schema];
      }
    });
    
    return schema;
  }, [nodes, edges, configNodeId]);
  
  const addNode = (type, label) => {
    const newNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { 
        x: Math.random() * 300 + 100, 
        y: Math.random() * 300 + 100 
      },
      data: { 
        label,
        config: {},
        onConfigure: handleNodeConfigure
      }
    };
    setNodes((nds) => [...nds, newNode]);
  };
  
  const saveMapping = async () => {
    if (!mappingName.trim()) {
      setError('Please enter a mapping name');
      return;
    }
    
    if (!projectId) {
      setError('Please select a project');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const canvasState = reactFlowInstance ? {
        zoom: reactFlowInstance.getZoom(),
        position: [reactFlowInstance.getViewport().x, reactFlowInstance.getViewport().y]
      } : { zoom: 1, position: [0, 0] };
      
      const payload = {
        name: mappingName,
        description: mappingDescription,
        project_id: projectId,
        sub_project_id: subProjectId,
        graph_data: {
          nodes: nodes.map(n => ({
            ...n,
            data: {
              ...n.data,
              onConfigure: undefined  // Remove function before saving
            }
          })),
          edges
        },
        canvas_state: canvasState
      };
      
      if (isEditMode) {
        await axios.put(`/api/visual-mappings/${mappingId}`, payload);
        setSuccess('Visual mapping updated successfully');
      } else {
        const response = await axios.post('/api/visual-mappings', payload);
        setSuccess('Visual mapping created successfully');
        navigate(`/visual-mappings/${response.data.id}`);
      }
    } catch (error) {
      console.error('Error saving visual mapping:', error);
      setError(error.response?.data?.error || 'Failed to save visual mapping');
    } finally {
      setSaving(false);
    }
  };
  
  const executeMapping = async () => {
    if (!isEditMode) {
      setError('Please save the mapping before executing');
      return;
    }
    
    try {
      const response = await axios.post(`/api/visual-mappings/${mappingId}/execute`);
      setSuccess(`Execution started: ${response.data.execution_id}`);
    } catch (error) {
      console.error('Error executing mapping:', error);
      setError(error.response?.data?.error || 'Failed to execute mapping');
    }
  };
  
  const deleteSelected = () => {
    setNodes((nds) => nds.filter(node => !node.selected));
    setEdges((eds) => eds.filter(edge => !edge.selected));
  };
  
  return (
    <div className="visual-mapping-canvas-container">
      {/* Top Toolbar */}
      <div className="visual-mapping-toolbar">
        <div className="visual-mapping-toolbar-left">
          <h2 className="visual-mapping-title">
            {isEditMode ? 'Edit Visual Mapping' : 'New Visual Mapping'}
          </h2>
          {mappingName && <span className="visual-mapping-name-display">: {mappingName}</span>}
        </div>
        <div className="visual-mapping-toolbar-right">
          <button onClick={() => navigate('/visual-mappings/manage')} className="visual-mapping-toolbar-btn">
            Back to List
          </button>
          <button onClick={deleteSelected} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-danger">
            <FaTrash /> Delete Selected
          </button>
          <button onClick={saveMapping} disabled={saving} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-primary">
            <FaSave /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={executeMapping} disabled={!isEditMode} className="visual-mapping-toolbar-btn visual-mapping-toolbar-btn-success">
            <FaPlay /> Run
          </button>
        </div>
      </div>
      
      {error && <div className="visual-mapping-error">{error}</div>}
      {success && <div className="visual-mapping-success">{success}</div>}
      
      <div className="visual-mapping-content">
        {/* Left Palette Panel */}
        {showPalette && (
          <div className="visual-mapping-palette">
            <div className="visual-mapping-palette-header">
              <h3>Mapping Components</h3>
            </div>
            
            <div className="visual-mapping-palette-section">
              <h4>Configuration</h4>
              <button 
                onClick={() => addNode('mappingConfig', 'Mapping Config')}
                className="visual-mapping-palette-item"
              >
                <FaCog /> Mapping Config
              </button>
            </div>
            
            <div className="visual-mapping-palette-section">
              <h4>Data Source</h4>
              <button 
                onClick={() => addNode('sourceConfig', 'Source Config')}
                className="visual-mapping-palette-item"
              >
                <FaDatabase /> Source Config
              </button>
            </div>
            
            <div className="visual-mapping-palette-section">
              <h4>Transformations</h4>
              <button 
                onClick={() => addNode('expression', 'Expressions')}
                className="visual-mapping-palette-item"
              >
                <FaCode /> Expressions
              </button>
            </div>
            
            <div className="visual-mapping-palette-section">
              <h4>RDM Lookups</h4>
              <button 
                onClick={() => addNode('rdmDataset', 'RDM Dataset')}
                className="visual-mapping-palette-item"
              >
                <FaExchangeAlt /> RDM Dataset
              </button>
              <button 
                onClick={() => addNode('rdmCrosswalk', 'RDM Crosswalk')}
                className="visual-mapping-palette-item"
              >
                <FaRandom /> RDM Crosswalk
              </button>
            </div>
            
            <div className="visual-mapping-palette-section">
              <h4>Output</h4>
              <button 
                onClick={() => addNode('targetRules', 'Target Rules')}
                className="visual-mapping-palette-item"
              >
                <FaCheckCircle /> Target Rules
              </button>
            </div>
          </div>
        )}
        
        {/* Canvas */}
        <div className="visual-mapping-canvas-wrapper" ref={containerRef}>
          {containerReady && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
            >
              <MiniMap />
              <Controls />
              <Background />
              <Panel position="top-left" className="visual-mapping-panel">
                <div className="visual-mapping-config-panel">
                  <div className="visual-mapping-form-group">
                    <label>Mapping Name</label>
                    <input 
                      type="text"
                      value={mappingName}
                      onChange={(e) => setMappingName(e.target.value)}
                      placeholder="Enter mapping name"
                      className="visual-mapping-input"
                    />
                  </div>
                  <div className="visual-mapping-form-group">
                    <label>Description</label>
                    <textarea 
                      value={mappingDescription}
                      onChange={(e) => setMappingDescription(e.target.value)}
                      placeholder="Enter description"
                      className="visual-mapping-textarea"
                      rows="2"
                    />
                  </div>
                  <div className="visual-mapping-form-group">
                    <label>Project</label>
                    <select
                      value={projectId || ''}
                      onChange={(e) => setProjectId(parseInt(e.target.value) || null)}
                      className="visual-mapping-select"
                    >
                      <option value="">Select Project</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {projectId && subProjects.length > 0 && (
                    <div className="visual-mapping-form-group">
                      <label>Sub-Project</label>
                      <select
                        value={subProjectId || ''}
                        onChange={(e) => setSubProjectId(parseInt(e.target.value) || null)}
                        className="visual-mapping-select"
                      >
                        <option value="">Select Sub-Project (Optional)</option>
                        {subProjects.map(sp => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>
      </div>
      
      {/* Configuration Modals */}
      {configNodeType === 'mappingConfig' && (
        <MappingConfigModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
        />
      )}
      
      {configNodeType === 'sourceConfig' && (
        <SourceConfigModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
        />
      )}
      
      {configNodeType === 'expression' && (
        <ExpressionModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          schema={getCumulativeSchema()}
        />
      )}
      
      {configNodeType === 'rdmDataset' && (
        <RdmDatasetModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          cumulativeSchema={getCumulativeSchema()}
        />
      )}
      
      {configNodeType === 'rdmCrosswalk' && (
        <RdmCrosswalkModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
          cumulativeSchema={getCumulativeSchema()}
        />
      )}
      
      {configNodeType === 'targetRules' && (
        <TargetRulesModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          onSave={handleSaveNodeConfig}
          initialConfig={getCurrentNodeConfig()}
        />
      )}
    </div>
  );
};

const VisualMappingCanvas = () => {
  return (
    <ReactFlowProvider>
      <VisualMappingCanvasContent />
    </ReactFlowProvider>
  );
};

export default VisualMappingCanvas;
