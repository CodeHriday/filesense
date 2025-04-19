import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FiX } from 'react-icons/fi';
import './Modal.css';

const Modal = ({
  children,
  title,
  onClose,
  size = 'medium'
}) => {
  useEffect(() => {
    // Lock body scroll when modal is open
    document.body.style.overflow = 'hidden';
    
    // Clean up function to unlock scroll when modal closes
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Close modal on escape key press
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent click propagation on modal content
  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className={`modal-container modal-${size}`}
        onClick={handleContentClick}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button 
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX size={20} />
          </button>
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
  
  console.log("Modal is rendering", { title });
  
  // Use React Portal to render modal at the document body level
  return ReactDOM.createPortal(
    modalContent,
    document.body
  );
};

export default Modal;