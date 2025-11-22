import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaTable } from 'react-icons/fa';

const TargetTableNode = ({ data }) => {
  return (
    <div className="lineage-node lineage-node-target">
      <Handle type="target" position={Position.Top} />
      
      <div className="lineage-node-header">
        <FaTable className="lineage-node-icon" style={{ color: '#025043' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.rowsWritten && <div>Rows: {data.rowsWritten.toLocaleString()}</div>}
        {data.lastUpdated && <div>Updated: {new Date(data.lastUpdated).toLocaleDateString()}</div>}
      </div>
    </div>
  );
};

export default TargetTableNode;
