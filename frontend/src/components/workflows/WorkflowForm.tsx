import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import workflowService, { WorkflowStep, CreateWorkflowStepRequest } from '../../services/workflowService';
import transformationService from '../../services/transformationService';
import mappingGroupService, { MappingGroup } from '../../services/mappingGroupService';
import { Transformation } from '../../../../shared/types/transformations';
import { THEME } from '../../config/config';

const WorkflowForm: React.FC = () => {
  const navigate = useNavigate();
  const { workflowName } = useParams<{ workflowName: string }>();
  const isEdit = !!workflowName;

  const [name, setName] = useState(workflowName ?? '');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [mappingGroups, setMappingGroups] = useState<MappingGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newStep, setNewStep] = useState({
    step_name: '',
    step_type: 'transformation' as 'transformation' | 'mapping_group',
    entity_id: '',
    retry_attempts: 3,
    execution_mode: 'sequential' as 'parallel' | 'sequential',
    depends_on: [] as string[]
  });

  useEffect(() => {
    fetchData();
  }, [workflowName]);

  const fetchData = async () => {
    try {
      const [transformationsData, groupsData] = await Promise.all([
        transformationService.getAllTransformations(),
        mappingGroupService.getAllMappingGroups()
      ]);
      setTransformations(transformationsData);
      setMappingGroups(groupsData);

      if (isEdit && workflowName) {
        const stepsData = await workflowService.getWorkflowSteps(workflowName);
        const sortedSteps = stepsData.sort((a, b) => a.step_order - b.step_order);
        setSteps(sortedSteps);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    }
  };

  const handleAddStep = async () => {
    if (!name || !newStep.step_name || !newStep.entity_id) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const stepData: CreateWorkflowStepRequest = {
        workflow_name: name,
        step_name: newStep.step_name,
        step_type: newStep.step_type,
        step_order: steps.length + 1,
        entity_id: newStep.entity_id,
        retry_attempts: newStep.retry_attempts,
        execution_mode: newStep.execution_mode,
        depends_on: newStep.depends_on.length > 0 ? newStep.depends_on : undefined
      };

      const createdStep = await workflowService.createWorkflowStep(stepData);
      setSteps([...steps, createdStep]);
      
      setNewStep({
        step_name: '',
        step_type: 'transformation',
        entity_id: '',
        retry_attempts: 3,
        execution_mode: 'sequential',
        depends_on: []
      });
      setError(null);
    } catch (err) {
      console.error('Error adding step:', err);
      setError('Failed to add step');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      await workflowService.deleteWorkflowStep(stepId);
      setSteps(steps.filter(s => s.step_id !== stepId));
    } catch (err) {
      console.error('Error deleting step:', err);
      setError('Failed to delete step');
    }
  };

  const toggleDependency = (stepId: string) => {
    setNewStep(prev => ({
      ...prev,
      depends_on: prev.depends_on.includes(stepId)
        ? prev.depends_on.filter(id => id !== stepId)
        : [...prev.depends_on, stepId]
    }));
  };

  const getEntityOptions = () => {
    if (newStep.step_type === 'transformation') {
      return transformations.map(t => ({ id: t.id, name: t.name }));
    } else {
      return mappingGroups.map(g => ({ id: g.group_id, name: g.group_name }));
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ color: THEME.colors.secondary, marginBottom: '20px' }}>
        {isEdit ? `Edit Workflow: ${workflowName}` : 'Create New Workflow'}
      </h2>

      {error && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {!isEdit && (
        <div style={{ marginBottom: '24px' }}>
          <label htmlFor="workflow-name-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Workflow Name *
          </label>
          <input
            id="workflow-name-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px'
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h3 style={{ marginTop: 0 }}>Workflow Steps ({steps.length})</h3>
        
        {steps.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {steps.map((step, idx) => (
              <div
                key={step.step_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              >
                <div>
                  <strong>{idx + 1}. {step.step_name}</strong>
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                    Type: {step.step_type} | Mode: {step.execution_mode} | Retries: {step.retry_attempts}
                    {step.depends_on && step.depends_on.length > 0 && (
                      <span> | Depends on: {step.depends_on.length} step(s)</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteStep(step.step_id)}
                  style={{
                    backgroundColor: '#ff4d4f',
                    color: 'white',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <h4>Add New Step</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label htmlFor="step-name-input" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Step Name *</label>
            <input
              id="step-name-input"
              type="text"
              value={newStep.step_name}
              onChange={e => setNewStep({ ...newStep, step_name: e.target.value })}
              style={{ width: '100%', padding: '6px', border: '1px solid #e0e0e0', borderRadius: '4px' }}
            />
          </div>
          
          <div>
            <label htmlFor="step-type-select" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Step Type *</label>
            <select
              id="step-type-select"
              value={newStep.step_type}
              onChange={e => setNewStep({ ...newStep, step_type: e.target.value as 'transformation' | 'mapping_group', entity_id: '' })}
              style={{ width: '100%', padding: '6px', border: '1px solid #e0e0e0', borderRadius: '4px' }}
            >
              <option value="transformation">Transformation</option>
              <option value="mapping_group">Mapping Group</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label htmlFor="entity-select" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
              {newStep.step_type === 'transformation' ? 'Transformation' : 'Mapping Group'} *
            </label>
            <select
              id="entity-select"
              value={newStep.entity_id}
              onChange={e => setNewStep({ ...newStep, entity_id: e.target.value })}
              style={{ width: '100%', padding: '6px', border: '1px solid #e0e0e0', borderRadius: '4px' }}
            >
              <option value="">Select...</option>
              {getEntityOptions().map(option => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="execution-mode-select" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Execution Mode</label>
            <select
              id="execution-mode-select"
              value={newStep.execution_mode}
              onChange={e => setNewStep({ ...newStep, execution_mode: e.target.value as 'parallel' | 'sequential' })}
              style={{ width: '100%', padding: '6px', border: '1px solid #e0e0e0', borderRadius: '4px' }}
            >
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </div>

          <div>
            <label htmlFor="retry-attempts-input" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Retry Attempts</label>
            <input
              id="retry-attempts-input"
              type="number"
              min="0"
              max="10"
              value={newStep.retry_attempts}
              onChange={e => setNewStep({ ...newStep, retry_attempts: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '6px', border: '1px solid #e0e0e0', borderRadius: '4px' }}
            />
          </div>
        </div>

        {steps.length > 0 && (
          <fieldset style={{ marginBottom: '12px', border: 'none', padding: '0' }}>
            <legend style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'normal' }}>Dependencies (optional)</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {steps.map((step, idx) => (
                <label
                  key={step.step_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 8px',
                    backgroundColor: newStep.depends_on.includes(step.step_id) ? THEME.colors.primary : 'white',
                    color: newStep.depends_on.includes(step.step_id) ? 'white' : '#333',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newStep.depends_on.includes(step.step_id)}
                    onChange={() => toggleDependency(step.step_id)}
                    style={{ marginRight: '6px' }}
                  />
                  Step {idx + 1}: {step.step_name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <button
          onClick={handleAddStep}
          disabled={loading || !newStep.step_name || !newStep.entity_id}
          style={{
            backgroundColor: THEME.colors.primary,
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: (!loading && newStep.step_name && newStep.entity_id) ? 'pointer' : 'not-allowed',
            opacity: (!loading && newStep.step_name && newStep.entity_id) ? 1 : 0.6
          }}
        >
          {loading ? 'Adding...' : 'Add Step'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => navigate('/workflows')}
          style={{
            backgroundColor: THEME.colors.primary,
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {steps.length > 0 ? 'Done' : 'Back to Workflows'}
        </button>
      </div>
    </div>
  );
};

export default WorkflowForm;
