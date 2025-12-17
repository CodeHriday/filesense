import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaFileContract } from 'react-icons/fa';
import PropTypes from 'prop-types';


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
VendorContractNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,

    vendorName: PropTypes.string,
    effectiveFrom: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.instanceOf(Date)
    ]),

    hasIncidents: PropTypes.bool,
    incidents: PropTypes.shape({
      totalViolations: PropTypes.number
    }),

    sourcePosition: PropTypes.oneOf([
      Position.Left,
      Position.Right,
      Position.Top,
      Position.Bottom
    ])
  }).isRequired
};

export default VendorContractNode;
