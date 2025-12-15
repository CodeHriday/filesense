import React, { useState } from 'react';
import '../styles/UserManagement.css';
import PropTypes from 'prop-types';

const TransferOwnershipModal = ({ 
  isOpen, 
  onClose, 
  user, 
  dependencies, 
  vendorContacts, 
  onTransfer 
}) => {
  const [selectedContactId, setSelectedContactId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState('');

  // Reset state when modal opens or user changes
  React.useEffect(() => {
    if (isOpen && user) {
      setSelectedContactId('');
      setError('');
    }
  }, [isOpen, user?.id]);

  if (!isOpen || !user || !dependencies) return null;

  const handleTransfer = async () => {
    if (!selectedContactId) {
      const isVendorUser = user.vendor_id || user.user_type === 'Vendor';
      const contactLabel = isVendorUser ? 'vendor contact' : 'replacement user';
      setError(`Please select a ${contactLabel}`);
      return;
    }

    setError('');
    setIsTransferring(true);

    try {
      await onTransfer(user.id, parseInt(selectedContactId));
      onClose();
    } catch (err) {
      // Extract error message from backend response
      let errorMessage = 'Failed to transfer ownership';
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsTransferring(false);
    }
  };

  const totalDependencies = 
    dependencies.vendors.length +
    dependencies.agreements.length +
    dependencies.mappings.length +
    dependencies.catalogs.length +
    dependencies.projects.length;

  // All contacts are already filtered by the backend based on user type
  // No additional filtering needed
  const eligibleContacts = vendorContacts.filter(contact => contact.id !== user.id);
  
  // Determine if user is a vendor user or internal user
  const isVendorUser = user.vendor_id || user.user_type === 'Vendor';
  const contactLabel = isVendorUser ? 'Vendor Contact' : 'Replacement User';

  return (
    <div className="modal-overlay">
      <div className="modal-content large-modal">
        <div className="modal-header">
          <h2>Transfer Ownership Required</h2>
          <button className="close-modal-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '20px' }}>
            <div className="delete-warning-icon">⚠️</div>
            <p className="delete-confirmation-text">
              Cannot delete user <strong>{user.username}</strong> because they have {totalDependencies} associated asset(s).
            </p>
            <p style={{ marginTop: '10px', color: '#5f6368' }}>
              Please transfer ownership to another {contactLabel.toLowerCase()} before deletion.
            </p>
          </div>

          {error && (
            <div className="error-message" style={{ marginBottom: '15px' }}>
              {error}
            </div>
          )}

          {/* Dependencies Summary */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
            <h3 style={{ marginBottom: '15px', fontSize: '16px', color: '#333' }}>Assets Associated with this User:</h3>
            
            {dependencies.vendors.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong>Vendors ({dependencies.vendors.length}):</strong>
                <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                  {dependencies.vendors.map(vendor => (
                    <li key={vendor.id}>
                      {vendor.vendor_name} ({vendor.vendor_code})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dependencies.agreements.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong>Vendor Agreements ({dependencies.agreements.length}):</strong>
                <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                  {dependencies.agreements.map(agreement => (
                    <li key={agreement.id}>
                      {agreement.agreement_code}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dependencies.mappings.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong>Transformation Mappings ({dependencies.mappings.length}):</strong>
                <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                  {dependencies.mappings.map(mapping => (
                    <li key={mapping.mapping_id}>
                      {mapping.mapping_name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dependencies.catalogs.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong>Uploaded Files ({dependencies.catalogs.length}):</strong>
                <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                  {dependencies.catalogs.map(catalog => (
                    <li key={catalog.id}>
                      File ID: {catalog.file_id}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dependencies.projects.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong>Projects ({dependencies.projects.length}):</strong>
                <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                  {dependencies.projects.map(project => (
                    <li key={project.id}>
                      {project.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Contact Selection */}
          <div>
            <label htmlFor="replacement-contact" style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Transfer Ownership To ({contactLabel}):
            </label>
            <select
              id="replacement-contact"
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '14px'
              }}
              disabled={isTransferring}
            >
              <option value="">-- Select a {contactLabel.toLowerCase()} --</option>
              {eligibleContacts.map(contact => (
                <option key={contact.id} value={contact.id}>
                  {contact.username} ({contact.email})
                </option>
              ))}
            </select>
            {eligibleContacts.length === 0 && (
              <p style={{ marginTop: '8px', color: '#d93025', fontSize: '13px' }}>
                No eligible {contactLabel.toLowerCase()}s available for transfer.
                {isVendorUser ? ' (Must be from the same vendor organization)' : ' (Must be internal users)'}
              </p>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            className="cancel-btn" 
            onClick={onClose}
            disabled={isTransferring}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="save-btn" 
            onClick={handleTransfer}
            disabled={isTransferring || !selectedContactId}
          >
            {isTransferring ? 'Transferring...' : 'Transfer & Delete User'}
          </button>
        </div>
      </div>
    </div>
  );
};

TransferOwnershipModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    username: PropTypes.string,
    vendor_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    user_type: PropTypes.string
  }),
  dependencies: PropTypes.shape({
    vendors: PropTypes.arrayOf(PropTypes.object),
    agreements: PropTypes.arrayOf(PropTypes.object),
    mappings: PropTypes.arrayOf(PropTypes.object),
    catalogs: PropTypes.arrayOf(PropTypes.object),
    projects: PropTypes.arrayOf(PropTypes.object)
  }),
  vendorContacts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      username: PropTypes.string,
      email: PropTypes.string
    })
  ),
  onTransfer: PropTypes.func.isRequired,
};

TransferOwnershipModal.defaultProps = {
  isOpen: false,
  onClose: () => {},
  user: null,
  dependencies: {
    vendors: [],
    agreements: [],
    mappings: [],
    catalogs: [],
    projects: []
  },
  vendorContacts: [],
  onTransfer: () => {}
};

export default TransferOwnershipModal;
