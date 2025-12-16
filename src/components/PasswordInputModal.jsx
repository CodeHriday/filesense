import React, { useState } from 'react';
import { FiLock, FiX } from 'react-icons/fi';
import './PasswordInputModal.css';
import PropTypes from 'prop-types';

export const PasswordInputModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  fileName,
  isSubmitting = false 
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password);
      setPassword('');
    }
  };

  const handleClose = () => {
    setPassword('');
    setShowPassword(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content password-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <FiLock /> Password Required
          </h3>
          <button className="modal-close-btn" onClick={handleClose}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          <p className="password-modal-text">
            This archive is password-protected. Please provide the password to extract and process:
          </p>
          <p className="password-modal-filename">
            <strong>{fileName}</strong>
          </p>

          <form onSubmit={handleSubmit} className="password-form">
            <div className="password-input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter archive password"
                className="password-input"
                autoFocus
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isSubmitting}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="password-modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={!password.trim() || isSubmitting}
              >
                {isSubmitting ? 'Processing...' : 'Submit & Process'}
              </button>
            </div>
          </form>

          <p className="password-modal-note">
            <small>
              Passwords are encrypted with AES-256 and temporarily stored only for processing.
              They are automatically deleted after successful extraction.
            </small>
          </p>
        </div>
      </div>
    </div>
  );
};


PasswordInputModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  fileName: PropTypes.string,
  isSubmitting: PropTypes.bool
};

PasswordInputModal.defaultProps = {
  fileName: '',
  isSubmitting: false
};

export default PasswordInputModal;
