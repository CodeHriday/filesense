import React from 'react';
import { Handle, Position } from 'reactflow';
import { FaLayerGroup, FaExpand } from 'react-icons/fa';
import PropTypes from 'prop-types';


const GroupedNode = ({ data }) => {
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;
  
  const getTypeColor = (type) => {
    switch (type) {
      case 'sourceFile':
        return '#3B82F6';
      case 'transformation':
        return '#F59E0B';
      case 'job':
        return '#10B981';
      case 'vendorContract':
        return '#8B5CF6';
      case 'targetTable':
        return '#025043';
      case 'targetFile':
        return '#0D9488';
      case 'workflow':
        return '#7C3AED';
      case 'derivedColumn':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };
  
  const getTypeName = (type) => {
    switch (type) {
      case 'sourceFile':
        return 'Files';
      case 'transformation':
        return 'Mappings';
      case 'job':
        return 'Jobs';
      case 'vendorContract':
        return 'Agreements';
      case 'targetTable':
        return 'Tables';
      case 'targetFile':
        return 'Target Files';
      case 'workflow':
        return 'Workflows';
      case 'derivedColumn':
        return 'Derived Columns';
      default:
        return 'Nodes';
    }
  };
  
  const typeColor = getTypeColor(data.groupType);
  const typeName = getTypeName(data.groupType);
  
  return (
    <div 
      className="lineage-node lineage-node-grouped"
      style={{ borderColor: typeColor }}
    >
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header" style={{ color: typeColor }}>
        <FaLayerGroup className="lineage-node-icon" style={{ color: typeColor }} />
        <div className="lineage-node-label">{data.count} {typeName}</div>
      </div>
      
      <div className="lineage-node-meta">
        <div>Click to expand</div>
      </div>
      
      <button 
        className="lineage-grouped-expand-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (data.onExpand) {
            data.onExpand(data.groupId, data.groupType);
          }
        }}
        title="Expand to show all nodes"
      >
        <FaExpand /> Expand
      </button>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};
GroupedNode.propTypes = {
  data: PropTypes.shape({
    groupType: PropTypes.oneOf([
      'sourceFile',
      'transformation',
      'job',
      'vendorContract',
      'targetTable',
      'targetFile',
      'workflow',
      'derivedColumn'
    ]).isRequired,

    count: PropTypes.number.isRequired,
    groupId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,

    onExpand: PropTypes.func,

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

export default GroupedNode;
