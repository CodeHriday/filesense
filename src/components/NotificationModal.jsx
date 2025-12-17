import React, { useEffect } from 'react';
import { FiCheckCircle, FiXCircle, FiX } from 'react-icons/fi';
import './NotificationModal.css';
import PropTypes from 'prop-types';

function NotificationModal({ 
  isOpen, 
  onClose, 
  type = 'success',
  title,
  message,
  autoClose = true,
  autoCloseDelay = 3000
}) {
  useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  const isSuccess = type === 'success';
  const Icon = isSuccess ? FiCheckCircle : FiXCircle;
  const defaultTitle = isSuccess ? 'Success' : 'Error';

  return (
    <div className="notification-modal-overlay" onClick={onClose}>
      <div 
        className={`notification-modal-content ${type}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notification-modal-header">
          <div className="notification-title-section">
            <Icon className={`notification-icon ${type}`} />
            <h3>{title || defaultTitle}</h3>
          </div>
          <button className="notification-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="notification-modal-body">
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
}
NotificationModal.propTypes = {
  
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  type: PropTypes.oneOf(['success', 'error']),
  title: PropTypes.string,
  message: PropTypes.string.isRequired,
  autoClose: PropTypes.bool,
  autoCloseDelay: PropTypes.number
};

export default NotificationModal;
