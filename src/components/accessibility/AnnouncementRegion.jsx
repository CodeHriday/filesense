import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

/**
 * AnnouncementRegion - Creates an accessible announcement region for screen readers
 * 
 * This component uses aria-live to announce important information to screen reader users.
 * Messages are automatically cleared after a specified timeout.
 * 
 * @param {Object} props
 * @param {string} props.message - The message to announce
 * @param {string} props.politeness - ARIA live region politeness setting ('polite' or 'assertive')
 * @param {number} props.clearDelay - Delay in ms before clearing the message (default: 5000)
 */
const AnnouncementRegion = ({ 
  message, 
  politeness = 'polite', 
  clearDelay = 5000 
}) => {
  const [announcement, setAnnouncement] = useState('');
  
  useEffect(() => {
    if (!message) return;
    
    // Set the announcement
    setAnnouncement(message);
    
    // Clear the announcement after delay
    const timeoutId = setTimeout(() => {
      setAnnouncement('');
    }, clearDelay);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [message, clearDelay]);
  
  // Use a portal to inject the announcement region at the end of the body
  return createPortal(
    <div 
      aria-live={politeness}
      aria-atomic="true"
      className="screen-reader-announcement"
      style={{
        position: 'absolute',
        overflow: 'hidden',
        width: '1px',
        height: '1px',
        whiteSpace: 'nowrap',
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
      }}
    >
      {announcement}
    </div>,
    document.body
  );
};
AnnouncementRegion.propTypes = {
  message: PropTypes.string,
  politeness: PropTypes.oneOf(['polite', 'assertive']),
  clearDelay: PropTypes.number
};

AnnouncementRegion.defaultProps = {
  message: '',
  politeness: 'polite',
  clearDelay: 5000
};

/**
 * Announcement context for providing a way to make announcements throughout the app
 */
const AnnouncementContext = React.createContext({
  announce: () => {},
});

/**
 * Hook to use the announcement context
 */
export const useAnnouncement = () => React.useContext(AnnouncementContext);

/**
 * AnnouncementProvider - Provides the announcement context to the app
 */
export const AnnouncementProvider = ({ children }) => {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  
  const announce = (message, { politeness = 'polite', clearDelay } = {}) => {
    if (politeness === 'assertive') {
      setAssertiveMessage(message);
    } else {
      setPoliteMessage(message);
    }
  };
  
  return (
    <AnnouncementContext.Provider value={{ announce }}>
      {children}
      <AnnouncementRegion message={politeMessage} politeness="polite" clearDelay={5000} />
      <AnnouncementRegion message={assertiveMessage} politeness="assertive" clearDelay={3000} />
    </AnnouncementContext.Provider>
  );
};
AnnouncementProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default AnnouncementRegion;