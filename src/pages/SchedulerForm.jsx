import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { FiSave, FiX, FiCalendar, FiClock, FiFolder, FiLayers } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';
import '../styles/global-page-styles.css';

const SchedulerForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scheduleId } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!scheduleId && scheduleId !== 'create';

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
      // API returns { success: true, subProjects: [...] }
      const subs = response.data?.subProjects || response.data || [];
      setSubProjects(Array.isArray(subs) ? subs : []);
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
        nStepWorkflows: nStepWorkflows.length,
        visualWorkflows: visualWorkflows.length,
        totalWorkflows: allWorkflows.length,
        projects: projects.length
      });
      
      setTransformations(mappings);
      setWorkflows(allWorkflows);
      setProjects(projects);
      
      if (mappings.length === 0 && allWorkflows.length === 0) {
        setError('No entities available. Please create a transformation or workflow first.');
      }
      
      return {
        mappings,
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
    const selectedProjectId = formData.project_id ? parseInt(formData.project_id, 10) : null;
    const selectedSubProjectId = formData.sub_project_id ? parseInt(formData.sub_project_id, 10) : null;
    
    switch (formData.entity_type) {
      case 'mapping':
        // Filter by project and subproject, then deduplicate by mapping_name
        const seen = new Set();
        return transformations
          .filter(t => {
            // Filter by project if selected
            if (selectedProjectId && t.project_id !== selectedProjectId) return false;
            // Filter by subproject if selected
            if (selectedSubProjectId && t.sub_project_id !== selectedSubProjectId) return false;
            // Deduplicate by mapping_name
            if (seen.has(t.mapping_name)) return false;
            seen.add(t.mapping_name);
            return true;
          })
          .map(t => ({ id: t.mapping_id, name: t.mapping_name }));
      case 'workflow':
        // Filter by project and subproject, then deduplicate by name
        const seenWorkflows = new Set();
        return workflows
          .filter(w => {
            // Filter by project if selected
            if (selectedProjectId && w.project_id !== selectedProjectId) return false;
            // Filter by subproject if selected
            if (selectedSubProjectId && w.sub_project_id !== selectedSubProjectId) return false;
            // Deduplicate by name
            if (seenWorkflows.has(w.name)) return false;
            seenWorkflows.add(w.name);
            return true;
          })
          .map(w => ({ id: w.id, name: w.name }));
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
      <div className="gps-page-container">
        <div className="gps-page-header">
          <div className="gps-page-header-left">
            <h1 className="gps-page-title">{isEdit ? 'Edit Schedule' : 'Create New Schedule'}</h1>
            <p className="gps-page-subtitle">{isEdit ? 'Update schedule configuration' : 'Configure a new automated schedule for your data pipelines'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Section 1: Schedule Basics */}
          <div className="gps-form-section">
            <div className="gps-form-section__header">
              <h3 className="gps-form-section__title"><FiFolder style={{ marginRight: '8px', verticalAlign: 'middle' }} />Schedule Basics</h3>
              <p className="gps-form-section__subtitle">Select the project and entity you want to schedule</p>
            </div>

            <div className="gps-grid--2col">
              <div className="gps-form-group">
                <label htmlFor="project-select" className="gps-form-label">Project</label>
                <select
                  id="project-select"
                  value={formData.project_id}
                  onChange={e => setFormData({ ...formData, project_id: e.target.value, sub_project_id: '', entity_id: '' })}
                  className="gps-select"
                >
                  <option value="">Select project...</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <small className="gps-form-help">Auto-populated when you select an entity</small>
              </div>

              <div className="gps-form-group">
                <label htmlFor="subproject-select" className="gps-form-label">Subproject</label>
                <select
                  id="subproject-select"
                  value={formData.sub_project_id}
                  onChange={e => setFormData({ ...formData, sub_project_id: e.target.value, entity_id: '' })}
                  className="gps-select"
                  disabled={!formData.project_id || subProjects.length === 0}
                >
                  <option value="">None (use main project)</option>
                  {subProjects.map(subProject => (
                    <option key={subProject.id} value={subProject.id}>
                      {subProject.name}
                    </option>
                  ))}
                </select>
                <small className="gps-form-help">Optional organizational grouping</small>
              </div>
            </div>

            <div className="gps-divider"></div>

            <div className="gps-grid--2col">
              <div className="gps-form-group">
                <label htmlFor="entity-type" className="gps-form-label">Entity Type</label>
                <div className="gps-segmented">
                  <button
                    type="button"
                    className={`gps-segmented__btn ${formData.entity_type === 'mapping' ? 'gps-segmented__btn--active' : ''}`}
                    onClick={() => setFormData({ ...formData, entity_type: 'mapping', entity_id: '' })}
                  >
                    <FiLayers style={{ marginRight: '6px' }} />Transformation
                  </button>
                  <button
                    type="button"
                    className={`gps-segmented__btn ${formData.entity_type === 'workflow' ? 'gps-segmented__btn--active' : ''}`}
                    onClick={() => setFormData({ ...formData, entity_type: 'workflow', entity_id: '' })}
                  >
                    Workflow
                  </button>
                </div>
              </div>

              <div className="gps-form-group">
                <label htmlFor="entity-select" className="gps-form-label">Select {formData.entity_type.replace('_', ' ')} *</label>
                <select
                  id="entity-select"
                  value={formData.entity_id}
                  onChange={e => {
                    const value = e.target.value;
                    let projectId = '';
                    let subProjectId = '';
                    if (value) {
                      if (formData.entity_type === 'mapping') {
                        const mapping = transformations.find(t => String(t.mapping_id) === String(value));
                        projectId = mapping?.project_id || '';
                        subProjectId = mapping?.sub_project_id || '';
                      } else if (formData.entity_type === 'workflow') {
                        const workflow = workflows.find(w => String(w.id) === String(value));
                        projectId = workflow?.project_id || '';
                        subProjectId = workflow?.sub_project_id || '';
                      }
                    }
                    setFormData({ ...formData, entity_id: value, project_id: projectId, sub_project_id: subProjectId });
                  }}
                  required
                  className="gps-select"
                >
                  <option value="">Select {formData.entity_type.replace('_', ' ')}...</option>
                  {getEntityOptions().map(option => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Timing & Activation */}
          <div className="gps-form-section">
            <div className="gps-form-section__header">
              <h3 className="gps-form-section__title"><FiClock style={{ marginRight: '8px', verticalAlign: 'middle' }} />Timing & Activation</h3>
              <p className="gps-form-section__subtitle">Define when and how often the schedule should run</p>
            </div>

            <div className="gps-form-group">
              <label className="gps-form-label">Schedule Type</label>
              <div className="gps-segmented">
                <button
                  type="button"
                  className={`gps-segmented__btn ${formData.schedule_type === 'cron' ? 'gps-segmented__btn--active' : ''}`}
                  onClick={() => setFormData({ ...formData, schedule_type: 'cron' })}
                >
                  <FiCalendar style={{ marginRight: '6px' }} />Cron Expression
                </button>
                <button
                  type="button"
                  className={`gps-segmented__btn ${formData.schedule_type === 'interval' ? 'gps-segmented__btn--active' : ''}`}
                  onClick={() => setFormData({ ...formData, schedule_type: 'interval' })}
                >
                  <FiClock style={{ marginRight: '6px' }} />Interval
                </button>
              </div>
            </div>

            <div className="gps-divider"></div>

            {formData.schedule_type === 'cron' ? (
              <div className="gps-form-group">
                <label htmlFor="cron-expression" className="gps-form-label">Cron Expression *</label>
                <input
                  id="cron-expression"
                  type="text"
                  value={formData.cron_expression}
                  onChange={e => setFormData({ ...formData, cron_expression: e.target.value })}
                  placeholder="0 0 * * *"
                  required
                  className="gps-form-input"
                  style={{ maxWidth: '300px' }}
                />
                <small className="gps-form-help">
                  Format: minute hour day month dayOfWeek (e.g., "0 0 * * *" = daily at midnight)
                </small>
                <div className="gps-chip-group">
                  <span style={{ fontSize: '12px', color: '#64748b', marginRight: '8px' }}>Quick presets:</span>
                  {cronPresets.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, cron_expression: preset.value })}
                      className={`gps-chip ${formData.cron_expression === preset.value ? 'gps-chip--active' : ''}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="gps-grid--2col">
                <div className="gps-form-group">
                  <label htmlFor="interval-value" className="gps-form-label">Interval Value *</label>
                  <input
                    id="interval-value"
                    type="number"
                    min="1"
                    value={formData.interval_value}
                    onChange={e => setFormData({ ...formData, interval_value: parseInt(e.target.value) })}
                    required
                    className="gps-form-input"
                  />
                </div>
                <div className="gps-form-group">
                  <label htmlFor="interval-unit" className="gps-form-label">Interval Unit *</label>
                  <select
                    id="interval-unit"
                    value={formData.interval_unit}
                    onChange={e => setFormData({ ...formData, interval_unit: e.target.value })}
                    required
                    className="gps-select"
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

            <div className="gps-divider"></div>

            <div className="gps-toggle-wrapper">
              <input
                id="schedule-enabled"
                type="checkbox"
                checked={formData.enabled}
                onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="schedule-enabled" className="gps-toggle-label" style={{ cursor: 'pointer' }}>
                Enable this schedule immediately after creation
              </label>
            </div>

            {error && (
              <div className="gps-alert gps-alert--danger" style={{ marginTop: '16px' }}>{error}</div>
            )}

            <div className="gps-form-card-footer">
              <button type="button" onClick={() => navigate('/etl-scheduler')} className="gps-btn gps-btn--ghost">
                <FiX style={{ marginRight: '6px' }} /> Cancel
              </button>
              <button type="submit" disabled={loading} className="gps-btn gps-btn--primary">
                <FiSave style={{ marginRight: '6px' }} /> {loading ? 'Saving...' : isEdit ? 'Update Schedule' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </PageTransition>
  );
};

export default SchedulerForm;
