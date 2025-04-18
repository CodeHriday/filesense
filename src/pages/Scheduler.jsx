import React, { useState, useEffect } from 'react';
import { FiCalendar, FiClock, FiPlusCircle, FiEdit2, FiTrash2, FiPlay } from 'react-icons/fi';
import { PageTransition } from '../components/MicroAnimations';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { AnimatedButton } from '../components/MicroAnimations';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, runScheduleNow } from '../api/schedulerService';
import { useAuth } from '../context/AuthContext';
import '../components/styles/Scheduler.css';
import { formatRelativeTime } from '../utils/formatters';

const Scheduler = () => {
  const { hasWritePermission } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [filteredSchedules, setFilteredSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit', 'delete'
  const [formData, setFormData] = useState({
    file_id: '',
    frequency: 'daily',
    time: '12:00',
    day: 1,
    is_active: true
  });
  const [formErrors, setFormErrors] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [alertMessage, setAlertMessage] = useState(null);
  const [alertType, setAlertType] = useState('info'); // 'success', 'error', 'warning', 'info'

  // Load schedules on component mount
  useEffect(() => {
    fetchSchedules();
  }, []);

  // Filter schedules based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredSchedules(schedules);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = schedules.filter(schedule => {
        return (
          schedule.file_id.toLowerCase().includes(term) ||
          schedule.frequency.toLowerCase().includes(term)
        );
      });
      setFilteredSchedules(filtered);
    }
  }, [searchTerm, schedules]);

  // Fetch all schedules
  const fetchSchedules = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await getSchedules();
      setSchedules(data);
      setFilteredSchedules(data);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      setError('Failed to load schedules. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Show alert message
  const showAlert = (message, type = 'info', duration = 5000) => {
    setAlertMessage(message);
    setAlertType(type);
    
    if (duration > 0) {
      setTimeout(() => {
        setAlertMessage(null);
      }, duration);
    }
  };

  // Open modal for creating a new schedule
  const openCreateModal = () => {
    setCurrentSchedule(null);
    setFormData({
      file_id: '',
      frequency: 'daily',
      time: '12:00',
      day: 1,
      is_active: true
    });
    setFormErrors({});
    setModalMode('create');
    setModalOpen(true);
  };

  // Open modal for editing a schedule
  const openEditModal = (schedule) => {
    setCurrentSchedule(schedule);
    setFormData({
      file_id: schedule.file_id,
      frequency: schedule.frequency,
      time: schedule.time || '12:00',
      day: schedule.day || 1,
      is_active: schedule.is_active
    });
    setFormErrors({});
    setModalMode('edit');
    setModalOpen(true);
  };

  // Open modal for deleting a schedule
  const openDeleteModal = (schedule) => {
    setCurrentSchedule(schedule);
    setModalMode('delete');
    setModalOpen(true);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    
    // Clear error for this field if it exists
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: null
      });
    }
  };

  // Validate form data
  const validateForm = () => {
    const errors = {};
    
    if (!formData.file_id.trim()) {
      errors.file_id = 'File ID is required';
    }
    
    if (!formData.frequency) {
      errors.frequency = 'Frequency is required';
    }
    
    if (formData.frequency !== 'hourly' && !formData.time) {
      errors.time = 'Time is required for this frequency';
    }
    
    if (formData.frequency === 'weekly' && (formData.day < 0 || formData.day > 6)) {
      errors.day = 'Day must be between 0 (Sunday) and 6 (Saturday)';
    }
    
    if (formData.frequency === 'monthly' && (formData.day < 1 || formData.day > 31)) {
      errors.day = 'Day must be between 1 and 31';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setFormSubmitting(true);
    
    try {
      if (modalMode === 'create') {
        await createSchedule(formData);
        showAlert('Schedule created successfully', 'success');
      } else if (modalMode === 'edit') {
        await updateSchedule(currentSchedule.id, formData);
        showAlert('Schedule updated successfully', 'success');
      }
      
      setModalOpen(false);
      fetchSchedules();
    } catch (err) {
      console.error('Error submitting form:', err);
      showAlert('Failed to save schedule. Please try again.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle schedule deletion
  const handleDelete = async () => {
    if (!currentSchedule) return;
    
    setFormSubmitting(true);
    
    try {
      await deleteSchedule(currentSchedule.id);
      showAlert('Schedule deleted successfully', 'success');
      setModalOpen(false);
      fetchSchedules();
    } catch (err) {
      console.error('Error deleting schedule:', err);
      showAlert('Failed to delete schedule. Please try again.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle running a schedule now
  const handleRunNow = async (scheduleId) => {
    try {
      await runScheduleNow(scheduleId);
      showAlert('Schedule execution started', 'success');
      setTimeout(fetchSchedules, 1000); // Refresh after a short delay
    } catch (err) {
      console.error('Error running schedule:', err);
      showAlert('Failed to run schedule. Please try again.', 'error');
    }
  };

  // Render frequency in a human-readable format
  const renderFrequency = (schedule) => {
    const { frequency, time, day } = schedule;
    
    switch (frequency) {
      case 'hourly':
        return 'Every hour';
      case 'daily':
        return `Daily at ${time || '00:00'}`;
      case 'weekly':
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `Weekly on ${days[day || 0]} at ${time || '00:00'}`;
      case 'monthly':
        const dayStr = day || 1;
        const suffix = dayStr === 1 ? 'st' : dayStr === 2 ? 'nd' : dayStr === 3 ? 'rd' : 'th';
        return `Monthly on the ${dayStr}${suffix} at ${time || '00:00'}`;
      default:
        return frequency;
    }
  };

  // Render modal content based on mode
  const renderModalContent = () => {
    if (modalMode === 'delete') {
      return (
        <div className="delete-confirmation">
          <p>Are you sure you want to delete this schedule?</p>
          <p className="delete-item-details">
            {currentSchedule && (
              <>
                <span className="delete-item-title">File ID: {currentSchedule.file_id}</span>
                <span className="delete-item-subtitle">{renderFrequency(currentSchedule)}</span>
              </>
            )}
          </p>
          <div className="modal-actions">
            <AnimatedButton
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </AnimatedButton>
            <AnimatedButton
              variant="danger"
              onClick={handleDelete}
              loading={formSubmitting}
            >
              Delete
            </AnimatedButton>
          </div>
        </div>
      );
    }
    
    return (
      <form onSubmit={handleSubmit} className="schedule-form">
        <div className="form-group">
          <label htmlFor="file_id">File ID *</label>
          <input
            type="text"
            id="file_id"
            name="file_id"
            value={formData.file_id}
            onChange={handleInputChange}
            className={formErrors.file_id ? 'error' : ''}
            disabled={formSubmitting}
            required
          />
          {formErrors.file_id && <div className="error-message">{formErrors.file_id}</div>}
        </div>
        
        <div className="form-group">
          <label htmlFor="frequency">Frequency *</label>
          <select
            id="frequency"
            name="frequency"
            value={formData.frequency}
            onChange={handleInputChange}
            className={formErrors.frequency ? 'error' : ''}
            disabled={formSubmitting}
            required
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {formErrors.frequency && <div className="error-message">{formErrors.frequency}</div>}
        </div>
        
        {formData.frequency !== 'hourly' && (
          <div className="form-group">
            <label htmlFor="time">Time *</label>
            <input
              type="time"
              id="time"
              name="time"
              value={formData.time}
              onChange={handleInputChange}
              className={formErrors.time ? 'error' : ''}
              disabled={formSubmitting}
              required
            />
            {formErrors.time && <div className="error-message">{formErrors.time}</div>}
          </div>
        )}
        
        {formData.frequency === 'weekly' && (
          <div className="form-group">
            <label htmlFor="day">Day of Week *</label>
            <select
              id="day"
              name="day"
              value={formData.day}
              onChange={handleInputChange}
              className={formErrors.day ? 'error' : ''}
              disabled={formSubmitting}
              required
            >
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </select>
            {formErrors.day && <div className="error-message">{formErrors.day}</div>}
          </div>
        )}
        
        {formData.frequency === 'monthly' && (
          <div className="form-group">
            <label htmlFor="day">Day of Month *</label>
            <input
              type="number"
              id="day"
              name="day"
              value={formData.day}
              onChange={handleInputChange}
              min="1"
              max="31"
              className={formErrors.day ? 'error' : ''}
              disabled={formSubmitting}
              required
            />
            {formErrors.day && <div className="error-message">{formErrors.day}</div>}
          </div>
        )}
        
        <div className="form-group form-checkbox">
          <input
            type="checkbox"
            id="is_active"
            name="is_active"
            checked={formData.is_active}
            onChange={handleInputChange}
            disabled={formSubmitting}
          />
          <label htmlFor="is_active">Active</label>
        </div>
        
        <div className="modal-actions">
          <AnimatedButton
            variant="secondary"
            onClick={() => setModalOpen(false)}
            disabled={formSubmitting}
            type="button"
          >
            Cancel
          </AnimatedButton>
          <AnimatedButton
            variant="primary"
            type="submit"
            loading={formSubmitting}
          >
            {modalMode === 'create' ? 'Create' : 'Update'}
          </AnimatedButton>
        </div>
      </form>
    );
  };

  return (
    <PageTransition>
      <div className="scheduler-page">
        <PageHeader
          title="File Scheduler"
          subtitle="Schedule automatic file profiling and analysis"
          icon={<FiCalendar className="page-header-icon-svg" />}
          actions={
            hasWritePermission('schedule') ? (
              <AnimatedButton
                icon={<FiPlusCircle />}
                onClick={openCreateModal}
              >
                New Schedule
              </AnimatedButton>
            ) : null
          }
        />
        
        {alertMessage && (
          <div className={`alert alert-${alertType}`}>
            {alertMessage}
          </div>
        )}
        
        <div className="scheduler-content">
          <div className="scheduler-filters">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search schedules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
          
          {loading ? (
            <div className="loading-container">
              <LoadingSpinner size="large" text="Loading schedules..." />
            </div>
          ) : error ? (
            <div className="error-container">
              <div className="error-message">{error}</div>
              <AnimatedButton onClick={fetchSchedules}>Retry</AnimatedButton>
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="empty-state">
              <FiClock className="empty-state-icon" />
              <h3 className="empty-state-title">No schedules found</h3>
              <p className="empty-state-description">
                {searchTerm ? 'No schedules match your search criteria.' : 'Create your first schedule to automate file profiling.'}
              </p>
              {!searchTerm && hasWritePermission('schedule') && (
                <AnimatedButton
                  icon={<FiPlusCircle />}
                  onClick={openCreateModal}
                >
                  Create Schedule
                </AnimatedButton>
              )}
            </div>
          ) : (
            <div className="schedules-grid">
              <div className="schedules-header">
                <div className="schedule-cell">File ID</div>
                <div className="schedule-cell">Frequency</div>
                <div className="schedule-cell">Last Run</div>
                <div className="schedule-cell">Next Run</div>
                <div className="schedule-cell">Status</div>
                <div className="schedule-cell">Actions</div>
              </div>
              <div className="schedules-body">
                {filteredSchedules.map(schedule => (
                  <div className="schedule-row" key={schedule.id}>
                    <div className="schedule-cell">{schedule.file_id}</div>
                    <div className="schedule-cell">{renderFrequency(schedule)}</div>
                    <div className="schedule-cell">
                      {schedule.last_run ? formatRelativeTime(new Date(schedule.last_run)) : 'Never'}
                    </div>
                    <div className="schedule-cell">
                      {schedule.next_run ? formatRelativeTime(new Date(schedule.next_run)) : 'Not scheduled'}
                    </div>
                    <div className="schedule-cell">
                      <span className={`status-badge ${schedule.is_active ? 'status-active' : 'status-inactive'}`}>
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="schedule-cell actions-cell">
                      {hasWritePermission('schedule') ? (
                        <>
                          <button
                            className="action-button"
                            onClick={() => handleRunNow(schedule.id)}
                            title="Run now"
                          >
                            <FiPlay />
                          </button>
                          <button
                            className="action-button"
                            onClick={() => openEditModal(schedule)}
                            title="Edit"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            className="action-button"
                            onClick={() => openDeleteModal(schedule)}
                            title="Delete"
                          >
                            <FiTrash2 />
                          </button>
                        </>
                      ) : (
                        <span className="action-restricted">No actions available</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={
            modalMode === 'create' ? 'Create Schedule' :
            modalMode === 'edit' ? 'Edit Schedule' :
            'Delete Schedule'
          }
          size={modalMode === 'delete' ? 'small' : 'medium'}
        >
          {renderModalContent()}
        </Modal>
      </div>
    </PageTransition>
  );
};

export default Scheduler;