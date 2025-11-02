import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiClock, FiEdit2, FiTrash2, FiPlusCircle, FiPower } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { PageTransition } from '../components/MicroAnimations';
import Modal from '../components/Modal';
import axios from 'axios';

const ETLScheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [deleteModal, setDeleteModal] = useState({ show: false, scheduleId: null });
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

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
      setNotification({
        show: true,
        message: `Schedule ${!currentEnabled ? 'enabled' : 'disabled'} successfully`,
        type: 'success'
      });
    } catch (err) {
      console.error('Error toggling schedule:', err);
      setNotification({
        show: true,
        message: 'Failed to toggle schedule',
        type: 'error'
      });
    }
  };

  const handleDeleteClick = (scheduleId) => {
    setDeleteModal({ show: true, scheduleId });
  };

  const handleDeleteConfirm = async () => {
    const scheduleId = deleteModal.scheduleId;
    setDeleteModal({ show: false, scheduleId: null });

    try {
      await axios.delete(`/api/schedules/${scheduleId}`);
      setSchedules(schedules.filter(s => s.schedule_id !== scheduleId));
      setNotification({
        show: true,
        message: 'Schedule deleted successfully',
        type: 'success'
      });
    } catch (err) {
      console.error('Error deleting schedule:', err);
      setNotification({
        show: true,
        message: 'Failed to delete schedule',
        type: 'error'
      });
    }
  };

  const formatSchedule = (schedule) => {
    if (schedule.schedule_type === 'cron') {
      return `Cron: ${schedule.cron_expression}`;
    } else {
      return `Every ${schedule.interval_value} ${schedule.interval_unit}${schedule.interval_value > 1 ? 's' : ''}`;
    }
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentSchedules = schedules.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(schedules.length / itemsPerPage);

  if (loading) {
    return <LoadingSpinner message="Loading schedules..." />;
  }

  return (
    <PageTransition>
      <div className="etl-scheduler-page">
        <PageHeader
          title="Job Schedules"
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
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>Next Run</th>
                    <th>Last Run</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSchedules.map(schedule => (
                    <tr key={schedule.schedule_id} className={!schedule.enabled ? 'disabled-row' : ''}>
                      <td>{schedule.project_name || 'Default Project'}</td>
                      <td>{schedule.entity_name || schedule.entity_id}</td>
                      <td>
                        <span className="entity-type-badge">{schedule.entity_type}</span>
                      </td>
                      <td>{formatSchedule(schedule)}</td>
                      <td>
                        <span className={`status-badge ${schedule.enabled ? 'active' : 'inactive'}`}>
                          {schedule.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : '-'}
                      </td>
                      <td>
                        {schedule.last_run ? new Date(schedule.last_run).toLocaleString() : '-'}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => handleToggle(schedule.schedule_id, schedule.enabled)}
                            className={`action-icon-btn ${schedule.enabled ? 'toggle-btn-warning' : 'toggle-btn-success'}`}
                            title={schedule.enabled ? 'Disable' : 'Enable'}
                          >
                            <FiPower />
                          </button>
                          <Link 
                            to={`/etl-scheduler/${schedule.schedule_id}/edit`} 
                            className="action-icon-btn edit-btn"
                            title="Edit"
                          >
                            <FiEdit2 />
                          </Link>
                          <button 
                            onClick={() => handleDeleteClick(schedule.schedule_id)} 
                            className="action-icon-btn delete-btn"
                            title="Delete"
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
            
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={schedules.length}
            />
          </>
        )}

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={deleteModal.show}
          onClose={() => setDeleteModal({ show: false, scheduleId: null })}
          title="Confirm Delete"
          size="small"
        >
          <p style={{ margin: '0 0 1rem 0' }}>Are you sure you want to delete this schedule?</p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              onClick={() => setDeleteModal({ show: false, scheduleId: null })} 
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button 
              onClick={handleDeleteConfirm} 
              className="btn btn-danger"
            >
              Delete
            </button>
          </div>
        </Modal>

        {/* Notification Modal */}
        <Modal
          isOpen={notification.show}
          onClose={() => setNotification({ show: false, message: '', type: '' })}
          title={notification.type === 'success' ? 'Success' : 'Error'}
          size="small"
        >
          <p style={{ margin: '0 0 1rem 0' }}>{notification.message}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={() => setNotification({ show: false, message: '', type: '' })} 
              className="btn btn-primary"
            >
              OK
            </button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
};

export default ETLScheduler;
