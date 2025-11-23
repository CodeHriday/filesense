import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaTable, FaShieldAlt, FaLock } from 'react-icons/fa';

const TargetTableNode = ({ data }) => {
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
  
  return (
    <div className="lineage-node lineage-node-target">
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header">
        <FaTable className="lineage-node-icon" style={{ color: '#025043' }} />
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        {data.rowsWritten && <div>Rows: {data.rowsWritten.toLocaleString()}</div>}
        {data.lastUpdated && <div>Updated: {new Date(data.lastUpdated).toLocaleDateString()}</div>}
        {data.piiColumns && data.piiColumns.length > 0 && (
          <div title={`PII Columns: ${data.piiColumns.join(', ')}`}>
            PII Cols: {data.piiColumns.length}
          </div>
        )}
      </div>
      
      <div className="lineage-node-badges">
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
    </div>
  );
};

export default TargetTableNode;
