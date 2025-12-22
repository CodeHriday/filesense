import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiPlusCircle, FiPower, FiEdit2, FiTrash2, FiPlay } from 'react-icons/fi';
import { parseCronExpression } from '../utils/cronParser';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import ConfirmModal from '../components/ConfirmModal';
import { useNotification } from '../contexts/NotificationContext';
import './WorkflowManager.css';

const WorkflowManager = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ show: false, workflowId: null, isBulk: false });
  const [selectedWorkflows, setSelectedWorkflows] = useState(new Set());
  const { showSuccess, showError } = useNotification();

  // Filter state
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedSubProject, setSelectedSubProject] = useState('all');

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

  // Get unique projects and subprojects
  const projects = useMemo(() => {
    const projectMap = new Map();
    workflows.forEach(workflow => {
      const projectId = workflow.project_id || 0;
      const projectName = workflow.project_name || 'Unknown Project';
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, { id: projectId, name: projectName });
      }
    });
    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [workflows]);

  const subProjects = useMemo(() => {
    const subProjectMap = new Map();
    workflows
      .filter(w => selectedProject === 'all' || w.project_id === parseInt(selectedProject))
      .forEach(workflow => {
        const subProjectId = workflow.sub_project_id || null;
        const subProjectName = workflow.sub_project_name || 'No Subproject';
        const key = subProjectId || 'null';
        if (!subProjectMap.has(key)) {
          subProjectMap.set(key, { id: key, name: subProjectName });
        }
      });
    return Array.from(subProjectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [workflows, selectedProject]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    return workflows.filter(workflow => {
      if (selectedProject !== 'all' && workflow.project_id !== parseInt(selectedProject)) {
        return false;
      }
      if (selectedSubProject !== 'all') {
        const subKey = workflow.sub_project_id || 'null';
        if (subKey.toString() !== selectedSubProject) {
          return false;
        }
      }
      return true;
    });
  }, [workflows, selectedProject, selectedSubProject]);

  // Find schedule for a workflow
  const getWorkflowSchedule = (workflowId) => {
    return schedules.find(s => 
      s.entity_type === 'visual_workflow' && s.entity_id === workflowId
    );
  };

  // Selection handlers
  const toggleSelectWorkflow = (workflowId) => {
    setSelectedWorkflows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(workflowId)) {
        newSet.delete(workflowId);
      } else {
        newSet.add(workflowId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedWorkflows.size === filteredWorkflows.length) {
      setSelectedWorkflows(new Set());
    } else {
      setSelectedWorkflows(new Set(filteredWorkflows.map(w => w.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedWorkflows.size === 0) return;
    setDeleteModal({ show: true, workflowId: null, isBulk: true });
  };

  const handleBulkDeleteConfirm = async () => {
    const idsToDelete = Array.from(selectedWorkflows);
    setDeleteModal({ show: false, workflowId: null, isBulk: false });

    try {
      const token = localStorage.getItem('token');
      await Promise.all(
        idsToDelete.map(id =>
          axios.delete(`/api/visual-workflows/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setWorkflows(workflows.filter(w => !selectedWorkflows.has(w.id)));
      setSelectedWorkflows(new Set());
      showSuccess(`${idsToDelete.length} workflow(s) deleted successfully`);
    } catch (err) {
      console.error('Error deleting workflows:', err);
      showError('Failed to delete some workflows');
    }
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
    setDeleteModal({ show: true, workflowId, isBulk: false });
  };

  const handleDeleteConfirm = async () => {
    const workflowId = deleteModal.workflowId;
    setDeleteModal({ show: false, workflowId: null, isBulk: false });

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/visual-workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkflows(workflows.filter(w => w.id !== workflowId));
      setSelectedWorkflows(prev => {
        const newSet = new Set(prev);
        newSet.delete(workflowId);
        return newSet;
      });
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

        <div className="workflow-manager-controls">
          <div className="workflow-manager-filters">
            <select 
              value={selectedProject} 
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setSelectedSubProject('all');
              }}
              className="filter-select"
            >
              <option value="all">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            
            <select 
              value={selectedSubProject} 
              onChange={(e) => setSelectedSubProject(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Subprojects</option>
              {subProjects.map(subProject => (
                <option key={subProject.id} value={subProject.id}>{subProject.name}</option>
              ))}
            </select>
          </div>

          <div className="workflow-manager-actions-bar">
            {selectedWorkflows.size > 0 && (
              <div className="bulk-actions">
                <span className="bulk-count">{selectedWorkflows.size} selected</span>
                <button onClick={handleBulkDelete} className="btn-bulk-delete">
                  <FiTrash2 /> Delete Selected
                </button>
              </div>
            )}

            <button 
              onClick={() => navigate('/workflow-builder')} 
              className="btn-create-workflow"
            >
              <FiPlusCircle /> Create Workflow
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {filteredWorkflows.length === 0 ? (
          <div className="empty-state">
            <p>No visual workflows found{selectedProject !== 'all' || selectedSubProject !== 'all' ? ' for the selected filters' : ''}.</p>
          </div>
        ) : (
          <div className="workflow-table-container">
            <table className="workflow-table">
              <thead>
                <tr>
                  <th>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all workflows"
                        checked={selectedWorkflows.size === filteredWorkflows.length && filteredWorkflows.length > 0}
                        onChange={toggleSelectAll}
                      />
                      <span>Name</span>
                    </div>
                  </th>
                  <th>Type</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Next Run</th>
                  <th>Last Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map(workflow => {
                  const schedule = getWorkflowSchedule(workflow.id);
                  const isEnabled = schedule?.enabled || false;

                  return (
                    <tr key={workflow.id}>
                      <td className="workflow-name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${workflow.name}`}
                            checked={selectedWorkflows.has(workflow.id)}
                            onChange={() => toggleSelectWorkflow(workflow.id)}
                          />
                          <span 
                            className="workflow-name-link" 
                            role="button"
                            tabIndex="0"
                            aria-label={`Edit workflow ${workflow.name}`}
                            onClick={() => handleEdit(workflow.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleEdit(workflow.id);
                              }
                            }}
                            title="Click to edit workflow"
                          >
                            {workflow.name}
                          </span>
                        </div>
                      </td>
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
                          <span className={`status-badge ${isEnabled ? 'status-active' : 'status-inactive'}`}>
                            {isEnabled ? 'Active' : 'Inactive'}
                          </span>
                        ) : (
                          <span className="status-badge status-no-schedule">No Schedule</span>
                        )}
                      </td>
                      <td className="workflow-datetime">
                        {formatDateTime(schedule?.next_run)}
                      </td>
                      <td className="workflow-datetime">
                        {formatDateTime(schedule?.last_run)}
                      </td>
                      <td className="workflow-actions">
                        <button
                          className="action-icon"
                          onClick={() => handleToggle(workflow.id, isEnabled)}
                          title={schedule ? (isEnabled ? 'Disable' : 'Enable') : 'No schedule'}
                          disabled={!schedule}
                        >
                          <FiPower className={schedule ? (isEnabled ? 'icon-active' : 'icon-inactive') : 'icon-disabled'} />
                        </button>
                        <button
                          className="action-icon"
                          onClick={() => handleEdit(workflow.id)}
                          title="Edit"
                        >
                          <FiEdit2 className="icon-edit" />
                        </button>
                        <button
                          className="action-icon"
                          onClick={() => handleExecute(workflow.id)}
                          title="Execute"
                        >
                          <FiPlay className="icon-execute" />
                        </button>
                        <button
                          className="action-icon"
                          onClick={() => handleDeleteClick(workflow.id)}
                          title="Delete"
                        >
                          <FiTrash2 className="icon-delete" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={deleteModal.show}
          onClose={() => setDeleteModal({ show: false, workflowId: null, isBulk: false })}
          onConfirm={deleteModal.isBulk ? handleBulkDeleteConfirm : handleDeleteConfirm}
          title={deleteModal.isBulk ? "Delete Workflows" : "Delete Workflow"}
          message={deleteModal.isBulk 
            ? `Are you sure you want to delete ${selectedWorkflows.size} workflow(s)? This action cannot be undone.`
            : "Are you sure you want to delete this workflow? This action cannot be undone."}
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </PageTransition>
  );
};

export default WorkflowManager;
