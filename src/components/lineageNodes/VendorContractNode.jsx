import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaFileContract } from 'react-icons/fa';

const VendorContractNode = ({ data }) => {
  const sourcePosition = data.sourcePosition || Position.Right;
  
  return (
    <div className="lineage-node lineage-node-vendor">
      {data.hasIncidents && (
        <div className="lineage-node-incident-badge">
          {data.incidents?.totalViolations || 0}
        </div>
      )}
      
      <div className="lineage-node-header">
        <FaFileContract className="lineage-node-icon" style={{ color: '#6366F1' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.vendorName && <div>Vendor: {data.vendorName}</div>}
        {data.effectiveFrom && <div>Effective: {new Date(data.effectiveFrom).toLocaleDateString()}</div>}
      </div>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};

export default VendorContractNode;
