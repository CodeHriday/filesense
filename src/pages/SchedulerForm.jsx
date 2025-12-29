import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { FiSave, FiX } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const SchedulerForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scheduleId } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!scheduleId;

  // Get query params for pre-selection
  const preSelectedType = searchParams.get('type');
  const preSelectedId = searchParams.get('id');

  // Get location state for pre-population from workflow builder
  const workflowContext = location.state || {};

  const [formData, setFormData] = useState({
    entity_type: workflowContext.entityType || preSelectedType || 'mapping',
    entity_id: workflowContext.entityId || preSelectedId || '',
    project_id: workflowContext.projectId || '',
    sub_project_id: workflowContext.subProjectId || '',
    schedule_type: 'cron',
    cron_expression: '0 0 * * *',
    interval_value: 1,
    interval_unit: 'hour',
    enabled: true
  });

  const [transformations, setTransformations] = useState([]);
  const [mappingGroups, setMappingGroups] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const entityData = await fetchData();
      if (isEdit && entityData) {
        await fetchSchedule(entityData);
      }
    };
    loadData();
  }, [scheduleId]);

  // Load subprojects when project changes
  useEffect(() => {
    if (formData.project_id) {
      loadSubProjects(formData.project_id);
    } else {
      setSubProjects([]);
      setFormData(prev => ({ ...prev, sub_project_id: '' }));
    }
  }, [formData.project_id]);

  const loadSubProjects = async (projectId) => {
    try {
      const response = await axios.get(`/api/projects/${projectId}/sub-projects`);
      setSubProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to load subprojects:', err);
      setSubProjects([]);
    }
  };

  const fetchData = async () => {
    try {
      const response = await axios.get('/api/schedules/init-data');
      const data = response.data;
      
      const mappings = data.transformations || [];
      const groups = data.mappingGroups || [];
      const nStepWorkflows = data.nStepWorkflows || [];
      const visualWorkflows = data.visualWorkflows || [];
      const projects = data.projects || [];
      
      const allWorkflows = [
        ...nStepWorkflows,
        ...visualWorkflows.map(vw => ({
          id: vw.id,
          name: vw.name,
          project_id: vw.project_id,
          sub_project_id: vw.sub_project_id,
          isVisualWorkflow: true
        }))
      ];
      
      console.log('Scheduler Form - Data loaded:', {
        transformations: mappings.length,
        mappingGroups: groups.length,
        nStepWorkflows: nStepWorkflows.length,
        visualWorkflows: visualWorkflows.length,
        totalWorkflows: allWorkflows.length,
        projects: projects.length
      });
      
      setTransformations(mappings);
      setMappingGroups(groups);
      setWorkflows(allWorkflows);
      setProjects(projects);
      
      if (mappings.length === 0 && groups.length === 0 && allWorkflows.length === 0) {
        setError('No entities available. Please create a transformation, mapping group, or workflow first.');
      }
      
      return {
        mappings,
        groups,
        workflows: allWorkflows,
        projects
      };
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(`Failed to load data: ${err.response?.data?.error || err.message}`);
      return null;
    }
  };

  const fetchSchedule = async (entityData) => {
    try {
      const response = await axios.get(`/api/schedules/${scheduleId}`);
      
      // Auto-populate project_id and sub_project_id from the entity if not set
      let projectId = response.data.project_id || '';
      let subProjectId = response.data.sub_project_id || '';
      
      // If project_id is missing, derive it from the entity using the provided entityData
      if (!projectId && response.data.entity_id && response.data.entity_type && entityData) {
        if (response.data.entity_type === 'mapping') {
          const mapping = entityData.mappings.find(t => String(t.mapping_id) === String(response.data.entity_id));
          projectId = mapping?.project_id || '';
          subProjectId = mapping?.sub_project_id || '';
        } else if (response.data.entity_type === 'mapping_group') {
          const group = entityData.groups.find(g => String(g.id) === String(response.data.entity_id));
          projectId = group?.project_id || '';
          subProjectId = group?.sub_project_id || '';
        } else if (response.data.entity_type === 'workflow') {
          const workflow = entityData.workflows.find(w => String(w.id) === String(response.data.entity_id));
          projectId = workflow?.project_id || '';
          subProjectId = workflow?.sub_project_id || '';
        }
      }
      
      setFormData({
        entity_type: response.data.entity_type,
        entity_id: response.data.entity_id,
        project_id: projectId,
        sub_project_id: subProjectId,
        schedule_type: response.data.schedule_type,
        cron_expression: response.data.cron_expression || '0 0 * * *',
        interval_value: response.data.interval_value || 1,
        interval_unit: response.data.interval_unit || 'hour',
        enabled: response.data.enabled
      });
    } catch (err) {
      console.error('Error fetching schedule:', err);
      setError('Failed to load schedule');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('Scheduler Form - Submit attempted:', {
      formData,
      entity_type: formData.entity_type,
      entity_id: formData.entity_id,
      schedule_type: formData.schedule_type
    });
    
    // Validate entity_id is selected
    if (!formData.entity_id) {
      setError('Please select an entity to schedule');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const submitData = { ...formData };
      if (formData.schedule_type === 'cron') {
        delete submitData.interval_value;
        delete submitData.interval_unit;
      } else {
        delete submitData.cron_expression;
      }

      console.log('Scheduler Form - Sending data:', submitData);

      if (isEdit) {
        const response = await axios.put(`/api/schedules/${scheduleId}`, submitData);
        console.log('Scheduler Form - Update response:', response.data);
      } else {
        const response = await axios.post('/api/schedules', submitData);
        console.log('Scheduler Form - Create response:', response.data);
      }
      navigate('/etl-scheduler');
    } catch (err) {
      console.error('Error saving schedule:', err);
      console.error('Error response:', err.response);
      console.error('Error response data:', err.response?.data);
      console.error('Error config:', err.config);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save schedule';
      setError(`${errorMessage} (Details in console)`);
    } finally {
      setLoading(false);
    }
  };

  const getEntityOptions = () => {
    switch (formData.entity_type) {
      case 'mapping':
        return transformations.map(t => ({ id: t.mapping_id, name: t.mapping_name }));
      case 'mapping_group':
        return mappingGroups.map(g => ({ id: g.id, name: g.name }));
      case 'workflow':
        return workflows.map(w => ({ id: w.id, name: w.name }));
      default:
        return [];
    }
  };

  const cronPresets = [
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Every week on Monday', value: '0 0 * * 1' },
    { label: 'Every month on 1st', value: '0 0 1 * *' }
  ];

  if (loading && isEdit && !formData.entity_id) {
    return <LoadingSpinner message="Loading schedule..." />;
  }

  return (
    <PageTransition>
      <div className="scheduler-form-page">
        <PageHeader
          title={isEdit ? 'Edit Schedule' : 'Create New Schedule'}
          subtitle={isEdit ? 'Update schedule configuration' : 'Configure a new automated schedule'}
          hideHomeButton={true}
        />

        <div className="form-container">
          <form onSubmit={handleSubmit} className="data-form">
            {/* Row 1: Project and Subproject */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="project-select">Project *</label>
                <select
                  id="project-select"
                  value={formData.project_id}
                  onChange={e => setFormData({ ...formData, project_id: e.target.value })}
                  required
                  className="form-select"
                >
                  <option value="">Select project...</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  Project is auto-populated from the selected entity
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="subproject-select">Subproject</label>
                <select
                  id="subproject-select"
                  value={formData.sub_project_id}
                  onChange={e => setFormData({ ...formData, sub_project_id: e.target.value })}
                  className="form-select"
                  disabled={!formData.project_id || subProjects.length === 0}
                >
                  <option value="">None (use main project)</option>
                  {subProjects.map(subProject => (
                    <option key={subProject.id} value={subProject.id}>
                      {subProject.name}
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  Optional: select a subproject for this schedule
                </small>
              </div>
            </div>

            {/* Row 2: Entity Type */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="entity-type">Entity Type *</label>
                <select
                  id="entity-type"
                  value={formData.entity_type}
                  onChange={e => setFormData({ ...formData, entity_type: e.target.value, entity_id: '' })}
                  className="form-select"
                >
                  <option value="mapping">Transformation</option>
                  <option value="mapping_group">Mapping Group</option>
                  <option value="workflow">Workflow</option>
                </select>
              </div>
            </div>

            {/* Row 3: Select Entity and Schedule Type */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="entity-select">Select {formData.entity_type.replace('_', ' ')} *</label>
                <select
                  id="entity-select"
                  value={formData.entity_id}
                  onChange={e => {
                    const value = e.target.value;
                    console.log('Entity selected:', { value, type: typeof value, entityOptions: getEntityOptions() });
                    
                    // Auto-populate project_id and sub_project_id based on selected entity
                    let projectId = '';
                    let subProjectId = '';
                    if (value) {
                      if (formData.entity_type === 'mapping') {
                        const mapping = transformations.find(t => String(t.mapping_id) === String(value));
                        projectId = mapping?.project_id || '';
                        subProjectId = mapping?.sub_project_id || '';
                      } else if (formData.entity_type === 'mapping_group') {
                        const group = mappingGroups.find(g => String(g.id) === String(value));
                        projectId = group?.project_id || '';
                        subProjectId = group?.sub_project_id || '';
                      } else if (formData.entity_type === 'workflow') {
                        const workflow = workflows.find(w => String(w.id) === String(value));
                        projectId = workflow?.project_id || '';
                        subProjectId = workflow?.sub_project_id || '';
                      }
                    }
                    
                    setFormData({ ...formData, entity_id: value, project_id: projectId, sub_project_id: subProjectId });
                  }}
                  required
                  className="form-select"
                >
                  <option value="">Select...</option>
                  {getEntityOptions().map(option => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
                {formData.entity_id && (
                  <small className="form-text text-muted">
                    Selected ID: {formData.entity_id}
                  </small>
                )}
              </div>

              <div className="form-group" style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '4px' }}>
                <label htmlFor="schedule-type-cron">Schedule Type *</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      id="schedule-type-cron"
                      type="radio"
                      value="cron"
                      checked={formData.schedule_type === 'cron'}
                      onChange={e => setFormData({ ...formData, schedule_type: 'cron' })}
                    />
                    Cron Expression
                  </label>
                  <label className="radio-label">
                    <input
                      id="schedule-type-interval"
                      type="radio"
                      value="interval"
                      checked={formData.schedule_type === 'interval'}
                      onChange={e => setFormData({ ...formData, schedule_type: 'interval' })}
                    />
                    Interval
                  </label>
                </div>
              </div>
            </div>

            {formData.schedule_type === 'cron' ? (
              <div className="form-group">
                <label htmlFor="cron-expression">Cron Expression *</label>
                <input
                  id="cron-expression"
                  type="text"
                  value={formData.cron_expression}
                  onChange={e => setFormData({ ...formData, cron_expression: e.target.value })}
                  placeholder="0 0 * * *"
                  required
                  className="form-input"
                />
                <small className="form-help">
                  Format: minute hour day month dayOfWeek (e.g., "0 0 * * *" = daily at midnight)
                </small>
                <div className="cron-presets">
                  {cronPresets.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, cron_expression: preset.value })}
                      className="btn btn-secondary btn-sm"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="interval-value">Interval Value *</label>
                  <input
                    id="interval-value"
                    type="number"
                    min="1"
                    value={formData.interval_value}
                    onChange={e => setFormData({ ...formData, interval_value: parseInt(e.target.value) })}
                    required
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="interval-unit">Interval Unit *</label>
                  <select
                    id="interval-unit"
                    value={formData.interval_unit}
                    onChange={e => setFormData({ ...formData, interval_unit: e.target.value })}
                    required
                    className="form-select"
                  >
                    <option value="minute">Minute(s)</option>
                    <option value="hour">Hour(s)</option>
                    <option value="day">Day(s)</option>
                    <option value="week">Week(s)</option>
                    <option value="month">Month(s)</option>
                    <option value="year">Year(s)</option>
                  </select>
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="schedule-enabled" className="checkbox-label">
                <input
                  id="schedule-enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            {error && (
              <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{error}</div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={loading} className="btn btn-primary">
                <FiSave /> {loading ? 'Saving...' : isEdit ? 'Update Schedule' : 'Create Schedule'}
              </button>
              <button type="button" onClick={() => navigate('/etl-scheduler')} className="btn btn-secondary">
                <FiX /> Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageTransition>
  );
};

export default SchedulerForm;
