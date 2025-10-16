import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiTrash2, FiPlay, FiChevronLeft, FiChevronRight, FiSave, FiX } from 'react-icons/fi';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import '../styles/NStepWorkflows.css';

const NStepWorkflows = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflowData, setWorkflowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);
  
  const [mappings, setMappings] = useState([]);
  const [mappingGroups, setMappingGroups] = useState([]);
  
  const [selectedMapping, setSelectedMapping] = useState('');
  const [selectedMappingGroup, setSelectedMappingGroup] = useState('');
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editWorkflowName, setEditWorkflowName] = useState('');
  const [editWorkflowDescription, setEditWorkflowDescription] = useState('');
  
  const [executeModalOpen, setExecuteModalOpen] = useState(false);
  const [deleteStepModalOpen, setDeleteStepModalOpen] = useState(false);
  const [stepToDelete, setStepToDelete] = useState(null);

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
      const [workflowsRes, mappingsRes, groupsRes] = await Promise.all([
        axios.get('/api/n-step-workflows'),
        axios.get('/api/transformations'),
        axios.get('/api/mapping-groups')
      ]);
      
      setWorkflows(workflowsRes.data.workflows || []);
      setMappings(mappingsRes.data.mappings || []);
      setMappingGroups(groupsRes.data.groups || []);
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

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      alert('Please enter a workflow name');
      return;
    }

    try {
      const response = await axios.post('/api/n-step-workflows', {
        name: newWorkflowName,
        description: newWorkflowDescription
      });
      
      setWorkflows([response.data.workflow, ...workflows]);
      setSelectedWorkflow(response.data.workflow.id);
      setCreateModalOpen(false);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
    } catch (err) {
      console.error('Error creating workflow:', err);
      alert('Failed to create workflow');
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!window.confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      await axios.delete(`/api/n-step-workflows/${selectedWorkflow}`);
      setWorkflows(workflows.filter(w => w.id !== selectedWorkflow));
      setSelectedWorkflow(null);
      setWorkflowData(null);
    } catch (err) {
      console.error('Error deleting workflow:', err);
      alert('Failed to delete workflow');
    }
  };

  const handleNextStep = async () => {
    try {
      await axios.post(`/api/n-step-workflows/${selectedWorkflow}/steps/next`);
      await fetchWorkflowDetails();
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
    } catch (err) {
      console.error('Error removing asset:', err);
      alert('Failed to remove asset');
    }
  };

  const handleOpenEditModal = () => {
    if (workflowData) {
      setEditWorkflowName(workflowData.name);
      setEditWorkflowDescription(workflowData.description || '');
      setEditModalOpen(true);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!editWorkflowName.trim()) {
      alert('Please enter a workflow name');
      return;
    }

    try {
      await axios.put(`/api/n-step-workflows/${selectedWorkflow}`, {
        name: editWorkflowName,
        description: editWorkflowDescription
      });
      
      await fetchData();
      await fetchWorkflowDetails();
      setEditModalOpen(false);
      alert('Workflow saved successfully!');
    } catch (err) {
      console.error('Error saving workflow:', err);
      alert('Failed to save workflow');
    }
  };

  const handleExecuteWorkflow = async () => {
    try {
      setExecuting(true);
      const response = await axios.post(`/api/n-step-workflows/${selectedWorkflow}/execute`);
      setExecuteModalOpen(false);
      alert(`Workflow executed successfully! Run ID: ${response.data.runId}`);
      await fetchWorkflowDetails();
    } catch (err) {
      console.error('Error executing workflow:', err);
      alert(err.response?.data?.error || 'Failed to execute workflow');
    } finally {
      setExecuting(false);
    }
  };

  const handleDeleteStep = async () => {
    if (!stepToDelete) return;

    try {
      await axios.delete(`/api/n-step-workflows/${selectedWorkflow}/steps/${stepToDelete.id}`);
      await fetchWorkflowDetails();
      setDeleteStepModalOpen(false);
      setStepToDelete(null);
    } catch (err) {
      console.error('Error deleting step:', err);
      alert(err.response?.data?.error || 'Failed to delete step');
    }
  };

  const getAssetName = (asset) => {
    if (asset.asset_type === 'mapping') {
      const mapping = mappings.find(m => m.mapping_id === asset.asset_id);
      return mapping?.mapping_name || asset.asset_id;
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
          title="Workflow Steps"
          subtitle="Build N-step workflows with sequential execution"
        />

        <div className="workflow-selector-bar">
          <div className="selector-left">
            <label>Select Workflow:</label>
            <select
              value={selectedWorkflow || ''}
              onChange={(e) => setSelectedWorkflow(e.target.value ? parseInt(e.target.value) : null)}
              className="workflow-select"
            >
              <option value="">-- Select a Workflow --</option>
              {workflows.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="selector-right">
            <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>
              <FiPlus /> New Workflow
            </button>
            {selectedWorkflow && (
              <button className="btn btn-danger" onClick={handleDeleteWorkflow}>
                <FiTrash2 /> Delete
              </button>
            )}
          </div>
        </div>

        {selectedWorkflow && workflowData && (
          <>
            <div className="workflow-controls">
              <div className="asset-selectors">
                <div className="selector-group">
                  <label>Select Mapping</label>
                  <select
                    value={selectedMapping}
                    onChange={(e) => setSelectedMapping(e.target.value)}
                    className="form-select"
                    disabled={!activeStep}
                  >
                    <option value="">-- Select Mapping --</option>
                    {mappings.map(m => (
                      <option key={m.mapping_id} value={m.mapping_id}>{m.mapping_name}</option>
                    ))}
                  </select>
                </div>

                <div className="selector-group">
                  <label>Select Mapping Group</label>
                  <select
                    value={selectedMappingGroup}
                    onChange={(e) => setSelectedMappingGroup(e.target.value)}
                    className="form-select"
                    disabled={!activeStep}
                  >
                    <option value="">-- Select Mapping Group --</option>
                    {mappingGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.mapping_count} mappings)</option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => handleAddAsset('mapping')}
                  disabled={!selectedMapping || !canAddAsset('mapping')}
                >
                  <FiPlus /> Add Mapping
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleAddAsset('mapping_group')}
                  disabled={!selectedMappingGroup || !canAddAsset('mapping_group')}
                >
                  <FiPlus /> Add Group
                </button>
              </div>

              <div className="step-navigation">
                <button
                  className="btn btn-secondary"
                  onClick={handlePreviousStep}
                  disabled={isFirstStep || !activeStep}
                >
                  <FiChevronLeft /> Previous Step
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleNextStep}
                  disabled={!activeStep}
                >
                  Next Step <FiChevronRight />
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleOpenEditModal}
                >
                  <FiSave /> Save Workflow
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => setExecuteModalOpen(true)}
                  disabled={executing || !workflowData.steps?.length}
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
                  <div key={step.id} className={`step-column ${isActive ? 'active' : 'frozen'}`}>
                    <div className="step-header">
                      <div className="step-title-row">
                        <h3>Step {step.step_index}</h3>
                        <button
                          className="step-delete-btn"
                          onClick={() => {
                            setStepToDelete(step);
                            setDeleteStepModalOpen(true);
                          }}
                          title="Delete this step"
                        >
                          <FiTrash2 />
                        </button>
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
                          {isActive && (
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
          <div className="modal-overlay" onClick={() => setExecuteModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Execute Workflow</h2>
                <button className="modal-close" onClick={() => setExecuteModalOpen(false)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to execute this workflow?</p>
                <p><strong>{workflowData?.name}</strong></p>
                <p className="text-muted">
                  This will run all {workflowData?.steps?.length || 0} steps sequentially.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setExecuteModalOpen(false)}>
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
      </div>
    </PageTransition>
  );
};

export default NStepWorkflows;
