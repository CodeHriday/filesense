import React, { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import './styles/Modal.css';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer, 
  size = 'medium',
  closeOnOverlayClick = true
}) => {
  const modalRef = useRef(null);
  
  // Focus trap within modal
  useEffect(() => {
    if (isOpen) {
      // Set focus to modal
      if (modalRef.current) {
        modalRef.current.focus();
      }
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = 'visible';
    }
    
    return () => {
      document.body.style.overflow = 'visible';
    };
  }, [isOpen]);
  
  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);
  
  // Click outside to close
  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="modal-overlay" 
      onClick={handleOverlayClick}
    >
      <div 
        className={`modal modal-${size}`} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="modal-title"
        ref={modalRef}
        tabIndex="-1"
      >
        <div className="modal-header">
          <h3 id="modal-title" className="modal-title">{title}</h3>
          <button 
            className="modal-close-button" 
            onClick={onClose} 
            aria-label="Close modal"
          >
            <FiX />
          </button>
        </div>
        
        <div className="modal-content">
          {children}
        </div>
        
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;