import React from 'react';
import { FiX, FiAlertCircle } from 'react-icons/fi';

const ErrorModal = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid #e0e0e0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiAlertCircle style={{ color: '#dc3545', fontSize: '24px' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Error</h2>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">
            <FiX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: '20px 0' }}>
          <p style={{ 
            margin: 0, 
            color: '#333', 
            lineHeight: '1.6',
            fontSize: '14px'
          }}>
            {message}
          </p>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #e0e0e0' }}>
          <button className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
