import React from 'react';
import { FiX, FiAlertTriangle, FiFileText, FiFile, FiZap, FiDatabase, FiSlash, FiTrash2 } from 'react-icons/fi';
import './DeleteConfirmationModal.css';

function DeleteConfirmationModal({ 
  isOpen, 
  onClose, 
  agreement, 
  dependencies, 
  onDelete, 
  onDisable 
}) {
  if (!isOpen || !agreement) return null;

  const { canDelete, dependencies: deps } = dependencies || { canDelete: true, dependencies: {} };
  const hasDependencies = deps && deps.total > 0;

  const handleConfirmDelete = () => {
    onDelete(agreement.id);
    onClose();
  };

  const handleConfirmDisable = () => {
    onDisable(agreement.id, agreement.file_name);
    onClose();
  };

  return (
    <div className="delete-modal-overlay" onClick={onClose}>
      <div className="delete-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="delete-modal-header">
          <div className="delete-modal-title-section">
            <FiAlertTriangle className="warning-icon" />
            <h2>{hasDependencies ? 'Cannot Delete Contract' : 'Delete Contract'}</h2>
          </div>
          <button className="delete-modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="delete-modal-body">
          <div className="agreement-info-section">
            <h3>Contract Details</h3>
            <div className="info-row">
              <span className="info-label">Name:</span>
              <span className="info-value">{agreement.file_name || 'Untitled'}</span>
            </div>
            {agreement.agreement_code && (
              <div className="info-row">
                <span className="info-label">Code:</span>
                <span className="info-value">{agreement.agreement_code}</span>
              </div>
            )}
            {agreement.vendor_name && (
              <div className="info-row">
                <span className="info-label">Vendor:</span>
                <span className="info-value">{agreement.vendor_name}</span>
              </div>
            )}
          </div>

          {hasDependencies ? (
            <>
              <div className="dependencies-warning">
                <FiAlertTriangle className="warning-icon-large" />
                <p className="warning-message">
                  This contract has associated files and configurations. Deletion is not allowed to protect data integrity.
                </p>
              </div>

              <div className="dependencies-section">
                <h3>Associated Assets</h3>
                <div className="dependencies-list">
                  {deps.fileSchemas > 0 && (
                    <div className="dependency-item">
                      <FiFileText className="dep-icon" />
                      <span className="dep-label">File Configurations:</span>
                      <span className="dep-count">{deps.fileSchemas}</span>
                    </div>
                  )}
                  {deps.documents > 0 && (
                    <div className="dependency-item">
                      <FiFile className="dep-icon" />
                      <span className="dep-label">Documents:</span>
                      <span className="dep-count">{deps.documents}</span>
                    </div>
                  )}
                  {deps.transformationMappings > 0 && (
                    <div className="dependency-item">
                      <FiZap className="dep-icon" />
                      <span className="dep-label">Transformation Mappings:</span>
                      <span className="dep-count">{deps.transformationMappings}</span>
                    </div>
                  )}
                  {deps.transformationJobs > 0 && (
                    <div className="dependency-item">
                      <FiDatabase className="dep-icon" />
                      <span className="dep-label">Transformation Jobs:</span>
                      <span className="dep-count">{deps.transformationJobs}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="alternative-action-section">
                <p className="alternative-message">
                  You can <strong>disable</strong> this contract instead. This will prevent new files from being processed while preserving existing data.
                </p>
              </div>
            </>
          ) : (
            <div className="delete-confirmation-section">
              <p className="delete-message">
                This contract has no associated files or configurations. Are you sure you want to delete it? This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        <div className="delete-modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          {hasDependencies ? (
            <button className="btn-disable" onClick={handleConfirmDisable}>
              <FiSlash /> Disable Contract
            </button>
          ) : (
            <button className="btn-delete-confirm" onClick={handleConfirmDelete}>
              <FiTrash2 /> Delete Contract
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmationModal;
