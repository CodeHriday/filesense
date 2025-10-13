import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import './DeleteConfirmationModal.css';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, fileName, isDeleting }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <FiAlertTriangle />
            Confirm Deletion
          </h2>
        </div>
        <div className="modal-body">
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
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
