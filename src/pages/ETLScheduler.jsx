import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiPlusCircle, FiPower } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { PageTransition } from '../components/MicroAnimations';
import Modal from '../components/Modal';
import { useNotification } from '../contexts/NotificationContext';
import '../styles/global-page-styles.css';
import axios from 'axios';

const ETLScheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [deleteModal, setDeleteModal] = useState({ show: false, scheduleId: null });
  const { showSuccess, showError } = useNotification();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedSubProject, setSelectedSubProject] = useState('all');

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
      showSuccess(`Schedule ${!currentEnabled ? 'enabled' : 'disabled'} successfully`);
    } catch (err) {
      console.error('Error toggling schedule:', err);
      showError('Failed to toggle schedule');
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
      showSuccess('Schedule deleted successfully');
    } catch (err) {
      console.error('Error deleting schedule:', err);
      showError('Failed to delete schedule');
    }
  };

  const formatSchedule = (schedule) => {
    if (schedule.schedule_type === 'cron') {
      return `Cron: ${schedule.cron_expression}`;
    } else {
      return `Every ${schedule.interval_value} ${schedule.interval_unit}${schedule.interval_value > 1 ? 's' : ''}`;
    }
  };

  const uniqueProjects = useMemo(() => {
    const projects = schedules
      .filter(s => s.project_id)
      .map(s => ({ id: s.project_id, name: s.project_name }))
      .filter((p, index, self) => self.findIndex(s => s.id === p.id) === index);
    return projects;
  }, [schedules]);

  const uniqueSubProjects = useMemo(() => {
    if (selectedProject === 'all') {
      const subProjects = schedules
        .filter(s => s.sub_project_id)
        .map(s => ({ id: s.sub_project_id, name: s.sub_project_name }))
        .filter((sp, index, self) => self.findIndex(s => s.id === sp.id) === index);
      return subProjects;
    }
    
    const subProjects = schedules
      .filter(s => s.project_id === selectedProject && s.sub_project_id)
      .map(s => ({ id: s.sub_project_id, name: s.sub_project_name }))
      .filter((sp, index, self) => self.findIndex(s => s.id === sp.id) === index);
    return subProjects;
  }, [schedules, selectedProject]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (schedule.entity_name || '').toLowerCase().includes(searchLower) ||
        (schedule.entity_type || '').toLowerCase().includes(searchLower) ||
        (schedule.project_name || '').toLowerCase().includes(searchLower) ||
        (schedule.sub_project_name || '').toLowerCase().includes(searchLower);
      
      const matchesProject = selectedProject === 'all' || schedule.project_id === selectedProject;
      const matchesSubProject = selectedSubProject === 'all' || schedule.sub_project_id === selectedSubProject;
      
      return matchesSearch && matchesProject && matchesSubProject;
    });
  }, [schedules, searchTerm, selectedProject, selectedSubProject]);

  const paginatedSchedules = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return filteredSchedules.slice(indexOfFirstItem, indexOfLastItem);
  }, [filteredSchedules, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);

  useEffect(() => {
    setSelectedSubProject('all');
  }, [selectedProject]);

  if (loading) {
    return <LoadingSpinner message="Loading schedules..." />;
  }

  return (
    <PageTransition>
      <div className="gps-page-container">
        <div className="gps-page-header">
          <div className="gps-page-header-left">
            <h1 className="gps-page-title">Job Schedules</h1>
            <p className="gps-page-subtitle">Schedule transformations, mapping groups, and workflows</p>
          </div>
          <div className="gps-page-header-right">
            <Link to="/etl-scheduler/create" className="gps-btn-primary">
              <FiPlusCircle /> Create Schedule
            </Link>
          </div>
        </div>

        <div className="gps-filters">
          <input
            type="text"
            placeholder="Search schedules..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="gps-search-input"
          />
          
          <select 
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
              setCurrentPage(1);
            }}
            className="gps-filter-select"
          >
            <option value="all">All Projects</option>
            {uniqueProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          <select 
            value={selectedSubProject}
            onChange={(e) => {
              setSelectedSubProject(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
              setCurrentPage(1);
            }}
            className="gps-filter-select"
          >
            <option value="all">All Subprojects</option>
            {uniqueSubProjects.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="gps-alert-danger">{error}</div>
        )}

        <div className="gps-results-info">
          Showing {paginatedSchedules.length} of {filteredSchedules.length} schedules
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="gps-empty-state">
            <p>No schedules found. Create one to get started!</p>
          </div>
        ) : (
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Project</th>
                  <th>Subproject</th>
                  <th>Type</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Next Run</th>
                  <th>Last Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSchedules.map(schedule => (
                  <tr key={schedule.schedule_id}>
                    <td style={{ fontWeight: '500' }}>{schedule.entity_name || schedule.entity_id}</td>
                    <td>{schedule.project_name || '-'}</td>
                    <td>{schedule.sub_project_name || '-'}</td>
                    <td>
                      <span className="gps-badge gps-badge--info">{schedule.entity_type}</span>
                    </td>
                    <td>{formatSchedule(schedule)}</td>
                    <td>
                      <span className={`gps-badge ${schedule.enabled ? 'gps-badge--active' : 'gps-badge--pending'}`}>
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
                      <div className="gps-action-buttons">
                        <button
                          onClick={() => handleToggle(schedule.schedule_id, schedule.enabled)}
                          className={`gps-icon-btn ${schedule.enabled ? 'gps-icon-btn-danger' : 'gps-icon-btn-success'}`}
                          title={schedule.enabled ? 'Disable' : 'Enable'}
                        >
                          <FiPower />
                        </button>
                        <Link 
                          to={`/etl-scheduler/${schedule.schedule_id}/edit`} 
                          className="gps-icon-btn gps-icon-btn-primary"
                          title="Edit"
                        >
                          <FiEdit2 />
                        </Link>
                        <button 
                          onClick={() => handleDeleteClick(schedule.schedule_id)} 
                          className="gps-icon-btn gps-icon-btn-danger"
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
        )}

        {filteredSchedules.length > 0 && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredSchedules.length}
          />
        )}

        <Modal
          isOpen={deleteModal.show}
          onClose={() => setDeleteModal({ show: false, scheduleId: null })}
          title="Confirm Delete"
          size="small"
          footer={
            <>
              <button 
                onClick={() => setDeleteModal({ show: false, scheduleId: null })} 
                className="gps-btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteConfirm} 
                className="gps-btn-danger"
              >
                Delete
              </button>
            </>
          }
        >
          <p style={{ margin: '0' }}>Are you sure you want to delete this schedule?</p>
        </Modal>
      </div>
    </PageTransition>
  );
};

export default ETLScheduler;
