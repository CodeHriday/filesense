import React, { useState, useEffect } from 'react';
import './WorkflowConfigModal.css';
import PropTypes from 'prop-types';
function WorkflowConfigModal({ workflow, onSave, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [executionMode, setExecutionMode] = useState('sequential');

  useEffect(() => {
    if (workflow) {
      setName(workflow.name || '');
      setDescription(workflow.description || '');
      setExecutionMode(workflow.execution_mode || 'sequential');
    }
  }, [workflow]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Please enter a workflow name');
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      execution_mode: executionMode,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{workflow ? 'Update Workflow' : 'Save Workflow'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Workflow Name *</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter workflow name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter workflow description (optional)"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="executionMode">Execution Mode</label>
            <select
              id="executionMode"
              value={executionMode}
              onChange={(e) => setExecutionMode(e.target.value)}
            >
              <option value="sequential">Sequential - Execute nodes one after another</option>
              <option value="parallel">Parallel - Execute independent nodes simultaneously</option>
            </select>
            <small className="help-text">
              {executionMode === 'sequential' 
                ? 'Nodes will execute in dependency order, one at a time.' 
                : 'Independent nodes (no dependencies) will execute in parallel for faster completion.'}
            </small>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {workflow ? 'Update' : 'Save'} Workflow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
WorkflowConfigModal.propTypes = {
  workflow: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    execution_mode: PropTypes.oneOf(['sequential', 'parallel']),
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

WorkflowConfigModal.defaultProps = {
  workflow: null,
};
export default WorkflowConfigModal;
