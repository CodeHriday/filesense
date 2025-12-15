import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaCalculator } from 'react-icons/fa';
import PropTypes from 'prop-types';


const DerivedColumnNode = ({ data }) => {
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;
  
  return (
    <div className="lineage-node lineage-node-derived">
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header">
        <FaCalculator className="lineage-node-icon" style={{ color: '#8B5CF6' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.expression && (
          <div style={{ 
            fontSize: '9px', 
            fontFamily: 'monospace', 
            background: '#F5F3FF', 
            padding: '4px', 
            borderRadius: '3px',
            marginTop: '4px',
            wordBreak: 'break-all'
          }}>
            {data.expression}
          </div>
        )}
        {data.transformationType && (
          <div style={{ marginTop: '4px', fontSize: '9px' }}>
            Type: {data.transformationType}
          </div>
        )}
      </div>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};
DerivedColumnNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    expression: PropTypes.string,
    transformationType: PropTypes.string,
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

export default DerivedColumnNode;
