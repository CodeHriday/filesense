import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, AUTH_STATUS } from '../context/AuthContext';
import { FiAlertTriangle, FiClock } from 'react-icons/fi';
import '../styles/global-page-styles.css';

const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const WARNING_BEFORE_LOGOUT_MS = 10 * 60 * 1000;
const LOGOUT_AFTER_WARNING_MS = 60 * 1000;

const InactivityTimer = () => {
  const { authStatus, logout, currentUser } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  
  const inactivityTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const clearAllTimers = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    clearAllTimers();
    setShowWarning(false);
    try {
      await logout();
    } catch (error) {
      console.error('Error during auto-logout:', error);
      window.location.href = '/login';
    }
  }, [logout, clearAllTimers]);

  const showWarningModal = useCallback(() => {
    setShowWarning(true);
    setSecondsRemaining(Math.floor(LOGOUT_AFTER_WARNING_MS / 1000));
    
    countdownIntervalRef.current = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    logoutTimerRef.current = setTimeout(() => {
      handleLogout();
    }, LOGOUT_AFTER_WARNING_MS);
  }, [handleLogout]);

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (showWarning) return;
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    const warningTimeout = INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS;
    
    inactivityTimerRef.current = setTimeout(() => {
      showWarningModal();
    }, warningTimeout);
  }, [showWarning, showWarningModal]);

  const handleStayLoggedIn = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setSecondsRemaining(60);
    resetInactivityTimer();
  }, [clearAllTimers, resetInactivityTimer]);

  useEffect(() => {
    if (authStatus !== AUTH_STATUS.AUTHENTICATED || !currentUser) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    resetInactivityTimer();

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      clearAllTimers();
    };
  }, [authStatus, currentUser, resetInactivityTimer, clearAllTimers]);

  if (authStatus !== AUTH_STATUS.AUTHENTICATED || !showWarning) {
    return null;
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '16px',
          padding: '20px 0'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FiAlertTriangle size={32} color="#d97706" />
          </div>
          
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            Session Timeout Warning
          </h2>
          
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px', lineHeight: 1.5 }}>
            Your session has been inactive. For security reasons, you will be automatically logged out.
          </p>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 600,
            color: '#92400e'
          }}>
            <FiClock size={20} />
            <span>Logging out in {secondsRemaining} seconds</span>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', width: '100%' }}>
            <button
              onClick={handleLogout}
              className="btn-secondary"
              style={{ flex: 1 }}
            >
              Log Out Now
            </button>
            <button
              onClick={handleStayLoggedIn}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              Stay Logged In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InactivityTimer;
