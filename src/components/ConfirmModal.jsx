import React from 'react';
import ReactDOM from 'react-dom';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const variantColors = {
    danger: { bg: '#fff5f5', color: '#e53e3e', btnBg: '#e53e3e', btnHover: '#c53030' },
    warning: { bg: '#fffaf0', color: '#dd6b20', btnBg: '#dd6b20', btnHover: '#c05621' },
    info: { bg: '#ebf8ff', color: '#3182ce', btnBg: '#3182ce', btnHover: '#2b6cb0' }
  };

  const colors = variantColors[variant] || variantColors.danger;

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    },
    content: {
      background: 'white',
      borderRadius: '6px',
      width: '90%',
      maxWidth: '400px',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: 'hidden'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '14px 20px 12px 20px',
      borderBottom: '1px solid #e2e8f0',
      position: 'relative'
    },
    icon: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      fontSize: '16px',
      backgroundColor: colors.bg,
      color: colors.color
    },
    title: {
      flex: 1,
      margin: 0,
      fontSize: '13px',
      fontWeight: 600,
      color: '#333333'
    },
    closeBtn: {
      position: 'absolute',
      top: '14px',
      right: '16px',
      background: 'none',
      border: 'none',
      fontSize: '16px',
      color: '#666666',
      cursor: 'pointer',
      padding: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    body: {
      padding: '16px 20px'
    },
    message: {
      margin: 0,
      color: '#666666',
      fontSize: '12px',
      lineHeight: 1.6
    },
    footer: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      padding: '12px 20px 14px 20px',
      borderTop: '1px solid #e2e8f0'
    },
    cancelBtn: {
      padding: '8px 16px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
      border: '1px solid #e2e8f0',
      background: '#f7fafc',
      color: '#333333',
      cursor: 'pointer'
    },
    confirmBtn: {
      padding: '8px 16px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
      border: 'none',
      background: colors.btnBg,
      color: 'white',
      cursor: 'pointer'
    }
  };

  const modalContent = (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.content} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.icon}>
            <FiAlertTriangle />
          </div>
          <h3 style={styles.title}>{title}</h3>
          <button style={styles.closeBtn} onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div style={styles.body}>
          <p style={styles.message}>{message}</p>
        </div>
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>
            {cancelText}
          </button>
          <button style={styles.confirmBtn} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default ConfirmModal;
