import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { 
  FiSave, 
  FiChevronLeft, 
  FiChevronRight, 
  FiCheck, 
  FiList, 
  FiFile, 
  FiGrid, 
  FiSliders, 
  FiCalendar, 
  FiUsers, 
  FiDatabase,
  FiLink,
  FiArrowRight,
  FiPlus,
  FiTrash,
  FiAlertTriangle,
  FiCheckCircle,
  FiTable,
  FiCode,
  FiFilter,
  FiGitMerge,
  FiBarChart2,
  FiSearch,
  FiEdit2,
  FiCpu,
  FiSettings,
  FiX,
  FiSave as FiSaveIcon
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import ReactFlow, { 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  MarkerType,
  Panel,
  Handle,
  applyNodeChanges,
  applyEdgeChanges
} from 'reactflow';
import 'reactflow/dist/style.css';
import '../styles/ReactFlowNodes.css';

const ProcessManagementWizard = () => {
  const navigate = useNavigate();
  const { hasWritePermission } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Step 4: Mapping/Transformation Selection
  const [selectedMapping, setSelectedMapping] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [selectedTransformation, setSelectedTransformation] = useState(null);
  const [transformations, setTransformations] = useState([]);
  const [showMappingsTab, setShowMappingsTab] = useState(true);
  
  // Step 1: Create Group
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  
  // Step 2: Create Business Process
  const [businessProcesses, setBusinessProcesses] = useState([]);
  const [selectedBusinessProcess, setSelectedBusinessProcess] = useState(null);
  const [newProcessName, setNewProcessName] = useState('');
  const [newProcessDesc, setNewProcessDesc] = useState('');
  
  // Step 3: Create Job
  const [jobName, setJobName] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [jobStatus, setJobStatus] = useState('active');
  
  // Step 4: Source and Target Connections
  const [connections, setConnections] = useState([]);
  const [sourceConnection, setSourceConnection] = useState(null);
  const [targetConnection, setTargetConnection] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedSourceFile, setSelectedSourceFile] = useState(null);
  const [targetFileName, setTargetFileName] = useState('');
  const [selectedTargetFile, setSelectedTargetFile] = useState(null);
  const [isNewTargetFile, setIsNewTargetFile] = useState(true);
  const [selectedTargetType, setSelectedTargetType] = useState('csv');
  
  // Step 5: Column Mapping
  const [sourceColumns, setSourceColumns] = useState([]);
  const [targetColumns, setTargetColumns] = useState([]);
  const [columnMappings, setColumnMappings] = useState([]);
  
  // Step 6: Transformations
  const [transformationNodes, setTransformationNodes] = useState([]);
  const [transformationEdges, setTransformationEdges] = useState([]);
  // Initialize nodes and edges with React Flow's useNodesState hook
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Enhanced onNodesChange handler for better dragging behavior
  const onNodesChange = useCallback(
    (changes) => {
      // Process each change in the batch
      changes.forEach(change => {
        // For dragging operations, log and make sure nodes get proper class
        if (change.type === 'position' && change.dragging) {
          console.log(`Dragging node ${change.id} to position: `, change.position);
          // This allows for styling nodes differently while being dragged
          const nodeElement = document.querySelector(`[data-id="${change.id}"]`);
          if (nodeElement) {
            nodeElement.classList.add('dragging');
            
            // Ensure the z-index is higher than other nodes while dragging
            const style = nodeElement.style;
            style.zIndex = '1000'; // Temporary high z-index during drag
          }
        } else if (change.type === 'position' && !change.dragging) {
          // Reset dragging styling when node is dropped
          const nodeElement = document.querySelector(`[data-id="${change.id}"]`);
          if (nodeElement) {
            nodeElement.classList.remove('dragging');
            
            // Reset z-index to the node's original value based on its order
            const nodeIndex = nodes.findIndex(n => n.id === change.id);
            const style = nodeElement.style;
            style.zIndex = (nodeIndex + 1).toString(); // Restore based on node order
          }
          
          // When a node is dropped, explicitly ensure it has no parent
          setNodes(nds => {
            const updatedNodes = nds.map(n => {
              if (n.id === change.id) {
                return {
                  ...n,
                  parentNode: null,
                  extent: undefined,
                  expandParent: false
                };
              }
              return n;
            });
            return updatedNodes;
          });
        }
      });
      
      // Apply all changes to nodes
      setNodes(nds => applyNodeChanges(changes, nds));
    },
    [nodes]
  );
  const reactFlowWrapper = useRef(null);
  
  // Step 7: Target Column Settings
  const [targetColumnSettings, setTargetColumnSettings] = useState([]);
  
  // Step 8: Scheduling
  const [scheduleType, setScheduleType] = useState('one-time');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  
  useEffect(() => {
    fetchInitialData();
  }, []);
  
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch groups
      const groupsRes = await axios.get(`${API_BASE_URL}/api/groups`);
      setGroups(groupsRes.data || []);
      
      // Fetch files
      const filesRes = await axios.get(`${API_BASE_URL}/api/files`);
      setFiles(filesRes.data || []);
      
      // Fetch connections
      const connectionsRes = await axios.get(`${API_BASE_URL}/api/connections`);
      setConnections(connectionsRes.data || []);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching initial data:', err);
      setError('Failed to load initial data. Please try again.');
      setLoading(false);
    }
  };
  
  // Fetch mappings and transformations for step 4
  const fetchMappingsAndTransformations = async () => {
    try {
      setLoading(true);
      
      // Fetch mappings
      const mappingsRes = await axios.get(`${API_BASE_URL}/api/mappings`);
      setMappings(mappingsRes.data || []);
      
      // Fetch transformations
      const transformationsRes = await axios.get(`${API_BASE_URL}/api/transformations`);
      setTransformations(transformationsRes.data || []);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching mappings and transformations:', err);
      setError('Failed to load mappings and transformations. Please try again.');
      setLoading(false);
    }
  };
  
  // Load mappings and transformations when step 4 becomes active
  useEffect(() => {
    if (currentStep === 4) {
      fetchMappingsAndTransformations();
    }
  }, [currentStep]);
  
  // Handle step navigation
  const goToNextStep = () => {
    // Validate current step before proceeding
    if (validateCurrentStep()) {
      if (currentStep === 2 && !selectedBusinessProcess) {
        // If on step 2 and no business process selected, create a new one
        createBusinessProcess();
      } else if (currentStep === 1 && !selectedGroup) {
        // If on step 1 and no group selected, create a new one
        createGroup();
      } else {
        setCurrentStep(currentStep + 1);
      }
    }
  };
  
  const goToPreviousStep = () => {
    setCurrentStep(currentStep - 1);
  };
  
  // Validate current step
  const validateCurrentStep = () => {
    switch (currentStep) {
      case 1: // Group selection
        return selectedGroup || (newGroupName.trim() !== '');
      case 2: // Business Process selection
        return selectedBusinessProcess || (newProcessName.trim() !== '');
      case 3: // Job creation
        return jobName.trim() !== '';
      case 4: // Mapping/Transformation selection
        return selectedMapping || selectedTransformation; // Require either a mapping or transformation to be selected
      case 5: // Scheduling
        if (scheduleType === 'one-time') {
          return scheduleDate && scheduleTime;
        } else if (scheduleType === 'recurring') {
          return scheduleCron.trim() !== '';
        }
        return true;
      default:
        return true;
    }
  };
  
  // Step 4: Mapping/Transformation handlers
  const handleMappingSelection = (mappingId) => {
    const selected = mappings.find(mapping => mapping.id === mappingId);
    setSelectedMapping(selected);
    setSelectedTransformation(null);
  };
  
  const handleTransformationSelection = (transformationId) => {
    const selected = transformations.find(transformation => transformation.id === transformationId);
    setSelectedTransformation(selected);
    setSelectedMapping(null);
  };
  
  // Step 1: Group functions
  const createGroup = async () => {
    if (!newGroupName.trim()) {
      setError('Group name is required');
      return;
    }
    
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/api/groups`, {
        name: newGroupName,
        description: newGroupDesc
      });
      
      setGroups([...groups, response.data]);
      setSelectedGroup(response.data);
      setNewGroupName('');
      setNewGroupDesc('');
      setSuccess('Group created successfully');
      setLoading(false);
      
      // Move to next step
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.error('Error creating group:', err);
      setError('Failed to create group. Please try again.');
      setLoading(false);
    }
  };
  
  // Step 2: Business Process functions
  const fetchBusinessProcesses = async (groupId) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/business-processes?groupId=${groupId}`);
      setBusinessProcesses(response.data || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching business processes:', err);
      setError('Failed to fetch business processes. Please try again.');
      setLoading(false);
    }
  };
  
  // Fetch business processes when a group is selected
  useEffect(() => {
    if (selectedGroup?.id) {
      fetchBusinessProcesses(selectedGroup.id);
    }
  }, [selectedGroup]);
  
  const createBusinessProcess = async () => {
    if (!newProcessName.trim()) {
      setError('Process name is required');
      return;
    }
    
    if (!selectedGroup) {
      setError('Please select a group first');
      return;
    }
    
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE_URL}/api/business-processes`, {
        name: newProcessName,
        description: newProcessDesc,
        group_id: selectedGroup.id
      });
      
      setBusinessProcesses([...businessProcesses, response.data]);
      setSelectedBusinessProcess(response.data);
      setNewProcessName('');
      setNewProcessDesc('');
      setSuccess('Business process created successfully');
      setLoading(false);
      
      // Move to next step
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.error('Error creating business process:', err);
      setError('Failed to create business process. Please try again.');
      setLoading(false);
    }
  };
  
  // Step 3: Job selection and creation
  const [existingJobs, setExistingJobs] = useState([]);
  const [isNewJob, setIsNewJob] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  
  // Fetch existing jobs for the selected business process
  const fetchJobsForProcess = async (processId) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/jobs?business_process_id=${processId}`);
      setExistingJobs(response.data || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching jobs for process:', err);
      setExistingJobs([]);
      setLoading(false);
    }
  };
  
  // Fetch jobs when business process is selected
  useEffect(() => {
    if (selectedBusinessProcess?.id) {
      fetchJobsForProcess(selectedBusinessProcess.id);
    }
  }, [selectedBusinessProcess]);
  
  const createJob = async () => {
    if (isNewJob) {
      if (!jobName.trim()) {
        setError('Job name is required');
        return;
      }
      
      if (!selectedBusinessProcess) {
        setError('Please select a business process first');
        return;
      }
      
      try {
        setLoading(true);
        const response = await axios.post(`${API_BASE_URL}/api/jobs`, {
          name: jobName,
          description: jobDesc,
          business_process_id: selectedBusinessProcess.id,
          status: jobStatus
        });
        
        setSuccess('Job created successfully');
        setLoading(false);
        
        // Save job ID for later steps
        sessionStorage.setItem('currentJobId', response.data.id);
        
        // Move to next step
        setCurrentStep(currentStep + 1);
      } catch (err) {
        console.error('Error creating job:', err);
        setError('Failed to create job. Please try again.');
        setLoading(false);
      }
    } else {
      // Use selected existing job
      if (!selectedJob) {
        setError('Please select a job');
        return;
      }
      
      // Save job ID for later steps
      sessionStorage.setItem('currentJobId', selectedJob.id);
      
      // Move to next step
      setCurrentStep(currentStep + 1);
    }
  };
  
  // Step 4: Source and Target file selection
  // Connection handling
  const handleSourceConnectionChange = (e) => {
    const connectionId = e.target.value;
    
    if (connectionId === "internal") {
      // Handle internal database selection
      setSourceConnection("internal");
    } else {
      // Handle external connection selection
      const selected = connections.find(conn => conn.id === connectionId);
      setSourceConnection(selected);
    }
    
    // Reset selected file when connection changes
    setSelectedSourceFile(null);
  };
  
  const handleTargetConnectionChange = (e) => {
    const connectionId = e.target.value;
    
    if (connectionId === "internal") {
      // Handle internal database selection
      setTargetConnection("internal");
    } else {
      // Handle external connection selection
      const selected = connections.find(conn => conn.id === connectionId);
      setTargetConnection(selected);
    }
    
    // Reset selected file when connection changes
    setSelectedTargetFile(null);
    setIsNewTargetFile(true); // Default to creating a new file
  };
  
  // Source file handling
  const handleSourceFileChange = async (fileId) => {
    try {
      setLoading(true);
      const selectedFile = files.find(file => file.file_id === fileId);
      setSelectedSourceFile(selectedFile);
      
      // Fetch columns for this file
      const response = await axios.get(`${API_BASE_URL}/api/files/${fileId}`);
      
      if (response.data && response.data.columns) {
        setSourceColumns(response.data.columns.map(col => ({
          id: col.column_name,
          name: col.column_name,
          type: col.column_type || 'string'
        })));
      } else {
        setSourceColumns([]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching source file columns:', err);
      setSourceColumns([]);
      setLoading(false);
    }
  };
  
  // Target file handling
  const handleTargetFileTypeChange = (type) => {
    setSelectedTargetType(type);
  };
  
  const handleTargetFileNameChange = (e) => {
    setTargetFileName(e.target.value);
  };
  
  const handleExistingTargetFileChange = (fileId) => {
    const selectedFile = files.find(file => file.file_id === fileId);
    setSelectedTargetFile(selectedFile);
  };
  
  const toggleTargetFileMode = () => {
    setIsNewTargetFile(!isNewTargetFile);
    // Reset selection when toggling
    setSelectedTargetFile(null);
    setTargetFileName('');
  };
  
  // Step 5: Column Mapping
  const addColumnMapping = (sourceColumn) => {
    const newMapping = {
      id: `mapping-${Date.now()}`,
      sourceColumn: sourceColumn,
      targetColumn: {
        name: sourceColumn.name,
        type: sourceColumn.type
      },
      transformation: 'none'
    };
    
    setColumnMappings([...columnMappings, newMapping]);
    
    // Also add to target columns for Step 7
    setTargetColumns([...targetColumns, {
      id: `target-${Date.now()}`,
      name: sourceColumn.name,
      type: sourceColumn.type,
      sourceId: sourceColumn.id
    }]);
  };
  
  const removeColumnMapping = (mappingId) => {
    setColumnMappings(columnMappings.filter(mapping => mapping.id !== mappingId));
  };
  
  // Step 6: Transformations - Custom Node Components
  // Configuration modal for transformation nodes
  const [showConfig, setShowConfig] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeConfig, setNodeConfig] = useState({});
  
  // Custom Node Components
  const SourceNode = ({ data }) => {
    return (
      <div className="source-node">
        <div className="node-header">Source: {data.label}</div>
        <div className="node-content">
          <div className="node-type">{data.type}</div>
        </div>
        <Handle type="source" position="right" id="source-right" />
      </div>
    );
  };

  SourceNode.propTypes = {
    data: PropTypes.shape({
      label: PropTypes.string.isRequired,
      type: PropTypes.string,
      sourceId: PropTypes.string
    }).isRequired
  };
  
  const TargetNode = ({ data }) => {
    return (
      <div className="target-node">
        <Handle type="target" position="left" id="target-left" />
        <div className="node-header">Target: {data.label}</div>
        <div className="node-content">
          <div className="node-type">{data.type}</div>
        </div>
      </div>
    );
  };

  TargetNode.propTypes = {
    data: PropTypes.shape({
      label: PropTypes.string.isRequired,
      type: PropTypes.string,
      mappingId: PropTypes.string
    }).isRequired
  };
  
  const FilterNode = ({ data, id }) => {
    return (
      <div className="transform-node filter-node">
        <Handle type="target" position="left" id="filter-target" />
        <div className="node-header">
          <FiFilter className="node-icon" />
          <span>Filter</span>
        </div>
        <div className="node-content">
          {data.condition ? 
            <div className="node-condition">{data.condition}</div> : 
            <div className="node-placeholder">Click to configure</div>
          }
        </div>
        <button 
          className="node-config-btn" 
          onClick={() => openNodeConfig(id, 'filter', data)}
        >
          <FiSettings />
        </button>
        <Handle type="source" position="right" id="filter-source" />
      </div>
    );
  };

  FilterNode.propTypes = {
    data: PropTypes.shape({
      condition: PropTypes.string,
      column: PropTypes.string,
      operator: PropTypes.string,
      value: PropTypes.string
    }).isRequired,
    id: PropTypes.string.isRequired
  };
  
  const JoinNode = ({ data, id }) => {
    return (
      <div className="transform-node join-node">
        <Handle type="target" position="left" id="join-target-left" />
        <Handle type="target" position="top" id="join-target-top" />
        <div className="node-header">
          <FiGitMerge className="node-icon" />
          <span>Join</span>
        </div>
        <div className="node-content">
          {data.joinType ? 
            <div className="node-condition">{data.joinType} Join</div> : 
            <div className="node-placeholder">Click to configure</div>
          }
        </div>
        <button 
          className="node-config-btn" 
          onClick={() => openNodeConfig(id, 'join', data)}
        >
          <FiSettings />
        </button>
        <Handle type="source" position="right" id="join-source" />
      </div>
    );
  };

  JoinNode.propTypes = {
    data: PropTypes.shape({
      joinType: PropTypes.string,
      rightTable: PropTypes.string,
      leftColumn: PropTypes.string,
      rightColumn: PropTypes.string
    }).isRequired,
    id: PropTypes.string.isRequired
  };
  
  const AggregateNode = ({ data, id }) => {
    return (
      <div className="transform-node aggregate-node">
        <Handle type="target" position="left" id="aggregate-target" />
        <div className="node-header">
          <FiBarChart2 className="node-icon" />
          <span>Aggregate</span>
        </div>
        <div className="node-content">
          {data.aggregation ? 
            <div className="node-condition">{data.aggregation}</div> : 
            <div className="node-placeholder">Click to configure</div>
          }
        </div>
        <button 
          className="node-config-btn" 
          onClick={() => openNodeConfig(id, 'aggregate', data)}
        >
          <FiSettings />
        </button>
        <Handle type="source" position="right" id="aggregate-source" />
      </div>
    );
  };

  AggregateNode.propTypes = {
    data: PropTypes.shape({
      aggregation: PropTypes.string,
      function: PropTypes.string,
      column: PropTypes.string,
      groupBy: PropTypes.string
    }).isRequired,
    id: PropTypes.string.isRequired
  };
  
  const LookupNode = ({ data, id }) => {
    return (
      <div className="transform-node lookup-node">
        <Handle type="target" position="left" id="lookup-target" />
        <div className="node-header">
          <FiSearch className="node-icon" />
          <span>Lookup</span>
        </div>
        <div className="node-content">
          {data.lookupTable ? 
            <div className="node-condition">From: {data.lookupTable}</div> : 
            <div className="node-placeholder">Click to configure</div>
          }
        </div>
        <button 
          className="node-config-btn" 
          onClick={() => openNodeConfig(id, 'lookup', data)}
        >
          <FiSettings />
        </button>
        <Handle type="source" position="right" id="lookup-source" />
      </div>
    );
  };

  LookupNode.propTypes = {
    data: PropTypes.shape({
      lookupTable: PropTypes.string,
      keyColumn: PropTypes.string,
      lookupColumn: PropTypes.string,
      returnColumn: PropTypes.string
    }).isRequired,
    id: PropTypes.string.isRequired
  };
  
  const FormatNode = ({ data, id }) => {
    return (
      <div className="transform-node format-node">
        <Handle type="target" position="left" id="format-target" />
        <div className="node-header">
          <FiEdit2 className="node-icon" />
          <span>Format</span>
        </div>
        <div className="node-content">
          {data.formatType ? 
            <div className="node-condition">{data.formatType}</div> : 
            <div className="node-placeholder">Click to configure</div>
          }
        </div>
        <button 
          className="node-config-btn" 
          onClick={() => openNodeConfig(id, 'format', data)}
        >
          <FiSettings />
        </button>
        <Handle type="source" position="right" id="format-source" />
      </div>
    );
  };

  FormatNode.propTypes = {
    data: PropTypes.shape({
      formatType: PropTypes.string,
      column: PropTypes.string,
      dateFormat: PropTypes.string,
      decimalPlaces: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      textOperation: PropTypes.string,
      caseOperation: PropTypes.string
    }).isRequired,
    id: PropTypes.string.isRequired
  };
  
  const CalculateNode = ({ data, id }) => {
    return (
      <div className="transform-node calculate-node">
        <Handle type="target" position="left" id="calculate-target" />
        <div className="node-header">
          <FiCpu className="node-icon" />
          <span>Calculate</span>
        </div>
        <div className="node-content">
          {data.formula ? 
            <div className="node-condition">{data.formula}</div> : 
            <div className="node-placeholder">Click to configure</div>
          }
        </div>
        <button 
          className="node-config-btn" 
          onClick={() => openNodeConfig(id, 'calculate', data)}
        >
          <FiSettings />
        </button>
        <Handle type="source" position="right" id="calculate-source" />
      </div>
    );
  };

  CalculateNode.propTypes = {
    data: PropTypes.shape({
      formula: PropTypes.string,
      outputColumn: PropTypes.string
    }).isRequired,
    id: PropTypes.string.isRequired
  };
  
  // Define node types
  const nodeTypes = useMemo(() => ({
    source: SourceNode,
    target: TargetNode,
    filter: FilterNode,
    join: JoinNode,
    aggregate: AggregateNode,
    lookup: LookupNode,
    format: FormatNode,
    calculate: CalculateNode
  }), []);
  
  // Configuration modal functions
  const openNodeConfig = (id, nodeType, data) => {
    setSelectedNode({ id, type: nodeType });
    setNodeConfig(data || {});
    setShowConfig(true);
  };
  
  const saveNodeConfig = () => {
    if (!selectedNode) return;
    
    setNodes(nodes => 
      nodes.map(node => 
        node.id === selectedNode.id 
          ? { ...node, data: { ...node.data, ...nodeConfig } }
          : node
      )
    );
    
    setShowConfig(false);
  };
  
  const closeNodeConfig = () => {
    setShowConfig(false);
    setSelectedNode(null);
    setNodeConfig({});
  };
  
  // Create initial source and target nodes from mapping data
  useEffect(() => {
    if (currentStep === 6 && columnMappings.length > 0 && nodes.length === 0) {
      // Create source and target nodes based on columnMappings
      const sourceNodes = columnMappings.map((mapping, index) => ({
        id: `source-${mapping.sourceColumn.id}`,
        type: 'source',
        position: { x: 50, y: 50 + index * 80 },
        data: { 
          label: mapping.sourceColumn.name,
          type: mapping.sourceColumn.type,
          sourceId: mapping.sourceColumn.id
        }
      }));
      
      const targetNodes = columnMappings.map((mapping, index) => ({
        id: `target-${mapping.id}`,
        type: 'target',
        position: { x: 800, y: 50 + index * 80 },
        data: { 
          label: mapping.targetColumn.name,
          type: mapping.targetColumn.type,
          mappingId: mapping.id
        }
      }));
      
      setNodes([...sourceNodes, ...targetNodes]);
    }
  }, [currentStep, columnMappings, nodes.length, setNodes]);
  
  // Step 6: Transformations - ReactFlow Implementation
  // Handle drag over for the React Flow container
  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };
  
  // Helper function to find the next available position without overlapping
  const findNonOverlappingPosition = (x, y, existingNodes) => {
    // Define node dimensions
    const nodeWidth = 180;
    const nodeHeight = 100;
    // Define spacing between nodes
    const horizontalSpacing = 50;
    const verticalSpacing = 50;
    
    // First attempt to snap to a grid
    const gridSize = 50; // Grid cell size
    const gridX = Math.round(x / gridSize) * gridSize;
    const gridY = Math.round(y / gridSize) * gridSize;
    
    let initialX = gridX;
    let initialY = gridY;
    
    // Check if the initial position is already good
    const initialOverlap = existingNodes.some(node => {
      const nodePos = node.position;
      return (
        Math.abs(initialX - nodePos.x) < nodeWidth + horizontalSpacing &&
        Math.abs(initialY - nodePos.y) < nodeHeight + verticalSpacing
      );
    });
    
    if (!initialOverlap) {
      return { x: initialX, y: initialY };
    }
    
    // If initial position doesn't work, use a spiral pattern to find a position
    let newX = initialX;
    let newY = initialY;
    let overlapping = true;
    let layer = 1;
    let segment = 0;
    let segmentStep = 0;
    const maxLayers = 10; // Maximum spiral layers
    
    // Directions: right, down, left, up
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    
    while (overlapping && layer <= maxLayers) {
      // Move in the current direction
      newX += directions[segment][0] * gridSize;
      newY += directions[segment][1] * gridSize;
      
      segmentStep++;
      
      // Check if we need to change direction
      if (segmentStep === layer) {
        segment = (segment + 1) % 4;
        segmentStep = 0;
        
        // Increase the layer size after completing a full circle
        if (segment === 0 || segment === 2) {
          layer++;
        }
      }
      
      // Check for overlap with existing nodes
      overlapping = existingNodes.some(node => {
        const nodePos = node.position;
        return (
          Math.abs(newX - nodePos.x) < nodeWidth + horizontalSpacing &&
          Math.abs(newY - nodePos.y) < nodeHeight + verticalSpacing
        );
      });
      
      // If we found a non-overlapping position, break
      if (!overlapping) {
        break;
      }
    }
    
    // If spiral search failed, try one more approach with random offset
    if (overlapping) {
      for (let i = 0; i < 10; i++) {
        // Use a slightly randomized position but still based on a grid
        const randomOffsetX = Math.floor(Math.random() * 5) * gridSize;
        const randomOffsetY = Math.floor(Math.random() * 5) * gridSize;
        
        newX = initialX + randomOffsetX;
        newY = initialY + randomOffsetY;
        
        // Ensure we're not placing too far from the visible area
        newX = Math.max(0, Math.min(newX, 1600));
        newY = Math.max(0, Math.min(newY, 800));
        
        // Check for overlap with existing nodes
        overlapping = existingNodes.some(node => {
          const nodePos = node.position;
          return (
            Math.abs(newX - nodePos.x) < nodeWidth + horizontalSpacing &&
            Math.abs(newY - nodePos.y) < nodeHeight + verticalSpacing
          );
        });
        
        if (!overlapping) {
          break;
        }
      }
    }
    
    // If all attempts fail, default to a position that at least ensures visibility
    if (overlapping) {
      newX = Math.max(20, Math.min(initialX, 1600));
      newY = Math.max(20, Math.min(initialY + 200, 800));
    }
    
    return { x: newX, y: newY };
  };
  
  // Handle drop for React Flow
  const handleDrop = (event) => {
    event.preventDefault();
    
    if (!reactFlowWrapper.current) return;
    
    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const type = event.dataTransfer.getData('application/reactflow');
    
    if (!type) return;

    // Initial position based on drop location
    const initialPosition = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    };
    
    // Find a position that doesn't overlap with existing nodes
    const position = findNonOverlappingPosition(
      initialPosition.x, 
      initialPosition.y, 
      nodes
    );
    
    let id, newNode;
    
    // Special handling for custom source and target nodes
    if (type === 'custom-source') {
      id = `source-${Date.now()}`;
      newNode = {
        id,
        type: 'source', // Use the existing source node type
        position,
        data: { 
          label: 'Source Data',
          type: 'custom', 
          sourceId: id
        },
        draggable: true,
        parentNode: null, // Explicitly set to null to ensure it's a top-level node
        extent: undefined, // Remove any extent constraints
        expandParent: false, // Don't expand any parent
        style: { width: 180, height: 100, zIndex: nodes.length + 1 } // Add z-index for proper layering
      };
    } else if (type === 'custom-target') {
      id = `target-${Date.now()}`;
      newNode = {
        id,
        type: 'target', // Use the existing target node type
        position,
        data: { 
          label: 'Target Output',
          type: 'custom',
          mappingId: `mapping-${Date.now()}`
        },
        draggable: true,
        parentNode: null, // Explicitly set to null to ensure it's a top-level node
        extent: undefined, // Remove any extent constraints
        expandParent: false, // Don't expand any parent
        style: { width: 180, height: 100, zIndex: nodes.length + 1 } // Add z-index for proper layering
      };
    } else {
      // Regular transformation nodes
      id = `${type}-${Date.now()}`;
      newNode = {
        id,
        type,
        position,
        data: { label: type.charAt(0).toUpperCase() + type.slice(1) },
        draggable: true,
        parentNode: null, // Explicitly set to null to ensure it's a top-level node
        extent: undefined, // Remove any extent constraints
        expandParent: false, // Don't expand any parent
        style: { width: 180, height: 100, zIndex: nodes.length + 1 } // Add z-index for proper layering
      };
      
      // Automatically open configuration for transformation nodes only
      setTimeout(() => {
        openNodeConfig(id, type, {});
      }, 100);
    }
    
    // Add the node as a completely new independent node in the flow
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
  };
  
  // Handle connections between nodes
  const onConnect = useCallback((params) => {
    // Get source and target nodes
    const sourceNode = nodes.find(node => node.id === params.source);
    const targetNode = nodes.find(node => node.id === params.target);
    
    if (!sourceNode || !targetNode) return;
    
    // Validation rules:
    // 1. Source nodes can only have one output connection
    // 2. Target nodes can only have one input connection
    // 3. Transformation nodes can have only one input and one output (except Join)
    
    // Check existing connections
    const existingEdges = edges;
    
    // Check if source node already has an outgoing connection
    if (sourceNode.type === 'source') {
      const sourceHasConnection = existingEdges.some(edge => edge.source === params.source);
      if (sourceHasConnection) {
        setError('Source nodes can only have one outgoing connection.');
        return;
      }
    }
    
    // Check if target node already has an incoming connection
    if (targetNode.type === 'target') {
      const targetHasConnection = existingEdges.some(edge => edge.target === params.target);
      if (targetHasConnection) {
        setError('Target nodes can only have one incoming connection.');
        return;
      }
    }
    
    // Check transformation nodes (except Join)
    if (sourceNode.type !== 'source' && sourceNode.type !== 'join' && sourceNode.type !== 'target') {
      const sourceHasOutput = existingEdges.some(edge => edge.source === params.source);
      if (sourceHasOutput) {
        setError(`${sourceNode.type.charAt(0).toUpperCase() + sourceNode.type.slice(1)} nodes can only have one output connection.`);
        return;
      }
    }
    
    if (targetNode.type !== 'source' && targetNode.type !== 'target') {
      const targetHasInput = existingEdges.some(edge => edge.target === params.target);
      if (targetHasInput && targetNode.type !== 'join') {
        setError(`${targetNode.type.charAt(0).toUpperCase() + targetNode.type.slice(1)} nodes can only have one input connection.`);
        return;
      }
    }
    
    // Create a styled edge with arrow marker
    const newEdge = {
      ...params,
      animated: true,
      style: { stroke: '#3b82f6' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: '#3b82f6',
      },
    };
    
    setEdges((eds) => addEdge(newEdge, eds));
    // Clear any error after successful connection
    setError(null);
  }, [nodes, edges, setEdges]);
  
  // Auto-arrange nodes in a logical layout using topological sort
  const autoArrangeNodes = () => {
    if (nodes.length === 0) return;
    
    // Define spacing constants
    const nodeWidth = 180;
    const nodeHeight = 100;
    const horizontalSpacing = 250;
    const verticalSpacing = 120;
    
    // Build a dependency graph of nodes
    const nodeMap = new Map();
    nodes.forEach((node) => {
      nodeMap.set(node.id, { 
        ...node, 
        inEdges: [], 
        outEdges: [],
        // Store node type for better arrangement
        nodeType: node.type
      });
    });
    
    // Build graph relationships based on edges
    edges.forEach(({ source, target }) => {
      nodeMap.get(source).outEdges.push(target);
      nodeMap.get(target).inEdges.push(source);
    });
    
    // Calculate levels (depth) for each node using DFS
    const levels = new Map(); // nodeId -> level
    const visited = new Set();
    
    function dfs(nodeId, depth = 0) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // Set this node's level to the maximum of current and calculated depth
      levels.set(nodeId, Math.max(levels.get(nodeId) || 0, depth));
      
      // Traverse outgoing edges
      for (const targetId of nodeMap.get(nodeId).outEdges) {
        dfs(targetId, depth + 1);
      }
    }
    
    // Start DFS from source nodes (nodes with no incoming edges or source type)
    // This ensures proper left-to-right flow
    nodes.forEach((node) => {
      const nodeData = nodeMap.get(node.id);
      if (nodeData.inEdges.length === 0 || node.type === 'source') {
        // If it's a source node or has no incoming edges, start DFS from here
        dfs(node.id);
      }
    });
    
    // If there are nodes not visited (isolated), default to level 0
    nodes.forEach(node => {
      if (!levels.has(node.id)) {
        // Favor specific node types for positioning:
        // - Source nodes: far left (level 0)
        // - Target nodes: far right (max level + 1)
        // - Other nodes: intermediate (level 1)
        if (node.type === 'source') {
          levels.set(node.id, 0);
        } else if (node.type === 'target') {
          // Find max level and place target nodes one level further
          const maxLevel = Math.max(...Array.from(levels.values(), 0)) + 1;
          levels.set(node.id, maxLevel);
        } else {
          levels.set(node.id, 1); // Default intermediate level
        }
      }
    });
    
    // Calculate vertical positions within each level
    const levelGroups = new Map(); // level -> array of node IDs
    
    // Group nodes by level
    for (const [nodeId, level] of levels.entries()) {
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level).push(nodeId);
    }
    
    // Calculate positions based on levels and vertical index
    const newPositions = {};
    
    // Process each level
    for (const [level, nodeIds] of levelGroups.entries()) {
      // Sort nodes within level by type (source first, target last)
      nodeIds.sort((a, b) => {
        const nodeA = nodeMap.get(a);
        const nodeB = nodeMap.get(b);
        
        // Source nodes should be first
        if (nodeA.nodeType === 'source') return -1;
        if (nodeB.nodeType === 'source') return 1;
        
        // Target nodes should be last
        if (nodeA.nodeType === 'target') return 1;
        if (nodeB.nodeType === 'target') return -1;
        
        return 0;
      });
      
      // Calculate vertical positions for nodes at this level
      const levelNodeCount = nodeIds.length;
      const totalHeight = (levelNodeCount - 1) * verticalSpacing;
      const startY = Math.max(30, (800 - totalHeight) / 2); // Center vertically in canvas
      
      // Position each node within its level
      nodeIds.forEach((nodeId, index) => {
        const xPos = 50 + (level * horizontalSpacing);
        const yPos = startY + (index * verticalSpacing);
        
        newPositions[nodeId] = { x: xPos, y: yPos };
      });
    }
    
    // Apply new positions to nodes
    const updatedNodes = nodes.map(node => ({
      ...node,
      position: newPositions[node.id] || node.position
    }));
    
    setNodes(updatedNodes);
  };
  
  // Get node background color based on transformation type
  const getNodeColorByType = (type) => {
    switch(type) {
      case 'filter': return '#fee2e2';
      case 'join': return '#dcfce7';
      case 'aggregate': return '#fef3c7';
      case 'lookup': return '#ede9fe';
      case 'format': return '#e0f2fe';
      case 'calculate': return '#fae8ff';
      default: return '#f3f4f6';
    }
  };
  
  // Render configuration form based on node type
  const renderConfigForm = () => {
    if (!selectedNode) return null;
    
    switch (selectedNode.type) {
      case 'filter':
        return (
          <div className="node-config-form">
            <h3>Filter Configuration</h3>
            <div className="form-group">
              <label htmlFor={`node-column-${selectedNode.id}`}>Column</label>
              <select 
                id={`node-column-${selectedNode.id}`}
                value={nodeConfig.column || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, column: e.target.value})}
                className="form-control"
              >
                <option value="">Select Column</option>
                {sourceColumns.map(col => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-operator-${selectedNode.id}`}>Operator</label>
              <select 
                id={`node-operator-${selectedNode.id}`}
                value={nodeConfig.operator || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, operator: e.target.value})}
                className="form-control"
              >
                <option value="">Select Operator</option>
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value=">">{`>`}</option>
                <option value="<">{`<`}</option>
                <option value=">=">{`>=`}</option>
                <option value="<=">{`<=`}</option>
                <option value="LIKE">LIKE</option>
                <option value="IN">IN</option>
                <option value="NOT IN">NOT IN</option>
                <option value="IS NULL">IS NULL</option>
                <option value="IS NOT NULL">IS NOT NULL</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-value-${selectedNode.id}`}>Value</label>
              <input 
                id={`node-value-${selectedNode.id}`}
                type="text" 
                value={nodeConfig.value || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, value: e.target.value})}
                className="form-control"
                placeholder="Enter value"
              />
            </div>
            {/* Update the condition display */}
            {nodeConfig.column && nodeConfig.operator && (
              <div className="form-group">
                <div className="form-label">Generated Condition</div>
                <div className="condition-display">
                  {`${nodeConfig.column} ${nodeConfig.operator} ${nodeConfig.value || ''}`}
                </div>
                <button 
                  className="btn btn-outline-primary"
                  onClick={() => setNodeConfig({
                    ...nodeConfig,
                    condition: `${nodeConfig.column} ${nodeConfig.operator} ${nodeConfig.value || ''}`
                  })}
                >
                  Update Condition
                </button>
              </div>
            )}
          </div>
        );
      case 'join':
        return (
          <div className="node-config-form">
            <h3>Join Configuration</h3>
            <div className="form-group">
              <label htmlFor={`node-joinType-${selectedNode.id}`}>Join Type</label>
              <select 
                id={`node-joinType-${selectedNode.id}`}
                value={nodeConfig.joinType || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, joinType: e.target.value})}
                className="form-control"
              >
                <option value="">Select Join Type</option>
                <option value="INNER">INNER</option>
                <option value="LEFT">LEFT</option>
                <option value="RIGHT">RIGHT</option>
                <option value="FULL">FULL</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-rightTable-${selectedNode.id}`}>Right Table</label>
              <select 
                id={`node-rightTable-${selectedNode.id}`}
                value={nodeConfig.rightTable || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, rightTable: e.target.value})}
                className="form-control"
              >
                <option value="">Select Table</option>
                {files.map(file => (
                  <option key={file.file_id} value={file.filename}>{file.filename}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-leftColumn-${selectedNode.id}`}>Left Column</label>
              <select 
                id={`node-leftColumn-${selectedNode.id}`}
                value={nodeConfig.leftColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, leftColumn: e.target.value})}
                className="form-control"
              >
                <option value="">Select Left Column</option>
                {sourceColumns.map(col => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-rightColumn-${selectedNode.id}`}>Right Column</label>
              <input 
                id={`node-rightColumn-${selectedNode.id}`}
                type="text" 
                value={nodeConfig.rightColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, rightColumn: e.target.value})}
                className="form-control"
                placeholder="Enter right table column"
              />
            </div>
          </div>
        );
      case 'aggregate':
        return (
          <div className="node-config-form">
            <h3>Aggregate Configuration</h3>
            <div className="form-group">
              <label htmlFor={`node-function-${selectedNode.id}`}>Aggregation Function</label>
              <select 
                id={`node-function-${selectedNode.id}`}
                value={nodeConfig.function || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, function: e.target.value})}
                className="form-control"
              >
                <option value="">Select Function</option>
                <option value="SUM">SUM</option>
                <option value="AVG">AVG</option>
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
                <option value="COUNT">COUNT</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-agg-column-${selectedNode.id}`}>Column</label>
              <select 
                id={`node-agg-column-${selectedNode.id}`}
                value={nodeConfig.column || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, column: e.target.value})}
                className="form-control"
              >
                <option value="">Select Column</option>
                {sourceColumns.map(col => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-groupBy-${selectedNode.id}`}>Group By Column</label>
              <select 
                id={`node-groupBy-${selectedNode.id}`}
                value={nodeConfig.groupBy || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, groupBy: e.target.value})}
                className="form-control"
              >
                <option value="">Select Group By Column</option>
                {sourceColumns.map(col => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            {/* Update the aggregation display */}
            {nodeConfig.function && nodeConfig.column && (
              <div className="form-group">
                  <div className="form-label">Generated Aggregation</div>
                  <div className="condition-display">
                    {`${nodeConfig.function}(${nodeConfig.column})${nodeConfig.groupBy ? ` GROUP BY ${nodeConfig.groupBy}` : ''}`}
                  </div>
                <button 
                  className="btn btn-outline-primary"
                  onClick={() => setNodeConfig({
                    ...nodeConfig,
                    aggregation: `${nodeConfig.function}(${nodeConfig.column})${nodeConfig.groupBy ? ` GROUP BY ${nodeConfig.groupBy}` : ''}`
                  })}
                >
                  Update Aggregation
                </button>
              </div>
            )}
          </div>
        );
      case 'lookup':
        return (
          <div className="node-config-form">
            <h3>Lookup Configuration</h3>
            <div className="form-group">
              <label htmlFor={`node-lookupTable-${selectedNode.id}`}>Lookup Table</label>
              <select 
                id={`node-lookupTable-${selectedNode.id}`}
                value={nodeConfig.lookupTable || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, lookupTable: e.target.value})}
                className="form-control"
              >
                <option value="">Select Lookup Table</option>
                {files.map(file => (
                  <option key={file.file_id} value={file.filename}>{file.filename}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-keyColumn-${selectedNode.id}`}>Key Column (Source)</label>
              <select 
                id={`node-keyColumn-${selectedNode.id}`}
                value={nodeConfig.keyColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, keyColumn: e.target.value})}
                className="form-control"
              >
                <option value="">Select Source Column</option>
                {sourceColumns.map(col => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-lookupColumn-${selectedNode.id}`}>Lookup Column</label>
              <input 
                id={`node-lookupColumn-${selectedNode.id}`}
                type="text" 
                value={nodeConfig.lookupColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, lookupColumn: e.target.value})}
                className="form-control"
                placeholder="Enter lookup column name"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`node-returnColumn-${selectedNode.id}`}>Return Column</label>
              <input 
                id={`node-returnColumn-${selectedNode.id}`}
                type="text" 
                value={nodeConfig.returnColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, returnColumn: e.target.value})}
                className="form-control"
                placeholder="Enter return column name"
              />
            </div>
          </div>
        );
      case 'format':
        return (
          <div className="node-config-form">
            <h3>Format Configuration</h3>
            <div className="form-group">
              <label htmlFor={`node-formatType-${selectedNode.id}`}>Format Type</label>
              <select 
                id={`node-formatType-${selectedNode.id}`}
                value={nodeConfig.formatType || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, formatType: e.target.value})}
                className="form-control"
              >
                <option value="">Select Format Type</option>
                <option value="DATE">Date Format</option>
                <option value="NUMBER">Number Format</option>
                <option value="TEXT">Text Transformation</option>
                <option value="CASE">Case Transformation</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor={`node-format-column-${selectedNode.id}`}>Column</label>
              <select 
                id={`node-format-column-${selectedNode.id}`}
                value={nodeConfig.column || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, column: e.target.value})}
                className="form-control"
              >
                <option value="">Select Column</option>
                {sourceColumns.map(col => (
                  <option key={col.id} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            {nodeConfig.formatType === 'DATE' && (
              <div className="form-group">
                <label htmlFor={`node-dateFormat-${selectedNode.id}`}>Date Format</label>
                <select 
                  id={`node-dateFormat-${selectedNode.id}`}
                  value={nodeConfig.dateFormat || ''}
                  onChange={(e) => setNodeConfig({...nodeConfig, dateFormat: e.target.value})}
                  className="form-control"
                >
                  <option value="">Select Format</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                  <option value="YYYY-MM-DD HH:MM:SS">YYYY-MM-DD HH:MM:SS</option>
                </select>
              </div>
            )}
            {nodeConfig.formatType === 'NUMBER' && (
              <div className="form-group">
                <label htmlFor={`node-decimalPlaces-${selectedNode.id}`}>Decimal Places</label>
                <input 
                  id={`node-decimalPlaces-${selectedNode.id}`}
                  type="number" 
                  min="0"
                  max="10"
                  value={nodeConfig.decimalPlaces || 2}
                  onChange={(e) => setNodeConfig({...nodeConfig, decimalPlaces: e.target.value})}
                  className="form-control"
                />
              </div>
            )}
            {nodeConfig.formatType === 'TEXT' && (
              <div className="form-group">
                <label htmlFor={`node-textOperation-${selectedNode.id}`}>Text Operation</label>
                <select 
                  id={`node-textOperation-${selectedNode.id}`}
                  value={nodeConfig.textOperation || ''}
                  onChange={(e) => setNodeConfig({...nodeConfig, textOperation: e.target.value})}
                  className="form-control"
                >
                  <option value="">Select Operation</option>
                  <option value="TRIM">Trim</option>
                  <option value="SUBSTRING">Substring</option>
                  <option value="REPLACE">Replace</option>
                  <option value="CONCAT">Concatenate</option>
                </select>
              </div>
            )}
            {nodeConfig.formatType === 'CASE' && (
              <div className="form-group">
                <label htmlFor={`node-caseOperation-${selectedNode.id}`}>Case Operation</label>
                <select 
                  id={`node-caseOperation-${selectedNode.id}`}
                  value={nodeConfig.caseOperation || ''}
                  onChange={(e) => setNodeConfig({...nodeConfig, caseOperation: e.target.value})}
                  className="form-control"
                >
                  <option value="">Select Operation</option>
                  <option value="UPPER">UPPERCASE</option>
                  <option value="LOWER">lowercase</option>
                  <option value="TITLE">Title Case</option>
                </select>
              </div>
            )}
          </div>
        );
      case 'calculate':
        return (
          <div className="node-config-form">
            <h3>Calculate Configuration</h3>
            <div className="form-group">
              <label htmlFor={`node-outputColumn-${selectedNode.id}`}>Output Column</label>
              <input 
                id={`node-outputColumn-${selectedNode.id}`}
                type="text" 
                value={nodeConfig.outputColumn || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, outputColumn: e.target.value})}
                className="form-control"
                placeholder="Enter output column name"
              />
            </div>
            <div className="form-group">
              <label htmlFor={`node-formula-${selectedNode.id}`}>Formula</label>
              <textarea 
                id={`node-formula-${selectedNode.id}`}
                value={nodeConfig.formula || ''}
                onChange={(e) => setNodeConfig({...nodeConfig, formula: e.target.value})}
                className="form-control"
                placeholder="Enter calculation formula"
                rows="4"
              />
            </div>
            <div className="form-group">
              <div className="form-label">Available Columns</div>
              <div className="available-columns">
                {sourceColumns.map(col => (
                  <div key={col.id} className="available-column-chip">
                    {col.name}
                    <button 
                      type="button" 
                      className="chip-add-btn"
                      onClick={() => setNodeConfig({
                        ...nodeConfig,
                        formula: (nodeConfig.formula || '') + ` ${col.name}`
                      })}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <div className="form-label">Operators</div>
              <div className="operator-buttons">
                {['+', '-', '*', '/', '(', ')', '>', '<', '=', 'AND', 'OR', 'NOT'].map(op => (
                  <button 
                    type="button" 
                    key={op}
                    className="operator-btn"
                    onClick={() => setNodeConfig({
                      ...nodeConfig,
                      formula: (nodeConfig.formula || '') + ` ${op}`
                    })}
                  >
                    {op}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };
  
  // Step 7: Target Column Settings
  const updateTargetColumnSetting = (columnId, field, value) => {
    setTargetColumnSettings(prevSettings => 
      prevSettings.map(setting => 
        setting.id === columnId 
          ? { ...setting, [field]: value }
          : setting
      )
    );
  };
  
  // Initialize target column settings
  useEffect(() => {
    if (columnMappings.length > 0 && targetColumnSettings.length === 0) {
      setTargetColumnSettings(columnMappings.map(mapping => ({
        id: mapping.id,
        originalName: mapping.sourceColumn.name,
        name: mapping.targetColumn.name,
        type: mapping.targetColumn.type,
        nullable: true,
        defaultValue: '',
        description: ''
      })));
    }
  }, [columnMappings, targetColumnSettings]);

  // Step 8: Create Schedule
  const createSchedule = async () => {
    const jobId = sessionStorage.getItem('currentJobId');
    
    if (!jobId) {
      setError('Job ID not found. Please create a job first.');
      return;
    }
    
    try {
      setLoading(true);
      
      let scheduleData = {
        job_id: parseInt(jobId),
        enabled: scheduleEnabled,
        type: scheduleType
      };
      
      if (scheduleType === 'one-time') {
        const scheduleDateTimeStr = `${scheduleDate}T${scheduleTime}`;
        scheduleData.one_time_date = new Date(scheduleDateTimeStr).toISOString();
      } else {
        scheduleData.cron_expression = scheduleCron;
      }
      
      const response = await axios.post(`${API_BASE_URL}/api/schedules`, scheduleData);
      
      setSuccess('Job scheduled successfully');
      setLoading(false);
      
      // Navigate to jobs list
      navigate('/jobs');
    } catch (err) {
      console.error('Error creating schedule:', err);
      setError('Failed to create schedule. Please try again.');
      setLoading(false);
    }
  };
  
  // Render functions for each step
  const renderGroupStep = () => (
    <div className="step-container">
      <h3>Step 1: Select or Create Group</h3>
      
      {groups.length > 0 && (
        <div className="existing-items">
          <h4>Select Existing Group</h4>
          <div className="items-grid">
            {groups.map(group => (
              <div 
                key={group.id} 
                className={`item-card ${selectedGroup?.id === group.id ? 'selected' : ''}`}
                onClick={() => setSelectedGroup(group)}
              >
                <h4>{group.name}</h4>
                <p>{group.description || 'No description'}</p>
                <div className="item-meta">
                  <span>{group.processes_count || 0} processes</span>
                  <span>{group.jobs_count || 0} jobs</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
        <div className="create-new-item">
        <h4>Create New Group</h4>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="group-name">Group Name</label>
            <input
              id="group-name"
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="form-control"
              placeholder="Enter group name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="group-desc">Description</label>
            <input
              id="group-desc"
              type="text"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              className="form-control"
              placeholder="Group description"
            />
          </div>
        </div>
      </div>
    </div>
  );
  
  const renderBusinessProcessStep = () => (
    <div className="step-container">
      <h3>Step 2: Select or Create Business Process</h3>
      
      {/* Show business processes if a group is selected */}
      {selectedGroup && businessProcesses.length > 0 && (
        <div className="existing-items">
          <h4>Select Existing Business Process</h4>
          <div className="items-grid">
            {businessProcesses
              .filter(process => process.group_id === selectedGroup.id)
              .map(process => (
                <div 
                  key={process.id} 
                  className={`item-card ${selectedBusinessProcess?.id === process.id ? 'selected' : ''}`}
                  onClick={() => setSelectedBusinessProcess(process)}
                >
                  <h4>{process.name}</h4>
                  <p>{process.description || 'No description'}</p>
                  <div className="item-meta">
                    <span>{process.jobs_count || 0} jobs</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
      
      <div className="create-new-item">
        <h4>Create New Business Process</h4>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="process-name">Process Name</label>
            <input
              id="process-name"
              type="text"
              value={newProcessName}
              onChange={(e) => setNewProcessName(e.target.value)}
              className="form-control"
              placeholder="Enter process name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="process-desc">Description</label>
            <input
              id="process-desc"
              type="text"
              value={newProcessDesc}
              onChange={(e) => setNewProcessDesc(e.target.value)}
              className="form-control"
              placeholder="Process description"
            />
          </div>
        </div>
      </div>
      
      <div className="form-summary">
        <h4>Selected Group</h4>
        <div className="summary-item">
          <span>Group:</span>
          <strong>{selectedGroup ? selectedGroup.name : 'None selected'}</strong>
        </div>
        
        {selectedBusinessProcess && (
          <>
            <h4>Selected Business Process</h4>
            <div className="summary-item">
              <span>Process:</span>
              <strong>{selectedBusinessProcess.name}</strong>
            </div>
            <div className="form-actions">
              <button 
                className="btn btn-primary"
                onClick={() => setCurrentStep(currentStep + 1)}
              >
                Continue with Selected Process
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
  
  const renderJobStep = () => (
    <div className="step-container">
      <h3>Step 3: Select or Create Job</h3>
      
      {existingJobs.length > 0 && (
        <div className="existing-items">
          <h4>Select Existing Job</h4>
          <div className="form-group">
            <div className="job-selection-toggle">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={!isNewJob}
                  onChange={() => {
                    setIsNewJob(false);
                    if (selectedJob) {
                      setJobName(selectedJob.name);
                      setJobDesc(selectedJob.description || '');
                      setJobStatus(selectedJob.status || 'active');
                    }
                  }}
                />
                <span className="checkbox-text">Use Existing Job</span>
              </label>
            </div>
          </div>
          
          {!isNewJob && (
            <div className="items-grid">
              {existingJobs.map(job => (
                <div 
                  key={job.id} 
                  className={`item-card ${selectedJob?.id === job.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedJob(job);
                    setJobName(job.name);
                    setJobDesc(job.description || '');
                    setJobStatus(job.status || 'active');
                  }}
                >
                  <h4>{job.name}</h4>
                  <p>{job.description || 'No description'}</p>
                  <div className="item-meta">
                    <span>Status: {job.status || 'active'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="create-new-item">
        <div className="form-group">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={isNewJob}
              onChange={() => {
                setIsNewJob(true);
                setSelectedJob(null);
              }}
            />
            <span className="checkbox-text">Create New Job</span>
          </label>
        </div>
        
        {isNewJob && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="job-name">Job Name</label>
                <input
                  id="job-name"
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="form-control"
                  placeholder="Enter job name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="job-desc">Description</label>
                <input
                  id="job-desc"
                  type="text"
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  className="form-control"
                  placeholder="Job description"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="job-status">Status</label>
                <select 
                  id="job-status"
                  value={jobStatus} 
                  onChange={(e) => setJobStatus(e.target.value)}
                  className="form-control"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>
      
      <div className="form-summary">
        <h4>Job Details</h4>
        <div className="summary-item">
          <span>Group:</span>
          <strong>{selectedGroup ? selectedGroup.name : 'None'}</strong>
        </div>
        <div className="summary-item">
          <span>Business Process:</span>
          <strong>{selectedBusinessProcess ? selectedBusinessProcess.name : 'None'}</strong>
        </div>
        {selectedJob && !isNewJob && (
          <div className="summary-item">
            <span>Selected Job:</span>
            <strong>{selectedJob.name}</strong>
          </div>
        )}
        <div className="form-actions">
          <button 
            className="btn btn-primary"
            onClick={createJob}
            disabled={
              isNewJob ? (!jobName.trim() || !selectedBusinessProcess) : !selectedJob
            }
          >
            {loading ? 'Processing...' : isNewJob ? 'Create Job and Continue' : 'Use Selected Job'}
          </button>
        </div>
      </div>
    </div>
  );
  
  const renderConnectionsStep = () => (
    <div className="step-container">
      <h3>Step 4: Select Source and Target Connections</h3>
      
      <div className="form-section">
        <h4>Source</h4>
          <div className="form-group">
          <label htmlFor="source-connection-select">1. Select Source Connection</label>
          <select 
            id="source-connection-select"
            onChange={handleSourceConnectionChange}
            className="form-control"
            value={sourceConnection === "internal" ? "internal" : (sourceConnection ? sourceConnection.id : '')}
          >
            <option value="">-- Select Source Connection --</option>
            <option value="internal">Internal Database</option>
            {connections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.type})
              </option>
            ))}
          </select>
          {!sourceConnection && (
            <div className="form-hint">
              <small>Select a connection first or use the default Internal Database</small>
            </div>
          )}
        </div>
        
        {(sourceConnection) && (
          <div className="form-group">
            <label htmlFor="source-file-select">2. Select Source File</label>
            <select 
              id="source-file-select"
              onChange={(e) => handleSourceFileChange(e.target.value)}
              className="form-control"
              value={selectedSourceFile ? selectedSourceFile.file_id : ''}
            >
              <option value="">-- Select Source File --</option>
              {files.map(file => (
                <option key={file.file_id} value={file.file_id}>
                  {file.filename} ({file.file_type})
                </option>
              ))}
            </select>
          </div>
        )}
        
        {selectedSourceFile && (
          <div className="file-preview">
            <h4>Source File Preview</h4>
            <div className="file-meta">
              <div className="meta-item">
                <span>Filename:</span>
                <strong>{selectedSourceFile.filename}</strong>
              </div>
              <div className="meta-item">
                <span>Type:</span>
                <strong>{selectedSourceFile.file_type}</strong>
              </div>
              <div className="meta-item">
                <span>Size:</span>
                <strong>{selectedSourceFile.file_size} bytes</strong>
              </div>
              <div className="meta-item">
                <span>Rows:</span>
                <strong>{selectedSourceFile.row_count}</strong>
              </div>
              <div className="meta-item">
                <span>Columns:</span>
                <strong>{selectedSourceFile.column_count}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="form-section">
        <h4>Target</h4>
        <div className="form-group">
          <label htmlFor="target-connection-select">1. Select Target Connection</label>
          <select 
            id="target-connection-select"
            onChange={handleTargetConnectionChange}
            className="form-control"
            value={targetConnection === "internal" ? "internal" : (targetConnection ? targetConnection.id : '')}
          >
            <option value="">-- Select Target Connection --</option>
            <option value="internal">Internal Database</option>
            {connections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.type})
              </option>
            ))}
          </select>
          {!targetConnection && (
            <div className="form-hint">
              <small>Select a connection first or use the default Internal Database</small>
            </div>
          )}
        </div>
        
        {targetConnection && (
          <>
            <div className="target-file-options">
                <div className="form-group">
                  <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={isNewTargetFile}
                    onChange={() => {
                      if (!isNewTargetFile) {
                        setIsNewTargetFile(true);
                        setSelectedTargetFile(null);
                      }
                    }}
                  />
                  <span className="checkbox-text">Create New File</span>
                </label>
              </div>
              
              <div className="form-group">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={!isNewTargetFile}
                    onChange={() => {
                      if (isNewTargetFile) {
                        setIsNewTargetFile(false);
                        setTargetFileName('');
                      }
                    }}
                  />
                  <span className="checkbox-text">Overwrite Existing File</span>
                </label>
              </div>
            </div>
            
              {isNewTargetFile ? (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="target-file-name">2. New Target File Name</label>
                  <input
                    id="target-file-name"
                    type="text"
                    value={targetFileName}
                    onChange={handleTargetFileNameChange}
                    className="form-control"
                    placeholder="Enter file name (e.g., output.csv)"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="target-file-format">Output File Format</label>
                  <select 
                    id="target-file-format"
                    value={selectedTargetType} 
                    onChange={(e) => handleTargetFileTypeChange(e.target.value)}
                    className="form-control"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                    <option value="parquet">Parquet</option>
                    <option value="avro">Avro</option>
                    <option value="orc">ORC</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="existing-target-file-select">2. Select Existing Target File to Overwrite</label>
                <select 
                  id="existing-target-file-select"
                  onChange={(e) => handleExistingTargetFileChange(e.target.value)}
                  className="form-control"
                  value={selectedTargetFile ? selectedTargetFile.file_id : ''}
                >
                  <option value="">-- Select Target File --</option>
                  {files.map(file => (
                    <option key={file.file_id} value={file.file_id}>
                      {file.filename} ({file.file_type})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
        
        {selectedTargetFile && !isNewTargetFile && (
          <div className="file-preview">
            <h4>Target File Preview</h4>
            <div className="file-meta">
              <div className="meta-item">
                <span>Filename:</span>
                <strong>{selectedTargetFile.filename}</strong>
              </div>
              <div className="meta-item">
                <span>Type:</span>
                <strong>{selectedTargetFile.file_type}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  
  const renderColumnMappingStep = () => (
    <div className="step-container">
      <h3>Step 5: Map Source to Target Columns</h3>
      
      <div className="mapping-columns-container">
        <div className="mapping-source-columns">
          <h4>Source Columns</h4>
          {sourceColumns.length === 0 ? (
            <div className="empty-state">
              <p>No source columns available. Please select a source file first.</p>
            </div>
          ) : (
            <div className="column-list">
              {sourceColumns.map(column => (
                <div key={column.id} className="source-column">
                  <div className="source-column-name">{column.name}</div>
                  <div className="source-column-type">{column.type}</div>
                  <button 
                    className="source-column-add" 
                    onClick={() => addColumnMapping(column)}
                    type="button"
                  >
                    <FiPlus />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mapping-arrow">
          <FiArrowRight />
        </div>
        
        <div className="mapping-target-columns">
          <h4>Mapped Columns</h4>
          {columnMappings.length === 0 ? (
            <div className="empty-state">
              <p>No columns mapped yet. Add columns from the source.</p>
            </div>
          ) : (
            <div className="mapping-list">
              {columnMappings.map(mapping => (
                <div key={mapping.id} className="mapping-item">
                  <div className="mapping-details">
                    <div className="mapping-source">
                      <span>{mapping.sourceColumn.name}</span>
                      <small>{mapping.sourceColumn.type}</small>
                    </div>
                    <div className="mapping-arrow">→</div>
                    <div className="mapping-target">
                      <span>{mapping.targetColumn.name}</span>
                      <small>{mapping.targetColumn.type}</small>
                    </div>
                  </div>
                  <div className="mapping-actions">
                    <button 
                      className="mapping-remove" 
                      onClick={() => removeColumnMapping(mapping.id)}
                    >
                      <FiTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  
  const renderTransformationsStep = () => (
    <div className="step-container">
      <h3>Step 6: Apply Transformations</h3>
      
      <div className="transform-instructions">
        <p>
          <strong>Drag and drop</strong> transformation tools into the workflow area to build your data pipeline.
          Connect source columns to transformations and then to target columns by clicking and dragging between nodes.
        </p>
      </div>
      
      <div className="transformation-tool-sections">
        <div className="tool-section">
          <h4>Input/Output</h4>
          <div className="transformation-flow-tools io-tools">
            <div 
              className="transform-tool source-tool" 
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'custom-source');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiDatabase />
              </div>
              <div className="transform-tool-name">Source</div>
            </div>
            
            <div 
              className="transform-tool target-tool"
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'custom-target');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiSave />
              </div>
              <div className="transform-tool-name">Target</div>
            </div>
          </div>
        </div>
        
        <div className="tool-section">
          <h4>Transformations</h4>
          <div className="transformation-flow-tools">
            <div 
              className="transform-tool filter" 
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'filter');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiFilter />
              </div>
              <div className="transform-tool-name">Filter</div>
            </div>
            
            <div 
              className="transform-tool join"
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'join');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiGitMerge />
              </div>
              <div className="transform-tool-name">Join</div>
            </div>
            
            <div 
              className="transform-tool aggregate"
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'aggregate');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiBarChart2 />
              </div>
              <div className="transform-tool-name">Aggregate</div>
            </div>
            
            <div 
              className="transform-tool lookup"
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'lookup');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiSearch />
              </div>
              <div className="transform-tool-name">Lookup</div>
            </div>
            
            <div 
              className="transform-tool format"
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'format');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiEdit2 />
              </div>
              <div className="transform-tool-name">Format</div>
            </div>
            
            <div 
              className="transform-tool calculate"
              draggable 
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', 'calculate');
                e.dataTransfer.effectAllowed = 'move';
                // Visual feedback during drag
                e.target.style.opacity = '0.4';
              }}
              onDragEnd={(e) => {
                // Reset opacity after drag
                e.target.style.opacity = '1';
              }}
            >
              <div className="transform-tool-icon">
                <FiCpu />
              </div>
              <div className="transform-tool-name">Calculate</div>
            </div>
          </div>
        </div>
      </div>
      
      <div 
        className="transformation-flow-container" 
        style={{ height: '500px' }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        ref={reactFlowWrapper}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={reactFlowInstance => {
            console.log('ReactFlow initialized');
            // Store the instance in the ref for later use
            if (reactFlowWrapper.current) {
              reactFlowWrapper.current.reactFlowInstance = reactFlowInstance;
            }
          }}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={true}
          nodesConnectable={true}
          snapToGrid={true}
          snapGrid={[15, 15]}
          selectNodesOnDrag={false}
          multiSelectionKeyCode="Shift"
          zoomOnScroll={true}
          zoomOnPinch={true}
          panOnDrag={true}
          minZoom={0.5}
          maxZoom={2}
        >
          <Controls />
          <Background color="#aaa" gap={16} />
          <Panel position="top-right">
            <div className="flow-buttons">
              <button 
                className="btn btn-sm btn-primary" 
                onClick={autoArrangeNodes}
              >
                <FiGrid className="icon-left" /> Auto-Arrange
              </button>
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={() => console.log('Nodes:', nodes, 'Edges:', edges)}
              >
                Debug
              </button>
            </div>
          </Panel>
        </ReactFlow>
      </div>
      
      {/* Configuration Modal */}
      {showConfig && (
        <div className="node-config-modal">
          <div className="node-config-overlay" onClick={closeNodeConfig}></div>
          <div className="node-config-content">
            <div className="node-config-header">
              <h3>
                Configure {selectedNode?.type.charAt(0).toUpperCase() + selectedNode?.type.slice(1)}
              </h3>
              <button className="node-config-close" onClick={closeNodeConfig}>
                <FiX />
              </button>
            </div>
            
            <div className="node-config-body">
              {renderConfigForm()}
            </div>
            
            <div className="node-config-footer">
              <button 
                className="btn btn-secondary" 
                onClick={closeNodeConfig}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={saveNodeConfig}
              >
                <FiSaveIcon /> Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="transformations-info">
        <h4>About Transformations:</h4>
        <ul className="transformations-list">
          <li>
            <strong>Filter</strong> - Filter rows based on conditions (Example: WHERE column is greater than value)
          </li>
          <li>
            <strong>Join</strong> - Join data with another dataset (Example: LEFT JOIN, INNER JOIN)
          </li>
          <li>
            <strong>Aggregate</strong> - Group by and aggregate data (Example: SUM, COUNT, AVG)
          </li>
          <li>
            <strong>Lookup</strong> - Lookup values from another dataset
          </li>
          <li>
            <strong>Format</strong> - Change data formats (Example: Date formatting, string operations)
          </li>
          <li>
            <strong>Calculate</strong> - Perform calculations on columns (Example: mathematical operations)
          </li>
        </ul>
      </div>
    </div>
  );
  
  const renderTargetColumnsStep = () => (
    <div className="step-container">
      <h3>Step 7: Configure Target Columns</h3>
      
      {targetColumnSettings.length === 0 ? (
        <div className="empty-state">
          <p>No target columns available. Please map source columns first.</p>
        </div>
      ) : (
        <div className="target-columns-table">
          <table className="table">
            <thead>
              <tr>
                <th>Source Column</th>
                <th>Target Name</th>
                <th>Data Type</th>
                <th>Nullable</th>
                <th>Default Value</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {targetColumnSettings.map(column => (
                <tr key={column.id}>
                  <td>{column.originalName}</td>
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={column.name}
                      onChange={(e) => updateTargetColumnSetting(column.id, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="form-control"
                      value={column.type}
                      onChange={(e) => updateTargetColumnSetting(column.id, 'type', e.target.value)}
                    >
                      <option value="string">String</option>
                      <option value="integer">Integer</option>
                      <option value="decimal">Decimal</option>
                      <option value="date">Date</option>
                      <option value="timestamp">Timestamp</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={column.nullable}
                      onChange={(e) => updateTargetColumnSetting(column.id, 'nullable', e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={column.defaultValue || ''}
                      onChange={(e) => updateTargetColumnSetting(column.id, 'defaultValue', e.target.value)}
                      placeholder="Default value"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={column.description || ''}
                      onChange={(e) => updateTargetColumnSetting(column.id, 'description', e.target.value)}
                      placeholder="Column description"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  
  // Render step 4 - Mapping/Transformation Selection
  const renderMappingTransformationStep = () => {
    return (
      <div className="mapping-transformation-step">
        <h3>Step 4: Select Mapping or Transformation</h3>
        
        {error && (
          <div className="alert alert-danger">
            <FiAlertTriangle /> {error}
          </div>
        )}
        
        <div className="selection-tabs">
          <button 
            className={`tab-button ${showMappingsTab ? 'active' : ''}`}
            onClick={() => setShowMappingsTab(true)}
          >
            Mappings
          </button>
          <button 
            className={`tab-button ${!showMappingsTab ? 'active' : ''}`}
            onClick={() => setShowMappingsTab(false)}
          >
            Transformations
          </button>
        </div>
        
        {showMappingsTab ? (
          <div className="mappings-list">
            <h3>Available Mappings</h3>
            {loading ? (
              <p>Loading mappings...</p>
            ) : mappings.length === 0 ? (
              <div className="no-items">
                <p>No mappings available. Create a mapping first.</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/mappings')}
                >
                  Create Mapping
                </button>
              </div>
            ) : (
              <ul className="items-list">
                {mappings.map(mapping => (
                  <li 
                    key={mapping.id}
                    className={`item ${selectedMapping?.id === mapping.id ? 'selected' : ''}`}
                    onClick={() => handleMappingSelection(mapping.id)}
                  >
                    <FiLink className="item-icon" />
                    <div className="item-details">
                      <h4>{mapping.name}</h4>
                      <p>{mapping.description || 'No description'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="transformations-list">
            <h3>Available Transformations</h3>
            {loading ? (
              <p>Loading transformations...</p>
            ) : transformations.length === 0 ? (
              <div className="no-items">
                <p>No transformations available. Create a transformation first.</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/transformations')}
                >
                  Create Transformation
                </button>
              </div>
            ) : (
              <ul className="items-list">
                {transformations.map(transformation => (
                  <li 
                    key={transformation.id}
                    className={`item ${selectedTransformation?.id === transformation.id ? 'selected' : ''}`}
                    onClick={() => handleTransformationSelection(transformation.id)}
                  >
                    <FiLayers className="item-icon" />
                    <div className="item-details">
                      <h4>{transformation.name}</h4>
                      <p>{transformation.description || 'No description'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSchedulingStep = () => (
    <div className="step-container">
      <h3>Step 5: Schedule Job</h3>
      
        <div className="form-row">
          <div className="form-group">
            <div className="form-label">Schedule Type</div>
            <div className="schedule-types">
            <div className="schedule-type-option">
              <input
                type="radio"
                id="schedule-one-time"
                name="schedule-type"
                value="one-time"
                checked={scheduleType === 'one-time'}
                onChange={() => setScheduleType('one-time')}
              />
              <label htmlFor="schedule-one-time">One Time</label>
            </div>
            <div className="schedule-type-option">
              <input
                type="radio"
                id="schedule-recurring"
                name="schedule-type"
                value="recurring"
                checked={scheduleType === 'recurring'}
                onChange={() => setScheduleType('recurring')}
              />
              <label htmlFor="schedule-recurring">Recurring (Cron)</label>
            </div>
          </div>
        </div>
      </div>
      
      {scheduleType === 'one-time' ? (
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="schedule-date">Date</label>
            <input
              id="schedule-date"
              type="date"
              className="form-control"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="schedule-time">Time</label>
            <input
              id="schedule-time"
              type="time"
              className="form-control"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="schedule-cron">Cron Expression</label>
            <input
              id="schedule-cron"
              type="text"
              className="form-control"
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              placeholder="0 0 * * * (daily at midnight)"
            />
          </div>
          <div className="cron-helper">
            <h5>Cron Expression Examples:</h5>
            <ul>
              <li><code>0 0 * * *</code> - Daily at midnight</li>
              <li><code>0 12 * * *</code> - Daily at noon</li>
              <li><code>0 0 * * 0</code> - Weekly on Sunday</li>
              <li><code>0 0 1 * *</code> - Monthly (1st day of month)</li>
              <li><code>0 0/15 * * * *</code> - Every 15 minutes</li>
            </ul>
          </div>
        </div>
      )}
      
      <div className="form-row">
        <div className="form-group">
          <div className="form-label">Schedule Status</div>
          <div className="schedule-status">
            <input
              type="checkbox"
              id="schedule-enabled"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
            />
            <label htmlFor="schedule-enabled">Enabled</label>
          </div>
        </div>
      </div>
      
      <div className="wizard-summary">
        <h4>Wizard Summary</h4>
        <div className="summary-section">
          <p><strong>Group:</strong> {selectedGroup ? selectedGroup.name : 'N/A'}</p>
          <p><strong>Business Process:</strong> {selectedBusinessProcess ? selectedBusinessProcess.name : 'N/A'}</p>
          <p><strong>Job:</strong> {jobName}</p>
          <p><strong>Source File:</strong> {selectedSourceFile ? selectedSourceFile.filename : 'N/A'}</p>
          <p><strong>Target Type:</strong> {selectedTargetType.toUpperCase()}</p>
          <p><strong>Columns Mapped:</strong> {columnMappings.length}</p>
        </div>
      </div>
    </div>
  );
  
  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return renderGroupStep();
      case 2:
        return renderBusinessProcessStep();
      case 3:
        return renderJobStep();
      case 4:
        return renderMappingTransformationStep();
      case 5:
        return renderSchedulingStep();
      default:
        return null;
    }
  };
  
  // Handle final submission
  const handleFinalSubmit = () => {
    if (currentStep === 5) {
      createSchedule();
    } else if (currentStep === 3) {
      createJob();
    } else {
      goToNextStep();
    }
  };
  
  // Get step icon
  const getStepIcon = (step) => {
    switch (step) {
      case 1:
        return <FiUsers />;
      case 2:
        return <FiList />;
      case 3:
        return <FiSettings />;
      case 4:
        return <FiLayers />;
      case 5:
        return <FiCalendar />;
      default:
        return null;
    }
  };
  
  return (
    <div className="process-management-wizard">
      <div className="wizard-header">
        <h1>Process Management Wizard</h1>
        <div className="wizard-breadcrumbs">
          {Array.from({ length: 5 }, (_, i) => i + 1).map(step => (
            <div 
              key={step}
              className={`breadcrumb-item ${currentStep === step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`}
              onClick={() => currentStep > step && setCurrentStep(step)}
            >
              <div className="step-number">
                {currentStep > step ? <FiCheck /> : step}
              </div>
              <div className="step-name">
                {step === 1 && 'Group'}
                {step === 2 && 'Process'}
                {step === 3 && 'Job'}
                {step === 4 && 'Mapping/Transformation'}
                {step === 5 && 'Schedule'}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {error && (
        <div className="alert alert-danger">
          <FiAlertTriangle /> {error}
        </div>
      )}
      
      {success && (
        <div className="alert alert-success">
          <FiCheckCircle /> {success}
        </div>
      )}
      
      <div className="wizard-content">
        {renderStep()}
      </div>
      
      <div className="wizard-actions">
        <button
          className="btn btn-secondary"
          onClick={goToPreviousStep}
          disabled={currentStep === 1 || loading}
        >
          <FiChevronLeft /> Previous
        </button>
        <button
          className="btn btn-primary"
          onClick={handleFinalSubmit}
          disabled={loading || !validateCurrentStep()}
        >
          {loading ? (
            'Loading...'
          ) : currentStep === 5 ? (
            <>
              <FiSave /> Finish
            </>
          ) : currentStep === 3 ? (
            <>
              <FiSave /> Create Job & Continue
            </>
          ) : (
            <>
              Next <FiChevronRight />
            </>
          )}
        </button>
      </div>
    </div>
  );
};



export default ProcessManagementWizard;