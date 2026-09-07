import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell } from 'react-icons/fa';
import {
  FiBell, FiAlertTriangle, FiCheckCircle, FiAlertCircle,
  FiSettings, FiLink, FiFileText,
} from 'react-icons/fi';
import { useAPINotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../hooks/useAPINotifications';
import './NotificationBell.css';

// ── Strip leading emoji from stored titles (mirrors Notifications.jsx) ───────
const LEADING_EMOJI_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u;
function stripLeadingEmoji(text = '') {
  return text.replace(LEADING_EMOJI_RE, '').trim();
}

// ── SVG icon per notification type (mirrors Notifications.jsx) ───────────────
function NotificationIcon({ type }) {
  if (type === 'job_run_completed_with_warnings') {
    return <FiAlertTriangle className="nb-notif-icon nb-notif-icon-warning" />;
  }
  if (type === 'job_run_completed') {
    return <FiCheckCircle className="nb-notif-icon nb-notif-icon-success" />;
  }
  if (type === 'job_run_failed' || type === 'job_run_aborted') {
    return <FiAlertCircle className="nb-notif-icon nb-notif-icon-error" />;
  }
  if (type?.startsWith('job_run_')) {
    return <FiSettings className="nb-notif-icon nb-notif-icon-neutral" />;
  }
  if (type?.startsWith('workflow_')) {
    return <FiLink className="nb-notif-icon nb-notif-icon-neutral" />;
  }
  if (type?.includes('approved')) {
    return <FiCheckCircle className="nb-notif-icon nb-notif-icon-success" />;
  }
  if (type?.includes('rejected')) {
    return <FiAlertCircle className="nb-notif-icon nb-notif-icon-error" />;
  }
  if (type?.startsWith('vendor_contract_')) {
    return <FiFileText className="nb-notif-icon nb-notif-icon-neutral" />;
  }
  return <FiBell className="nb-notif-icon nb-notif-icon-default" />;
}

function NotificationBell() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  
  // Poll every 30 seconds so the badge stays current while the user works
  const { data, refetch } = useAPINotifications({ refetchInterval: 30 * 1000 });
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  
  const notifications = useMemo(() => data?.notifications || [], [data]);
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const loading = markAllReadMutation.isPending;

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetch]);

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }

    setDropdownOpen(false);

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const markAllAsRead = () => {
    markAllReadMutation.mutate();
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <FaBell />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {dropdownOpen && (
        <div className="notification-dropdown">
          <div className="notification-bell-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={markAllAsRead}
                disabled={loading}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.is_read ? 'read' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-content">
                    <div className="notification-title-row">
                      <span className="notification-title">{stripLeadingEmoji(notification.title)}</span>
                      <span className="notification-time">{formatTimestamp(notification.created_at)}</span>
                    </div>
                    <div className="notification-message">{notification.message}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-footer">
              <button onClick={() => { setDropdownOpen(false); navigate('/notifications'); }}>
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
