import React from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';
import './styles/Toast.css';

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

export default Toast;
