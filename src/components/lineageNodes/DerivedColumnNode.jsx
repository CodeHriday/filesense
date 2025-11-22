import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaCalculator } from 'react-icons/fa';

const DerivedColumnNode = ({ data }) => {
  return (
    <div className="lineage-node lineage-node-derived">
      <Handle type="target" position={Position.Top} />
      
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
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default DerivedColumnNode;
