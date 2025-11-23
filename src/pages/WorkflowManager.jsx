import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaPlus, FaEdit, FaTrash, FaPlay } from 'react-icons/fa';
import './WorkflowManager.css';

const WorkflowManager = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/visual-workflows', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkflows(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load workflows:', err);
      setError('Failed to load workflows');
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/visual-workflows/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadWorkflows();
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      alert('Failed to delete workflow');
    }
  };

  const handleExecute = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/visual-workflows/${id}/execute`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Workflow execution started');
    } catch (err) {
      console.error('Failed to execute workflow:', err);
      alert('Failed to execute workflow');
    }
  };

  if (loading) {
    return (
      <div className="workflow-manager">
        <div className="workflow-manager-loading">Loading workflows...</div>
      </div>
    );
  }

  return (
    <div className="workflow-manager">
      <div className="workflow-manager-header">
        <div>
          <h1>Visual Workflows</h1>
          <p>Manage and execute visual workflow orchestrations</p>
        </div>
        <button 
          className="workflow-manager-btn-primary"
          onClick={() => navigate('/workflow-builder')}
        >
          <FaPlus /> Create New Workflow
        </button>
      </div>

      {error && (
        <div className="workflow-manager-error">{error}</div>
      )}

      {workflows.length === 0 ? (
        <div className="workflow-manager-empty">
          <p>No visual workflows found</p>
          <button 
            className="workflow-manager-btn-primary"
            onClick={() => navigate('/workflow-builder')}
          >
            <FaPlus /> Create your first workflow
          </button>
        </div>
      ) : (
        <div className="workflow-manager-grid">
          {workflows.map(workflow => {
            const graphData = workflow.graph_data || { nodes: [], edges: [] };
            const nodeCount = graphData.nodes?.length || 0;
            const edgeCount = graphData.edges?.length || 0;

            return (
              <div key={workflow.id} className="workflow-manager-card">
                <div className="workflow-manager-card-header">
                  <h3>{workflow.name}</h3>
                  <div className="workflow-manager-card-actions">
                    <button
                      className="workflow-manager-icon-btn"
                      onClick={() => navigate(`/workflow-builder?id=${workflow.id}`)}
                      title="Edit"
                    >
                      <FaEdit />
                    </button>
                    <button
                      className="workflow-manager-icon-btn"
                      onClick={() => handleExecute(workflow.id)}
                      title="Execute"
                    >
                      <FaPlay />
                    </button>
                    <button
                      className="workflow-manager-icon-btn workflow-manager-icon-btn-danger"
                      onClick={() => handleDelete(workflow.id)}
                      title="Delete"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
                
                {workflow.description && (
                  <p className="workflow-manager-card-description">
                    {workflow.description}
                  </p>
                )}
                
                <div className="workflow-manager-card-stats">
                  <div className="workflow-manager-stat">
                    <span className="workflow-manager-stat-label">Jobs</span>
                    <span className="workflow-manager-stat-value">{nodeCount}</span>
                  </div>
                  <div className="workflow-manager-stat">
                    <span className="workflow-manager-stat-label">Dependencies</span>
                    <span className="workflow-manager-stat-value">{edgeCount}</span>
                  </div>
                </div>
                
                <div className="workflow-manager-card-footer">
                  <span className="workflow-manager-card-date">
                    Updated {new Date(workflow.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WorkflowManager;
