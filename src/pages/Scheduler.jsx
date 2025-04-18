import React, { useState, useEffect } from 'react';
import { FiCalendar, FiClock, FiRefreshCw, FiPlay, FiPause, FiTrash, FiPlus } from 'react-icons/fi';
import { createSchedule, getSchedules, updateSchedule, deleteSchedule } from '../api/schedulerService';
import { getFileCatalog } from '../api/fileService';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/PageHeader';
import '../components/styles/Scheduler.css';
import { formatRelativeTime } from '../utils/formatters';

const ScheduleFrequency = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

const Scheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewScheduleForm, setShowNewScheduleForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    file_id: '',
    frequency: ScheduleFrequency.DAILY,
    time: '08:00',
    day: 1,
    is_active: true
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [schedulesData, filesData] = await Promise.all([
          getSchedules(),
          getFileCatalog()
        ]);
        
        setSchedules(schedulesData);
        setFiles(filesData);
      } catch (error) {
        console.error('Failed to fetch scheduler data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const handleCreateSchedule = async () => {
    try {
      // Validate form
      if (!newSchedule.file_id) {
        alert('Please select a file to schedule');
        return;
      }
      
      const createdSchedule = await createSchedule(newSchedule);
      setSchedules([...schedules, createdSchedule]);
      setShowNewScheduleForm(false);
      setNewSchedule({
        file_id: '',
        frequency: ScheduleFrequency.DAILY,
        time: '08:00',
        day: 1,
        is_active: true
      });
    } catch (error) {
      console.error('Failed to create schedule:', error);
      alert('Failed to create schedule: ' + error.message);
    }
  };
  
  const handleUpdateScheduleStatus = async (id, is_active) => {
    try {
      await updateSchedule(id, { is_active });
      setSchedules(schedules.map(schedule => 
        schedule.id === id ? { ...schedule, is_active } : schedule
      ));
    } catch (error) {
      console.error('Failed to update schedule status:', error);
      alert('Failed to update schedule: ' + error.message);
    }
  };
  
  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }
    
    try {
      await deleteSchedule(id);
      setSchedules(schedules.filter(schedule => schedule.id !== id));
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      alert('Failed to delete schedule: ' + error.message);
    }
  };
  
  const getFileNameById = (fileId) => {
    const file = files.find(f => f.file_id === fileId);
    return file ? file.filename : 'Unknown file';
  };
  
  const formatScheduleTime = (schedule) => {
    const { frequency, time, day } = schedule;
    
    let formattedDay = '';
    if (frequency === ScheduleFrequency.WEEKLY) {
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      formattedDay = `every ${weekdays[day]}`;
    } else if (frequency === ScheduleFrequency.MONTHLY) {
      formattedDay = `on day ${day} of each month`;
    }
    
    return `${frequency === ScheduleFrequency.HOURLY ? 'Every hour' : `At ${time}`} ${formattedDay}`;
  };
  
  const getNextRunTime = (schedule) => {
    // This is a placeholder - in a real app you'd calculate the actual next run time
    // based on the schedule frequency, time, day, etc.
    const now = new Date();
    let nextRun = new Date(now);
    
    switch (schedule.frequency) {
      case ScheduleFrequency.HOURLY:
        nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
        break;
      case ScheduleFrequency.DAILY:
        const [hours, minutes] = schedule.time.split(':').map(Number);
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hours, minutes, 0, 0);
        break;
      case ScheduleFrequency.WEEKLY:
        const targetDay = schedule.day;
        const daysToAdd = (targetDay + 7 - now.getDay()) % 7;
        nextRun.setDate(nextRun.getDate() + daysToAdd);
        const [weekHours, weekMinutes] = schedule.time.split(':').map(Number);
        nextRun.setHours(weekHours, weekMinutes, 0, 0);
        break;
      case ScheduleFrequency.MONTHLY:
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(schedule.day);
        const [monthHours, monthMinutes] = schedule.time.split(':').map(Number);
        nextRun.setHours(monthHours, monthMinutes, 0, 0);
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 1);
    }
    
    // If next run is in the past, adjust it
    if (nextRun < now) {
      switch (schedule.frequency) {
        case ScheduleFrequency.HOURLY:
          nextRun.setHours(nextRun.getHours() + 1);
          break;
        case ScheduleFrequency.DAILY:
          nextRun.setDate(nextRun.getDate() + 1);
          break;
        case ScheduleFrequency.WEEKLY:
          nextRun.setDate(nextRun.getDate() + 7);
          break;
        case ScheduleFrequency.MONTHLY:
          nextRun.setMonth(nextRun.getMonth() + 1);
          break;
      }
    }
    
    return nextRun;
  };
  
  const renderFrequencyInput = () => {
    const { frequency, day } = newSchedule;
    
    return (
      <div className="schedule-frequency-container">
        <div className="form-group">
          <label htmlFor="frequency">Frequency</label>
          <select 
            id="frequency"
            value={frequency}
            onChange={(e) => setNewSchedule({ ...newSchedule, frequency: e.target.value })}
            className="form-control"
          >
            <option value={ScheduleFrequency.HOURLY}>Hourly</option>
            <option value={ScheduleFrequency.DAILY}>Daily</option>
            <option value={ScheduleFrequency.WEEKLY}>Weekly</option>
            <option value={ScheduleFrequency.MONTHLY}>Monthly</option>
          </select>
        </div>
        
        {frequency !== ScheduleFrequency.HOURLY && (
          <div className="form-group">
            <label htmlFor="time">Time</label>
            <input 
              type="time"
              id="time"
              value={newSchedule.time}
              onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
              className="form-control"
            />
          </div>
        )}
        
        {frequency === ScheduleFrequency.WEEKLY && (
          <div className="form-group">
            <label htmlFor="weekday">Day of Week</label>
            <select 
              id="weekday"
              value={day}
              onChange={(e) => setNewSchedule({ ...newSchedule, day: parseInt(e.target.value) })}
              className="form-control"
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={2}>Tuesday</option>
              <option value={3}>Wednesday</option>
              <option value={4}>Thursday</option>
              <option value={5}>Friday</option>
              <option value={6}>Saturday</option>
            </select>
          </div>
        )}
        
        {frequency === ScheduleFrequency.MONTHLY && (
          <div className="form-group">
            <label htmlFor="monthday">Day of Month</label>
            <select 
              id="monthday"
              value={day}
              onChange={(e) => setNewSchedule({ ...newSchedule, day: parseInt(e.target.value) })}
              className="form-control"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="scheduler-container">
      <PageHeader 
        title="File Processing Scheduler" 
        subtitle="Schedule automatic file processing and profiling" 
        icon={<FiCalendar />}
      />
      
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="scheduler-actions">
            <button 
              className="btn-primary scheduler-add-btn"
              onClick={() => setShowNewScheduleForm(true)}
              aria-label="Create new schedule"
            >
              <FiPlus /> Add Schedule
            </button>
          </div>
          
          {showNewScheduleForm && (
            <div className="new-schedule-form">
              <h3>Create New Schedule</h3>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="file">Select File</label>
                  <select 
                    id="file"
                    value={newSchedule.file_id}
                    onChange={(e) => setNewSchedule({ ...newSchedule, file_id: e.target.value })}
                    className="form-control"
                  >
                    <option value="">-- Select a file --</option>
                    {files.map(file => (
                      <option key={file.file_id} value={file.file_id}>
                        {file.filename}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {renderFrequencyInput()}
              
              <div className="form-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowNewScheduleForm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleCreateSchedule}
                >
                  Create Schedule
                </button>
              </div>
            </div>
          )}
          
          <div className="schedules-list">
            <h3>Active Schedules</h3>
            {schedules.length === 0 ? (
              <div className="no-schedules">
                <FiCalendar />
                <p>No schedules found</p>
                <p className="hint">Create a new schedule to automatically process your files</p>
              </div>
            ) : (
              <div className="schedules-grid">
                {schedules.map(schedule => {
                  const nextRun = getNextRunTime(schedule);
                  const relativeTime = formatRelativeTime(nextRun);
                  
                  return (
                    <div key={schedule.id} className="schedule-card">
                      <div className="schedule-card-header">
                        <div className="schedule-file-name" title={getFileNameById(schedule.file_id)}>
                          {getFileNameById(schedule.file_id)}
                        </div>
                        <div className={`schedule-status ${schedule.is_active ? 'active' : 'inactive'}`}>
                          {schedule.is_active ? 'Active' : 'Paused'}
                        </div>
                      </div>
                      
                      <div className="schedule-details">
                        <div className="schedule-detail">
                          <FiRefreshCw className="detail-icon" />
                          <span>{formatScheduleTime(schedule)}</span>
                        </div>
                        <div className="schedule-detail">
                          <FiClock className="detail-icon" />
                          <span>Next run: {relativeTime}</span>
                        </div>
                      </div>
                      
                      <div className="schedule-actions">
                        {schedule.is_active ? (
                          <button 
                            className="btn-icon" 
                            onClick={() => handleUpdateScheduleStatus(schedule.id, false)}
                            aria-label="Pause schedule"
                            title="Pause schedule"
                          >
                            <FiPause />
                          </button>
                        ) : (
                          <button 
                            className="btn-icon" 
                            onClick={() => handleUpdateScheduleStatus(schedule.id, true)}
                            aria-label="Activate schedule"
                            title="Activate schedule"
                          >
                            <FiPlay />
                          </button>
                        )}
                        <button 
                          className="btn-icon danger" 
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          aria-label="Delete schedule"
                          title="Delete schedule"
                        >
                          <FiTrash />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Scheduler;