import React from 'react';
import './DeleteConfirmationModal.css';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, fileName, isDeleting }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Confirm Deletion</h2>
        <p className="modal-message">
          Are you sure you want to delete <strong>"{fileName}"</strong>? This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button 
            className="modal-button cancel-button" 
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button 
            className="modal-button delete-button" 
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
