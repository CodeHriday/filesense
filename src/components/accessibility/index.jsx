/**
 * Accessibility Components and Utilities
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import SkipLink from './SkipLink';

// Announcement context for screen readers
const AnnouncementContext = createContext({
  announce: () => {},
  assertive: () => {},
  polite: () => {},
});

/**
 * Announcement Provider Component
 * 
 * Provides a way to make screen reader announcements.
 */
export const AnnouncementProvider = ({ children }) => {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  
  const announce = (message, assertive = false) => {
    if (assertive) {
      setAssertiveMessage(message);
    } else {
      setPoliteMessage(message);
    }
  };
  
  const polite = (message) => {
    setPoliteMessage(message);
  };
  
  const assertive = (message) => {
    setAssertiveMessage(message);
  };
  
  // Clear messages after they've been announced
  useEffect(() => {
    if (politeMessage) {
      const timerId = setTimeout(() => {
        setPoliteMessage('');
      }, 1000);
      return () => clearTimeout(timerId);
    }
  }, [politeMessage]);
  
  useEffect(() => {
    if (assertiveMessage) {
      const timerId = setTimeout(() => {
        setAssertiveMessage('');
      }, 1000);
      return () => clearTimeout(timerId);
    }
  }, [assertiveMessage]);
  
  return (
    <AnnouncementContext.Provider value={{ announce, polite, assertive }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AnnouncementContext.Provider>
  );
};

/**
 * Hook to access the announcement context
 */
export const useAnnouncement = () => {
  const context = useContext(AnnouncementContext);
  
  if (context === undefined) {
    throw new Error('useAnnouncement must be used within an AnnouncementProvider');
  }
  
  return context;
};

// Export all accessibility components and hooks
export { SkipLink };

export default {
  AnnouncementProvider,
  useAnnouncement,
  SkipLink,
};