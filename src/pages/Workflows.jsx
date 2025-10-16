import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlayCircle, FiEdit2, FiTrash2, FiPlusCircle } from 'react-icons/fi';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { PageTransition } from '../components/MicroAnimations';
import axios from 'axios';

const Workflows = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null);

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
    if (!window.confirm(`Are you sure you want to delete "${workflow?.name}" and all its steps?`)) {
      return;
    }

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
  };

  if (loading) {
    return <LoadingSpinner message="Loading workflows..." />;
  }

  return (
    <PageTransition>
      <div className="workflows-page">
        <PageHeader
          title="Workflows"
          subtitle="Multi-step orchestration with dependency management"
          actions={
            <Link to="/workflows/create" className="btn btn-primary">
              <FiPlusCircle /> Create Workflow
            </Link>
          }
        />

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {workflows.length === 0 ? (
          <div className="empty-state">
            <p>No workflows found. Create one to get started!</p>
          </div>
        ) : (
          <div className="workflows-grid">
            {workflows.map(workflow => (
              <div key={workflow.id} className="workflow-card">
                <h3>{workflow.name}</h3>
                <div className="workflow-meta">
                  <span className="meta-item">Steps: {workflow.stepCount}</span>
                  <span className="meta-item">
                    Mode: {workflow.steps[0]?.execution_mode || 'sequential'}
                  </span>
                </div>
                <div className="workflow-steps">
                  {workflow.steps.map((step, idx) => (
                    <div key={step.id} className="step-item">
                      {idx + 1}. {step.step_name} ({step.step_type})
                    </div>
                  ))}
                </div>
                <div className="workflow-actions">
                  <button
                    onClick={() => handleExecute(workflow.id)}
                    disabled={executing === workflow.id}
                    className="btn btn-success btn-sm"
                  >
                    <FiPlayCircle /> {executing === workflow.id ? 'Executing...' : 'Execute'}
                  </button>
                  <Link to={`/workflows/${workflow.id}/edit`} className="btn btn-primary btn-sm">
                    <FiEdit2 /> Edit
                  </Link>
                  <button onClick={() => handleDelete(workflow.id)} className="btn btn-danger btn-sm">
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

export default Workflows;
