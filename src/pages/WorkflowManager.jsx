import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiPlusCircle, FiPower, FiEdit2, FiTrash2, FiPlay, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { parseCronExpression } from '../utils/cronParser';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import Modal from '../components/Modal';
import { useNotification } from '../contexts/NotificationContext';
import './WorkflowManager.css';

const WorkflowManager = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expansionState, setExpansionState] = useState({});
  const [deleteModal, setDeleteModal] = useState({ show: false, workflowId: null });
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Load workflows and schedules in parallel
      const [workflowsRes, schedulesRes] = await Promise.all([
        axios.get('/api/visual-workflows', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/schedules', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setWorkflows(Array.isArray(workflowsRes.data) ? workflowsRes.data : []);
      
      const schedulesData = schedulesRes.data.schedules || schedulesRes.data || [];
      setSchedules(Array.isArray(schedulesData) ? schedulesData : []);
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load workflows');
      setLoading(false);
    }
  };

  // Group workflows by project and subproject
  const groupedProjects = useMemo(() => {
    const projectMap = new Map();

    workflows.forEach(workflow => {
      const projectId = workflow.project_id || 0;
      const projectName = workflow.project_name || 'Unknown Project';
      const subProjectId = workflow.sub_project_id || null;
      const subProjectName = workflow.sub_project_name || null;

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          projectId,
          projectName,
          subprojects: new Map(),
          workflowsCount: 0
        });
      }

      const project = projectMap.get(projectId);
      project.workflowsCount++;

      // Create subproject key (null for main project workflows)
      const subKey = subProjectId || 'main';
      const subName = subProjectName || 'No Subproject';

      if (!project.subprojects.has(subKey)) {
        project.subprojects.set(subKey, {
          subProjectId: subKey,
          subProjectName: subName,
          workflows: []
        });
      }

      project.subprojects.get(subKey).workflows.push(workflow);
    });

    // Convert to array and sort
    return Array.from(projectMap.values())
      .sort((a, b) => a.projectName.localeCompare(b.projectName))
      .map(project => ({
        ...project,
        subprojects: Array.from(project.subprojects.values())
          .sort((a, b) => a.subProjectName.localeCompare(b.subProjectName))
      }));
  }, [workflows]);

  // Initialize expansion state
  useEffect(() => {
    if (groupedProjects.length > 0) {
      const newState = {};
      groupedProjects.forEach(project => {
        const projectKey = `project-${project.projectId}`;
        if (!(projectKey in expansionState)) {
          newState[projectKey] = true; // Expand by default
        }
        project.subprojects.forEach(subproject => {
          const subKey = `subproject-${project.projectId}-${subproject.subProjectId}`;
          if (!(subKey in expansionState)) {
            newState[subKey] = true; // Expand by default
          }
        });
      });
      if (Object.keys(newState).length > 0) {
        setExpansionState(prev => ({ ...prev, ...newState }));
      }
    }
  }, [groupedProjects]);

  const toggleExpansion = (key) => {
    setExpansionState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Find schedule for a workflow
  const getWorkflowSchedule = (workflowId) => {
    return schedules.find(s => 
      s.entity_type === 'visual_workflow' && s.entity_id === workflowId
    );
  };

  const handleToggle = async (workflowId, currentEnabled) => {
    try {
      const token = localStorage.getItem('token');
      const schedule = getWorkflowSchedule(workflowId);
      
      if (!schedule) {
        showError('No schedule found for this workflow');
        return;
      }

      await axios.put(`/api/schedules/${schedule.schedule_id}`, 
        { enabled: !currentEnabled },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      setSchedules(schedules.map(s =>
        s.schedule_id === schedule.schedule_id ? { ...s, enabled: !currentEnabled } : s
      ));
      
      showSuccess(`Workflow ${!currentEnabled ? 'enabled' : 'disabled'} successfully`);
    } catch (err) {
      console.error('Error toggling workflow:', err);
      showError('Failed to toggle workflow');
    }
  };

  const handleEdit = (workflowId) => {
    navigate(`/workflow-builder?id=${workflowId}`);
  };

  const handleExecute = async (workflowId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/visual-workflows/${workflowId}/execute`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showSuccess('Workflow execution started');
    } catch (err) {
      console.error('Failed to execute workflow:', err);
      showError('Failed to execute workflow');
    }
  };

  const handleDeleteClick = (workflowId) => {
    setDeleteModal({ show: true, workflowId });
  };

  const handleDeleteConfirm = async () => {
    const workflowId = deleteModal.workflowId;
    setDeleteModal({ show: false, workflowId: null });

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/visual-workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkflows(workflows.filter(w => w.id !== workflowId));
      showSuccess('Workflow deleted successfully');
    } catch (err) {
      console.error('Error deleting workflow:', err);
      showError('Failed to delete workflow');
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return <LoadingSpinner message="Loading workflows..." />;
  }

  return (
    <PageTransition>
      <div className="workflow-manager-page">
        <PageHeader
          title="Visual Workflows"
          subtitle="Manage and execute visual workflow orchestrations"
          hideHomeButton={true}
        />

        <div style={{ marginBottom: '1.5rem' }}>
          <button 
            onClick={() => navigate('/workflow-builder')} 
            className="btn btn-primary"
          >
            <FiPlusCircle /> Create Workflow
          </button>
        </div>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {workflows.length === 0 ? (
          <div className="empty-state">
            <p>No visual workflows found. Create one to get started!</p>
          </div>
        ) : (
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
                      className="project-header"
                    >
                      {isProjectExpanded ? (
                        <FiChevronDown size={14} />
                      ) : (
                        <FiChevronRight size={14} />
                      )}
                      <span style={{ flex: 1 }}>Project : {project.projectName}</span>
                      <span className="count-badge">
                        {project.workflowsCount} {project.workflowsCount === 1 ? 'workflow' : 'workflows'}
                      </span>
                    </div>

                    {/* Project Content - Subprojects */}
                    {isProjectExpanded && (
                      <div style={{ marginTop: '0.75rem', paddingLeft: '0.5rem' }}>
                        {project.subprojects.map(subproject => {
                          const subprojectKey = `subproject-${project.projectId}-${subproject.subProjectId}`;
                          const isSubprojectExpanded = expansionState[subprojectKey];

                          return (
                            <div key={subproject.subProjectId} style={{ marginBottom: '0.75rem' }}>
                              {/* Subproject Header */}
                              <div
                                onClick={() => toggleExpansion(subprojectKey)}
                                className="subproject-header"
                              >
                                {isSubprojectExpanded ? (
                                  <FiChevronDown size={12} />
                                ) : (
                                  <FiChevronRight size={12} />
                                )}
                                <span style={{ flex: 1 }}>{subproject.subProjectName}</span>
                                <span className="sub-count-badge">
                                  {subproject.workflows.length}
                                </span>
                              </div>

                              {/* Workflows Table */}
                              {isSubprojectExpanded && subproject.workflows.length > 0 && (
                                <div className="workflow-table-wrapper">
                                  <table className="workflow-table">
                                    <thead>
                                      <tr>
                                        <th>NAME</th>
                                        <th>TYPE</th>
                                        <th>SCHEDULE</th>
                                        <th>STATUS</th>
                                        <th>NEXT RUN</th>
                                        <th>LAST RUN</th>
                                        <th>ACTIONS</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subproject.workflows.map(workflow => {
                                        const schedule = getWorkflowSchedule(workflow.id);
                                        const isEnabled = schedule?.enabled || false;

                                        return (
                                          <tr key={workflow.id}>
                                            <td className="workflow-name">{workflow.name}</td>
                                            <td className="workflow-type">Visual Workflow</td>
                                            <td className="workflow-schedule">
                                              {schedule ? (
                                                schedule.schedule_type === 'cron' 
                                                  ? parseCronExpression(schedule.cron_expression)
                                                  : `Every ${schedule.interval_value} ${schedule.interval_unit}${schedule.interval_value > 1 ? 's' : ''}`
                                              ) : '-'}
                                            </td>
                                            <td className="workflow-status">
                                              {schedule ? (
                                                <span className={`status-badge ${isEnabled ? 'status-enabled' : 'status-disabled'}`}>
                                                  {isEnabled ? 'ENABLED' : 'DISABLED'}
                                                </span>
                                              ) : (
                                                <span className="status-badge status-no-schedule">NO SCHEDULE</span>
                                              )}
                                            </td>
                                            <td className="workflow-next-run">
                                              {formatDateTime(schedule?.next_run)}
                                            </td>
                                            <td className="workflow-last-run">
                                              {formatDateTime(schedule?.last_run)}
                                            </td>
                                            <td className="workflow-actions">
                                              {schedule && (
                                                <button
                                                  className={`action-btn ${isEnabled ? 'action-btn-enabled' : 'action-btn-disabled'}`}
                                                  onClick={() => handleToggle(workflow.id, isEnabled)}
                                                  title={isEnabled ? 'Disable' : 'Enable'}
                                                >
                                                  <FiPower size={16} />
                                                </button>
                                              )}
                                              <button
                                                className="action-btn"
                                                onClick={() => handleEdit(workflow.id)}
                                                title="Edit"
                                              >
                                                <FiEdit2 size={16} />
                                              </button>
                                              <button
                                                className="action-btn action-btn-execute"
                                                onClick={() => handleExecute(workflow.id)}
                                                title="Execute"
                                              >
                                                <FiPlay size={16} />
                                              </button>
                                              <button
                                                className="action-btn action-btn-delete"
                                                onClick={() => handleDeleteClick(workflow.id)}
                                                title="Delete"
                                              >
                                                <FiTrash2 size={16} />
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={deleteModal.show}
          onClose={() => setDeleteModal({ show: false, workflowId: null })}
          title="Delete Workflow"
        >
          <p>Are you sure you want to delete this workflow? This action cannot be undone.</p>
          <div className="modal-actions">
            <button 
              className="btn btn-secondary" 
              onClick={() => setDeleteModal({ show: false, workflowId: null })}
            >
              Cancel
            </button>
            <button 
              className="btn btn-danger" 
              onClick={handleDeleteConfirm}
            >
              Delete
            </button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
};

export default WorkflowManager;
