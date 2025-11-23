import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaFile, FaShieldAlt, FaLock } from 'react-icons/fa';

const SourceFileNode = ({ data }) => {
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };
  
  const getClassificationColor = (classification) => {
    switch (classification?.toLowerCase()) {
      case 'confidential':
        return '#DC2626'; // Red
      case 'phi':
        return '#7C3AED'; // Purple
      case 'internal':
        return '#F59E0B'; // Orange
      case 'public':
        return '#10B981'; // Green
      default:
        return '#6B7280'; // Gray
    }
  };
  
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;
  
  return (
    <div className="lineage-node lineage-node-file">
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header">
        <FaFile className="lineage-node-icon" style={{ color: '#3B82F6' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.fileType && <div>Type: {data.fileType}</div>}
        {data.fileSize && <div>Size: {formatFileSize(data.fileSize)}</div>}
        {data.rowCount && <div>Rows: {data.rowCount.toLocaleString()}</div>}
        {data.piiColumns && data.piiColumns.length > 0 && (
          <div title={`PII Columns: ${data.piiColumns.join(', ')}`}>
            PII Cols: {data.piiColumns.length}
          </div>
        )}
      </div>
      
      <div className="lineage-node-badges">
        {data.versionCount > 1 && (
          <div 
            className="lineage-node-version-badge" 
            title={`${data.versionCount} versions of this file uploaded`}
          >
            {data.versionCount} versions
          </div>
        )}
        {data.hasIncidents && (
          <div className="lineage-node-incident-badge" title="Quality Violations">
            {data.incidents?.totalViolations || 0}
          </div>
        )}
        {data.containsPii && (
          <div className="lineage-node-pii-badge" title="Contains PII">
            <FaShieldAlt /> PII
          </div>
        )}
        {data.dataClassification && (
          <div 
            className="lineage-node-classification-badge" 
            style={{ borderColor: getClassificationColor(data.dataClassification) }}
            title={`Classification: ${data.dataClassification}`}
          >
            <FaLock /> {data.dataClassification}
          </div>
        )}
      </div>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};

export default SourceFileNode;
