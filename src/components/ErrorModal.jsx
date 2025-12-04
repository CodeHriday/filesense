import React from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';

const ErrorModal = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '16px 20px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiAlertCircle style={{ color: '#dc3545', fontSize: '22px' }} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#333' }}>Error</h2>
          </div>
          <button 
            onClick={onClose} 
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666'
            }}
          >
            <FiX style={{ fontSize: '18px' }} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ 
            margin: 0, 
            color: '#333', 
            lineHeight: '1.6',
            fontSize: '14px'
          }}>
            {message}
          </p>
        </div>
        <div style={{ 
          display: 'flex',
          justifyContent: 'flex-end', 
          padding: '12px 20px',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#fafafa'
        }}>
          <button 
            onClick={onClose}
            style={{
              backgroundColor: '#2e7d32',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 24px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              minWidth: 'auto',
              width: 'auto'
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
