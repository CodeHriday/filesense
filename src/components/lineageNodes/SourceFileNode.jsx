import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaFile } from 'react-icons/fa';

const SourceFileNode = ({ data }) => {
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };
  
  return (
    <div className="lineage-node lineage-node-file">
      {data.hasIncidents && (
        <div className="lineage-node-incident-badge">
          {data.incidents?.totalViolations || 0}
        </div>
      )}
      
      <Handle type="target" position={Position.Top} />
      
      <div className="lineage-node-header">
        <FaFile className="lineage-node-icon" style={{ color: '#3B82F6' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.fileType && <div>Type: {data.fileType}</div>}
        {data.fileSize && <div>Size: {formatFileSize(data.fileSize)}</div>}
        {data.rowCount && <div>Rows: {data.rowCount.toLocaleString()}</div>}
      </div>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default SourceFileNode;
