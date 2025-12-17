import React from 'react';
import { FiAlertCircle, FiLock, FiFileText, FiAlertTriangle, FiXCircle, FiShield } from 'react-icons/fi';
import './DLQBadge.css';
import PropTypes from 'prop-types';

const DLQ_REASON_CONFIG = {
  virus_detected: {
    label: 'Virus Detected',
    icon: <FiShield />,
    color: '#dc2626',
    bgColor: '#fee2e2'
  },
  password_missing: {
    label: 'Password Required',
    icon: <FiLock />,
    color: '#f59e0b',
    bgColor: '#fef3c7'
  },
  unsupported_encoding: {
    label: 'Encoding Error',
    icon: <FiFileText />,
    color: '#f59e0b',
    bgColor: '#fef3c7'
  },
  conversion_failed: {
    label: 'Conversion Failed',
    icon: <FiAlertCircle />,
    color: '#dc2626',
    bgColor: '#fee2e2'
  },
  extraction_failed: {
    label: 'Extraction Failed',
    icon: <FiAlertTriangle />,
    color: '#dc2626',
    bgColor: '#fee2e2'
  },
  clamav_unavailable: {
    label: 'Security Check Failed',
    icon: <FiShield />,
    color: '#dc2626',
    bgColor: '#fee2e2'
  },
  malformed_file: {
    label: 'Invalid Format',
    icon: <FiXCircle />,
    color: '#dc2626',
    bgColor: '#fee2e2'
  },
  schema_validation_failed: {
    label: 'Schema Mismatch',
    icon: <FiAlertTriangle />,
    color: '#f59e0b',
    bgColor: '#fef3c7'
  }
};

export const DLQBadge = ({ reasonCode, errorMessage, compact = false }) => {
  if (!reasonCode) {
    return (
      <span className="dlq-badge dlq-badge-default" title={errorMessage || 'Processing failed'}>
        <FiAlertCircle />
        {!compact && <span className="dlq-badge-text">Failed</span>}
      </span>
    );
  }

  const config = DLQ_REASON_CONFIG[reasonCode] || {
    label: 'Failed',
    icon: <FiAlertCircle />,
    color: '#dc2626',
    bgColor: '#fee2e2'
  };

  return (
    <span
      className={`dlq-badge ${compact ? 'dlq-badge-compact' : ''}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        borderColor: config.color
      }}
      title={errorMessage || config.label}
    >
      {config.icon}
      {!compact && <span className="dlq-badge-text">{config.label}</span>}
    </span>
  );
};
DLQBadge.propTypes = {
  reasonCode: PropTypes.string,
  errorMessage: PropTypes.string,
  compact: PropTypes.bool
};

DLQBadge.defaultProps = {
  compact: false
};
export const DLQReasonText = ({ reasonCode, errorMessage }) => {
  if (!reasonCode) {
    return <span className="dlq-reason-text" title={errorMessage || 'Processing failed'}>Failed</span>;
  }

  const config = DLQ_REASON_CONFIG[reasonCode] || { label: 'Failed' };

  return (
    <span className="dlq-reason-text" title={errorMessage || config.label}>
      {config.label}
    </span>
  );
};
DLQReasonText.propTypes = {
  reasonCode: PropTypes.string,
  errorMessage: PropTypes.string
};
export default DLQBadge;
