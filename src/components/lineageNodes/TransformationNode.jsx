import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaCog } from 'react-icons/fa';

const TransformationNode = ({ data }) => {
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;
  
  return (
    <div className="lineage-node lineage-node-transformation">
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header">
        <FaCog className="lineage-node-icon" style={{ color: '#F59E0B' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.description && <div>{data.description}</div>}
        {data.fieldMappingsCount && <div>Fields: {data.fieldMappingsCount}</div>}
        {data.derivedColumnsCount > 0 && (
          <div className="lineage-node-derived-badge">
            {data.derivedColumnsCount} Derived
          </div>
        )}
      </div>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};

export default TransformationNode;
