import React from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';
import './styles/Toast.css';
import PropTypes from 'prop-types';


const Toast = ({ notification, onClose }) => {
  const { id, message, type } = notification;

  const icons = {
    success: <FiCheckCircle className="toast-icon" />,
    error: <FiAlertCircle className="toast-icon" />,
    info: <FiInfo className="toast-icon" />
  };

  return (
    <div className={`toast toast-${type}`} role="alert" aria-live="polite">
      <div className="toast-content">
        {icons[type]}
        <span className="toast-message">{message}</span>
      </div>
      <button
        className="toast-close"
        onClick={() => onClose(id)}
        aria-label="Close notification"
      >
        <FiX />
      </button>
    </div>
  );
};
Toast.propTypes = {
  notification: PropTypes.shape({
    id: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number
    ]).isRequired,

    message: PropTypes.string.isRequired,

    type: PropTypes.oneOf(['success', 'error', 'info']).isRequired
  }).isRequired,

  onClose: PropTypes.func.isRequired
};

export default Toast;
