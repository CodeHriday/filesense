import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiSave, FiX } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const SchedulerForm = () => {
  const navigate = useNavigate();
  const { scheduleId } = useParams();
  const isEdit = !!scheduleId;

  const [formData, setFormData] = useState({
    entity_type: 'transformation',
    entity_id: '',
    schedule_type: 'cron',
    cron_expression: '0 0 * * *',
    interval_value: 1,
    interval_unit: 'hour',
    enabled: true
  });

  const [transformations, setTransformations] = useState([]);
  const [mappingGroups, setMappingGroups] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    if (isEdit) {
      fetchSchedule();
    }
  }, [scheduleId]);

  const fetchData = async () => {
    try {
      const [transformationsData, groupsData, workflowsData] = await Promise.all([
        axios.get('/api/transformations'),
        axios.get('/api/mapping-groups'),
        axios.get('/api/n-step-workflows')
      ]);
      setTransformations(transformationsData.data.mappings || []);
      setMappingGroups(groupsData.data.groups || []);
      setWorkflows(workflowsData.data.workflows || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const fetchSchedule = async () => {
    try {
      const response = await axios.get(`/api/schedules/${scheduleId}`);
      setFormData({
        entity_type: response.data.entity_type,
        entity_id: response.data.entity_id,
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

      if (isEdit) {
        await axios.put(`/api/schedules/${scheduleId}`, submitData);
      } else {
        await axios.post('/api/schedules', submitData);
      }
      navigate('/etl-scheduler');
    } catch (err) {
      console.error('Error saving schedule:', err);
      setError('Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const getEntityOptions = () => {
    switch (formData.entity_type) {
      case 'transformation':
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
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <div className="form-container">
          <form onSubmit={handleSubmit} className="data-form">
            <div className="form-group">
              <label>Entity Type *</label>
              <select
                value={formData.entity_type}
                onChange={e => setFormData({ ...formData, entity_type: e.target.value, entity_id: '' })}
                className="form-select"
              >
                <option value="transformation">Transformation</option>
                <option value="mapping_group">Mapping Group</option>
                <option value="workflow">Workflow</option>
              </select>
            </div>

            <div className="form-group">
              <label>Select {formData.entity_type.replace('_', ' ')} *</label>
              <select
                value={formData.entity_id}
                onChange={e => setFormData({ ...formData, entity_id: e.target.value })}
                required
                className="form-select"
              >
                <option value="">Select...</option>
                {getEntityOptions().map(option => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Schedule Type *</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    value="cron"
                    checked={formData.schedule_type === 'cron'}
                    onChange={e => setFormData({ ...formData, schedule_type: 'cron' })}
                  />
                  Cron Expression
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    value="interval"
                    checked={formData.schedule_type === 'interval'}
                    onChange={e => setFormData({ ...formData, schedule_type: 'interval' })}
                  />
                  Interval
                </label>
              </div>
            </div>

            {formData.schedule_type === 'cron' ? (
              <div className="form-group">
                <label>Cron Expression *</label>
                <input
                  type="text"
                  value={formData.cron_expression}
                  onChange={e => setFormData({ ...formData, cron_expression: e.target.value })}
                  placeholder="0 0 * * *"
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
                  <label>Interval Value *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.interval_value}
                    onChange={e => setFormData({ ...formData, interval_value: parseInt(e.target.value) })}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Interval Unit *</label>
                  <select
                    value={formData.interval_unit}
                    onChange={e => setFormData({ ...formData, interval_unit: e.target.value })}
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
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

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
