import React, { useEffect } from 'react';
import { useNotifications } from '../../hooks';
import './Notifications.css';
import PropTypes from 'prop-types';

export const NotificationList = () => {
  const { notifications, removeNotification } = useNotifications();
  
  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <Notification 
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
};

const Notification = ({ notification, onClose }) => {
  const { id, message, type, duration } = notification;
  
  // Auto-dismiss after duration (if positive)
  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);
  
  return (
    <div className={`notification notification-${type}`}>
      <div className="notification-content">
        <div className="notification-message">{message}</div>
      </div>
      <button 
        className="notification-close" 
        onClick={onClose}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
};
import PropTypes from 'prop-types';

NotificationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  type: PropTypes.oneOf(['success', 'error']),
  title: PropTypes.string,
  message: PropTypes.string.isRequired,
  autoClose: PropTypes.bool,
  autoCloseDelay: PropTypes.number
};

export default NotificationList;