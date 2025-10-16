import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import schedulerService, { CreateScheduleRequest } from '../../services/schedulerService';
import transformationService from '../../services/transformationService';
import mappingGroupService from '../../services/mappingGroupService';
import workflowService from '../../services/workflowService';
import { Transformation } from '../../../../shared/types/transformations';
import { MappingGroup } from '../../services/mappingGroupService';
import { THEME } from '../../config/config';

const SchedulerForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState<CreateScheduleRequest>({
    entity_type: 'transformation',
    entity_id: '',
    schedule_type: 'cron',
    cron_expression: '0 0 * * *',
    interval_value: 1,
    interval_unit: 'hour',
    enabled: true
  });

  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [mappingGroups, setMappingGroups] = useState<MappingGroup[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    if (isEdit && id) {
      fetchSchedule(id);
    }
  }, [id, isEdit]);

  const fetchData = async () => {
    try {
      const [transformationsData, groupsData, workflowsData] = await Promise.all([
        transformationService.getAllTransformations(),
        mappingGroupService.getAllMappingGroups(),
        workflowService.getAllWorkflows()
      ]);
      setTransformations(transformationsData);
      setMappingGroups(groupsData);
      setWorkflows(workflowsData);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const fetchSchedule = async (scheduleId: string) => {
    try {
      const schedule = await schedulerService.getScheduleById(scheduleId);
      setFormData({
        entity_type: schedule.entity_type,
        entity_id: schedule.entity_id,
        schedule_type: schedule.schedule_type,
        cron_expression: schedule.cron_expression || '0 0 * * *',
        interval_value: schedule.interval_value || 1,
        interval_unit: schedule.interval_unit || 'hour',
        enabled: schedule.enabled
      });
    } catch (err) {
      console.error('Error fetching schedule:', err);
      setError('Failed to load schedule');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

      if (isEdit && id) {
        await schedulerService.updateSchedule(id, submitData);
      } else {
        await schedulerService.createSchedule(submitData);
      }
      navigate('/scheduler');
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
        return transformations.map(t => ({ id: t.id, name: t.mapping_name }));
      case 'mapping_group':
        return mappingGroups.map(g => ({ id: g.group_id, name: g.group_name }));
      case 'workflow':
        return workflows.map(w => ({ id: w, name: w }));
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

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: THEME.colors.secondary, marginBottom: '20px' }}>
        {isEdit ? 'Edit Schedule' : 'Create New Schedule'}
      </h2>

      {error && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Entity Type *
          </label>
          <select
            value={formData.entity_type}
            onChange={e => setFormData({ ...formData, entity_type: e.target.value as any, entity_id: '' })}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px'
            }}
          >
            <option value="transformation">Transformation</option>
            <option value="mapping_group">Mapping Group</option>
            <option value="workflow">Workflow</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Select {formData.entity_type.replace('_', ' ')} *
          </label>
          <select
            value={formData.entity_id}
            onChange={e => setFormData({ ...formData, entity_id: e.target.value })}
            required
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #e0e0e0',
              borderRadius: '4px'
            }}
          >
            <option value="">Select...</option>
            {getEntityOptions().map(option => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Schedule Type *
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="radio"
                value="cron"
                checked={formData.schedule_type === 'cron'}
                onChange={e => setFormData({ ...formData, schedule_type: 'cron' })}
                style={{ marginRight: '6px' }}
              />
              Cron Expression
            </label>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="radio"
                value="interval"
                checked={formData.schedule_type === 'interval'}
                onChange={e => setFormData({ ...formData, schedule_type: 'interval' })}
                style={{ marginRight: '6px' }}
              />
              Interval
            </label>
          </div>
        </div>

        {formData.schedule_type === 'cron' ? (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Cron Expression *
            </label>
            <input
              type="text"
              value={formData.cron_expression}
              onChange={e => setFormData({ ...formData, cron_expression: e.target.value })}
              placeholder="0 0 * * *"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            />
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
              Format: minute hour day month dayOfWeek (e.g., "0 0 * * *" = daily at midnight)
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {cronPresets.map(preset => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, cron_expression: preset.value })}
                  style={{
                    backgroundColor: '#f0f0f0',
                    border: '1px solid #d9d9d9',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Interval *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="number"
                min="1"
                value={formData.interval_value}
                onChange={e => setFormData({ ...formData, interval_value: parseInt(e.target.value) })}
                style={{
                  flex: '0 0 100px',
                  padding: '8px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px'
                }}
              />
              <select
                value={formData.interval_unit}
                onChange={e => setFormData({ ...formData, interval_unit: e.target.value as any })}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px'
                }}
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

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
              style={{ marginRight: '8px' }}
            />
            <span style={{ fontWeight: 'bold' }}>Enabled</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: THEME.colors.primary,
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Saving...' : isEdit ? 'Update Schedule' : 'Create Schedule'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/scheduler')}
            style={{
              backgroundColor: '#f0f0f0',
              color: '#333',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default SchedulerForm;
