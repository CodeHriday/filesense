import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import workflowService, { WorkflowStep } from '../../services/workflowService';
import { THEME } from '../../config/config';

interface WorkflowSummary {
  name: string;
  stepCount: number;
  steps: WorkflowStep[];
}

const WorkflowList: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const allSteps = await workflowService.getAllSteps();
      
      const workflowMap = new Map<string, WorkflowStep[]>();
      allSteps.forEach(step => {
        if (!workflowMap.has(step.workflow_name)) {
          workflowMap.set(step.workflow_name, []);
        }
        workflowMap.get(step.workflow_name)!.push(step);
      });

      const summaries: WorkflowSummary[] = Array.from(workflowMap.entries()).map(([name, steps]) => ({
        name,
        stepCount: steps.length,
        steps: steps.sort((a, b) => a.step_order - b.step_order)
      }));

      setWorkflows(summaries);
      setError(null);
    } catch (err) {
      console.error('Error fetching workflows:', err);
      setError('Failed to load workflows. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (workflowName: string) => {
    try {
      setExecuting(workflowName);
      await workflowService.executeWorkflow(workflowName);
      alert('Workflow execution started successfully!');
    } catch (err) {
      console.error('Error executing workflow:', err);
      setError('Failed to execute workflow. Please try again later.');
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (workflowName: string) => {
    if (!window.confirm(`Are you sure you want to delete workflow "${workflowName}" and all its steps?`)) {
      return;
    }

    try {
      const steps = workflows.find(w => w.name === workflowName)?.steps || [];
      for (const step of steps) {
        await workflowService.deleteWorkflowStep(step.step_id);
      }
      setWorkflows(prevWorkflows => prevWorkflows.filter(w => w.name !== workflowName));
    } catch (err) {
      console.error('Error deleting workflow:', err);
      setError('Failed to delete workflow. Please try again later.');
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading workflows...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: THEME.colors.secondary, margin: 0 }}>Workflows</h2>
        <Link
          to="/workflows/new"
          style={{
            backgroundColor: THEME.colors.primary,
            color: THEME.colors.white,
            padding: '8px 16px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Create New Workflow
        </Link>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {workflows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          No workflows found. Create one to get started!
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {workflows.map(workflow => (
            <div
              key={workflow.name}
              style={{
                backgroundColor: THEME.colors.white,
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '20px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 8px 0', color: THEME.colors.secondary }}>{workflow.name}</h3>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#666', marginBottom: '12px' }}>
                    <span>Steps: {workflow.stepCount}</span>
                    <span>Execution Mode: {workflow.steps[0]?.execution_mode || 'sequential'}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#888' }}>
                    {workflow.steps.map((step, idx) => (
                      <div key={step.step_id}>
                        {idx + 1}. {step.step_name} ({step.step_type})
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleExecute(workflow.name)}
                    disabled={executing === workflow.name}
                    style={{
                      backgroundColor: '#52c41a',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: executing === workflow.name ? 'not-allowed' : 'pointer',
                      opacity: executing === workflow.name ? 0.6 : 1
                    }}
                  >
                    {executing === workflow.name ? 'Executing...' : 'Execute'}
                  </button>
                  <button
                    onClick={() => navigate(`/workflows/${encodeURIComponent(workflow.name)}/edit`)}
                    style={{
                      backgroundColor: THEME.colors.primary,
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(workflow.name)}
                    style={{
                      backgroundColor: '#ff4d4f',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowList;
