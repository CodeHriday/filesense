import React from 'react';
import { Handle, Position } from 'reactflow';
import PropTypes from 'prop-types';
import { FaPlayCircle, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const JobNode = ({ data }) => {
  const getStatusIcon = () => {
    switch (data.status) {
      case 'completed':
        return <FaCheckCircle style={{ color: '#10B981' }} />;
      case 'failed':
        return <FaTimesCircle style={{ color: '#DC2626' }} />;
      default:
        return <FaPlayCircle style={{ color: '#F59E0B' }} />;
    }
  };
  
  const formatDuration = (ms) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };
  
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;
  
  return (
    <div className="lineage-node lineage-node-job">
      {data.hasIncidents && (
        <div className="lineage-node-incident-badge">
          {data.incidents?.totalViolations || 0}
        </div>
      )}
      
      <Handle type="target" position={targetPosition} />
      
      <div className="lineage-node-header">
        {getStatusIcon()}
        <div className="lineage-node-label">{data.label}</div>
      </div>
      
      <div className="lineage-node-meta">
        <div>Status: {data.status || 'unknown'}</div>
        {data.durationMs && <div>Duration: {formatDuration(data.durationMs)}</div>}
        {data.rowsWritten && <div>Written: {data.rowsWritten.toLocaleString()} rows</div>}
      </div>
      
      <Handle type="source" position={sourcePosition} />
    </div>
  );
};
JobNode.propTypes = {
  data: PropTypes.shape({
    label: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['running', 'completed', 'failed']),
    durationMs: PropTypes.number,
    rowsWritten: PropTypes.number,

    hasIncidents: PropTypes.bool,
    incidents: PropTypes.shape({
      totalViolations: PropTypes.number
    }),

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

export default JobNode;
