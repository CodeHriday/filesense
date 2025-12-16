import { useState, useCallback, useContext, createContext } from 'react';
import PropTypes from 'prop-types';

// Create Context
const ModalContext = createContext();

/**
 * Modal provider component
 * Wrap your app with this provider to enable modals
 */
export const ModalProvider = ({ children }) => {
  const [modals, setModals] = useState({});
  
  // Open a modal
  const openModal = useCallback((id, props = {}) => {
    setModals(prev => ({
      ...prev,
      [id]: {
        isOpen: true,
        props
      }
    }));
  }, []);
  
  // Close a modal
  const closeModal = useCallback((id) => {
    setModals(prev => {
      if (!prev[id]) return prev;
      
      return {
        ...prev,
        [id]: {
          ...prev[id],
          isOpen: false
        }
      };
    });
  }, []);
  
  // Close all modals
  const closeAllModals = useCallback(() => {
    setModals(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        updated[key] = { ...updated[key], isOpen: false };
      });
      return updated;
    });
  }, []);
  
  // Get modal state
  const getModal = useCallback((id) => {
    return modals[id] || { isOpen: false, props: {} };
  }, [modals]);
  
  // Set modal props
  const updateModalProps = useCallback((id, props) => {
    setModals(prev => {
      if (!prev[id]) {
        return {
          ...prev,
          [id]: { isOpen: false, props }
        };
      }
      
      return {
        ...prev,
        [id]: {
          ...prev[id],
          props: { ...prev[id].props, ...props }
        }
      };
    });
  }, []);
  
  const value = {
    modals,
    openModal,
    closeModal,
    closeAllModals,
    getModal,
    updateModalProps
  };
  
  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
};

/**
 * Custom hook for managing modals
 * Must be used within a ModalProvider
 * 
 * @param {string} modalId - Optional modal ID to get specific modal state
 * @returns {Object} Modal state and methods
 */
export const useModal = (modalId) => {
  const context = useContext(ModalContext);
  
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  
  // If modalId is provided, return helpers for that specific modal
  if (modalId) {
    const { getModal, openModal, closeModal, updateModalProps } = context;
    const modal = getModal(modalId);
    
    return {
      isOpen: modal.isOpen,
      props: modal.props,
      open: (props) => openModal(modalId, props),
      close: () => closeModal(modalId),
      updateProps: (props) => updateModalProps(modalId, props)
    };
  }
  
  // Otherwise return the full context
  return context;
};
ModalProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default useModal;