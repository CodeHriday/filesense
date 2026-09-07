import React from 'react';
import { Handle, Position } from 'reactflow';
import './WorkflowNodes.css';
import PropTypes from 'prop-types';


function WorkflowNode({ data, isConnectable }) {
  const isEmail = data.assetType === 'email_notification';
  const isJira  = data.assetType === 'jira_ticket';

  if (isEmail) {
    return (
      <div className="workflow-node email-notification-node" style={{ borderColor: '#1a73e8' }}>
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="node-handle"
        />
        <div className="node-header">
          <span className="node-icon">📧</span>
          <span className="node-type" style={{ color: '#1a73e8' }}>Email Notification</span>
        </div>
        <div className="node-body">
          <div className="node-title">{data.assetName || 'Email Notification'}</div>
          {data.config?.recipients && (
            <div className="node-description">To: {data.config.recipients}</div>
          )}
          {data.description && (
            <div className="node-description">{data.description}</div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="node-handle"
        />
      </div>
    );
  }

  if (isJira) {
    return (
      <div className="workflow-node email-notification-node" style={{ borderColor: '#0052CC' }}>
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="node-handle"
        />
        <div className="node-header">
          <span className="node-icon">🎫</span>
          <span className="node-type" style={{ color: '#0052CC' }}>Jira Ticket</span>
        </div>
        <div className="node-body">
          <div className="node-title">{data.assetName || 'Jira Ticket'}</div>
          {data.config?.summary && (
            <div className="node-description">{data.config.summary.substring(0, 36)}{data.config.summary.length > 36 ? '…' : ''}</div>
          )}
          {data.config?.issueType && (
            <div className="node-description">Type: {data.config.issueType}</div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
          className="node-handle"
        />
      </div>
    );
  }

  return (
    <div className="workflow-node workflow-node-type">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="node-handle"
      />
      
      <div className="node-header">
        <span className="node-icon">⚙️</span>
        <span className="node-type">Workflow</span>
      </div>
      
      <div className="node-body">
        <div className="node-title">{data.assetName}</div>
        {data.description && (
          <div className="node-description">{data.description}</div>
        )}
        <div className="node-id">ID: {data.assetId}</div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="node-handle"
      />
    </div>
  );
}
WorkflowNode.propTypes = {
  data: PropTypes.shape({
    assetName: PropTypes.string.isRequired,
    assetId: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number
    ]).isRequired,
    description: PropTypes.string
  }).isRequired,

  isConnectable: PropTypes.bool
};

export default WorkflowNode;
