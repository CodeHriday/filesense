import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiTrash2, FiPlay, FiChevronLeft, FiChevronRight, FiSave, FiX, FiEye, FiEdit, FiArrowLeft, FiCalendar, FiSearch, FiChevronDown, FiAlertCircle } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { PageTransition } from '../components/MicroAnimations';
import ConfirmModal from '../components/ConfirmModal';
import { groupWorkflowsByProject, initializeExpansionState } from '../utils/workflowGrouping';
import '../styles/NStepWorkflows.css';

const NStepWorkflows = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflowData, setWorkflowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('list');
  const [isWorkflowSaved, setIsWorkflowSaved] = useState(true);
  
  const [mappings, setMappings] = useState([]);
  const [mappingGroups, setMappingGroups] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedMapping, setSelectedMapping] = useState('');
  const [selectedMappingGroup, setSelectedMappingGroup] = useState('');
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [newWorkflowProjectId, setNewWorkflowProjectId] = useState('');
  const [newWorkflowSubProjectId, setNewWorkflowSubProjectId] = useState('');
  const [newWorkflowSubProjects, setNewWorkflowSubProjects] = useState([]);
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editWorkflowName, setEditWorkflowName] = useState('');
  const [editWorkflowDescription, setEditWorkflowDescription] = useState('');
  const [editWorkflowSubProjectId, setEditWorkflowSubProjectId] = useState('');
  const [editWorkflowSubProjects, setEditWorkflowSubProjects] = useState([]);
  
  const [executeModalOpen, setExecuteModalOpen] = useState(false);
  const [deleteStepModalOpen, setDeleteStepModalOpen] = useState(false);
  const [stepToDelete, setStepToDelete] = useState(null);
  const [saveSuccessModalOpen, setSaveSuccessModalOpen] = useState(false);
  const [deleteWorkflowModalOpen, setDeleteWorkflowModalOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState(null);
  const [executionResultModalOpen, setExecutionResultModalOpen] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [workflowToExecute, setWorkflowToExecute] = useState(null);
  const [duplicateErrorModalOpen, setDuplicateErrorModalOpen] = useState(false);
  const [duplicateErrorMessage, setDuplicateErrorMessage] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  // Search and pagination state
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // Hierarchical state
  const [expansionState, setExpansionState] = useState({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedWorkflow) {
      fetchWorkflowDetails();
    }
  }, [selectedWorkflow]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [workflowsRes, visualMappingsRes, groupsRes, projectsRes] = await Promise.all([
        axios.get('/api/n-step-workflows'),
        axios.get('/api/visual-mappings'),
        axios.get('/api/mapping-groups'),
        axios.get('/api/projects')
      ]);
      
      setWorkflows(workflowsRes.data.workflows || []);
      // Visual mappings API returns array directly with id and name fields
      setMappings(Array.isArray(visualMappingsRes.data) ? visualMappingsRes.data : []);
      setMappingGroups(groupsRes.data.groups || []);
      setProjects(projectsRes.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkflowDetails = async () => {
    try {
      const response = await axios.get(`/api/n-step-workflows/${selectedWorkflow}`);
      setWorkflowData(response.data.workflow);
    } catch (err) {
      console.error('Error fetching workflow details:', err);
      setError('Failed to load workflow details');
    }
  };

  const fetchSubProjectsForCreate = async (projectId) => {
    if (!projectId) {
      setNewWorkflowSubProjects([]);
      return;
    }
    try {
      const allProjects = projects || [];
      const subProjects = allProjects.filter(p => p.parent_project_id === parseInt(projectId));
      setNewWorkflowSubProjects(subProjects);
    } catch (err) {
      console.error('Error fetching subprojects:', err);
    }
  };

  const fetchSubProjectsForEdit = async (projectId) => {
    if (!projectId) {
      setEditWorkflowSubProjects([]);
      return;
    }
    try {
      const allProjects = projects || [];
      const subProjects = allProjects.filter(p => p.parent_project_id === parseInt(projectId));
      setEditWorkflowSubProjects(subProjects);
    } catch (err) {
      console.error('Error fetching subprojects:', err);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      alert('Please enter a workflow name');
      return;
    }
    
    if (!newWorkflowProjectId) {
      alert('Please select a project');
      return;
    }

    try {
      const response = await axios.post('/api/n-step-workflows', {
        name: newWorkflowName,
        description: newWorkflowDescription,
        project_id: newWorkflowProjectId,
        sub_project_id: newWorkflowSubProjectId || null
      });
      
      setWorkflows([response.data.workflow, ...workflows]);
      setSelectedWorkflow(response.data.workflow.id);
      setCreateModalOpen(false);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
      setNewWorkflowProjectId('');
      setNewWorkflowSubProjectId('');
      setNewWorkflowSubProjects([]);
      // Automatically open in edit mode
      setMode('edit');
      const detailsResponse = await axios.get(`/api/n-step-workflows/${response.data.workflow.id}`);
      setWorkflowData(detailsResponse.data.workflow);
      setIsWorkflowSaved(true);
    } catch (err) {
      console.error('Error creating workflow:', err);
      alert('Failed to create workflow');
    }
  };

  const handleDeleteWorkflow = async () => {
    try {
      await axios.delete(`/api/n-step-workflows/${workflowToDelete || selectedWorkflow}`);
      setWorkflows(workflows.filter(w => w.id !== (workflowToDelete || selectedWorkflow)));
      setSelectedWorkflow(null);
      setWorkflowData(null);
      setDeleteWorkflowModalOpen(false);
      setWorkflowToDelete(null);
    } catch (err) {
      console.error('Error deleting workflow:', err);
      setExecutionResult({ success: false, message: 'Failed to delete workflow' });
      setExecutionResultModalOpen(true);
      setDeleteWorkflowModalOpen(false);
    }
  };

  const handleNextStep = async () => {
    try {
      await axios.post(`/api/n-step-workflows/${selectedWorkflow}/steps/next`);
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
      setSelectedMapping('');
      setSelectedMappingGroup('');
    } catch (err) {
      console.error('Error moving to next step:', err);
      alert(err.response?.data?.error || 'Failed to move to next step');
    }
  };

  const handlePreviousStep = async () => {
    try {
      await axios.post(`/api/n-step-workflows/${selectedWorkflow}/steps/previous`);
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
      setSelectedMapping('');
      setSelectedMappingGroup('');
    } catch (err) {
      console.error('Error moving to previous step:', err);
      alert(err.response?.data?.error || 'Failed to move to previous step');
    }
  };

  const handleAddAsset = async (assetType) => {
    const activeStep = workflowData?.steps?.find(s => s.is_active);
    if (!activeStep) {
      alert('No active step');
      return;
    }

    const assetId = assetType === 'mapping' ? selectedMapping : selectedMappingGroup;
    
    // Check 10-mapping limit before adding
    const currentCount = getExpandedCount(activeStep);
    let newAssetCount = 0;
    if (assetType === 'mapping') {
      newAssetCount = 1;
    } else {
      const group = mappingGroups.find(g => g.id === parseInt(assetId));
      newAssetCount = group?.mapping_count || 0;
    }
    
    if (currentCount + newAssetCount > 10) {
      alert(`Cannot add: would exceed 10-mapping limit (current: ${currentCount}, adding: ${newAssetCount})`);
      return;
    }

    try {
      await axios.post(`/api/n-step-workflows/${selectedWorkflow}/steps/${activeStep.id}/assets`, {
        asset_type: assetType,
        asset_id: assetId
      });
      
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
      
      // Clear only the dropdown that was just added
      if (assetType === 'mapping') {
        setSelectedMapping('');
      } else {
        setSelectedMappingGroup('');
      }
    } catch (err) {
      console.error('Error adding asset:', err);
      alert(err.response?.data?.error || 'Failed to add asset');
    }
  };

  const handleRemoveAsset = async (stepId, assetId) => {
    try {
      await axios.delete(`/api/n-step-workflows/${selectedWorkflow}/steps/${stepId}/assets/${assetId}`);
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
    } catch (err) {
      console.error('Error removing asset:', err);
      alert('Failed to remove asset');
    }
  };

  const handleOpenEditModal = async () => {
    if (workflowData) {
      setEditWorkflowName(workflowData.name);
      setEditWorkflowDescription(workflowData.description || '');
      setEditWorkflowSubProjectId(workflowData.sub_project_id || '');
      
      // Load subprojects for the workflow's project
      if (workflowData.project_id) {
        await fetchSubProjectsForEdit(workflowData.project_id);
      }
      
      setEditModalOpen(true);
    }
  };

  const handleSaveWorkflow = async () => {
    try {
      let updateData;
      
      if (editModalOpen) {
        // Saving from edit modal - use modal state values
        updateData = {
          name: editWorkflowName,
          description: editWorkflowDescription,
          sub_project_id: editWorkflowSubProjectId || null
        };
      } else {
        // Saving from workflow builder - use workflowData values
        updateData = {
          name: workflowData.name,
          description: workflowData.description
        };
      }
      
      await axios.put(`/api/n-step-workflows/${selectedWorkflow}`, updateData);
      
      await fetchData();
      await fetchWorkflowDetails();
      
      if (editModalOpen) {
        setEditModalOpen(false);
      }
      
      setSaveSuccessModalOpen(true);
      setIsWorkflowSaved(true);
    } catch (err) {
      console.error('Error saving workflow:', err);
      alert('Failed to save workflow');
    }
  };

  const handleExecuteWorkflow = async () => {
    const idToExecute = workflowToExecute || selectedWorkflow;
    try {
      setExecuting(true);
      const response = await axios.post(`/api/n-step-workflows/${idToExecute}/execute`);
      setExecuteModalOpen(false);
      setWorkflowToExecute(null);
      
      // Show immediate success message
      setExecutionResult({ 
        success: true, 
        message: 'Job has been submitted in the background. Please navigate to the Jobs page to check the status.',
        workflowName: response.data.workflowName
      });
      setExecutionResultModalOpen(true);
    } catch (err) {
      console.error('Error executing workflow:', err);
      setExecuteModalOpen(false);
      setWorkflowToExecute(null);
      setExecutionResult({ success: false, message: err.response?.data?.error || 'Failed to execute workflow' });
      setExecutionResultModalOpen(true);
    } finally {
      setExecuting(false);
    }
  };

  const handleQuickExecute = (workflowId) => {
    setWorkflowToExecute(workflowId);
    setExecuteModalOpen(true);
  };

  const handleDeleteStep = async () => {
    if (!stepToDelete) return;

    try {
      await axios.delete(`/api/n-step-workflows/${selectedWorkflow}/steps/${stepToDelete.id}`);
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
      setDeleteStepModalOpen(false);
      setStepToDelete(null);
    } catch (err) {
      console.error('Error deleting step:', err);
      alert(err.response?.data?.error || 'Failed to delete step');
    }
  };

  const handleViewWorkflow = async (workflowId) => {
    setSelectedWorkflow(workflowId);
    setMode('view');
    const response = await axios.get(`/api/n-step-workflows/${workflowId}`);
    setWorkflowData(response.data.workflow);
  };

  const handleEditWorkflow = async (workflowId) => {
    setSelectedWorkflow(workflowId);
    setMode('edit');
    const response = await axios.get(`/api/n-step-workflows/${workflowId}`);
    setWorkflowData(response.data.workflow);
  };

  const handleBackToWorkflows = () => {
    setMode('list');
    setSelectedWorkflow(null);
    setWorkflowData(null);
    setSelectedMapping('');
    setSelectedMappingGroup('');
    fetchData();
  };

  const handleCancelChanges = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Action',
      message: 'Are you sure you want to cancel? Any unsaved changes will be lost.',
      action: () => {
        handleBackToWorkflows();
      }
    });
  };

  const handleAddStep = async () => {
    try {
      await axios.post(`/api/n-step-workflows/${selectedWorkflow}/steps`);
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
    } catch (err) {
      console.error('Error adding step:', err);
      alert(err.response?.data?.error || 'Failed to add step');
    }
  };

  const handleActivateStep = async (stepId) => {
    if (mode !== 'edit') return;
    
    try {
      await axios.put(`/api/n-step-workflows/${selectedWorkflow}/steps/${stepId}/activate`);
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
      setSelectedMapping('');
      setSelectedMappingGroup('');
    } catch (err) {
      console.error('Error activating step:', err);
      alert(err.response?.data?.error || 'Failed to activate step');
    }
  };

  const isAssetAlreadyAdded = (assetType, assetId) => {
    if (!workflowData?.steps) return false;
    
    for (const step of workflowData.steps) {
      if (step.assets) {
        const found = step.assets.some(
          asset => asset.asset_type === assetType && String(asset.asset_id) === String(assetId)
        );
        if (found) return true;
      }
    }
    return false;
  };

  const handleAddAssetSmart = async (type) => {
    const activeStep = workflowData?.steps?.find(s => s.is_active);
    if (!activeStep) {
      alert('No active step');
      return;
    }

    const assetType = type || (selectedMapping ? 'mapping' : 'mapping_group');
    const assetId = type === 'mapping' ? selectedMapping : (type === 'mapping_group' ? selectedMappingGroup : (selectedMapping || selectedMappingGroup));
    
    // Check if this asset is already in the current step
    const isDuplicate = activeStep.assets?.some(asset => 
      asset.asset_type === assetType && asset.asset_id === assetId
    );
    
    if (isDuplicate) {
      const assetName = assetType === 'mapping' 
        ? mappings.find(m => String(m.id) === String(assetId))?.name 
        : mappingGroups.find(g => g.id === parseInt(assetId))?.name;
      setDuplicateErrorMessage(`This ${assetType === 'mapping' ? 'mapping' : 'mapping group'} "${assetName}" is already in this step`);
      setDuplicateErrorModalOpen(true);
      return;
    }

    try {
      await axios.post(`/api/n-step-workflows/${selectedWorkflow}/steps/${activeStep.id}/assets`, {
        asset_type: assetType,
        asset_id: assetId
      });
      
      await fetchWorkflowDetails();
      setIsWorkflowSaved(false);
      // Only clear the dropdown that was just added
      if (assetType === 'mapping') {
        setSelectedMapping('');
      } else {
        setSelectedMappingGroup('');
      }
    } catch (err) {
      console.error('Error adding asset:', err);
      alert(err.response?.data?.error || 'Failed to add asset');
    }
  };

  const canAddAssetSmart = (type) => {
    // Get fresh activeStep value on each call to avoid stale closure
    const currentActiveStep = workflowData?.steps?.find(s => s.is_active);
    if (!currentActiveStep) return false;
    
    // If type is specified, check that specific type
    if (type === 'mapping') {
      if (!selectedMapping) return false;
      const assetId = selectedMapping;
      if (isAssetAlreadyAdded('mapping', assetId)) return false;
      const currentCount = getExpandedCount(currentActiveStep);
      return (currentCount + 1) <= 10;
    }
    
    if (type === 'mapping_group') {
      if (!selectedMappingGroup) return false;
      const assetId = selectedMappingGroup;
      if (isAssetAlreadyAdded('mapping_group', assetId)) return false;
      const currentCount = getExpandedCount(currentActiveStep);
      const group = mappingGroups.find(g => g.id === parseInt(assetId));
      const newAssetCount = group?.mapping_count || 0;
      return (currentCount + newAssetCount) <= 10;
    }
    
    // If no type specified, check both
    if (selectedMapping) {
      const assetId = selectedMapping;
      if (isAssetAlreadyAdded('mapping', assetId)) return false;
      const currentCount = getExpandedCount(currentActiveStep);
      return (currentCount + 1) <= 10;
    }
    
    if (selectedMappingGroup) {
      const assetId = selectedMappingGroup;
      if (isAssetAlreadyAdded('mapping_group', assetId)) return false;
      const currentCount = getExpandedCount(currentActiveStep);
      const group = mappingGroups.find(g => g.id === parseInt(assetId));
      const newAssetCount = group?.mapping_count || 0;
      return (currentCount + newAssetCount) <= 10;
    }
    
    return false;
  };

  const getAssetName = (asset) => {
    if (asset.asset_type === 'mapping') {
      const mapping = mappings.find(m => String(m.id) === String(asset.asset_id));
      return mapping?.name || asset.asset_id;
    } else {
      const group = mappingGroups.find(g => g.id === parseInt(asset.asset_id));
      return group?.name || asset.asset_id;
    }
  };

  const getExpandedCount = (step) => {
    if (!step.assets) return 0;
    
    let count = 0;
    for (const asset of step.assets) {
      if (asset.asset_type === 'mapping') {
        count += 1;
      } else if (asset.asset_type === 'mapping_group') {
        const group = mappingGroups.find(g => g.id === parseInt(asset.asset_id));
        count += group?.mapping_count || 0;
      }
    }
    return count;
  };

  const activeStep = workflowData?.steps?.find(s => s.is_active);
  const isFirstStep = activeStep?.step_index === 1;

  // Filter workflows based on search term
  const filteredWorkflows = workflows.filter(workflow => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (workflow.name || '').toLowerCase().includes(term) ||
      (workflow.description || '').toLowerCase().includes(term)
    );
  });

  // Group workflows by project and subproject hierarchy
  const groupedProjects = useMemo(() => {
    return groupWorkflowsByProject(filteredWorkflows);
  }, [filteredWorkflows]);

  // Initialize expansion state when grouped data changes
  useEffect(() => {
    if (groupedProjects.length > 0 && !initialized) {
      setExpansionState(initializeExpansionState(groupedProjects, false));
      setInitialized(true);
    }
  }, [groupedProjects, initialized]);

  // Toggle expansion state for project or subproject
  const toggleExpansion = (key) => {
    setExpansionState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Apply pagination to filtered workflows
  const totalItems = filteredWorkflows.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedWorkflows = filteredWorkflows.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Clamp currentPage when filtered results change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
  
  // Check if adding the selected asset would exceed the 10-mapping limit
  const canAddAsset = (assetType) => {
    if (!activeStep) {
      return false;
    }
    
    const currentCount = getExpandedCount(activeStep);
    let newAssetCount = 0;
    
    if (assetType === 'mapping') {
      if (!selectedMapping) return false;
      newAssetCount = 1;
    } else if (assetType === 'mapping_group') {
      if (!selectedMappingGroup) return false;
      const group = mappingGroups.find(g => g.id === parseInt(selectedMappingGroup));
      newAssetCount = group?.mapping_count || 0;
    }
    
    return (currentCount + newAssetCount) <= 10;
  };

  if (loading) {
    return <LoadingSpinner message="Loading workflows..." />;
  }

  return (
    <PageTransition>
      <div className="n-step-workflows-page">
        <PageHeader
          title="Workflows"
          subtitle="Build N-step workflows with sequential execution"
          hideHomeButton={true}
        />

        {mode === 'list' && (
          <div className="workflow-table-section">
            <div className="section-header">
              <h2>Available Workflows</h2>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="text"
                    placeholder="Search workflows..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ 
                      padding: '0.5rem 0.5rem 0.5rem 2.5rem', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      width: '300px'
                    }}
                  />
                </div>
                <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>
                  <FiPlus /> New Workflow
                </button>
              </div>
            </div>
          
          <div className="workflow-table-container">
            {filteredWorkflows.length === 0 ? (
              <div className="empty-message" style={{ textAlign: 'center', padding: '2rem' }}>
                {searchTerm ? 'No workflows match your search.' : 'No workflows found. Create one to get started.'}
              </div>
            ) : (
              <div>
                {groupedProjects.map(project => {
                  const projectKey = `project-${project.projectId}`;
                  const isProjectExpanded = expansionState[projectKey];

                  return (
                    <div key={project.projectId} style={{ marginBottom: '1.25rem' }}>
                      {/* Project Header */}
                      <div
                        onClick={() => toggleExpansion(projectKey)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: 'white',
                          color: '#6b7280',
                          cursor: 'pointer',
                          userSelect: 'none',
                          fontWeight: '500',
                          fontSize: '0.8125rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isProjectExpanded ? (
                          <FiChevronDown size={14} style={{ color: '#6b7280' }} />
                        ) : (
                          <FiChevronRight size={14} style={{ color: '#6b7280' }} />
                        )}
                        <span style={{ flex: 1 }}>Project : {project.projectName}</span>
                        <span
                          style={{
                            color: '#9ca3af',
                            fontSize: '0.75rem',
                            fontWeight: '400'
                          }}
                        >
                          {project.workflowsCount} {project.workflowsCount === 1 ? 'workflow' : 'workflows'}
                        </span>
                      </div>

                      {/* Project Content - Subprojects */}
                      {isProjectExpanded && (
                        <div style={{ marginTop: '0.75rem', paddingLeft: '0.5rem' }}>
                          {/* Subprojects */}
                          {project.subprojects.map(subproject => {
                            const subprojectKey = `subproject-${project.projectId}-${subproject.subProjectId}`;
                            const isSubprojectExpanded = expansionState[subprojectKey];

                            return (
                              <div key={subproject.subProjectId} style={{ marginBottom: '0.75rem' }}>
                                {/* Subproject Header */}
                                <div
                                  onClick={() => toggleExpansion(subprojectKey)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.4rem 0.75rem',
                                    background: 'white',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    marginLeft: '1.5rem',
                                    fontWeight: '400',
                                    fontSize: '0.75rem',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  {isSubprojectExpanded ? (
                                    <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                                  ) : (
                                    <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                                  )}
                                  <span style={{ flex: 1, color: '#9ca3af' }}>{subproject.subProjectName}</span>
                                  <span
                                    style={{
                                      color: '#d1d5db',
                                      fontSize: '0.6875rem',
                                      fontWeight: '400'
                                    }}
                                  >
                                    {subproject.workflowsCount}
                                  </span>
                                </div>

                                {/* Subproject Workflows Table */}
                                {isSubprojectExpanded && subproject.items.length > 0 && (
                                  <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                    <table className="data-table">
                                      <thead>
                                        <tr>
                                          <th>Name</th>
                                          <th>Description</th>
                                          <th>Steps</th>
                                          <th>Status</th>
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {subproject.items.map(w => (
                                          <tr 
                                            key={w.id}
                                            className={selectedWorkflow === w.id ? 'selected-row' : ''}
                                          >
                                            <td>
                                              <strong>{w.name}</strong>
                                            </td>
                                            <td>{w.description || '-'}</td>
                                            <td>{w.step_count || 0}</td>
                                            <td>
                                              <span className={`status-badge ${w.is_active ? 'status-active' : 'status-inactive'}`}>
                                                {w.is_active ? 'Active' : 'Inactive'}
                                              </span>
                                            </td>
                                            <td>
                                              <div className="action-buttons">
                                                <button
                                                  className="action-icon-btn execute-btn"
                                                  onClick={() => handleQuickExecute(w.id)}
                                                  title="Execute workflow"
                                                  disabled={executing}
                                                >
                                                  <FiPlay />
                                                </button>
                                                <button
                                                  className="action-icon-btn view-btn"
                                                  onClick={() => handleViewWorkflow(w.id)}
                                                  title="View workflow (read-only)"
                                                >
                                                  <FiEye />
                                                </button>
                                                <button
                                                  className="action-icon-btn edit-btn"
                                                  onClick={() => handleEditWorkflow(w.id)}
                                                  title="Edit workflow"
                                                >
                                                  <FiEdit />
                                                </button>
                                                <button
                                                  className="action-icon-btn delete-btn"
                                                  onClick={() => {
                                                    setWorkflowToDelete(w.id);
                                                    setDeleteWorkflowModalOpen(true);
                                                  }}
                                                  title="Delete workflow"
                                                >
                                                  <FiTrash2 />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Unassigned Workflows (no subproject) */}
                          {project.unassignedWorkflows.length > 0 && (() => {
                            const unassignedKey = `subproject-${project.projectId}-unassigned`;
                            const isUnassignedExpanded = expansionState[unassignedKey];

                            return (
                              <>
                                {/* Unassigned Header */}
                                <div
                                  onClick={() => toggleExpansion(unassignedKey)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.4rem 0.75rem',
                                    background: 'white',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    marginLeft: '1.5rem',
                                    fontWeight: '400',
                                    fontSize: '0.75rem',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  {isUnassignedExpanded ? (
                                    <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                                  ) : (
                                    <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                                  )}
                                  <FiAlertCircle size={12} style={{ color: '#d1d5db' }} />
                                  <span style={{ flex: 1, color: '#9ca3af' }}>No Subproject</span>
                                  <span
                                    style={{
                                      color: '#d1d5db',
                                      fontSize: '0.6875rem',
                                      fontWeight: '400'
                                    }}
                                  >
                                    {project.unassignedWorkflows.length}
                                  </span>
                                </div>

                                {/* Unassigned Workflows Table */}
                                {isUnassignedExpanded && (
                                  <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                    <table className="data-table">
                                      <thead>
                                        <tr>
                                          <th>Name</th>
                                          <th>Description</th>
                                          <th>Steps</th>
                                          <th>Status</th>
                                          <th>Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {project.unassignedWorkflows.map(w => (
                                          <tr 
                                            key={w.id}
                                            className={selectedWorkflow === w.id ? 'selected-row' : ''}
                                          >
                                            <td>
                                              <strong>{w.name}</strong>
                                            </td>
                                            <td>{w.description || '-'}</td>
                                            <td>{w.step_count || 0}</td>
                                            <td>
                                              <span className={`status-badge ${w.is_active ? 'status-active' : 'status-inactive'}`}>
                                                {w.is_active ? 'Active' : 'Inactive'}
                                              </span>
                                            </td>
                                            <td>
                                              <div className="action-buttons">
                                                <button
                                                  className="action-icon-btn execute-btn"
                                                  onClick={() => handleQuickExecute(w.id)}
                                                  title="Execute workflow"
                                                  disabled={executing}
                                                >
                                                  <FiPlay />
                                                </button>
                                                <button
                                                  className="action-icon-btn view-btn"
                                                  onClick={() => handleViewWorkflow(w.id)}
                                                  title="View workflow (read-only)"
                                                >
                                                  <FiEye />
                                                </button>
                                                <button
                                                  className="action-icon-btn edit-btn"
                                                  onClick={() => handleEditWorkflow(w.id)}
                                                  title="Edit workflow"
                                                >
                                                  <FiEdit />
                                                </button>
                                                <button
                                                  className="action-icon-btn delete-btn"
                                                  onClick={() => {
                                                    setWorkflowToDelete(w.id);
                                                    setDeleteWorkflowModalOpen(true);
                                                  }}
                                                  title="Delete workflow"
                                                >
                                                  <FiTrash2 />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={pageSize}
              totalItems={totalItems}
            />
          )}
        </div>
        )}

        {(mode === 'view' || mode === 'edit') && workflowData && (
          <>
            <div className="workflow-editor-header">
              <button className="btn btn-secondary" onClick={handleBackToWorkflows}>
                <FiArrowLeft /> Back to Workflows
              </button>
              <h2>{workflowData.name}</h2>
              <div className="header-actions">
                {mode === 'edit' && (
                  <button className="btn btn-secondary" onClick={handleCancelChanges}>
                    <FiX /> Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="workflow-controls">
              <div className="asset-selectors">
                <div className="selector-group">
                  <label>Select Visual Mapping</label>
                  <select
                    value={selectedMapping}
                    onChange={(e) => {
                      setSelectedMapping(e.target.value);
                    }}
                    className="form-select"
                    disabled={!activeStep || mode === 'view'}
                  >
                    <option value="">-- Select Visual Mapping --</option>
                    {mappings.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {mode === 'edit' && (
                    <button
                      className="btn btn-primary selector-add-btn"
                      onClick={() => handleAddAssetSmart('mapping')}
                      disabled={!selectedMapping || !activeStep}
                      title="Add selected visual mapping to active step"
                    >
                      <FiPlus /> Add Visual Mapping
                    </button>
                  )}
                </div>

                <div className="selector-group">
                  <label>Select Mapping Group</label>
                  <select
                    value={selectedMappingGroup}
                    onChange={(e) => {
                      setSelectedMappingGroup(e.target.value);
                    }}
                    className="form-select"
                    disabled={!activeStep || mode === 'view'}
                  >
                    <option value="">-- Select Mapping Group --</option>
                    {mappingGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.mapping_count} mappings)</option>
                    ))}
                  </select>
                  {mode === 'edit' && (
                    <button
                      className="btn btn-primary selector-add-btn"
                      onClick={() => handleAddAssetSmart('mapping_group')}
                      disabled={!selectedMappingGroup || !activeStep}
                      title="Add selected mapping group to active step"
                    >
                      <FiPlus /> Add Group
                    </button>
                  )}
                </div>
              </div>

              <div className="step-navigation">
                {mode === 'edit' && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleAddStep}
                  >
                    <FiPlus /> Add Step
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={handleSaveWorkflow}
                  disabled={mode === 'view'}
                >
                  <FiSave /> Save Workflow
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => { setWorkflowToExecute(null); setExecuteModalOpen(true); }}
                  disabled={executing || !workflowData.steps?.length || !isWorkflowSaved}
                  title={!isWorkflowSaved ? "Please save the workflow before executing" : "Execute workflow"}
                >
                  <FiPlay /> Execute Workflow
                </button>
              </div>
            </div>

            <div className="steps-grid">
              {workflowData.steps?.map(step => {
                const expandedCount = getExpandedCount(step);
                const isActive = step.is_active;
                
                return (
                  <div 
                    key={step.id} 
                    className={`step-column ${isActive ? 'active' : 'frozen'} ${mode === 'edit' ? 'clickable' : ''}`}
                    onClick={() => mode === 'edit' && !isActive && handleActivateStep(step.id)}
                  >
                    <div className="step-header">
                      <div className="step-title-row">
                        <h3>Step {step.step_index}</h3>
                        {mode === 'edit' && (
                          <button
                            className="step-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStepToDelete(step);
                              setDeleteStepModalOpen(true);
                            }}
                            title="Delete this step"
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                      <span className={`step-status ${isActive ? 'active-badge' : 'frozen-badge'}`}>
                        {isActive ? 'Active' : 'Frozen'}
                      </span>
                    </div>
                    
                    <div className="step-count">
                      Mappings: {expandedCount}/10
                      {expandedCount > 10 && <span className="error-text"> (Exceeds limit!)</span>}
                    </div>

                    <div className="step-assets">
                      {step.assets?.map(asset => (
                        <div key={asset.id} className="asset-chip">
                          <span className="asset-type-badge">
                            {asset.asset_type === 'mapping' ? 'MAPPING' : 'GROUP'}
                          </span>
                          <span className="asset-name">{getAssetName(asset)}</span>
                          {isActive && mode === 'edit' && (
                            <button
                              className="asset-remove-btn"
                              onClick={() => handleRemoveAsset(step.id, asset.id)}
                            >
                              <FiX />
                            </button>
                          )}
                        </div>
                      ))}
                      {(!step.assets || step.assets.length === 0) && (
                        <div className="empty-step">No assets</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!selectedWorkflow && (
          <div className="empty-state">
            <p>Select a workflow or create a new one to get started</p>
          </div>
        )}

        {createModalOpen && (
          <div className="modal-overlay" onClick={() => setCreateModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Workflow</h2>
                <button className="modal-close" onClick={() => setCreateModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Project *</label>
                  <select
                    value={newWorkflowProjectId}
                    onChange={(e) => {
                      const projectId = e.target.value;
                      setNewWorkflowProjectId(projectId);
                      setNewWorkflowSubProjectId('');
                      fetchSubProjectsForCreate(projectId);
                    }}
                    required
                    className="form-input"
                  >
                    <option value="">Select a project...</option>
                    {projects.filter(p => !p.parent_project_id).map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                {newWorkflowProjectId && (
                  <div className="form-group">
                    <label>Sub-Project (Optional)</label>
                    <select
                      value={newWorkflowSubProjectId}
                      onChange={(e) => setNewWorkflowSubProjectId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">None (Parent Project Level)</option>
                      {newWorkflowSubProjects.map(subProject => (
                        <option key={subProject.id} value={subProject.id}>
                          {subProject.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Workflow Name *</label>
                  <input
                    type="text"
                    value={newWorkflowName}
                    onChange={(e) => setNewWorkflowName(e.target.value)}
                    className="form-input"
                    placeholder="Enter workflow name"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newWorkflowDescription}
                    onChange={(e) => setNewWorkflowDescription(e.target.value)}
                    className="form-input"
                    rows={3}
                    placeholder="Enter workflow description (optional)"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleCreateWorkflow}>
                  <FiSave /> Create
                </button>
              </div>
            </div>
          </div>
        )}

        {editModalOpen && (
          <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Save Workflow</h2>
                <button className="modal-close" onClick={() => setEditModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Project *</label>
                  <select
                    value={workflowData?.project_id || ''}
                    disabled
                    className="form-input"
                  >
                    <option value="">Select a project...</option>
                    {projects.filter(p => !p.parent_project_id).map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#64748b' }}>
                    Project cannot be changed after creation
                  </small>
                </div>
                {workflowData?.project_id && (
                  <div className="form-group">
                    <label>Sub-Project (Optional)</label>
                    <select
                      value={editWorkflowSubProjectId}
                      onChange={(e) => setEditWorkflowSubProjectId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">None (Parent Project Level)</option>
                      {editWorkflowSubProjects.map(subProject => (
                        <option key={subProject.id} value={subProject.id}>
                          {subProject.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Workflow Name *</label>
                  <input
                    type="text"
                    value={editWorkflowName}
                    onChange={(e) => setEditWorkflowName(e.target.value)}
                    className="form-input"
                    placeholder="Enter workflow name"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={editWorkflowDescription}
                    onChange={(e) => setEditWorkflowDescription(e.target.value)}
                    className="form-input"
                    rows={3}
                    placeholder="Enter workflow description (optional)"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveWorkflow}>
                  <FiSave /> Save
                </button>
              </div>
            </div>
          </div>
        )}

        {executeModalOpen && (
          <div className="modal-overlay" onClick={() => { if (!executing) { setExecuteModalOpen(false); setWorkflowToExecute(null); } }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Execute Workflow</h2>
                <button className="modal-close" onClick={() => { if (!executing) { setExecuteModalOpen(false); setWorkflowToExecute(null); } }}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to execute this workflow?</p>
                <p><strong>{workflowToExecute ? workflows.find(w => w.id === workflowToExecute)?.name : workflowData?.name}</strong></p>
                <p className="text-muted">
                  This will run all steps sequentially.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { if (!executing) { setExecuteModalOpen(false); setWorkflowToExecute(null); } }} disabled={executing}>
                  Cancel
                </button>
                <button 
                  className="btn btn-success" 
                  onClick={handleExecuteWorkflow}
                  disabled={executing}
                >
                  <FiPlay /> {executing ? 'Executing...' : 'Execute'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteStepModalOpen && (
          <div className="modal-overlay" onClick={() => setDeleteStepModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Delete Step</h2>
                <button className="modal-close" onClick={() => setDeleteStepModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete this step?</p>
                <p><strong>Step {stepToDelete?.step_index}</strong></p>
                <p className="text-muted">
                  This will delete all assets in this step and renumber the remaining steps.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteStepModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={handleDeleteStep}
                >
                  <FiTrash2 /> Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {saveSuccessModalOpen && (
          <div className="modal-overlay" onClick={() => setSaveSuccessModalOpen(false)}>
            <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Success!</h2>
                <button className="modal-close" onClick={() => setSaveSuccessModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <div className="success-icon">✓</div>
                <p><strong>Workflow saved successfully!</strong></p>
                <p className="text-muted">Your changes have been saved.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setSaveSuccessModalOpen(false)}>
                  OK
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    setSaveSuccessModalOpen(false);
                    navigate(`/etl-scheduler/create?type=workflow&id=${selectedWorkflow}`);
                  }}
                >
                  <FiCalendar /> Schedule Workflow
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={deleteWorkflowModalOpen}
          onClose={() => setDeleteWorkflowModalOpen(false)}
          onConfirm={handleDeleteWorkflow}
          title="Delete Workflow"
          message={`Are you sure you want to delete "${workflows.find(w => w.id === workflowToDelete)?.name || 'this workflow'}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />

        {executionResultModalOpen && (
          <div className="modal-overlay" onClick={() => setExecutionResultModalOpen(false)}>
            <div className={`modal-content ${executionResult?.success ? 'success-modal' : 'error-modal'}`} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{executionResult?.success ? 'Success!' : 'Error'}</h2>
                <button className="modal-close" onClick={() => setExecutionResultModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <div className={executionResult?.success ? 'success-icon' : 'error-icon'}>
                  {executionResult?.success ? '✓' : '✕'}
                </div>
                <p><strong>{executionResult?.message}</strong></p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setExecutionResultModalOpen(false)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {duplicateErrorModalOpen && (
          <div className="modal-overlay" onClick={() => setDuplicateErrorModalOpen(false)}>
            <div className="modal-content error-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Duplicate Asset</h2>
                <button className="modal-close" onClick={() => setDuplicateErrorModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <div className="error-icon">⚠</div>
                <p><strong>{duplicateErrorMessage}</strong></p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setDuplicateErrorModalOpen(false)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          onConfirm={() => {
            confirmModal.action?.();
            setConfirmModal({ ...confirmModal, isOpen: false });
          }}
          title={confirmModal.title}
          message={confirmModal.message}
          variant="warning"
        />
      </div>
    </PageTransition>
  );
};

export default NStepWorkflows;
