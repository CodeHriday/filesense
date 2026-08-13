import React from 'react';
import { FiAlertCircle, FiAlertTriangle, FiInfo, FiCheckCircle } from 'react-icons/fi';
import './styles/ConfirmationModal.css';
import PropTypes from 'prop-types';

/**
 * ConfirmationModal - A standardized compact modal for confirmations and alerts
 * 
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onConfirm - Callback when confirm button is clicked
 * @param {string} title - Modal title
 * @param {string} message - Main message to display
 * @param {string} subMessage - Optional secondary message (e.g., "This action cannot be undone.")
 * @param {string} confirmText - Text for confirm button (default: 'Confirm')
 * @param {string} cancelText - Text for cancel button (default: 'Cancel')
 * @param {string} variant - 'danger' | 'warning' | 'info' | 'success' (default: 'danger')
 * @param {boolean} showCancel - Whether to show cancel button (default: true)
 * @param {React.ReactNode} children - Optional extra content rendered between body and footer
 */
const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  subMessage,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  showCancel = true,
  children
}) => {
  if (!isOpen) return null;

  const icons = {
    danger: <FiAlertCircle size={28} />,
    warning: <FiAlertTriangle size={28} />,
    info: <FiInfo size={28} />,
    success: <FiCheckCircle size={28} />
  };

  return (
    <div className="confirmation-modal-overlay" onClick={onClose}>
      <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirmation-modal-header">
          <h3>{title}</h3>
          <button className="confirmation-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        
        <div className="confirmation-modal-body">
          <div className={`confirmation-icon confirmation-icon--${variant}`}>
            {icons[variant]}
          </div>
          <p className="confirmation-message">{message}</p>
          {subMessage && <p className="confirmation-sub-message">{subMessage}</p>}
        </div>

        {children && (
          <div className="confirmation-modal-extra">
            {children}
          </div>
        )}

        <div className="confirmation-modal-footer">
          {showCancel && (
            <button className="confirmation-btn confirmation-btn--cancel" onClick={onClose}>
              {cancelText}
            </button>
          )}
          <button className={`confirmation-btn confirmation-btn--${variant}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
// Add PropTypes validation
ConfirmationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string.isRequired,
  subMessage: PropTypes.string,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  variant: PropTypes.oneOf(['danger', 'warning', 'info', 'success']),
  showCancel: PropTypes.bool,
};

export default ConfirmationModal;
