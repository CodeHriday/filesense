import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaProjectDiagram } from 'react-icons/fa';
import PropTypes from 'prop-types';


const WorkflowNode = ({ data }) => {
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;
  
  return (
    <div className="lineage-node lineage-node-workflow">
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header">
        <FaProjectDiagram className="lineage-node-icon" style={{ color: '#8B5CF6' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.executionMode && <div>Mode: {data.executionMode}</div>}
        {data.nodeCount !== undefined && <div>Steps: {data.nodeCount}</div>}
        {data.projectName && <div>Project: {data.projectName}</div>}
      </div>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};
WorkflowNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,

    executionMode: PropTypes.string,
    nodeCount: PropTypes.number,
    projectName: PropTypes.string,

    targetPosition: PropTypes.oneOf([
      Position.Left,
      Position.Right,
      Position.Top,
      Position.Bottom
    ]),
    sourcePosition: PropTypes.oneOf([
      Position.Left,
      Position.Right,
      Position.Top,
      Position.Bottom
    ])
  }).isRequired
};

export default WorkflowNode;
