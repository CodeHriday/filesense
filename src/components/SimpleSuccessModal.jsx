import React from 'react';
import ThreeSectionModal from './ThreeSectionModal';
import PropTypes from 'prop-types';

const SimpleSuccessModal = ({
  isOpen,
  onClose,
  title = 'Success',
  message
}) => {
  return (
    <ThreeSectionModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <button 
          onClick={onClose}
          style={{ 
            background: '#16a34a',
            color: 'white',
            padding: '8px 24px',
            borderRadius: '5px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          OK
        </button>
      }
    >
      <div style={{ padding: '1rem 0', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <p style={{ fontSize: '1rem', lineHeight: '1.5', color: '#374151' }}>
          {message}
        </p>
      </div>
    </ThreeSectionModal>
  );
};
SimpleSuccessModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.node
  ]).isRequired
};

export default SimpleSuccessModal;
