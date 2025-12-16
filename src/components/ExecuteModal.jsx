import React from 'react';
import { FiCheckCircle, FiXCircle, FiX } from 'react-icons/fi';
import './styles/Modal.css';
import PropTypes from 'prop-types';

const ExecuteModal = ({ isOpen, onClose, success, message, groupName }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{success ? 'Execution Started' : 'Execution Failed'}</h3>
          <button onClick={onClose} className="modal-close-btn">
            <FiX />
          </button>
        </div>
        
        <div className="modal-body">
          <div className={`execute-status-icon ${success ? 'success' : 'error'}`}>
            {success ? <FiCheckCircle size={48} /> : <FiXCircle size={48} />}
          </div>
          
          <div className="execute-status-message">
            {groupName && <p className="group-name-text">Group: <strong>{groupName}</strong></p>}
            <p className="status-message">{message}</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
ExecuteModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  success: PropTypes.bool.isRequired,
  message: PropTypes.string.isRequired,
  groupName: PropTypes.string
};
export default ExecuteModal;
