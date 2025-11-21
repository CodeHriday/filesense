import React, { useEffect, useState } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';

export const OAuth2Callback = () => {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing authorization...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success') === 'true';
    const error = params.get('error');
    const connectionName = params.get('connection_name');

    if (success) {
      setStatus('success');
      setMessage(connectionName ? `${connectionName} connected successfully!` : 'Authorization successful!');
      
      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth2_success',
          connectionName
        }, window.location.origin);
      }

      // Close window after 2 seconds
      setTimeout(() => {
        window.close();
      }, 2000);
    } else {
      setStatus('error');
      setMessage(error || 'Authorization failed');
      
      // Send error message to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth2_error',
          error: error || 'Authorization failed'
        }, window.location.origin);
      }

      // Close window after 3 seconds
      setTimeout(() => {
        window.close();
      }, 3000);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f9fafb',
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        padding: '3rem',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        maxWidth: '400px',
        textAlign: 'center'
      }}>
        {status === 'processing' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1.5rem'
            }} />
            <h2 style={{ color: '#111827', marginBottom: '0.5rem' }}>Processing</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              backgroundColor: '#10b981',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <FiCheck size={32} color="white" />
            </div>
            <h2 style={{ color: '#111827', marginBottom: '0.5rem' }}>Success!</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>{message}</p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '1rem' }}>
              This window will close automatically...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              backgroundColor: '#ef4444',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <FiX size={32} color="white" />
            </div>
            <h2 style={{ color: '#111827', marginBottom: '0.5rem' }}>Error</h2>
            <p style={{ color: '#6b7280', margin: 0 }}>{message}</p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '1rem' }}>
              This window will close automatically...
            </p>
          </>
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};
