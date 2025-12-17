import React from 'react';
import PropTypes from 'prop-types';  // <-- Add this import
import { Handle, Position } from 'reactflow';
import './WorkflowNodes.css';

function MappingNode({ data, isConnectable }) {
  return (
    <div className="workflow-node mapping-node">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="node-handle"
      />
      
      <div className="node-header">
        <span className="node-icon">🔄</span>
        <span className="node-type">Mapping</span>
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

// Add PropTypes validation
MappingNode.propTypes = {
  data: PropTypes.shape({
    assetName: PropTypes.string.isRequired,
    description: PropTypes.string,        
    assetId: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number
    ]).isRequired,
  }).isRequired,
  isConnectable: PropTypes.bool.isRequired,
};

export default MappingNode;