import React from 'react';
import { Handle, Position } from 'reactflow';
import './WorkflowNodes.css';
import PropTypes from 'prop-types';


function WorkflowNode({ data, isConnectable }) {
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
