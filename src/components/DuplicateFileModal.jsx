import React from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import './DuplicateFileModal.css';
import PropTypes from 'prop-types';

const DuplicateFileModal = ({ existingFile, onReplace, onKeepBoth, onCancel }) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="duplicate-modal-overlay">
      <div className="duplicate-modal">
        <div className="modal-header">
          <div className="modal-title">
            <FiAlertTriangle className="warning-icon" />
            <h2>Duplicate File Detected</h2>
          </div>
          <button className="modal-close" onClick={onCancel}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-message">
            A file with identical content already exists in your system.
          </p>

          <div className="existing-file-info">
            <h3>Existing File</h3>
            <div className="file-details">
              <div className="detail-row">
                <span className="label">Filename:</span>
                <span className="value">{existingFile.filename}</span>
              </div>
              <div className="detail-row">
                <span className="label">Size:</span>
                <span className="value">{formatFileSize(existingFile.fileSize)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Uploaded:</span>
                <span className="value">{formatDate(existingFile.uploadedAt)}</span>
              </div>
            </div>
          </div>

          <p className="modal-question">
            What would you like to do?
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn btn-danger" onClick={onReplace}>
            Replace Existing File
          </button>
          <button className="btn btn-secondary" onClick={onKeepBoth}>
            Keep Both Files
          </button>
          <button className="btn btn-outline" onClick={onCancel}>
            Cancel Upload
          </button>
        </div>
      </div>
    </div>
  );
};
DuplicateFileModal.propTypes = {
  existingFile: PropTypes.shape({
    filename: PropTypes.string.isRequired,
    fileSize: PropTypes.number.isRequired,
    uploadedAt: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date)
    ]).isRequired
  }).isRequired,
  onReplace: PropTypes.func.isRequired,
  onKeepBoth: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};
export default DuplicateFileModal;
