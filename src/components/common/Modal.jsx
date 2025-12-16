import React, { useEffect, useRef } from 'react';
import './Modal.css';
import PropTypes from 'prop-types';

const Modal = ({ isOpen, onClose, children, className = '' }) => {
  const modalRef = useRef(null);
  
  // Handle click outside of modal content to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    // Handle ESC key to close modal
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    if (isOpen) {
      document.body.style.overflow = 'hidden'; // Prevent scrolling when modal is open
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
    }
    
    return () => {
      document.body.style.overflow = 'auto'; // Re-enable scrolling when modal is closed
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);
  
  // Accessibility: trap focus inside modal
  useEffect(() => {
    if (!isOpen) return;
    
    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleTabKey = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    modalRef.current.addEventListener('keydown', handleTabKey);
    
    // Focus first element when modal opens
    if (firstElement) {
      firstElement.focus();
    }
    
    return () => {
      if (modalRef.current) {
        modalRef.current.removeEventListener('keydown', handleTabKey);
      }
    };
  }, [isOpen]);
  
  if (!isOpen) {
    return null;
  }
  
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-content ${className}`} ref={modalRef}>
        <button 
          className="modal-close-button" 
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
};
Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};
export default Modal;