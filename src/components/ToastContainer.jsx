import React from 'react';
import { useNotification } from '../contexts/NotificationContext';
import Toast from './Toast';
import './styles/Toast.css';

const ToastContainer = () => {
  const { notifications, removeNotification } = useNotification();

  return (
    <div className="toast-container">
      {notifications.map(notification => (
        <Toast
          key={notification.id}
          notification={notification}
          onClose={removeNotification}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
