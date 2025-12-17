import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle, FiChevronDown, FiChevronRight, FiAlertCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import '../components/styles/PageActions.css';
import axios from 'axios';
import { groupWorkflowsByProject, initializeExpansionState } from '../utils/workflowGrouping';

const Workflows = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });
  
  // Hierarchical state
  const [expansionState, setExpansionState] = useState({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/n-step-workflows');
      const workflows = response.data.workflows || [];
      
      if (!Array.isArray(workflows) || workflows.length === 0) {
        setWorkflows([]);
        setError(null);
        return;
      }

      // Fetch steps for each workflow to maintain compatibility with existing rendering
      const workflowsWithSteps = await Promise.all(
        workflows.map(async (workflow) => {
          try {
            const stepsRes = await axios.get(`/api/workflow-steps/workflow/${workflow.id}/steps`);
            const steps = stepsRes.data.steps || [];
            return {
              id: workflow.id,
              name: workflow.name || `Workflow ${workflow.id}`,
              stepCount: workflow.step_count || steps.length,
              steps: steps.sort((a, b) => (a.execution_order || 0) - (b.execution_order || 0)),
              project_id: workflow.project_id || 0,
              project_name: workflow.project_name || 'No Project',
              sub_project_id: workflow.sub_project_id || null,
              sub_project_name: workflow.sub_project_name || null
            };
          } catch (err) {
            console.error(`Error fetching steps for workflow ${workflow.id}:`, err);
            return {
              id: workflow.id,
              name: workflow.name || `Workflow ${workflow.id}`,
              stepCount: workflow.step_count || 0,
              steps: [],
              project_id: workflow.project_id || 0,
              project_name: workflow.project_name || 'No Project',
              sub_project_id: workflow.sub_project_id || null,
              sub_project_name: workflow.sub_project_name || null
            };
          }
        })
      );

      setWorkflows(workflowsWithSteps);
      setError(null);
    } catch (err) {
      console.error('Error fetching workflows:', err);
      setError('Failed to load workflows');
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (workflowId) => {
    try {
      setExecuting(workflowId);
      await axios.post(`/api/workflow-steps/workflow/${workflowId}/execute`);
      alert('Workflow execution started successfully!');
    } catch (err) {
      console.error('Error executing workflow:', err);
      alert('Failed to execute workflow');
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (workflowId) => {
    const workflow = workflows.find(w => w.id === workflowId);
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete "${workflow?.name}" and all its steps?`,
      action: async () => {
        try {
          const steps = workflow?.steps || [];
          for (const step of steps) {
            await axios.delete(`/api/workflow-steps/steps/${step.id}`);
          }
          setWorkflows(workflows.filter(w => w.id !== workflowId));
        } catch (err) {
          console.error('Error deleting workflow:', err);
          alert('Failed to delete workflow');
        }
      }
    });
  };

  // Pagination logic
  const currentWorkflows = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return workflows.slice(indexOfFirstItem, indexOfLastItem);
  }, [workflows, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(workflows.length / itemsPerPage);

  // Group workflows by project and subproject hierarchy
  const groupedProjects = useMemo(() => {
    return groupWorkflowsByProject(currentWorkflows);
  }, [currentWorkflows]);

  // Initialize expansion state when grouped data changes
  useEffect(() => {
    if (groupedProjects.length > 0 && !initialized) {
      // Initialize with all sections collapsed by default (first load)
      setExpansionState(initializeExpansionState(groupedProjects, false));
      setInitialized(true);
    }
  }, [groupedProjects, initialized]);

  if (loading) {
    return <LoadingSpinner message="Loading workflows..." />;
  }

  // Toggle expansion for a project or subproject
  const toggleExpansion = (key) => {
    setExpansionState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <PageTransition>
      <div className="workflows-page">
        <PageHeader
          title="Workflows"
          subtitle="Multi-step orchestration with dependency management"
        />
        
        <div className="page-actions">
          <Link to="/workflows/create" className="btn btn-primary">
            <FiPlusCircle /> Create Workflow
          </Link>
        </div>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {groupedProjects.length === 0 ? (
          <div className="empty-state">
            <p>No workflows found. Create one to get started!</p>
          </div>
        ) : (
          <div>
            {groupedProjects.map(project => {
              const projectKey = `project-${project.projectId}`;
              const isProjectExpanded = expansionState[projectKey];

              return (
                <div key={project.projectId} style={{ marginBottom: '1.25rem' }}>
                  {/* Project Header */}
                  <div
                    role="button"
                    tabIndex="0"
                    aria-expanded={isProjectExpanded}
                    aria-label={`${isProjectExpanded ? 'Collapse' : 'Expand'} project ${project.projectName}`}
                    onClick={() => toggleExpansion(projectKey)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpansion(projectKey);
                      }
                    }}
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
                      {project.workflowsCount} {project.workflowsCount === 1 ? 'workflow' : 'workflows'}
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
                              role="button"
                              tabIndex="0"
                              aria-expanded={isSubprojectExpanded}
                              aria-label={`${isSubprojectExpanded ? 'Collapse' : 'Expand'} subproject ${subproject.subProjectName}`}
                              onClick={() => toggleExpansion(subprojectKey)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleExpansion(subprojectKey);
                                }
                              }}
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
                                {subproject.workflowsCount}
                              </span>
                            </div>

                            {/* Subproject Workflows Table */}
                            {isSubprojectExpanded && subproject.items.length > 0 && (
                              <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Steps</th>
                                      <th>Execution Mode</th>
                                      <th>Step Details</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subproject.items.map(workflow => (
                                      <tr key={workflow.id}>
                                        <td className="font-weight-bold">{workflow.name}</td>
                                        <td className="text-center">{workflow.stepCount}</td>
                                        <td>{workflow.steps[0]?.execution_mode || 'sequential'}</td>
                                        <td>
                                          <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                                            {workflow.steps.slice(0, 3).map((step, idx) => (
                                              <div key={step.id}>
                                                {idx + 1}. {step.step_name} ({step.step_type})
                                              </div>
                                            ))}
                                            {workflow.steps.length > 3 && (
                                              <div>... and {workflow.steps.length - 3} more</div>
                                            )}
                                          </div>
                                        </td>
                                        <td>
                                          <div className="action-icons">
                                            <button
                                              onClick={() => handleExecute(workflow.id)}
                                              disabled={executing === workflow.id}
                                              className="action-icon-btn execute-btn"
                                              title="Execute"
                                            >
                                              <FiPlayCircle />
                                            </button>
                                            <Link 
                                              to={`/workflows/${workflow.id}/edit`} 
                                              className="action-icon-btn edit-btn"
                                              title="Edit"
                                            >
                                              <FiEdit2 />
                                            </Link>
                                            <button
                                              onClick={() => handleDelete(workflow.id)}
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

                      {/* Unassigned Workflows (no subproject) */}
                      {project.unassignedWorkflows.length > 0 && (() => {
                        const unassignedKey = `subproject-${project.projectId}-unassigned`;
                        const isUnassignedExpanded = expansionState[unassignedKey];

                        return (
                          <>
                            {/* Unassigned Header */}
                            <div
                              role="button"
                              tabIndex="0"
                              aria-expanded={isUnassignedExpanded}
                              aria-label={`${isUnassignedExpanded ? 'Collapse' : 'Expand'} unassigned workflows`}
                              onClick={() => toggleExpansion(unassignedKey)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleExpansion(unassignedKey);
                                }
                              }}
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
                                {project.unassignedWorkflows.length}
                              </span>
                            </div>

                            {/* Unassigned Workflows Table */}
                            {isUnassignedExpanded && (
                              <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', overflow: 'auto' }}>
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Steps</th>
                                      <th>Execution Mode</th>
                                      <th>Step Details</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {project.unassignedWorkflows.map(workflow => (
                                      <tr key={workflow.id}>
                                        <td className="font-weight-bold">{workflow.name}</td>
                                        <td className="text-center">{workflow.stepCount}</td>
                                        <td>{workflow.steps[0]?.execution_mode || 'sequential'}</td>
                                        <td>
                                          <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                                            {workflow.steps.slice(0, 3).map((step, idx) => (
                                              <div key={step.id}>
                                                {idx + 1}. {step.step_name} ({step.step_type})
                                              </div>
                                            ))}
                                            {workflow.steps.length > 3 && (
                                              <div>... and {workflow.steps.length - 3} more</div>
                                            )}
                                          </div>
                                        </td>
                                        <td>
                                          <div className="action-icons">
                                            <button
                                              onClick={() => handleExecute(workflow.id)}
                                              disabled={executing === workflow.id}
                                              className="action-icon-btn execute-btn"
                                              title="Execute"
                                            >
                                              <FiPlayCircle />
                                            </button>
                                            <Link 
                                              to={`/workflows/${workflow.id}/edit`} 
                                              className="action-icon-btn edit-btn"
                                              title="Edit"
                                            >
                                              <FiEdit2 />
                                            </Link>
                                            <button
                                              onClick={() => handleDelete(workflow.id)}
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
        )}
        
        {workflows.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={workflows.length}
          />
        )}

        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          onConfirm={() => {
            confirmModal.action?.();
            setConfirmModal({ ...confirmModal, isOpen: false });
          }}
          title={confirmModal.title}
          message={confirmModal.message}
          variant="danger"
        />
      </div>
    </PageTransition>
  );
};

export default Workflows;
