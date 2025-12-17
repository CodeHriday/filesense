import React from 'react';
import { FiX, FiAlertTriangle, FiDatabase, FiFileText, FiZap, FiTrash2, FiLoader } from 'react-icons/fi';
import './DeleteConfirmationModal.css';
import PropTypes from 'prop-types';

function ConnectionDeleteModal({ 
  isOpen, 
  onClose, 
  connection,
  dependencies,
  onConfirmDelete,
  isDeleting,
  checkingDependencies,
  deleteError
}) {
  if (!isOpen || !connection) return null;

  const { canDelete, inUse, dependencies: deps } = dependencies || { canDelete: true, inUse: false, dependencies: [] };
  const hasDependencies = inUse && deps && deps.length > 0;

  const handleConfirmDelete = () => {
    onConfirmDelete();
  };

  const getDependencyIcon = (type) => {
    if (type.includes('Vendor')) return <FiFileText className="dep-icon" />;
    if (type.includes('Transformation') || type.includes('Mapping')) return <FiZap className="dep-icon" />;
    return <FiDatabase className="dep-icon" />;
  };

  return (
    <div className="delete-modal-overlay" onClick={onClose}>
      <div className="delete-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="delete-modal-header">
          <div className="delete-modal-title-section">
            <FiAlertTriangle className="warning-icon" />
            <h2>{hasDependencies ? 'Cannot Delete Connection' : 'Delete Connection'}</h2>
          </div>
          <button className="delete-modal-close-btn" onClick={onClose} disabled={isDeleting}>
            <FiX />
          </button>
        </div>

        <div className="delete-modal-body">
          <div className="agreement-info-section">
            <h3>Connection Details</h3>
            <div className="info-row">
              <span className="info-label">Name:</span>
              <span className="info-value">{connection.connection_name || connection.name}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Type:</span>
              <span className="info-value">{connection.connection_type || connection.type}</span>
            </div>
            {connection.connection_direction && (
              <div className="info-row">
                <span className="info-label">Direction:</span>
                <span className="info-value">{connection.connection_direction}</span>
              </div>
            )}
          </div>

          {deleteError && (
            <div className="delete-error-section">
              <FiAlertTriangle className="error-icon" />
              <p className="error-message">{deleteError}</p>
            </div>
          )}

          {checkingDependencies ? (
            <div className="dependencies-loading">
              <FiLoader className="spinner" />
              <p>Checking connection dependencies...</p>
            </div>
          ) : hasDependencies ? (
            <>
              <div className="dependencies-warning">
                <FiAlertTriangle className="warning-icon-large" />
                <p className="warning-message">
                  This connection is currently in use and cannot be deleted. It is being used in the following places:
                </p>
              </div>

              <div className="dependencies-section">
                <h3>Dependencies</h3>
                <div className="dependencies-list">
                  {deps.map((dep, index) => (
                    <div key={`dep-${dep.type || dep.name || index}`} className="dependency-item-detailed">
                      <div className="dependency-header">
                        {getDependencyIcon(dep.type)}
                        <span className="dep-label">{dep.type}:</span>
                        <span className="dep-count">{dep.count}</span>
                      </div>
                      {dep.items && dep.items.length > 0 && (
                        <div className="dependency-items-list">
                          {dep.items.map((item, idx) => (
                            <div key={`item-${typeof item === 'string' ? item : item.name || idx}`} className="dependency-item-name">
                              • {typeof item === 'string' ? item : item.name}
                            </div>
                          ))}
                          {dep.count > dep.items.length && (
                            <div className="dependency-item-name more-items">
                              + {dep.count - dep.items.length} more...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="alternative-action-section">
                <p className="alternative-message">
                  To delete this connection, you must first remove it from all vendor agreements, transformation mappings, and mapping groups that use it.
                </p>
              </div>
            </>
          ) : (
            <div className="delete-confirmation-section">
              <p className="delete-message">
                This connection is not being used anywhere. Are you sure you want to delete it? This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        <div className="delete-modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          {!hasDependencies && !checkingDependencies && (
            <button 
              className="btn-delete-confirm" 
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <FiLoader className="spinner" /> Deleting...
                </>
              ) : (
                <>
                  <FiTrash2 /> Delete Connection
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConnectionDeleteModal;

ConnectionDeleteModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  connection: PropTypes.shape({
    connection_name: PropTypes.string,
    name: PropTypes.string,
    connection_type: PropTypes.string,
    type: PropTypes.string,
    connection_direction: PropTypes.string,
  }),
  dependencies: PropTypes.shape({
    canDelete: PropTypes.bool,
    inUse: PropTypes.bool,
    dependencies: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
        count: PropTypes.number,
        items: PropTypes.arrayOf(PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.shape({ name: PropTypes.string })
        ])),
      })
    ),
  }),
  onConfirmDelete: PropTypes.func.isRequired,
  isDeleting: PropTypes.bool,
  checkingDependencies: PropTypes.bool,
  deleteError: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
};

ConnectionDeleteModal.defaultProps = {
  isOpen: false,
  onClose: () => {},
  connection: {},
  dependencies: { canDelete: true, inUse: false, dependencies: [] },
  onConfirmDelete: () => {},
  isDeleting: false,
  checkingDependencies: false,
  deleteError: null,
};
