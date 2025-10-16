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
      const allSteps = response.data;
      
      const workflowMap = new Map();
      allSteps.forEach(step => {
        if (!workflowMap.has(step.workflow_name)) {
          workflowMap.set(step.workflow_name, []);
        }
        workflowMap.get(step.workflow_name).push(step);
      });

      const summaries = Array.from(workflowMap.entries()).map(([name, steps]) => ({
        name,
        stepCount: steps.length,
        steps: steps.sort((a, b) => a.step_order - b.step_order)
      }));

      setWorkflows(summaries);
      setError(null);
    } catch (err) {
      console.error('Error fetching workflows:', err);
      setError('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (workflowName) => {
    try {
      setExecuting(workflowName);
      await axios.post(`/api/workflow-steps/${workflowName}/execute`);
      alert('Workflow execution started successfully!');
    } catch (err) {
      console.error('Error executing workflow:', err);
      alert('Failed to execute workflow');
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (workflowName) => {
    if (!window.confirm(`Are you sure you want to delete workflow "${workflowName}" and all its steps?`)) {
      return;
    }

    try {
      const steps = workflows.find(w => w.name === workflowName)?.steps || [];
      for (const step of steps) {
        await axios.delete(`/api/workflow-steps/${step.step_id}`);
      }
      setWorkflows(workflows.filter(w => w.name !== workflowName));
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
        >
          <Link to="/workflows/create" className="btn btn-primary">
            <FiPlusCircle /> Create Workflow
          </Link>
        </PageHeader>

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
              <div key={workflow.name} className="workflow-card">
                <h3>{workflow.name}</h3>
                <div className="workflow-meta">
                  <span className="meta-item">Steps: {workflow.stepCount}</span>
                  <span className="meta-item">
                    Mode: {workflow.steps[0]?.execution_mode || 'sequential'}
                  </span>
                </div>
                <div className="workflow-steps">
                  {workflow.steps.map((step, idx) => (
                    <div key={step.step_id} className="step-item">
                      {idx + 1}. {step.step_name} ({step.step_type})
                    </div>
                  ))}
                </div>
                <div className="workflow-actions">
                  <button
                    onClick={() => handleExecute(workflow.name)}
                    disabled={executing === workflow.name}
                    className="btn btn-success btn-sm"
                  >
                    <FiPlayCircle /> {executing === workflow.name ? 'Executing...' : 'Execute'}
                  </button>
                  <Link to={`/workflows/${encodeURIComponent(workflow.name)}/edit`} className="btn btn-primary btn-sm">
                    <FiEdit2 /> Edit
                  </Link>
                  <button onClick={() => handleDelete(workflow.name)} className="btn btn-danger btn-sm">
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
