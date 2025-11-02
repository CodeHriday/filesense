import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import '../components/styles/PageActions.css';
import axios from 'axios';

const Workflows = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/workflow-steps');
      const responseData = response.data.steps || response.data || [];
      const allSteps = Array.isArray(responseData) ? responseData : [];
      
      if (allSteps.length === 0) {
        setWorkflows([]);
        setError(null);
        return;
      }
      
      const workflowMap = new Map();
      allSteps.forEach(step => {
        const workflowKey = step.workflow_id || 'unknown';
        if (!workflowMap.has(workflowKey)) {
          workflowMap.set(workflowKey, []);
        }
        workflowMap.get(workflowKey).push(step);
      });

      const summaries = Array.from(workflowMap.entries()).map(([workflowId, steps]) => ({
        id: workflowId,
        name: `Workflow ${workflowId}`,
        stepCount: steps.length,
        steps: steps.sort((a, b) => (a.execution_order || 0) - (b.execution_order || 0))
      }));

      setWorkflows(summaries);
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

  if (loading) {
    return <LoadingSpinner message="Loading workflows..." />;
  }

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentWorkflows = workflows.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(workflows.length / itemsPerPage);

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

        {workflows.length === 0 ? (
          <div className="empty-state">
            <p>No workflows found. Create one to get started!</p>
          </div>
        ) : (
          <div className="table-container">
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
                {currentWorkflows.map(workflow => (
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
