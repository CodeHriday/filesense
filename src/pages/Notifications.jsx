import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiBell, FiCheck, FiX, FiTrash2, FiMail } from 'react-icons/fi';
import './Notifications.css';

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/notifications');
      setNotifications(response.data.notifications || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/read`);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
      setTimeout(() => setError(''), 3000);
    }
  };

  const markAsUnread = async (notificationId) => {
    try {
      await axios.put(`/api/notifications/${notificationId}/unread`);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: false } : n
        )
      );
    } catch (err) {
      console.error('Error marking notification as unread:', err);
      setError('Failed to mark notification as unread');
      setTimeout(() => setError(''), 3000);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!window.confirm('Are you sure you want to delete this notification?')) {
      return;
    }

    try {
      await axios.delete(`/api/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      console.error('Error deleting notification:', err);
      setError('Failed to delete notification');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const getFilteredNotifications = () => {
    switch (filter) {
      case 'unread':
        return notifications.filter(n => !n.is_read);
      case 'read':
        return notifications.filter(n => n.is_read);
      default:
        return notifications;
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const getNotificationIcon = (type) => {
    const iconMap = {
      // Vendor contract notifications
      vendor_contract_pending_vendor: '📄',
      vendor_contract_pending_governance: '🔍',
      vendor_contract_rejected_manager: '❌',
      vendor_contract_approved: '✅',
      vendor_contract_pending_manager: '👤',
      // Job run notifications
      job_run_completed: '✅',
      job_run_completed_with_warnings: '⚠️',
      job_run_failed: '❌',
    };
    return iconMap[type] || '🔔';
  };

  const getJobStats = (notification) => {
    if (!notification.notification_type?.startsWith('job_run_')) return null;
    const meta = typeof notification.metadata === 'string'
      ? JSON.parse(notification.metadata)
      : (notification.metadata || {});
    const stats = [];
    if (meta.filesProcessed != null) stats.push(`${meta.filesProcessed} file(s)`);
    if (meta.rowsWritten != null) stats.push(`${meta.rowsWritten} rows written`);
    if (meta.dqViolationCount > 0) stats.push(`${meta.dqViolationCount} DQ violation(s)`);
    return stats.length ? stats.join(' · ') : null;
  };

  const filteredNotifications = getFilteredNotifications();
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const readCount = notifications.filter(n => n.is_read).length;

  if (loading) {
    return (
      <div className="notifications-page">
        <div className="notifications-header">
          <h1>Notifications</h1>
        </div>
        <div className="loading-state">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <div className="header-left">
          <FiBell className="page-icon" />
          <h1>Notifications</h1>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="notifications-filters">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </button>
        <button
          className={`filter-tab ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
        <button
          className={`filter-tab ${filter === 'read' ? 'active' : ''}`}
          onClick={() => setFilter('read')}
        >
          Read ({readCount})
        </button>
      </div>

      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <FiBell className="empty-icon" />
            <p>No {filter !== 'all' ? filter : ''} notifications</p>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div
              key={notification.id}
              className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
            >
              <div
                className="notification-content-wrapper"
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-icon">
                  {getNotificationIcon(notification.notification_type)}
                </div>
                <div className="notification-details">
                  <div className="notification-title">
                    {notification.title}
                    {!notification.is_read && <span className="unread-dot"></span>}
                  </div>
                  <div className="notification-message">{notification.message}</div>
                  {getJobStats(notification) && (
                    <div className="notification-job-stats" style={{
                      fontSize: '12px',
                      color: '#888',
                      marginTop: '4px',
                      fontFamily: 'monospace'
                    }}>
                      {getJobStats(notification)}
                    </div>
                  )}
                  <div className="notification-timestamp">
                    {formatTimestamp(notification.created_at)}
                  </div>
                </div>
              </div>
              <div className="notification-actions">
                {!notification.is_read ? (
                  <button
                    className="action-btn mark-read"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsRead(notification.id);
                    }}
                    title="Mark as read"
                  >
                    <FiCheck />
                  </button>
                ) : (
                  <button
                    className="action-btn mark-unread"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsUnread(notification.id);
                    }}
                    title="Mark as unread"
                  >
                    <FiMail />
                  </button>
                )}
                <button
                  className="action-btn delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification(notification.id);
                  }}
                  title="Delete"
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Notifications;
