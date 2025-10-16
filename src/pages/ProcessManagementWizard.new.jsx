import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FiSettings
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
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';

const ProcessManagementWizard = () => {
  const navigate = useNavigate();
  const { hasWritePermission } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
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
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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
      case 4: // Connections
        return sourceConnection !== null;
      case 5: // Column mapping
        return true; // Always valid for now
      case 6: // Transformations
        return true; // Always valid, as transformations are optional
      case 7: // Target columns
        return true; // Always valid for now
      case 8: // Scheduling
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
      setSuccess('Workflow created successfully');
      setLoading(false);
      
      // Move to next step
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.error('Error creating business process:', err);
      setError('Failed to create workflow. Please try again.');
      setLoading(false);
    }
  };
  
  // Step 3: Job creation
  const createJob = async () => {
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
  
  // Step 6: Transformations - ReactFlow Implementation
  // Handle drag over for the React Flow container
  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };
  
  // Handle drop for React Flow
  const handleDrop = (event) => {
    event.preventDefault();
    
    if (!reactFlowWrapper.current) return;
    
    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const type = event.dataTransfer.getData('application/reactflow');
    
    if (!type) return;

    const position = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    };
    
    const newNode = {
      id: `transform-${Date.now()}`,
      type: 'default',
      position,
      data: { 
        label: type.charAt(0).toUpperCase() + type.slice(1),  // Capitalize the first letter
        type: 'transformation' 
      },
      style: { 
        background: getNodeColorByType(type),
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ddd'
      }
    };
    
    setNodes((nds) => nds.concat(newNode));
  };
  
  // Handle connections between nodes
  const onConnect = useCallback((params) => {
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
  }, [setEdges]);
  
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
            <label>Group Name</label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="form-control"
              placeholder="Enter group name"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
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
      <h3>Step 2: Select or Create Workflow</h3>
      
      {/* Show business processes if a group is selected */}
      {selectedGroup && businessProcesses.length > 0 && (
        <div className="existing-items">
          <h4>Select Existing Workflow</h4>
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
        <h4>Create New Workflow</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Process Name</label>
            <input
              type="text"
              value={newProcessName}
              onChange={(e) => setNewProcessName(e.target.value)}
              className="form-control"
              placeholder="Enter process name"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
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
      </div>
    </div>
  );
  
  const renderJobStep = () => (
    <div className="step-container">
      <h3>Step 3: Create Job</h3>
      
      <div className="create-new-item">
        <div className="form-row">
          <div className="form-group">
            <label>Job Name</label>
            <input
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className="form-control"
              placeholder="Enter job name"
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
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
            <label>Status</label>
            <select 
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
      </div>
      
      <div className="form-summary">
        <h4>Job Details</h4>
        <div className="summary-item">
          <span>Group:</span>
          <strong>{selectedGroup ? selectedGroup.name : 'None'}</strong>
        </div>
        <div className="summary-item">
          <span>Workflow:</span>
          <strong>{selectedBusinessProcess ? selectedBusinessProcess.name : 'None'}</strong>
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
          <label>1. Select Source Connection</label>
          <select 
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
            <label>2. Select Source File</label>
            <select 
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
          <label>1. Select Target Connection</label>
          <select 
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
            <div className="target-file-toggle">
              <label className="toggle-container">
                <input
                  type="checkbox"
                  checked={!isNewTargetFile}
                  onChange={toggleTargetFileMode}
                />
                <span className="toggle-text">
                  {isNewTargetFile ? 'Create New File' : 'Overwrite Existing File'}
                </span>
              </label>
            </div>
            
            {isNewTargetFile ? (
              <div className="form-row">
                <div className="form-group">
                  <label>2. New Target File Name</label>
                  <input
                    type="text"
                    value={targetFileName}
                    onChange={handleTargetFileNameChange}
                    className="form-control"
                    placeholder="Enter file name (e.g., output.csv)"
                  />
                </div>
                <div className="form-group">
                  <label>Output File Format</label>
                  <select 
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
                <label>2. Select Existing Target File to Overwrite</label>
                <select 
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
      
      <div className="transformation-flow-tools">
        <div 
          className="transform-tool filter" 
          draggable 
          onDragStart={(e) => {
            e.dataTransfer.setData('application/reactflow', 'filter');
            e.dataTransfer.effectAllowed = 'move';
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
          }}
        >
          <div className="transform-tool-icon">
            <FiCpu />
          </div>
          <div className="transform-tool-name">Calculate</div>
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
          fitView
        >
          <Controls />
          <Background color="#aaa" gap={16} />
        </ReactFlow>
      </div>
      
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
  
  const renderSchedulingStep = () => (
    <div className="step-container">
      <h3>Step 8: Schedule Job</h3>
      
      <div className="form-row">
        <div className="form-group">
          <label>Schedule Type</label>
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
            <label>Date</label>
            <input
              type="date"
              className="form-control"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Time</label>
            <input
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
            <label>Cron Expression</label>
            <input
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
          <label>Schedule Status</label>
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
        return renderConnectionsStep();
      case 5:
        return renderColumnMappingStep();
      case 6:
        return renderTransformationsStep();
      case 7:
        return renderTargetColumnsStep();
      case 8:
        return renderSchedulingStep();
      default:
        return null;
    }
  };
  
  // Handle final submission
  const handleFinalSubmit = () => {
    if (currentStep === 8) {
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
        return <FiDatabase />;
      case 5:
        return <FiLink />;
      case 6:
        return <FiCode />;
      case 7:
        return <FiTable />;
      case 8:
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
          {Array.from({ length: 8 }, (_, i) => i + 1).map(step => (
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
                {step === 4 && 'Source/Target'}
                {step === 5 && 'Mapping'}
                {step === 6 && 'Transform'}
                {step === 7 && 'Columns'}
                {step === 8 && 'Schedule'}
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
          ) : currentStep === 8 ? (
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