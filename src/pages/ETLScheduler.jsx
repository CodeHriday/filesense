import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiClock, FiEdit2, FiTrash2, FiPlusCircle, FiPower, FiChevronDown, FiChevronRight, FiAlertCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { PageTransition } from '../components/MicroAnimations';
import Modal from '../components/Modal';
import { useNotification } from '../contexts/NotificationContext';
import { groupSchedulesByProject, initializeExpansionState } from '../utils/schedulerGrouping';
import './ETLScheduler.css';
import axios from 'axios';

const ETLScheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [deleteModal, setDeleteModal] = useState({ show: false, scheduleId: null });
  const { showSuccess, showError } = useNotification();

  // Hierarchical state
  const [expansionState, setExpansionState] = useState({});
  const [initialized, setInitialized] = useState(false);

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

  // Group schedules by project and subproject hierarchy
  const groupedProjects = useMemo(() => {
    return groupSchedulesByProject(schedules);
  }, [schedules]);

  // Initialize expansion state when grouped data changes
  useEffect(() => {
    if (groupedProjects.length > 0 && !initialized) {
      setExpansionState(initializeExpansionState(groupedProjects, false));
      setInitialized(true);
    }
  }, [groupedProjects, initialized]);

  // Toggle expansion state for project or subproject
  const toggleExpansion = (key) => {
    setExpansionState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
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
          hideHomeButton={true}
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
              <div>
                {groupedProjects.map(project => {
                  const projectKey = `project-${project.projectId}`;
                  const isProjectExpanded = expansionState[projectKey];

                  return (
                    <div key={project.projectId} style={{ marginBottom: '1.25rem' }}>
                      {/* Project Header */}
                      <div
                        onClick={() => toggleExpansion(projectKey)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: 'white',
                          color: '#6b7280',
                          cursor: 'pointer',
                          userSelect: 'none',
                          fontWeight: '500',
                          fontSize: '0.8125rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {isProjectExpanded ? (
                          <FiChevronDown size={14} style={{ color: '#6b7280' }} />
                        ) : (
                          <FiChevronRight size={14} style={{ color: '#6b7280' }} />
                        )}
                        <span style={{ flex: 1 }}>Project : {project.projectName}</span>
                        <span
                          style={{
                            color: '#9ca3af',
                            fontSize: '0.75rem',
                            fontWeight: '400'
                          }}
                        >
                          {project.schedulesCount} {project.schedulesCount === 1 ? 'schedule' : 'schedules'}
                        </span>
                      </div>

                      {/* Project Content - Subprojects */}
                      {isProjectExpanded && (
                        <div style={{ marginTop: '0.75rem', paddingLeft: '0.5rem' }}>
                          {/* Subprojects */}
                          {project.subprojects.map(subproject => {
                            const subprojectKey = `subproject-${project.projectId}-${subproject.subProjectId}`;
                            const isSubprojectExpanded = expansionState[subprojectKey];

                            return (
                              <div key={subproject.subProjectId} style={{ marginBottom: '0.75rem' }}>
                                {/* Subproject Header */}
                                <div
                                  onClick={() => toggleExpansion(subprojectKey)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.4rem 0.75rem',
                                    background: 'white',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    marginLeft: '1.5rem',
                                    fontWeight: '400',
                                    fontSize: '0.75rem',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  {isSubprojectExpanded ? (
                                    <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                                  ) : (
                                    <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                                  )}
                                  <span style={{ flex: 1, color: '#9ca3af' }}>{subproject.subProjectName}</span>
                                  <span
                                    style={{
                                      color: '#d1d5db',
                                      fontSize: '0.6875rem',
                                      fontWeight: '400'
                                    }}
                                  >
                                    {subproject.schedulesCount}
                                  </span>
                                </div>

                                {/* Subproject Schedules Table */}
                                {isSubprojectExpanded && subproject.items.length > 0 && (
                                  <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                    <table className="data-table">
                                      <thead>
                                        <tr>
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
                                        {subproject.items.map(schedule => (
                                          <tr key={schedule.schedule_id} className={!schedule.enabled ? 'disabled-row' : ''}>
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
                                )}
                              </div>
                            );
                          })}

                          {/* Unassigned Schedules (no subproject) */}
                          {project.unassignedSchedules.length > 0 && (() => {
                            const unassignedKey = `subproject-${project.projectId}-unassigned`;
                            const isUnassignedExpanded = expansionState[unassignedKey];

                            return (
                              <>
                                {/* Unassigned Header */}
                                <div
                                  onClick={() => toggleExpansion(unassignedKey)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.4rem 0.75rem',
                                    background: 'white',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    marginLeft: '1.5rem',
                                    fontWeight: '400',
                                    fontSize: '0.75rem',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  {isUnassignedExpanded ? (
                                    <FiChevronDown size={12} style={{ color: '#9ca3af' }} />
                                  ) : (
                                    <FiChevronRight size={12} style={{ color: '#9ca3af' }} />
                                  )}
                                  <FiAlertCircle size={12} style={{ color: '#d1d5db' }} />
                                  <span style={{ flex: 1, color: '#9ca3af' }}>No Subproject</span>
                                  <span
                                    style={{
                                      color: '#d1d5db',
                                      fontSize: '0.6875rem',
                                      fontWeight: '400'
                                    }}
                                  >
                                    {project.unassignedSchedules.length}
                                  </span>
                                </div>

                                {/* Unassigned Schedules Table */}
                                {isUnassignedExpanded && (
                                  <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                    <table className="data-table">
                                      <thead>
                                        <tr>
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
                                        {project.unassignedSchedules.map(schedule => (
                                          <tr key={schedule.schedule_id} className={!schedule.enabled ? 'disabled-row' : ''}>
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
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

      </div>
    </PageTransition>
  );
};

export default ETLScheduler;
