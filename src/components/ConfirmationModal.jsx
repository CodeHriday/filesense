import React from 'react';
import ThreeSectionModal from './ThreeSectionModal';

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonStyle = { background: '#dc2626' }
}) => {
  return (
    <ThreeSectionModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <>
          <button onClick={onClose}>
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            style={confirmButtonStyle}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ padding: '1rem 0' }}>
        <p style={{ fontSize: '1rem', lineHeight: '1.5' }}>
          {message}
        </p>
      </div>
    </ThreeSectionModal>
  );
};

export default ConfirmationModal;
