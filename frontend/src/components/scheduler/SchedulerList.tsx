import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import schedulerService, { Schedule } from '../../services/schedulerService';
import { THEME } from '../../config/config';

const SchedulerList: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = await schedulerService.getAllSchedules();
      setSchedules(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setError('Failed to load schedules. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (scheduleId: string, currentEnabled: boolean) => {
    try {
      await schedulerService.toggleSchedule(scheduleId, !currentEnabled);
      setSchedules(prevSchedules =>
        prevSchedules.map(s =>
          s.schedule_id === scheduleId ? { ...s, enabled: !currentEnabled } : s
        )
      );
    } catch (err) {
      console.error('Error toggling schedule:', err);
      setError('Failed to toggle schedule');
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await schedulerService.deleteSchedule(scheduleId);
      setSchedules(prevSchedules => prevSchedules.filter(s => s.schedule_id !== scheduleId));
    } catch (err) {
      console.error('Error deleting schedule:', err);
      setError('Failed to delete schedule');
    }
  };

  const formatSchedule = (schedule: Schedule) => {
    if (schedule.schedule_type === 'cron') {
      return `Cron: ${schedule.cron_expression}`;
    } else {
      return `Every ${schedule.interval_value} ${schedule.interval_unit}${schedule.interval_value! > 1 ? 's' : ''}`;
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading schedules...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: THEME.colors.secondary, margin: 0 }}>Schedules</h2>
        <Link
          to="/scheduler/new"
          style={{
            backgroundColor: THEME.colors.primary,
            color: THEME.colors.white,
            padding: '8px 16px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Create New Schedule
        </Link>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          No schedules found. Create one to get started!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {schedules.map(schedule => (
            <div
              key={schedule.schedule_id}
              style={{
                backgroundColor: THEME.colors.white,
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '20px',
                opacity: schedule.enabled ? 1 : 0.6
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, color: THEME.colors.secondary }}>
                      {schedule.entity_name || schedule.entity_id}
                    </h3>
                    <span
                      style={{
                        backgroundColor: schedule.enabled ? '#f6ffed' : '#f5f5f5',
                        color: schedule.enabled ? '#389e0d' : '#999',
                        border: `1px solid ${schedule.enabled ? '#b7eb8f' : '#d9d9d9'}`,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        textTransform: 'uppercase'
                      }}
                    >
                      {schedule.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                    <span>Project: {(schedule as any).project_name || 'Default Project'}</span>
                    <span>Type: {schedule.entity_type}</span>
                    <span>{formatSchedule(schedule)}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#888' }}>
                    {schedule.next_run && (
                      <div>Next run: {new Date(schedule.next_run).toLocaleString()}</div>
                    )}
                    {schedule.last_run && (
                      <div>Last run: {new Date(schedule.last_run).toLocaleString()}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleToggle(schedule.schedule_id, schedule.enabled)}
                    style={{
                      backgroundColor: schedule.enabled ? '#faad14' : '#52c41a',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {schedule.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <Link
                    to={`/scheduler/${schedule.schedule_id}/edit`}
                    style={{
                      backgroundColor: THEME.colors.primary,
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      display: 'inline-block'
                    }}
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(schedule.schedule_id)}
                    style={{
                      backgroundColor: '#ff4d4f',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchedulerList;
