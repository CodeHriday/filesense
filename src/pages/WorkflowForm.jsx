import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiSave, FiPlus } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const WorkflowForm = () => {
  const navigate = useNavigate();
  const { workflowName } = useParams();
  const isEdit = !!workflowName;

  const [name, setName] = useState(workflowName ? decodeURIComponent(workflowName) : '');
  const [projectId, setProjectId] = useState('');
  const [subProjectId, setSubProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [mappingGroups, setMappingGroups] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [newStep, setNewStep] = useState({
    step_name: '',
    step_type: 'transformation',
    entity_id: '',
    retry_attempts: 3,
    execution_mode: 'sequential',
    depends_on: []
  });

  useEffect(() => {
    fetchData();
  }, [workflowName]);

  const fetchData = async () => {
    try {
      const [transformationsData, groupsData, projectsData] = await Promise.all([
        axios.get('/api/transformations'),
        axios.get('/api/mapping-groups'),
        axios.get('/api/projects')
      ]);
      setTransformations(transformationsData.data.mappings || []);
      setMappingGroups(groupsData.data.groups || []);
      const allProjects = projectsData.data || [];
      setProjects(allProjects.filter(p => !p.parent_project_id));

      if (isEdit) {
        // Fetch workflow metadata to get project and subproject
        const workflowsData = await axios.get('/api/n-step-workflows');
        const workflows = workflowsData.data.workflows || [];
        const workflow = workflows.find(w => w.name === name);
        
        if (workflow) {
          setProjectId(workflow.project_id ?? '');
          setSubProjectId(workflow.sub_project_id ?? '');
          setDescription(workflow.description ?? '');
          
          // Fetch subprojects if project is set
          if (workflow.project_id) {
            await fetchSubProjects(workflow.project_id);
          }
        }
        
        // Fetch workflow steps
        const stepsData = await axios.get(`/api/workflow-steps?workflow_name=${encodeURIComponent(name)}`);
        const steps = stepsData.data.steps || [];
        const sortedSteps = steps.sort((a, b) => a.step_order - b.step_order);
        setSteps(sortedSteps);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    }
  };

  const fetchSubProjects = async (parentProjectId) => {
    if (!parentProjectId) {
      setSubProjects([]);
      return;
    }
    
    try {
      const response = await axios.get('/api/projects');
      const allProjects = response.data || [];
      const filteredSubProjects = allProjects.filter(p => p.parent_project_id === parseInt(parentProjectId));
      setSubProjects(filteredSubProjects);
    } catch (err) {
      console.error('Error fetching sub-projects:', err);
      setSubProjects([]);
    }
  };

  const handleProjectChange = async (newProjectId) => {
    setProjectId(newProjectId);
    setSubProjectId('');
    await fetchSubProjects(newProjectId);
  };

  const handleAddStep = async () => {
    if (!name || !newStep.step_name || !newStep.entity_id) {
      alert('Please fill in all required fields');
      return;
    }

    if (!isEdit && !projectId) {
      alert('Please select a project');
      return;
    }

    try {
      setLoading(true);
      
      // Create workflow first if this is the first step
      if (!isEdit && steps.length === 0) {
        await axios.post('/api/n-step-workflows', {
          name: name,
          description: description,
          project_id: projectId,
          sub_project_id: subProjectId || null
        });
      }
      
      const response = await axios.post('/api/workflow-steps', {
        workflow_name: name,
        step_name: newStep.step_name,
        step_type: newStep.step_type,
        step_order: steps.length + 1,
        entity_id: newStep.entity_id,
        retry_attempts: newStep.retry_attempts,
        execution_mode: newStep.execution_mode,
        depends_on: newStep.depends_on.length > 0 ? newStep.depends_on : undefined
      });
      setSteps([...steps, response.data]);
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

  const handleDeleteStep = async (stepId) => {
    try {
      await axios.delete(`/api/workflow-steps/${stepId}`);
      setSteps(steps.filter(s => s.step_id !== stepId));
    } catch (err) {
      console.error('Error deleting step:', err);
      setError('Failed to delete step');
    }
  };

  const toggleDependency = (stepId) => {
    setNewStep(prev => ({
      ...prev,
      depends_on: prev.depends_on.includes(stepId)
        ? prev.depends_on.filter(id => id !== stepId)
        : [...prev.depends_on, stepId]
    }));
  };

  const getEntityOptions = () => {
    if (newStep.step_type === 'transformation') {
      return transformations.map(t => ({ id: t.mapping_id, name: t.mapping_name }));
    } else {
      return mappingGroups.map(g => ({ id: g.id, name: g.name }));
    }
  };

  return (
    <PageTransition>
      <div className="workflow-form-page">
        <PageHeader
          title={isEdit ? `Edit Workflow: ${name}` : 'Create New Workflow'}
          subtitle={isEdit ? 'Update workflow configuration' : 'Configure a new multi-step workflow'}
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <div className="form-container">
          <div className="form-group">
            <label htmlFor="project-select">Project *</label>
            <select
              id="project-select"
              value={projectId}
              onChange={e => handleProjectChange(e.target.value)}
              required
              disabled={isEdit}
              className="form-input"
            >
              <option value="">Select a project...</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {isEdit && (
              <small style={{ display: 'block', marginTop: '0.25rem', color: '#64748b' }}>
                Project cannot be changed after creation
              </small>
            )}
          </div>

          {projectId && (
            <div className="form-group">
              <label htmlFor="sub-project-select">Sub-Project (Optional)</label>
              <select
                id="sub-project-select"
                value={subProjectId}
                onChange={e => setSubProjectId(e.target.value)}
                disabled={isEdit}
                className="form-input"
              >
                <option value="">None (Parent Project Level)</option>
                {subProjects.map(subProject => (
                  <option key={subProject.id} value={subProject.id}>
                    {subProject.name}
                  </option>
                ))}
              </select>
              {isEdit && (
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#64748b' }}>
                  Sub-project cannot be changed after creation
                </small>
              )}
            </div>
          )}

          {!isEdit && (
            <>
              <div className="form-group">
                <label htmlFor="workflow-name-input">Workflow Name *</label>
                <input
                  id="workflow-name-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="workflow-description-textarea">Description (Optional)</label>
                <textarea
                  id="workflow-description-textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="form-input"
                />
              </div>
            </>
          )}

          <div className="workflow-steps-section">
            <h3>Workflow Steps ({steps.length})</h3>
            
            {steps.length > 0 && (
              <div className="steps-list">
                {steps.map((step, idx) => (
                  <div key={step.step_id} className="step-card">
                    <div className="step-info">
                      <strong>{idx + 1}. {step.step_name}</strong>
                      <div className="step-meta">
                        Type: {step.step_type} | Mode: {step.execution_mode} | Retries: {step.retry_attempts}
                        {step.depends_on && step.depends_on.length > 0 && (
                          <span> | Depends on: {step.depends_on.length} step(s)</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteStep(step.step_id)}
                      className="btn btn-danger btn-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="add-step-form">
              <h4><FiPlus /> Add New Step</h4>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="step-name-input">Step Name *</label>
                  <input
                    id="step-name-input"
                    type="text"
                    value={newStep.step_name}
                    onChange={e => setNewStep({ ...newStep, step_name: e.target.value })}
                    className="form-input"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="step-type-select">Step Type *</label>
                  <select
                    id="step-type-select"
                    value={newStep.step_type}
                    onChange={e => setNewStep({ ...newStep, step_type: e.target.value, entity_id: '' })}
                    className="form-select"
                  >
                    <option value="transformation">Transformation</option>
                    <option value="mapping_group">Mapping Group</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="entity-select">{newStep.step_type === 'transformation' ? 'Transformation' : 'Mapping Group'} *</label>
                  <select
                    id="entity-select"
                    value={newStep.entity_id}
                    onChange={e => setNewStep({ ...newStep, entity_id: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select...</option>
                    {getEntityOptions().map(option => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="execution-mode-select">Execution Mode</label>
                  <select
                    id="execution-mode-select"
                    value={newStep.execution_mode}
                    onChange={e => setNewStep({ ...newStep, execution_mode: e.target.value })}
                    className="form-select"
                  >
                    <option value="sequential">Sequential</option>
                    <option value="parallel">Parallel</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="retry-attempts-input">Retry Attempts</label>
                  <input
                    id="retry-attempts-input"
                    type="number"
                    min="0"
                    max="10"
                    value={newStep.retry_attempts}
                    onChange={e => setNewStep({ ...newStep, retry_attempts: parseInt(e.target.value) })}
                    className="form-input"
                  />
                </div>
              </div>

              {steps.length > 0 && (
                <fieldset className="form-group">
                  <legend>Dependencies (optional)</legend>
                  <div className="dependency-chips">
                    {steps.map((step, idx) => (
                      <label
                        key={step.step_id}
                        className={`chip ${newStep.depends_on.includes(step.step_id) ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={newStep.depends_on.includes(step.step_id)}
                          onChange={() => toggleDependency(step.step_id)}
                        />
                        Step {idx + 1}: {step.step_name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <button
                type="button"
                onClick={handleAddStep}
                disabled={loading || !newStep.step_name || !newStep.entity_id}
                className="btn btn-primary"
              >
                {loading ? 'Adding...' : 'Add Step'}
              </button>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/workflows')}
              className="btn btn-primary"
            >
              <FiSave /> {steps.length > 0 ? 'Done' : 'Back to Workflows'}
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default WorkflowForm;
