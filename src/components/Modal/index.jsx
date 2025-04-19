import React, { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import './Modal.css';

const Modal = ({ 
  title, 
  children, 
  onClose, 
  size = 'medium',
  showCloseButton = true
}) => {
  const modalRef = useRef(null);

  useEffect(() => {
    // Add event listener to handle escape key
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
    
    // Add event listener
    document.addEventListener('keydown', handleEscKey);

    // Focus the modal for accessibility
    if (modalRef.current) {
      modalRef.current.focus();
    }

    // Cleanup function
    return () => {
      document.body.style.overflow = 'auto';
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  // Close modal when clicking overlay (background), not the modal content
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div 
        className={`modal-container modal-${size}`} 
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={modalRef}
        tabIndex="-1"
      >
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">{title}</h2>
          {showCloseButton && (
            <button 
              className="modal-close-button" 
              onClick={onClose}
              aria-label="Close modal"
            >
              <FiX />
            </button>
          )}
        </div>
        
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;