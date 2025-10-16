import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiClock, FiEdit2, FiTrash2, FiPlusCircle, FiPower } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const ETLScheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/schedules');
      const data = response.data.schedules || response.data || [];
      setSchedules(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setError('Failed to load schedules');
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (scheduleId, currentEnabled) => {
    try {
      await axios.put(`/api/schedules/${scheduleId}`, { enabled: !currentEnabled });
      setSchedules(schedules.map(s =>
        s.schedule_id === scheduleId ? { ...s, enabled: !currentEnabled } : s
      ));
    } catch (err) {
      console.error('Error toggling schedule:', err);
      alert('Failed to toggle schedule');
    }
  };

  const handleDelete = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await axios.delete(`/api/schedules/${scheduleId}`);
      setSchedules(schedules.filter(s => s.schedule_id !== scheduleId));
    } catch (err) {
      console.error('Error deleting schedule:', err);
      alert('Failed to delete schedule');
    }
  };

  const formatSchedule = (schedule) => {
    if (schedule.schedule_type === 'cron') {
      return `Cron: ${schedule.cron_expression}`;
    } else {
      return `Every ${schedule.interval_value} ${schedule.interval_unit}${schedule.interval_value > 1 ? 's' : ''}`;
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading schedules..." />;
  }

  return (
    <PageTransition>
      <div className="etl-scheduler-page">
        <PageHeader
          title="ETL Scheduler"
          subtitle="Schedule transformations, mapping groups, and workflows"
        />

        <div style={{ marginBottom: '1.5rem' }}>
          <Link to="/etl-scheduler/create" className="btn btn-primary">
            <FiPlusCircle /> Create Schedule
          </Link>
        </div>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {schedules.length === 0 ? (
          <div className="empty-state">
            <p>No schedules found. Create one to get started!</p>
          </div>
        ) : (
          <div className="schedules-grid">
            {schedules.map(schedule => (
              <div
                key={schedule.schedule_id}
                className={`schedule-card ${!schedule.enabled ? 'disabled' : ''}`}
              >
                <div className="schedule-header">
                  <h3>{schedule.entity_name || schedule.entity_id}</h3>
                  <span className={`status-badge ${schedule.enabled ? 'active' : 'inactive'}`}>
                    {schedule.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="schedule-meta">
                  <span className="meta-item">Type: {schedule.entity_type}</span>
                  <span className="meta-item">{formatSchedule(schedule)}</span>
                </div>
                <div className="schedule-times">
                  {schedule.next_run && (
                    <div>Next run: {new Date(schedule.next_run).toLocaleString()}</div>
                  )}
                  {schedule.last_run && (
                    <div>Last run: {new Date(schedule.last_run).toLocaleString()}</div>
                  )}
                </div>
                <div className="schedule-actions">
                  <button
                    onClick={() => handleToggle(schedule.schedule_id, schedule.enabled)}
                    className={`btn btn-sm ${schedule.enabled ? 'btn-warning' : 'btn-success'}`}
                  >
                    <FiPower /> {schedule.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <Link to={`/etl-scheduler/${schedule.schedule_id}/edit`} className="btn btn-primary btn-sm">
                    <FiEdit2 /> Edit
                  </Link>
                  <button onClick={() => handleDelete(schedule.schedule_id)} className="btn btn-danger btn-sm">
                    <FiTrash2 /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default ETLScheduler;
